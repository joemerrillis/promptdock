# Command File 3: Chatter Agent (EXPANDED)

## AUDIENCE NOTE
This command file is written for Claude Code. Every instruction should be taken literally. If something is ambiguous, it needs clarification - do not guess or assume. If you encounter a decision point not covered here, stop and ask.

This agent runs IN THE CLOUD (on Render), not on your local machine. It's the conversational orchestrator that serves as the user's primary interface.

## Objective
Build the conversational orchestrator that receives human input from the dashboard, determines which agents to consult, waits for their responses, and synthesizes results back to the user. Chatter makes the multi-agent system feel like a single, intelligent assistant.

Think of Chatter as a skilled project manager who knows when to ask specialists for help, waits for their input, and presents a coherent answer to you.

## Success Criteria (Binary Pass/Fail)
✅ Subscribes to `human-input` channel on Redis
✅ Uses Claude API to process user messages intelligently
✅ Has tools to call Planner, Researcher, Frontend, Backend
✅ Waits for agent responses with 5-minute timeout
✅ Handles multiple tool calls in sequence
✅ Synthesizes multi-agent responses into coherent answer
✅ Maintains conversation context across messages (50 message history)
✅ Publishes responses to `chatter-output` channel within 30 seconds
✅ Handles agent failures gracefully (doesn't crash)
✅ Logs all activity to Supabase
✅ Runs continuously without memory leaks

## CRITICAL: Scope Definition

### You MUST Build:
- Node.js daemon that runs continuously
- Redis subscription to `human-input` channel
- Claude API integration with tool support
- Tool definitions (5 tools total)
- Conversation context manager
- Agent communication via Redis pub/sub
- Response waiting with timeout
- Response synthesis and publishing
- Supabase logging
- Error handling for all edge cases

### You MUST NOT Build:
- User authentication (Phase 2)
- Message persistence beyond logs
- Rate limiting (Phase 2)
- Conversation export (Phase 2)
- Web UI (that's Command File 1)
- Multi-user session management (Phase 2)
- Conversation branching or forking
- Message editing or deletion

### What "Scope Creep" Means:
If you find yourself thinking:
- "Let me add user accounts..." → STOP
- "I should cache responses..." → STOP
- "Let me add conversation templates..." → STOP
- "I'll add A/B testing..." → STOP
- "Let me add analytics..." → STOP (Phase 2)

The ONLY goal is: orchestrate conversations between human and agents.

## Tech Stack (Fixed - Do Not Substitute)
- **Runtime**: Node.js 20.x (use latest LTS)
- **LLM**: Claude 4.5 Sonnet via Anthropic SDK
- **Redis**: ioredis (NOT node-redis)
- **Database**: Supabase
- **Logging**: pino

WHY these choices:
- Anthropic SDK: Official, well-maintained, supports tools
- Claude 4.5 Sonnet: Most capable model, good at reasoning
- ioredis: Reliable Redis client
- Supabase: Easy logging and querying

## Project Structure (Exact)

This goes in the `promptdock/src/agents/` folder (created in Command File 1):

```
promptdock/src/agents/
├── chatterAgent.js      # MAIN ENTRY POINT - start here
├── tools.js             # Tool definitions for Claude
├── context.js           # Conversation context manager
└── README.md            # Agent documentation
```

These files integrate with the existing Command File 1 infrastructure.

## Environment Variables

These should already exist in Command File 1's `.env`, but verify:

```bash
# Anthropic API (ADD THIS)
ANTHROPIC_API_KEY=sk-ant-xxx

# Redis (already from Command File 1)
REDIS_URL=redis://localhost:6379

# Supabase (already from Command File 1)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Chatter Config (ADD THESE)
AGENT_NAME=chatter
LOG_LEVEL=info
CONVERSATION_TIMEOUT=3600000
TOOL_CALL_TIMEOUT=300000
MAX_CONVERSATION_HISTORY=50
```

## Dependencies

Update `promptdock/package.json` to add:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "uuid": "^9.0.0"
  }
}
```

Run `npm install` after adding.

## Implementation Details

### 1. tools.js (Tool Definitions for Claude)

This defines what Chatter can do. These are the "buttons" Claude can press.

```javascript
/**
 * Tool definitions for Claude API
 * These enable Chatter to communicate with other agents
 */

