export default async function messagesRoute(fastify) {
  fastify.get('/messages/:sessionId', async (req, reply) => {
    const { sessionId } = req.params;

    const { data, error } = await fastify.supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch messages' });
    }

    reply.send(data);
  });
}
