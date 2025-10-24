# Command File 3: Chatter Agent

## Objective
Build the conversational orchestrator that serves as the user's primary interface. Chatter receives human input, determines which agents to consult, waits for responses, and synthesizes results back to the user. This is deployed on Render as a cloud worker.

## Success Criteria
✅ Subscribes to `human-input` channel on Redis
✅ Uses Claude API to process user messages
✅ Can call Planner, Researcher, Frontend, Backend via tools
✅ Waits for agent responses (with timeout)
✅ Synthesizes multi-agent responses into coherent answer
✅ Maintains conversation context across messages
✅ Handles agent failures gracefully
✅ Publishes responses to `chatter-output` channel
✅ Logs all activity to Supabase
✅ Runs as a persistent worker process

## Tech Stack
- **Runtime**: Node.js 20
- **LLM**: Claude 4.5 Sonnet (via Anthropic SDK)
- **Redis**: ioredis
- **Database**: Supabase
- **Logging**: pino

## Project Structure
```
promptdock/src/agents/
├── chatterAgent.js      # Main agent logic
├── tools.js             # Tool definitions for Claude
├── context.js           # Conversation context manager
└── README.md
```

## Implementation Requirements

### 1. Chatter Agent (`src/agents/chatterAgent.js`)
```javascript
// Core Responsibilities:
// 1. Subscribe to 'human-input' channel
// 2. Process each user message with Claude API
// 3. Execute tool calls (consult other agents)
// 4. Wait for responses and pass back to Claude
// 5. Publish final response to 'chatter-output'
// 6. Maintain conversation history
// 7. Handle errors and timeouts

// Message Flow:
// User → human-input → Chatter → Claude API → Tool Call →
// Redis Publish → Wait for Response → Tool Result → Claude API →
// Final Response → chatter-output → User

// State Management:
// - Keep conversation history in memory (last 50 messages)
// - Track pending tool calls (agent request IDs)
// - Timeout pending calls after 5 minutes
// - Clean up stale conversations after 1 hour idle
```

### 2. Tool Definitions (`src/agents/tools.js`)
```javascript
// Claude API tool definitions:

const tools = [
  {
    name: "consult_planner",
    description: "Ask the Planner agent to create a project plan, break down tasks, or coordinate work between agents. Use this when you need strategic planning or task delegation.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question or request for the Planner"
        },
        context: {
          type: "object",
          description: "Any relevant context (user's previous messages, project state, etc.)"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level for this request"
        }
      },
      required: ["question"]
    }
  },
  {
    name: "consult_researcher",
    description: "Ask the Researcher agent to analyze existing code, check for conflicts, or validate integration points. Use this when you need to understand what already exists in the codebase.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "What to research or analyze"
        },
        repos: {
          type: "array",
          items: { type: "string", enum: ["frontend", "backend", "both"] },
          description: "Which repositories to analyze"
        },
        focus_areas: {
          type: "array",
          items: { type: "string" },
          description: "Specific areas to focus on (e.g., 'auth patterns', 'database schema', 'API routes')"
        }
      },
      required: ["question", "repos"]
    }
  },
  {
    name: "assign_task",
    description: "Assign a specific implementation task to Frontend or Backend worker. Only use this after Planner has approved the task and Researcher has validated there are no conflicts.",
    input_schema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: ["frontend", "backend"],
          description: "Which worker to assign the task to"
        },
        command_file: {
          type: "string",
          description: "The complete command file content in markdown format"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"]
        }
      },
      required: ["agent", "command_file"]
    }
  },
  {
    name: "check_agent_status",
    description: "Check if an agent is online and what it's currently working on",
    input_schema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent name (e.g., 'frontend', 'backend', 'planner')"
        }
      },
      required: ["agent"]
    }
  },
  {
    name: "escalate_to_human",
    description: "When there's ambiguity, conflict, or a decision that requires human judgment, use this to ask the user directly",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question for the human"
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Possible options or paths forward"
        },
        context: {
          type: "string",
          description: "Why this requires human input"
        }
      },
      required: ["question", "context"]
    }
  }
];
```

### 3. Context Manager (`src/agents/context.js`)
```javascript
// Manages conversation state across messages

class ConversationContext {
  constructor() {
    this.conversations = new Map(); // userId -> conversation history
    this.pendingRequests = new Map(); // requestId -> {agent, timeout, resolve, reject}
  }

  // Add message to user's conversation history
  addMessage(userId, role, content) {
    // Keep last 50 messages
    // Format for Claude API
  }

  // Get conversation history for Claude API
  getHistory(userId) {
    // Return messages in Claude API format
  }

  // Track a request to another agent
  trackRequest(requestId, agent, timeout = 300000) {
    // Return promise that resolves when response arrives
    // Reject if timeout exceeded
  }

  // Fulfill a tracked request
  fulfillRequest(requestId, response) {
    // Resolve the pending promise
  }

  // Clean up stale conversations
  cleanup() {
    // Remove conversations idle > 1 hour
    // Cancel timed-out requests
  }
}
```

