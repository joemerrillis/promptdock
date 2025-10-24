# Command File 5: Archivist Agent (Phase 2)

## Objective
Build the institutional memory agent that records decisions, tracks outcomes, extracts learnings, and surfaces relevant historical context to other agents. The Archivist prevents the system from repeating mistakes and helps it learn successful patterns over time. This agent turns PromptDock from a coordination system into a learning organization.

## IMPORTANT: Phase 2 Implementation
⚠️ **Do NOT build this until the 4-agent MVP (Command Files 1-4) is working.** The Archivist needs:
- A functioning multi-agent system to observe
- Real decisions and outcomes to record
- Time to understand what patterns are worth capturing

Build this AFTER you've used the 4-agent system for at least 2 weeks and understand what institutional knowledge would be valuable.

## Success Criteria
✅ Subscribes to `agent:archivist` channel on Redis
✅ Listens to ALL agent channels (observes system-wide activity)
✅ Records decisions made by Planner
✅ Tracks outcomes of implemented tasks
✅ Extracts reusable patterns from successful implementations
✅ Records failures and anti-patterns
✅ Performs semantic search over historical decisions
✅ Surfaces relevant memories to Planner when queried
✅ Uses pgvector for embedding-based search
✅ Maintains timeline of events for each project
✅ Generates "learning reports" periodically

## Tech Stack
- **Runtime**: Node.js 20
- **LLM**: Claude 4.5 Sonnet (for pattern extraction)
- **Database**: Supabase (postgres with pgvector extension)
- **Redis**: ioredis (for message observation)
- **Embeddings**: OpenAI text-embedding-3-small (cheap, effective)
- **Vector Search**: pgvector (built into Supabase)

## Project Structure
```
promptdock/src/agents/
├── archivistAgent.js    # Main agent logic
├── memory/
│   ├── recorder.js      # Record decisions/outcomes/events
│   ├── extractor.js     # Extract patterns from implementations
│   ├── searcher.js      # Semantic search over memories
│   ├── embeddings.js    # Generate embeddings for search
│   └── summarizer.js    # Generate periodic learning reports
└── README.md
```

## Supabase Schema Extension

