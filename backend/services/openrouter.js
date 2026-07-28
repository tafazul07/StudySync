import axios from 'axios';

const getApiKey = () => process.env.OPENROUTER_API_KEY;
const getModel = () => process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct';
const BASE_URL = 'https://openrouter.ai/api/v1';

const SYSTEM_PROMPTS = {
  mcq: `You are a precise multiple-choice quiz generator. CRITICAL RULES:
1. Return ONLY valid JSON - no markdown code blocks, no extra text, no explanations
2. Do NOT include any conversational text like "I can help you" or "Here are the questions"
3. If context is insufficient, return this exact JSON: {"error": "Insufficient context provided"}
4. Generate EXACTLY the requested number of questions
5. Each question MUST have 4 options: A, B, C, D
6. ONLY ONE option is correct - no "all of the above"
7. The correct answer MUST be directly found in the provided context
8. Distractors must be plausible but clearly incorrect based on context
9. If you cannot verify a fact from the context, SKIP that question
10. Make questions challenging but fair - test understanding, not just memorization
11. Identify the specific subtopic/concept tested (e.g. "Photosynthesis Light Reactions") and return it in the "subtopic" field.
12. Respect the difficulty level requested (Easy: basic recall/facts, Medium: comprehension/application, Hard: critical thinking/analysis/complex scenarios).

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

  fill_blank: `You are a precise fill-in-the-blank quiz generator. CRITICAL RULES:
1. Return ONLY valid JSON - no markdown code blocks, no extra text, no explanations
2. Do NOT include any conversational text like "I can help you" or "Here are the questions"
3. If context is insufficient, return this exact JSON: {"error": "Insufficient context provided"}
4. Generate EXACTLY the requested number of questions
5. Each question must have exactly ONE blank marked with _____ (5 underscores)
6. The answer MUST be a specific word or short phrase found in the context
7. The blank should replace a KEY TERM, CONCEPT, or IMPORTANT FACT
8. If you cannot identify a clear key term from the context, SKIP that question
9. Questions should test understanding of important concepts, not trivial details
10. Identify the specific subtopic/concept tested (e.g. "Photosynthesis Light Reactions") and return it in the "subtopic" field.
11. Respect the difficulty level requested (Easy: basic recall/facts, Medium: comprehension/application, Hard: critical thinking/analysis/complex scenarios).

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
  const apiKey = getApiKey();
  const model = getModel();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured. Add OPENROUTER_API_KEY to .env file. Get free key from https://openrouter.ai/settings/keys');
  }

  const context = chunks.join('\n\n---\n\n');
  const systemPrompt = SYSTEM_PROMPTS[quizType] || SYSTEM_PROMPTS.mcq;

  const userPrompt = `Generate ${numQuestions} ${difficulty.toUpperCase()} difficulty ${quizType === 'mcq' ? 'multiple-choice' : 'fill-in-the-blank'} questions about: ${topic}

Use ONLY the following context to create questions. Do not use outside knowledge:

${context}

Return valid JSON only. Ensure all answers are verifiable in the provided context.`;

  try {
    console.log(`🌐 Calling OpenRouter (${model})...`);

    const response = await axios.post(
      `${BASE_URL}/chat/completions`,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'StudySync'
        },
        timeout: 60000
      }
    );

    let content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenRouter response');
    }
    
    // Check if AI returned an error response
    if (content.includes('Insufficient context provided') || content.includes('error')) {
      throw new Error('The AI could not generate questions from the provided content. Please provide more detailed study material.');
    }
    
    // Strip markdown code fences if model wrapped the JSON
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    let quizData;
    try {
      quizData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse JSON from OpenRouter response:', content);
      throw new Error(`OpenRouter returned invalid JSON. The AI may have returned conversational text instead of JSON. Try with different content.`);
    }
    
    // Check if AI returned an error in the JSON
    if (quizData.error) {
      throw new Error(quizData.error);
    }

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

async function generateEmbedding(text) {
  // Simple bag-of-words embedding for similarity
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
  const apiKey = getApiKey();
  const model = getModel();
  if (!apiKey) {
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
    console.log(`🌐 Extracting topics via OpenRouter (${model})...`);
    const response = await axios.post(
      `${BASE_URL}/chat/completions`,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this text and extract topics:\n\n${words}` }
        ],
        temperature: 0.3,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'StudySync'
        },
        timeout: 45000
      }
    );

    let content = response.data.choices[0].message.content;
    // Strip markdown code fences
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
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

async function generateStudyPlan(text, preferences = {}) {
  const apiKey = getApiKey();
  const model = getModel();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured.');
  }

  const systemPrompt = `You are a study plan generator. Create a comprehensive study plan based on the provided content.
CRITICAL RULES:
1. Return ONLY valid JSON - no markdown code blocks, no extra text, no explanations
2. Do NOT include any conversational text like "I can help you" or "Please provide"
3. If the content is insufficient, return this exact JSON: {"error": "Insufficient content provided"}
4. The plan should be realistic and achievable
5. Include specific topics, time allocations, and deadlines

JSON Format:
{
  "title": "Study Plan Title",
  "description": "Brief description of the study plan",
  "subject": "Subject area",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "milestones": [
    {
      "title": "Milestone name",
      "description": "Description",
      "targetDate": "YYYY-MM-DD"
    }
  ],
  "dailySchedule": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "topics": ["Topic 1", "Topic 2"],
      "hours": 2
    }
  ]
}`;

  const userPrompt = `Generate a study plan for the following content:\n\n${text.substring(0, 8000)}\n\nPreferences: ${JSON.stringify(preferences)}`;

  try {
    console.log('🌐 Generating study plan via OpenRouter...');
    const response = await axios.post(
      `${BASE_URL}/chat/completions`,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 3000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'StudySync'
        },
        timeout: 60000
      }
    );

    let content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenRouter response');
    }
    
    // Check if AI returned an error response
    if (content.includes('Insufficient content provided') || content.includes('error')) {
      throw new Error('The AI could not generate a study plan from the provided content. Please provide more detailed study material.');
    }
    
    // Strip markdown code fences
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    let planData;
    try {
      planData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse JSON from OpenRouter response:', content);
      throw new Error(`OpenRouter returned invalid JSON. The AI may have returned conversational text instead of JSON. Try with different content.`);
    }
    
    // Check if AI returned an error in the JSON
    if (planData.error) {
      throw new Error(planData.error);
    }
    
    console.log('✅ Study plan generated');
    return planData;
  } catch (error) {
    console.error('Study plan generation error:', error.response?.data || error.message);
    throw new Error(`OpenRouter error: ${error.response?.data?.error?.message || error.message}`);
  }
}

export {
  generateQuiz,
  generateStudyPlan,
  generateEmbedding,
  validateQuiz,
  extractTopics
};