### 4. System Prompt
```javascript
const SYSTEM_PROMPT = `You are Chatter, the orchestration agent for PromptDock - a multi-agent development system.

Your role:
- You are the human user's primary interface
- You coordinate between specialized agents (Planner, Researcher, Frontend, Backend workers)
- You make the multi-agent system feel like a single, intelligent assistant
- You handle complexity so the user doesn't have to

Available agents:
- **Planner**: Strategic planning, task breakdown, coordination
- **Researcher**: Code analysis, conflict detection, integration validation
- **Frontend Worker**: Implements frontend tasks via Claude Code
- **Backend Worker**: Implements backend tasks via Claude Code

Workflow principles:
1. For simple questions, answer directly
2. For code analysis, consult Researcher first
3. For new features, consult Planner → Researcher → assign tasks
4. Always validate before assigning implementation tasks
5. Escalate ambiguous decisions to the human

Communication style:
- Concise and clear
- Show progress: "Consulting with Planner...", "Researcher found...", etc.
- Synthesize multi-agent responses naturally
- Don't expose internal complexity unless relevant
- Be proactive about potential issues

Error handling:
- If an agent doesn't respond, inform user and suggest alternatives
- If agents disagree, escalate to human
- If a task fails, work with the user to debug

Current timestamp: ${new Date().toISOString()}`;
```

### 5. Main Agent Loop
```javascript
// Pseudocode structure:

async function handleUserMessage(message) {
  const userId = message.user_id;
  
  // 1. Add to conversation history
  context.addMessage(userId, 'user', message.content);
  
  // 2. Call Claude API with tools
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: context.getHistory(userId),
    tools: tools
  });
  
  // 3. Process tool calls
  while (response.stop_reason === 'tool_use') {
    const toolResults = [];
    
    for (const toolUse of response.content.filter(c => c.type === 'tool_use')) {
      const result = await executeToolCall(toolUse);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result
      });
    }
    
    // 4. Continue conversation with tool results
    context.addMessage(userId, 'assistant', response.content);
    context.addMessage(userId, 'user', toolResults);
    
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: context.getHistory(userId),
      tools: tools
    });
  }
  
  // 5. Publish final response
  await redis.publish('chatter-output', {
    user_id: userId,
    content: response.content[0].text,
    timestamp: new Date().toISOString()
  });
  
  // 6. Log to Supabase
  await supabase.from('messages').insert({
    from_agent: 'chatter',
    to_agent: 'user',
    type: 'response',
    payload: { content: response.content[0].text }
  });
}

async function executeToolCall(toolUse) {
  switch (toolUse.name) {
    case 'consult_planner':
      return await consultAgent('planner', toolUse.input);
    
    case 'consult_researcher':
      return await consultAgent('researcher', toolUse.input);
    
    case 'assign_task':
      return await assignTask(toolUse.input);
    
    case 'check_agent_status':
      return await checkStatus(toolUse.input.agent);
    
    case 'escalate_to_human':
      // This is special - returns immediately with formatted question
      return formatEscalation(toolUse.input);
  }
}

async function consultAgent(agentName, input) {
  const requestId = generateUUID();
  
  // Publish request to agent's channel
  await redis.publish(`agent:${agentName}`, {
    id: requestId,
    from: 'chatter',
    to: agentName,
    type: 'question',
    payload: input,
    timestamp: new Date().toISOString()
  });
  
  // Wait for response (max 5 minutes)
  try {
    const response = await context.trackRequest(requestId, agentName, 300000);
    return JSON.stringify(response);
  } catch (error) {
    return JSON.stringify({
      error: `${agentName} did not respond within timeout`,
      suggestion: 'Try again or check agent status'
    });
  }
}
```

## Message Formats

### Incoming (from user via WebSocket)
```json
{
  "user_id": "user-123",
  "content": "Build an authentication system with JWT tokens",
  "timestamp": "2025-10-23T10:30:00Z"
}
```

### Outgoing (to user)
```json
{
  "user_id": "user-123",
  "content": "I'll help you build that. Let me consult with the Planner...\n\n[After consulting]\n\nThe Planner suggests...",
  "timestamp": "2025-10-23T10:30:15Z",
  "status": "complete"
}
```

