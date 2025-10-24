# Command File 4: Researcher Agent

## Objective
Build the code analysis agent that prevents conflicts, detects duplication, and validates integration points. Researcher reads repository snapshots from Supabase, analyzes existing patterns, and provides recommendations to prevent Frontend/Backend workers from building incompatible code.

## Success Criteria
✅ Subscribes to `agent:researcher` channel on Redis
✅ Uses Claude API for intelligent code analysis
✅ Reads repo snapshots from Supabase
✅ Can analyze frontend, backend, or both repos
✅ Detects existing patterns (auth, API routes, components, etc.)
✅ Identifies conflicts before they happen
✅ Recommends integration approaches
✅ Falls back to GitHub API if snapshots are stale
✅ Responds within 30 seconds for typical queries
✅ Publishes structured analysis results

## Tech Stack
- **Runtime**: Node.js 20
- **LLM**: Claude 4.5 Sonnet (via Anthropic SDK)
- **Database**: Supabase (read repo snapshots)
- **Redis**: ioredis
- **GitHub**: @octokit/rest (fallback)

## Project Structure
```
promptdock/src/agents/
├── researcherAgent.js   # Main agent logic
├── analyzers/
│   ├── snapshot.js      # Analyze Supabase snapshots
│   ├── github.js        # Fetch from GitHub API
│   ├── patterns.js      # Detect code patterns
│   └── conflicts.js     # Conflict detection logic
└── README.md
```

## Supabase Schema Extension

Add to existing schema:
```sql
-- Repository snapshots (updated by local workers)
create table repo_snapshots (
  id uuid primary key default gen_random_uuid(),
  repo text not null, -- 'frontend' or 'backend'
  branch text default 'main',
  commit_hash text,
  
  -- File structure
  file_tree jsonb not null, -- { 'src/': ['App.tsx', 'index.ts'], ... }
  
  -- Key patterns
  patterns jsonb not null, -- { auth: 'JWT', forms: 'React Hook Form', ... }
  
  -- Database schema (backend only)
  db_schema jsonb, -- { users: { id: 'uuid', email: 'string', ... }, ... }
  
  -- API routes (backend)
  api_routes jsonb, -- [{ path: '/api/users', method: 'GET', ... }]
  
  -- Components (frontend)
  components jsonb, -- [{ name: 'Button', path: 'src/components/ui/button.tsx' }]
  
  -- Dependencies
  dependencies jsonb not null, -- { react: '18.2.0', ... }
  
  -- Key file contents (for quick reference)
  key_files jsonb, -- { 'package.json': '...', 'tsconfig.json': '...' }
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  snapshot_version integer default 1
);

-- Indexes
create index repo_snapshots_repo_idx on repo_snapshots(repo);
create index repo_snapshots_updated_at_idx on repo_snapshots(updated_at desc);

-- Get latest snapshot function
create or replace function get_latest_snapshot(repo_name text)
returns repo_snapshots as $$
  select * from repo_snapshots
  where repo = repo_name
  order by updated_at desc
  limit 1;
$$ language sql;
```

## Implementation Requirements

### 1. Main Agent (`src/agents/researcherAgent.js`)
```javascript
// Core Responsibilities:
// 1. Subscribe to 'agent:researcher' channel
// 2. Receive research requests from Chatter/Planner
// 3. Fetch relevant repo snapshots
// 4. Analyze using Claude API
// 5. Detect conflicts and patterns
// 6. Publish structured findings
// 7. Log all analysis to Supabase

// Request Types:
// - "exists_check": Does feature X already exist?
// - "conflict_check": Will implementing Y conflict with existing code?
// - "pattern_analysis": What patterns do we use for Z?
// - "integration_guidance": How to integrate new code with existing?
// - "dependency_check": What dependencies/versions do we use?

// Analysis Flow:
// 1. Parse request → determine scope (frontend/backend/both)
// 2. Fetch latest snapshots
// 3. If snapshots > 10 min old, warn or fetch from GitHub
// 4. Extract relevant portions for Claude
// 5. Analyze with Claude API
// 6. Structure findings
// 7. Publish response
```

### 2. Snapshot Analyzer (`src/agents/analyzers/snapshot.js`)
```javascript
// Functions:

async function getLatestSnapshot(repo) {
  // Fetch from Supabase using get_latest_snapshot()
  // Return null if no snapshot exists
  // Warn if snapshot > 10 minutes old
}

async function analyzeFileStructure(snapshot, query) {
  // Given a snapshot and query like "auth patterns"
  // Extract relevant file paths and structures
  // Return focused subset for Claude analysis
}

async function searchFiles(snapshot, pattern) {
  // Search file_tree for files matching pattern
  // e.g., searchFiles(snapshot, '**/auth*.ts')
  // Returns: ['src/middleware/auth.ts', 'src/utils/authHelper.ts']
}

async function getFileContent(snapshot, filePath) {
  // Check if file is in key_files
  // If yes, return content
  // If no, return null (need GitHub fetch)
}

function getSnapshotAge(snapshot) {
  // Returns age in milliseconds
  // Used to determine if snapshot is stale
}
```

### 3. GitHub Fallback (`src/agents/analyzers/github.js`)
```javascript
// Used when:
// - Snapshot doesn't exist
// - Snapshot is too old (>10 min)
// - Need specific file content not in snapshot

import { Octokit } from '@octokit/rest';

async function fetchFileContent(repo, path) {
  // Fetch single file from GitHub
  // repo: 'frontend' or 'backend'
  // Uses GITHUB_OWNER and GITHUB_REPO_* env vars
}

async function fetchDirectoryListing(repo, path) {
  // Get file list in directory
  // Returns: ['file1.ts', 'file2.ts', ...]
}

async function searchCode(repo, query) {
  // Use GitHub Code Search API
  // query: 'jwt path:src/'
  // Returns matching files and snippets
}

// Rate limiting:
// - GitHub API: 5000 requests/hour
// - Track usage and warn when approaching limit
// - Prefer snapshots over GitHub when possible
```

### 4. Pattern Detector (`src/agents/analyzers/patterns.js`)
```javascript
// Pre-analysis pattern detection (before sending to Claude)

function detectAuthPattern(snapshot) {
  // Look for: JWT, sessions, OAuth, etc.
  // Check middleware, routes, utils
  // Return: { type: 'JWT', files: [...], implementation: '...' }
}

function detectFormPattern(snapshot) {
  // Look for: React Hook Form, Formik, plain React, etc.
  // Check components and hooks
  // Return: { library: 'react-hook-form', examples: [...] }
}

function detectAPIPattern(snapshot) {
  // Backend: Express, Fastify, etc.
  // Frontend: axios, fetch, etc.
  // Return: { client: 'axios', baseURL: '...', interceptors: true }
}

function detectStateManagement(snapshot) {
  // Redux, Zustand, Context, etc.
  // Return: { type: 'Context', patterns: [...] }
}

function detectDatabasePattern(snapshot) {
  // Prisma, Sequelize, raw SQL, etc.
  // Return: { orm: 'Prisma', schema: {...} }
}

// Use these to give Claude focused context
```

### 5. Conflict Detector (`src/agents/analyzers/conflicts.js`)
```javascript
// Automated conflict detection (before Claude analysis)

function checkSchemaConflict(frontendExpectation, backendSchema) {
  // Frontend expects: { user: { email: string } }
  // Backend provides: { user: { emailAddress: string } }
  // Return: { hasConflict: true, field: 'email vs emailAddress' }
}

function checkRouteConflict(newRoute, existingRoutes) {
  // Check if route already exists
  // Check if route conflicts (same path, different method)
  // Return: { conflict: boolean, reason: '...' }
}

function checkDependencyConflict(newDep, existingDeps) {
  // Check version compatibility
  // Check peer dependencies
  // Return: { compatible: boolean, issues: [...] }
}

function checkNamingConflict(newName, existingNames) {
  // Check if component/function/variable name already used
  // Return: { exists: boolean, location: '...' }
}
```

### 6. Claude Analysis Integration
```javascript
const SYSTEM_PROMPT = `You are Researcher, a code analysis specialist for PromptDock.

Your role:
- Analyze existing codebases to understand patterns and architecture
- Detect potential conflicts before implementation
- Recommend integration approaches
- Prevent code duplication
- Ensure consistency across the codebase

You have access to:
- Repository snapshots (file structure, patterns, schemas)
- GitHub API (when snapshots are insufficient)
- Pattern detection algorithms
- Conflict checking tools

Analysis approach:
1. Focus on the specific question asked
2. Provide concrete examples from the codebase
3. Flag conflicts clearly
4. Recommend specific integration points
5. Cite file paths and line numbers when relevant

Response format:
- **Findings**: What exists currently
- **Conflicts**: Any potential issues
- **Recommendations**: How to proceed
- **Integration Points**: Specific files/functions to use

