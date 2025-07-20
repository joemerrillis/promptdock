import { parseLogAndRetrieveFiles } from '../services/logParser.js';
import { callOpenAIChat } from '../services/openaiService.js';

export default async function debugRoute(fastify) {
  fastify.post('/debug', async (request, reply) => {
    const { logs } = request.body;

    try {
      const context = await parseLogAndRetrieveFiles(logs);
      const prompt = `You are a code assistant. Based on the logs and the related files, suggest a specific change.

Logs:
${logs}

Relevant Code:
${context}`;

      const result = await callOpenAIChat(prompt);
      reply.send({ reply: result });
    } catch (err) {
      request.log.error(err);
      reply.status(500).send({ error: 'Failed to debug logs' });
    }
  });
}
