# Harnessforce Architecture

This document describes the internal architecture of Harnessforce -- what it is, how every piece fits together, and what makes it different from generic agent harnesses like Claude Code or LangChain Deep Agents. If you want to build something like this for another platform, this is your blueprint.

---

## What This Is

Harnessforce is a terminal-based AI agent that does Salesforce development work. It's a pnpm monorepo with two packages:

```
libs/harnessforce/    → harnessforce-core (npm)   — agent engine, tools, prompts, middleware
apps/cli/             → harnessforce (npm)         — Ink-based TUI, commands, rendering
```

The core library builds the LangGraph agent, assembles the system prompt, manages sessions, and streams events. The CLI package renders the terminal UI, handles user input, and translates slash commands.

**Stack:** TypeScript, LangGraph (`createReactAgent`), LangChain (ChatOpenAI/ChatAnthropic), Ink (React for terminals), Playwright (browser automation), MCP SDK (server + client), Zod (tool schemas).

---

## How the Agent Is Built

**Entry point:** `libs/harnessforce/src/index.ts` → `createHarnessforceAgent()`

### System Prompt Assembly

The system prompt is built from layered sources, each serving a distinct purpose:

```
┌─────────────────────────────────────────┐
│  SYSTEM_PROMPT (system.ts)              │  ← Core behavior rules, safety, Salesforce expertise
│  + Tool Guidance (tool-guidance.ts)     │  ← Per-tool best practices (core tools only)
│  + Output Style overlay (optional)      │  ← Explanatory / learning mode
│  + Project Context (detector.ts)        │  ← SFDX project name, API version, org, git state
│  + Memory (agent.md files)              │  ← Learnings from previous sessions
│  + FORCE.md + CLAUDE.md instructions    │  ← User/team project instructions (4 layers)
│  + Skills summary (top 10)              │  ← Skill names + triggers for agent awareness
│  + SF Knowledge reference               │  ← Compact list of 16 topics (NOT full content)
└─────────────────────────────────────────┘
```

**What makes this different from Claude Code / Deep Agents:**

- **Domain-specific prompt layers.** 4,200+ lines of Salesforce expertise across 18 prompt files in `libs/harnessforce/src/prompts/`. All lazy-loaded via `sf_knowledge` — the system prompt carries only core behavior rules and a topic reference. The agent loads Agentforce, Data Cloud, metadata patterns, governor limits, etc. on demand.
- **Lazy-loaded knowledge.** All 16 SF knowledge topics are NOT injected into the system prompt. The agent gets a one-line summary and uses the `sf_knowledge` tool to load full content on demand. Topics: governor limits, Apex architecture, trigger patterns, LWC, flows, SOQL, deployment, testing, API strategy, integration, metadata patterns, Agentforce, Data Cloud, self-discovery, unsupported metadata, extensibility. This saves ~25K tokens per turn.
- **FORCE.md + CLAUDE.md interop.** Like CLAUDE.md for Claude Code, but Salesforce-aware. Four layers merge: `~/.harnessforce/FORCE.md` (user global), `FORCE.md` (project), `FORCE.local.md` (local overrides), and `.claude/CLAUDE.md` (Claude Code project instructions). See `libs/harnessforce/src/middleware/memory.ts` → `loadForceInstructions()`.

### Prompt Caching

The assembled prompt is wrapped with Anthropic's cache control:

```typescript
new SystemMsg({
  content: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }]
});
```

Since the system prompt is static within a session, every turn after the first hits cache -- ~90% cost reduction on the prompt portion. This is the same pattern used by LangChain Deep Agents. See `libs/harnessforce/src/index.ts` around the graph creation.

### Tool Composition

Tools are assembled from multiple sources and merged into a single array:

```
Tier 1 tools (~26 always available)
  + Tier 2 tools (activated on demand via request_tools)
  + MCP server tools (discovered at runtime from ~/.harnessforce/mcp.json)
  + Plugin tools (loaded from ~/.harnessforce/plugins/)
  → combinedTools (passed to createReactAgent)
```

