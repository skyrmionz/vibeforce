---
name: Headless 360
description: Leverage Salesforce Headless 360 APIs for API-first, UI-free platform access from AI agents and external tools
trigger: When user asks about Headless 360, API-first Salesforce access, headless APIs, or programmatic platform interaction without UI
---

## Headless 360 Skill

Salesforce Headless 360 decouples every layer of the platform from the UI, exposing capabilities as API-first services consumable by any agent, any model, any tool. This skill covers how to leverage these APIs from Harnessforce and external AI agents.

**Status**: Announced at TDX 2026 (April 2026). Individual APIs have varying availability — GA, pilot, or announced. This skill marks availability clearly.

---

## What is Headless 360?

Headless 360 is Salesforce's initiative to make the entire platform accessible without the browser UI. Key principle: **"Headless doesn't mean no UI"** — it means the same capabilities can surface through agentic experiences, CLI tools, Slack, Claude Code, or any external system.

### What It Enables for AI Agents

| Capability | Before Headless 360 | With Headless 360 |
|-----------|---------------------|-------------------|
| CRM operations | REST API + manual setup | Standardized headless APIs |
| Commerce | SCAPI (already headless) | Unified with CRM APIs |
| Data Cloud | Limited API access | Full Data 360 Connect API |
| Agentforce | Browser-only management | Programmatic agent invocation |
| Setup & Config | Browser UI required | API-driven configuration |

---

## Available Now: APIs You Can Use Today

### 1. Data 360 Connect API (GA)

Query, ingest, and manage Data Cloud programmatically:

```
execute("sf data query --query \"SELECT Id, Name FROM DataCloudObject__dlm WHERE Status = 'Active' LIMIT 10\" -o DevOrg --json")
```

#### Direct REST API Access

```
execute("sf api request rest /services/data/v62.0/ssot/queryV2 --method POST --body '{\"sql\": \"SELECT * FROM UnifiedIndividual__dlm LIMIT 10\"}' -o DevOrg --json")
```

#### Headless Data Ingestion

```
execute("sf api request rest /services/data/v62.0/ssot/streaming-jobs --method POST --body '{\"object\": \"MyCustomDMO__dlm\", \"operation\": \"upsert\", \"externalIdFieldName\": \"ExternalId__c\"}' -o DevOrg --json")
```

### 2. Standard REST API (GA)

The backbone of headless Salesforce access — all CRUD, SOQL, metadata:

```
execute("sf api request rest /services/data/v62.0/sobjects/Account/describe -o DevOrg --json")
```

### 3. Composite API (GA)

Batch multiple operations in a single request:

```
execute("sf api request rest /services/data/v62.0/composite --method POST --body '{\"compositeRequest\": [{\"method\": \"GET\", \"url\": \"/services/data/v62.0/sobjects/Account/describe\", \"referenceId\": \"accountDescribe\"}, {\"method\": \"GET\", \"url\": \"/services/data/v62.0/sobjects/Contact/describe\", \"referenceId\": \"contactDescribe\"}]}' -o DevOrg --json")
```

### 4. Metadata API (GA)

Deploy and retrieve metadata programmatically:

```
execute("sf project deploy start --source-dir force-app --target-org DevOrg --json")
execute("sf project retrieve start --metadata ApexClass --target-org DevOrg --json")
```

### 5. Tooling API (GA)

Access developer-facing metadata (Apex, Visualforce, LWC):

```
execute("sf api request rest /services/data/v62.0/tooling/query?q=SELECT+Id,Name,Status+FROM+ApexClass+WHERE+Name+LIKE+'%Test%' -o DevOrg --json")
```

---

## Coming Soon: Emerging Headless APIs

### 6. Agentforce Programmatic Access (Pilot/Announced)

Invoke Agentforce agents from external systems:

