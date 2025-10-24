# Command File 4: Researcher Agent (EXPANDED)

## AUDIENCE NOTE
This command file is written for Claude Code. Every instruction should be taken literally. If something is ambiguous, it needs clarification - do not guess or assume. If you encounter a decision point not covered here, stop and ask.

This agent runs IN THE CLOUD (on Render), not on your local machine. It's the code analysis specialist that prevents conflicts and detects patterns before implementation.

## Objective
Build the code analysis agent that prevents conflicts, detects duplication, and validates integration points. Researcher reads repository snapshots from Supabase, analyzes existing patterns, and provides recommendations to prevent Frontend/Backend workers from building incompatible code.

Think of Researcher as an expert code reviewer who has memorized your entire codebase and can instantly tell you "we already have that" or "this will conflict with X."

## Success Criteria (Binary Pass/Fail)
✅ Subscribes to `agent:researcher` channel on Redis
✅ Uses Claude API for intelligent code analysis
✅ Reads repo snapshots from Supabase successfully
✅ Can analyze frontend, backend, or both repos
✅ Detects existing patterns (auth, forms, API routes, components)
✅ Identifies conflicts before they happen (route mismatches, schema conflicts)
✅ Recommends specific integration approaches with file paths
✅ Falls back to GitHub API if snapshots unavailable
✅ Responds within 30 seconds for typical queries
✅ Publishes structured analysis results to Redis
✅ Logs all activity to Supabase

## CRITICAL: Scope Definition

### You MUST Build:
- Node.js daemon that runs continuously
- Redis subscription to `agent:researcher` channel
- Claude API integration for analysis
- Supabase client for reading snapshots
- Snapshot analyzer (extract relevant code)
- Pattern detector (identify auth, forms, APIs, etc.)
- Conflict detector (find mismatches)
- GitHub API fallback (optional, for when snapshots missing)
- Response formatter (structured JSON)
- Error handling for all edge cases

### You MUST NOT Build:
- Code modification (read-only analysis)
- Automatic snapshot creation (workers do that)
- Real-time file watching
- Git operations
- Dependency installation
- Test execution
- Code generation
- Automatic fixes (just recommendations)

### What "Scope Creep" Means:
If you find yourself thinking:
- "Let me auto-fix the conflicts..." → STOP (just report them)
- "I should watch files for changes..." → STOP (snapshots handle this)
- "Let me run tests..." → STOP (workers do that)
- "I'll add code suggestions..." → STOP (just analysis)
- "Let me install dependencies..." → STOP (read-only)

The ONLY goal is: analyze existing code and report findings.

## Tech Stack (Fixed - Do Not Substitute)
- **Runtime**: Node.js 20.x (use latest LTS)
- **LLM**: Claude 4.5 Sonnet via Anthropic SDK
- **Database**: Supabase (read snapshots)
- **Redis**: ioredis (NOT node-redis)
- **GitHub**: @octokit/rest (optional fallback)

WHY these choices:
- Claude 4.5 Sonnet: Best at code analysis and reasoning
- Supabase: Easy querying of snapshots
- Octokit: Official GitHub API client

## Project Structure (Exact)

This goes in the `promptdock/src/agents/` folder (created in Command File 1):

```
promptdock/src/agents/
├── researcherAgent.js   # MAIN ENTRY POINT - start here
├── analyzers/
│   ├── snapshot.js      # Analyze Supabase snapshots
│   ├── github.js        # Fetch from GitHub API (optional)
│   ├── patterns.js      # Detect code patterns
│   └── conflicts.js     # Conflict detection logic
└── README.md            # Agent documentation
```

## Supabase Schema Extension