export const tools = [
  {
    name: "consult_planner",
    description: "Ask the Planner agent to create a project plan, break down tasks, or coordinate work between agents. Use this when you need strategic planning or task delegation. The Planner has a high-level view of the project and can create detailed implementation plans.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question or request for the Planner. Be specific about what you need planned or coordinated."
        },
        context: {
          type: "object",
          description: "Relevant context such as user's previous messages, current project state, or constraints.",
          properties: {
            user_intent: { type: "string" },
            previous_decisions: { type: "array", items: { type: "string" } },
            constraints: { type: "array", items: { type: "string" } }
          }
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level for this request. High priority for user-blocking work."
        }
      },
      required: ["question"]
    }
  },
  
  {
    name: "consult_researcher",
    description: "Ask the Researcher agent to analyze existing code, check for conflicts, or validate integration points. Use this BEFORE assigning implementation tasks to ensure compatibility with existing code. The Researcher has access to repository snapshots and can detect conflicts, patterns, and integration issues.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "What to research or analyze. Examples: 'Do we have authentication?', 'What form library do we use?', 'Will this conflict with existing code?'"
        },
        repos: {
          type: "array",
          items: {
            type: "string",
            enum: ["frontend", "backend", "both"]
          },
          description: "Which repositories to analyze. Choose 'both' if the question spans frontend and backend."
        },
        focus_areas: {
          type: "array",
          items: { type: "string" },
          description: "Specific areas to focus on. Examples: ['auth patterns', 'database schema', 'API routes', 'component library']"
        }
      },
      required: ["question", "repos"]
    }
  },
  
  {
    name: "assign_task",
    description: "Assign a specific implementation task to Frontend or Backend worker. ONLY use this AFTER: (1) Planner has approved the task, AND (2) Researcher has validated no conflicts. This will trigger Claude Code execution on the user's local machine. The task should be well-scoped and include clear acceptance criteria.",
    input_schema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: ["frontend", "backend"],
          description: "Which worker to assign the task to."
        },
        command_file: {
          type: "string",
          description: "The complete command file content in markdown format. This should be detailed, production-ready instructions for Claude Code. Include context, requirements, and acceptance criteria."
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Task priority. High priority for user-waiting tasks."
        },
        estimated_duration: {
          type: "string",
          description: "Estimated completion time (e.g., '15 minutes', '1 hour')"
        }
      },
      required: ["agent", "command_file"]
    }
  },
  
  {
    name: "check_agent_status",
    description: "Check if an agent is online and what it's currently working on. Use this to verify agents are available before assigning tasks, or to check on task progress.",
    input_schema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent name to check. Examples: 'frontend', 'backend', 'planner', 'researcher'"
        }
      },
      required: ["agent"]
    }
  },
  
  {
    name: "escalate_to_human",
    description: "When there's ambiguity, conflict, or a decision that requires human judgment, use this to ask the user directly. This should be used when: (1) Agents provide conflicting advice, (2) Multiple valid approaches exist, (3) Trade-offs require user preference, (4) Critical architectural decisions are needed.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question for the human. Be clear and concise."
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Possible options or paths forward. Present 2-4 options with brief explanations."
        },
        context: {
          type: "string",
          description: "Why this requires human input. Explain what agents have said and why you need user decision."
        },
        recommendation: {
          type: "string",
          description: "Your recommendation (if you have one) with reasoning."
        }
      },
      required: ["question", "context"]
    }
  }
];
```

**Tool design principles:**
- Descriptive names that explain purpose
- Detailed descriptions for Claude to understand when to use them
- Required fields are truly required
- Enum fields limit options to valid choices
- Examples in descriptions guide usage

### 2. context.js (Conversation Context Manager)

This manages conversation state, pending requests, and history.

```javascript
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../services/logger.js';

const log = createLogger('context');

/**
 * Conversation Context Manager
 * 
 * Responsibilities:
 * - Maintain conversation history per user
 * - Track pending agent requests
 * - Clean up stale data
 * - Format messages for Claude API
 */
