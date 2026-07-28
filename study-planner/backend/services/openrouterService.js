import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function generateStudyPlan(extractedText, preferences = {}) {
  const prompt = `
You are an expert study planner. Based on the following content, create a detailed study plan.

CONTENT:
${extractedText.substring(0, 15000)}

${preferences.hoursPerDay ? `Study hours per day: ${preferences.hoursPerDay}` : ''}
${preferences.startDate ? `Start date: ${preferences.startDate}` : ''}
${preferences.examDate ? `Exam/deadline date: ${preferences.examDate}` : ''}

Return ONLY a valid JSON object with this exact structure:
{
  "title": "Plan title",
  "summary": "Brief summary",
  "totalDays": number,
  "dailySchedule": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "topics": ["topic1", "topic2"],
      "hours": number,
      "tasks": ["task1", "task2"]
    }
  ],
  "milestones": [
    {
      "title": "Milestone name",
      "targetDate": "YYYY-MM-DD",
      "description": "What to achieve"
    }
  ],
  "resources": ["resource1", "resource2"]
}

Do not include any markdown formatting, only raw JSON.
`;

  try {
    const response = await axios.post(
      OPENROUTER_URL,
      {
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'You are a helpful study planner assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:5000',
          'X-Title': 'Study Planner App'
        },
        timeout: 60000
      }
    );

    const content = response.data.choices[0].message.content;
    const cleanJson = content.replace(/```json?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('OpenRouter error:', error.response?.data || error.message);
    throw new Error('Failed to generate study plan');
  }
}
