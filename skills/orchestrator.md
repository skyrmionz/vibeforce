---
name: Orchestrator
description: Create and manage orchestration apps and templates with sf orchestrator commands
trigger: When user asks to create orchestrations, manage app frameworks, or coordinate multi-step Salesforce processes
---

# Orchestrator Skill

Build and manage orchestration applications using the `@salesforce/plugin-orchestrator` CLI plugin.
Orchestrator enables multi-step, multi-service process coordination that goes beyond what Flows
or single Apex transactions can handle.

## Overview

Orchestrator manages two primary resources:

- **Apps** -- Runnable orchestration instances that execute a defined sequence of steps
- **Templates** -- Reusable blueprints that define orchestration structure without runtime state

| Resource | Purpose | Analogy |
|----------|---------|---------|
| Template | Define the orchestration blueprint | Flow Definition |
| App | Running instance of a template | Flow Interview |

---

## Prerequisites

### Install the Plugin

```bash
sf plugins install @salesforce/plugin-orchestrator

# Verify installation
sf orchestrator --help
```

### Verify Org Access

```bash
sf org display -o <org> --json | jq '{username: .result.username, instanceUrl: .result.instanceUrl}'
```

### Check AppFramework Availability

Orchestrator uses the AppFramework infrastructure. Verify it is enabled:

```bash
sf data query \
  -q "SELECT Id, DeveloperName FROM AppDefinition LIMIT 1" \
  -o <org> --json 2>&1
```

If this returns an error about the object not existing, AppFramework may not be enabled in your org.

---

## Command Reference

### Template Commands

Templates define the blueprint for orchestrations.

#### Create a Template

```bash
sf orchestrator create template \
  --name "OrderFulfillment" \
  --description "Multi-step order fulfillment process" \
  -o <org> \
  --json | tee /tmp/template-create.json
```

Capture the template ID:

```bash
TEMPLATE_ID=$(jq -r '.result.id // .result.templateId // empty' /tmp/template-create.json)
echo "Template ID: $TEMPLATE_ID"
```

#### List Templates

```bash
sf orchestrator list template \
  -o <org> \
  --json | jq '.result[] | {id: .id, name: .name, status: .status}'
```

#### Display Template Details

```bash
sf orchestrator display template \
  --id "$TEMPLATE_ID" \
  -o <org> \
  --json | jq '.'
```

#### Update a Template

```bash
sf orchestrator update template \
  --id "$TEMPLATE_ID" \
  --description "Updated: Order fulfillment with fraud check" \
  -o <org> \
  --json
```

#### Delete a Template

```bash
sf orchestrator delete template \
  --id "$TEMPLATE_ID" \
  -o <org> \
  --json
```

### App Commands

Apps are running instances created from templates.

#### Create an App

```bash
sf orchestrator create app \
  --name "OrderFulfillment_Prod" \
  --template-id "$TEMPLATE_ID" \
  --description "Production order fulfillment orchestration" \
  -o <org> \
  --json | tee /tmp/app-create.json

APP_ID=$(jq -r '.result.id // .result.appId // empty' /tmp/app-create.json)
echo "App ID: $APP_ID"
```

#### List Apps

```bash
sf orchestrator list app \
  -o <org> \
  --json | jq '.result[] | {id: .id, name: .name, templateId: .templateId, status: .status}'
```

#### Display App Details

```bash
sf orchestrator display app \
  --id "$APP_ID" \
  -o <org> \
  --json | jq '.'
```

#### Update an App

```bash
sf orchestrator update app \
  --id "$APP_ID" \
  --description "Updated description" \
  -o <org> \
  --json
```

#### Delete an App

```bash
sf orchestrator delete app \
  --id "$APP_ID" \
  -o <org> \
  --json
```

---

## When to Use Orchestrator vs Flows vs Apex

### Decision Matrix

| Requirement | Orchestrator | Flow | Apex |
|-------------|-------------|------|------|
| Multi-step coordination across services | Best | OK (subflows) | Manual |
| Long-running processes (hours/days) | Built-in | Platform Events workaround | Queueable chains |
| Parallel execution branches | Built-in | Not native | Future/Queueable |
| Cross-service API calls | Built-in | Limited | HttpRequest |
| Error handling with retry | Built-in | Fault paths | Try/catch |
| Human approval waits | Built-in | Pause elements | Custom polling |
| Simple record automation | Overkill | Best | OK |
| Single-transaction logic | Overkill | OK | Best |
| Complex data transforms | OK | Limited | Best |
| UI-triggered actions | Through API | Best | Through LWC |

