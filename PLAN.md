# Vibeforce: Claude Code for Salesforce

## Context

No tool lets you vibe code *anything* with Salesforce — admin work, platform dev, custom apps, Agentforce agents, Data Cloud — from a terminal. Vibeforce fills this gap: an open-source CLI agent that understands Salesforce deeply but writes code in **any language**, deploys anywhere, and can train org-specific models that learn your company's data and conventions.

## Feasibility Corrections (from review)

Issues caught by review agents, now addressed:

| Issue | Fix |
|-------|-----|
| **Deep Agents JS has NO built-in MCP** | Add `@langchain/mcp-adapters` separately; +1-2 weeks |
| **Middleware API names wrong** | Use actual `createMiddleware()` pattern, not `wrapModelCall` |
| **~97 tools too many for LLM reasoning** | Prune to ~30 tools following "Write Code, Not Tools"; collapse DML into `sf_data`, remove tools that are just `write_file + sf_deploy` |
| **Model training budget tier — ACTUALLY FEASIBLE** (K2.5 MoE: only 32B active, KTransformers offloads experts to CPU) | Budget tier: 2x RTX 4090 + **1.97 TB RAM** (~$37K workstation), 44.55 tok/s LoRA SFT. Proven via LLaMA-Factory + KTransformers. The constraint is system RAM, not VRAM. |
| **MCP self-extension over-engineered** | Use Deep Agents' existing skills system instead; discover → write SKILL.md → auto-loads |
| **Robot Framework as required fallback** | Bundled as a skill the agent invokes when Playwright clicks fail (Shadow DOM, blocked elements). Not optional — auto-triggers on click failure. |
| **Data Cloud config tools mostly UI-only** | `dc_query` works; stream/segment/identity config → Playwright fallback |
| **SF Docs MCP Server unverified** | Build own doc search from cached PDFs; treat external servers as optional |
| **Missing: rollback, dry-run, audit log, sandbox mgmt, onboarding** | Added as features below |

## Architecture

**Foundation**: Fork `langchain-ai/deepagentsjs` (MIT, TypeScript, LangGraph orchestration, middleware, subagents, memory, skills). Add `@langchain/mcp-adapters` for MCP support.

**Core principle**: Write code, not tools. The agent writes Apex `.cls`, Agent Script `.agent`, Flow `.flow-meta.xml`, LWC `.js`, metadata `.xml` — all via `write_file` + `execute "sf project deploy start"`. Specialized tools only for **reading** from the org.

**Pruned tool set (~30 tools)**:

| Category | Tools |
|----------|-------|
| Core (from Deep Agents) | `read_file`, `write_file`, `edit_file`, `execute`, `task`, `glob`, `grep`, `ls` |
| SF Read | `sf_query`, `sf_describe_object`, `sf_list_orgs`, `sf_get_org_info`, `sf_org_limits`, `sf_run_tests`, `sf_get_test_results`, `sf_get_debug_log` |
| SF Write | `sf_data` (insert/update/upsert/delete/bulk via `operation` param), `sf_run_apex` |
| Discovery | `sf_list_metadata_types`, `sf_describe_all_sobjects`, `sf_list_metadata_of_type` |
| Browser | `browser_open`, `browser_click`, `browser_fill`, `browser_screenshot`, `browser_execute`, `browser_close` |
| Docs | `sf_docs_search`, `sf_docs_read` |
| Agentforce | `agent_publish`, `agent_activate`, `agent_validate`, `agent_preview` |

Everything else (create objects, create fields, VF pages, LWC, Flows, app scaffolding, Heroku deploy, etc.) is done via `write_file` + `execute`. The agent's system prompt carries the domain knowledge.

**Automation layers**:
```
Layer 1: SF CLI / Metadata API (write files + sf project deploy)
Layer 2: Playwright (browser_open/click/fill/execute for UI-only Setup ops)
Shadow DOM piercing: browser_execute with shadowRoot.querySelector() JS chains
Layer 3: Robot Framework + CumulusCI — auto-invoked as skill when Playwright clicks fail (bundled, not optional)
```

**Self-extension**: Via Deep Agents' skills system. Agent discovers metadata type → reads docs → writes SKILL.md → skills middleware auto-loads on next session. No MCP dynamic registration needed.

## CLI Greeting (Agent Astro)

On launch, display Agent Astro character (Salesforce mascot astronaut) as hand-designed Unicode block art with ANSI colors (Salesforce blue + white), plus figlet-rendered "Vibeforce" text. Libraries: `chalk` (ANSI styling), `figlet` (ASCII text), `gradient-string` (optional color gradients). Render via Ink (React for CLI).