With tiered tool loading enabled, the agent starts with ~26 tools and uses `request_tools` to activate categories (browser, agentforce, data-cloud, extended-sf, discovery, docs). Without tiered loading, context-aware filtering provides ~25-40 tools based on project type.

MCP tools are prefixed `mcp_{server}_{tool}` to avoid name collisions. See `libs/harnessforce/src/mcp/client.ts`.

### Graph Creation

```typescript
const graph = createReactAgent({
  llm,                    // ChatOpenAI or ChatAnthropic via ModelRegistry
  tools: gatedTools,      // 26-60 tools, wrapped with approval gate
  prompt: cachedPrompt,   // SystemMessage with cache_control
  checkpointer: new MemorySaver(),  // In-memory state per thread_id
});
```

This is LangGraph's built-in ReAct agent. The checkpointer enables multi-turn conversations and session resumption via thread IDs.

When model routing is enabled, the graph is rebuilt per-turn with the appropriate model tier. When tiered tool loading activates new categories, the graph is rebuilt with the expanded tool set.

---

## Tools (60 Built-In)

**File:** `libs/harnessforce/src/tools/index.ts` → `allTools` array

### Tool Categories

| Category | Count | File | What They Do |
|----------|-------|------|-------------|
| Core filesystem | 8 | various | read_file, write_file, edit_file, execute, glob, grep, ls, task |
| Salesforce CLI | 12 | `tools/salesforce.ts` | sf_query, sf_deploy, sf_retrieve, sf_run_apex, sf_run_tests, sf_data, sf_org_limits, etc. |
| Metadata discovery | 3 | `tools/discovery.ts` | sf_list_metadata_types, sf_describe_all_sobjects, sf_list_metadata_of_type |
| Extended Salesforce | 12 | `tools/sf-extended.ts` | scratch orgs, packages, deploy status/cancel, test coverage, data export, sandboxes, event logs |
| Docs | 2 | `tools/docs.ts` | sf_docs_search, sf_docs_read |
| Browser automation | 6 | `tools/browser.ts` | browser_open, browser_click, browser_fill, browser_screenshot, browser_execute, browser_close |
| Agentforce | 4 | `tools/agentforce.ts` | agent_publish, agent_activate, agent_validate, agent_preview |
| Data Cloud | 7 | `tools/datacloud*.ts` | dc_query, dc_list_objects, dc_describe, dc_ingest_streaming, dc_ingest_bulk, dc_create_identity_resolution, dc_create_segment |
| Web | 2 | `tools/web-search.ts` | web_search, web_fetch |
| Planning & knowledge | 4 | various | write_todos, sf_knowledge, agent_spawn, request_tools |

### Tiered Tool Loading

**Files:** `tools/tool-tiers.ts`, `tools/request-tools.ts`

To reduce per-turn token cost, tools are organized into two tiers:

- **Tier 1** (~26 tools, always bound): core filesystem (8), core SF (12), web (2), sf_knowledge, write_todos, agent_spawn, request_tools
- **Tier 2** (loaded on demand via `request_tools`): browser (6), agentforce (4), data-cloud (7), extended-sf (12), discovery (3), docs (2)

The agent calls `request_tools({ category: "browser" })` to activate a category. The graph is rebuilt with the expanded tool set on the next turn.

Savings: reduces per-turn tool schema tokens from ~60 tools (~18K) to ~26 tools (~8K) = ~10K tokens saved per turn before prompt caching.

### Domain Expertise in Tools

Tools aren't thin CLI wrappers -- they enforce Salesforce best practices:

- **sf_deploy** -- Queries `Organization.IsSandbox` to detect production orgs, auto-adds `--test-level RunLocalTests` for production deploys.
- **sf_query** -- Parses SOQL before execution: warns on missing WHERE/LIMIT for large standard objects (Account, Contact, Case, Lead, Opportunity, Task, Event), detects non-selective leading wildcards in LIKE clauses.
- **sf_run_apex** -- Scans anonymous Apex for governor limit patterns before execution: DML/SOQL inside for loops, missing LIMIT on queries.
- **sf_run_tests** -- Adds `--code-coverage` flag, parses `orgWideCoverage` and warns if below 75% production minimum, returns structured failure summaries (up to 10 failures) instead of raw stack traces.
- **write_file** -- Validates PascalCase class names on `.cls` files, checks for `with sharing` declaration, validates `@isTest` on test classes, auto-creates companion `-meta.xml` if missing.
- **agent_spawn** -- Subagent output exceeding ~420 tokens is automatically summarized via LLM before returning to the parent context (93% context savings).

### How SF Tools Work

All Salesforce tools wrap the `sf` CLI via `runSfCommand()` in `tools/sf-cli.ts`. They don't use Salesforce APIs directly -- they shell out to the CLI, parse JSON output, and handle errors.

```typescript
// tools/sf-cli.ts → runSfCommand()
execFile("sf", [...args, "--json"], { timeout: 60_000 }, (err, stdout) => {
  // Parse JSON, handle INVALID_SESSION, REQUEST_LIMIT_EXCEEDED, etc.
});
```

**Why wrap the CLI instead of using APIs?** Because the `sf` CLI handles auth, session refresh, SFDX project context, and org management. Rebuilding that in JS would be thousands of lines for no benefit. The CLI is the source of truth for Salesforce developers.

### Browser Automation

Playwright runs as a singleton browser instance shared across tool calls. This lets the agent navigate Salesforce Setup pages, click through UI-only configuration, fill forms, and take screenshots -- all in one persistent browser session.

The agent uses `browser_execute` with `shadowRoot.querySelector()` to pierce Lightning's Shadow DOM -- a Salesforce-specific technique documented in the system prompt.

**File:** `libs/harnessforce/src/tools/browser.ts`

---

## Model System

### Provider Priority

**File:** `libs/harnessforce/src/models/config.ts` → `getDefaultConfig()`

Harnessforce auto-detects the best available provider from environment variables:

1. **Bedrock Gateway** (enterprise) -- detected when `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BEDROCK_BASE_URL` are set. Zero cost for enterprise users with LLM Gateway Express access. Maps directly to the Claude Code `settings.json` env vars.
2. **Direct Anthropic** -- detected when `ANTHROPIC_API_KEY` is set. ~15-30% cheaper than OpenRouter (no middleman markup).
3. **OpenRouter** (default fallback) -- requires key via `/set-key`. Provides access to 200+ models from all providers.

### Model Registry

**File:** `libs/harnessforce/src/models/registry.ts`

The `ModelRegistry` class instantiates LangChain chat models from a unified config:

| Provider Type | How It Works | Example |
|--------------|-------------|---------|
| `cloud` | Direct API (ChatAnthropic or ChatOpenAI) | Anthropic, OpenAI |
| `local` | OpenAI-compatible API at localhost | Ollama, vLLM |
| `gateway` | OpenAI-compatible API with auth at remote URL | OpenRouter, LiteLLM, Bedrock Gateway |

Model ID format: `provider:model` (e.g., `openrouter:anthropic/claude-opus-4.6`, `bedrock-gateway:us.anthropic.claude-opus-4-6-v1`).

Gateway providers support `NODE_EXTRA_CA_CERTS` for corporate SSL certificates (essential for enterprise Bedrock Gateway behind corporate proxies).

Config stored at `~/.harnessforce/models.yaml`. API keys support environment variable references (`${OPENROUTER_API_KEY}`, `${ANTHROPIC_AUTH_TOKEN}`). The `/provider` and `/model` commands manage this from inside the TUI.

### Model Routing

**File:** `libs/harnessforce/src/models/router.ts`

Optional per-turn model routing selects cheap/standard/premium models based on message content:

| Tier | When | Default Model |
|------|------|--------------|
| Cheap | Short confirmations ("yes", "ok", "go ahead"), follow-ups after turn 5 | Gemini Flash / Haiku |
| Standard | Code generation, multi-step tasks, debugging | Sonnet |
| Premium | Keywords like "refactor", "architect", "design pattern", "migration strategy" | Opus |

Disabled by default. Enable via `routing.enabled: true` in config. When active, the agent graph is rebuilt per-turn with the routed model while preserving the checkpointer and thread_id.

### Cost Tracking

**File:** `libs/harnessforce/src/cost/tracker.ts`

