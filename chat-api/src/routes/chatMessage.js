export default async function chatMessageRoute(fastify) {
  fastify.post('/chat-message', async (req, reply) => {
    const { session_id, role, message, response, context = {} } = req.body;

    const { data, error } = await fastify.supabase
      .from('chat_messages')
      .insert([{ session_id, role, message, response, context }])
      .select()
      .single();

    if (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Failed to store message' });
    }

    reply.send(data);
  });
}