Add pgvector extension and new tables:
```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Decisions table: Records high-level architectural/implementation decisions
create table decisions (
  id uuid primary key default gen_random_uuid(),
  project text not null,
  question text not null,
  options_considered jsonb not null, -- Array of options with pros/cons
  chosen text not null,
  rationale text not null,
  decided_by text not null, -- Which agent made the decision
  context jsonb, -- Relevant context at time of decision
  metadata jsonb, -- Any additional data
  created_at timestamptz default now(),
  embedding vector(1536) -- OpenAI text-embedding-3-small dimension
);

-- Outcomes table: Records results of decisions/implementations
create table outcomes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references decisions(id),
  task_id text, -- Reference to the task that was executed
  status text not null, -- 'success', 'failure', 'partial', 'abandoned'
  duration_ms integer,
  issues_encountered jsonb, -- Array of issues that came up
  resolutions jsonb, -- How issues were resolved
  final_assessment text, -- Overall outcome description
  metrics jsonb, -- Any measurable outcomes (performance, LOC, etc.)
  created_at timestamptz default now()
);

-- Learnings table: Extracted reusable patterns
create table learnings (
  id uuid primary key default gen_random_uuid(),
  pattern_name text not null,
  category text, -- 'architecture', 'implementation', 'debugging', 'integration'
  context text not null, -- When/where this pattern applies
  what_worked jsonb not null, -- Array of approaches that worked
  what_didnt_work jsonb, -- Array of approaches that failed
  recommendations jsonb not null, -- Actionable recommendations
  code_examples jsonb, -- Optional code snippets
  related_decisions uuid[], -- Links to relevant decisions
  confidence text default 'medium', -- 'low', 'medium', 'high', 'very_high'
  times_referenced integer default 0,
  last_referenced timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  embedding vector(1536)
);

-- Failures table: Anti-patterns to avoid
create table failures (
  id uuid primary key default gen_random_uuid(),
  attempted text not null,
  context text, -- What were we trying to accomplish
  why_failed text not null,
  symptoms jsonb, -- How the failure manifested (errors, bugs, etc.)
  cost_hours numeric, -- How much time was wasted
  lesson text not null,
  alternatives_tried jsonb, -- What else we tried before giving up
  final_solution text, -- What actually worked
  dont_repeat boolean default true,
  severity text default 'medium', -- 'low', 'medium', 'high', 'critical'
  created_at timestamptz default now(),
  embedding vector(1536)
);

-- Events table: Detailed timeline of everything that happens
create table events (
  id uuid primary key default gen_random_uuid(),
  project text,
  decision_id uuid references decisions(id),
  task_id text,
  event_type text not null, -- 'decision', 'error', 'pivot', 'breakthrough', 'question', 'resolution', 'deployment'
  agent text, -- Which agent generated this event
  description text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Projects table: Track projects and their metadata
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  tech_stack jsonb, -- Technologies used
  repositories jsonb, -- Links to frontend/backend repos
  started_at timestamptz default now(),
  last_activity timestamptz default now(),
  status text default 'active' -- 'active', 'paused', 'completed', 'archived'
);

-- Indexes for performance
create index decisions_project_idx on decisions(project);
create index decisions_created_at_idx on decisions(created_at desc);
create index outcomes_decision_id_idx on outcomes(decision_id);
create index outcomes_status_idx on outcomes(status);
create index learnings_category_idx on learnings(category);
create index learnings_confidence_idx on learnings(confidence);
create index learnings_times_referenced_idx on learnings(times_referenced desc);
create index failures_severity_idx on failures(severity);
create index events_project_idx on events(project);
create index events_decision_id_idx on events(decision_id);
create index events_created_at_idx on events(created_at desc);
create index projects_name_idx on projects(name);

-- Vector similarity search indexes (HNSW for fast approximate search)
create index decisions_embedding_idx on decisions 
  using hnsw (embedding vector_cosine_ops) 
  with (m = 16, ef_construction = 64);

create index learnings_embedding_idx on learnings 
  using hnsw (embedding vector_cosine_ops) 
  with (m = 16, ef_construction = 64);

create index failures_embedding_idx on failures 
  using hnsw (embedding vector_cosine_ops) 
  with (m = 16, ef_construction = 64);

-- Helper function: Search decisions by semantic similarity
create or replace function search_decisions(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5,
  filter_project text default null
)
returns table (
  id uuid,
  project text,
  question text,
  chosen text,
  rationale text,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    d.id,
    d.project,
    d.question,
    d.chosen,
    d.rationale,
    d.created_at,
    1 - (d.embedding <=> query_embedding) as similarity
  from decisions d
  where 
    (filter_project is null or d.project = filter_project)
    and 1 - (d.embedding <=> query_embedding) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Helper function: Search learnings by semantic similarity
create or replace function search_learnings(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5,
  min_confidence text default 'low'
)
returns table (
  id uuid,
  pattern_name text,
  context text,
  recommendations jsonb,
  confidence text,
  times_referenced integer,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    l.id,
    l.pattern_name,
    l.context,
    l.recommendations,
    l.confidence,
    l.times_referenced,
    1 - (l.embedding <=> query_embedding) as similarity
  from learnings l
  where 
    1 - (l.embedding <=> query_embedding) > match_threshold
    and (
      (min_confidence = 'low') or
      (min_confidence = 'medium' and l.confidence in ('medium', 'high', 'very_high')) or
      (min_confidence = 'high' and l.confidence in ('high', 'very_high')) or
      (min_confidence = 'very_high' and l.confidence = 'very_high')
    )
  order by l.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Helper function: Search failures by semantic similarity
create or replace function search_failures(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  attempted text,
  why_failed text,
  lesson text,
  final_solution text,
  severity text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    f.id,
    f.attempted,
    f.why_failed,
    f.lesson,
    f.final_solution,
    f.severity,
    1 - (f.embedding <=> query_embedding) as similarity
  from failures f
  where 
    1 - (f.embedding <=> query_embedding) > match_threshold
    and f.dont_repeat = true
  order by f.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Helper function: Get project timeline
create or replace function get_project_timeline(
  project_name text,
  limit_count int default 50
)
returns table (
  event_id uuid,
  event_type text,
  agent text,
  description text,
  created_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    e.id,
    e.event_type,
    e.agent,
    e.description,
    e.created_at
  from events e
  where e.project = project_name
  order by e.created_at desc
  limit limit_count;
end;
$$;
```

## Implementation Requirements

### 1. Main Agent (`src/agents/archivistAgent.js`)
```javascript
// Core Responsibilities:
// 1. Subscribe to ALL agent channels (observe system-wide)
// 2. Subscribe to 'agent:archivist' for direct queries
// 3. Passively record decisions, events, outcomes
// 4. Actively respond to memory search queries
// 5. Periodically extract patterns from recent activity
// 6. Generate learning reports

// Observation Channels:
// - agent:planner (decisions being made)
// - agent:researcher (analysis results)
// - agent:frontend (task outcomes)
// - agent:backend (task outcomes)
// - agent:chatter (user interactions)
// - system (status updates, errors)

// Active Response:
// - When queried by Planner: "Search for similar decisions"
// - Returns: Relevant memories with context

// Background Jobs:
// - Every 1 hour: Extract patterns from recent completions
// - Every 24 hours: Generate learning report
// - Every 7 days: Update learning confidence scores
```

### 2. Recorder (`src/agents/memory/recorder.js`)
```javascript
// Functions for recording different types of memories

async function recordDecision(decision) {
  // 1. Validate decision structure
  // 2. Generate embedding from question + rationale
  // 3. Insert into decisions table
  // 4. Record event
  // 5. Return decision ID
  
  const embedding = await generateEmbedding(
    `${decision.question} ${decision.rationale} ${decision.chosen}`
  );
  
  const { data, error } = await supabase
    .from('decisions')
    .insert({
      project: decision.project,
      question: decision.question,
      options_considered: decision.options,
      chosen: decision.chosen,
      rationale: decision.rationale,
      decided_by: decision.agent,
      context: decision.context,
      embedding: embedding
    })
    .select()
    .single();
    
  await recordEvent({
    project: decision.project,
    decision_id: data.id,
    event_type: 'decision',
    agent: decision.agent,
    description: `Decided: ${decision.chosen}`
  });
  
  return data.id;
}

async function recordOutcome(outcome) {
  // 1. Validate outcome structure
  // 2. Insert into outcomes table
  // 3. Record event
  // 4. If failure, consider creating failure record
  
  await supabase.from('outcomes').insert({
    decision_id: outcome.decision_id,
    task_id: outcome.task_id,
    status: outcome.status,
    duration_ms: outcome.duration_ms,
    issues_encountered: outcome.issues,
    resolutions: outcome.resolutions,
    final_assessment: outcome.assessment,
    metrics: outcome.metrics
  });
  
  await recordEvent({
    project: outcome.project,
    decision_id: outcome.decision_id,
    task_id: outcome.task_id,
    event_type: outcome.status === 'success' ? 'breakthrough' : 'error',
    agent: outcome.agent,
    description: outcome.assessment
  });
  
  // If failed, extract failure pattern
  if (outcome.status === 'failure') {
    await extractFailurePattern(outcome);
  }
}

async function recordEvent(event) {
  // Simple event recording
  await supabase.from('events').insert({
    project: event.project,
    decision_id: event.decision_id,
    task_id: event.task_id,
    event_type: event.event_type,
    agent: event.agent,
    description: event.description,
    metadata: event.metadata
  });
}

async function recordLearning(learning) {
  // 1. Validate learning structure
  // 2. Generate embedding
  // 3. Check if similar learning exists (avoid duplicates)
  // 4. Insert or update
  
  const embedding = await generateEmbedding(
    `${learning.pattern_name} ${learning.context} ${JSON.stringify(learning.recommendations)}`
  );
  
  // Check for existing similar learning
  const existing = await searchSimilarLearnings(embedding, 0.95, 1);
  
  if (existing.length > 0) {
    // Update existing learning instead of creating duplicate
    await supabase
      .from('learnings')
      .update({
        what_worked: [...existing[0].what_worked, ...learning.what_worked],
        recommendations: [...existing[0].recommendations, ...learning.recommendations],
        times_referenced: existing[0].times_referenced + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing[0].id);
  } else {
    // Create new learning
    await supabase.from('learnings').insert({
      pattern_name: learning.pattern_name,
      category: learning.category,
      context: learning.context,
      what_worked: learning.what_worked,
      what_didnt_work: learning.what_didnt_work,
      recommendations: learning.recommendations,
      code_examples: learning.code_examples,
      related_decisions: learning.related_decisions,
      confidence: learning.confidence,
      embedding: embedding
    });
  }
}

async function recordFailure(failure) {
  // 1. Validate failure structure
  // 2. Generate embedding
  // 3. Insert into failures table
  // 4. Log as high-severity event
  
  const embedding = await generateEmbedding(
    `${failure.attempted} ${failure.why_failed} ${failure.lesson}`
  );
  
  await supabase.from('failures').insert({
    attempted: failure.attempted,
    context: failure.context,
    why_failed: failure.why_failed,
    symptoms: failure.symptoms,
    cost_hours: failure.cost_hours,
    lesson: failure.lesson,
    alternatives_tried: failure.alternatives_tried,
    final_solution: failure.final_solution,
    severity: failure.severity,
    embedding: embedding
  });
  
  await recordEvent({
    project: failure.project,
    event_type: 'error',
    agent: 'archivist',
    description: `Failure recorded: ${failure.attempted}`,
    metadata: { severity: failure.severity }
  });
}
```