Add this to your Supabase SQL Editor (extends Command File 1's schema):

```sql
-- Repository snapshots table
-- Updated by local workers after each task completion

create table if not exists repo_snapshots (
  id uuid primary key default gen_random_uuid(),
  repo text not null, -- 'frontend' or 'backend'
  branch text default 'main',
  commit_hash text,
  
  -- File structure
  file_tree jsonb not null,
  -- Format: { 'src/': ['App.tsx', 'index.ts'], 'src/components/': ['Button.tsx'] }
  
  -- Key patterns detected
  patterns jsonb not null,
  -- Format: { auth: 'JWT', forms: 'React Hook Form', api: 'axios' }
  
  -- Database schema (backend only)
  db_schema jsonb,
  -- Format: { users: { id: 'uuid', email: 'string' } }
  
  -- API routes (backend only)
  api_routes jsonb,
  -- Format: [{ path: '/api/users', method: 'GET', file: 'routes/users.js' }]
  
  -- Components (frontend only)
  components jsonb,
  -- Format: [{ name: 'Button', path: 'src/components/ui/Button.tsx' }]
  
  -- Dependencies from package.json
  dependencies jsonb not null,
  -- Format: { react: '18.2.0', express: '4.18.0' }
  
  -- Key file contents (for quick reference)
  key_files jsonb,
  -- Format: { 'package.json': '...', 'tsconfig.json': '...' }
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  snapshot_version integer default 1
);

-- Indexes for performance
create index if not exists repo_snapshots_repo_idx on repo_snapshots(repo);
create index if not exists repo_snapshots_updated_at_idx on repo_snapshots(updated_at desc);

-- Helper function: Get latest snapshot for a repo
create or replace function get_latest_snapshot(repo_name text)
returns repo_snapshots as $$
  select * from repo_snapshots
  where repo = repo_name
  order by updated_at desc
  limit 1;
$$ language sql;

-- Example snapshot (for testing):
-- insert into repo_snapshots (repo, file_tree, patterns, dependencies) values (
--   'frontend',
--   '{"src/": ["App.tsx", "index.ts"], "src/components/": ["Button.tsx"]}',
--   '{"stateManagement": "Context", "routing": "React Router"}',
--   '{"react": "18.2.0", "typescript": "5.0.0"}'
-- );
```

Run this SQL, then verify:
```sql
select * from repo_snapshots;
```

Should return empty table (snapshots will be created by workers in Phase 2).

## Environment Variables

These should already exist in Command File 1's `.env`, but add if missing:

```bash
# Anthropic API (already from Command File 3)
ANTHROPIC_API_KEY=sk-ant-xxx

# GitHub API (OPTIONAL - for fallback)
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=your-username
GITHUB_REPO_FRONTEND=my-app-frontend
GITHUB_REPO_BACKEND=my-app-backend

# Redis (already from Command File 1)
REDIS_URL=redis://localhost:6379

# Supabase (already from Command File 1)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Researcher Config
AGENT_NAME=researcher
LOG_LEVEL=info
SNAPSHOT_STALE_THRESHOLD=600000
GITHUB_RATE_LIMIT_THRESHOLD=100
```

## Dependencies

Update `promptdock/package.json` to add (if not already present):

```json
{
  "dependencies": {
    "@octokit/rest": "^20.0.0"
  }
}
```

Run `npm install` after adding.

## Implementation Details

### 1. analyzers/snapshot.js (Snapshot Analyzer)

```javascript
import { createLogger } from '../services/logger.js';
import { getSupabaseClient } from '../services/supabase.js';

const log = createLogger('snapshot');

/**
 * Get latest snapshot for a repository
 * 
 * @param {string} repo - 'frontend' or 'backend'
 * @returns {Promise<object|null>} Snapshot or null if not found
 */
export async function getLatestSnapshot(repo) {
  const supabase = getSupabaseClient();
  
  try {
    const { data, error } = await supabase
      .rpc('get_latest_snapshot', { repo_name: repo });
    
    if (error) {
      log.error(`Failed to get snapshot for ${repo}`, error);
      return null;
    }
    
    if (!data) {
      log.warn(`No snapshot found for ${repo}`);
      return null;
    }
    
    // Check snapshot age
    const age = Date.now() - new Date(data.updated_at).getTime();
    const staleThreshold = parseInt(process.env.SNAPSHOT_STALE_THRESHOLD || '600000', 10);
    
    if (age > staleThreshold) {
      log.warn(`Snapshot for ${repo} is stale (${Math.floor(age / 1000)}s old)`);
    }
    
    log.debug(`Retrieved snapshot for ${repo}`, {
      version: data.snapshot_version,
      age_seconds: Math.floor(age / 1000),
    });
    
    return data;
    
  } catch (error) {
    log.error(`Exception getting snapshot for ${repo}`, error);
    return null;
  }
}

/**
 * Search for files in snapshot
 * 
 * @param {object} snapshot - Snapshot object
 * @param {string} pattern - Glob-like pattern (e.g., '**\/auth*.ts')
 * @returns {Array<string>} Matching file paths
 */
export function searchFiles(snapshot, pattern) {
  if (!snapshot || !snapshot.file_tree) {
    return [];
  }
  
  const results = [];
  const fileTree = snapshot.file_tree;
  
  // Simple pattern matching (not full glob, but good enough)
  const regex = new RegExp(
    pattern
      .replace(/\*\*/g, '.*')  // ** matches any path
      .replace(/\*/g, '[^/]*') // * matches any filename chars
      .replace(/\./g, '\\.')   // Escape dots
  );
  
  // Flatten file tree and search
  function traverse(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix + key;
      
      if (Array.isArray(value)) {
        // This is a directory with files
        for (const file of value) {
          const fullPath = path + file;
          if (regex.test(fullPath)) {
            results.push(fullPath);
          }
        }
      } else if (typeof value === 'object') {
        // This is a nested directory
        traverse(value, path);
      }
    }
  }
  
  traverse(fileTree);
  
  log.debug(`Found ${results.length} files matching pattern: ${pattern}`);
  
  return results;
}

/**
 * Get file content from snapshot
 * Only available if file is in key_files
 * 
 * @param {object} snapshot - Snapshot object
 * @param {string} filePath - File path
 * @returns {string|null} File content or null
 */
export function getFileContent(snapshot, filePath) {
  if (!snapshot || !snapshot.key_files) {
    return null;
  }
  
  const content = snapshot.key_files[filePath];
  
  if (content) {
    log.debug(`Retrieved content for ${filePath} from snapshot`);
  }
  
  return content || null;
}

/**
 * Extract relevant context for a query
 * This prepares focused information for Claude analysis
 * 
 * @param {object} snapshot - Snapshot object
 * @param {string} query - User query
 * @param {Array<string>} focusAreas - Specific areas to focus on
 * @returns {object} Relevant context
 */
export function extractRelevantContext(snapshot, query, focusAreas = []) {
  if (!snapshot) {
    return {
      available: false,
      message: 'No snapshot available',
    };
  }
  
  const context = {
    repo: snapshot.repo,
    branch: snapshot.branch,
    lastUpdated: snapshot.updated_at,
    patterns: snapshot.patterns || {},
    dependencies: snapshot.dependencies || {},
  };
  
  // Add repo-specific data
  if (snapshot.repo === 'backend') {
    context.dbSchema = snapshot.db_schema;
    context.apiRoutes = snapshot.api_routes;
  } else if (snapshot.repo === 'frontend') {
    context.components = snapshot.components;
  }
  
  // Extract relevant files based on focus areas
  if (focusAreas.length > 0) {
    context.relevantFiles = {};
    
    for (const area of focusAreas) {
      // Map focus areas to file patterns
      const patterns = {
        'auth': ['**/auth*.ts', '**/auth*.js', '**/middleware/auth*'],
        'forms': ['**/form*.tsx', '**/form*.ts'],
        'api': ['**/routes/**', '**/api/**'],
        'database': ['**/models/**', '**/schema*', 'prisma/**'],
        'components': ['**/components/**'],
      };
      
      const pattern = patterns[area.toLowerCase()];
      if (pattern) {
        for (const p of (Array.isArray(pattern) ? pattern : [pattern])) {
          const files = searchFiles(snapshot, p);
          if (files.length > 0) {
            context.relevantFiles[area] = files;
          }
        }
      }
    }
  }
  
  return context;
}

/**
 * Get snapshot age in milliseconds
 * 
 * @param {object} snapshot - Snapshot object
 * @returns {number} Age in milliseconds
 */
export function getSnapshotAge(snapshot) {
  if (!snapshot || !snapshot.updated_at) {
    return Infinity;
  }
  
  return Date.now() - new Date(snapshot.updated_at).getTime();
}
```

### 2. analyzers/patterns.js (Pattern Detector)

```javascript
import { createLogger } from '../services/logger.js';
import { searchFiles } from './snapshot.js';

const log = createLogger('patterns');

/**
 * Detect authentication pattern
 * 
 * @param {object} snapshot - Snapshot object
 * @returns {object} Auth pattern info
 */
export function detectAuthPattern(snapshot) {
  if (!snapshot) {
    return { detected: false };
  }
  
  const patterns = snapshot.patterns || {};
  
  // Check if explicitly recorded
  if (patterns.auth) {
    return {
      detected: true,
      type: patterns.auth,
      source: 'snapshot metadata',
    };
  }
  
  // Search for auth-related files
  const authFiles = searchFiles(snapshot, '**/auth*');
  
  if (authFiles.length === 0) {
    return { detected: false };
  }
  
  // Analyze dependencies to guess type
  const deps = snapshot.dependencies || {};
  
  let type = 'unknown';
  if (deps['jsonwebtoken'] || deps['@auth/core']) {
    type = 'JWT';
  } else if (deps['passport']) {
    type = 'Passport';
  } else if (deps['next-auth']) {
    type = 'NextAuth';
  }
  
  return {
    detected: true,
    type,
    files: authFiles,
    source: 'file analysis',
  };
}

/**
 * Detect form handling pattern
 * 
 * @param {object} snapshot - Snapshot object
 * @returns {object} Form pattern info
 */
export function detectFormPattern(snapshot) {
  if (!snapshot || snapshot.repo !== 'frontend') {
    return { detected: false };
  }
  
  const deps = snapshot.dependencies || {};
  
  if (deps['react-hook-form']) {
    return {
      detected: true,
      library: 'React Hook Form',
      validation: deps['zod'] ? 'Zod' : deps['yup'] ? 'Yup' : 'none',
    };
  }
  
  if (deps['formik']) {
    return {
      detected: true,
      library: 'Formik',
      validation: deps['yup'] ? 'Yup' : 'none',
    };
  }
  
  // Check for form files
  const formFiles = searchFiles(snapshot, '**/form*.tsx');
  
  if (formFiles.length > 0) {
    return {
      detected: true,
      library: 'Custom (plain React)',
      files: formFiles,
    };
  }
  
  return { detected: false };
}

/**
 * Detect API client pattern
 * 
 * @param {object} snapshot - Snapshot object
 * @returns {object} API pattern info
 */
export function detectAPIPattern(snapshot) {
  if (!snapshot) {
    return { detected: false };
  }
  
  const deps = snapshot.dependencies || {};
  
  if (snapshot.repo === 'frontend') {
    // Frontend API client
    if (deps['axios']) {
      return {
        detected: true,
        client: 'axios',
        interceptors: searchFiles(snapshot, '**/axios*.ts').length > 0,
      };
    }
    
    if (deps['@tanstack/react-query']) {
      return {
        detected: true,
        client: 'React Query with fetch',
        caching: true,
      };
    }
    
    return {
      detected: true,
      client: 'fetch (native)',
      interceptors: false,
    };
  } else {
    // Backend API framework
    if (deps['express']) {
      return {
        detected: true,
        framework: 'Express',
        version: deps['express'],
      };
    }
    
    if (deps['fastify']) {
      return {
        detected: true,
        framework: 'Fastify',
        version: deps['fastify'],
      };
    }
    
    if (deps['next']) {
      return {
        detected: true,
        framework: 'Next.js API Routes',
        version: deps['next'],
      };
    }
  }
  
  return { detected: false };
}

/**
 * Detect state management pattern (frontend)
 * 
 * @param {object} snapshot - Snapshot object
 * @returns {object} State management info
 */
export function detectStateManagement(snapshot) {
  if (!snapshot || snapshot.repo !== 'frontend') {
    return { detected: false };
  }
  
  const deps = snapshot.dependencies || {};
  
  if (deps['redux'] || deps['@reduxjs/toolkit']) {
    return {
      detected: true,
      type: 'Redux',
      toolkit: !!deps['@reduxjs/toolkit'],
    };
  }
  
  if (deps['zustand']) {
    return {
      detected: true,
      type: 'Zustand',
    };
  }
  
  if (deps['mobx']) {
    return {
      detected: true,
      type: 'MobX',
    };
  }
  
  if (deps['jotai']) {
    return {
      detected: true,
      type: 'Jotai',
    };
  }
  
  // Check for Context usage
  const contextFiles = searchFiles(snapshot, '**/context/*.tsx');
  if (contextFiles.length > 0) {
    return {
      detected: true,
      type: 'React Context',
      files: contextFiles,
    };
  }
  
  return { detected: false };
}

/**
 * Detect database pattern (backend)
 * 
 * @param {object} snapshot - Snapshot object
 * @returns {object} Database pattern info
 */
export function detectDatabasePattern(snapshot) {
  if (!snapshot || snapshot.repo !== 'backend') {
    return { detected: false };
  }
  
  const deps = snapshot.dependencies || {};
  
  if (deps['prisma'] || deps['@prisma/client']) {
    return {
      detected: true,
      orm: 'Prisma',
      schema: snapshot.db_schema || null,
    };
  }
  
  if (deps['typeorm']) {
    return {
      detected: true,
      orm: 'TypeORM',
      schema: snapshot.db_schema || null,
    };
  }
  
  if (deps['sequelize']) {
    return {
      detected: true,
      orm: 'Sequelize',
      schema: snapshot.db_schema || null,
    };
  }
  
  if (deps['mongoose']) {
    return {
      detected: true,
      orm: 'Mongoose (MongoDB)',
      schema: snapshot.db_schema || null,
    };
  }
  
  if (deps['pg'] || deps['mysql2']) {
    return {
      detected: true,
      orm: 'Raw SQL',
      driver: deps['pg'] ? 'PostgreSQL' : 'MySQL',
    };
  }
  
  return { detected: false };
}

/**
 * Detect all patterns in a snapshot
 * 
 * @param {object} snapshot - Snapshot object
 * @returns {object} All detected patterns
 */
export function detectAllPatterns(snapshot) {
  return {
    auth: detectAuthPattern(snapshot),
    forms: detectFormPattern(snapshot),
    api: detectAPIPattern(snapshot),
    stateManagement: detectStateManagement(snapshot),
    database: detectDatabasePattern(snapshot),
  };
}
```

### 3. analyzers/conflicts.js (Conflict Detector)

```javascript
import { createLogger } from '../services/logger.js';

const log = createLogger('conflicts');

/**
 * Check for schema conflicts
 * Frontend expects one shape, backend provides another
 * 
 * @param {object} frontendExpectation - What frontend expects
 * @param {object} backendSchema - What backend provides
 * @returns {object} Conflict info
 */
export function checkSchemaConflict(frontendExpectation, backendSchema) {
  const conflicts = [];
  
  if (!frontendExpectation || !backendSchema) {
    return { hasConflict: false, conflicts: [] };
  }
  
  // Compare field names
  for (const [field, expectedType] of Object.entries(frontendExpectation)) {
    if (!backendSchema[field]) {
      conflicts.push({
        type: 'missing_field',
        field,
        issue: `Frontend expects '${field}' but backend doesn't provide it`,
      });
      continue;
    }
    
    // Check type compatibility
    const backendType = backendSchema[field];
    if (expectedType !== backendType) {
      conflicts.push({
        type: 'type_mismatch',
        field,
        issue: `Frontend expects ${field}: ${expectedType}, backend provides ${field}: ${backendType}`,
      });
    }
  }
  
  // Check for extra fields in backend (not always a conflict, but worth noting)
  for (const field of Object.keys(backendSchema)) {
    if (!frontendExpectation[field]) {
      conflicts.push({
        type: 'extra_field',
        field,
        issue: `Backend provides '${field}' but frontend doesn't expect it`,
        severity: 'low',
      });
    }
  }
  
  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Check for route conflicts
 * 
 * @param {object} newRoute - Route to add { path, method }
 * @param {Array<object>} existingRoutes - Existing routes
 * @returns {object} Conflict info
 */
