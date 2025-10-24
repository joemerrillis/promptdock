# Command File 1: PromptDock Core Infrastructure

## AUDIENCE NOTE
This command file is written for Claude Code. Every instruction should be taken literally. If something is ambiguous, it needs clarification - do not guess or assume. If you encounter a decision point not covered here, stop and ask.

## Objective
Build the foundational message bus, API server, and monitoring dashboard. This is ONLY the plumbing - no AI agents yet. We need to validate that messages can flow between components reliably before adding any intelligence.

Think of this as building the roads before the cars. Messages must flow from browser → WebSocket → Redis → Supabase and back. That's it.

## Success Criteria (Binary Pass/Fail)
✅ Server starts without errors and listens on port 3000
✅ WebSocket connection established and stays open for 5+ minutes
✅ Message published to Redis appears in browser within 100ms
✅ Every message gets logged to Supabase with correct timestamp
✅ `/api/health` returns 200 with all services showing connected: true
✅ 10 concurrent browser tabs can all send/receive messages
✅ Ctrl+C results in clean shutdown with all connections closed
✅ Restarting server reconnects to Redis/Supabase without errors

## CRITICAL: Scope Definition

### You MUST Build:
- Fastify HTTP server with WebSocket support
- Redis pub/sub client with reconnection logic
- Supabase client with query helpers
- Health check endpoint
- Static file serving for dashboard
- Message logging to both console and database
- Graceful shutdown handlers

### You MUST NOT Build:
- Any AI/LLM integration (that's Command Files 3-5)
- User authentication or sessions
- Message queuing or persistence beyond logs
- Message replay functionality
- Advanced dashboard features (graphs, filters, search)
- Docker containers or deployment configs
- Rate limiting or security headers
- Database migrations system (just use SQL directly)
- WebSocket authentication (trust all connections)
- Message encryption

### What "Scope Creep" Means:
If you find yourself thinking:
- "It would be nice to add user accounts..." → STOP
- "We should add message history..." → STOP  
- "Let me add some charts to the dashboard..." → STOP
- "This needs better security..." → STOP (Phase 2)
- "I'll add a message queue..." → STOP (not needed yet)

The ONLY goal is: prove messages flow reliably. Everything else is future work.

## Tech Stack (Fixed - Do Not Substitute)
- **Runtime**: Node.js 20.x (use latest LTS)
- **Framework**: Fastify 4.x (NOT Express, NOT Koa)
- **Database**: Supabase (hosted Postgres)
- **Message Bus**: Redis via ioredis (NOT node-redis)
- **WebSocket**: @fastify/websocket (comes with Fastify)
- **Logging**: pino (built into Fastify, do not add Winston)

WHY these choices:
- Fastify: Faster than Express, better TypeScript support
- ioredis: More reliable than node-redis, better reconnection
- Supabase: Free tier, no setup needed, built-in REST API
- pino: Fast structured logging, JSON output

## Project Structure (Exact)

Create this EXACT folder structure:
```
promptdock/
├── package.json
├── .env.example
├── .env (you will create this, gitignored)
├── .gitignore
├── README.md
├── src/
│   ├── server.js           # MAIN ENTRY POINT - start here
│   ├── config.js           # Load and validate environment vars
│   ├── services/
│   │   ├── redis.js        # Redis singleton + pub/sub
│   │   ├── supabase.js     # Supabase client + helpers
│   │   └── logger.js       # Logging utilities
│   ├── routes/
│   │   ├── health.js       # GET /api/health
│   │   └── websocket.js    # WebSocket handler for /stream
│   └── public/
│       ├── index.html      # Dashboard UI
│       ├── style.css       # Minimal styling
│       └── app.js          # Client-side WebSocket code
└── test/
    └── manual-tests.md     # Document for manual testing steps
```

Do NOT add any other folders or files beyond this structure.

## Environment Variables

Create `.env.example` with EXACTLY these variables (copy this):
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Supabase Configuration  
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_ANON_KEY=your-anon-key-here

# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# CORS (for local development)
CORS_ORIGIN=http://localhost:3000
```

Create `.gitignore` with:
```
node_modules/
.env
*.log
.DS_Store
```

## Database Schema (Copy-Paste Into Supabase SQL Editor)

Open Supabase dashboard → SQL Editor → New Query → Paste this EXACTLY:
```sql
-- PromptDock Core Schema
-- Run this in Supabase SQL Editor

-- Messages table: all inter-agent communication
-- This stores EVERYTHING that flows through the system
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  from_agent text not null,
  to_agent text not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz default now()
);

-- Add check constraint to ensure type is valid
alter table messages add constraint messages_type_check 
  check (type in ('task', 'question', 'response', 'status', 'error'));

-- Logs table: all agent activity and system events
create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  level text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Add check constraint for log levels
alter table logs add constraint logs_level_check 
  check (level in ('debug', 'info', 'warn', 'error', 'fatal'));

-- Indexes for common queries
create index if not exists messages_from_agent_idx on messages(from_agent);
create index if not exists messages_to_agent_idx on messages(to_agent);
create index if not exists messages_type_idx on messages(type);
create index if not exists messages_created_at_idx on messages(created_at desc);

create index if not exists logs_agent_idx on logs(agent);
create index if not exists logs_level_idx on logs(level);
create index if not exists logs_created_at_idx on logs(created_at desc);

-- Enable Row Level Security (RLS) but allow all operations with service role
alter table messages enable row level security;
alter table logs enable row level security;

-- Policy: Service role can do anything
create policy "Service role can do anything on messages"
  on messages for all
  using (auth.role() = 'service_role');

create policy "Service role can do anything on logs"
  on logs for all
  using (auth.role() = 'service_role');

