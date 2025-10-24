# Command File 2: Local Worker Template (EXPANDED)

## AUDIENCE NOTE
This command file is written for Claude Code. Every instruction should be taken literally. If something is ambiguous, it needs clarification - do not guess or assume. If you encounter a decision point not covered here, stop and ask.

This worker runs ON YOUR LOCAL MACHINE, not in the cloud. It will spawn Claude Code processes to execute tasks in your actual repositories.

## Objective
Create a Node.js daemon that runs on your local machine, listens for tasks on Redis, executes commands in a Claude Code terminal, and reports results back. This replaces the manual copy-paste workflow between Terminal A (backend), Terminal B (frontend), and the cloud.

Think of this as a "remote control" for Claude Code. Instead of you typing commands, other agents send commands via Redis, and this worker executes them.

## Success Criteria (Binary Pass/Fail)
✅ Worker connects to remote Redis (on Render/cloud)
✅ Subscribes to its designated channel (e.g., `agent:frontend`)
✅ Logs all incoming messages with timestamps
✅ Can write command files to disk in repo directory
✅ Can spawn Claude Code subprocess successfully
✅ Streams Claude Code output back to Redis in real-time
✅ Reports task completion with file changes
✅ Reports task failure with error details
✅ Handles network disconnections and reconnects automatically
✅ Can be stopped with Ctrl+C without leaving zombie processes
✅ Can be restarted and resumes working

## CRITICAL: Scope Definition

### You MUST Build:
- Node.js daemon that runs continuously
- Redis connection with reconnection logic
- Message subscription and handling
- Command file writer
- Claude Code subprocess spawner
- Output streaming to Redis
- Status reporting (ready, working, idle, error)
- Graceful shutdown handlers
- Process cleanup on exit

### You MUST NOT Build:
- Task queue persistence (in-memory only)
- Retry logic for failed tasks (orchestrator handles that)
- Multiple concurrent task execution (one at a time)
- Web UI for the worker
- Task scheduling or cron
- Authentication beyond Redis password
- File watching or git hooks
- Automatic repo discovery
- Docker containerization

### What "Scope Creep" Means:
If you find yourself thinking:
- "Let me add a task queue database..." → STOP
- "I should add retry logic..." → STOP (orchestrator does this)
- "Let me run multiple tasks in parallel..." → STOP (one at a time)
- "I'll add a web dashboard for the worker..." → STOP
- "Let me add git auto-commit..." → STOP (Claude Code handles git)

The ONLY goal is: receive task, execute with Claude Code, report result.

## Tech Stack (Fixed - Do Not Substitute)
- **Runtime**: Node.js 20.x (use latest LTS)
- **Redis**: ioredis (NOT node-redis)
- **Subprocess**: Node child_process (built-in)
- **File System**: Node fs/promises (built-in)
- **Config**: dotenv

WHY these choices:
- ioredis: Best Redis client, reliable reconnection
- child_process: Standard Node.js subprocess management
- fs/promises: Modern async file operations
- No fancy frameworks needed

## Project Structure (Exact)

Create this EXACT folder structure:

```
promptdock-worker/
├── package.json
├── .env.example
├── .env (you will create this, gitignored)
├── .gitignore
├── README.md
├── worker.js           # MAIN ENTRY POINT - start here
├── config.js           # Configuration loader
├── utils/
│   ├── redis.js        # Redis connection with reconnect
│   ├── claude.js       # Claude Code subprocess handler
│   └── logger.js       # Console logging with colors
└── scripts/
    ├── start-worker.sh     # Launch script
    └── start-all-workers.sh # Multi-worker launcher
```

Do NOT add any other folders or files beyond this structure.

## Environment Variables

Create `.env.example` with EXACTLY these variables:

```bash
# Worker Identity
AGENT_NAME=frontend
REPO_PATH=/Users/you/projects/my-app/frontend

# Redis Connection (points to cloud/Render)
REDIS_URL=redis://your-render-redis.render.com:6379
REDIS_PASSWORD=your-redis-password

# Supabase (optional, for logging)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Worker Settings
COMMAND_FILE_PATH=.claude-command.md
LOG_LEVEL=info
TASK_TIMEOUT=1800000

# Claude Code Path (if not in PATH)
CLAUDE_CODE_PATH=claude-code
```

Create `.gitignore` with:
```
node_modules/
.env
*.log
.DS_Store
```

