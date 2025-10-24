# Command File 2: Local Worker Template

## Objective
Create a Node.js daemon that runs on your local machine, listens for tasks on Redis, executes commands in a Claude Code terminal, and reports results back. This replaces your manual copy-paste workflow.

## Success Criteria
✅ Worker connects to remote Redis (on Render)
✅ Subscribes to its designated channel (e.g., `agent:frontend`)
✅ Logs all incoming messages clearly
✅ Can write command files to disk
✅ Can spawn Claude Code subprocess
✅ Streams Claude Code output back to Redis
✅ Reports task completion/failure
✅ Handles network disconnections gracefully
✅ Can be stopped/restarted without losing state

## Tech Stack
- **Runtime**: Node.js 20
- **Redis**: ioredis
- **Subprocess**: Node child_process
- **File System**: Node fs/promises
- **Config**: dotenv

## Project Structure
```
promptdock-worker/
├── package.json
├── .env.example
├── .env (gitignored)
├── worker.js           # Main worker process
├── config.js           # Configuration
├── utils/
│   ├── redis.js        # Redis connection
│   ├── claude.js       # Claude Code spawning
│   └── logger.js       # Local logging
└── README.md
```

## Configuration

### Environment Variables (`.env.example`)
```bash
# Worker Identity
AGENT_NAME=frontend
REPO_PATH=/Users/you/projects/my-app/frontend

# Redis Connection (points to Render)
REDIS_URL=redis://your-render-redis.render.com:6379
REDIS_PASSWORD=xxx

# Supabase (for logging - optional)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Worker Settings
COMMAND_FILE_PATH=.claude-command.md
LOG_LEVEL=info
ENABLE_GIT_TRACKING=true
```

## Implementation Requirements

### 1. Worker Main Process (`worker.js`)
```javascript
// Responsibilities:
// - Connect to Redis on startup
// - Subscribe to channel: `agent:${AGENT_NAME}`
// - Subscribe to channel: `broadcast` (for system messages)
// - Handle incoming task messages
// - Maintain task queue (process one at a time)
// - Report status updates
// - Clean shutdown on SIGINT/SIGTERM

// Lifecycle:
// 1. STARTUP: Connect → Log → Send 'ready' status
// 2. IDLE: Wait for tasks
// 3. RECEIVED: Log task → Queue it
// 4. WORKING: Process task → Stream output
// 5. COMPLETE: Report result → Return to IDLE
// 6. SHUTDOWN: Finish current task → Disconnect

// Status Messages to Publish:
{
  from: 'frontend',
  to: 'system',
  type: 'status',
  payload: {
    status: 'ready' | 'working' | 'idle' | 'error' | 'offline',
    current_task_id: 'uuid or null',
    uptime: 3600,
    tasks_completed: 42
  }
}
```

### 2. Redis Client (`utils/redis.js`)
```javascript
// Requirements:
// - Singleton Redis client
// - Auto-reconnect with exponential backoff
// - Publish to channels with retry logic
// - Subscribe with callback handlers
// - Handle connection errors gracefully
// - Log all connection state changes

// Functions to export:
// - connect()
// - disconnect()
// - publish(channel, message)
// - subscribe(channel, callback)
// - unsubscribe(channel)
// - isConnected()
```

### 3. Claude Code Handler (`utils/claude.js`)
```javascript
// Requirements:
// - Write command file to disk at specified path
// - Spawn Claude Code subprocess
// - Stream stdout/stderr in real-time
// - Detect completion vs errors
// - Kill process if timeout exceeded (30 min default)
// - Clean up temp files

// Function signature:
async function executeCommand(commandText, options = {}) {
  // 1. Write commandText to COMMAND_FILE_PATH
  // 2. Spawn: claude-code --file COMMAND_FILE_PATH
  // 3. Set up output streaming
  // 4. Return: { success: boolean, output: string, exitCode: number }
}

// Output streaming:
// Publish to Redis every 500ms:
{
  from: 'frontend',
  to: 'system',
  type: 'progress',
  payload: {
    task_id: 'uuid',
    output: 'Recent stdout lines...',
    timestamp: '2025-10-23T10:30:00Z'
  }
}
```

### 4. Logger (`utils/logger.js`)
```javascript
// Requirements:
// - Console logging with timestamps
// - Different log levels (debug, info, warn, error)
// - Colorized output for readability
// - Optionally send to Supabase
// - File logging for debugging

// Log format:
[2025-10-23 10:30:15] [INFO] [frontend] Connected to Redis
[2025-10-23 10:30:16] [TASK] [frontend] Received task: implement-auth
[2025-10-23 10:30:45] [PROGRESS] [frontend] Creating LoginForm.tsx...
[2025-10-23 10:32:10] [COMPLETE] [frontend] Task finished successfully
```

### 5. Config (`config.js`)
```javascript
// Load and validate all environment variables
// Provide defaults where appropriate
// Throw clear errors if required vars missing

// Export:
module.exports = {
  agent: {
    name: process.env.AGENT_NAME,
    repoPath: process.env.REPO_PATH
  },
  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  },
  worker: {
    commandFilePath: process.env.COMMAND_FILE_PATH || '.claude-command.md',
    taskTimeout: 30 * 60 * 1000, // 30 minutes
    statusReportInterval: 60 * 1000 // 1 minute
  }
};
```

## Task Message Format

### Incoming Task
```json
{
  "id": "task-abc-123",
  "from": "planner",
  "to": "frontend",
  "type": "task",
  "payload": {
    "action": "implement",
    "priority": "high",
    "command_file": "# Build Authentication Form\n\n## Context\n...",
    "context": {
      "related_files": ["src/components/Auth.tsx"],
      "dependencies": ["backend task-xyz-456"]
    },
    "timeout": 1800000,
    "requires_response": true
  },
  "created_at": "2025-10-23T10:30:00Z"
}
```

### Outgoing Response
```json
{
  "id": "response-def-789",
  "from": "frontend",
  "to": "planner",
  "type": "response",
  "payload": {
    "task_id": "task-abc-123",
    "status": "completed",
    "result": {
      "files_modified": [
        "src/components/LoginForm.tsx",
        "src/hooks/useAuth.ts"
      ],
      "tests_passed": true,
      "git_commit": "a1b2c3d",
      "notes": "Implemented with React Hook Form as specified"
    },
    "duration_ms": 125000
  },
  "created_at": "2025-10-23T10:32:05Z"
}
```

### Error Response
```json
{
  "id": "response-ghi-012",
  "from": "frontend",
  "to": "planner",
  "type": "response",
  "payload": {
    "task_id": "task-abc-123",
    "status": "failed",
    "error": {
      "code": "EXECUTION_ERROR",
      "message": "Claude Code exited with code 1",
      "details": "Error: Cannot find module 'react-hook-form'...",
      "recoverable": true
    },
    "duration_ms": 8000
  },
  "created_at": "2025-10-23T10:30:08Z"
}
```

## Testing Steps

### 1. Installation Test
```bash
npm install
# Should complete without errors
```

### 2. Configuration Test
```bash
node -e "require('./config.js'); console.log('Config valid')"
# Should output: Config valid
```

### 3. Redis Connection Test
```bash
node worker.js
# Should see:
# [INFO] [frontend] Starting worker...
# [INFO] [frontend] Connected to Redis
# [INFO] [frontend] Subscribed to: agent:frontend
# [INFO] [frontend] Worker ready, waiting for tasks...
```

### 4. Message Reception Test
```bash
# In another terminal, use redis-cli:
redis-cli -h your-render-redis.render.com -a password
PUBLISH agent:frontend '{"id":"test-1","from":"test","to":"frontend","type":"task","payload":{"command_file":"# Test\necho hello"}}'

# Worker should log:
# [TASK] [frontend] Received task: test-1
```

### 5. Claude Code Execution Test
```bash
# Create a simple test command:
echo "# Test Command\n\nCreate a file test.txt with content 'Hello PromptDock'" > test-command.md

# Publish task with this command
# Worker should:
# 1. Write command to .claude-command.md
# 2. Spawn Claude Code
# 3. Stream output to Redis
# 4. Report completion
# 5. test.txt should exist in repo
```

### 6. Error Handling Test
```bash
# Publish a task that will fail (invalid command)
# Worker should:
# 1. Attempt execution
# 2. Capture error
# 3. Publish error response
# 4. Return to ready state
# 5. Not crash
```