### Use Orchestrator When

- Process spans multiple services or external APIs
- Steps need to run in parallel for performance
- Process is long-running (minutes to days)
- You need built-in retry and error handling across steps
- Process involves waiting for external events or human decisions
- You want a manageable definition of a multi-step process

### Use Flow When

- Automating record-triggered business logic
- Building screen-based user interactions
- Simple sequential logic within a single transaction
- Scheduled batch operations
- The entire process fits within Salesforce governor limits

### Use Apex When

- Complex data transformations or calculations
- High-performance batch processing
- Custom API endpoint logic
- Operations requiring fine-grained transaction control
- Complex error handling within a single service boundary

---

## Orchestration Design Patterns

### Pattern 1: Sequential Pipeline

Steps execute one after another. Each step's output feeds the next step's input.

```
[Validate Order] -> [Check Inventory] -> [Process Payment] -> [Ship Order] -> [Send Confirmation]
```

**When to use:** Linear processes where each step depends on the previous step's output.

```bash
# Create the template for a sequential pipeline
sf orchestrator create template \
  --name "OrderPipeline_v1" \
  --description "Sequential: validate, inventory, payment, ship, confirm" \
  -o <org> --json

# The template definition would include steps in order:
# Step 1: Validate Order       (Flow: Validate_Order)
# Step 2: Check Inventory      (Flow: Check_Inventory)
# Step 3: Process Payment      (Apex: PaymentProcessor)
# Step 4: Ship Order           (Flow: Ship_Order)
# Step 5: Send Confirmation    (Flow: Send_Email_Confirmation)
```

### Pattern 2: Parallel Fan-Out / Fan-In

Multiple steps execute concurrently, then results are aggregated.

```
                  -> [Credit Check]    -\
[Receive App] --+--> [Background Check] +--> [Aggregate Results] -> [Decision]
                  -> [Income Verify]   -/
```

**When to use:** Independent checks or enrichments that can run simultaneously to reduce total execution time.

```bash
# Template for parallel verification
sf orchestrator create template \
  --name "LoanVerification_v1" \
  --description "Parallel: credit check + background check + income verify, then aggregate" \
  -o <org> --json
```

### Pattern 3: Conditional Branching

Route to different steps based on data values or prior step results.

```
[Evaluate Risk] -> if HIGH -> [Manual Review] -> [Decision]
                -> if LOW  -> [Auto Approve]  -> [Decision]
```

**When to use:** Processes where the path depends on runtime conditions.

### Pattern 4: Retry with Escalation

Attempt a step, retry on failure, escalate after max retries.

```
[Call External API] -> if FAIL -> [Wait 30s] -> [Retry] -> if FAIL x3 -> [Escalate to Human]
                    -> if OK   -> [Continue]
```

**When to use:** Integration points with unreliable external services.

### Pattern 5: Long-Running Approval

Orchestrations that pause and wait for human input or external events.

```
[Submit Request] -> [Wait for Approval] -> if APPROVED -> [Provision] -> [Notify]
                                        -> if REJECTED -> [Notify Rejection]
```

**When to use:** Multi-day processes with human decision points.

### Pattern 6: Agent-Assisted Orchestration

Combine Agentforce agents with orchestrated steps:

```
[Agent: Classify Issue] -> [Agent: Draft Response] -> [Human: Review] -> [System: Send] -> [Agent: Follow Up]
```

**When to use:** Processes where AI handles data collection and drafting, humans handle decisions.

```bash
# Template for agent-assisted customer resolution
sf orchestrator create template \
  --name "AgentAssistedResolution_v1" \
  --description "Agent classifies and drafts, human reviews, system sends, agent follows up" \
  -o <org> --json

# Step 1: Agentforce auto-classifies the incoming issue
# Step 2: Agentforce drafts a response based on classification
# Step 3: Human reviews and approves/edits the draft (wait state)
# Step 4: System sends the response and closes the case
# Step 5: Agentforce sends follow-up survey after 3 days (scheduled)
```

---

## AppFramework Management

Orchestrator apps run on the Salesforce AppFramework. Key management patterns:

### Monitor Running Apps

```bash
# List all apps with status
sf orchestrator list app -o <org> --json \
  | jq '.result[] | {name: .name, status: .status, createdDate: .createdDate}'
```

### App Lifecycle States

| State | Description | Transitions To |
|-------|-------------|---------------|
| `Draft` | Template created, not yet deployed | `Active` |
| `Active` | Running and accepting invocations | `Paused`, `Deactivated` |
| `Paused` | Temporarily stopped, can resume | `Active`, `Deactivated` |
| `Deactivated` | Permanently stopped | (terminal) |

### Health Check Script

```bash
#!/bin/bash
# orchestrator-health.sh -- Check all orchestration apps for issues
set -euo pipefail

ORG="${1:-myorg}"

echo "=== Orchestrator Health Check ==="
echo "Org: $ORG"
echo ""

# List all templates
echo "--- Templates ---"
TEMPLATES=$(sf orchestrator list template -o "$ORG" --json 2>/dev/null || echo '{"result":[]}')
TEMPLATE_COUNT=$(echo "$TEMPLATES" | jq '.result | length')
echo "Total templates: $TEMPLATE_COUNT"
echo "$TEMPLATES" | jq -r '.result[] | "  \(.name): \(.status // "unknown")"'

echo ""

# List all apps
echo "--- Apps ---"
APPS=$(sf orchestrator list app -o "$ORG" --json 2>/dev/null || echo '{"result":[]}')
APP_COUNT=$(echo "$APPS" | jq '.result | length')
echo "Total apps: $APP_COUNT"

# Status summary
echo ""
echo "--- Status Summary ---"
echo "$APPS" | jq -r '.result | group_by(.status) | .[] | "  \(.[0].status // "unknown"): \(length) app(s)"'

# Non-active apps
NON_ACTIVE=$(echo "$APPS" | jq '[.result[] | select(.status != "Active")] | length')
if [ "$NON_ACTIVE" != "0" ]; then
  echo ""
  echo "--- Non-Active Apps (review needed) ---"
  echo "$APPS" | jq -r '.result[] | select(.status != "Active") | "  \(.name): \(.status // "unknown")"'
fi

echo ""
echo "=== Health Check Complete ==="
```

### Cleanup Orphaned Apps

```bash
#!/bin/bash
# orchestrator-cleanup.sh -- Remove apps in Draft state that were never activated
set -euo pipefail

ORG="${1:-myorg}"

DRAFT_APPS=$(sf orchestrator list app -o "$ORG" --json 2>/dev/null \
  | jq -r '.result[] | select(.status == "Draft") | .id')

if [ -z "$DRAFT_APPS" ]; then
  echo "No draft apps to clean up."
  exit 0
fi

echo "Found draft apps to clean up:"
for APP_ID in $DRAFT_APPS; do
  echo "  Deleting: $APP_ID"
  sf orchestrator delete app --id "$APP_ID" -o "$ORG" --json 2>/dev/null | jq -r '.result // "deleted"'
done
echo "Cleanup complete."
```

---

## Recipes

### Recipe 1: Create a Complete Orchestration

Full end-to-end workflow from template to running app:

```bash
#!/bin/bash
set -euo pipefail

ORG="myorg"

# Step 1: Create template
echo "=== Creating template ==="
TEMPLATE_RESULT=$(sf orchestrator create template \
  --name "CustomerOnboarding_v1" \
  --description "New customer onboarding: verify identity, create account, provision services, send welcome" \
  -o "$ORG" --json 2>/dev/null)

TEMPLATE_ID=$(echo "$TEMPLATE_RESULT" | jq -r '.result.id // .result.templateId')
echo "Template: $TEMPLATE_ID"

# Step 2: Verify template
echo ""
echo "=== Template details ==="
sf orchestrator display template --id "$TEMPLATE_ID" -o "$ORG" --json | jq '.result'

# Step 3: Create app from template
echo ""
echo "=== Creating app ==="
APP_RESULT=$(sf orchestrator create app \
  --name "CustomerOnboarding_v1_Prod" \
  --template-id "$TEMPLATE_ID" \
  --description "Production customer onboarding orchestration" \
  -o "$ORG" --json 2>/dev/null)

APP_ID=$(echo "$APP_RESULT" | jq -r '.result.id // .result.appId')
echo "App: $APP_ID"

# Step 4: Display final state
echo ""
echo "=== Final state ==="
sf orchestrator display app --id "$APP_ID" -o "$ORG" --json | jq '.result'

echo ""
echo "=== Summary ==="
echo "Template ID: $TEMPLATE_ID"
echo "App ID:      $APP_ID"
echo "Status:      Created"
```

### Recipe 2: Audit All Orchestrations

```bash
#!/bin/bash
set -euo pipefail

ORG="${1:-myorg}"

echo "=== Orchestrator Audit: $ORG ==="
echo ""

echo "--- Templates ---"
sf orchestrator list template -o "$ORG" --json 2>/dev/null \
  | jq -r '["ID", "NAME", "STATUS"], ["--", "----", "------"], (.result[] | [.id, .name, (.status // "?")]) | @tsv' \
  | column -t -s $'\t'

echo ""
echo "--- Apps ---"
sf orchestrator list app -o "$ORG" --json 2>/dev/null \
  | jq -r '["ID", "NAME", "TEMPLATE", "STATUS"], ["--", "----", "--------", "------"], (.result[] | [.id, .name, (.templateId // "?"), (.status // "?")]) | @tsv' \
  | column -t -s $'\t'
```

### Recipe 3: Template Version Management

Create a new version of a template while keeping the old one:

```bash
#!/bin/bash
set -euo pipefail

ORG="myorg"
BASE_NAME="OrderFulfillment"
OLD_VERSION="v1"
NEW_VERSION="v2"

# Get current template info
echo "=== Current template ==="
OLD_TEMPLATE_ID=$(sf orchestrator list template -o "$ORG" --json 2>/dev/null \
  | jq -r ".result[] | select(.name == \"${BASE_NAME}_${OLD_VERSION}\") | .id")
echo "Old template: $OLD_TEMPLATE_ID"

sf orchestrator display template --id "$OLD_TEMPLATE_ID" -o "$ORG" --json | jq '.result'

# Create new version
echo ""
echo "=== Creating ${BASE_NAME}_${NEW_VERSION} ==="
NEW_TEMPLATE_RESULT=$(sf orchestrator create template \
  --name "${BASE_NAME}_${NEW_VERSION}" \
  --description "Order fulfillment v2: added fraud check and parallel inventory check" \
  -o "$ORG" --json 2>/dev/null)

NEW_TEMPLATE_ID=$(echo "$NEW_TEMPLATE_RESULT" | jq -r '.result.id // .result.templateId')
echo "New template: $NEW_TEMPLATE_ID"

# Create app from new version
echo ""
echo "=== Creating app from v2 ==="
sf orchestrator create app \
  --name "${BASE_NAME}_${NEW_VERSION}_Prod" \
  --template-id "$NEW_TEMPLATE_ID" \
  --description "Production order fulfillment (v2 with fraud check)" \
  -o "$ORG" --json | jq '.result'

echo ""
echo "Both versions exist. Migrate traffic from v1 to v2, then deactivate v1."
echo "Old: ${BASE_NAME}_${OLD_VERSION} ($OLD_TEMPLATE_ID)"
echo "New: ${BASE_NAME}_${NEW_VERSION} ($NEW_TEMPLATE_ID)"
```

### Recipe 4: Orchestrator with Agentforce Integration

Use orchestrations as action targets in Agentforce agents:

```bash
#!/bin/bash
set -euo pipefail

ORG="myorg"

# Step 1: Create orchestration template for a complex process
echo "=== Creating orchestration template ==="
sf orchestrator create template \
  --name "ComplexReturnProcess_v1" \
  --description "Multi-step return: validate eligibility, inspect item, process refund, update inventory" \
  -o "$ORG" --json | jq '.result'

# Step 2: Create app from template
TEMPLATE_ID=$(sf orchestrator list template -o "$ORG" --json \
  | jq -r '.result[] | select(.name == "ComplexReturnProcess_v1") | .id')

sf orchestrator create app \
  --name "ComplexReturnProcess_v1_Prod" \
  --template-id "$TEMPLATE_ID" \
  -o "$ORG" --json | jq '.result'

# Step 3: Create a bridge Flow that invokes the orchestration
# The Flow acts as a bridge between Agentforce and Orchestrator
# Deploy the Flow to the org:
# sf project deploy start --source-dir force-app/main/default/flows -o "$ORG"

# Step 4: Reference the bridge Flow in your .agent file:
cat << 'AGENTEOF'
# Add to your .agent file:
topic returns:
    label: "Returns"
    description: "Process multi-step returns with validation, inspection, and refund"
    actions:
        process_return:
            description: "Process a multi-step return through orchestration"
            target: "flow://Orchestrated_Return_Flow"
            inputs:
                order_id: string
                    description: "Order ID to return"
                reason: string
                    description: "Reason for return"
            outputs:
                return_status: string
                    description: "Return processing status"
                refund_amount: object
                    complex_data_type_name: "currency"
                    description: "Refund amount"
    reasoning:
        instructions: |
            Help the customer process a return.
            Use the initiate_return action to start the orchestrated return process.
            The process includes eligibility check, item inspection, refund, and inventory update.
        actions:
            initiate_return: @actions.process_return
                description: "Start the multi-step return process"
                with order_id = ...
                with reason = ...
                set @variables.return_status = @outputs.return_status
AGENTEOF

echo ""
echo "Bridge Flow connects Agentforce action to Orchestrator app."
echo "Deploy the Flow, then publish the agent."
```

