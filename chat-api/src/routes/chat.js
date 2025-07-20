import { composePromptFromContext } from '../services/contextComposer.js';
import { callOpenAIChat } from '../services/openaiService.js';

export default async function chatRoute(fastify) {
  fastify.post('/chat', async (request, reply) => {
    const { message, context_files = [] } = request.body;

    try {
      const contextBlocks = await composePromptFromContext(context_files);
      const prompt = `${contextBlocks}\n\nUser Request: ${message}`;

      const aiResponse = await callOpenAIChat(prompt);
      reply.send({ reply: aiResponse });
    } catch (err) {
      request.log.error(err);
      reply.status(500).send({ error: 'Failed to process chat message' });
    }
  });
}