## Implementation Details

### 1. package.json

Create with EXACTLY these dependencies:

```json
{
  "name": "promptdock-worker",
  "version": "0.1.0",
  "description": "Local worker for PromptDock - executes tasks via Claude Code",
  "main": "worker.js",
  "type": "module",
  "scripts": {
    "start": "node worker.js",
    "dev": "NODE_ENV=development nodemon worker.js"
  },
  "dependencies": {
    "ioredis": "^5.3.2",
    "dotenv": "^16.4.1",
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Note:** chalk@4.1.2 specifically (v5 is ESM-only and causes issues).

### 2. config.js (Configuration Loader)

```javascript
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

/**
 * Configuration object
 * All values come from environment variables
 */
const config = {
  // Worker identity
  agent: {
    name: process.env.AGENT_NAME,
    repoPath: process.env.REPO_PATH,
  },
  
  // Redis connection
  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: null,
  },
  
  // Supabase (optional)
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  
  // Worker settings
  worker: {
    commandFilePath: process.env.COMMAND_FILE_PATH || '.claude-command.md',
    taskTimeout: parseInt(process.env.TASK_TIMEOUT || '1800000', 10), // 30 min
    statusReportInterval: 60000, // 1 minute
  },
  
  // Claude Code
  claudeCode: {
    path: process.env.CLAUDE_CODE_PATH || 'claude-code',
  },
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const required = {
    'AGENT_NAME': config.agent.name,
    'REPO_PATH': config.agent.repoPath,
    'REDIS_URL': config.redis.url,
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
  
  // Check if repo path exists
  if (!existsSync(config.agent.repoPath)) {
    throw new Error(
      `Repository path does not exist: ${config.agent.repoPath}\n` +
      `Please check REPO_PATH in .env`
    );
  }
}

// Run validation on import
validateConfig();

export default config;
```

**What this does:**
- Loads `.env` file
- Validates required variables
- Checks that repo path exists
- Throws clear errors if anything wrong

### 3. utils/logger.js (Colored Console Logging)

```javascript
import chalk from 'chalk';

/**
 * Simple colored console logger
 * No external dependencies beyond chalk
 */

const LOG_LEVELS = {
  debug: { color: chalk.gray, priority: 0 },
  info: { color: chalk.blue, priority: 1 },
  warn: { color: chalk.yellow, priority: 2 },
  error: { color: chalk.red, priority: 3 },
  success: { color: chalk.green, priority: 1 },
  task: { color: chalk.magenta, priority: 1 },
  progress: { color: chalk.cyan, priority: 1 },
};

const currentLogLevel = process.env.LOG_LEVEL || 'info';
const currentPriority = LOG_LEVELS[currentLogLevel]?.priority ?? 1;

/**
 * Format timestamp
 */
function timestamp() {
  const now = new Date();
  return now.toISOString().substr(11, 8); // HH:MM:SS
}

/**
 * Log with level and color
 */
function log(level, context, message, data = null) {
  const levelConfig = LOG_LEVELS[level] || LOG_LEVELS.info;
  
  // Skip if below current log level
  if (levelConfig.priority < currentPriority) {
    return;
  }
  
  const time = chalk.gray(`[${timestamp()}]`);
  const lvl = levelConfig.color(`[${level.toUpperCase().padEnd(8)}]`);
  const ctx = chalk.white(`[${context}]`);
  
  let output = `${time} ${lvl} ${ctx} ${message}`;
  
  // Add data if provided
  if (data !== null && data !== undefined) {
    if (typeof data === 'object') {
      output += '\n' + JSON.stringify(data, null, 2);
    } else {
      output += ` ${data}`;
    }
  }
  
  console.log(output);
}

/**
 * Create a logger for a specific context
 */
export function createLogger(context) {
  return {
    debug: (msg, data) => log('debug', context, msg, data),
    info: (msg, data) => log('info', context, msg, data),
    warn: (msg, data) => log('warn', context, msg, data),
    error: (msg, data) => log('error', context, msg, data),
    success: (msg, data) => log('success', context, msg, data),
    task: (msg, data) => log('task', context, msg, data),
    progress: (msg, data) => log('progress', context, msg, data),
  };
}