-- Verify tables were created
select 'Tables created successfully' as status;
select tablename from pg_tables where schemaname = 'public';
```

After running, you should see:
- "Tables created successfully"
- List including "messages" and "logs"

If you see any errors, STOP and report them. Do not continue.

## Implementation Details

### 1. package.json

Create with EXACTLY these dependencies (versions matter):
```json
{
  "name": "promptdock",
  "version": "0.1.0",
  "description": "Multi-agent development orchestration platform",
  "main": "src/server.js",
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development nodemon src/server.js",
    "start": "NODE_ENV=production node src/server.js",
    "test": "echo 'See test/manual-tests.md' && exit 0"
  },
  "dependencies": {
    "fastify": "^4.26.0",
    "@fastify/websocket": "^10.0.1",
    "@fastify/static": "^7.0.1",
    "@fastify/cors": "^9.0.1",
    "ioredis": "^5.3.2",
    "@supabase/supabase-js": "^2.39.8",
    "dotenv": "^16.4.1",
    "pino": "^8.19.0",
    "pino-pretty": "^10.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

DO NOT change versions or add other dependencies.

### 2. src/config.js (Configuration Loader)

This file loads and validates environment variables. Copy this EXACTLY:
```javascript
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

/**
 * Configuration object
 * All values come from environment variables
 * Missing required values will throw errors
 */
const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Redis
  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined,
    // Reconnection strategy: try every 50ms, max 2000ms
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: null, // Keep trying forever
  },
  
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  
  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
};

/**
 * Validate required configuration
 * Throws error if anything is missing
 */
function validateConfig() {
  const required = {
    'REDIS_URL': config.redis.url,
    'SUPABASE_URL': config.supabase.url,
    'SUPABASE_SERVICE_ROLE_KEY': config.supabase.serviceRoleKey,
  };
  
  const missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
      missing.map(k => `  - ${k}`).join('\n') +
      `\n\nCopy .env.example to .env and fill in the values.`
    );
  }
}

// Run validation on import
validateConfig();

export default config;
```

**What this does:**
- Loads `.env` file
- Exports configuration object
- Validates required variables on startup
- Throws clear error if anything missing

**DO NOT:**
- Add configuration for things not in the spec
- Add defaults for required values (they should error if missing)
- Add validation beyond checking existence

### 3. src/services/logger.js (Logging Helper)
```javascript
import pino from 'pino';
import config from '../config.js';

/**
 * Create pino logger instance
 * In development: pretty-printed to console
 * In production: JSON to stdout
 */
const logger = pino({
  level: config.logLevel,
  transport: config.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

/**
 * Create a child logger with context
 * Example: const log = createLogger('redis')
 * Then: log.info('connected') → "[redis] connected"
 */
export function createLogger(context) {
  return logger.child({ context });
}

export default logger;
```

**What this provides:**
- Structured JSON logging in production
- Pretty console logging in development
- Child loggers with context (e.g., [redis], [websocket])

### 4. src/services/redis.js (Redis Client)

This is CRITICAL. Redis connection must be rock-solid. Copy exactly:
```javascript
import Redis from 'ioredis';
import config from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');

/**
 * Redis client singleton
 * Used for pub/sub messaging between components
 */
let client = null;
let subscriber = null;

/**
 * Get or create Redis client
 * @returns {Redis} Redis client instance
 */
export function getRedisClient() {
  if (!client) {
    client = new Redis(config.redis.url, {
      password: config.redis.password,
      retryStrategy: config.redis.retryStrategy,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      lazyConnect: false, // Connect immediately
    });
    
    client.on('connect', () => {
      log.info('Redis client connected');
    });
    
    client.on('ready', () => {
      log.info('Redis client ready');
    });
    
    client.on('error', (err) => {
      log.error({ err }, 'Redis client error');
    });
    
    client.on('close', () => {
      log.warn('Redis client connection closed');
    });
    
    client.on('reconnecting', (delay) => {
      log.info({ delay }, 'Redis client reconnecting');
    });
  }
  
  return client;
}

/**
 * Get or create Redis subscriber
 * Separate connection for pub/sub
 * @returns {Redis} Redis subscriber instance
 */
export function getRedisSubscriber() {
  if (!subscriber) {
    subscriber = new Redis(config.redis.url, {
      password: config.redis.password,
      retryStrategy: config.redis.retryStrategy,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      lazyConnect: false,
    });
    
    subscriber.on('connect', () => {
      log.info('Redis subscriber connected');
    });
    
    subscriber.on('error', (err) => {
      log.error({ err }, 'Redis subscriber error');
    });
  }
  
  return subscriber;
}

/**
 * Publish a message to a Redis channel
 * @param {string} channel - Channel name
 * @param {object} message - Message object (will be JSON stringified)
 * @returns {Promise<number>} Number of subscribers that received the message
 */
export async function publish(channel, message) {
  const client = getRedisClient();
  
  try {
    const messageStr = JSON.stringify(message);
    const result = await client.publish(channel, messageStr);
    
    log.debug({ channel, message }, 'Published message');
    return result;
  } catch (error) {
    log.error({ err: error, channel }, 'Failed to publish message');
    throw error;
  }
}

/**
 * Subscribe to a Redis channel
 * @param {string} channel - Channel name
 * @param {function} callback - Called with (channel, message) when message received
 * @returns {Promise<void>}
 */
export async function subscribe(channel, callback) {
  const sub = getRedisSubscriber();
  
  await sub.subscribe(channel);
  log.info({ channel }, 'Subscribed to channel');
  
  sub.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        const parsed = JSON.parse(message);
        callback(ch, parsed);
      } catch (error) {
        log.error({ err: error, channel, message }, 'Failed to parse message');
      }
    }
  });
}

/**
 * Unsubscribe from a Redis channel
 * @param {string} channel - Channel name
 * @returns {Promise<void>}
 */
export async function unsubscribe(channel) {
  const sub = getRedisSubscriber();
  await sub.unsubscribe(channel);
  log.info({ channel }, 'Unsubscribed from channel');
}

/**
 * Check if Redis is connected
 * @returns {boolean}
 */
export function isConnected() {
  return client && client.status === 'ready';
}

/**
 * Get Redis connection latency
 * @returns {Promise<number>} Latency in milliseconds
 */
export async function getLatency() {
  if (!isConnected()) {
    return -1;
  }
  
  const start = Date.now();
  await client.ping();
  return Date.now() - start;
}

/**
 * Close all Redis connections
 * Call this on shutdown
 * @returns {Promise<void>}
 */
export async function closeAll() {
  const promises = [];
  
  if (client) {
    log.info('Closing Redis client');
    promises.push(client.quit());
    client = null;
  }
  
  if (subscriber) {
    log.info('Closing Redis subscriber');
    promises.push(subscriber.quit());
    subscriber = null;
  }
  
  await Promise.all(promises);
  log.info('All Redis connections closed');
}
```

**Critical behaviors:**
- Automatic reconnection with exponential backoff
- Separate connections for pub and sub (Redis requirement)
- All errors logged, never crash
- Clean shutdown support

**DO NOT:**
- Use node-redis (use ioredis as specified)
- Add connection pooling (single connection is fine)
- Add message queuing (Redis pub/sub is ephemeral by design)

### 5. src/services/supabase.js (Supabase Client)
```javascript
import { createClient } from '@supabase/supabase-js';
import config from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('supabase');

/**
 * Supabase client singleton
 * Uses service role key for full access
 */
let client = null;

/**
 * Get or create Supabase client
 * @returns {SupabaseClient}
 */
export function getSupabaseClient() {
  if (!client) {
    client = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    log.info('Supabase client initialized');
  }
  
  return client;
}

/**
 * Log a message to the database
 * @param {string} fromAgent - Sender agent name
 * @param {string} toAgent - Receiver agent name
 * @param {string} type - Message type
 * @param {object} payload - Message payload
 * @returns {Promise<object|null>} Inserted message or null if failed
 */
export async function logMessage(fromAgent, toAgent, type, payload) {
  const client = getSupabaseClient();
  
  try {
    const { data, error } = await client
      .from('messages')
      .insert({
        from_agent: fromAgent,
        to_agent: toAgent,
        type: type,
        payload: payload,
      })
      .select()
      .single();
    
    if (error) {
      log.error({ err: error }, 'Failed to log message to database');
      return null;
    }
    
    log.debug({ id: data.id, fromAgent, toAgent, type }, 'Message logged');
    return data;
  } catch (error) {
    log.error({ err: error }, 'Exception logging message');
    return null;
  }
}

/**
 * Log an activity/event
 * @param {string} agent - Agent name
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} metadata - Additional data
 * @returns {Promise<object|null>}
 */
export async function logActivity(agent, level, message, metadata = null) {
  const client = getSupabaseClient();
  
  try {
    const { data, error } = await client
      .from('logs')
      .insert({
        agent: agent,
        level: level,
        message: message,
        metadata: metadata,
      })
      .select()
      .single();
    
    if (error) {
      log.error({ err: error }, 'Failed to log activity to database');
      return null;
    }
    
    return data;
  } catch (error) {
    log.error({ err: error }, 'Exception logging activity');
    return null;
  }
}

/**
 * Check if Supabase connection is healthy
 * @returns {Promise<boolean>}
 */
export async function isHealthy() {
  const client = getSupabaseClient();
  
  try {
    const { error } = await client
      .from('messages')
      .select('id')
      .limit(1);
    
    return !error;
  } catch (error) {
    log.error({ err: error }, 'Supabase health check failed');
    return false;
  }
}

/**
 * Get Supabase query latency
 * @returns {Promise<number>} Latency in milliseconds or -1 if failed
 */
export async function getLatency() {
  const client = getSupabaseClient();
  
  try {
    const start = Date.now();
    await client.from('messages').select('id').limit(1);
    return Date.now() - start;
  } catch (error) {
    return -1;
  }
}
```

**Key points:**
- Service role bypasses RLS (Row Level Security)
- All database operations handle errors gracefully
- Never crash on database failure
- Operations return null on failure (caller decides what to do)

6. src/routes/health.js (Health Check Endpoint)
javascriptimport * as redis from '../services/redis.js';
import * as supabase from '../services/supabase.js';

/**
 * Health check route
 * Returns status of all services
 * 
 * This is used by:
 * - Monitoring systems to check if server is up
 * - Manual testing to verify connections
 * - Dashboard to show service status
 * 
 * @param {FastifyInstance} fastify
 */
export default async function healthRoutes(fastify) {
  fastify.get('/api/health', async (request, reply) => {
    const startTime = Date.now();
    
    // Check Redis
    const redisConnected = redis.isConnected();
    const redisLatency = redisConnected ? await redis.getLatency() : -1;
    
    // Check Supabase
    const supabaseHealthy = await supabase.isHealthy();
    const supabaseLatency = await supabase.getLatency();
    
    // Count active WebSocket connections
    // This relies on fastify.websocketServer being available
    let wsConnections = 0;
    if (fastify.websocketServer && fastify.websocketServer.clients) {
      wsConnections = fastify.websocketServer.clients.size;
    }
    
    // Overall status
    // Healthy only if ALL services are connected
    const healthy = redisConnected && supabaseHealthy;
    const statusCode = healthy ? 200 : 503;
    
    const response = {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      services: {
        redis: {
          connected: redisConnected,
          latency_ms: redisLatency,
        },
        supabase: {
          connected: supabaseHealthy,
          latency_ms: supabaseLatency,
        },
        websocket: {
          connections: wsConnections,
        },
      },
      response_time_ms: Date.now() - startTime,
    };
    
    reply.code(statusCode).send(response);
  });
}
What this returns:
json{
  "status": "healthy",
  "timestamp": "2025-10-23T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "redis": {
      "connected": true,
      "latency_ms": 2
    },
    "supabase": {
      "connected": true,
      "latency_ms": 15
    },
    "websocket": {
      "connections": 3
    }
  },
  "response_time_ms": 18
}
Testing this:
bashcurl http://localhost:3000/api/health
# Should return 200 if all healthy
# Should return 503 if any service down
7. src/routes/websocket.js (WebSocket Handler)
This is the MOST IMPORTANT file. Messages flow through here. Every detail matters.
javascriptimport { publish, subscribe } from '../services/redis.js';
import { logMessage } from '../services/supabase.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('websocket');