Current timestamp: ${new Date().toISOString()}`;

async function analyzeWithClaude(question, context) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyze this codebase and answer the question.

**Question**: ${question}

**Repository Context**:
${JSON.stringify(context, null, 2)}

Provide a structured analysis with findings, conflicts, and recommendations.`
      }
    ]
  });
  
  return response.content[0].text;
}
```

## Request/Response Format

### Request from Chatter/Planner
```json
{
  "id": "req-abc-123",
  "from": "chatter",
  "to": "researcher",
  "type": "question",
  "payload": {
    "question": "Do we already have authentication implemented?",
    "repos": ["frontend", "backend"],
    "focus_areas": ["auth patterns", "JWT handling", "protected routes"],
    "priority": "high"
  },
  "timestamp": "2025-10-23T10:30:00Z"
}
```

### Response to Chatter/Planner
```json
{
  "id": "resp-def-456",
  "from": "researcher",
  "to": "chatter",
  "type": "response",
  "payload": {
    "request_id": "req-abc-123",
    "analysis": {
      "findings": {
        "frontend": {
          "auth_exists": false,
          "checked_locations": [
            "src/components/",
            "src/hooks/",
            "src/context/"
          ],
          "notes": "No AuthContext, login components, or protected route wrappers found"
        },
        "backend": {
          "auth_exists": false,
          "checked_locations": [
            "src/routes/",
            "src/middleware/",
            "src/models/"
          ],
          "notes": "No auth middleware, JWT handling, or user authentication routes found"
        }
      },
      "conflicts": [],
      "recommendations": {
        "approach": "Implement from scratch",
        "suggested_libraries": {
          "frontend": ["react-router-dom for protected routes"],
          "backend": ["jsonwebtoken", "bcrypt"]
        },
        "integration_points": {
          "frontend": "Create src/context/AuthContext.tsx",
          "backend": "Create src/middleware/auth.js"
        }
      },
      "existing_patterns": {
        "frontend": {
          "state_management": "React Context",
          "api_client": "axios with interceptors"
        },
        "backend": {
          "framework": "Express",
          "database": "Prisma + PostgreSQL"
        }
      }
    },
    "snapshot_age_ms": 45000,
    "confidence": "high"
  },
  "timestamp": "2025-10-23T10:30:15Z"
}
```

### Conflict Detection Response
```json
{
  "id": "resp-ghi-789",
  "from": "researcher",
  "to": "chatter",
  "type": "response",
  "payload": {
    "request_id": "req-xyz-999",
    "analysis": {
      "findings": {
        "backend": {
          "route_exists": true,
          "existing_route": {
            "path": "/api/user",
            "method": "GET",
            "file": "src/routes/users.js",
            "line": 15
          }
        },
        "frontend": {
          "calling_route": "/api/users",
          "files": [
            "src/hooks/useUser.ts:23",
            "src/components/Profile.tsx:45"
          ]
        }
      },
      "conflicts": [
        {
          "type": "route_mismatch",
          "severity": "high",
          "description": "Frontend expects /api/users (plural) but backend implements /api/user (singular)",
          "impact": "404 errors on all user API calls",
          "affected_files": [
            "backend: src/routes/users.js",
            "frontend: src/hooks/useUser.ts",
            "frontend: src/components/Profile.tsx"
          ]
        }
      ],
      "recommendations": {
        "option_1": "Change backend route from /api/user to /api/users",
        "option_2": "Change frontend calls from /api/users to /api/user",
        "preferred": "option_1",
        "reason": "Backend change is isolated to one file; frontend change affects 2+ files"
      }
    },
    "confidence": "very_high"
  },
  "timestamp": "2025-10-23T10:31:00Z"
}
```

## Testing Steps

### 1. Agent Startup Test
```bash
node src/agents/researcherAgent.js
# Should see:
# [INFO] Researcher agent starting...
# [INFO] Connected to Redis
# [INFO] Connected to Supabase
# [INFO] Subscribed to: agent:researcher
# [INFO] Researcher ready
```

### 2. Snapshot Retrieval Test
```bash
# Manually insert test snapshot into Supabase
# Then publish research request:
redis-cli PUBLISH agent:researcher '{"id":"test-1","from":"test","to":"researcher","type":"question","payload":{"question":"What auth patterns exist?","repos":["backend"]}}'

# Should see:
# [INFO] Received research request: test-1
# [INFO] Fetching snapshots for: backend
# [INFO] Snapshot age: 2 minutes
# [INFO] Analyzing with Claude...
# [INFO] Publishing analysis
```

### 3. Pattern Detection Test
```bash
# Request pattern analysis:
redis-cli PUBLISH agent:researcher '{"id":"test-2","from":"test","to":"researcher","type":"question","payload":{"question":"What form libraries do we use?","repos":["frontend"]}}'