export default { createLogger };
```

**Output example:**
```
[10:30:15] [INFO    ] [frontend] Worker starting...
[10:30:16] [SUCCESS ] [frontend] Connected to Redis
[10:30:45] [TASK    ] [frontend] Received task: implement-auth
[10:31:30] [PROGRESS] [frontend] Creating LoginForm.tsx...
[10:33:10] [SUCCESS ] [frontend] Task completed
```

### 4. utils/redis.js (Redis Client with Reconnection)

```javascript
import Redis from 'ioredis';
import config from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');

/**
 * Redis client singleton
 * Handles pub/sub for receiving tasks and sending updates
 */
let client = null;
let subscriber = null;

/**
 * Get or create Redis client
 */
export function getRedisClient() {
  if (!client) {
    client = new Redis(config.redis.url, {
      password: config.redis.password,
      retryStrategy: config.redis.retryStrategy,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      lazyConnect: false,
    });
    
    client.on('connect', () => {
      log.success('Redis client connected');
    });
    
    client.on('error', (err) => {
      log.error('Redis client error', err.message);
    });
    
    client.on('close', () => {
      log.warn('Redis client connection closed');
    });
    
    client.on('reconnecting', (delay) => {
      log.info(`Redis client reconnecting in ${delay}ms`);
    });
  }
  
  return client;
}

/**
 * Get or create Redis subscriber
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
      log.success('Redis subscriber connected');
    });
    
    subscriber.on('error', (err) => {
      log.error('Redis subscriber error', err.message);
    });
  }
  
  return subscriber;
}

/**
 * Publish a message to Redis
 */
export async function publish(channel, message) {
  const client = getRedisClient();
  
  try {
    const messageStr = JSON.stringify(message);
    await client.publish(channel, messageStr);
    log.debug(`Published to ${channel}`);
  } catch (error) {
    log.error(`Failed to publish to ${channel}`, error.message);
    throw error;
  }
}

/**
 * Subscribe to a Redis channel
 */
export async function subscribe(channel, callback) {
  const sub = getRedisSubscriber();
  
  await sub.subscribe(channel);
  log.info(`Subscribed to channel: ${channel}`);
  
  sub.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        const parsed = JSON.parse(message);
        callback(ch, parsed);
      } catch (error) {
        log.error(`Failed to parse message from ${channel}`, error.message);
      }
    }
  });
}

/**
 * Check if connected
 */
export function isConnected() {
  return client && client.status === 'ready';
}

/**
 * Close all connections
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
  log.success('All Redis connections closed');
}
```

**Key behaviors:**
- Separate client and subscriber (Redis pub/sub requirement)
- Automatic reconnection with exponential backoff
- All errors logged, never crash
- Clean shutdown support

### 5. utils/claude.js (Claude Code Subprocess Handler)

This is CRITICAL. This is what actually runs Claude Code.

```javascript
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import config from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('claude');

/**
 * Execute a command file with Claude Code
 * 
 * This function:
 * 1. Writes the command file to disk
 * 2. Spawns Claude Code subprocess
 * 3. Streams output in real-time
 * 4. Returns result when complete
 * 
 * @param {string} commandText - The command file content (markdown)
 * @param {object} options - Execution options
 * @returns {Promise<object>} Result object
 */
export async function executeCommand(commandText, options = {}) {
  const {
    taskId = 'unknown',
    timeout = config.worker.taskTimeout,
    onProgress = null, // Callback for streaming output
  } = options;
  
  const commandFilePath = join(config.agent.repoPath, config.worker.commandFilePath);
  
  log.info(`Executing command file for task: ${taskId}`);
  
  try {
    // Step 1: Write command file to disk
    await writeFile(commandFilePath, commandText, 'utf8');
    log.debug(`Command file written: ${commandFilePath}`);
    
    // Step 2: Spawn Claude Code
    const claude = spawn(config.claudeCode.path, ['--file', config.worker.commandFilePath], {
      cwd: config.agent.repoPath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });
    
    log.info('Claude Code process started', { pid: claude.pid });
    
    // Collect output
    let stdout = '';
    let stderr = '';
    
    // Stream stdout
    claude.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      
      // Log progress
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        log.progress(line);
      }
      
      // Call progress callback if provided
      if (onProgress) {
        onProgress(text);
      }
    });
    
    // Stream stderr
    claude.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      
      // Log errors
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        log.warn(line);
      }
    });
    
    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      log.error(`Task ${taskId} timed out after ${timeout}ms`);
      claude.kill('SIGTERM');
      
      // Force kill after 5 seconds if still alive
      setTimeout(() => {
        if (!claude.killed) {
          claude.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);
    
    // Wait for process to complete
    const exitCode = await new Promise((resolve) => {
      claude.on('close', (code) => {
        clearTimeout(timeoutHandle);
        resolve(code);
      });
    });
    
    // Step 3: Clean up command file
    try {
      await unlink(commandFilePath);
      log.debug('Command file cleaned up');
    } catch (err) {
      log.warn('Failed to delete command file', err.message);
    }
    
    // Step 4: Determine result
    const success = exitCode === 0;
    
    if (success) {
      log.success(`Task ${taskId} completed successfully`);
    } else {
      log.error(`Task ${taskId} failed with exit code ${exitCode}`);
    }
    
    return {
      success,
      exitCode,
      stdout,
      stderr,
      duration: null, // Will be calculated by caller
    };
    
  } catch (error) {
    log.error(`Task ${taskId} execution error`, error.message);
    
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: error.message,
      duration: null,
    };
  }
}

