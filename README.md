# Harnessforce

<p align="center">
  <img src="apps/cli/src/ui/agent-astro.png" alt="Agent Astro" width="120" />
</p>

<p align="center">
  <strong>An open-source agent harness for Salesforce development</strong><br/>
  Admin work, Apex development, Agentforce agents, Data Cloud, custom apps on Heroku -- all from your terminal.
</p>

## Getting Started

### 1. Run

```bash
npx harnessforce
```

This always runs the latest version. Or install globally:

```bash
npm install -g harnessforce
harnessforce
```

### 2. Get an API Key

Harnessforce uses [OpenRouter](https://openrouter.ai) by default -- one API key gives you access to Claude, GPT, Gemini, and 200+ other models.

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create a free account and generate an API key
3. Launch Harnessforce and set your key:

```
/set-key sk-or-your-key-here
```

This saves your key to `~/.harnessforce/models.yaml` so it persists across sessions.

**Alternative:** Set it as an environment variable before launching:
```bash
export OPENROUTER_API_KEY=sk-or-your-key-here
harnessforce
```

### 3. Connect a Salesforce Org

```bash
# Authenticate your org
sf org login web --alias my-org

# Launch Harnessforce (auto-detects your default org)
harnessforce
```

### Prerequisites

- **Node.js 20+**
- **Salesforce CLI** (`sf`) -- [install guide](https://developer.salesforce.com/tools/salesforcecli)
- **Python 3.9+** with `robotframework` + `cumulusci` (optional, for Shadow DOM automation)

## FORCE.md -- Project Instructions

FORCE.md files tell Harnessforce how to work in your project, similar to CLAUDE.md for Claude Code. Three layers, merged top-to-bottom:

| File | Purpose | Git tracked? |
|------|---------|-------------|
| `./FORCE.md` | Project conventions, coding rules, org info | Yes |
| `~/.harnessforce/FORCE.md` | Personal preferences (applies to all projects) | N/A |
| `./FORCE.local.md` | Private overrides (secrets, personal aliases) | No (gitignored) |

Use `/force` to view the current merged instructions, or `/force create` to scaffold a new `FORCE.md` in your project. The `/init` command also creates one automatically.

## What Can It Do?

### Salesforce Admin
```
> Create a custom object called Warranty__c with Status and ExpiryDate fields
> Enable Account Teams in my org
> Query the top 10 Opportunities by Amount
> Set up sharing rules for the Case object
```

### Apex and LWC Development
```
> Write an Apex trigger that prevents Opportunity close without a Contact Role, with tests
> Build an LWC datatable component for Accounts with inline editing
> Show me the debug logs from my last deployment
> Analyze my code for governor limit risks
```

### Agentforce Agent Building
```
> Build an Agentforce agent that handles customer warranty inquiries
> Test my agent with sample utterances
> Run a safety evaluation on the warranty agent
> Deploy and activate the agent bundle
```

### Data Cloud
```
> Query my Data Cloud for individuals with recent email interactions
> List all Data Cloud objects in my org
> Set up identity resolution and customer segments
```

### Custom Apps
```
> Build a Python Flask API that syncs SF Opportunities to Postgres, deploy to Heroku
> Create a React dashboard showing my SF Accounts
> Scaffold a Next.js app with Connected App OAuth to Salesforce
```

### DevOps and Org Management
```
> Create a scratch org from my definition file
> Run all Apex tests and show code coverage
> Set up a CI/CD pipeline for my Salesforce project
```

## Agentforce Support (ADLC)

Harnessforce includes deep support for the Agentforce Development Lifecycle -- four purpose-built skills that cover the full agent creation pipeline:

**Build** (`/agentforce-build`) -- 606-line skill with a 100-point rubric covering topic classification, action mapping, instruction writing, and guardrail design. Generates `.agent` files, Apex actions, Flow XML, and deploys the complete bundle.

**Test** (`/agentforce-test`) -- 521-line skill with two modes: Mode A for quick smoke tests via `sf agent preview`, Mode B for batch testing with structured pass/fail reporting across multiple utterances.

**Observability** (`/agentforce-observability`) -- Analyzes agent session traces from Data Cloud, reproduces issues with live preview, and produces improvement recommendations against the deployed agent.

**Persona Design** (`/agent-persona`) -- Guides structured persona creation: tone, guardrails, escalation rules, and utterance-driven testing to validate personality consistency.

## Architecture

Harnessforce follows a **"Write Code, Not Tools"** philosophy. Instead of needing a dedicated tool for every Salesforce operation, the agent writes source files (Apex, Flow XML, LWC, metadata XML, `.agent` files) and deploys them via the `sf` CLI -- just like a developer would.

### By the Numbers

| What | Count |
|------|-------|
| Tools | 57 |
| Skills | 27 |
| Slash commands | 106 (79 built-in + 27 from skills) |
| SF knowledge prompts | 18 |

### 57 Tools

| Category | Count | Examples |
|----------|-------|---------|
| Core (filesystem + shell) | 8 | read_file, write_file, edit_file, execute, glob, grep, ls, task |
| Salesforce CLI | 12 | sf_query, sf_deploy, sf_describe_object, sf_data, sf_run_tests, sf_org_limits |
| SF Extended | 12 | scratch_org_create, package_create, sandbox_create, deploy_status, test_coverage |
| Discovery | 3 | sf_list_metadata_types, sf_describe_all_sobjects, sf_list_metadata_of_type |
| Browser (Playwright) | 6 | browser_open, browser_click, browser_fill, browser_screenshot |
| Agentforce | 4 | agent_publish, agent_activate, agent_validate, agent_preview |
| Data Cloud | 7 | dc_query, dc_list_objects, dc_describe, dc_ingest_streaming, dc_create_segment |
| Documentation | 2 | sf_docs_search, sf_docs_read |
| Web | 2 | web_search, web_fetch |
| Planning | 1 | write_todos |

### 27 Skills

| Category | Skills |
|----------|--------|
| Agentforce | agentforce-build, agentforce-test, agentforce-observability, agent-persona |
| Development | apex-patterns, lwc-development, flow-advanced, metadata-generation, visualforce-app |
| Testing and CI | test-automation, ci-cd-pipeline, deployment-checklist |
| Org Management | org-setup, scratch-org-lifecycle, security-hardening, performance-optimization |
| Data | data-cloud-setup, data-migration |
| Integration | connected-app-setup, integration-patterns, heroku-deploy, app-scaffold |
| Packages | package-development, omnistudio-overview |
| Automation | robot-framework-fallback, skill-creator, remember |

### 3-Layer Automation

```
Layer 1: SF CLI / Metadata API       -- write files + sf project deploy (fast, reliable)
Layer 2: Playwright browser tools    -- for Setup operations with no API equivalent
Layer 3: Robot Framework + CumulusCI -- fallback when Shadow DOM blocks Playwright
```

### Self-Extending

Harnessforce can handle any of Salesforce's ~470+ metadata types by discovering what exists, reading the docs, and writing the correct source files. When it learns something new, it saves it as a skill for future sessions.

## Permission Modes

Three permission modes control what the agent can do. Cycle through them with **Shift+Tab** during a session:

| Mode | Behavior |
|------|----------|
| `default` | Confirms before destructive operations (deploys, deletes, overwrites) |
| `plan` | Read-only -- agent can explore and analyze but cannot make changes |
| `yolo` | Auto-approves all operations without confirmation prompts |

Switch modes via slash commands (`/plan`, `/approve`) or the `--permission-mode` CLI flag. Production orgs auto-escalate to require confirmation regardless of mode.

## Model Support

Harnessforce defaults to **Claude Opus 4.6** via OpenRouter. Switch models anytime:

```
/model openrouter:openai/gpt-5.4
/model openrouter:google/gemini-3.1-pro-preview
/model openrouter:deepseek/deepseek-v3.2
/model openrouter:meta-llama/llama-4-maverick
```

Use any provider -- cloud or local:

```bash
# Cloud providers via OpenRouter
harnessforce --model openrouter:anthropic/claude-opus-4.6

# Direct provider
harnessforce --model anthropic:claude-opus-4.6

# Local models (Ollama, vLLM)
harnessforce provider:add --name local --type local --base-url http://localhost:11434
harnessforce --model local:llama3
```

Configure in `~/.harnessforce/models.yaml`:
```yaml
default_model: "openrouter:anthropic/claude-opus-4.6"
providers:
  openrouter:
    type: gateway
    base_url: "https://openrouter.ai/api/v1"
    api_key: "sk-or-your-key-here"
    models:
      - anthropic/claude-opus-4.6
      - openai/gpt-5.4
      - google/gemini-3.1-pro-preview
```

## CLI Commands

```bash
# Launch
harnessforce                          # Interactive agent
harnessforce --model <id>             # Use specific model
harnessforce --permission-mode plan   # Read-only mode
harnessforce --org my-sandbox         # Target specific org
harnessforce --resume <session-id>    # Resume a previous session
```

Key slash commands inside the agent:

| Command | What it does |
|---------|-------------|
| `/help` | List all 106 available commands |
| `/set-key` | Save your OpenRouter API key |
| `/model` | Show or switch models |
| `/org` | Show or switch the target Salesforce org |
| `/force` | View or create FORCE.md project instructions |
| `/deploy` | Dry-run validate, then deploy to the org |
| `/query` | Run a SOQL query |
| `/describe` | Describe an object's fields |
| `/agent-build` | Build an Agentforce agent end-to-end |
| `/agent-test` | Test an Agentforce agent |
| `/plan` / `/approve` | Toggle plan mode |
| `/status` | Show current session info |
| `/doctor` | Check prerequisites |
| `/cost` | Show token usage and estimated cost |
| `/undo` | Restore the previous version of the last edited file |
| `/rollback` | Restore from last deployment snapshot |
| `/threads` / `/resume` | List or resume previous sessions |
| `/remember` | Save learnings to agent memory |
| `/compact` | Summarize older messages to free context |

### Safety Built-In

- **Production org detection**: auto-escalates all writes to require confirmation
- **Dry-run deploys**: validates before real deployment
- **Pre-deploy snapshots**: automatic rollback capability
- **Audit logging**: every tool call logged to `.harnessforce/audit.log`
- **PII awareness**: warns when query results contain sensitive fields

## Development

```bash
git clone https://github.com/skyrmionz/harnessforce.git
cd harnessforce
pnpm install
pnpm build
node apps/cli/dist/index.js
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT
