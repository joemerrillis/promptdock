import fs from 'fs/promises';
import path from 'path';
import { embedChunksForFiles } from '../services/embedder.js';

export default async function primeRoute(fastify, _opts) {
  fastify.post('/prime', async (request, reply) => {
    const { files = [] } = request.body;

    try {
      const results = [];
      for (const filePath of files) {
        const absPath = path.resolve('./', filePath);
        const content = await fs.readFile(absPath, 'utf-8');
        const embedResult = await embedChunksForFiles(filePath, content);
        results.push(embedResult);
      }

      reply.send({ status: 'ok', embedded: results.length });
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to embed files' });
    }
  });
}