### Agent Consultation
```json
{
  "id": "req-abc-123",
  "from": "chatter",
  "to": "researcher",
  "type": "question",
  "payload": {
    "question": "Do we already have auth implemented?",
    "repos": ["backend", "frontend"],
    "focus_areas": ["auth patterns", "JWT handling"]
  },
  "timestamp": "2025-10-23T10:30:00Z"
}
```

### Agent Response
```json
{
  "id": "resp-def-456",
  "from": "researcher",
  "to": "chatter",
  "type": "response",
  "payload": {
    "request_id": "req-abc-123",
    "findings": {
      "backend": "No auth system found. Routes are unprotected.",
      "frontend": "No AuthContext or login components exist."
    },
    "recommendation": "Safe to implement from scratch"
  },
  "timestamp": "2025-10-23T10:30:10Z"
}
```

## Testing Steps

### 1. Agent Startup Test
```bash
node src/agents/chatterAgent.js
# Should see:
# [INFO] Chatter agent starting...
# [INFO] Connected to Redis
# [INFO] Subscribed to: human-input
# [INFO] Chatter ready
```

### 2. Simple Message Test
```bash
# Publish test message:
redis-cli PUBLISH human-input '{"user_id":"test","content":"Hello"}'

# Should see Chatter:
# [INFO] Received message from user: test
# [INFO] Calling Claude API...
# [INFO] Publishing response...

# Check chatter-output channel for response
```

### 3. Tool Call Test
```bash
# Send message that requires planning:
redis-cli PUBLISH human-input '{"user_id":"test","content":"Plan a user authentication system"}'

# Should see:
# [INFO] Claude requested tool: consult_planner
# [INFO] Publishing to agent:planner channel
# [INFO] Waiting for planner response...
# [INFO] Received response from planner
# [INFO] Continuing conversation with tool result
# [INFO] Publishing final response
```

### 4. Timeout Test
```bash
# Consult an offline agent:
redis-cli PUBLISH human-input '{"user_id":"test","content":"Check with backend worker"}'

# If backend is offline, should see:
# [WARN] No response from backend within timeout
# [INFO] Informing user of timeout
```

### 5. Multi-Turn Conversation Test
```bash
# Send multiple related messages:
redis-cli PUBLISH human-input '{"user_id":"test","content":"Build auth"}'
# Wait for response
redis-cli PUBLISH human-input '{"user_id":"test","content":"Use JWT tokens"}'
# Should maintain context from previous message
```

### 6. Error Handling Test
```bash
# Send malformed message:
redis-cli PUBLISH human-input 'invalid json'

# Should see:
# [ERROR] Failed to parse message
# [INFO] Continuing normally (did not crash)
```

### 7. Memory Leak Test
```bash
# Send 100 messages
for i in {1..100}; do
  redis-cli PUBLISH human-input "{\"user_id\":\"test\",\"content\":\"Message $i\"}"
  sleep 0.1
done

# Check memory usage - should not grow unbounded
# Old conversations should be cleaned up
```

## What NOT to Build
❌ No user authentication (trust Redis messages)
❌ No message persistence beyond Supabase logs
❌ No message queue (process messages as they arrive)
❌ No rate limiting
❌ No conversation export functionality
❌ No multi-user session management (yet)

## Environment Variables
```bash
# Claude API
ANTHROPIC_API_KEY=sk-ant-xxx

# Redis
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Agent Config
AGENT_NAME=chatter
LOG_LEVEL=info
CONVERSATION_TIMEOUT=3600000
TOOL_CALL_TIMEOUT=300000
```

## Dependencies
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "ioredis": "^5.3.2",
    "@supabase/supabase-js": "^2.39.0",
    "dotenv": "^16.4.0",
    "uuid": "^9.0.0",
    "pino": "^8.17.0"
  }
}
```

## Deployment (Render)

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

## Completion Checklist
- [ ] chatterAgent.js implements full message loop
- [ ] All 5 tools defined and working
- [ ] Context manager maintains conversation history
- [ ] System prompt is clear and comprehensive
- [ ] Agent startup successful
- [ ] Simple messages get responses
- [ ] Tool calls work (consult other agents)
- [ ] Timeout handling works
- [ ] Multi-turn conversations maintain context
- [ ] Error handling prevents crashes
- [ ] Memory doesn't grow unbounded
- [ ] Logs all activity to Supabase
- [ ] Ready for Render deployment

## Estimated Time
**4-5 hours** of Claude Code execution time

## Next Steps
After Chatter is working, build Command File 4 (Researcher Agent) which will analyze your existing code and prevent conflicts.