```
   ╭──────╮
   │ ◉  ◉ │      ╦  ╦╦╔╗ ╔═╗╔═╗╔═╗╦═╗╔═╗╔═╗
   │  ──  │      ╚╗╔╝║╠╩╗║╣ ╠╣ ║ ║╠╦╝║  ║╣
   ╰──┬┬──╯       ╚╝ ╩╚═╝╚═╝╚  ╚═╝╩╚═╚═╝╚═╝
   ┌──┘└──┐
   │ ╔══╗ │      The Salesforce Vibe Coding Agent
   │ ║██║ │      Connected to: my-dev-org
   └──────┘      Type anything to get started.
```

## Features (Build in Parallel)

Each feature is independent and can be built by a dedicated agent team. The **Integration Agent** ensures all features work together in the unified CLI.

---

### Feature 1: Core Agent Runtime
**What**: Fork Deep Agents JS, create `createVibeforceAgent()`, wire up Ink TUI, Agent Astro greeting
**Depends on**: Nothing (foundation)
**Key files**: `libs/deepagents/` (fork), `libs/vibeforce/src/index.ts`, `apps/cli/`
**Deliverable**: `vibeforce` command launches, shows Agent Astro, accepts natural language, streams responses, calls tools

**Sub-tasks**:
- Fork deepagentsjs, restructure as pnpm monorepo
- Add `@langchain/mcp-adapters` for MCP support
- Create `libs/vibeforce` package with `createVibeforceAgent()` wrapping `createDeepAgent()`
- Build Ink TUI: Agent Astro greeting, InputBar, MessageList, Spinner
- Wire up LLM API (Anthropic by default, model-agnostic via `init_chat_model`)
- Implement `vibeforce config set` for API keys (store in OS keychain via `keytar`)
- Implement `vibeforce init` — scaffolds `.vibeforce/`, detects `sfdx-project.json`, guides first-time setup

---

### Feature 2: SF Org Connection & Context
**What**: Org auth, detection, context caching, multi-org switching
**Depends on**: Feature 1
**Deliverable**: Agent knows what org it's connected to, caches schema, shows in StatusBar

**Sub-tasks**:
- Port 7 SF CLI tools from `mcp-server/tools/salesforce.ts`
- `sf_list_orgs`, `sf_get_org_info`, `sf_describe_object`, `sf_query`, `sf_run_apex`, `sf_deploy`, `sf_retrieve`
- OrgPicker component (Ink select list on startup)
- StatusBar showing connected org, type (prod/sandbox/scratch), API version
- sf-context middleware: fetch org metadata on connect, cache in `.vibeforce/org-cache/`
- Multi-org switching via `/org` command or natural language
- **Sandbox management**: `sf org create sandbox`, `sf org list --all`, sandbox refresh, sandbox login

---

### Feature 3: Permission Model & Safety
**What**: 4-mode permissions, production org guardrails, dry-run, rollback, audit logging
**Depends on**: Feature 1
**Deliverable**: Destructive ops require confirmation; production orgs auto-escalate; all actions logged

**Sub-tasks**:
- sf-permissions middleware (default/plan/yolo/safe modes)
- Risk classification per tool (read/write/destructive)
- ToolConfirm component (shows what will happen, user approves/denies)
- **Production org detection**: auto-escalate writes to require confirmation with warning
- **Dry-run mode**: default to `sf project deploy start --dry-run` before real deploys; show validation results
- **Pre-deploy snapshot**: `sf project retrieve start` before destructive deploys, store in `.vibeforce/snapshots/`
- **Rollback**: `vibeforce rollback` restores from latest snapshot
- **Audit logging**: log all tool calls + args + results to `.vibeforce/audit.log` (JSON lines format)
- **PII awareness**: warn when SOQL results contain fields likely to be PII (Email, Phone, SSN patterns); option to mask before sending to LLM

---

### Feature 4: Self-Discovery & Documentation
**What**: Agent discovers metadata types, reads SF docs, extends itself via skills
**Depends on**: Features 1, 2
**Deliverable**: Agent handles ANY metadata type by discovering → learning → executing

**Sub-tasks**:
- 3 discovery tools: `sf_list_metadata_types`, `sf_describe_all_sobjects`, `sf_list_metadata_of_type`
- Local doc cache: ship critical SF PDFs (`api_meta.pdf`, `apexcode.pdf`, `lwc_guide.pdf`, etc.)
- `sf_docs_search` and `sf_docs_read` tools
- Self-extension via skills: agent writes SKILL.md files for newly discovered capabilities
- System prompt includes: "If you don't have a tool for something, use discovery tools to learn the metadata format, then write source files and deploy"
- Curated YAML mapping of unsupported metadata types → requires Playwright fallback

---

### Feature 5: Browser Automation
**What**: Playwright for UI-only Setup operations + Shadow DOM piercing
**Depends on**: Feature 2 (needs org auth for front door links)
**Deliverable**: Agent can automate any Setup page that has no API equivalent

**Sub-tasks**:
- Port 6 core Playwright tools from `mcp-server/tools/browser.ts` (open, click, fill, screenshot, execute, close)
- Front door link auth: `sf org display --json` → extract `sfdxAuthUrl` → `browser_open`
- Shadow DOM piercing via `browser_execute` with `shadowRoot.querySelector()` chains
- Curated list of 30+ UI-only operations with Setup page URLs
- Screen recording support (for demo/documentation purposes)
- **Robot Framework fallback skill**: when Playwright click fails (Shadow DOM, blocked element), agent auto-generates `.robot` file using CumulusCI keywords and executes via `robot` CLI. Bundled as a required skill, not optional.
- Auto-install: `vibeforce init` ensures `pip install robotframework cumulusci` is run (or prompts user)

---

### Feature 6: Agentforce Agent Building
**What**: End-to-end Agentforce agent creation from natural language
**Depends on**: Features 1, 2, 4
**Deliverable**: "Build me an agent that handles X" → working, activated Agentforce agent

**Sub-tasks**:
- Port agentforce-adlc patterns (almandsky): author, discover, scaffold, deploy, test, optimize, safety
- Agentforce tools: `agent_publish`, `agent_activate`, `agent_validate`, `agent_preview`
- Agent Script DSL knowledge in system prompt (syntax, 22 action target types, architecture patterns)
- Apex `@InvocableMethod` generation for agent actions (via `write_file`)
- Flow XML generation for agent actions (via `write_file`)
- Safety evaluation (7-category, 65 assertions, 100-point rubric)
- Batch testing with YAML specs
- Skills: `agentforce-build`, `agentforce-test`

---

### Feature 7: App Builder & Heroku Deploy
**What**: Scaffold full-stack apps in ANY language, deploy to Heroku
**Depends on**: Features 1, 2
**Deliverable**: "Build me a Python dashboard for my SF data, deploy to Heroku" → working deployed app

**Sub-tasks**:
- App scaffolding templates: Next.js, Python/Flask, Ruby/Rails, Java/Spring + SF REST API integration
- Heroku tools via `execute`: `heroku create`, `heroku config:set`, `git push heroku main`
- Connected App + OAuth setup (JWT bearer, web-server flow) via metadata deploy
- Visualforce page/component creation (via `write_file` + deploy)
- Lightning App creation for App Launcher (via `write_file` + deploy)
- Heroku deployment skill from Buildify deploy workflow patterns
- Not SF-restricted: agent uses core file tools to write code in any language

---

### Feature 8: Data Cloud
**What**: Query, ingest, configure, and manage Data Cloud programmatically
**Depends on**: Features 2, 5 (browser automation for UI-only config)
**Deliverable**: Agent can query, ingest data, create segments, configure identity resolution, and deploy Data Cloud metadata

**Sub-tasks**:
- Port Data 360 scripts from buildify-skills: `dc_list_objects`, `dc_describe`, `dc_query`
- `dc_query` uses `ConnectApi.CdpQuery.querySql` via temp Apex (ANSI SQL, not SOQL)
- **Ingestion API**: streaming (JSON, near real-time) + bulk (CSV) data loading — fully programmable
- **Connect API**: create identity resolution rulesets, create/manage segments, manage dataflows
- **Query Connect API**: POST `/ssot/query-sql` for advanced querying with pagination
- **Metadata API deployments**: deploy datastreams, transforms, segments, calculated insights definitions via `sf project deploy`
- **Datakit deployment**: `deployDataKitComponents` REST action (API v61.0+)
- **UI-only operations** (→ Playwright): DLO creation, calculated insights creation (SQL/visual builder), initial data stream setup, data transform SQL editor
- Port Jaganpro/sf-skills Data Cloud skills: pipeline setup, connection discovery, stream mapping, segment creation/publishing
- Data Cloud knowledge in system prompt (DLO/DMO/CIO types, `ssot__` namespace prefix, ingestion patterns)