# Response should include:
# - Detected form library
# - Example files using it
# - Recommended patterns
```

### 4. Conflict Detection Test
```bash
# Create snapshots with intentional conflict
# (frontend expects one thing, backend provides another)
# Request analysis
# Should detect and report conflict clearly
```

### 5. GitHub Fallback Test
```bash
# Delete snapshot or make it very old
# Request analysis
# Should see:
# [WARN] Snapshot stale, fetching from GitHub
# [INFO] Using GitHub API...
# [INFO] Analysis complete
```

### 6. Concurrent Request Test
```bash
# Send 3 research requests simultaneously
# All should process successfully
# Responses should not get mixed up
```

### 7. Error Handling Test
```bash
# Send request with invalid repo name
# Should handle gracefully and inform user

# Send request when Supabase is down
# Should fall back to GitHub or report error

# Send request when both Supabase and GitHub fail
# Should return clear error message
```

## What NOT to Build
❌ No code modification (read-only analysis)
❌ No automatic snapshot creation (workers do that)
❌ No real-time file watching
❌ No git operations
❌ No dependency installation
❌ No test execution

## Environment Variables
```bash
# Claude API
ANTHROPIC_API_KEY=sk-ant-xxx

# Redis
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# GitHub (optional, for fallback)
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=your-username
GITHUB_REPO_FRONTEND=my-app-frontend
GITHUB_REPO_BACKEND=my-app-backend

# Agent Config
AGENT_NAME=researcher
LOG_LEVEL=info
SNAPSHOT_STALE_THRESHOLD=600000  # 10 minutes
GITHUB_RATE_LIMIT_THRESHOLD=100  # Warn when <100 requests left
```

## Dependencies
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "@octokit/rest": "^20.0.0",
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
  name: promptdock-researcher
  env: node
  buildCommand: npm install
  startCommand: node src/agents/researcherAgent.js
  envVars:
    - key: ANTHROPIC_API_KEY
      sync: false
    - key: REDIS_URL
      fromService: promptdock-redis
    - key: SUPABASE_URL
      sync: false
    - key: SUPABASE_SERVICE_ROLE_KEY
      sync: false
    - key: GITHUB_TOKEN
      sync: false
```

## Snapshot Sync (Worker Addition)

**Note**: This should be added to the local worker (Command File 2):
```javascript
// In localWorker.js, after task completion:

async function syncSnapshot() {
  const snapshot = {
    repo: AGENT_NAME, // 'frontend' or 'backend'
    branch: await getGitBranch(),
    commit_hash: await getGitCommit(),
    file_tree: await buildFileTree(),
    patterns: await detectPatterns(),
    dependencies: await parseDependencies(),
    key_files: await extractKeyFiles(),
    updated_at: new Date().toISOString()
  };
  
  // If backend, add db_schema and api_routes
  if (AGENT_NAME === 'backend') {
    snapshot.db_schema = await extractDbSchema();
    snapshot.api_routes = await extractApiRoutes();
  }
  
  // If frontend, add components
  if (AGENT_NAME === 'frontend') {
    snapshot.components = await extractComponents();
  }
  
  await supabase.from('repo_snapshots').upsert(snapshot, {
    onConflict: 'repo',
    ignoreDuplicates: false
  });
  
  log.info('Snapshot synced to Supabase');
}
```

## Completion Checklist
- [ ] researcherAgent.js implements full analysis loop
- [ ] Snapshot analyzer fetches and parses snapshots
- [ ] GitHub fallback works when snapshots unavailable
- [ ] Pattern detection identifies common patterns
- [ ] Conflict detection finds mismatches
- [ ] Claude integration provides intelligent analysis
- [ ] Agent startup successful
- [ ] Snapshot retrieval works
- [ ] Pattern detection works
- [ ] Conflict detection works
- [ ] GitHub fallback works
- [ ] Concurrent requests handled
- [ ] Error handling prevents crashes
- [ ] Logs all activity to Supabase
- [ ] Ready for Render deployment
- [ ] Snapshot sync added to local workers

## Estimated Time
**5-6 hours** of Claude Code execution time

## Integration Test

Once all 4 command files are complete, test the full flow:
```
User (Dashboard): "Build a login form"
  ↓
Chatter: Consults Researcher
  ↓
Researcher: Analyzes snapshots
  - "No auth exists"
  - "Uses React Hook Form for other forms"
  - "Backend has no /api/auth endpoint"
  ↓
Chatter: Consults Planner
  ↓
Planner: Creates task breakdown
  ↓
Chatter: Assigns to Frontend Worker
  ↓
Frontend Worker (local): Builds component
  ↓
Frontend Worker: Syncs snapshot
  ↓
Chatter: "Login form complete! Backend auth needed next?"
```

This completes the 4-agent MVP system!