### 3. Extractor (`src/agents/memory/extractor.js`)
```javascript
// Pattern extraction using Claude API

const EXTRACTION_PROMPT = `You are analyzing a completed task to extract reusable patterns.

Given:
- The decision that was made
- The implementation details
- The outcome (success/failure)
- Issues encountered and resolutions

Extract:
1. What pattern or approach was used?
2. What worked well?
3. What didn't work or caused issues?
4. Specific recommendations for future similar tasks
5. Any code snippets worth preserving

Be specific and actionable. Focus on insights that would help make better decisions next time.`;

async function extractPatternFromTask(taskId) {
  // 1. Gather all related data (decision, outcome, events)
  // 2. Send to Claude for pattern extraction
  // 3. Parse Claude's response
  // 4. Record as learning
  
  const taskData = await gatherTaskData(taskId);
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: EXTRACTION_PROMPT,
    messages: [{
      role: 'user',
      content: `Analyze this completed task and extract learnings:

**Decision:**
${JSON.stringify(taskData.decision, null, 2)}

**Implementation Events:**
${taskData.events.map(e => `- ${e.description}`).join('\n')}

**Outcome:**
Status: ${taskData.outcome.status}
Duration: ${taskData.outcome.duration_ms}ms
Assessment: ${taskData.outcome.final_assessment}

**Issues & Resolutions:**
${JSON.stringify(taskData.outcome.issues_encountered, null, 2)}
${JSON.stringify(taskData.outcome.resolutions, null, 2)}

Extract a reusable pattern in JSON format:
{
  "pattern_name": "...",
  "category": "architecture|implementation|debugging|integration",
  "context": "when to use this pattern",
  "what_worked": ["..."],
  "what_didnt_work": ["..."],
  "recommendations": ["..."],
  "confidence": "low|medium|high"
}`
    }]
  });
  
  const learning = JSON.parse(response.content[0].text);
  await recordLearning({
    ...learning,
    related_decisions: [taskData.decision.id]
  });
}

async function extractFailurePattern(outcome) {
  // Similar to extractPatternFromTask but focused on what NOT to do
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: 'Extract an anti-pattern from this failed attempt.',
    messages: [{
      role: 'user',
      content: `This approach failed. Extract what we should avoid:

**What was attempted:**
${outcome.assessment}

**Issues:**
${JSON.stringify(outcome.issues_encountered, null, 2)}

**Time wasted:**
${outcome.duration_ms / 1000 / 60} minutes