---

### Feature 9: Model Provider Management & Org-Specific Training
**What**: Add/switch LLM providers, use local models, train org-specific models on K2.5
**Depends on**: Features 1, 2
**Deliverable**: Users can use any LLM, host local models, and train org-specific fine-tunes

**Model provider sub-tasks**:
- Provider registry using LangChain's `init_chat_model("provider:model-id")` pattern
- Config file `~/.vibeforce/models.yaml` with providers, API keys (env var refs), defaults
- `/model` slash command for mid-session switching (interactive menu)
- `vibeforce model:list` — show all available models across providers
- `vibeforce provider:add` — interactive wizard to add new provider (cloud, local, gateway)
- Cloud providers: Anthropic, OpenAI, Google (via LangChain, 50+ providers)
- Local models: Ollama (`http://localhost:11434`), vLLM (`http://localhost:8000/v1`)
- Task-aware routing: haiku for classification, opus for planning, sonnet for execution
- Cost tracking: estimated tokens + cost per session
- Optional LiteLLM proxy for unified multi-provider gateway

**Org-specific training sub-tasks**:
- Training data extraction: `sf project retrieve start` → parse metadata into training corpus
- **Budget tier**: LoRA on **Kimi K2.5** via LLaMA-Factory + KTransformers
  - Hardware: 2x RTX 4090 (48GB VRAM) + **1.97 TB system RAM** (~$37K workstation)
  - Throughput: 44.55 tokens/sec LoRA SFT (proven, documented)
  - Training time: 2-4 weeks for moderate dataset
  - Key: MoE architecture — only 32B params active, experts offloaded to CPU RAM
- **Mid tier**: LoRA on K2.5, 32x H100 ($160-250K)
- **Full tier**: Full fine-tune on 256x H100 ($800K-1.2M)
- Trained model served via vLLM, registered as local provider in `models.yaml`
- CLI: `vibeforce model extract`, `vibeforce model train`, `vibeforce model status`, `vibeforce model set-active`
- SalesforceBench evaluation harness (200 core + 30 Agentforce problems)
- Static analysis pipeline: ApexPMD + ESLint + Agent Script grammar parser

---

### Feature 10: Integration & Polish
**What**: Main Integration Agent ensures all features compose into a cohesive CLI experience
**Depends on**: All features
**Deliverable**: All features work together seamlessly; `/init`, `/org`, `/rollback` commands; docs; npm publish

**Sub-tasks**:
- Subagent routing: main agent dispatches to admin/dev/agentforce/appbuilder subagents, each with tool subsets
- Session persistence: conversation history saved in `.vibeforce/sessions/`
- Error handling: parse SF deployment errors, suggest fixes, auto-retry
- Change visibility: post-action summary of what changed (files written, metadata deployed)
- `vibeforce init` guided onboarding
- `vibeforce rollback` restore from snapshot
- `vibeforce history` session replay
- npm publish: `@vibeforce/cli`, `@vibeforce/core`
- Docs: README, getting-started guide, command reference
- MIT license, CONTRIBUTING guide, GitHub Actions CI

## Agent Team Structure (for building Vibeforce)

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Agent                         │
│  Ensures all features compose into cohesive CLI experience   │
│  Runs final E2E tests across all features                    │
└──────────┬──────────┬──────────┬──────────┬────────────────┘
           │          │          │          │
     ┌─────▼────┐ ┌──▼───┐ ┌───▼──┐ ┌────▼────┐  ...
     │Feature 1 │ │Feat 2│ │Feat 3│ │Feature N│
     │Agent     │ │Agent │ │Agent │ │Agent    │
     └──┬───┬──┘ └──────┘ └──────┘ └─────────┘
        │   │
   ┌────▼┐ ┌▼─────┐
   │Rsrch│ │Code  │  Each feature agent has:
   │Agent│ │Agent │  - Research sub-agent (checks docs, correctness)
   └─────┘ └──┬───┘  - Code sub-agent (writes implementation)
              │       - Test sub-agent (writes + runs tests)
         ┌────▼──┐
         │Test   │
         │Agent  │
         └───────┘
