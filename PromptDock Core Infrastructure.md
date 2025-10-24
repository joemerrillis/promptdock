# Command File 1: PromptDock Core Infrastructure

## Objective
Build the foundational message bus, API server, and monitoring dashboard. This is ONLY the plumbing - no AI agents yet. We need to validate that messages can flow between components reliably.

## Success Criteria
✅ Fastify server runs on port 3000
✅ WebSocket connection stays open for 5+ minutes
✅ Messages published to Redis appear in dashboard within 100ms
✅ Supabase logs all messages with timestamps
✅ Health check endpoint returns status of all services
✅ Can handle 10 concurrent WebSocket connections
✅ Graceful shutdown (closes all connections cleanly)

## Tech Stack
- **Runtime**: Node.js 20
- **Framework**: Fastify
- **Database**: Supabase (postgres)
- **Message Bus**: Redis (ioredis client)
- **WebSocket**: @fastify/websocket
- **Logging**: pino (built into Fastify)

## Project Structure
```
promptdock/
├── package.json
├── .env.example
├── .env (gitignored)
├── src/
│   ├── server.js           # Main entry point
│   ├── services/
│   │   ├── redis.js        # Redis client + pub/sub helpers
│   │   ├── supabase.js     # Supabase client + queries
│   │   └── logger.js       # Structured logging
│   ├── routes/
│   │   ├── health.js       # Health check endpoint
│   │   └── websocket.js    # WebSocket handler
│   └── public/
│       └── index.html      # Simple dashboard
└── README.md
```

## Environment Variables
Create `.env.example`:
```bash
# Redis
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Server
PORT=3000
NODE_ENV=development
```

## Supabase Schema
Create migration in Supabase SQL Editor:
```sql
-- Messages table: all inter-agent communication
create table messages (
  id uuid primary key default gen_random_uuid(),
  from_agent text not null,
  to_agent text not null,
  type text not null, -- 'task', 'question', 'response', 'status'
  payload jsonb not null,
  created_at timestamptz default now()
);

-- Logs table: all agent activity
create table logs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  level text not null, -- 'info', 'warn', 'error', 'debug'
  message text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Indexes for performance
create index messages_from_agent_idx on messages(from_agent);
create index messages_to_agent_idx on messages(to_agent);
create index messages_created_at_idx on messages(created_at desc);
create index logs_agent_idx on logs(agent);
create index logs_created_at_idx on logs(created_at desc);
```

## Implementation Requirements

### 1. Redis Service (`src/services/redis.js`)
```javascript
// Requirements:
// - Export a singleton Redis client
// - Provide publish(channel, message) function
// - Provide subscribe(channel, callback) function
// - Handle connection errors and reconnection
// - Log connection status
// - Clean shutdown on process exit

// Example message format:
{
  id: 'uuid',
  from: 'chatter',
  to: 'researcher',
  type: 'question',
  payload: { /* agent-specific data */ },
  timestamp: '2025-10-23T10:30:00Z'
}
```

### 2. Supabase Service (`src/services/supabase.js`)
```javascript
// Requirements:
// - Export configured Supabase client
// - Provide logMessage(from, to, type, payload) function
// - Provide logActivity(agent, level, message, metadata) function
// - Handle errors gracefully (don't crash on DB failures)
// - Return promises for all operations
```

### 3. WebSocket Handler (`src/routes/websocket.js`)
```javascript
// Requirements:
// - Register route on '/stream'
// - Accept WebSocket connections
// - Send all Redis messages to connected clients
// - Accept messages from clients and publish to Redis
// - Handle client disconnections
// - Send heartbeat every 30 seconds
// - Log all connections/disconnections

// Client message format:
{
  channel: 'human-input',
  message: 'Your message here'
}

// Server message format (to clients):
{
  channel: 'agent:chatter',
  message: { /* message data */ },
  timestamp: '2025-10-23T10:30:00Z'
}
```