/**
 * Check if Claude Code is available
 */
export async function checkClaudeCodeAvailable() {
  try {
    const test = spawn(config.claudeCode.path, ['--version'], {
      stdio: 'pipe',
    });
    
    return new Promise((resolve) => {
      test.on('close', (code) => {
        resolve(code === 0);
      });
      
      test.on('error', () => {
        resolve(false);
      });
    });
  } catch (error) {
    return false;
  }
}
```

**Critical behaviors:**
1. **Command file handling:**
   - Write to disk before running
   - Clean up after execution
   - Use .claude-command.md as filename

2. **Process management:**
   - Spawn Claude Code with correct working directory
   - Stream output in real-time
   - Handle timeout (kill process)
   - Handle errors gracefully

3. **Output streaming:**
   - Call onProgress callback for real-time updates
   - Log all output for debugging
   - Capture both stdout and stderr

### 6. worker.js (Main Worker Process)

This is the heart of the worker. It orchestrates everything.

```javascript
import config from './config.js';
import { createLogger } from './utils/logger.js';
import * as redis from './utils/redis.js';
import { executeCommand, checkClaudeCodeAvailable } from './utils/claude.js';

const log = createLogger('worker');

/**
 * Worker state
 */
const state = {
  status: 'starting', // 'starting', 'idle', 'working', 'error'
  currentTask: null,
  tasksCompleted: 0,
  startTime: Date.now(),
};

/**
 * Publish status update to Redis
 */
