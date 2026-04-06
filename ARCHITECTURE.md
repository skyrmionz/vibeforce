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

**Stack:** TypeScript, LangGraph (`createReactAgent`), LangChain (ChatOpenAI/ChatAnthropic), Ink (React for terminals), Playwright (browser automation), Zod (tool schemas).

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
│  + FORCE.md instructions                │  ← User/team project instructions (3 layers)
│  + Skills summary (top 10)              │  ← Skill names + triggers for agent awareness
│  + SF Knowledge reference               │  ← Compact list of 13 topics (NOT full content)
└─────────────────────────────────────────┘
```

**What makes this different from Claude Code / Deep Agents:**

- **Domain-specific prompt layers.** The system prompt includes Salesforce platform sections (Agentforce workflow, Data Cloud patterns, metadata patterns, production org safety) that generic harnesses don't have. These live in `libs/harnessforce/src/prompts/` -- 4,147 lines of Salesforce expertise across 18 prompt files.
- **Lazy-loaded knowledge.** The 13 SF knowledge topics (governor limits, Apex architecture, trigger patterns, LWC, flows, SOQL, deployment, testing, API strategy, integration, metadata patterns, Agentforce, Data Cloud) are NOT injected into the system prompt. The agent gets a one-line summary and uses the `sf_knowledge` tool to load full content on demand. This saves ~21K tokens per turn.
- **FORCE.md convention.** Like CLAUDE.md for Claude Code, but Salesforce-aware. Three layers merge: `~/.harnessforce/FORCE.md` (user global), `FORCE.md` (project), `FORCE.local.md` (local overrides). See `libs/harnessforce/src/middleware/memory.ts` → `loadForceInstructions()`.

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
allTools (59 built-in)
  + MCP server tools (discovered at runtime from ~/.harnessforce/mcp.json)
  + Plugin tools (loaded from ~/.harnessforce/plugins/)
  → combinedTools (passed to createReactAgent)
```

MCP tools are prefixed `mcp_{server}_{tool}` to avoid name collisions. See `libs/harnessforce/src/mcp/client.ts`.

### Graph Creation

```typescript
const graph = createReactAgent({
  llm,                    // ChatOpenAI or ChatAnthropic via ModelRegistry
  tools: combinedTools,   // 59+ tools
  prompt: cachedPrompt,   // SystemMessage with cache_control
  checkpointer: new MemorySaver(),  // In-memory state per thread_id
});
```

This is LangGraph's built-in ReAct agent. The checkpointer enables multi-turn conversations and session resumption via thread IDs.

---

## Tools (59 Built-In)

**File:** `libs/harnessforce/src/tools/index.ts` → `allTools` array

### Tool Categories

| Category | Count | File | What They Do |
|----------|-------|------|-------------|
| Core filesystem | 8 | `tools/core.ts` | read_file, write_file, edit_file, execute, glob, grep, ls, task |
| Salesforce CLI | 12 | `tools/salesforce.ts` | sf_query, sf_deploy, sf_retrieve, sf_run_apex, sf_run_tests, sf_data, sf_org_limits, etc. |
| Metadata discovery | 3 | `tools/discovery.ts` | sf_list_metadata_types, sf_describe_all_sobjects, sf_list_metadata_of_type |
| Extended Salesforce | 12 | `tools/sf-extended.ts` | scratch orgs, packages, deploy status/cancel, test coverage, data export, sandboxes, event logs |
| Docs | 2 | `tools/docs.ts` | sf_docs_search, sf_docs_read |
| Browser automation | 6 | `tools/browser.ts` | browser_open, browser_click, browser_fill, browser_screenshot, browser_execute, browser_close |
| Agentforce | 4 | `tools/agentforce.ts` | agent_publish, agent_activate, agent_validate, agent_preview |
| Data Cloud | 7 | `tools/datacloud.ts`, `datacloud-ingest.ts`, `datacloud-config.ts` | dc_query, dc_list_objects, dc_describe, dc_ingest_streaming, dc_ingest_bulk, dc_create_identity_resolution, dc_create_segment |
| Web | 2 | `tools/web-search.ts` | web_search, web_fetch |
| Planning & knowledge | 3 | `tools/todos.ts`, `sf-knowledge.ts`, `agent-spawn.ts` | write_todos, sf_knowledge, agent_spawn |

### How SF Tools Work

All Salesforce tools wrap the `sf` CLI via `runSfCommand()` in `tools/sf-cli.ts`. They don't use Salesforce APIs directly -- they shell out to the CLI, parse JSON output, and handle errors.

```typescript
// tools/sf-cli.ts → runSfCommand()
execFile("sf", [...args, "--json"], { timeout: 60_000 }, (err, stdout) => {
  // Parse JSON, handle INVALID_SESSION, REQUEST_LIMIT_EXCEEDED, etc.
});
```

**Why wrap the CLI instead of using APIs?** Because the `sf` CLI handles auth, session refresh, SFDX project context, and org management. Rebuilding that in JS would be thousands of lines for no benefit. The CLI is the source of truth for Salesforce developers.

**What makes these tools different from generic file/shell tools:**
- `sf_deploy` includes dry-run validation before destructive deploys
- `sf_query` has PII field detection that warns about sensitive data
- `sf_data` supports insert/update/upsert/delete via a unified interface
- All SF tools parse structured JSON and return formatted results, not raw CLI output

### Browser Automation

Playwright runs as a singleton browser instance shared across tool calls. This lets the agent navigate Salesforce Setup pages, click through UI-only configuration, fill forms, and take screenshots -- all in one persistent browser session.

```
browser_open → browser_click → browser_fill → browser_screenshot
         ↓
     Single Playwright chromium instance (headless by default)
```

The agent uses `browser_execute` with `shadowRoot.querySelector()` to pierce Lightning's Shadow DOM -- a Salesforce-specific technique documented in the system prompt.

**File:** `libs/harnessforce/src/tools/browser.ts`

### Tool Guidance

Each core tool has 5-10 lines of best-practice guidance injected into the system prompt. This teaches the agent when to use each tool, common pitfalls, and Salesforce-specific patterns.

**File:** `libs/harnessforce/src/prompts/tool-guidance.ts` (645 lines)

Only core tool guidance (~8 tools) is included by default. Extended guidance is available on demand. This saves ~7K tokens per turn vs including all 59 tools.

---

## Salesforce Knowledge System

**What makes this the core differentiator.** Generic harnesses know nothing about Salesforce. Harnessforce has 4,147 lines of structured Salesforce expertise spread across 18 prompt files.

### Knowledge Architecture

```
System prompt (always loaded):
  - SELF_DISCOVERY_PROMPT        → How to explore unfamiliar orgs (51 lines)
  - UNSUPPORTED_METADATA_PROMPT  → Metadata types needing browser fallback (171 lines)
  - AGENTFORCE_PROMPT            → Agent Development Lifecycle, Agent Script DSL (520 lines)
  - DATA_CLOUD_PROMPT            → DMOs, ingestion, identity resolution (54 lines)

On-demand via sf_knowledge tool (loaded when agent needs them):
  - sf-governor-limits.ts    (40 lines)    → DML, SOQL, CPU, heap limits
  - sf-trigger-patterns.ts   (210 lines)   → One-trigger-per-object, recursion control
  - sf-testing.ts            (263 lines)   → Test factories, mocking, governor limit testing
  - sf-flow.ts               (138 lines)   → Screen flows, auto-launched, orchestrator
  - sf-lwc.ts                (261 lines)   → Component patterns, wire adapters, events
  - sf-soql.ts               (212 lines)   → Query optimization, aggregates, polymorphic
  - sf-api-strategy.ts       (169 lines)   → REST, SOAP, Bulk, Streaming, OAuth
  - sf-deployment.ts         (207 lines)   → Source tracking, CI/CD, packages, validation
  - sf-apex-architecture.ts  (426 lines)   → Service layers, selectors, trigger handlers
  - sf-integration.ts        (184 lines)   → Platform Events, CDC, outbound messaging
  - sf-metadata-patterns.ts  (227 lines)   → XML structure for all metadata types
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
| **default** | auto | auto | confirm |
| **yolo** | auto | auto | auto |
| **safe** | auto | hidden | hidden |

In `plan` mode, the agent can only read and explore. It presents a plan for what it would do, then waits for approval. After the first turn, the CLI auto-transitions from plan → default.

### Production Org Detection

`detectProductionOrg()` runs `sf org display --json` and checks `isSandbox`/`isScratch` flags. If neither, it's production. The result is cached for the process lifetime. Production orgs auto-escalate risk levels.

---

## Middleware & Cost Control

### Stream Event Loop

The `stream()` method in `index.ts` is an async generator that processes LangGraph's `streamEvents`:

```
stream(message, threadId, permissionMode)
  │
  ├── Pre-turn: microcompact → proactive compaction (if >60K tokens)
  │
  ├── on_tool_start:
  │     → Unicode sanitization
  │     → Audit logging (.harnessforce/audit.log)
  │     → Pre-tool hooks
  │     → Permission gate (confirm/block based on mode + risk)
  │     → Dry-run validation for sf_deploy
  │
  ├── on_tool_end:
  │     → Output truncation (4K char cap, full result saved to disk)
  │     → PII detection on sf_query results
  │     → Post-tool hooks
  │
  ├── on_chat_model_stream:
  │     → Token-by-token streaming to TUI
  │
  ├── on_llm_end:
  │     → Cost tracking (input/output tokens per model)
  │
  └── Error recovery:
        → prompt_too_long: retry up to 3x with progressive compaction
        → Attempt 1: compact to 45K tokens, keep 8 recent messages
        → Attempt 2: compact to 30K tokens, keep 6 recent messages
        → Attempt 3: compact to 15K tokens, keep 4 recent messages