Respond in JSON:
{
  "attempted": "what we tried",
  "why_failed": "root cause",
  "lesson": "what to do instead",
  "severity": "low|medium|high|critical"
}`
    }]
  });
  
  const failure = JSON.parse(response.content[0].text);
  await recordFailure({
    ...failure,
    project: outcome.project,
    cost_hours: outcome.duration_ms / 1000 / 60 / 60
  });
}

async function gatherTaskData(taskId) {
  // Collect all relevant data for a task
  // - Decision
  // - Outcome
  // - Events
  // Returns consolidated object for analysis
}
```

### 4. Searcher (`src/agents/memory/searcher.js`)
```javascript
// Semantic search over memories

async function searchRelevantMemories(query, options = {}) {
  // 1. Generate embedding for query
  // 2. Search decisions, learnings, failures in parallel
  // 3. Combine and rank results
  // 4. Return formatted context
  
  const {
    project = null,
    includeDecisions = true,
    includeLearnings = true,
    includeFailures = true,
    matchThreshold = 0.7,
    maxResults = 10
  } = options;
  
  const queryEmbedding = await generateEmbedding(query);
  
  const results = await Promise.all([
    includeDecisions ? searchDecisions(queryEmbedding, project, matchThreshold, maxResults) : [],
    includeLearnings ? searchLearnings(queryEmbedding, matchThreshold, maxResults) : [],
    includeFailures ? searchFailures(queryEmbedding, matchThreshold, maxResults) : []
  ]);
  
  return formatSearchResults({
    decisions: results[0],
    learnings: results[1],
    failures: results[2],
    query: query
  });
}

async function searchDecisions(embedding, project, threshold, limit) {
  const { data } = await supabase.rpc('search_decisions', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
    filter_project: project
  });
  
  return data || [];
}

async function searchLearnings(embedding, threshold, limit) {
  const { data } = await supabase.rpc('search_learnings', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
    min_confidence: 'medium'
  });
  
  // Increment reference count for returned learnings
  if (data && data.length > 0) {
    await Promise.all(data.map(learning => 
      supabase
        .from('learnings')
        .update({
          times_referenced: learning.times_referenced + 1,
          last_referenced: new Date().toISOString()
        })
        .eq('id', learning.id)
    ));
  }
  
  return data || [];
}

async function searchFailures(embedding, threshold, limit) {
  const { data } = await supabase.rpc('search_failures', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit
  });
  
  return data || [];
}

function formatSearchResults(results) {
  // Format search results for consumption by other agents
  
  let formatted = `# Relevant Historical Context\n\n`;
  
  if (results.decisions.length > 0) {
    formatted += `## Past Decisions\n`;
    results.decisions.forEach(d => {
      formatted += `### ${d.question}\n`;
      formatted += `**Chosen:** ${d.chosen}\n`;
      formatted += `**Rationale:** ${d.rationale}\n`;
      formatted += `**When:** ${d.created_at}\n`;
      formatted += `**Similarity:** ${(d.similarity * 100).toFixed(1)}%\n\n`;
    });
  }
  
  if (results.learnings.length > 0) {
    formatted += `## Learned Patterns\n`;
    results.learnings.forEach(l => {
      formatted += `### ${l.pattern_name}\n`;
      formatted += `**Context:** ${l.context}\n`;
      formatted += `**Recommendations:**\n`;
      l.recommendations.forEach(r => formatted += `- ${r}\n`);
      formatted += `**Confidence:** ${l.confidence} (referenced ${l.times_referenced} times)\n`;
      formatted += `**Similarity:** ${(l.similarity * 100).toFixed(1)}%\n\n`;
    });
  }
  
  if (results.failures.length > 0) {
    formatted += `## ⚠️ Known Failures to Avoid\n`;
    results.failures.forEach(f => {
      formatted += `### ❌ ${f.attempted}\n`;
      formatted += `**Why it failed:** ${f.why_failed}\n`;
      formatted += `**Lesson:** ${f.lesson}\n`;
      if (f.final_solution) {
        formatted += `**What worked instead:** ${f.final_solution}\n`;
      }
      formatted += `**Severity:** ${f.severity}\n`;
      formatted += `**Similarity:** ${(f.similarity * 100).toFixed(1)}%\n\n`;
    });
  }
  
  return formatted;
}
```

### 5. Embeddings (`src/agents/memory/embeddings.js`)
```javascript
// Generate embeddings using OpenAI API