async function publishStatus() {
  try {
    await redis.publish('agent:status', {
      from: config.agent.name,
      to: 'system',
      type: 'status',
      payload: {
        status: state.status,
        current_task_id: state.currentTask?.id || null,
        tasks_completed: state.tasksCompleted,
        uptime: Math.floor((Date.now() - state.startTime) / 1000),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('Failed to publish status', error.message);
  }
}

/**
 * Handle incoming task message
 */
async function handleTask(message) {
  // Validate message structure
  if (!message.id || !message.payload || !message.payload.command_file) {
    log.error('Invalid task message', message);
    return;
  }
  
  const taskId = message.id;
  const commandFile = message.payload.command_file;
  
  log.task(`Received task: ${taskId}`);
  log.debug('Task details', message.payload);
  
  // Check if already working
  if (state.status === 'working') {
    log.warn(`Already working on task ${state.currentTask.id}, ignoring ${taskId}`);
    
    // Send busy response
    await redis.publish(message.from || 'chatter-output', {
      id: `response-${Date.now()}`,
      from: config.agent.name,
      to: message.from || 'chatter',
      type: 'response',
      payload: {
        task_id: taskId,
        status: 'rejected',
        reason: 'Worker is busy',
      },
      timestamp: new Date().toISOString(),
    });
    
    return;
  }
  
  // Update state
  state.status = 'working';
  state.currentTask = { id: taskId, startTime: Date.now() };
  await publishStatus();
  
  try {
    // Execute command with Claude Code
    const startTime = Date.now();
    
    const result = await executeCommand(commandFile, {
      taskId,
      timeout: message.payload.timeout || config.worker.taskTimeout,
      onProgress: async (output) => {
        // Stream progress to Redis
        await redis.publish('agent:progress', {
          from: config.agent.name,
          to: 'system',
          type: 'progress',
          payload: {
            task_id: taskId,
            output: output,
          },
          timestamp: new Date().toISOString(),
        });
      },
    });
    
    const duration = Date.now() - startTime;
    
    // Prepare response
    const response = {
      id: `response-${Date.now()}`,
      from: config.agent.name,
      to: message.from || 'chatter',
      type: 'response',
      payload: {
        task_id: taskId,
        status: result.success ? 'completed' : 'failed',
        result: {
          exit_code: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        duration_ms: duration,
      },
      timestamp: new Date().toISOString(),
    };
    
    // Publish response
    await redis.publish(message.from || 'chatter-output', response);
    
    if (result.success) {
      log.success(`Task ${taskId} completed in ${duration}ms`);
      state.tasksCompleted++;
    } else {
      log.error(`Task ${taskId} failed`);
    }
    
  } catch (error) {
    log.error(`Task ${taskId} exception`, error.message);
    
    // Send error response
    await redis.publish(message.from || 'chatter-output', {
      id: `response-${Date.now()}`,
      from: config.agent.name,
      to: message.from || 'chatter',
      type: 'response',
      payload: {
        task_id: taskId,
        status: 'failed',
        error: {
          message: error.message,
          stack: error.stack,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } finally {
    // Reset state
    state.status = 'idle';
    state.currentTask = null;
    await publishStatus();
  }
}

/**
 * Start the worker
 */
async function start() {
  log.info(`Starting ${config.agent.name} worker...`);
  log.info(`Repository: ${config.agent.repoPath}`);
  
  try {
    // Check Claude Code is available
    log.info('Checking Claude Code availability...');
    const claudeAvailable = await checkClaudeCodeAvailable();
    
    if (!claudeAvailable) {
      throw new Error(
        `Claude Code not found. Please install it or set CLAUDE_CODE_PATH.\n` +
        `Tried: ${config.claudeCode.path}`
      );
    }
    
    log.success('Claude Code is available');
    
    // Connect to Redis
    log.info('Connecting to Redis...');
    const redisClient = redis.getRedisClient();
    await redisClient.ping();
    log.success('Connected to Redis');
    
    // Subscribe to agent channel
    const agentChannel = `agent:${config.agent.name}`;
    await redis.subscribe(agentChannel, handleTask);
    log.success(`Subscribed to: ${agentChannel}`);
    
    // Subscribe to broadcast channel
    await redis.subscribe('broadcast', (channel, message) => {
      log.info('Broadcast message received', message);
      
      // Handle system commands
      if (message.command === 'shutdown') {
        log.warn('Shutdown command received');
        shutdown('BROADCAST');
      }
    });
    
    // Update state
    state.status = 'idle';
    await publishStatus();
    
    // Set up status reporting interval
    setInterval(publishStatus, config.worker.statusReportInterval);
    
    log.success(`Worker ready and waiting for tasks`);
    log.info(`Status: ${state.status}`);
    
  } catch (error) {
    log.error('Failed to start worker', error.message);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  log.info(`Received ${signal}, shutting down...`);
  
  // Check if working on a task
  if (state.status === 'working' && state.currentTask) {
    log.warn(`Currently working on task ${state.currentTask.id}`);
    log.info('Waiting for task to complete before shutdown...');
    
    // Wait for up to 30 seconds
    const waitStart = Date.now();
    while (state.status === 'working' && Date.now() - waitStart < 30000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (state.status === 'working') {
      log.error('Task did not complete, forcing shutdown');
    } else {
      log.success('Task completed, proceeding with shutdown');
    }
  }
  
  // Update status
  state.status = 'offline';
  await publishStatus();
  
  // Close Redis
  await redis.closeAll();
  
  log.success('Worker stopped');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', reason);
  process.exit(1);
});

// Start the worker
start();
```

**Worker lifecycle:**
1. **Start**: Check Claude Code → Connect Redis → Subscribe to channels
2. **Idle**: Wait for task messages
3. **Working**: Execute task with Claude Code
4. **Complete**: Report results → Return to idle
5. **Shutdown**: Finish current task → Disconnect → Exit

**Task handling:**
- One task at a time (reject new tasks while working)
- Stream progress to Redis in real-time
- Report completion/failure
- Handle timeouts

### 7. scripts/start-worker.sh (Launch Script)

```bash
#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "   PromptDock Worker Startup"
echo "========================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found${NC}"
  echo "Copy .env.example to .env and configure it"
  exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Validate required variables
if [ -z "$AGENT_NAME" ]; then
  echo -e "${RED}Error: AGENT_NAME not set in .env${NC}"
  exit 1
fi

if [ -z "$REPO_PATH" ]; then
  echo -e "${RED}Error: REPO_PATH not set in .env${NC}"
  exit 1
fi

if [ ! -d "$REPO_PATH" ]; then
  echo -e "${RED}Error: REPO_PATH does not exist: $REPO_PATH${NC}"
  exit 1
fi

if [ -z "$REDIS_URL" ]; then
  echo -e "${RED}Error: REDIS_URL not set in .env${NC}"
  exit 1
fi

# Check if Claude Code is installed
if ! command -v claude-code &> /dev/null; then
  echo -e "${RED}Error: claude-code not found in PATH${NC}"
  echo "Please install Claude Code or set CLAUDE_CODE_PATH in .env"
  exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}Error: Node.js 20+ required (found v$NODE_VERSION)${NC}"
  exit 1
fi

# Display config
echo -e "${GREEN}Configuration:${NC}"
echo "  Agent Name:  $AGENT_NAME"
echo "  Repository:  $REPO_PATH"
echo "  Redis URL:   $REDIS_URL"
echo "  Node.js:     $(node -v)"
echo "  Claude Code: $(which claude-code)"
echo ""

# Start worker
echo -e "${GREEN}Starting worker...${NC}"
echo ""

node worker.js
```

Make executable:
```bash
chmod +x scripts/start-worker.sh
```

### 8. scripts/start-all-workers.sh (Multi-Worker Launcher)

```bash
#!/bin/bash

# Start multiple workers for different repos
# Each worker runs in background

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo "========================================"
echo "   Starting All PromptDock Workers"
echo "========================================"
echo ""

# Worker 1: Frontend
echo -e "${GREEN}Starting frontend worker...${NC}"
(
  export AGENT_NAME=frontend
  export REPO_PATH=~/projects/my-app/frontend
  node worker.js
) &
FRONTEND_PID=$!
echo "  PID: $FRONTEND_PID"

# Worker 2: Backend
echo -e "${GREEN}Starting backend worker...${NC}"
(
  export AGENT_NAME=backend
  export REPO_PATH=~/projects/my-app/backend
  node worker.js
) &
BACKEND_PID=$!
echo "  PID: $BACKEND_PID"

echo ""
echo "All workers started!"
echo "Frontend PID: $FRONTEND_PID"
echo "Backend PID:  $BACKEND_PID"
echo ""
echo "Press Ctrl+C to stop all workers"
echo ""

# Wait for all background processes
wait
```

Make executable:
```bash
chmod +x scripts/start-all-workers.sh
```

### 9. README.md (Documentation)

```markdown
# PromptDock Worker

Local worker daemon that executes tasks via Claude Code.

## What Is This?

This worker runs on your local machine and:
1. Connects to PromptDock's Redis message bus
2. Listens for task assignments
3. Executes tasks using Claude Code
4. Reports results back

Think of it as a "remote control" for Claude Code.

## Prerequisites

- Node.js 20+ ([Download](https://nodejs.org/))
- Claude Code installed and in PATH
- Redis (running somewhere - local or cloud)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```bash
AGENT_NAME=frontend
REPO_PATH=/Users/you/projects/my-app/frontend
REDIS_URL=redis://your-redis-url:6379
REDIS_PASSWORD=your-password
```

**Important:** REPO_PATH must be an absolute path.

### 3. Verify Claude Code

```bash
claude-code --version
```

Should output version number. If not found:
- Install Claude Code
- Or set CLAUDE_CODE_PATH in .env

### 4. Start Worker

```bash
./scripts/start-worker.sh
```

Or directly:
```bash
node worker.js
```

You should see:
```
[10:30:15] [INFO    ] [worker] Starting frontend worker...
[10:30:15] [INFO    ] [worker] Repository: /Users/you/projects/my-app/frontend
[10:30:16] [SUCCESS ] [redis] Connected to Redis
[10:30:16] [SUCCESS ] [worker] Subscribed to: agent:frontend
[10:30:16] [SUCCESS ] [worker] Worker ready and waiting for tasks
```

## Usage

### Running Multiple Workers

To run both frontend and backend workers:

1. Edit `scripts/start-all-workers.sh` with your repo paths
2. Run:
```bash
./scripts/start-all-workers.sh
```

Or run multiple workers manually:

```bash
# Terminal 1: Frontend
AGENT_NAME=frontend REPO_PATH=~/projects/my-app/frontend node worker.js

# Terminal 2: Backend
AGENT_NAME=backend REPO_PATH=~/projects/my-app/backend node worker.js
```

### Sending Test Task

Publish a task via Redis:

```bash
redis-cli
> PUBLISH agent:frontend '{"id":"test-1","from":"test","to":"frontend","type":"task","payload":{"command_file":"# Test\n\nCreate a file called test.txt with content: Hello PromptDock"}}'
```

Worker should:
1. Receive task
2. Write command file
3. Execute Claude Code
4. Report completion

### Checking Status

Workers publish status every minute to `agent:status` channel:

```bash
redis-cli
> SUBSCRIBE agent:status
```

## Task Message Format

Workers expect tasks in this format:

```json
{
  "id": "task-abc-123",
  "from": "planner",
  "to": "frontend",
  "type": "task",
  "payload": {
    "command_file": "# Command File Content\n\n...",
    "timeout": 1800000
  }
}
```

Workers respond with:

```json
{
  "id": "response-def-456",
  "from": "frontend",
  "to": "planner",
  "type": "response",
  "payload": {
    "task_id": "task-abc-123",
    "status": "completed",
    "result": {
      "exit_code": 0,
      "stdout": "...",
      "stderr": ""
    },
    "duration_ms": 125000
  }
}
```

## Troubleshooting

### "Claude Code not found"

Install Claude Code or set CLAUDE_CODE_PATH:

```bash
export CLAUDE_CODE_PATH=/path/to/claude-code
```

### "Redis connection failed"

- Check REDIS_URL is correct
- Check Redis is running: `redis-cli ping`
- Check network/firewall if Redis is remote

### "Repository path does not exist"

- Use absolute path, not relative
- Check path is correct: `ls $REPO_PATH`

### Worker not receiving tasks

- Check AGENT_NAME matches channel name
- Test Redis connection: `redis-cli PUBLISH agent:frontend '{"test":true}'`
- Check worker logs for subscription confirmation

### Task timeout

Default timeout is 30 minutes. To change:

```bash
export TASK_TIMEOUT=3600000  # 60 minutes in ms
```

Or set in task message:
```json
{
  "payload": {
    "timeout": 3600000
  }
}
```

## Development

### Run with auto-reload

```bash
npm run dev
```

Changes to .js files will restart the worker.

### View logs

All logs go to stdout with colors:
- Blue: Info
- Green: Success
- Yellow: Warnings
- Red: Errors
- Magenta: Tasks
- Cyan: Progress

### Stop worker

Press Ctrl+C. Worker will:
1. Finish current task (if any)
2. Close Redis connections
3. Exit cleanly

## Production Notes

NOT READY FOR PRODUCTION.

This is Phase 1. Once Phase 2 (agents) is working, consider:
- Running workers on a dedicated VM
- Using PM2 for process management
- Adding monitoring/alerting
- Log aggregation

## Next Steps

After verifying this works:
1. Deploy Command File 1 (Core Infrastructure) to Render
2. Deploy Command File 3 (Chatter Agent) to Render
3. Deploy Command File 4 (Researcher Agent) to Render
4. Test full agent coordination

## License

MIT
```

---

## Testing Guide

Create `test/manual-tests.md`:

```markdown
# Worker Manual Testing

## Test 1: Installation

```bash
npm install
```

**Pass if:** No errors, node_modules/ created

---

## Test 2: Configuration Validation

```bash
# No .env file
node worker.js
```

**Pass if:** Error about missing .env

---

## Test 3: Worker Startup

```bash
./scripts/start-worker.sh
```

**Pass if:**
- Claude Code availability check passes
- Redis connection succeeds
- Worker shows "ready and waiting"

---

## Test 4: Receive Task

In another terminal:
```bash
redis-cli
> PUBLISH agent:frontend '{"id":"test-1","from":"test","to":"frontend","type":"task","payload":{"command_file":"# Test Task\n\nCreate a file test.txt with content: Hello"}}'
```

**Pass if:**
- Worker receives task
- Executes Claude Code
- Creates test.txt in repo
- Reports completion to Redis

---

## Test 5: Task Output Streaming

While task is running, in another terminal:
```bash
redis-cli
> SUBSCRIBE agent:progress
```

**Pass if:** See output streaming in real-time

---

## Test 6: Graceful Shutdown

While idle, press Ctrl+C

**Pass if:**
- Worker logs shutdown
- Redis connections close
- Process exits cleanly

---

## Test 7: Shutdown While Working

Start a long task, then press Ctrl+C

**Pass if:**
- Worker waits for task to complete
- Then shuts down gracefully

---

## Test 8: Invalid Task

```bash
redis-cli
> PUBLISH agent:frontend '{"invalid":"message"}'
```

**Pass if:**
- Worker logs error
- Does not crash
- Continues running

---

## Test 9: Claude Code Not Found

```bash
export CLAUDE_CODE_PATH=/nonexistent
node worker.js
```

**Pass if:** Error about Claude Code not found

---

## Test 10: Multiple Workers

Start two workers with different AGENT_NAME:

```bash
# Terminal 1
AGENT_NAME=frontend REPO_PATH=/path/to/frontend node worker.js

# Terminal 2
AGENT_NAME=backend REPO_PATH=/path/to/backend node worker.js
```

Send tasks to both:
```bash
redis-cli
> PUBLISH agent:frontend '{"id":"test-1",...}'
> PUBLISH agent:backend '{"id":"test-2",...}'
```

**Pass if:** Each worker processes only its tasks
```

---

## Completion Checklist

After building everything:

- [ ] All files created in correct structure
- [ ] package.json with correct dependencies
- [ ] .env.example with all variables
- [ ] Configuration validation works
- [ ] Claude Code detection works
- [ ] Redis connection works
- [ ] Worker subscribes to correct channel
- [ ] Can receive and parse task messages
- [ ] Can write command file to disk
- [ ] Can spawn Claude Code subprocess
- [ ] Output streams to Redis in real-time
- [ ] Task completion reported correctly
- [ ] Task failure reported correctly
- [ ] Graceful shutdown works (idle state)
- [ ] Graceful shutdown works (working state)
- [ ] All 10 manual tests pass

## Expected Behavior

**Startup:**
```
[10:30:15] [INFO    ] [worker] Starting frontend worker...
[10:30:15] [INFO    ] [worker] Repository: /Users/you/projects/my-app/frontend
[10:30:15] [INFO    ] [worker] Checking Claude Code availability...
[10:30:16] [SUCCESS ] [claude] Claude Code is available
[10:30:16] [INFO    ] [worker] Connecting to Redis...
[10:30:16] [SUCCESS ] [redis] Redis client connected
[10:30:16] [SUCCESS ] [redis] Redis subscriber connected
[10:30:16] [SUCCESS ] [worker] Subscribed to: agent:frontend
[10:30:16] [SUCCESS ] [worker] Worker ready and waiting for tasks
[10:30:16] [INFO    ] [worker] Status: idle
```

**Receiving Task:**
```
[10:31:45] [TASK    ] [worker] Received task: task-abc-123
[10:31:45] [INFO    ] [claude] Executing command file for task: task-abc-123
[10:31:45] [INFO    ] [claude] Claude Code process started { pid: 12345 }
[10:31:50] [PROGRESS] [claude] Analyzing repository...
[10:32:15] [PROGRESS] [claude] Creating LoginForm.tsx...
[10:33:30] [PROGRESS] [claude] Adding form validation...
[10:34:50] [SUCCESS ] [claude] Task task-abc-123 completed successfully
[10:34:50] [SUCCESS ] [worker] Task task-abc-123 completed in 185000ms
[10:34:50] [INFO    ] [worker] Status: idle
```

**Shutdown:**
```
^C
[10:40:00] [INFO    ] [worker] Received SIGINT, shutting down...
[10:40:00] [INFO    ] [redis] Closing Redis client
[10:40:00] [INFO    ] [redis] Closing Redis subscriber
[10:40:00] [SUCCESS ] [redis] All Redis connections closed
[10:40:00] [SUCCESS ] [worker] Worker stopped
```

---

**Command File 2 Complete: ~1,400 lines**

This is comprehensive, explicit, and ready for Claude Code to execute. Want me to create Command Files 3 and 4 as artifacts too?