/**
 * WebSocket route handler
 * 
 * Flow:
 * 1. Browser connects to ws://localhost:3000/stream
 * 2. Server subscribes to Redis 'chatter-output' channel
 * 3. When Redis message received, forward to browser
 * 4. When browser sends message, publish to Redis 'human-input' channel
 * 5. Log all messages to Supabase
 * 
 * Message Format (Browser → Server):
 * {
 *   "user_id": "user-123",
 *   "content": "Build me a login form",
 *   "timestamp": "2025-10-23T10:30:00Z"
 * }
 * 
 * Message Format (Server → Browser):
 * {
 *   "channel": "chatter-output",
 *   "data": {
 *     "user_id": "user-123",
 *     "content": "I'll help with that...",
 *     "timestamp": "2025-10-23T10:30:15Z"
 *   }
 * }
 * 
 * @param {FastifyInstance} fastify
 */
export default async function websocketRoutes(fastify) {
  // Track all connected clients
  const clients = new Set();
  
  // Subscribe to Redis channels that should be forwarded to browser
  const channelsToForward = [
    'chatter-output',  // Responses from Chatter agent
    'system',          // System messages
  ];
  
  // Set up Redis subscriptions
  for (const channel of channelsToForward) {
    await subscribe(channel, (ch, message) => {
      // Forward to all connected WebSocket clients
      const payload = JSON.stringify({
        channel: ch,
        data: message,
        timestamp: new Date().toISOString(),
      });
      
      for (const client of clients) {
        if (client.readyState === 1) { // 1 = OPEN
          client.send(payload);
        }
      }
      
      log.debug({ channel: ch, clients: clients.size }, 'Forwarded message to clients');
    });
  }
  
  log.info({ channels: channelsToForward }, 'Subscribed to Redis channels for forwarding');
  
  // WebSocket route
  fastify.get('/stream', { websocket: true }, (connection, request) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    log.info({ clientId, ip: request.ip }, 'WebSocket client connected');
    
    // Add to clients set
    clients.add(connection.socket);
    
    // Send welcome message
    connection.socket.send(JSON.stringify({
      channel: 'system',
      data: {
        type: 'welcome',
        message: 'Connected to PromptDock',
        client_id: clientId,
      },
      timestamp: new Date().toISOString(),
    }));
    
    // Set up heartbeat
    // Send ping every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (connection.socket.readyState === 1) {
        connection.socket.send(JSON.stringify({
          channel: 'system',
          data: { type: 'heartbeat' },
          timestamp: new Date().toISOString(),
        }));
      }
    }, 30000);
    
    // Handle incoming messages from browser
    connection.socket.on('message', async (messageBuffer) => {
      try {
        const messageStr = messageBuffer.toString();
        const message = JSON.parse(messageStr);
        
        log.info({ clientId, message }, 'Received message from client');
        
        // Validate message structure
        if (!message.content) {
          connection.socket.send(JSON.stringify({
            channel: 'system',
            data: {
              type: 'error',
              message: 'Invalid message: missing "content" field',
            },
            timestamp: new Date().toISOString(),
          }));
          return;
        }
        
        // Add metadata
        const fullMessage = {
          user_id: message.user_id || clientId,
          content: message.content,
          timestamp: new Date().toISOString(),
          source: 'websocket',
        };
        
        // Publish to Redis 'human-input' channel
        // Agents listening on this channel will process the message
        await publish('human-input', fullMessage);
        
        // Log to Supabase
        await logMessage(
          'user',
          'system',
          'human-input',
          fullMessage
        );
        
        // Acknowledge receipt
        connection.socket.send(JSON.stringify({
          channel: 'system',
          data: {
            type: 'ack',
            message: 'Message received and published',
          },
          timestamp: new Date().toISOString(),
        }));
        
      } catch (error) {
        log.error({ err: error, clientId }, 'Error processing client message');
        
        connection.socket.send(JSON.stringify({
          channel: 'system',
          data: {
            type: 'error',
            message: 'Failed to process message',
            error: error.message,
          },
          timestamp: new Date().toISOString(),
        }));
      }
    });
    
    // Handle client disconnect
    connection.socket.on('close', (code, reason) => {
      log.info({ clientId, code, reason: reason.toString() }, 'WebSocket client disconnected');
      
      clients.delete(connection.socket);
      clearInterval(heartbeatInterval);
    });
    
    // Handle errors
    connection.socket.on('error', (error) => {
      log.error({ err: error, clientId }, 'WebSocket error');
      
      clients.delete(connection.socket);
      clearInterval(heartbeatInterval);
    });
  });
  
  log.info('WebSocket route registered on /stream');
}
Critical behaviors to understand:

