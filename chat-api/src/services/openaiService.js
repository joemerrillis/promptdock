import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chat Completion (used by /chat and /debug)
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

// Embedding Generation (used by /prime)
export async function createEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}