Tracks input/output tokens per model per session with pricing estimates. Supports OpenRouter, direct Anthropic, and Bedrock Gateway pricing (enterprise Bedrock is tracked as zero cost since it's covered by the org's enterprise agreement).

Budget enforcement with tiered warnings at 50%, 80%, and 100% of a configurable session budget (default: $1.00). Accessible via `/cost` command.

---

## Salesforce Knowledge System

**What makes this the core differentiator.** Generic harnesses know nothing about Salesforce. Harnessforce has 4,200+ lines of structured Salesforce expertise spread across 18 prompt files.

### Knowledge Architecture

All 16 topics are lazy-loaded via `sf_knowledge` tool (loaded when agent needs them):

```
  - sf-governor-limits.ts       → DML, SOQL, CPU, heap limits
  - sf-trigger-patterns.ts      → One-trigger-per-object, recursion control
  - sf-testing.ts               → Test factories, Assert class, governor limit testing
  - sf-flow.ts                  → Record-triggered, screen, orchestrator flows
  - sf-lwc.ts                   → Component patterns, wire adapters, lwc:dynamic
  - sf-soql.ts                  → Query optimization, FIELDS(), SOQL for loops
  - sf-api-strategy.ts          → REST, SOAP, Bulk, Streaming, OAuth (API v66.0)
  - sf-deployment.ts            → Source tracking, CI/CD, packages, validation
  - sf-apex-architecture.ts     → Service layers, selectors, trigger handlers
  - sf-integration.ts           → Platform Events (HighVolume), CDC, Named Credentials
  - sf-metadata-patterns.ts     → XML structure, Record Types, Custom Metadata Types
  - agentforce.ts               → ADLC lifecycle, Agent Script DSL, agent-spec generation, preview sessions
  - datacloud.ts                → Data 360 DMOs, ingestion, identity resolution
  - self-discovery.ts           → How to explore unfamiliar orgs
  - unsupported-metadata.ts     → Metadata types needing browser fallback
  - extensibility               → Skills, MCP, plugins, FORCE.md, restart requirements
```

**File:** `libs/harnessforce/src/tools/sf-knowledge.ts` → `sfKnowledgeTool`

The `sf_knowledge` tool does fuzzy matching on topic names and returns the full prompt content. The agent's system prompt tells it: "Before Salesforce platform work, call `sf_knowledge` to load relevant guidance."

### Context Detection

On startup, `detectProjectContext()` scans the working directory:

```typescript
// libs/harnessforce/src/context/detector.ts
{
  isSfdxProject: true,          // found sfdx-project.json
  projectName: "my-app",        // from sfdx-project.json
  apiVersion: "62.0",           // sourceApiVersion
  packageDirectories: ["force-app"],
  gitBranch: "feature/apex-service",
  gitStatus: "dirty",           // uncommitted changes
  defaultOrg: "dev-org"         // sf config get target-org
}
```

Git checks run in parallel (`Promise.all`) for 3x faster startup. This context is injected into the system prompt so the agent knows what project it's working in.

---

## Permission System

**File:** `libs/harnessforce/src/middleware/permissions.ts`

### Tool Risk Classification

Every tool is classified as `read`, `write`, or `destructive`:

| Risk | Examples | Count |
|------|----------|-------|
| `read` | sf_query, read_file, glob, grep, dc_query, browser_screenshot | 26 |
| `write` | write_file, edit_file, execute, browser_open | 7 |
| `destructive` | sf_deploy, sf_data, sf_run_apex, agent_publish, browser_click, dc_ingest_* | 13 |

Unknown tools default to `write` (fail-safe).

### Permission Modes

| Mode | read | write | destructive |
|------|------|-------|-------------|
| **plan** | auto | blocked | blocked |
| **default** | auto | auto | Y/N prompt |
| **yolo** | auto | auto | auto |
| **safe** | auto | blocked | blocked |

**Enforcement mechanism:** An `ApprovalGate` wraps every tool's `_call` method. When a destructive tool is called in default mode, the gate blocks execution by returning a Promise that only resolves when the user presses Y or N in the TUI.

### Production Org Detection