### 7. Graceful Shutdown Test
```bash
# While worker is idle: Ctrl+C
# Should see:
# [INFO] [frontend] Shutdown signal received
# [INFO] [frontend] Disconnecting from Redis...
# [INFO] [frontend] Worker stopped

# While worker is processing: Ctrl+C
# Should see:
# [WARN] [frontend] Shutdown signal received, finishing current task...
# [INFO] [frontend] Task completed
# [INFO] [frontend] Worker stopped
```

### 8. Reconnection Test
```bash
# Start worker
# Stop Redis (or kill network)
# Worker should log reconnection attempts
# Restart Redis
# Worker should automatically reconnect
# Send test task
# Should process normally
```

## What NOT to Build
❌ No task queue persistence (in-memory only)
❌ No task retry logic (that's orchestrator's job)
❌ No multi-tasking (one task at a time)
❌ No web UI for the worker itself
❌ No built-in scheduler
❌ No authentication beyond Redis password

## Startup Script

Create `start-worker.sh`:
```bash
#!/bin/bash
set -e

echo "Starting PromptDock Worker: $AGENT_NAME"
echo "Repository: $REPO_PATH"
echo ""

# Validate environment
if [ -z "$AGENT_NAME" ]; then
  echo "Error: AGENT_NAME not set"
  exit 1
fi

if [ ! -d "$REPO_PATH" ]; then
  echo "Error: REPO_PATH does not exist: $REPO_PATH"
  exit 1
fi

# Check Claude Code is installed
if ! command -v claude-code &> /dev/null; then
  echo "Error: claude-code not found in PATH"
  exit 1
fi

# Start worker
cd "$(dirname "$0")"
node worker.js
```

## Multiple Worker Setup

Create `start-all-workers.sh`:
```bash
#!/bin/bash

# Start frontend worker
(cd ~/promptdock-worker && \
 AGENT_NAME=frontend \
 REPO_PATH=~/projects/my-app/frontend \
 node worker.js) &

# Start backend worker  
(cd ~/promptdock-worker && \
 AGENT_NAME=backend \
 REPO_PATH=~/projects/my-app/backend \
 node worker.js) &

echo "Workers started. Press Ctrl+C to stop all."
wait
```

## Dependencies
```json
{
  "dependencies": {
    "ioredis": "^5.3.2",
    "dotenv": "^16.4.0",
    "chalk": "^4.1.2"
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
    "start": "node worker.js",
    "dev": "nodemon worker.js",
    "test": "node test/connection-test.js"
  }
}
```

## Expected Output

After running `./start-worker.sh`:
```
Starting PromptDock Worker: frontend
Repository: /Users/you/projects/my-app/frontend

[2025-10-23 10:30:15] [INFO] [frontend] Starting worker...
[2025-10-23 10:30:15] [INFO] [frontend] Connecting to Redis...
[2025-10-23 10:30:16] [INFO] [frontend] Connected to Redis
[2025-10-23 10:30:16] [INFO] [frontend] Subscribed to: agent:frontend
[2025-10-23 10:30:16] [INFO] [frontend] Subscribed to: broadcast
[2025-10-23 10:30:16] [INFO] [frontend] Worker ready, waiting for tasks...
[2025-10-23 10:30:16] [STATUS] [frontend] Published status: ready
```

## Completion Checklist
- [ ] All files created in correct structure
- [ ] .env.example created with all variables
- [ ] Dependencies installed successfully
- [ ] Worker starts without errors
- [ ] Connects to Redis successfully
- [ ] Subscribes to correct channels
- [ ] Can receive and log test messages
- [ ] Can write command files to disk
- [ ] Can spawn Claude Code subprocess
- [ ] Streams output to Redis in real-time
- [ ] Reports completion correctly
- [ ] Handles errors gracefully
- [ ] Reconnects after network interruption
- [ ] Graceful shutdown works (idle and working states)
- [ ] start-worker.sh script works

## Estimated Time
**2-3 hours** of Claude Code execution time

## Next Steps
Once this worker template is working, you'll:
1. Run one instance for frontend
2. Run another instance for backend
3. Test end-to-end: Dashboard → Redis → Worker → Claude Code → Response
