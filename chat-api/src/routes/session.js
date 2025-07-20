export default async function sessionRoute(fastify) {
  fastify.post('/session', async (req, reply) => {
    const { title, mode = 'build', context_files = [] } = req.body;

    const { data, error } = await fastify.supabase
      .from('chat_sessions')
      .insert([{ title, mode, context_files }])
      .select()
      .single();

    if (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Failed to create session' });
    }

    reply.send(data);
  });
}