`detectProductionOrg()` runs `sf org display --json` and checks `isSandbox`/`isScratch` flags. If neither, it's production. The result is cached for the process lifetime. Production orgs auto-escalate risk levels.

---

## Middleware & Cost Control

### Stream Event Loop

The `stream()` method in `index.ts` is an async generator that processes LangGraph's `streamEvents`:

```
stream(message, threadId, permissionMode)
  │
  ├── Pre-turn: model routing → tiered tool rebuild → microcompact → proactive compaction (if >40K tokens) → budget check
  │
  ├── on_tool_start:
  │     → Unicode sanitization
  │     → Audit logging (.harnessforce/audit.log)
  │     → Pre-tool hooks
  │     → Permission gate (confirm/block based on mode + risk)
  │     → Dry-run validation for sf_deploy
  │
  ├── on_tool_end:
  │     → Smart output filtering (structured test results, slim query/describe output)
  │     → Output truncation (4K char cap, full result saved to disk)
  │     → PII detection on sf_query results
  │     → Post-tool hooks
  │
  ├── on_chat_model_stream:
  │     → Token-by-token streaming to TUI
  │
  ├── on_llm_end:
  │     → Cost tracking (input/output tokens per effective model)
  │
  └── Error recovery:
        → prompt_too_long: retry up to 3x with progressive compaction
        → Attempt 1: compact to 45K tokens, keep 8 recent messages
        → Attempt 2: compact to 30K tokens, keep 6 recent messages
        → Attempt 3: compact to 15K tokens, keep 4 recent messages
```

### Compaction (3 Layers)

1. **Microcompact** (`middleware/microcompact.ts`): In-place clearing of old tool results. Keeps recent 3 turns, replaces older tool result content with `[Old tool result cleared]`. Preserves message array identity so the MemorySaver cache prefix stays warm.

2. **Proactive compaction** (`middleware/summarization.ts`): When history exceeds 40K tokens (lowered from 60K for faster triggering), uses LLM-based summarization to compress older messages to ~200 words. Keeps 5 most recent messages. Falls back to string truncation if the LLM call fails. Writes compacted state back to MemorySaver via `updateState()`.

3. **Reactive recovery**: On `prompt_too_long` errors, retries with progressively aggressive compaction (45K → 30K → 15K target tokens).

### Smart Output Filtering

Before truncation, tool results are content-aware filtered to reduce token waste:

- **sf_run_tests**: Extracts test name + pass/fail status + org-wide coverage percentage. Drops raw stack traces, shows structured failure summary (up to 5 failures).
- **sf_query**: If >50 records, returns first 10 + count + message to narrow the query.
- **sf_describe_object**: If >50 fields, returns slim name/type/label/required only, drops picklist values and relationship details.

### Tool Output Persistence

Tool results exceeding 4K characters are truncated in context but the full output is saved to `.harnessforce/tool-results/{timestamp}-{tool}.txt`. The truncated version includes a note: "Full output saved to {path}" so the agent can re-read if needed.

---

## MCP Integration

Harnessforce supports MCP in both directions: as a **client** (connecting to external MCP servers) and as a **server** (exposing its tools to Claude Code and other MCP clients).

### MCP Client

**File:** `libs/harnessforce/src/mcp/client.ts`

Connects to external MCP servers via stdio transport. Config at `~/.harnessforce/mcp.json`:

```json
{
  "servers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

On startup, Harnessforce connects to each server, calls `listTools()`, and wraps discovered tools as LangChain StructuredTools prefixed `mcp_{server}_{tool}`. These merge into `combinedTools` alongside the built-in 60.

### MCP Server

**File:** `libs/harnessforce/src/mcp/server.ts`

**Command:** `harnessforce serve`

Exposes all 60 Harnessforce tools as an MCP server for Claude Code integration. This lets Claude Code users access full Salesforce domain expertise through their existing Claude subscription at zero additional LLM cost.

Key features:
- All tools exposed with proper JSON Schema (converted from Zod via a built-in converter)
- Risk annotations mapped from `TOOL_RISK_MAP`: read tools get `readOnlyHint: true`, destructive tools get `destructiveHint: true` (triggers confirmation in Claude Code)
- All 16 SF knowledge topics registered as MCP resources (`sf-knowledge://apex-architecture`, etc.) readable on demand
- Stdio transport for Claude Code compatibility