Two-way messaging:

Browser → Server → Redis human-input
Redis chatter-output → Server → Browser


Heartbeat:

Every 30 seconds, send ping to keep connection alive
Browsers/proxies may kill idle connections


Error handling:

Invalid JSON → send error to client, don't crash
Missing fields → send error to client, don't crash
Redis publish fails → log error, don't crash


Clean disconnect:

Remove from clients set
Clear heartbeat interval
Don't leave zombie connections



DO NOT:

Add authentication (Phase 2)
Add rate limiting (Phase 2)
Add message history replay (not needed)
Buffer messages when client disconnected (Redis is ephemeral)

8. src/server.js (Main Entry Point)
This brings everything together. This is what starts when you run npm run dev.
javascriptimport Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import config from './config.js';
import logger from './services/logger.js';
import { getRedisClient, closeAll as closeRedis } from './services/redis.js';
import { getSupabaseClient } from './services/supabase.js';

import healthRoutes from './routes/health.js';
import websocketRoutes from './routes/websocket.js';

// Get directory paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create and configure Fastify server
 */
async function createServer() {
  // Create Fastify instance with logging
  const fastify = Fastify({
    logger: logger,
    // Trust proxy headers (needed for correct IP logging)
    trustProxy: true,
  });
  
  // Register CORS
  // Allows browser to connect from localhost
  await fastify.register(fastifyCors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  });
  
  // Register WebSocket support
  // MUST be registered before routes that use it
  await fastify.register(fastifyWebsocket);
  
  // Register static file serving for dashboard
  // Serves files from src/public/
  await fastify.register(fastifyStatic, {
    root: join(__dirname, 'public'),
    prefix: '/', // Files available at http://localhost:3000/*
  });
  
  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(websocketRoutes);
  
  // Root redirect to dashboard
  fastify.get('/', async (request, reply) => {
    reply.redirect(301, '/index.html');
  });
  
  return fastify;
}

