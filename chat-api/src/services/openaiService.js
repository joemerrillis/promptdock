import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chat Completion (used by /chat and /debug)
export async function callOpenAIChat(model, prompt) {
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful code assistant.' },
        { role: 'user', content: prompt },
      ],
    });

    return {
      result: response.choices[0].message.content.trim(),
      error: null
    };
  } catch (err) {
    return {
      result: null,
      error: err.message || 'OpenAI API error'
    };
  }
}

// Embedding Generation (used by /prime)
export async function createEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}