```

## Monorepo Structure

```
vibeforce/
├── libs/
│   ├── deepagents/          # Forked core (minimal changes, sync with upstream)
│   └── vibeforce/           # SF agent library
│       ├── tools/           # ~22 SF-specific tools (pruned)
│       ├── middleware/       # sf-context, sf-permissions
│       ├── prompts/         # Layered system prompts with SF domain knowledge
│       └── docs/            # Cached SF PDF guides
├── apps/
│   └── cli/                 # Ink TUI (Agent Astro, InputBar, MessageList, ToolConfirm, OrgPicker)
│       └── greeting.ts      # Agent Astro Unicode art + figlet "Vibeforce"
├── skills/                  # Reusable workflow definitions (SKILL.md files)
├── evals/                   # SalesforceBench + integration tests
└── docs/                    # User-facing documentation
```

## Existing Assets to Incorporate

| Source | What | Port effort |
|--------|------|-------------|
| `demo-tool/mcp-server/tools/salesforce.ts` | 7 SF CLI tools | Direct TS port |
| `demo-tool/mcp-server/tools/browser.ts` | 6 core Playwright tools | Direct TS port |
| `buildify-skills/data-360/*.sh` | 3 Data Cloud scripts | Wrap in TS |
| `agentforce-adlc` (almandsky) | 8 ADLC skills, safety framework, Agent Script DSL ref | Port patterns |
| `demo-tool/.claude/commands/deploy.md` | Heroku deployment workflow | Extract as skill |
| `deepagentsjs` (langchain-ai) | Agent runtime, middleware, skills, memory | Fork |
| `~/sf-model-training-plan.md` | Model training blueprint, SalesforceBench, RL verification | Reference |

## Distribution & Auto-Update

```bash
npm install -g @vibeforce/cli
vibeforce
```

**Required**: Node.js 20+, Salesforce CLI (`sf`), LLM API key
**Required**: Python 3.9+ with `robotframework` + `cumulusci` (auto-installed via `vibeforce init`; used as fallback when Playwright clicks are blocked by Shadow DOM)

### Auto-Update on Launch

Every time the user runs `vibeforce`, the CLI performs a lightweight update check before entering the REPL:

```
vibeforce
  → Check npm registry for latest @vibeforce/cli version (cached, max 1 check/hour)
  → If newer version: auto-install via `npm install -g @vibeforce/cli@latest` + restart
  → Pull latest skills from GitHub repo (git pull or fetch tarball of skills/ directory)
  → Pull latest system prompts and doc cache updates
  → Show changelog diff if major/minor version changed
  → Enter REPL
```

**What auto-updates**:
- CLI binary (`@vibeforce/cli` from npm)
- Skills (SKILL.md files from GitHub `vibeforce/skills/`)
- System prompts (SF platform knowledge, governor limits, metadata type mappings)
- Cached SF documentation PDFs (when new API versions ship)
- Curated metadata → automation layer mappings (unsupported metadata types list)

**How it works**:
- Skills and prompts stored in `~/.vibeforce/cache/` (separate from user config)
- On launch: `fetch("https://api.github.com/repos/{org}/vibeforce/releases/latest")` → compare with local version
- If skills changed: download delta (just the changed SKILL.md files, not full repo)
- If CLI version changed: prompt user to update (`npm install -g @vibeforce/cli@latest`)
- All updates are fast (<2s for skill sync) and non-blocking (background fetch while REPL loads)
- Offline mode: skip update check, use cached versions

**User control**:
- `vibeforce config set auto-update false` — disable auto-updates
- `vibeforce update` — force update check
- `vibeforce update --skills-only` — just pull latest skills
- Pinned versions: `vibeforce config set version-pin 1.2.0` — stay on specific version

## Verification

1. `vibeforce` → Agent Astro greeting, org detection, OrgPicker
2. "Show me all Account fields" → `sf_describe_object`
3. "Query top 10 Opportunities by Amount" → generates SOQL, runs `sf_query`
4. "Create Warranty__c with Status and ExpiryDate fields" → writes metadata XML → `sf project deploy --dry-run` → confirm → deploy
5. "Write an Apex trigger preventing Opportunity close without Contact Role, with tests" → writes `.cls` + test class → deploys → runs tests
6. "Enable Account Teams" → detects unsupported metadata → Playwright → screenshots confirmation
7. "Build an Agentforce agent for warranty inquiries" → spec → Agent Script → Apex actions → deploy → publish → activate → safety eval
8. "Build a Python Flask API for my SF data, deploy to Heroku" → writes Python, Procfile → `heroku create` → deploys
9. "Create a Visualforce page showing Account summary, add to App Launcher" → writes VF + controller + Lightning app → deploys
10. "Query Data Cloud for individuals with recent email interactions" → `dc_query` with ANSI SQL
11. "Train a model on my org's data" → extracts metadata → starts LoRA training on CodeLlama 13B
