import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function callOpenAIChat(prompt) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful code assistant.' },
      { role: 'user', content: prompt },
    ],
  });

  return response.choices[0].message.content.trim();
}
