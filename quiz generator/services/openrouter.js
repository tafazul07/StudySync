const axios = require('axios');

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct';
const BASE_URL = 'https://openrouter.ai/api/v1';

const SYSTEM_PROMPTS = {
    mcq: `You are a precise multiple-choice quiz generator. STRICT RULES:
1. Generate EXACTLY the requested number of questions
2. Each question MUST have 4 options: A, B, C, D
3. ONLY ONE option is correct - no "all of the above"
4. The correct answer MUST be directly found in the provided context
5. Distractors must be plausible but clearly incorrect based on context
6. Return ONLY valid JSON - no markdown code blocks, no extra text
7. If you cannot verify a fact from the context, SKIP that question
8. Make questions challenging but fair - test understanding, not just memorization
9. Identify the specific subtopic/concept tested (e.g. "Photosynthesis Light Reactions") and return it in the "subtopic" field.
10. Respect the difficulty level requested (Easy: basic recall/facts, Medium: comprehension/application, Hard: critical thinking/analysis/complex scenarios).

JSON Format:
{
  "quiz": {
    "title": "Descriptive title about the topic",
    "questions": [
      {
        "id": 1,
        "question": "Clear, specific question text",
        "options": {
          "A": "First option",
          "B": "Second option",
          "C": "Third option",
          "D": "Fourth option"
        },
        "correct_answer": "A|B|C|D",
        "subtopic": "Specific subtopic or concept code",
        "explanation": "Why this is correct, citing specific context"
      }
    ]
  }
}`,

    fill_blank: `You are a precise fill-in-the-blank quiz generator. STRICT RULES:
1. Generate EXACTLY the requested number of questions
2. Each question must have exactly ONE blank marked with _____ (5 underscores)
3. The answer MUST be a specific word or short phrase found in the context
4. The blank should replace a KEY TERM, CONCEPT, or IMPORTANT FACT
5. Return ONLY valid JSON - no markdown code blocks, no extra text
6. If you cannot identify a clear key term from the context, SKIP that question
7. Questions should test understanding of important concepts, not trivial details
8. Identify the specific subtopic/concept tested (e.g. "Photosynthesis Light Reactions") and return it in the "subtopic" field.
9. Respect the difficulty level requested (Easy: basic recall/facts, Medium: comprehension/application, Hard: critical thinking/analysis/complex scenarios).

JSON Format:
{
  "quiz": {
    "title": "Descriptive title about the topic",
    "questions": [
      {
        "id": 1,
        "question": "Sentence with _____ blank for student to fill",
        "answer": "exact correct answer",
        "subtopic": "Specific subtopic or concept code",
        "hint": "Helpful hint without giving away the answer"
      }
    ]
  }
}`
};

async function generateQuiz(chunks, topic, numQuestions, quizType = 'mcq', difficulty = 'medium') {
    if (!API_KEY || API_KEY === 'sk-or-v1-your-key-here') {
        throw new Error('OpenRouter API key not configured. Add OPENROUTER_API_KEY to .env file. Get free key from https://openrouter.ai/settings/keys');
    }

    const context = chunks.join('\n\n---\n\n');
    const systemPrompt = SYSTEM_PROMPTS[quizType] || SYSTEM_PROMPTS.mcq;

    const userPrompt = `Generate ${numQuestions} ${difficulty.toUpperCase()} difficulty ${quizType === 'mcq' ? 'multiple-choice' : 'fill-in-the-blank'} questions about: ${topic}

Use ONLY the following context to create questions. Do not use outside knowledge:

${context}

Return valid JSON only. Ensure all answers are verifiable in the provided context.`;

    try {
        console.log(`🌐 Calling OpenRouter (${MODEL})...`);

        const response = await axios.post(
            `${BASE_URL}/chat/completions`,
            {
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'Quiz Generator FYP'
                },
                timeout: 60000
            }
        );

        const content = response.data.choices[0].message.content;
        const quizData = JSON.parse(content);

        console.log('✅ Quiz received from OpenRouter');
        return validateQuiz(quizData, numQuestions, quizType);

    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error('Invalid OpenRouter API key. Check your .env file.');
        }
        if (error.response?.status === 429) {
            throw new Error('OpenRouter rate limit hit. Free tier: 20 req/min, 200 req/day. Wait a minute and try again.');
        }
        if (error.response?.status === 402) {
            throw new Error('OpenRouter credits exhausted. Free tier has limits.');
        }
        if (error.code === 'ECONNABORTED') {
            throw new Error('OpenRouter request timed out. Check your internet connection.');
        }

        console.error('OpenRouter error:', error.response?.data || error.message);
        throw new Error(`OpenRouter error: ${error.response?.data?.error?.message || error.message}`);
    }
}