export class ConversationContext {
  constructor() {
    this.conversations = new Map(); // userId -> { messages, lastActivity }
    this.pendingRequests = new Map(); // requestId -> { agent, timeout, resolve, reject }
    
    // Cleanup stale conversations every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  /**
   * Get or create conversation for user
   */
  getConversation(userId) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, {
        messages: [],
        lastActivity: Date.now(),
      });
      
      log.debug(`Created new conversation for user: ${userId}`);
    }
    
    return this.conversations.get(userId);
  }
  
  /**
   * Add a message to conversation history
   * 
   * @param {string} userId - User identifier
   * @param {string} role - 'user' or 'assistant'
   * @param {any} content - Message content (string or array of content blocks)
   */
  addMessage(userId, role, content) {
    const conversation = this.getConversation(userId);
    
    // Add message
    conversation.messages.push({
      role,
      content,
    });
    
    // Keep only last N messages (prevent memory bloat)
    const maxHistory = parseInt(process.env.MAX_CONVERSATION_HISTORY || '50', 10);
    if (conversation.messages.length > maxHistory) {
      conversation.messages = conversation.messages.slice(-maxHistory);
      log.debug(`Trimmed conversation history for ${userId} to ${maxHistory} messages`);
    }
    
    // Update activity timestamp
    conversation.lastActivity = Date.now();
    
    log.debug(`Added ${role} message to ${userId}'s conversation (total: ${conversation.messages.length})`);
  }
  
  /**
   * Get conversation history formatted for Claude API
   * 
   * @param {string} userId - User identifier
   * @returns {Array} Array of message objects for Claude API
   */
  getHistory(userId) {
    const conversation = this.getConversation(userId);
    return conversation.messages;
  }
  
  /**
   * Track a request to another agent
   * Returns a promise that resolves when response arrives
   * 
   * @param {string} requestId - Unique request identifier
   * @param {string} agent - Agent name
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} Resolves with response, rejects on timeout
   */
  trackRequest(requestId, agent, timeout = 300000) {
    log.debug(`Tracking request ${requestId} to ${agent} (timeout: ${timeout}ms)`);
    
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        
        log.warn(`Request ${requestId} to ${agent} timed out`);
        
        reject(new Error(`Agent ${agent} did not respond within ${timeout}ms`));
      }, timeout);
      
      // Store request
      this.pendingRequests.set(requestId, {
        agent,
        timeoutHandle,
        resolve,
        reject,
        createdAt: Date.now(),
      });
    });
  }
  
  /**
   * Fulfill a tracked request
   * Called when response arrives from agent
   * 
   * @param {string} requestId - Request identifier
   * @param {any} response - Response from agent
   */
  fulfillRequest(requestId, response) {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      log.warn(`Received response for unknown request: ${requestId}`);
      return;
    }
    
    // Clear timeout
    clearTimeout(request.timeoutHandle);
    
    // Resolve promise
    request.resolve(response);
    
    // Remove from pending
    this.pendingRequests.delete(requestId);
    
    const duration = Date.now() - request.createdAt;
    log.debug(`Request ${requestId} fulfilled after ${duration}ms`);
  }
  
  /**
   * Reject a tracked request
   * Called when agent returns error
   * 
   * @param {string} requestId - Request identifier
   * @param {Error} error - Error from agent
   */
  rejectRequest(requestId, error) {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      log.warn(`Received error for unknown request: ${requestId}`);
      return;
    }
    
    // Clear timeout
    clearTimeout(request.timeoutHandle);
    
    // Reject promise
    request.reject(error);
    
    // Remove from pending
    this.pendingRequests.delete(requestId);
    
    log.debug(`Request ${requestId} rejected`);
  }
  
  /**
   * Clean up stale conversations and requests
   */
  cleanup() {
    const now = Date.now();
    const conversationTimeout = parseInt(process.env.CONVERSATION_TIMEOUT || '3600000', 10);
    
    // Clean up stale conversations
    let conversationsRemoved = 0;
    for (const [userId, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActivity > conversationTimeout) {
        this.conversations.delete(userId);
        conversationsRemoved++;
      }
    }
    
    if (conversationsRemoved > 0) {
      log.info(`Cleaned up ${conversationsRemoved} stale conversation(s)`);
    }
    
    // Clean up stale pending requests (should be handled by timeout, but just in case)
    let requestsRemoved = 0;
    for (const [requestId, request] of this.pendingRequests.entries()) {
      if (now - request.createdAt > 600000) { // 10 minutes
        clearTimeout(request.timeoutHandle);
        this.pendingRequests.delete(requestId);
        requestsRemoved++;
      }
    }
    
    if (requestsRemoved > 0) {
      log.warn(`Cleaned up ${requestsRemoved} stale pending request(s)`);
    }
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      activeConversations: this.conversations.size,
      pendingRequests: this.pendingRequests.size,
    };
  }
}
```

**Key behaviors:**
- Automatic conversation history trimming (prevent memory bloat)
- Request tracking with timeout
- Stale data cleanup
- Promise-based request/response handling

### 3. chatterAgent.js (Main Agent Logic)

This is the heart of Chatter. It orchestrates everything.

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';
import { createLogger } from '../services/logger.js';
import * as redis from '../services/redis.js';
import { logMessage, logActivity } from '../services/supabase.js';
import { tools } from './tools.js';
import { ConversationContext } from './context.js';

const log = createLogger('chatter');

/**
 * Initialize Anthropic client
 */
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * System prompt for Chatter
 */
const SYSTEM_PROMPT = `You are Chatter, the orchestration agent for PromptDock - a multi-agent development system.