import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateEmbedding(text) {
  // Use text-embedding-3-small (cheap and effective)
  // Dimension: 1536
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float'
  });
  
  return response.data[0].embedding;
}

async function batchGenerateEmbeddings(texts) {
  // Generate multiple embeddings efficiently
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    encoding_format: 'float'
  });
  
  return response.data.map(d => d.embedding);
}

// Cost estimation:
// text-embedding-3-small: $0.02 per 1M tokens
// Average decision/learning: ~200 tokens
// 1000 memories: ~$0.004
// Very cheap!
```

### 6. Summarizer (`src/agents/memory/summarizer.js`)
```javascript
// Generate periodic learning reports

async function generateLearningReport(period = 'week') {
  // 1. Gather recent activity
  // 2. Identify trends
  // 3. Highlight most referenced patterns
  // 4. Flag recurring issues
  // 5. Generate summary with Claude
  
  const since = getPeriodStart(period); // 'day', 'week', 'month'
  
  const recentActivity = await Promise.all([
    getRecentDecisions(since),
    getRecentOutcomes(since),
    getTopLearnings(10),
    getRecentFailures(since)
  ]);
  
  const report = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: 'You are generating a learning report for a development team.',
    messages: [{
      role: 'user',
      content: `Generate a learning report from this data:

**Decisions Made (last ${period}):**
${JSON.stringify(recentActivity[0], null, 2)}

**Task Outcomes:**
${JSON.stringify(recentActivity[1], null, 2)}

**Most Referenced Patterns:**
${JSON.stringify(recentActivity[2], null, 2)}

**Recent Failures:**
${JSON.stringify(recentActivity[3], null, 2)}

Create a concise report with:
1. Key decisions and their rationale
2. Success rate and common issues
3. Most valuable patterns learned
4. Failures to avoid
5. Recommendations for improvement`
    }]
  });
  
  return report.content[0].text;
}
```

## Archivist's Tools (For Integration)
```javascript
const ARCHIVIST_TOOLS = [
  {
    name: "search_memories",
    description: "Search for relevant past decisions, learnings, or failures. Use this before making new decisions.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for (e.g., 'authentication approaches', 'API integration patterns')"
        },
        project: {
          type: "string",
          description: "Optional: limit search to specific project"
        },
        include_failures: {
          type: "boolean",
          default: true,
          description: "Whether to include known failures/anti-patterns"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "record_decision",
    description: "Record a decision being made for future reference",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        question: { type: "string" },
        options: {
          type: "array",
          items: { type: "string" }
        },
        chosen: { type: "string" },
        rationale: { type: "string" }
      },
      required: ["project", "question", "chosen", "rationale"]
    }
  },
  {
    name: "get_project_timeline",
    description: "Get a timeline of events for a project",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string" },
        limit: {
          type: "number",
          default: 50
        }
      },
      required: ["project"]
    }
  }
];
```

## Message Observation Setup
```javascript
// Archivist passively observes all agent channels

async function startObserving() {
  const channels = [
    'agent:planner',
    'agent:researcher',
    'agent:frontend',
    'agent:backend',
    'agent:chatter',
    'system'
  ];
  
  for (const channel of channels) {
    await redis.subscribe(channel, async (message) => {
      await processObservedMessage(channel, message);
    });
  }
  
  log.info('Archivist observing all channels');
}

async function processObservedMessage(channel, message) {
  const msg = JSON.parse(message);
  
  // Record as event
  await recordEvent({
    project: msg.project || 'unknown',
    decision_id: msg.decision_id,
    task_id: msg.id,
    event_type: determineEventType(msg),
    agent: msg.from,
    description: summarizeMessage(msg),
    metadata: msg.payload
  });
  
  // Detect patterns
  if (msg.type === 'response' && msg.payload.status === 'completed') {
    // Successful completion - queue for pattern extraction
    queuePatternExtraction(msg.id);
  }
  
  if (msg.type === 'response' && msg.payload.status === 'failed') {
    // Failure - potentially extract anti-pattern
    queueFailureAnalysis(msg.id);
  }
}
```

## Testing Steps

### 1. Database Setup Test
```bash
# In Supabase SQL Editor, run the schema
# Then verify:
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
# Should show pgvector is installed