/**
 * Start the server
 */
async function start() {
  logger.info('Starting PromptDock server...');
  
  try {
    // Initialize services
    logger.info('Connecting to Redis...');
    const redis = getRedisClient();
    await redis.ping(); // Verify connection
    logger.info('✓ Redis connected');
    
    logger.info('Connecting to Supabase...');
    const supabase = getSupabaseClient();
    // Verify connection with a simple query
    const { error } = await supabase.from('messages').select('id').limit(1);
    if (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
    logger.info('✓ Supabase connected');
    
    // Create and start server
    const fastify = await createServer();
    
    await fastify.listen({
      port: config.port,
      host: '0.0.0.0', // Listen on all interfaces
    });
    
    logger.info(`✓ Server listening on port ${config.port}`);
    logger.info(`✓ Dashboard: http://localhost:${config.port}`);
    logger.info(`✓ Health check: http://localhost:${config.port}/api/health`);
    logger.info(`✓ WebSocket: ws://localhost:${config.port}/stream`);
    logger.info('PromptDock is ready!');
    
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 * Called on SIGINT (Ctrl+C) or SIGTERM
 */
async function shutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Close Redis connections
    logger.info('Closing Redis connections...');
    await closeRedis();
    
    // Note: Fastify server will be closed by the process exit
    // Supabase client doesn't need explicit closing
    
    logger.info('✓ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
  process.exit(1);
});

// Start the server
start();
Startup sequence:

Load configuration (validates env vars)
Connect to Redis (verify with ping)
Connect to Supabase (verify with query)
Create Fastify server
Register plugins and routes
Start listening on port 3000
Log success messages

Shutdown sequence:

Receive SIGINT (Ctrl+C)
Log shutdown message
Close Redis connections cleanly
Exit process

DO NOT:

Add cluster mode (single process is fine)
Add pm2 or process management (that's Phase 2)
Add metrics or monitoring (that's Phase 2)

9. src/public/index.html (Dashboard UI)
This is what you see in the browser. Keep it SIMPLE.
html<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PromptDock Dashboard</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header>
      <h1>PromptDock</h1>
      <div class="status">
        <span class="status-indicator" id="status-indicator">●</span>
        <span id="status-text">Connecting...</span>
      </div>
    </header>
    
    <!-- Message Feed -->
    <div class="message-feed" id="message-feed">
      <!-- Messages will be inserted here by JavaScript -->
    </div>
    
    <!-- Input Area -->
    <div class="input-area">
      <input 
        type="text" 
        id="message-input" 
        placeholder="Type a message..."
        autocomplete="off"
      >
      <button id="send-button">Send</button>
    </div>
    
    <!-- Info Footer -->
    <footer>
      <div class="info">
        <span>WebSocket: <code id="ws-url">-</code></span>
        <span>Messages: <span id="message-count">0</span></span>
        <span>Uptime: <span id="uptime">-</span></span>
      </div>
    </footer>
  </div>
  
  <script src="/app.js"></script>
</body>
</html>
What this provides:

Status indicator (green/red dot)
Message feed (scrollable history)
Input box and send button
Footer with connection info

10. src/public/style.css (Minimal Styling)
css* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  height: 100vh;
  overflow: hidden;
}

.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #f1f5f9;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.status-indicator {
  font-size: 1.5rem;
  line-height: 1;
}

.status-indicator.connected {
  color: #10b981;
}

.status-indicator.disconnected {
  color: #ef4444;
}

.status-indicator.connecting {
  color: #eab308;
}

/* Message Feed */
.message-feed {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.message {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: #1e293b;
  border-left: 3px solid #475569;
}

.message.user {
  background: #1e3a5f;
  border-left-color: #3b82f6;
  margin-left: 2rem;
}

.message.system {
  background: #1e293b;
  border-left-color: #64748b;
}

.message.agent {
  background: #1e2d3a;
  border-left-color: #10b981;
  margin-right: 2rem;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: #94a3b8;
}

.message-channel {
  font-weight: 600;
  color: #cbd5e1;
}

.message-content {
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* Input Area */
.input-area {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  background: #1e293b;
  border-top: 1px solid #334155;
}

#message-input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  color: #e2e8f0;
  font-size: 0.875rem;
}

#message-input:focus {
  outline: none;
  border-color: #3b82f6;
}

#send-button {
  padding: 0.75rem 1.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

#send-button:hover {
  background: #2563eb;
}

#send-button:active {
  background: #1d4ed8;
}

#send-button:disabled {
  background: #334155;
  cursor: not-allowed;
}

/* Footer */
footer {
  padding: 0.75rem 1.5rem;
  background: #1e293b;
  border-top: 1px solid #334155;
  font-size: 0.75rem;
  color: #94a3b8;
}

.info {
  display: flex;
  gap: 1.5rem;
}

code {
  background: #0f172a;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: 'Courier New', monospace;
  font-size: 0.7rem;
}

/* Scrollbar */
.message-feed::-webkit-scrollbar {
  width: 8px;
}

.message-feed::-webkit-scrollbar-track {
  background: #0f172a;
}

.message-feed::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}

.message-feed::-webkit-scrollbar-thumb:hover {
  background: #475569;
}
Design choices:

Dark theme (easier on eyes for long sessions)
Color-coded messages (user=blue, agent=green, system=gray)
Fixed footer with stats
Minimal, functional, not fancy

DO NOT:

Add fancy animations
Add charts or graphs
Add themes or customization
Add emoji or icons beyond status dot

11. src/public/app.js (Client-Side WebSocket Code)
javascript/**
 * PromptDock Dashboard Client
 * Handles WebSocket connection and UI updates
 */

// State
let ws = null;
let connected = false;
let messageCount = 0;
let startTime = Date.now();

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const messageFeed = document.getElementById('message-feed');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const wsUrl = document.getElementById('ws-url');
const messageCountEl = document.getElementById('message-count');
const uptimeEl = document.getElementById('uptime');

/**
 * Connect to WebSocket server
 */