export function checkRouteConflict(newRoute, existingRoutes) {
  if (!newRoute || !existingRoutes) {
    return { hasConflict: false };
  }
  
  // Check for exact match (same path and method)
  const exactMatch = existingRoutes.find(
    r => r.path === newRoute.path && r.method === newRoute.method
  );
  
  if (exactMatch) {
    return {
      hasConflict: true,
      type: 'duplicate_route',
      message: `Route ${newRoute.method} ${newRoute.path} already exists`,
      existingRoute: exactMatch,
    };
  }
  
  // Check for similar paths (might be typo)
  const similarRoutes = existingRoutes.filter(r => {
    // Remove trailing slashes for comparison
    const newPath = newRoute.path.replace(/\/$/, '');
    const existingPath = r.path.replace(/\/$/, '');
    
    // Check if paths are very similar (e.g., /user vs /users)
    const distance = levenshteinDistance(newPath, existingPath);
    return distance <= 2 && distance > 0;
  });
  
  if (similarRoutes.length > 0) {
    return {
      hasConflict: false, // Not a hard conflict, but worth noting
      warning: true,
      message: `Similar routes exist, double-check this isn't a typo`,
      similarRoutes,
    };
  }
  
  return { hasConflict: false };
}

/**
 * Check for dependency conflicts
 * 
 * @param {object} newDep - New dependency { name, version }
 * @param {object} existingDeps - Existing dependencies
 * @returns {object} Conflict info
 */