psql $DATABASE_URL -c "\dt"
# Should show: decisions, outcomes, learnings, failures, events, projects
```

### 2. Embedding Generation Test
```bash
node -e "
  const { generateEmbedding } = require('./src/agents/memory/embeddings.js');
  generateEmbedding('test authentication patterns').then(emb => {
    console.log('Embedding dimension:', emb.length);
    console.log('Sample values:', emb.slice(0, 5));
  });
"
# Should output:
# Embedding dimension: 1536
# Sample values: [0.123, -0.456, ...]
```

### 3. Record Decision Test
```bash
# Start Archivist
node src/agents/archivistAgent.js

# In another terminal, simulate decision via Redis:
redis-cli PUBLISH agent:archivist '{
  "id": "test-1",
  "from": "planner",
  "to": "archivist",
  "type": "record_decision",
  "payload": {
    "project": "test-project",
    "question": "How to implement auth?",
    "options": ["JWT", "Sessions"],
    "chosen": "JWT",
    "rationale": "Stateless and scalable"
  }
}'

# Check Supabase decisions table - should have new row
```

### 4. Semantic Search Test
```bash
# After recording a few decisions, test search:
redis-cli PUBLISH agent:archivist '{
  "id": "search-1",
  "from": "planner",
  "to": "archivist",
  "type": "search_memories",
  "payload": {
    "query": "authentication"
  }
}'

# Should return relevant past decisions about auth
# Check similarity scores - should be > 0.7
```

### 5. Pattern Extraction Test
```bash
# Simulate a completed task
redis-cli PUBLISH agent:archivist '{
  "id": "extract-1",
  "from": "frontend",
  "to": "archivist",
  "type": "task_complete",
  "payload": {
    "task_id": "task-123",
    "decision_id": "dec-abc",
    "status": "completed",
    "duration_ms": 120000,
    "assessment": "Successfully implemented JWT auth"
  }
}'

# Archivist should:
# 1. Record outcome
# 2. Queue pattern extraction
# 3. Extract learning with Claude
# 4. Store in learnings table
```

### 6. Failure Recording Test
```bash
# Simulate a failed task
redis-cli PUBLISH agent:archivist '{
  "id": "fail-1",
  "from": "backend",
  "to": "archivist",
  "type": "task_complete",
  "payload": {
    "task_id": "task-456",
    "status": "failed",
    "assessment": "Redis sessions caused issues in Render free tier"
  }
}'

# Should create failure record with anti-pattern
```

### 7. Learning Report Test
```bash
# Generate weekly report
redis-cli PUBLISH agent:archivist '{
  "id": "report-1",
  "from": "system",
  "to": "archivist",
  "type": "generate_report",
  "payload": {
    "period": "week"
  }
}'

# Should generate comprehensive learning report
```

### 8. Timeline Test
```bash
# Request project timeline
redis-cli PUBLISH agent:archivist '{
  "id": "timeline-1",
  "from": "chatter",
  "to": "archivist",
  "type": "get_timeline",
  "payload": {
    "project": "test-project",
    "limit": 20
  }
}'

# Should return chronological list of events
```

## What NOT to Build

❌ No real-time streaming of all events to UI (performance issue)
❌ No manual editing of memories (trust the system)
❌ No complex confidence scoring algorithms (keep it simple)
❌ No automatic decision-making (Archivist advises, doesn't decide)
❌ No data export features (yet)
❌ No memory deletion (archive-only)

## Environment Variables
```bash
# OpenAI (for embeddings)
OPENAI_API_KEY=sk-xxx

# Anthropic (for pattern extraction)
ANTHROPIC_API_KEY=sk-ant-xxx

# Redis
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
DATABASE_URL=postgresql://user:pass@host:5432/db