function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const url = `${protocol}//${host}/stream`;
  
  wsUrl.textContent = url;
  updateStatus('connecting', 'Connecting...');
  
  try {
    ws = new WebSocket(url);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      connected = true;
      updateStatus('connected', 'Connected');
      sendButton.disabled = false;
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      updateStatus('disconnected', 'Error');
    };
    
    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      connected = false;
      updateStatus('disconnected', 'Disconnected');
      sendButton.disabled = true;
      
      // Attempt to reconnect after 3 seconds
      setTimeout(connect, 3000);
    };
    
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    updateStatus('disconnected', 'Failed to connect');
    
    // Retry after 3 seconds
    setTimeout(connect, 3000);
  }
}

/**
 * Send a message to the server
 */
function sendMessage() {
  const content = messageInput.value.trim();
  
  if (!content) {
    return;
  }
  
  if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
    alert('Not connected to server');
    return;
  }
  
  const message = {
    user_id: 'dashboard-user',
    content: content,
    timestamp: new Date().toISOString(),
  };
  
  try {
    ws.send(JSON.stringify(message));
    
    // Add to feed immediately (optimistic UI)
    addMessageToFeed({
      channel: 'user',
      data: message,
      timestamp: message.timestamp,
    });
    
    // Clear input
    messageInput.value = '';
    
  } catch (error) {
    console.error('Failed to send message:', error);
    alert('Failed to send message');
  }
}

/**
 * Handle incoming WebSocket message
 */
function handleMessage(message) {
  console.log('Received message:', message);
  
  // Ignore heartbeat messages
  if (message.data && message.data.type === 'heartbeat') {
    return;
  }
  
  // Add to feed
  addMessageToFeed(message);
  
  // Update counter
  messageCount++;
  messageCountEl.textContent = messageCount;
}

/**
 * Add a message to the feed
 */
function addMessageToFeed(message) {
  const messageEl = document.createElement('div');
  
  // Determine message type for styling
  let messageType = 'system';
  if (message.channel === 'user' || message.data?.source === 'websocket') {
    messageType = 'user';
  } else if (message.channel === 'chatter-output') {
    messageType = 'agent';
  }
  
  messageEl.className = `message ${messageType}`;
  
  // Format timestamp
  const time = new Date(message.timestamp).toLocaleTimeString();
  
  // Build content
  let content = '';
  if (typeof message.data === 'string') {
    content = message.data;
  } else if (message.data && message.data.content) {
    content = message.data.content;
  } else if (message.data && message.data.message) {
    content = message.data.message;
  } else {
    content = JSON.stringify(message.data, null, 2);
  }
  
  messageEl.innerHTML = `
    <div class="message-header">
      <span class="message-channel">${message.channel || 'unknown'}</span>
      <span class="message-time">${time}</span>
    </div>
    <div class="message-content">${escapeHtml(content)}</div>
  `;
  
  messageFeed.appendChild(messageEl);
  
  // Auto-scroll to bottom
  messageFeed.scrollTop = messageFeed.scrollHeight;
}

/**
 * Update connection status indicator
 */
