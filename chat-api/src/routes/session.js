// FILE: src/routes/session.js
import { createSession, getAllSessions } from '../services/sessionService.js';

export default async function sessionRoutes(fastify) {
  fastify.get('/session', async (req, reply) => {
    const { data, error } = await getAllSessions(fastify.supabase);
    if (error) return reply.status(500).send({ error });
    return { chat_sessions: data };
  });

  fastify.post('/session', async (req, reply) => {
    const { title, model } = req.body;
    const { data, error } = await createSession(fastify.supabase, title, model);
    if (error) return reply.status(500).send({ error });
    return { session: data };
  });
}