export function checkDependencyConflict(newDep, existingDeps) {
  if (!newDep || !existingDeps) {
    return { hasConflict: false };
  }
  
  const existingVersion = existingDeps[newDep.name];
  
  if (!existingVersion) {
    return { hasConflict: false };
  }
  
  // Check if versions match
  if (existingVersion === newDep.version) {
    return {
      hasConflict: false,
      message: `${newDep.name} already installed at correct version`,
    };
  }
  
  // Version mismatch
  return {
    hasConflict: true,
    type: 'version_mismatch',
    message: `${newDep.name} version mismatch: installed ${existingVersion}, requested ${newDep.version}`,
    resolution: 'Update package.json or choose compatible version',
  };
}

/**
 * Check for naming conflicts
 * 
 * @param {string} newName - New component/function/variable name
 * @param {Array<string>} existingNames - Existing names
 * @returns {object} Conflict info
 */
export function checkNamingConflict(newName, existingNames) {
  if (!newName || !existingNames) {
    return { hasConflict: false };
  }
  
  const exactMatch = existingNames.find(
    name => name.toLowerCase() === newName.toLowerCase()
  );
  
  if (exactMatch) {
    return {
      hasConflict: true,
      message: `Name '${newName}' already exists (${exactMatch})`,
      recommendation: `Choose a different name or check if you can reuse the existing one`,
    };
  }
  
  // Check for very similar names
  const similar = existingNames.find(name => {
    const distance = levenshteinDistance(
      name.toLowerCase(),
      newName.toLowerCase()
    );
    return distance <= 2 && distance > 0;
  });
  
  if (similar) {
    return {
      hasConflict: false,
      warning: true,
      message: `Similar name exists: '${similar}'. Is this intentional?`,
    };
  }
  
  return { hasConflict: false };
}

/**
 * Levenshtein distance (string similarity)
 * Simple implementation for detecting typos
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[len1][len2];
}
```

### 4. analyzers/github.js (GitHub Fallback - Optional)

```javascript
import { Octokit } from '@octokit/rest';
import { createLogger } from '../services/logger.js';

const log = createLogger('github');

let octokit = null;

/**
 * Initialize Octokit client
 */
function getOctokit() {
  if (!octokit && process.env.GITHUB_TOKEN) {
    octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
    log.info('GitHub API client initialized');
  }
  
  return octokit;
}

/**
 * Check if GitHub fallback is available
 */
export function isGitHubAvailable() {
  return !!(
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_OWNER &&
    process.env.GITHUB_REPO_FRONTEND &&
    process.env.GITHUB_REPO_BACKEND
  );
}

/**
 * Fetch file content from GitHub
 * 
 * @param {string} repo - 'frontend' or 'backend'
 * @param {string} path - File path in repo
 * @returns {Promise<string|null>} File content or null
 */
export async function fetchFileContent(repo, path) {
  const client = getOctokit();
  if (!client) {
    log.warn('GitHub API not available (missing GITHUB_TOKEN)');
    return null;
  }
  
  const repoName = repo === 'frontend'
    ? process.env.GITHUB_REPO_FRONTEND
    : process.env.GITHUB_REPO_BACKEND;
  
  try {
    const { data } = await client.repos.getContent({
      owner: process.env.GITHUB_OWNER,
      repo: repoName,
      path: path,
    });
    
    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    
    log.debug(`Fetched ${path} from GitHub`);
    
    return content;
    
  } catch (error) {
    if (error.status === 404) {
      log.debug(`File not found on GitHub: ${path}`);
    } else {
      log.error(`GitHub API error fetching ${path}`, error.message);
    }
    return null;
  }
}

/**
 * Fetch directory listing from GitHub
 * 
 * @param {string} repo - 'frontend' or 'backend'
 * @param {string} path - Directory path
 * @returns {Promise<Array<string>>} File names
 */
export async function fetchDirectoryListing(repo, path) {
  const client = getOctokit();
  if (!client) {
    return [];
  }
  
  const repoName = repo === 'frontend'
    ? process.env.GITHUB_REPO_FRONTEND
    : process.env.GITHUB_REPO_BACKEND;
  
  try {
    const { data } = await client.repos.getContent({
      owner: process.env.GITHUB_OWNER,
      repo: repoName,
      path: path,
    });
    
    if (Array.isArray(data)) {
      return data.map(item => item.name);
    }
    
    return [];
    
  } catch (error) {
    log.error(`GitHub API error listing ${path}`, error.message);
    return [];
  }
}

/**
 * Check GitHub API rate limit
 * 
 * @returns {Promise<object>} Rate limit info
 */