Your role:
- You are the human user's primary interface
- You coordinate between specialized agents (Planner, Researcher, Frontend Worker, Backend Worker)
- You make the multi-agent system feel like a single, intelligent assistant
- You handle complexity so the user doesn't have to

Available agents:
- **Planner**: Strategic planning, task breakdown, coordination between agents
- **Researcher**: Code analysis, conflict detection, integration validation, pattern recognition
- **Frontend Worker**: Implements frontend tasks via Claude Code (runs on user's machine)
- **Backend Worker**: Implements backend tasks via Claude Code (runs on user's machine)

Workflow principles:
1. For simple questions, answer directly without consulting agents
2. For code analysis questions, consult Researcher first
3. For new features:
   a. Consult Researcher to check what exists
   b. Consult Planner to create implementation plan
   c. If plan approved, assign tasks to workers
4. Always validate with Researcher before assigning implementation tasks
5. Escalate ambiguous decisions to the human (don't guess)

Communication style:
- Be concise and clear
- Show progress naturally: "Let me check with the Researcher...", "The Planner suggests...", etc.
- Synthesize multi-agent responses into coherent answers
- Don't expose internal complexity unless relevant
- Be proactive about potential issues

Error handling:
- If an agent doesn't respond, inform user and suggest alternatives
- If agents disagree, escalate to human for decision
- If a task fails, help the user understand why and what to do next
- Never leave the user hanging - always provide next steps

Important constraints:
- Workers can only handle ONE task at a time
- Tasks can take 5-30 minutes to complete
- Set user expectations about timing
- Don't assign tasks to busy workers

Current date and time: ${new Date().toISOString()}`;

/**
 * Conversation context manager
 */
const context = new ConversationContext();

/**
 * Handle incoming user message
 */
async function handleUserMessage(message) {
  const userId = message.user_id || 'unknown';
  const userContent = message.content;
  
  log.info(`Processing message from user: ${userId}`);
  
  try {
    // Add user message to history
    context.addMessage(userId, 'user', userContent);
    
    // Call Claude API with tools
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: context.getHistory(userId),
      tools: tools,
    });
    
    log.debug(`Claude responded, stop_reason: ${response.stop_reason}`);
    
    // Process tool calls in a loop
    while (response.stop_reason === 'tool_use') {
      // Extract tool uses
      const toolUses = response.content.filter(block => block.type === 'tool_use');
      
      log.info(`Processing ${toolUses.length} tool call(s)`);
      
      // Execute all tool calls
      const toolResults = [];
      
      for (const toolUse of toolUses) {
        log.info(`Executing tool: ${toolUse.name}`);
        
        try {
          const result = await executeToolCall(toolUse);
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
          
          log.debug(`Tool ${toolUse.name} completed successfully`);
          
        } catch (error) {
          log.error(`Tool ${toolUse.name} failed: ${error.message}`);
          
          // Return error as tool result
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              error: error.message,
              suggestion: 'Please try again or check agent status',
            }),
            is_error: true,
          });
        }
      }
      
      // Add assistant's response and tool results to history
      context.addMessage(userId, 'assistant', response.content);
      context.addMessage(userId, 'user', toolResults);
      
      // Continue conversation with tool results
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: context.getHistory(userId),
        tools: tools,
      });
      
      log.debug(`Claude responded after tools, stop_reason: ${response.stop_reason}`);
    }
    
    // Extract final text response
    const textBlocks = response.content.filter(block => block.type === 'text');
    const finalResponse = textBlocks.map(block => block.text).join('\n\n');
    
    // Add to history
    context.addMessage(userId, 'assistant', response.content);
    
    // Publish response to user
    await redis.publish('chatter-output', {
      user_id: userId,
      content: finalResponse,
      timestamp: new Date().toISOString(),
    });
    
    // Log to Supabase
    await logMessage('chatter', 'user', 'response', {
      user_id: userId,
      content: finalResponse,
    });
    
    log.info(`Response published to user: ${userId}`);
    
  } catch (error) {
    log.error(`Error processing message from ${userId}: ${error.message}`);
    
    // Send error message to user
    await redis.publish('chatter-output', {
      user_id: userId,
      content: `I encountered an error: ${error.message}. Please try again.`,
      error: true,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Execute a tool call
 */
async function executeToolCall(toolUse) {
  const { name, input } = toolUse;
  
  switch (name) {
    case 'consult_planner':
      return await consultAgent('planner', input);
    
    case 'consult_researcher':
      return await consultAgent('researcher', input);
    
    case 'assign_task':
      return await assignTask(input);
    
    case 'check_agent_status':
      return await checkStatus(input.agent);
    
    case 'escalate_to_human':
      return formatEscalation(input);
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Consult another agent (Planner or Researcher)
 */
async function consultAgent(agentName, input) {
  const requestId = uuidv4();
  
  log.info(`Consulting ${agentName}, request: ${requestId}`);
  
  // Publish request to agent's channel
  await redis.publish(`agent:${agentName}`, {
    id: requestId,
    from: 'chatter',
    to: agentName,
    type: 'question',
    payload: input,
    timestamp: new Date().toISOString(),
  });
  
  // Log to Supabase
  await logMessage('chatter', agentName, 'question', input);
  
  // Wait for response with timeout
  const timeout = parseInt(process.env.TOOL_CALL_TIMEOUT || '300000', 10);
  
  try {
    const response = await context.trackRequest(requestId, agentName, timeout);
    
    log.info(`Received response from ${agentName}`);
    
    return response;
    
  } catch (error) {
    log.error(`No response from ${agentName}: ${error.message}`);
    
    return {
      error: `Agent ${agentName} did not respond within timeout`,
      suggestion: `Check if ${agentName} agent is running. You can check status with check_agent_status tool.`,
      timeout: true,
    };
  }
}

/**
 * Assign a task to a worker
 */
async function assignTask(input) {
  const { agent, command_file, priority = 'medium', estimated_duration } = input;
  
  const taskId = uuidv4();
  
  log.info(`Assigning task ${taskId} to ${agent} worker`);
  
  // Publish task to worker's channel
  await redis.publish(`agent:${agent}`, {
    id: taskId,
    from: 'chatter',
    to: agent,
    type: 'task',
    payload: {
      command_file,
      priority,
      estimated_duration,
      timeout: 1800000, // 30 minutes
    },
    timestamp: new Date().toISOString(),
  });
  
  // Log to Supabase
  await logMessage('chatter', agent, 'task', { task_id: taskId, command_file });
  
  return {
    success: true,
    task_id: taskId,
    agent,
    message: `Task assigned to ${agent} worker. This will take ${estimated_duration || 'some time'} to complete.`,
    note: 'Worker will execute this task using Claude Code on the local machine.',
  };
}

/**
 * Check agent status
 */
async function checkStatus(agentName) {
  // This is a simplified status check
  // In a full implementation, you'd query a status channel or database
  
  log.info(`Checking status of ${agentName}`);
  
  // For now, return a placeholder response
  // Real implementation would track agent heartbeats
  
  return {
    agent: agentName,
    status: 'unknown',
    message: 'Status checking not fully implemented yet. Assume agents are running if they respond to requests.',
  };
}

/**
 * Format an escalation to human
 */
function formatEscalation(input) {
  const { question, options, context: escalationContext, recommendation } = input;
  
  log.info('Escalating decision to human');
  
  // Format as structured response that will be naturally presented to user
  let formatted = `I need your input on this:\n\n**${question}**\n\n`;
  
  formatted += `Context: ${escalationContext}\n\n`;
  
  if (options && options.length > 0) {
    formatted += `Options:\n`;
    options.forEach((option, idx) => {
      formatted += `${idx + 1}. ${option}\n`;
    });
    formatted += '\n';
  }
  
  if (recommendation) {
    formatted += `My recommendation: ${recommendation}\n\n`;
  }
  
  formatted += 'What would you like to do?';
  
  return {
    escalation: true,
    formatted_question: formatted,
  };
}

/**
 * Subscribe to agent response channels
 */
async function subscribeToResponses() {
  // Subscribe to channels where agents send responses
  const responseChannels = [
    'agent:planner',
    'agent:researcher',
    'agent:frontend',
    'agent:backend',
  ];
  
  for (const channel of responseChannels) {
    await redis.subscribe(channel, async (ch, message) => {
      // Check if this is a response to one of our requests
      if (message.type === 'response' && message.to === 'chatter') {
        const requestId = message.payload?.request_id || message.in_response_to || message.id;
        
        if (requestId) {
          log.info(`Received response for request: ${requestId}`);
          context.fulfillRequest(requestId, message.payload);
        }
      }
    });
  }
  
  log.info('Subscribed to agent response channels');
}

/**
 * Start the Chatter agent
 */
async function start() {
  log.info('Starting Chatter agent...');
  
  try {
    // Verify Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    log.info('Connecting to Redis...');
    const redisClient = redis.getRedisClient();
    await redisClient.ping();
    log.info('✓ Redis connected');
    
    // Subscribe to human input channel
    await redis.subscribe('human-input', handleUserMessage);
    log.info('✓ Subscribed to: human-input');
    
    // Subscribe to agent response channels
    await subscribeToResponses();
    log.info('✓ Subscribed to agent response channels');
    
    // Log startup to Supabase
    await logActivity('chatter', 'info', 'Chatter agent started');
    
    log.info('Chatter agent is ready!');
    log.info('Waiting for user messages...');
    
    // Log stats every minute
    setInterval(() => {
      const stats = context.getStats();
      log.info(`Stats: ${stats.activeConversations} conversations, ${stats.pendingRequests} pending requests`);
    }, 60000);
    
  } catch (error) {
    log.error('Failed to start Chatter agent', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  log.info(`Received ${signal}, shutting down...`);
  
  try {
    // Log shutdown
    await logActivity('chatter', 'info', 'Chatter agent shutting down');
    
    // Close Redis
    await redis.closeAll();
    
    log.info('✓ Chatter agent stopped');
    process.exit(0);
    
  } catch (error) {
    log.error('Error during shutdown', error);
    process.exit(1);
  }
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

// Start the agent
start();
```

**Critical behaviors:**

1. **Message loop:**
   - Receive user message
   - Add to history
   - Call Claude API
   - Process tool calls
   - Continue until no more tools
   - Publish response

2. **Tool execution:**
   - Sequential execution (one at a time)
   - Error handling per tool
   - Timeout per tool
   - Results passed back to Claude

3. **Agent consultation:**
   - Publish request to agent's channel
   - Track with unique ID
   - Wait for response with timeout
   - Handle timeout gracefully

### 4. README.md (Agent Documentation)

```markdown
# Chatter Agent

Conversational orchestrator for PromptDock.

## What Is This?

Chatter is the "face" of PromptDock. When you interact with the dashboard, you're talking to Chatter.

Chatter's job:
1. Understand what you want
2. Figure out which agents can help
3. Ask those agents for help
4. Synthesize their responses
5. Give you a coherent answer

## How It Works

```
You: "Build a login form"
  ↓
Chatter: "Let me check what exists..."
  ↓
Chatter → Researcher: "Do we have auth?"
  ↓
Researcher → Chatter: "No auth exists"
  ↓
Chatter → Planner: "Plan login form"
  ↓
Planner → Chatter: "Here's the plan..."
  ↓
Chatter → Frontend Worker: "Build this form"
  ↓
Chatter → You: "Building your login form. Estimated 20 minutes."
```

## Setup

### Prerequisites

- Command File 1 (Core Infrastructure) already deployed
- Anthropic API key

### Configuration

Add to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
```

### Start Locally

```bash
node src/agents/chatterAgent.js
```

You should see:
```
[INFO] Starting Chatter agent...
[INFO] ✓ Redis connected
[INFO] ✓ Subscribed to: human-input
[INFO] Chatter agent is ready!
```

### Deploy to Render

Add to `render.yaml`:

```yaml
- type: worker
  name: promptdock-chatter
  env: node
  buildCommand: npm install
  startCommand: node src/agents/chatterAgent.js
  envVars:
    - key: ANTHROPIC_API_KEY
      sync: false
    - key: REDIS_URL
      fromService: promptdock-redis
    - key: SUPABASE_URL
      sync: false
    - key: SUPABASE_SERVICE_ROLE_KEY
      sync: false
```

## Testing

### Send Test Message

```bash
redis-cli PUBLISH human-input '{"user_id":"test","content":"Hello"}'
```

Check `chatter-output` channel:
```bash
redis-cli SUBSCRIBE chatter-output
```

Should receive Chatter's response.

### Test Tool Calls

```bash
redis-cli PUBLISH human-input '{"user_id":"test","content":"Check if we have authentication implemented"}'
```

Chatter should:
1. Use `consult_researcher` tool
2. Wait for Researcher response
3. Synthesize answer

## Tools

Chatter has 5 tools:

1. **consult_planner** - Ask Planner for strategic planning
2. **consult_researcher** - Ask Researcher about existing code
3. **assign_task** - Assign implementation task to worker
4. **check_agent_status** - Check if agent is online
5. **escalate_to_human** - Ask user for decision

## Conversation Management

- Keeps last 50 messages per user
- Cleans up stale conversations after 1 hour
- Handles timeouts gracefully
- Never loses context mid-conversation

## Error Handling

- Agent timeout → Inform user, suggest retry
- Tool failure → Explain error, suggest fix
- Network issues → Reconnect automatically
- Claude API error → Return helpful message

## Monitoring

Stats logged every minute:
- Active conversations
- Pending requests
- Tool call success rate

## Troubleshooting

### "No response from agent"

- Check agent is running
- Check Redis connectivity
- Check agent is subscribed to correct channel

### "Claude API error"

- Verify ANTHROPIC_API_KEY is correct
- Check API quota/limits
- Check API status (status.anthropic.com)

### Memory leak

- Conversations cleaned up after 1 hour idle
- History trimmed to 50 messages
- Pending requests cleaned up after 10 minutes

## Next Steps

After Chatter is running:
1. Deploy Command File 4 (Researcher Agent)
2. Test full conversation flow
3. Add Command File 5 (Planner Agent) when ready
```

---

## Deployment Configuration

Update `promptdock/render.yaml` to add Chatter worker:

```yaml
services:
  # ... existing services from Command File 1 ...
  
  - type: worker
    name: promptdock-chatter
    env: node
    buildCommand: npm install
    startCommand: node src/agents/chatterAgent.js
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: REDIS_URL
        fromService: promptdock-redis
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: LOG_LEVEL
        value: info
      - key: MAX_CONVERSATION_HISTORY
        value: "50"
      - key: CONVERSATION_TIMEOUT
        value: "3600000"
      - key: TOOL_CALL_TIMEOUT
        value: "300000"
```

## Testing Steps

### Test 1: Agent Startup

```bash
node src/agents/chatterAgent.js
```

**Pass if:**
- Connects to Redis
- Subscribes to human-input
- Subscribes to agent response channels
- Shows "ready" message

---

### Test 2: Simple Message

```bash
redis-cli PUBLISH human-input '{"user_id":"test","content":"Hello, how are you?"}'
```

**Pass if:**
- Chatter receives message
- Responds without tools (simple greeting)
- Response published to chatter-output

---

### Test 3: Tool Call - Researcher

```bash
redis-cli PUBLISH human-input '{"user_id":"test","content":"Do we have authentication implemented?"}'
```

**Pass if:**
- Chatter calls consult_researcher tool
- Publishes to agent:researcher channel
- Waits for response (will timeout if Researcher not running - that's OK)

---

### Test 4: Multiple Tool Calls

```bash
redis-cli PUBLISH human-input '{"user_id":"test","content":"Build a login form for me"}'
```

**Pass if:**
- Chatter calls multiple tools (Researcher, then Planner)
- Handles responses sequentially
- Synthesizes final answer

---

### Test 5: Conversation Context

```bash
redis-cli PUBLISH human-input '{"user_id":"test","content":"What is 2+2?"}'
# Wait for response
redis-cli PUBLISH human-input '{"user_id":"test","content":"Multiply that by 3"}'
```

**Pass if:**
- Second message references context from first
- Chatter remembers "that" = 4
- Responds with 12

---

### Test 6: Timeout Handling

```bash
# Make sure Researcher is NOT running
redis-cli PUBLISH human-input '{"user_id":"test","content":"Check if we have auth"}'
```

**Pass if:**
- Chatter calls Researcher
- Waits 5 minutes
- Times out gracefully
- Tells user "Researcher did not respond"

---

### Test 7: Error Handling

```bash
# Invalid tool input
redis-cli PUBLISH human-input '{"user_id":"test","content":"Assign task but no command file"}'
```

**Pass if:**
- Chatter handles invalid input
- Doesn't crash
- Returns helpful error message

---

### Test 8: Conversation Cleanup

Start Chatter, send messages, wait 65 minutes.

**Pass if:**
- Old conversations removed from memory
- Chatter still running (no memory leak)

---

## Completion Checklist

- [ ] tools.js created with all 5 tool definitions
- [ ] context.js created with conversation manager
- [ ] chatterAgent.js created with full agent logic
- [ ] README.md created
- [ ] package.json updated with dependencies
- [ ] .env updated with ANTHROPIC_API_KEY
- [ ] All 8 tests pass
- [ ] Agent starts without errors
- [ ] Can receive and process messages
- [ ] Can call tools successfully
- [ ] Handles timeouts gracefully
- [ ] Maintains conversation context
- [ ] Cleans up stale data
- [ ] Logs to Supabase correctly
- [ ] Ready for Render deployment

## Expected Output

**Startup:**
```
[10:30:15] [INFO    ] [chatter] Starting Chatter agent...
[10:30:15] [INFO    ] [chatter] Connecting to Redis...
[10:30:16] [INFO    ] [chatter] ✓ Redis connected
[10:30:16] [INFO    ] [chatter] ✓ Subscribed to: human-input
[10:30:16] [INFO    ] [chatter] ✓ Subscribed to agent response channels
[10:30:16] [INFO    ] [chatter] Chatter agent is ready!
[10:30:16] [INFO    ] [chatter] Waiting for user messages...
```

**Processing Message:**
```
[10:31:45] [INFO    ] [chatter] Processing message from user: test
[10:31:46] [DEBUG   ] [chatter] Claude responded, stop_reason: tool_use
[10:31:46] [INFO    ] [chatter] Processing 1 tool call(s)
[10:31:46] [INFO    ] [chatter] Executing tool: consult_researcher
[10:31:46] [INFO    ] [chatter] Consulting researcher, request: abc-123
[10:31:50] [INFO    ] [chatter] Received response from researcher
[10:31:50] [DEBUG   ] [chatter] Tool consult_researcher completed successfully
[10:31:51] [DEBUG   ] [chatter] Claude responded after tools, stop_reason: end_turn
[10:31:51] [INFO    ] [chatter] Response published to user: test
```

---

**Command File 3 Complete: ~1,450 lines**

Ready for Command File 4 (Researcher Agent) next?