```bash
# Programmatic preview (available now via sf CLI)
sf agent preview start --agent-name MyAgent -o DevOrg --json
sf agent preview send --message "What is my order status?" --json
sf agent preview end --json
```

Future: Direct REST API to invoke agents without the sf CLI:
```
POST /services/data/v62.0/einstein/agents/{agentId}/sessions
POST /services/data/v62.0/einstein/agents/{agentId}/sessions/{sessionId}/messages
```

### 7. Headless Commerce (SCAPI) (GA)

Commerce Cloud's Shopper APIs are already headless:
- Product search, catalog browsing
- Cart management, checkout
- Customer authentication

### 8. Headless Setup & Configuration (Announced)

Configure orgs programmatically without the Setup UI:
- Permission set assignment
- Custom settings/metadata
- Feature toggles

---

## Integration Patterns for Harnessforce

### Pattern 1: Direct API Calls

Use Harnessforce's `execute` tool to make REST API calls:

```
execute("sf api request rest /services/data/v62.0/sobjects/Account --method POST --body '{\"Name\": \"New Account from Agent\", \"Industry\": \"Technology\"}' -o DevOrg --json")
```

### Pattern 2: MCP Server Bridge

When Harnessforce runs as an MCP server for Claude Code, the headless APIs become tools that Claude Code can invoke:

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

Claude Code can then call `mcp_harnessforce_sf_query`, `mcp_harnessforce_sf_deploy`, etc.

### Pattern 3: Agent-to-Agent Communication

Use Agentforce's programmatic preview to have Harnessforce invoke deployed agents:

```
execute("sf agent preview start --agent-name Customer_Support_Agent -o ProdOrg --json")
execute("sf agent preview send --message 'Create a case for customer issue: login problems' --json")
execute("sf agent preview end --json")
```

### Pattern 4: Data Pipeline Automation

Automate Data Cloud ingestion and transformation:

1. Query source data
2. Transform with Apex or external processing
3. Ingest via streaming API
4. Verify with Data Cloud query

```
execute("sf data query --query \"SELECT Id, Name, Email FROM Contact WHERE CreatedDate = TODAY\" -o SourceOrg --json")
```

---

## Developer Setup

### Step 1: Verify API Access

```
execute("sf org display -o DevOrg --json")
execute("sf org list limits -o DevOrg --json")
```

### Step 2: Enable Required Features

For Data Cloud APIs:
```
execute("sf data query --query \"SELECT Id, DurableId FROM DataCloudSetup\" -o DevOrg --json")
```

For Agentforce programmatic access:
```
execute("sf data query --query \"SELECT Id, DeveloperName FROM BotDefinition\" -o DevOrg --json")
```

### Step 3: Connected App for External Access

If accessing from outside the sf CLI (e.g., from a custom integration):

1. Create a Connected App with OAuth2 JWT Bearer flow
2. Assign permission sets for API access
3. Use the `/connected-app-setup` skill for guided setup

---

## Best Practices

- **Prefer sf CLI over raw REST**: The CLI handles auth, pagination, and error formatting
- **Use Composite API for batching**: Reduces API call count (governor limit: 100 SOQL/transaction)
- **Cache metadata locally**: Use `sf project retrieve` to work with metadata offline
- **Monitor API limits**: Check `/org-limits` before large operations
- **Version your API calls**: Always specify API version (v62.0) to avoid breaking changes

---

## Availability Summary

| API | Status | Notes |
|-----|--------|-------|
| REST/SOQL/CRUD | GA | Full access via sf CLI |
| Composite API | GA | Batch operations |
| Metadata API | GA | Deploy/retrieve |
| Tooling API | GA | Developer metadata |
| Data 360 Connect | GA | Data Cloud CRUD |
| Commerce SCAPI | GA | Headless commerce |
| Agentforce CLI Preview | GA | sf agent preview commands |
| Agentforce REST API | Pilot | Direct HTTP invocation |
| Headless Setup Config | Announced | TDX 2026, no GA date |