export async function checkRateLimit() {
  const client = getOctokit();
  if (!client) {
    return null;
  }
  
  try {
    const { data } = await client.rateLimit.get();
    
    const remaining = data.rate.remaining;
    const threshold = parseInt(process.env.GITHUB_RATE_LIMIT_THRESHOLD || '100', 10);
    
    if (remaining < threshold) {
      log.warn(`GitHub API rate limit low: ${remaining} requests remaining`);
    }
    
    return {
      limit: data.rate.limit,
      remaining: data.rate.remaining,
      reset: new Date(data.rate.reset * 1000),
    };
    
  } catch (error) {
    log.error('Failed to check GitHub rate limit', error.message);
    return null;
  }
}
```

### 5. researcherAgent.js (Main Agent Logic)

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';
import { createLogger } from '../services/logger.js';
import * as redis from '../services/redis.js';
import { logMessage, logActivity } from '../services/supabase.js';
import * as snapshot from './analyzers/snapshot.js';
import * as patterns from './analyzers/patterns.js';
import * as conflicts from './analyzers/conflicts.js';
import * as github from './analyzers/github.js';

const log = createLogger('researcher');

/**
 * Initialize Anthropic client
 */
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * System prompt for Researcher
 */
const SYSTEM_PROMPT = `You are Researcher, a code analysis specialist for PromptDock.

Your role:
- Analyze existing codebases to understand patterns and architecture
- Detect potential conflicts before implementation
- Recommend integration approaches
- Prevent code duplication
- Ensure consistency across the codebase

You have access to:
- Repository snapshots (file structure, patterns, dependencies, schemas)
- Pattern detection algorithms (auth, forms, APIs, state management, databases)
- Conflict checking tools (schema mismatches, route duplicates, naming conflicts)

Analysis approach:
1. Focus on the specific question asked
2. Provide concrete examples from the codebase with file paths
3. Flag conflicts clearly with severity levels
4. Recommend specific integration points (exact files and functions)
5. Cite file paths and line numbers when relevant

Response format:
Your response should be a JSON object with this structure:
{
  "findings": {
    "frontend": { /* what exists in frontend */ },
    "backend": { /* what exists in backend */ }
  },
  "conflicts": [ /* array of conflict objects */ ],
  "recommendations": {
    "approach": "description",
    "integration_points": { /* specific files/functions */ }
  },
  "existing_patterns": { /* detected patterns */ },
  "confidence": "low|medium|high|very_high"
}

Important:
- Always provide file paths, not just descriptions
- Be specific: "Create src/context/AuthContext.tsx" not "add a context"
- Flag ALL conflicts, even minor ones
- If no snapshot available, say so clearly
- If uncertain, mark confidence as "low" and explain why

Current date and time: ${new Date().toISOString()}`;

/**
 * Handle incoming research request
 */
async function handleResearchRequest(message) {
  const requestId = message.id;
  const question = message.payload.question;
  const repos = message.payload.repos || ['both'];
  const focusAreas = message.payload.focus_areas || [];
  
  log.info(`Processing research request: ${requestId}`);
  log.debug('Request details', { question, repos, focusAreas });
  
  try {
    // Fetch snapshots for requested repos
    const snapshotsToFetch = repos.includes('both')
      ? ['frontend', 'backend']
      : repos;
    
    const snapshotData = {};
    
    for (const repo of snapshotsToFetch) {
      const snap = await snapshot.getLatestSnapshot(repo);
      
      if (snap) {
        snapshotData[repo] = snap;
        
        // Check snapshot age
        const age = snapshot.getSnapshotAge(snap);
        const ageMinutes = Math.floor(age / 60000);
        
        log.info(`Snapshot for ${repo}: ${ageMinutes} minutes old`);
        
        // Warn if stale
        const threshold = parseInt(process.env.SNAPSHOT_STALE_THRESHOLD || '600000', 10);
        if (age > threshold) {
          log.warn(`Snapshot for ${repo} is stale, consider GitHub fallback`);
        }
      } else {
        log.warn(`No snapshot available for ${repo}`);
        
        // Try GitHub fallback if available
        if (github.isGitHubAvailable()) {
          log.info(`Attempting GitHub fallback for ${repo}`);
          // Note: Full GitHub fallback would fetch package.json, file listings, etc.
          // For MVP, we'll just note it's unavailable
        }
      }
    }
    
    // If no snapshots at all, return early
    if (Object.keys(snapshotData).length === 0) {
      const response = {
        request_id: requestId,
        error: 'No repository snapshots available',
        suggestion: 'Run workers to create snapshots, or check Supabase connection',
        analysis: null,
      };
      
      await publishResponse(message.from, response);
      return;
    }
    
    // Extract relevant context
    const context = {};
    for (const [repo, snap] of Object.entries(snapshotData)) {
      context[repo] = snapshot.extractRelevantContext(snap, question, focusAreas);
    }
    
    // Detect patterns
    const detectedPatterns = {};
    for (const [repo, snap] of Object.entries(snapshotData)) {
      detectedPatterns[repo] = patterns.detectAllPatterns(snap);
    }
    
    // Analyze with Claude
    const analysis = await analyzeWithClaude(question, context, detectedPatterns, focusAreas);
    
    // Prepare response
    const response = {
      request_id: requestId,
      analysis: analysis,
      snapshot_ages: Object.fromEntries(
        Object.entries(snapshotData).map(([repo, snap]) => [
          repo,
          Math.floor(snapshot.getSnapshotAge(snap) / 1000)
        ])
      ),
    };
    
    // Publish response
    await publishResponse(message.from, response);
    
    // Log to Supabase
    await logActivity('researcher', 'info', `Completed research: ${requestId}`, {
      question,
      confidence: analysis.confidence,
    });
    
    log.info(`Research request ${requestId} completed`);
    
  } catch (error) {
    log.error(`Research request ${requestId} failed`, error);
    
    // Send error response
    await publishResponse(message.from, {
      request_id: requestId,
      error: error.message,
      analysis: null,
    });
  }
}

/**
 * Analyze with Claude API
 */
async function analyzeWithClaude(question, context, detectedPatterns, focusAreas) {
  log.info('Analyzing with Claude...');
  
  const prompt = `Analyze this codebase and answer the question.

**Question**: ${question}

${focusAreas.length > 0 ? `**Focus Areas**: ${focusAreas.join(', ')}` : ''}

**Repository Context**:
${JSON.stringify(context, null, 2)}

**Detected Patterns**:
${JSON.stringify(detectedPatterns, null, 2)}

Provide a structured analysis in JSON format as specified in your system prompt.`;
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    // Extract text response
    const textBlocks = response.content.filter(block => block.type === 'text');
    const text = textBlocks.map(block => block.text).join('\n');
    
    // Try to parse as JSON
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;
      
      const analysis = JSON.parse(jsonText);
      
      log.info('Analysis complete', { confidence: analysis.confidence });
      
      return analysis;
      
    } catch (parseError) {
      log.error('Failed to parse Claude response as JSON', parseError);
      
      // Return text response wrapped in structure
      return {
        findings: { note: 'Analysis returned as text, not JSON' },
        conflicts: [],
        recommendations: { approach: text },
        existing_patterns: detectedPatterns,
        confidence: 'low',
      };
    }
    
  } catch (error) {
    log.error('Claude API error', error);
    throw error;
  }
}

/**
 * Publish response back to requesting agent
 */
async function publishResponse(targetAgent, response) {
  await redis.publish(targetAgent || 'agent:chatter', {
    id: uuidv4(),
    from: 'researcher',
    to: targetAgent || 'chatter',
    type: 'response',
    payload: response,
    timestamp: new Date().toISOString(),
  });
  
  // Also log to Supabase
  await logMessage('researcher', targetAgent || 'chatter', 'response', response);
}

/**
 * Start the Researcher agent
 */
async function start() {
  log.info('Starting Researcher agent...');
  
  try {
    // Verify Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    log.info('Connecting to Redis...');
    const redisClient = redis.getRedisClient();
    await redisClient.ping();
    log.info('✓ Redis connected');
    
    // Subscribe to researcher channel
    await redis.subscribe('agent:researcher', handleResearchRequest);
    log.info('✓ Subscribed to: agent:researcher');
    
    // Check if GitHub fallback is available
    if (github.isGitHubAvailable()) {
      log.info('✓ GitHub fallback available');
      
      // Check rate limit
      const rateLimit = await github.checkRateLimit();
      if (rateLimit) {
        log.info(`GitHub API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining`);
      }
    } else {
      log.warn('GitHub fallback not available (set GITHUB_TOKEN to enable)');
    }
    
    // Log startup to Supabase
    await logActivity('researcher', 'info', 'Researcher agent started');
    
    log.info('Researcher agent is ready!');
    log.info('Waiting for research requests...');
    
  } catch (error) {
    log.error('Failed to start Researcher agent', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  log.info(`Received ${signal}, shutting down...`);
  
  try {
    await logActivity('researcher', 'info', 'Researcher agent shutting down');
    await redis.closeAll();
    
    log.info('✓ Researcher agent stopped');
    process.exit(0);
    
  } catch (error) {
    log.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

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

### 6. README.md (Agent Documentation)

```markdown
# Researcher Agent

Code analysis specialist for PromptDock.

## What Is This?

Researcher is the "memory" of PromptDock. It knows what code already exists and prevents you from:
- Rebuilding features that already exist
- Creating conflicting implementations
- Using inconsistent patterns

## How It Works

```
Chatter: "Do we have authentication?"
  ↓
Researcher: 
  1. Fetch latest snapshots from Supabase
  2. Search for auth-related files
  3. Detect auth pattern (JWT, sessions, etc.)
  4. Analyze with Claude
  5. Return structured findings
  ↓
Chatter: "No auth found. Safe to implement."
```

## Setup

### Prerequisites

- Command File 1 (Core Infrastructure) deployed
- Supabase with repo_snapshots table
- Anthropic API key

### Configuration

Verify in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx

# Optional GitHub fallback
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=your-username
GITHUB_REPO_FRONTEND=my-app-frontend
GITHUB_REPO_BACKEND=my-app-backend
```

### Start Locally

```bash
node src/agents/researcherAgent.js
```

### Deploy to Render

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
```

## Request Format

```json
{
  "question": "Do we have authentication implemented?",
  "repos": ["backend", "frontend"],
  "focus_areas": ["auth patterns", "JWT handling"]
}
```

## Response Format