---

## Orchestrator Design Best Practices

### 1. Start with Templates, Always

Always define a template first, then create apps from it. This enables versioning, reuse across environments, and safe rollback.

### 2. Idempotent Steps

Design each step to be safely re-executable. If a step fails and retries, it should not create duplicate records.

```
GOOD: "Upsert order record by external ID"
BAD:  "Insert new order record" (creates duplicates on retry)
```

### 3. Explicit Error Handling

Define what happens when each step fails. Do not rely on default behavior.

```
Step: Process Payment
  On Success -> Ship Order
  On Failure -> Log Error -> Notify Finance Team -> Pause for Manual Review
```

### 4. Granular Steps

Break complex operations into small, testable steps. Each step should do one thing.

```
BAD:  [Process Entire Order]  (one monolithic step)
GOOD: [Validate] -> [Reserve Inventory] -> [Charge Payment] -> [Create Shipment]
```

### 5. Timeout Configuration

Set appropriate timeouts for each step, especially external API calls.

| Step Type | Recommended Timeout |
|-----------|-------------------|
| Internal Flow | 60 seconds |
| External API call | 120 seconds |
| Human approval | 24-72 hours |
| Batch processing | 5-30 minutes |

### 6. Observability

Log key data at each step for debugging:

- Step start/end timestamps
- Input/output summaries
- Decision branch taken
- Error details including stack traces

Pipe orchestration events to Data Cloud for cross-process analytics.

### 7. Naming Convention

```
{Process}_{Version}             -- for templates
{Process}_{Version}_{Env}       -- for apps

Examples:
  Template: OrderFulfillment_v2
  App:      OrderFulfillment_v2_Prod
  App:      OrderFulfillment_v2_Staging
  App:      OrderFulfillment_v2_QA
```

### 8. Test in Isolation

Use scratch orgs to test orchestrations in isolation before deploying to shared environments. Orchestrations are stateful and can affect other running processes.

```bash
# Create scratch org for orchestration testing
sf org create scratch -f config/project-scratch-def.json -a orch-test -d 7

# Install plugin and create test orchestration
sf plugins install @salesforce/plugin-orchestrator
sf orchestrator create template --name "Test_Pipeline" --description "test" -o orch-test --json

# ... run tests ...

# Clean up
sf org delete scratch -o orch-test --no-prompt
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|---------|
| `sf orchestrator` not found | Plugin not installed | `sf plugins install @salesforce/plugin-orchestrator` |
| `Cannot create template` | Missing permissions | Ensure user has AppFramework admin or appropriate permission set |
| `Template not found` | Wrong org or ID | Verify org with `sf org display -o <org>` and list templates |
| `App creation fails` | Invalid template ID | List templates to get correct ID: `sf orchestrator list template` |
| Steps not executing | App not in Active state | Check app status and activate if needed |
| Timeout on long steps | Default timeout too short | Configure step-level timeouts |
| Parallel steps not running | Dependency misconfigured | Verify step dependencies allow parallel execution |
| `Cannot delete active app` | App must be deactivated first | Deactivate the app, then delete |
| App stuck in wait state | Actor not assigned or timeout not set | Check actor assignment; add timeout transition |
| Permission error on operations | Missing permission set | Assign OrchestratorAdmin or similar permission set |

## Dependencies

- `sf` CLI 2.120.0+
- `@salesforce/plugin-orchestrator` plugin installed
- Org with AppFramework enabled
- Appropriate user permissions for orchestration management
- `jq` (system) -- JSON processing
