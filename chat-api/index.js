import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createClient } from '@supabase/supabase-js';

// Routes
import primeRoute from './src/routes/prime.js';
import chatRoute from './src/routes/chat.js';
import debugRoute from './src/routes/debug.js';
import sessionRoute from './src/routes/session.js';
import chatMessageRoute from './src/routes/chatMessage.js';
import messagesRoute from './src/routes/messages.js';

const fastify = Fastify({ logger: true });

// Environment
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, OPENAI_API_KEY, PORT } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !OPENAI_API_KEY) {
  throw new Error('Missing environment variables for Supabase or OpenAI');
}

// Supabase Client
fastify.decorate('supabase', createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE));

// Middleware
await fastify.register(cors, { origin: true });

// Routes
await fastify.register(primeRoute);
await fastify.register(chatRoute);
await fastify.register(debugRoute);
await fastify.register(sessionRoute);
await fastify.register(chatMessageRoute);
await fastify.register(messagesRoute);

// Health check
fastify.get('/health', async () => ({ status: 'ok' }));

// Start server
fastify.listen({ port: PORT || 3000, host: '0.0.0.0' });