# Archivist Config
AGENT_NAME=archivist
LOG_LEVEL=info
PATTERN_EXTRACTION_DELAY=300000  # 5 minutes after task completion
LEARNING_REPORT_INTERVAL=86400000  # Daily
EMBEDDING_BATCH_SIZE=100
```

## Dependencies
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "openai": "^4.20.0",
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
  name: promptdock-archivist
  env: node
  buildCommand: npm install
  startCommand: node src/agents/archivistAgent.js
  envVars:
    - key: OPENAI_API_KEY
      sync: false
    - key: ANTHROPIC_API_KEY
      sync: false
    - key: REDIS_URL
      fromService: promptdock-redis
    - key: SUPABASE_URL
      sync: false
    - key: SUPABASE_SERVICE_ROLE_KEY
      sync: false
```

## Integration with Existing Agents

### Planner Integration
```javascript
// Before making a decision, Planner asks Archivist:
const memories = await consultArchivist('search_memories', {
  query: 'authentication approaches',
  project: currentProject
});

// Planner considers historical context in decision-making

// After decision, Planner records it:
await consultArchivist('record_decision', {
  project: currentProject,
  question: 'How to implement auth?',
  options: ['JWT', 'Sessions'],
  chosen: 'JWT',
  rationale: '...'
});
```

### Worker Integration
```javascript
// After task completion, workers report outcome:
await redis.publish('agent:archivist', {
  type: 'task_complete',
  payload: {
    task_id: taskId,
    status: 'completed',
    duration_ms: elapsed,
    assessment: 'Successfully implemented feature'
  }
});
```

### Chatter Integration
```javascript
// Chatter can query Archivist for user:
"Why did we choose JWT over sessions?"
  ↓
Chatter → Archivist: search_memories("JWT vs sessions decision")
  ↓
Archivist returns historical decision with rationale
  ↓
Chatter → User: "We chose JWT because [rationale from memory]"
```

## Performance Considerations

### Embedding Costs
- text-embedding-3-small: $0.02 per 1M tokens
- Average memory: ~200 tokens
- 1000 memories: ~$0.004
- **Very affordable**

### Vector Search Performance
- HNSW index provides approximate nearest neighbor search
- O(log N) query time
- 10,000 memories: <50ms search time
- 100,000 memories: <200ms search time

### Storage Costs
- Each memory: ~2KB text + 6KB embedding = 8KB
- 10,000 memories: ~80MB
- Supabase free tier: 500MB
- **Can store ~60,000 memories on free tier**

### Background Job Timing
- Pattern extraction: 5 minutes after task completion (batched)
- Learning reports: Daily at 3 AM
- Confidence updates: Weekly
- Old event cleanup: Monthly (keep 90 days)

## Completion Checklist
- [ ] pgvector extension enabled in Supabase
- [ ] All 6 tables created successfully
- [ ] Vector similarity indexes created
- [ ] Helper functions (search_*) working
- [ ] archivistAgent.js implements observation + response
- [ ] Recorder can store all memory types
- [ ] Extractor can analyze tasks with Claude
- [ ] Searcher performs semantic search
- [ ] Embeddings generation working
- [ ] Summarizer generates reports
- [ ] All 8 testing steps pass
- [ ] Integration points documented
- [ ] Performance within acceptable limits
- [ ] Ready for Render deployment

## Estimated Time
**6-8 hours** of Claude Code execution time

## Phase 2 Activation Plan

When you're ready to add Archivist (after 2 weeks with 4-agent system):

**Week 1: Data Collection**
- Deploy Archivist in observation-only mode
- Let it record decisions, outcomes, events
- Build up initial dataset

**Week 2: Pattern Extraction**
- Enable pattern extraction
- Review extracted learnings for quality
- Tune extraction prompts

**Week 3: Memory Search**
- Enable Planner to query Archivist
- Validate that memories are helpful
- Adjust search thresholds

**Week 4: Full Integration**
- All agents use Archivist
- Learning reports generated
- System has institutional memory

## Success Metrics

After 1 month with Archivist:
- ✅ 50+ decisions recorded
- ✅ 20+ patterns extracted
- ✅ 5+ failures prevented (due to memory)
- ✅ Planner references memories 80%+ of the time
- ✅ Time saved: 2+ hours per week (avoiding repeated mistakes)

---

**Remember:** Don't build this until Command Files 1-4 are working and you've used the system for at least 2 weeks. The Archivist needs real data to be valuable.