### 4. Health Check (`src/routes/health.js`)
```javascript
// GET /api/health
// Returns:
{
  status: 'healthy',
  services: {
    redis: { connected: true, latency: '2ms' },
    supabase: { connected: true, latency: '15ms' },
    websocket: { connections: 3 }
  },
  uptime: 3600,
  timestamp: '2025-10-23T10:30:00Z'
}
```

### 5. Dashboard (`src/public/index.html`)
```html
<!-- Requirements:
- Connect to WebSocket on ws://localhost:3000/stream
- Display live message feed (newest first)
- Color-code messages by channel
- Show connection status indicator
- Simple input field to publish test messages
- Auto-scroll to newest messages
- Show timestamp for each message
- No framework needed - vanilla JS is fine
-->
```

### 6. Server (`src/server.js`)
```javascript
// Requirements:
// - Initialize Fastify with logging
// - Register @fastify/websocket
// - Register @fastify/static for dashboard
// - Register health route
// - Register websocket route
// - Connect to Redis on startup
// - Connect to Supabase on startup
// - Graceful shutdown handling
// - CORS enabled for local development
```

## Testing Steps

### 1. Installation Test
```bash
npm install
# Should complete without errors
```

### 2. Service Connection Test
```bash
npm run dev
# Should see logs:
# ✓ Redis connected
# ✓ Supabase connected
# ✓ Server listening on port 3000
```

### 3. Health Check Test
```bash
curl http://localhost:3000/api/health
# Should return JSON with all services 'connected: true'
```

### 4. WebSocket Test
```bash
# Open http://localhost:3000 in browser
# Should see dashboard
# Should see "Connected" indicator
```

### 5. Message Flow Test
```bash
# In dashboard, type a test message
# Message should appear in message feed
# Check Redis: redis-cli MONITOR
# Should see PUBLISH commands
# Check Supabase messages table
# Should see row inserted
```

### 6. Concurrent Connection Test
```bash
# Open dashboard in 3 browser tabs
# Send message from tab 1
# Should appear in tabs 2 and 3 immediately
```

### 7. Graceful Shutdown Test
```bash
# While server running: Ctrl+C
# Should see:
# ✓ Closing WebSocket connections...
# ✓ Closing Redis connection...
# ✓ Server stopped gracefully
```

## What NOT to Build
❌ No AI agents yet
❌ No authentication/authorization
❌ No message persistence beyond Supabase logs
❌ No message replay functionality
❌ No advanced dashboard features (graphs, filters, etc.)
❌ No production deployment config (Dockerfile, etc.)

## Expected Output

After running `npm run dev`, you should be able to:
1. Visit `http://localhost:3000` and see the dashboard
2. See "Connected to PromptDock" message
3. Type a message and see it appear in the feed
4. Open browser DevTools and see WebSocket connection
5. Check `redis-cli MONITOR` and see messages flowing
6. Query Supabase and see logged messages

## Dependencies
```json
{
  "dependencies": {
    "fastify": "^4.26.0",
    "@fastify/websocket": "^10.0.0",
    "@fastify/static": "^7.0.0",
    "@fastify/cors": "^9.0.0",
    "ioredis": "^5.3.2",
    "@supabase/supabase-js": "^2.39.0",
    "dotenv": "^16.4.0",
    "pino": "^8.17.0",
    "pino-pretty": "^10.3.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

## Scripts
```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js"
  }
}
```

## Completion Checklist
- [ ] All files created in correct structure
- [ ] .env.example created with all variables
- [ ] Supabase schema applied successfully
- [ ] npm install completes without errors
- [ ] npm run dev starts server successfully
- [ ] All 7 testing steps pass
- [ ] Health endpoint returns healthy status
- [ ] Dashboard loads and shows connection status
- [ ] Messages flow from dashboard → Redis → Supabase
- [ ] Graceful shutdown works

## Estimated Time
**3-4 hours** of Claude Code execution time

## Next Steps
Once this is working, we'll build Command File 2 (Local Worker Template) which will subscribe to Redis channels and respond to messages.
Save this as command-file-1-core-infrastructure.md