// Generate embeddings using OpenRouter (some models support embeddings, but we'll use a simple approach)
// For embeddings, we'll use a lightweight method since OpenRouter doesn't have a dedicated embedding endpoint
async function generateEmbedding(text) {
    // Simple bag-of-words embedding for similarity
    // This is a fallback since OpenRouter is chat-completion only
    // In production, you could use OpenAI's embedding API or keep a small local model

    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const uniqueWords = [...new Set(words)];

    // Create a simple frequency vector (768 dims)
    const vector = new Array(768).fill(0);

    for (let i = 0; i < Math.min(words.length, 768); i++) {
        // Simple hash-based embedding
        let hash = 0;
        for (let j = 0; j < words[i].length; j++) {
            hash = ((hash << 5) - hash) + words[i].charCodeAt(j);
            hash = hash & hash;
        }
        vector[i] = (hash % 1000) / 1000;
    }

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
        return vector.map(v => v / norm);
    }
    return vector;
}

function validateQuiz(quizData, expectedCount, quizType) {
    if (!quizData || !quizData.quiz || !quizData.quiz.questions) {
        throw new Error('Invalid quiz structure from API');
    }

    const questions = quizData.quiz.questions;
    const validQuestions = [];

    for (const q of questions) {
        if (!q || !q.question || q.question.trim().length < 10) continue;

        if (quizType === 'mcq') {
            if (!q.options || typeof q.options !== 'object') continue;
            if (!q.options.A || !q.options.B || !q.options.C || !q.options.D) continue;
            if (!q.correct_answer || !['A', 'B', 'C', 'D'].includes(q.correct_answer)) continue;
        } else {
            if (!q.answer || q.answer.trim().length === 0) continue;
        }

        validQuestions.push({
            id: validQuestions.length + 1,
            question: q.question.trim(),
            subtopic: (q.subtopic || 'General Concepts').trim(),
            ...(quizType === 'mcq' ? {
                options: {
                    A: q.options.A.trim(),
                    B: q.options.B.trim(),
                    C: q.options.C.trim(),
                    D: q.options.D.trim()
                },
                correct_answer: q.correct_answer,
                explanation: (q.explanation || 'Correct answer is found in the provided context.').trim()
            } : {
                answer: q.answer.trim(),
                hint: (q.hint || 'Think about the key concepts in the context.').trim()
            })
        });
    }

    if (validQuestions.length === 0) {
        throw new Error('No valid questions generated. The API returned unusable content. Try again.');
    }

    return {
        quiz: {
            title: quizData.quiz.title || `${quizType === 'mcq' ? 'Multiple Choice' : 'Fill in the Blanks'} Quiz`,
            total_questions: validQuestions.length,
            questions: validQuestions.slice(0, expectedCount)
        }
    };
}

async function extractTopics(text) {
    if (!API_KEY || API_KEY === 'sk-or-v1-your-key-here') {
        throw new Error('OpenRouter API key not configured.');
    }

    // sample up to first ~3000 words
    const words = text.split(/\s+/).slice(0, 3000).join(' ');

    const systemPrompt = `You are a curriculum and topic analysis assistant. Your job is to extract the main topics and subtopics from the provided text sample.
STRICT RULES:
1. Extract between 3 to 7 main topics from the text.
2. For each topic, provide a short 1-sentence description.
3. Return ONLY a valid JSON array of objects, no markdown wrappers, no backticks, no other text.

JSON Format:
[
  {
    "topic": "Name of the main topic",
    "description": "Short description of what it covers"
  }
]`;

    try {
        console.log(`🌐 Extracting topics via OpenRouter (${MODEL})...`);
        const response = await axios.post(
            `${BASE_URL}/chat/completions`,
            {
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Analyze this text and extract topics:\n\n${words}` }
                ],
                temperature: 0.3,
                max_tokens: 1500,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'Quiz Generator FYP'
                },
                timeout: 45000
            }
        );

        const content = response.data.choices[0].message.content;
        let topicsData = JSON.parse(content);
        if (topicsData && !Array.isArray(topicsData) && topicsData.topics) {
            topicsData = topicsData.topics;
        }
        if (!Array.isArray(topicsData)) {
            topicsData = [topicsData];
        }
        return topicsData.filter(t => t && t.topic).map(t => ({
            topic: t.topic.trim(),
            description: (t.description || '').trim()
        }));
    } catch (error) {
        console.error('Topic extraction error:', error.response?.data || error.message);
        // Fallback
        return [
            { topic: "General Content", description: "Main concepts covered in the document" }
        ];
    }
}

module.exports = {
    generateQuiz,
    generateEmbedding,
    validateQuiz,
    extractTopics
};