```json
{
  "findings": {
    "frontend": {
      "auth_exists": false,
      "checked_locations": ["src/components/", "src/hooks/"]
    },
    "backend": {
      "auth_exists": true,
      "files": ["src/middleware/auth.js"],
      "pattern": "JWT"
    }
  },
  "conflicts": [],
  "recommendations": {
    "approach": "Implement from scratch",
    "integration_points": {
      "frontend": "Create src/context/AuthContext.tsx",
      "backend": "Already exists at src/middleware/auth.js"
    }
  },
  "confidence": "high"
}
```

## Pattern Detection

Researcher automatically detects:

**Frontend:**
- State management (Redux, Zustand, Context)
- Form libraries (React Hook Form, Formik)
- API clients (axios, fetch, React Query)
- Component patterns

**Backend:**
- Auth patterns (JWT, Passport, OAuth)
- API frameworks (Express, Fastify, Next.js)
- ORMs (Prisma, TypeORM, Sequelize)
- Database type

## Conflict Detection

Catches:
- Route mismatches (/user vs /users)
- Schema mismatches (different field names)
- Dependency version conflicts
- Naming conflicts (duplicate components)

## Troubleshooting

### "No snapshots available"

Snapshots are created by workers. Run workers to generate snapshots.

### "Snapshot is stale"

Snapshots older than 10 minutes trigger warning. Workers should sync snapshots after each task.

### "Claude returns text instead of JSON"

Claude occasionally returns analysis as text. Researcher handles this gracefully.

## Next Steps

After Researcher is running, test with Chatter asking questions about the codebase.
```

---

## Deployment Configuration

Update `promptdock/render.yaml`:

```yaml
services:
  # ... existing services ...
  
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
      - key: LOG_LEVEL
        value: info
      - key: SNAPSHOT_STALE_THRESHOLD
        value: "600000"
```

## Testing Steps

### Test 1: Agent Startup

```bash
node src/agents/researcherAgent.js
```

**Pass if:** Connects to Redis, subscribes to agent:researcher

---

### Test 2: Snapshot Retrieval

First, manually insert test snapshot:
```sql
insert into repo_snapshots (repo, file_tree, patterns, dependencies) values (
  'frontend',
  '{"src/": ["App.tsx"], "src/components/": ["Button.tsx"]}',
  '{"stateManagement": "Context"}',
  '{"react": "18.2.0"}'
);
```

Then request:
```bash
redis-cli PUBLISH agent:researcher '{"id":"test-1","from":"test","to":"researcher","type":"question","payload":{"question":"What components exist?","repos":["frontend"]}}'
```

**Pass if:** Researcher retrieves snapshot and responds

---

### Test 3: Pattern Detection

```bash
redis-cli PUBLISH agent:researcher '{"id":"test-2","from":"test","to":"researcher","type":"question","payload":{"question":"What form library do we use?","repos":["frontend"],"focus_areas":["forms"]}}'
```

**Pass if:** Detects form pattern from snapshot

---

### Test 4: No Snapshot Handling

```bash
# Clear snapshots
delete from repo_snapshots;

# Request analysis
redis-cli PUBLISH agent:researcher '{"id":"test-3","from":"test","to":"researcher","type":"question","payload":{"question":"Check auth","repos":["backend"]}}'
```

**Pass if:** Returns "No snapshots available" error

---

### Test 5: Claude Analysis

With snapshots present:
```bash
redis-cli PUBLISH agent:researcher '{"id":"test-4","from":"test","to":"researcher","type":"question","payload":{"question":"Do we have authentication?","repos":["both"]}}'
```

**Pass if:** Claude analyzes and returns JSON response

---

## Completion Checklist

- [ ] Supabase repo_snapshots table created
- [ ] All analyzer files created
- [ ] researcherAgent.js main logic complete
- [ ] README.md documentation complete
- [ ] package.json updated with @octokit/rest
- [ ] All 5 tests pass
- [ ] Agent starts without errors
- [ ] Can retrieve snapshots from Supabase
- [ ] Pattern detection works
- [ ] Conflict detection works
- [ ] Claude analysis returns JSON
- [ ] Handles missing snapshots gracefully
- [ ] Logs to Supabase correctly
- [ ] Ready for Render deployment

## Expected Output

**Startup:**
```
[10:30:15] [INFO    ] [researcher] Starting Researcher agent...
[10:30:15] [INFO    ] [researcher] Connecting to Redis...
[10:30:16] [INFO    ] [researcher] ✓ Redis connected
[10:30:16] [INFO    ] [researcher] ✓ Subscribed to: agent:researcher
[10:30:16] [INFO    ] [researcher] GitHub fallback not available
[10:30:16] [INFO    ] [researcher] Researcher agent is ready!
```

**Processing Request:**
```
[10:31:45] [INFO    ] [researcher] Processing research request: abc-123
[10:31:46] [INFO    ] [researcher] Snapshot for frontend: 5 minutes old
[10:31:46] [INFO    ] [researcher] Snapshot for backend: 3 minutes old
[10:31:47] [INFO    ] [researcher] Analyzing with Claude...
[10:31:52] [INFO    ] [researcher] Analysis complete { confidence: 'high' }
[10:31:52] [INFO    ] [researcher] Research request abc-123 completed
```

---

**Command File 4 Complete: ~1,550 lines**

All 4 core command files are now complete! You have:
1. Core Infrastructure (Command File 1)
2. Local Worker Template (Command File 2)
3. Chatter Agent (Command File 3)
4. Researcher Agent (Command File 4)

Ready to build! 🚀
