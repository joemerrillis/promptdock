import { composePromptFromContext } from '../services/contextComposer.js';
import { callOpenAIChat } from '../services/openaiService.js';
import { getSessionById } from '../services/sessionService.js';

export default async function chatRoutes(fastify) {
  fastify.post('/chat', async (request, reply) => {
    const { message, session_id, context_files = [] } = request.body;

    try {
      // Retrieve session info to get the model
      const { data: session, error: sessionError } = await getSessionById(fastify.supabase, session_id);
      if (sessionError || !session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      const model = session.model || 'gpt-4';

      // Optional: build context-aware prompt
      const contextBlocks = await composePromptFromContext(context_files);
      const prompt = `${contextBlocks}\n\nUser Request: ${message}`;

      const { result, error } = await callOpenAIChat(model, prompt);
      if (error) return reply.status(500).send({ error });

      reply.send({ response: result });
    } catch (err) {
      request.log.error(err);
      reply.status(500).send({ error: 'Failed to process chat message' });
    }
  });
}