function updateStatus(status, text) {
  statusIndicator.className = `status-indicator ${status}`;
  statusText.textContent = text;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update uptime display
 */
function updateUptime() {
  const elapsed = Date.now() - startTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    uptimeEl.textContent = `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    uptimeEl.textContent = `${minutes}m ${seconds % 60}s`;
  } else {
    uptimeEl.textContent = `${seconds}s`;
  }
}

// Event listeners
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// Update uptime every second
setInterval(updateUptime, 1000);

// Connect on page load
connect();
Key behaviors:

Auto-connect on page load
Auto-reconnect on disconnect (3 second delay)
Optimistic UI (show sent message immediately)
Auto-scroll to newest messages
HTML escaping (prevent XSS)
Ignore heartbeat messages (don't clutter feed)

12. test/manual-tests.md (Testing Documentation)
markdown# PromptDock Manual Testing Guide

This document contains step-by-step tests to verify the system works.

## Prerequisites

Before testing, ensure:
- [ ] Redis is running (local or cloud)
- [ ] Supabase project is created
- [ ] `.env` file exists with all required variables
- [ ] `npm install` completed successfully

## Test 1: Installation

**Purpose:** Verify all dependencies install correctly.

**Steps:**
```bash
npm install
```

**Expected Result:**
- No errors
- `node_modules/` folder created
- All packages listed in package.json installed

**Pass/Fail:** ______

---

## Test 2: Configuration Validation

**Purpose:** Verify config loader catches missing environment variables.

**Steps:**
```bash
# Temporarily rename .env to trigger error
mv .env .env.backup
node src/server.js
```

**Expected Result:**
- Server does NOT start
- Error message lists missing variables
- Error message mentions ".env file"

**Restore:**
```bash
mv .env.backup .env
```

**Pass/Fail:** ______

---

## Test 3: Service Connections

**Purpose:** Verify Redis and Supabase connections work.

**Steps:**
```bash
npm run dev
```

**Expected Output:**
```
[INFO] Starting PromptDock server...
[INFO] Connecting to Redis...
[INFO] ✓ Redis connected
[INFO] Connecting to Supabase...
[INFO] ✓ Supabase connected
[INFO] ✓ Server listening on port 3000
[INFO] PromptDock is ready!
```

**Pass/Fail:** ______

---

## Test 4: Health Check Endpoint

**Purpose:** Verify health endpoint returns correct status.

**Steps:**
```bash
curl http://localhost:3000/api/health
```

**Expected Result:**
```json
{
  "status": "healthy",
  "services": {
    "redis": {
      "connected": true,
      "latency_ms": 2
    },
    "supabase": {
      "connected": true,
      "latency_ms": 15
    },
    "websocket": {
      "connections": 0
    }
  }
}
```

**Pass/Fail:** ______

---

## Test 5: Dashboard Loads

**Purpose:** Verify static files are served correctly.

**Steps:**
1. Open browser
2. Navigate to http://localhost:3000

**Expected Result:**
- Page loads without errors
- Title: "PromptDock Dashboard"
- Status indicator shows "Connecting..." then "Connected"
- Status indicator turns green

**Pass/Fail:** ______

---

## Test 6: WebSocket Connection

**Purpose:** Verify WebSocket connection establishes.

**Steps:**
1. Open browser to http://localhost:3000
2. Open browser console (F12 → Console tab)

**Expected Console Output:**
```
WebSocket connected
```

**Expected UI:**
- Status indicator: green
- Status text: "Connected"
- Send button: enabled
- Message feed: shows welcome message

**Pass/Fail:** ______

---

## Test 7: Send Message

**Purpose:** Verify messages can be sent from browser to server.

**Steps:**
1. Dashboard open and connected
2. Type "test message" in input box
3. Click Send button

**Expected Result:**
- Message appears in feed immediately
- Message shows in user style (blue)
- Input box clears
- No errors in console

**Verify in Redis:**
```bash
redis-cli
> SUBSCRIBE human-input
# Should see the message published
```

**Verify in Supabase:**
- Open Supabase dashboard
- Go to Table Editor → messages
- Should see new row with from_agent='user', content='test message'

**Pass/Fail:** ______

---

## Test 8: Receive Message

**Purpose:** Verify messages can be received from Redis.

**Steps:**
1. Dashboard open and connected
2. In another terminal, publish to Redis:
```bash
redis-cli
> PUBLISH chatter-output '{"user_id":"test","content":"Hello from Redis","timestamp":"2025-10-23T10:30:00Z"}'
```

**Expected Result:**
- Message appears in dashboard feed
- Message shows in agent style (green)
- Channel: "chatter-output"
- Content: "Hello from Redis"

**Pass/Fail:** ______

---

## Test 9: Multiple Clients

**Purpose:** Verify multiple browser tabs can connect simultaneously.

**Steps:**
1. Open http://localhost:3000 in 3 different browser tabs
2. Check health endpoint:
```bash
curl http://localhost:3000/api/health
```

**Expected Result:**
- All 3 tabs show "Connected" status
- Health check shows "websocket": { "connections": 3 }

**Send message from Tab 1:**
- Message should appear in Tab 1, Tab 2, and Tab 3

**Pass/Fail:** ______

---

## Test 10: Heartbeat

**Purpose:** Verify heartbeat keeps connections alive.

**Steps:**
1. Open dashboard
2. Wait 35 seconds without activity
3. Check browser console

**Expected Result:**
- No disconnection
- Console shows heartbeat messages being received
- Connection stays green

**Pass/Fail:** ______

---

## Test 11: Reconnection

**Purpose:** Verify client reconnects after network interruption.

**Steps:**
1. Dashboard open and connected
2. Stop server (Ctrl+C)
3. Observe dashboard

**Expected Immediate Result:**
- Status changes to red
- Status text: "Disconnected"
- Send button: disabled

**Restart server:**
```bash
npm run dev
```

**Expected After 3 Seconds:**
- Dashboard automatically reconnects
- Status changes to green
- Status text: "Connected"
- Send button: enabled

**Pass/Fail:** ______

---

## Test 12: Graceful Shutdown

**Purpose:** Verify server shuts down cleanly.

**Steps:**
1. Server running
2. Dashboard connected
3. Press Ctrl+C in server terminal

**Expected Output:**
```
[INFO] Received SIGINT, starting graceful shutdown...
[INFO] Closing Redis connections...
[INFO] ✓ Graceful shutdown complete
```

**Expected Dashboard:**
- Disconnects immediately
- No errors in console
- Shows "Disconnected" status

**Pass/Fail:** ______

---

## Test 13: Invalid Message Handling

**Purpose:** Verify server handles malformed messages gracefully.

**Steps:**
1. Dashboard open and connected
2. Open browser console
3. Send invalid message:
```javascript
ws.send('not json');
```

**Expected Result:**
- Server logs error but doesn't crash
- Dashboard receives error message from server
- Connection stays alive

**Pass/Fail:** ______

---

## Test 14: Message Logging

**Purpose:** Verify all messages are logged to Supabase.

**Steps:**
1. Send 3 test messages from dashboard
2. Publish 2 messages via Redis to chatter-output
3. Check Supabase messages table

**Expected Result:**
- At least 5 new rows in messages table
- Rows have correct from_agent, to_agent, type fields
- Timestamps are recent
- Payload contains message content

**Pass/Fail:** ______

---

## Test Summary

Total Tests: 14
Passed: ___
Failed: ___

**Notes:**
(Document any issues or observations here)

13. README.md (Project Documentation)
markdown# PromptDock

Multi-agent development orchestration platform.

## What Is This?

PromptDock is a message-based system for coordinating multiple AI agents. Think of it as a communication hub where:
- Your browser sends requests
- AI agents receive and process them
- Results flow back to you

This is **Phase 1** - just the infrastructure. AI agents come in Command Files 2-5.

## Prerequisites

- Node.js 20+ ([Download](https://nodejs.org/))
- Redis (local or cloud)
  - Local: `brew install redis` then `redis-server`
  - Cloud: [Redis Cloud](https://redis.com/try-free/) (free tier)
- Supabase account ([Create free account](https://supabase.com/))

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Note your project URL and keys

### 3. Run Database Schema

1. In Supabase dashboard → SQL Editor
2. Create new query
3. Copy entire contents of schema from Command File (section: Database Schema)
4. Run query
5. Verify tables created: messages, logs

### 4. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `REDIS_URL` - Your Redis connection string
- `SUPABASE_URL` - From Supabase dashboard
- `SUPABASE_SERVICE_ROLE_KEY` - From Supabase Settings → API

### 5. Start Server
```bash
npm run dev
```

You should see:
```
✓ Redis connected
✓ Supabase connected
✓ Server listening on port 3000
PromptDock is ready!
```

### 6. Open Dashboard

Navigate to: http://localhost:3000

You should see:
- Green connection indicator
- "Connected" status
- Empty message feed

## Usage

### Sending Messages

1. Type in the input box
2. Press Enter or click Send
3. Message appears in feed
4. Message is published to Redis `human-input` channel

### Testing Message Flow

In another terminal, subscribe to see messages:
```bash
redis-cli
> SUBSCRIBE human-input
# Type messages in dashboard
# Should see them here
```

Send test response:
```bash
redis-cli
> PUBLISH chatter-output '{"content":"Test response","timestamp":"2025-10-23T10:30:00Z"}'
# Should appear in dashboard
```

## Architecture
```
Browser (Dashboard)
    ↕ WebSocket
Server (Fastify)
    ↕ Redis Pub/Sub
(Agents will connect here in Phase 2)
    ↕ Supabase (Logging)
```

### Message Flow

1. **Browser → Server:** User types message
2. **Server → Redis:** Publishes to `human-input` channel
3. **Redis → Agents:** (Phase 2) Agents receive and process
4. **Agents → Redis:** (Phase 2) Publish to `chatter-output`
5. **Redis → Server:** Server receives response
6. **Server → Browser:** Forward to dashboard
7. **Server → Supabase:** Log everything

## File Structure
```
promptdock/
├── src/
│   ├── server.js          # Main entry point
│   ├── config.js          # Configuration
│   ├── services/
│   │   ├── redis.js       # Redis pub/sub
│   │   ├── supabase.js    # Database client
│   │   └── logger.js      # Logging
│   ├── routes/
│   │   ├── health.js      # /api/health endpoint
│   │   └── websocket.js   # /stream WebSocket
│   └── public/
│       ├── index.html     # Dashboard HTML
│       ├── style.css      # Dashboard styles
│       └── app.js         # Dashboard JS
└── test/
    └── manual-tests.md    # Testing guide
```

## API Endpoints

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "redis": { "connected": true, "latency_ms": 2 },
    "supabase": { "connected": true, "latency_ms": 15 },
    "websocket": { "connections": 3 }
  },
  "uptime": 3600
}
```

### WebSocket /stream

Bidirectional message channel.

**Client → Server:**
```json
{
  "user_id": "user-123",
  "content": "Your message here",
  "timestamp": "2025-10-23T10:30:00Z"
}
```

**Server → Client:**
```json
{
  "channel": "chatter-output",
  "data": {
    "content": "Response message",
    "timestamp": "2025-10-23T10:30:15Z"
  }
}
```

## Troubleshooting

### "Missing required environment variables"

- Verify `.env` file exists
- Check all variables are set (no empty values)
- SUPABASE_SERVICE_ROLE_KEY should be ~300 characters

### "Redis connection failed"

- Verify Redis is running: `redis-cli ping` (should return "PONG")
- Check REDIS_URL format: `redis://localhost:6379`
- If using Redis Cloud, ensure IP is whitelisted

### "Supabase connection failed"

- Verify SUPABASE_URL is correct (format: `https://xxx.supabase.co`)
- Verify SUPABASE_SERVICE_ROLE_KEY is service role, not anon key
- Check schema was created (tables: messages, logs)

### Dashboard shows "Disconnected"

- Check server is running
- Check browser console for errors
- Verify WebSocket URL is correct (check browser Network tab)

### Messages not appearing

- Check Redis is receiving: `redis-cli SUBSCRIBE human-input`
- Check Supabase messages table for new rows
- Check server logs for errors

## Development

### Run with auto-reload
```bash
npm run dev
```

Changes to src/ files will restart server automatically.

### View logs

Logs go to stdout in JSON format (production) or pretty-printed (development).

Filter by level:
```bash
npm run dev | grep ERROR
```

### Check Redis
```bash
redis-cli
> PING
PONG
> SUBSCRIBE human-input
# Leave this running to see messages
```

### Check Supabase

Dashboard → Table Editor → messages

Should see new rows as messages are sent.

## Production

NOT READY FOR PRODUCTION.

This is Phase 1 infrastructure only. Phase 2 (agents) is required before production use.

When ready, deploy to Render/Railway/Fly.io with:
- Redis add-on
- Environment variables configured
- Health check endpoint: /api/health

## Next Steps

After verifying this works:
1. Build Command File 2 (Local Workers)
2. Build Command File 3 (Chatter Agent)
3. Build Command File 4 (Researcher Agent)
4. Test full agent coordination

## Support

Issues? Check:
1. Manual tests (test/manual-tests.md) - all pass?
2. Health check (http://localhost:3000/api/health) - all services connected?
3. Server logs - any errors?

## License

MIT

Final Notes for Command File 1
Build Order
Execute files in this order:

package.json - Install dependencies first
.env.example + .gitignore - Configuration
Database schema - Run in Supabase
src/config.js - Configuration loader
src/services/logger.js - Logging
src/services/redis.js - Redis client
src/services/supabase.js - Supabase client
src/routes/health.js - Health endpoint
src/routes/websocket.js - WebSocket handler
src/server.js - Main server
src/public/index.html - Dashboard HTML
src/public/style.css - Dashboard styles
src/public/app.js - Dashboard JavaScript
test/manual-tests.md - Testing documentation
README.md - Project documentation

Verification Steps
After building everything:
bash# 1. Install
npm install

# 2. Create .env from .env.example and fill in values

# 3. Start server
npm run dev

# 4. Verify in terminal:
✓ Redis connected
✓ Supabase connected
✓ Server listening on port 3000

# 5. Open browser: http://localhost:3000
# Should see dashboard with green status

# 6. Test message flow:
# - Type in dashboard, click send
# - Message should appear
# - Check Supabase messages table - should have row

# 7. Run all tests in test/manual-tests.md
Success Criteria (Final Check)

 All 14 manual tests pass
 Health endpoint returns all services connected
 Dashboard shows green status
 Messages flow browser → Redis → Supabase
 Server handles Ctrl+C gracefully
 No uncaught errors in logs

Common Mistakes to Avoid

Don't use node-redis - Use ioredis as specified
Don't add authentication yet - That's Phase 2
Don't add message persistence - Redis pub/sub is ephemeral by design
Don't add extra dependencies - Use only what's in package.json
Don't skip the manual tests - They catch 90% of issues

Performance Expectations
On a modest development machine:

Server startup: <2 seconds
WebSocket connection: <100ms
Message latency (browser → dashboard): <100ms
Health check response: <50ms
10 concurrent connections: No problem

If slower than this, check:

Redis connection (should be local or fast network)
Supabase region (should be near you)
