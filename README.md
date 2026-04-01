# Vibeforce

**An open-source agent harness for Salesforce development** — vibe code anything with Salesforce from your terminal.

<p align="center">
  <img src="apps/cli/src/ui/agent-astro.png" alt="Agent Astro" width="120" />
</p>

<p align="center">
  <strong>The Salesforce Vibe Coding Agent</strong><br/>
  Admin work · Apex development · Agentforce agents · Data Cloud · Custom apps on Heroku<br/>
  All from your terminal.
</p>

## Install

```bash
npm install -g vibeforce
```

### Prerequisites

- **Node.js 20+**
- **Salesforce CLI** (`sf`) — [install guide](https://developer.salesforce.com/tools/salesforcecli)
- **OpenRouter API key** — one key, any model ([get one here](https://openrouter.ai/keys))
- **Python 3.9+** with `robotframework` + `cumulusci` (for Shadow DOM automation)

```bash
# Set your API key
export OPENROUTER_API_KEY=sk-or-...

# Authenticate a Salesforce org
sf org login web --alias my-org

# Launch Vibeforce
vibeforce
```

## What Can It Do?

### Salesforce Admin
```
> Create a custom object called Warranty__c with Status and ExpiryDate fields
> Enable Account Teams in my org
> Query the top 10 Opportunities by Amount
> Set up sharing rules for the Case object
```

### Apex & LWC Development
```
> Write an Apex trigger that prevents Opportunity close without a Contact Role, with tests
> Build an LWC datatable component for Accounts with inline editing
> Show me the debug logs from my last deployment
```

### Agentforce Agent Building
```
> Build an Agentforce agent that handles customer warranty inquiries
> Test my agent with sample utterances
> Run a safety evaluation on the warranty agent
```

### Data Cloud
```
> Query my Data Cloud for individuals with recent email interactions
> List all Data Cloud objects in my org
> Set up a customer segment for high-value accounts
```

### Custom Apps (Any Language)
```
> Build a Python Flask API that syncs SF Opportunities to Postgres, deploy to Heroku
> Create a React dashboard showing my SF Accounts
> Build a Visualforce page showing Account summary, add it to App Launcher
```

### Model Training
```
> Train a model on my org's data so it understands our custom objects
```

## Architecture

Vibeforce follows a **"Write Code, Not Tools"** philosophy. Instead of needing a dedicated tool for every Salesforce operation, the agent writes source files (Apex `.cls`, Agent Script `.agent`, Flow XML, metadata XML, LWC `.js`, etc.) and deploys them via the `sf` CLI — just like a developer would.

### 42 Tools

| Category | Count | Examples |
|----------|-------|---------|
| Core (filesystem + shell) | 8 | read_file, write_file, edit_file, execute, glob, grep |
| Salesforce CLI | 12 | sf_query, sf_deploy, sf_describe_object, sf_data, sf_run_tests |
| Discovery | 3 | sf_list_metadata_types, sf_describe_all_sobjects |
| Browser (Playwright) | 6 | browser_open, browser_click, browser_screenshot |
| Agentforce | 4 | agent_publish, agent_activate, agent_validate |
| Data Cloud | 7 | dc_query, dc_ingest_streaming, dc_create_segment |
| Documentation | 2 | sf_docs_search, sf_docs_read |

### 3-Layer Automation

```
Layer 1: SF CLI / Metadata API       — write files + sf project deploy (fast, reliable)
Layer 2: Playwright browser tools    — for Setup operations with no API equivalent
Layer 3: Robot Framework + CumulusCI — fallback when Shadow DOM blocks Playwright
```

### 8 Skills

Pre-built workflows for complex multi-step tasks:
- `agentforce-build` / `agentforce-test` — end-to-end Agentforce agent creation
- `heroku-deploy` — deploy any app to Heroku
- `app-scaffold` — scaffold Next.js, Flask, Rails, or Spring Boot apps with SF integration
- `connected-app-setup` — create Connected Apps with OAuth (web server, JWT, client credentials)
- `visualforce-app` — VF pages + Lightning apps for App Launcher
- `data-cloud-setup` — configure Data Cloud from scratch
- `robot-framework-fallback` — Shadow DOM piercing escalation

### Self-Extending

Vibeforce can handle **any** of Salesforce's ~470+ metadata types by discovering what exists, reading the docs, and writing the correct source files. When it learns something new, it saves it as a skill for future sessions.

### Safety Built-In

- **4 permission modes**: `default` (confirm destructive ops), `plan` (read-only), `yolo` (auto-approve), `safe` (read tools only)
- **Production org detection**: auto-escalates all writes to require confirmation
- **Dry-run deploys**: validates before real deployment
- **Pre-deploy snapshots**: automatic rollback capability
- **Audit logging**: every tool call logged to `.vibeforce/audit.log`
- **PII awareness**: warns when query results contain sensitive fields

## Model Support

Vibeforce is model-agnostic. Use any LLM:

```bash
# Cloud providers
vibeforce --model anthropic:claude-opus-4.6
vibeforce --model openai:gpt-4o

# Local models (Ollama, vLLM)
vibeforce provider:add --name local --type local --base-url http://localhost:11434
vibeforce --model local:llama3

# Switch mid-session
> /model anthropic:claude-sonnet-4-20250514
```

Configure in `~/.vibeforce/models.yaml`:
```yaml
default_model: "anthropic:claude-sonnet-4-20250514"
providers:
  anthropic:
    type: cloud
    api_key: ${ANTHROPIC_API_KEY}
    models: [claude-opus-4.6, claude-sonnet-4-20250514, claude-haiku-4]
  local:
    type: local
    base_url: http://localhost:11434
    auto_discover: true
```

## CLI Commands

```bash
vibeforce                          # Launch interactive agent
vibeforce --model <id>             # Use specific model
vibeforce --permission-mode plan   # Read-only mode
vibeforce --org my-sandbox         # Target specific org

vibeforce model:list               # List available models
vibeforce model:select <id>        # Switch model
vibeforce provider:add             # Add model provider
vibeforce rollback                 # Restore from last snapshot
```

## Development

```bash
git clone https://github.com/skyrmionz/vibeforce.git
cd vibeforce
pnpm install
pnpm build
node apps/cli/dist/index.js
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT
