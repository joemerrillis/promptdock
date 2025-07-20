import { composePromptFromContext } from '../services/contextComposer.js';
import { callOpenAIChat } from '../services/openaiService.js';
import { getSessionById } from '../services/sessionService.js';

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
export default async function chatRoutes(fastify) {
  fastify.post('/chat', async (req, reply) => {
    const { message, session_id } = req.body;

    const { data: session, error: sessionError } = await getSessionById(fastify.supabase, session_id);
    if (sessionError || !session) return reply.status(404).send({ error: 'Session not found' });

    const model = session.model || 'gpt-4';
    const { result, error } = await callOpenAIChat(model, message);

    if (error) return reply.status(500).send({ error });
    return { response: result };
  });
}