Claude Code config (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "harnessforce": {
      "command": "npx",
      "args": ["harnessforce", "serve"]
    }
  }
}
```

---

## Session Management

**File:** `libs/harnessforce/src/sessions/manager.ts`

Sessions persist as JSONL files at `.harnessforce/sessions/{id}.jsonl`. The MemorySaver checkpointer handles in-memory state per `thread_id`. Session resumption: `npx harnessforce --resume <id>` reloads the JSONL and passes messages as initial context.

---

## Skills System

**File:** `libs/harnessforce/src/skills/loader.ts`
**Directory:** `skills/` (30 files)

Skills are markdown files with YAML frontmatter:

```markdown
---
name: agentforce-build
description: Build an Agentforce agent using the ADLC workflow
trigger: when the user asks to build or create an Agentforce agent
---

# Agentforce Build Skill
[detailed instructions...]
```

The top 10 skills are summarized in the system prompt (name + trigger only). All 30 become slash commands -- typing `/agentforce-build` expands the skill's full content into a prompt sent to the agent.

**Shipped skills (30):** agent-persona, agent-spec-generation, agentforce-build, agentforce-observability, agentforce-test, apex-patterns, app-scaffold, ci-cd-pipeline, connected-app-setup, data-cloud-setup, data-migration, deployment-checklist, flow-advanced, headless-360, heroku-deploy, integration-patterns, lwc-development, metadata-generation, omnistudio-overview, orchestrator, org-setup, package-development, performance-optimization, remember, robot-framework-fallback, scratch-org-lifecycle, security-hardening, skill-creator, test-automation, visualforce-app.

---

## Memory System

**File:** `libs/harnessforce/src/middleware/memory.ts`

### Layers

1. **Agent memory** (`.harnessforce/agent.md`): Learnings from past sessions. The agent reads this every turn and writes discoveries back. Auto-extracted on session end via `libs/harnessforce/src/services/extract-memories.ts`.

2. **FORCE.md + CLAUDE.md** (project instructions): Four layers merge in priority order:
   - `~/.harnessforce/FORCE.md` — user-global preferences
   - `FORCE.md` in parent directories up to project root — team conventions
   - `FORCE.local.md` — local overrides (gitignored)
   - `.claude/CLAUDE.md` or `CLAUDE.md` — Claude Code project instructions (interop)

3. **Session history**: MemorySaver checkpointer + JSONL persistence for cross-process resumption.

---

## Hooks System

**File:** `libs/harnessforce/src/hooks/manager.ts`

Shell commands that execute in response to agent lifecycle events:

| Event | When |
|-------|------|
| `session-start` | Agent session begins |
| `session-end` | Agent session ends |
| `pre-tool-use` | Before any tool executes |
| `post-tool-use` | After any tool completes |
| `user-prompt-submit` | User sends a message |
| `pre-deploy` | Before sf_deploy |
| `post-deploy` | After sf_deploy |

Configured in `.harnessforce/settings.json`. Non-blocking, 30s timeout, errors don't crash the agent.

---

## TUI (Terminal UI)

**File:** `apps/cli/src/ui/app.tsx`

Built with Ink (React for terminals). Key architecture:

- **Streaming**: Event generator loop. AbortController per turn -- ESC aborts the stream and preserves partial response.
- **Virtual scrolling**: Only renders last 50 messages. Older messages hidden with "N older messages" indicator.
- **Tool rendering**: Tool results truncated to 500 chars in display. `edit_file` results render as unified diffs (red/green). Turns with 3+ tool calls get a summary line.
- **Command menu**: Type `/` to see autocomplete suggestions. Arrow keys navigate, Enter selects.
- **Permission cycling**: Shift+Tab cycles plan → default → yolo.

### Startup Flow (`apps/cli/src/index.tsx`)

1. Read model config, resolve API key (flag → env → config file)
2. Auto-detect provider priority: Bedrock Gateway → Direct Anthropic → OpenRouter
3. Detect SFDX project context (parallel git checks)
4. Print greeting with Agent Astro pixel art + provider/model/org/setup status
5. Discover orgs in background (non-blocking `sf org list`)
6. Create agent in background (TUI renders immediately, doesn't wait)
7. Hint about recent sessions for resumption

### Slash Commands

84 built-in slash commands + 30 skill commands. Two types:

- **Local commands**: Execute in-process, return result immediately (e.g., `/model`, `/provider`, `/provider bedrock`, `/query`, `/describe`, `/cost`, `/why`)
- **Prompt commands**: Expand into a prompt string sent to the agent (e.g., `/apex`, `/deploy`, `/agentforce-build`)

**File:** `apps/cli/src/commands/registry.ts`

---

## What Makes This Different

### vs Claude Code

Claude Code is a general-purpose coding agent. It has no awareness of Salesforce, no `sf` CLI integration, no Agentforce tools, no Data Cloud tools, no browser automation for Setup pages, no SFDX project detection, no governor limit knowledge, no deployment safety checks, and no skill system for domain workflows.

Harnessforce replicates Claude Code's core patterns (prompt caching, compaction, abort handling, session persistence, hooks, permission modes) but adds an entire Salesforce-specific layer on top: 35 SF/Agentforce/Data Cloud tools, 16 lazy-loaded knowledge topics, 30 domain skills, context-aware prompt injection, PII detection on query results, production org safety gates, and domain expertise baked into tool logic itself.

Harnessforce can also run as a Claude Code MCP server, so the two tools complement each other.

### vs LangChain Deep Agents

Deep Agents is a reference architecture for building LangGraph agents. Harnessforce uses the same foundation (`createReactAgent`, `MemorySaver`, `streamEvents`) but adds everything needed to make it production-ready for Salesforce work: a full TUI, 60 tools, middleware (compaction, permissions, hooks, cost tracking), a skills system, MCP extensibility (client + server), multi-provider model support with routing, and 4,200+ lines of Salesforce domain expertise.

### The Key Insight

Generic agent harnesses give you a chat loop with file/shell tools. That's necessary but not sufficient for specialized work. Harnessforce's value comes from the layers built around the generic agent:

1. **Domain tools** — SF CLI wrapping with best-practice enforcement, browser automation for Setup, Agentforce lifecycle, Data Cloud operations
2. **Domain knowledge** — 16 lazy-loaded topics covering every major Salesforce subsystem
3. **Domain skills** — 30 workflow templates that teach the agent how to approach SF-specific tasks
4. **Domain safety** — Production org detection, SOQL guardrails, governor limit scanning, deploy dry-runs, risk-classified tools
5. **Domain context** — Auto-detection of SFDX projects, orgs, git state injected into every conversation
6. **Cost optimization** — Tiered tools, model routing, aggressive compaction, smart output filtering, budget enforcement

---

## File Map

```
libs/harnessforce/src/
├── index.ts                    Agent factory + stream event loop (main entry)
├── tools/
│   ├── index.ts                allTools (60), getContextualTools(), getTieredTools()
│   ├── read-file.ts            read_file
│   ├── write-file.ts           write_file (+ Apex conventions enforcement)
│   ├── edit-file.ts            edit_file
│   ├── execute.ts              execute (shell command)
│   ├── glob.ts                 glob
│   ├── grep.ts                 grep
│   ├── ls.ts                   ls
│   ├── task.ts                 task
│   ├── salesforce.ts           12 core SF tools (+ SOQL guardrails, production safety, coverage enforcement)
│   ├── sf-cli.ts               runSfCommand() — the sf CLI wrapper
│   ├── sf-extended.ts          12 extended SF tools (scratch orgs, packages, etc.)
│   ├── discovery.ts            3 metadata discovery tools
│   ├── browser.ts              6 Playwright tools (singleton browser instance)
│   ├── agentforce.ts           4 Agentforce lifecycle tools
│   ├── datacloud.ts            3 Data Cloud query tools
│   ├── datacloud-ingest.ts     2 Data Cloud ingest tools
│   ├── datacloud-config.ts     2 Data Cloud config tools
│   ├── docs.ts                 2 SF docs search/read tools
│   ├── web-search.ts           2 web tools
│   ├── sf-knowledge.ts         Lazy-loaded SF knowledge (16 topics)
│   ├── agent-spawn.ts          Subagent with isolated context + output summarization
│   ├── todos.ts                Task/planning tool
│   ├── tool-tiers.ts           Tier 1/Tier 2 tool category definitions
│   └── request-tools.ts        Meta-tool: activate tool categories on demand
├── prompts/
│   ├── system.ts               Main system prompt
│   ├── tool-guidance.ts        Per-tool best practices
│   ├── self-discovery.ts       Org exploration guidance
│   ├── unsupported-metadata.ts Metadata needing browser fallback
│   ├── agentforce.ts           Agentforce/ADLC prompt (+ agent-spec, preview sessions, known bugs)
│   ├── datacloud.ts            Data Cloud prompt
│   ├── output-styles.ts        Explanatory/learning output modes
│   ├── sf-apex-architecture.ts Apex patterns
│   ├── sf-trigger-patterns.ts  Trigger best practices
│   ├── sf-testing.ts           Test patterns and strategies
│   ├── sf-lwc.ts               LWC component patterns
│   ├── sf-soql.ts              SOQL optimization
│   ├── sf-flow.ts              Flow design patterns
│   ├── sf-deployment.ts        Deployment strategies
│   ├── sf-api-strategy.ts      API selection guidance
│   ├── sf-integration.ts       Integration patterns
│   └── sf-metadata-patterns.ts Metadata XML structures
├── middleware/
│   ├── permissions.ts          Tool risk classification + permission modes
│   ├── approval-gate.ts        Blocking Y/N approval for destructive tools
│   ├── wrap-tools.ts           Wraps tool._call with approval gate
│   ├── memory.ts               FORCE.md + CLAUDE.md + agent.md loading
│   ├── microcompact.ts         Cache-preserving tool result clearing
│   └── summarization.ts        LLM-based compaction (200 words) + fallback truncation
├── context/
│   └── detector.ts             SFDX project + git state detection
├── models/
│   ├── config.ts               ModelConfig types + defaults (auto-detect Bedrock/Anthropic/OpenRouter)
│   ├── config-io.ts            YAML read/write for ~/.harnessforce/models.yaml
│   ├── registry.ts             ModelRegistry — multi-provider model instantiation (+ SSL cert support)
│   └── router.ts               Tiered model routing (cheap/standard/premium per turn)
├── sessions/
│   └── manager.ts              JSONL session persistence + resumption
├── skills/
│   └── loader.ts               Markdown skill loading + frontmatter parsing
├── hooks/
│   └── manager.ts              Lifecycle hook execution
├── mcp/
│   ├── client.ts               MCP client — connect to external MCP servers
│   ├── server.ts               MCP server — expose tools + knowledge to Claude Code
│   ├── config.ts               MCP config loading (~/.harnessforce/mcp.json)
│   └── index.ts                MCP module exports
├── plugins/
│   └── loader.ts               Plugin auto-loading from ~/.harnessforce/plugins/
├── services/
│   └── extract-memories.ts     Auto-extract learnings on session end
└── cost/
    └── tracker.ts              Per-model token/cost tracking + budget enforcement

apps/cli/src/
├── index.tsx                   CLI entry point (startup, shutdown, session recovery, `serve` command)
├── ui/
│   ├── app.tsx                 Main TUI component (streaming, input, rendering)
│   ├── greeting.ts             Agent Astro pixel art + provider/model/org display
│   ├── markdown.tsx            Markdown → Ink rendering (tables, code, headings)
│   ├── diff.tsx                Unified diff visualization (red/green)
│   └── status-bar.tsx          Bottom bar (mode, model, org, tokens)
└── commands/
    ├── registry.ts             84+ slash commands (includes /provider bedrock, /why)
    ├── model.ts                CLI model/provider subcommands
    ├── skill.ts                CLI skill subcommands
    └── tool.ts                 CLI tool subcommands

skills/                         30 markdown skill files
WHY.md                          Project vision document (wired to /why command)
```