```

### Compaction (3 Layers)

1. **Microcompact** (`middleware/microcompact.ts`): In-place clearing of old tool results. Keeps recent 3 turns, replaces older tool result content with `[Old tool result cleared]`. Preserves message array identity so the MemorySaver cache prefix stays warm.

2. **Proactive compaction** (`middleware/summarization.ts`): When history exceeds 60K tokens, uses LLM-based summarization (or falls back to string truncation). Writes the compacted state back to MemorySaver via `updateState()`.

3. **Reactive recovery**: On `prompt_too_long` errors, retries with progressively aggressive compaction (45K → 30K → 15K target tokens).

### Tool Output Persistence

Tool results exceeding 4K characters are truncated in context but the full output is saved to `.harnessforce/tool-results/{timestamp}-{tool}.txt`. The truncated version includes a note: "Full output saved to {path}" so the agent can re-read if needed.

### Cost Tracking

`libs/harnessforce/src/cost/tracker.ts` tracks input/output tokens per model per session. Supports OpenRouter pricing estimates. Accessible via `/cost` command.

---

## Session Management

**File:** `libs/harnessforce/src/sessions/manager.ts`

Sessions persist as JSONL files at `.harnessforce/sessions/{id}.jsonl`. Each line is a message:

```json
{"role":"user","content":"create an Apex trigger","timestamp":"2026-04-06T10:00:00Z"}
{"role":"assistant","content":"I'll create...","timestamp":"2026-04-06T10:00:05Z"}
```

The MemorySaver checkpointer handles in-memory state per `thread_id`. Session resumption: `npx harnessforce --resume <id>` reloads the JSONL and passes messages as initial context.

On startup, the CLI hints about the most recent session: "Last session: abc123... (42 messages). To continue: `npx harnessforce --resume abc123`"

---

## Skills System

**File:** `libs/harnessforce/src/skills/loader.ts`
**Directory:** `skills/` (27 files)

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

The top 10 skills are summarized in the system prompt (name + trigger only). All 27 become slash commands -- typing `/agentforce-build` expands the skill's full content into a prompt sent to the agent.

**Shipped skills:** agentforce-build, agentforce-test, agentforce-observability, agent-persona, apex-patterns, lwc-development, flow-advanced, test-automation, deployment-checklist, ci-cd-pipeline, data-migration, data-cloud-setup, security-hardening, scratch-org-lifecycle, package-development, connected-app-setup, heroku-deploy, app-scaffold, org-setup, metadata-generation, integration-patterns, omnistudio-overview, performance-optimization, visualforce-app, robot-framework-fallback, remember, skill-creator.

**The agent can create new skills** with `/skill-add <name>` or by writing markdown files to the skills directory.

---

## Memory System

**File:** `libs/harnessforce/src/middleware/memory.ts`

### Layers

1. **Agent memory** (`.harnessforce/agent.md`): Learnings from past sessions. The agent reads this every turn and writes discoveries back. Auto-extracted on session end via `libs/harnessforce/src/services/extract-memories.ts`.

2. **FORCE.md** (project instructions): Three layers merge in priority order:
   - `~/.harnessforce/FORCE.md` — user-global preferences
   - `FORCE.md` in parent directories up to project root — team conventions
   - `FORCE.local.md` — local overrides (gitignored)

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

Configured in `.harnessforce/settings.json`. Hooks receive context via environment variables (`HARNESSFORCE_TOOL_NAME`, `HARNESSFORCE_HOOK_EVENT`). Non-blocking, 30s timeout, errors don't crash the agent.

---

## MCP Integration

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

On startup, Harnessforce connects to each server, calls `listTools()`, and wraps discovered tools as LangChain StructuredTools prefixed `mcp_{server}_{tool}`. These merge into `combinedTools` alongside the built-in 59.

---

## Model Support

**File:** `libs/harnessforce/src/models/registry.ts`

The `ModelRegistry` class instantiates LangChain chat models from a unified config:

| Provider Type | How It Works | Example |
|--------------|-------------|---------|
| `cloud` | Direct API (ChatAnthropic or ChatOpenAI) | Anthropic, OpenAI |
| `local` | OpenAI-compatible API at localhost | Ollama, vLLM |
| `gateway` | OpenAI-compatible API with auth at remote URL | OpenRouter, LiteLLM |

Model ID format: `provider:model` (e.g., `openrouter:anthropic/claude-opus-4.6`).

Config stored at `~/.harnessforce/models.yaml`. API keys support environment variable references (`${OPENROUTER_API_KEY}`). The `/provider` and `/model` commands manage this from inside the TUI.

---

## TUI (Terminal UI)

**File:** `apps/cli/src/ui/app.tsx`

Built with Ink (React for terminals). Key architecture:

- **Streaming**: Event generator loop. AbortController per turn -- ESC aborts the stream and preserves partial response.
- **Virtual scrolling**: Only renders last 50 messages. Older messages hidden with "N older messages" indicator.
- **Tool rendering**: Tool results truncated to 500 chars in display. `edit_file` results render as unified diffs (red/green). Turns with 3+ tool calls get a summary line.
- **Command menu**: Type `/` to see autocomplete suggestions. Arrow keys navigate, Enter selects.
- **Permission cycling**: Shift+Tab cycles plan → default → yolo.
- **Markdown rendering**: `apps/cli/src/ui/markdown.tsx` handles bold, code blocks, tables, headings, lists.

### Startup Flow (`apps/cli/src/index.tsx`)

1. Read model config, resolve API key (flag → env → config file)
2. Detect SFDX project context (parallel git checks)
3. Print greeting with Agent Astro pixel art + provider/model/org/setup status
4. Discover orgs in background (non-blocking `sf org list`)
5. Create agent in background (TUI renders immediately, doesn't wait)
6. Hint about recent sessions for resumption

### Slash Commands

84 built-in slash commands + 27 skill commands. Two types:

- **Local commands**: Execute in-process, return result immediately (e.g., `/model`, `/provider`, `/query`, `/describe`, `/cost`)
- **Prompt commands**: Expand into a prompt string sent to the agent (e.g., `/apex`, `/deploy`, `/agentforce-build`)

**File:** `apps/cli/src/commands/registry.ts` (84 command definitions)

---

## What Makes This Different

### vs Claude Code

Claude Code is a general-purpose coding agent. It has no awareness of Salesforce, no `sf` CLI integration, no Agentforce tools, no Data Cloud tools, no browser automation for Setup pages, no SFDX project detection, no governor limit knowledge, no deployment safety checks, and no skill system for domain workflows.

Harnessforce replicates Claude Code's core patterns (prompt caching, compaction, abort handling, session persistence, hooks, permission modes) but adds an entire Salesforce-specific layer on top: 35 SF/Agentforce/Data Cloud tools, 13 lazy-loaded knowledge topics, 27 domain skills, context-aware prompt injection, PII detection on query results, and production org safety gates.

### vs LangChain Deep Agents

Deep Agents is a reference architecture for building LangGraph agents. Harnessforce uses the same foundation (`createReactAgent`, `MemorySaver`, `streamEvents`) but adds everything needed to make it production-ready for Salesforce work: a full TUI, 59 tools, middleware (compaction, permissions, hooks, cost tracking), a skills system, MCP extensibility, multi-provider model support, and 4,147 lines of Salesforce domain expertise.

### The Key Insight

Generic agent harnesses give you a chat loop with file/shell tools. That's necessary but not sufficient for specialized work. Harnessforce's value comes from the layers built around the generic agent:

1. **Domain tools** — SF CLI wrapping, browser automation for Setup, Agentforce lifecycle, Data Cloud operations
2. **Domain knowledge** — 13 lazy-loaded topics covering every major Salesforce subsystem
3. **Domain skills** — 27 workflow templates that teach the agent how to approach SF-specific tasks
4. **Domain safety** — Production org detection, PII field masking, deploy dry-runs, risk-classified tools
5. **Domain context** — Auto-detection of SFDX projects, orgs, git state injected into every conversation

---

## File Map

```
libs/harnessforce/src/
├── index.ts                    Agent factory + stream event loop (main entry)
├── tools/
│   ├── index.ts                allTools array (59 tools)
│   ├── core.ts                 read_file, write_file, edit_file, execute, glob, grep, ls, task
│   ├── salesforce.ts           12 core SF tools (wrapping sf CLI)
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
│   ├── sf-knowledge.ts         Lazy-loaded SF knowledge (13 topics)
│   ├── agent-spawn.ts          Subagent with isolated context
│   └── todos.ts                Task/planning tool
├── prompts/
│   ├── system.ts               Main system prompt (234 lines)
│   ├── tool-guidance.ts        Per-tool best practices (645 lines)
│   ├── self-discovery.ts       Org exploration guidance
│   ├── unsupported-metadata.ts Metadata needing browser fallback
│   ├── agentforce.ts           Agentforce/ADLC prompt (520 lines)
│   ├── datacloud.ts            Data Cloud prompt
│   ├── output-styles.ts        Explanatory/learning output modes
│   ├── sf-apex-architecture.ts 426 lines of Apex patterns
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
│   ├── memory.ts               FORCE.md + agent.md loading
│   ├── microcompact.ts         Cache-preserving tool result clearing
│   └── summarization.ts        LLM-based compaction + fallback truncation
├── context/
│   └── detector.ts             SFDX project + git state detection
├── models/
│   ├── config.ts               ModelConfig types + defaults
│   ├── config-io.ts            YAML read/write for ~/.harnessforce/models.yaml
│   └── registry.ts             ModelRegistry — multi-provider model instantiation
├── sessions/
│   └── manager.ts              JSONL session persistence + resumption
├── skills/
│   └── loader.ts               Markdown skill loading + frontmatter parsing
├── hooks/
│   └── manager.ts              Lifecycle hook execution
├── mcp/
│   ├── client.ts               MCP server connection + tool wrapping
│   └── config.ts               MCP config loading
├── plugins/
│   └── loader.ts               Plugin auto-loading from ~/.harnessforce/plugins/
├── services/
│   └── extract-memories.ts     Auto-extract learnings on session end
└── cost/
    └── tracker.ts              Per-model token/cost tracking

apps/cli/src/
├── index.tsx                   CLI entry point (startup, shutdown, session recovery)
├── ui/
│   ├── app.tsx                 Main TUI component (streaming, input, rendering)
│   ├── greeting.ts             Agent Astro pixel art + provider/model/org display
│   ├── markdown.tsx            Markdown → Ink rendering (tables, code, headings)
│   ├── diff.tsx                Unified diff visualization (red/green)
│   └── status-bar.tsx          Bottom bar (mode, model, org, tokens)
└── commands/
    ├── registry.ts             84 slash commands (local + prompt types)
    ├── model.ts                CLI model/provider subcommands
    ├── skill.ts                CLI skill subcommands
    └── tool.ts                 CLI tool subcommands

skills/                         27 markdown skill files
```
