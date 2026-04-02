---
name: Agentforce Build
description: Build a complete Agentforce agent from natural language requirements using the ADLC workflow
trigger: When user asks to build, create, or scaffold an Agentforce agent
---

## Agentforce Build Skill

Build a complete, production-ready Agentforce agent from requirements through deployment.
This skill follows the full Agent Development Life Cycle (ADLC) with 8 phases:
safety pre-gate, requirements, setup, generation, verification, scoring, preview/fix loop, and deploy.

---

## Phase 0: Safety Pre-Gate

**Before generating any agent, evaluate the request against 7 safety categories.**
This is a hard gate — if BLOCK-level issues are found, refuse to proceed.

### 7 Safety Categories

1. **Identity & Transparency** — Agent must identify as AI, no human impersonation
2. **User Safety & Wellbeing** — No medical/legal/financial advice beyond scope, escalate urgent concerns
3. **Data Handling & Privacy** — No unnecessary PII exposure, verify identity before sensitive data access
4. **Content Safety** — No harmful content, professional tone, filter inappropriate language
5. **Fairness & Non-Discrimination** — Equal treatment, no biased language, no stereotype assumptions
6. **Deception & Manipulation** — No dark patterns, honest info, no pressure tactics
7. **Scope & Boundaries** — Stay within defined topics, graceful out-of-scope handling

### Severity Levels

- **BLOCK**: Refuse the request entirely. Examples: agent designed to impersonate a real person, provide unregulated medical diagnoses, deliberately mislead users.
- **WARN**: Ask clarifying questions and propose mitigations. Examples: handles sensitive data without verification step, missing escalation path for edge cases.
- **CLEAN**: Proceed to Phase 1.

### Proactive Safety Additions (ALL agents)

Every agent MUST include these regardless of request:
- AI disclosure in `system: instructions:` ("I am an AI assistant...")
- Scope boundaries ("I can only help with X. For other topics, please contact...")
- Escalation path for sensitive topics
- Professional referral disclaimers for regulated domains (healthcare, finance, legal)

---

## Phase 1: Requirements Gathering

**Do not jump straight to generating the agent.** Ask clarifying questions in rounds.

### Round 1 — Business Context
- What problem does this agent solve?
- Who are the target users?
- Top 3 must-do tasks?
- What should the agent NEVER do?

### Round 2 — Agent Design
- **Agent name** (PascalCase, e.g., `OrderServiceAgent`)
- **Agent type**: Service (customer-facing) or Employee (internal)
- **Topics**: What conversation domains should the agent handle?
- **Actions per topic**: What should the agent DO? (query data, create records, call APIs, search knowledge)
- **Variables**: What data flows between topics? (customer info, case IDs, product details)
  - Mutable vs linked variables
- **FSM pattern**: Hub-and-spoke (most common), verification gate, or linear
- **Channels**: Messaging, voice, web, or internal

### Round 3 — Scenarios
- 2-3 example conversations covering happy paths
- Edge cases and ambiguous inputs
- Escalation triggers (when to hand off to human)

**Do not proceed until Rounds 1-2 are answered.** Round 3 is optional but recommended.

---

## Phase 2: Setup

### Step 0: Project Structure

Ensure `sfdx-project.json` exists in the working directory. Create a minimal one if missing:
```json
{
  "packageDirectories": [{ "path": "force-app", "default": true }],
  "sfdcLoginUrl": "https://login.salesforce.com",
  "sourceApiVersion": "63.0"
}
```

### Step 1: Query Einstein Agent User

```bash
sf data query -q "SELECT Username FROM User WHERE Profile.Name = 'Einstein Agent User' AND IsActive = true" -o <org> --json
```

Store the username for the `default_agent_user` field in the agent config.

### Step 2: Discover Existing Targets

Query the org for existing Flows and Apex classes before generating action definitions.
Do NOT guess parameter names — discover them from the org.

```bash
# List active autolaunched Flows
sf data query -q "SELECT ApiName, IsActive FROM FlowDefinitionView WHERE IsActive = true AND ProcessType = 'AutoLaunchedFlow'" -o <org> --json

# Get Flow parameters
sf api request rest "/services/data/v63.0/actions/custom/flow/<FlowApiName>" -o <org>

# List Apex @InvocableMethod classes
sf data query -q "SELECT Name FROM ApexClass WHERE Status = 'Active'" -o <org> --json
```

Use discovered parameter names and types in Level 1 action definitions.

---

## Phase 3: Generate Agent Script

Write the `.agent` file and `bundle-meta.xml` to:
```
force-app/main/default/aiAuthoringBundles/<AgentName>/
  <AgentName>.agent
  <AgentName>.bundle-meta.xml
```

### Bundle Metadata (MUST be minimal)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<AiAuthoringBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <bundleType>AGENT</bundleType>
</AiAuthoringBundle>
```

Only `<bundleType>AGENT</bundleType>`. No extra fields.

### Agent Script Block Order (mandatory)

1. `config:` — Agent identity. `developer_name` MUST match folder name.
2. `variables:` — Mutable, linked, typed variables.
3. `system:` — Global instructions and messages (welcome, error).
4. `connection messaging:` — Escalation routing (service agents only).
5. `knowledge:` — Knowledge base config (optional).
6. `language:` — Locale settings (optional).
7. `start_agent topic_selector:` — Single entry point. Always name it `topic_selector`.
8. `topic:` blocks — One or more conversation topics.

### Critical Syntax Rules

- **Tab indentation only** — spaces are rejected by the parser.
- **No `else if`** — use compound conditions: `if x and y:`.
- **No nested `if`** — flatten all conditional logic.
- **Booleans capitalized**: `True` / `False`.
- **`->`** for procedural logic (transitions, action calls).
- **`|`** for natural language text passed to the LLM.
- **`{!@variables.name}`** for variable injection / merge fields.
- **`@actions.X`**, **`@topic.X`**, **`@outputs.X`** for cross-references.
- **Do NOT include `agent_type`** in the `.agent` file (causes server crash).
- **`start_agent` instructions**: MUST say "You are a router only. Do NOT answer directly."
- **Numeric action I/O**: Use `object` + `complex_data_type_name` (never bare `number`).
- **`after_reasoning:`** has NO `instructions:` wrapper — content goes directly underneath.
- **Reserved names**: `description`, `label`, `language`, `escalate` — cannot be used as variable/field names.

### Two-Level Action System

**Level 1 (topic > actions)**: Defines WHAT the action is — `target:`, `inputs:`, `outputs:`.
**Level 2 (reasoning > actions)**: Defines HOW to call it — `with`/`set` bindings, `available when` guards.

```
topic order_support:
    actions:
        # Level 1: DEFINITION
        get_order_status:
            description: "Look up order status"
            target: "flow://Get_Order_Status"
            inputs:
                order_id: string
                    description: "Order ID to look up"
            outputs:
                status: string
                    description: "Current order status"
                    is_displayable: True

    reasoning:
        instructions: ->
            | Help the customer check their order status.
            | Use the lookup_order action to find the order.
        actions:
            # Level 2: INVOCATION
            lookup_order: @actions.get_order_status
                description: "Look up order details"
                with order_id = @variables.order_id
                set @variables.order_status = @outputs.status
```

### Architecture Patterns

**Hub-and-Spoke** (most common): `start_agent` routes to specialized topics. Each spoke has a "back to hub" transition. Do NOT create a separate routing topic — `start_agent` IS the router.

**Verification Gate**: Identity verification before protected topics. Use `available when` guards on protected transitions.

**Post-Action Loop**: Post-action checks at TOP of `instructions: ->` trigger on re-resolution after action completes.

### Full Agent Example

```
config:
    developer_name: "OrderService"
    agent_label: "Order Service"
    description: "Handles order inquiries, returns, and tracking"
    default_agent_user: "einsteinagent@00dxx000001234.ext"

variables:
    order_id: mutable string = ""
        description: "Current order ID"
    is_verified: mutable boolean = False
        description: "Customer identity verified"
    CustomerEmail: linked string
        source: @MessagingSession.MessagingEndUserId
        description: "Customer email from session"
        visibility: "External"

system:
    instructions: |
        You are an AI-powered order service assistant.
        You help customers check order status, process returns, and track shipments.
        Always verify customer identity before accessing order data.
        If you cannot help, offer to connect with a human agent.
    messages:
        welcome: "Hello! I can help with orders, returns, and tracking. What do you need?"
        error: "I encountered an issue. Let me connect you with a human agent."

start_agent topic_selector:
    description: "Route user requests to the appropriate topic"
    reasoning:
        instructions: |
            You are a router only. Do NOT answer questions or provide help directly.
            Always use a transition action to route to the correct topic immediately.
            - Order status or tracking -> use to_orders
            - Returns or refunds -> use to_returns
            - Identity verification needed -> use to_verify
        actions:
            to_orders: @utils.transition to @topic.order_support
                description: "Order status and tracking questions"
            to_returns: @utils.transition to @topic.return_support
                description: "Return and refund requests"
            to_verify: @utils.transition to @topic.verify_identity
                description: "Verify customer identity"

topic verify_identity:
    label: "Identity Verification"
    description: "Verify customer identity before accessing account data"
    reasoning:
        instructions: ->
            if @variables.is_verified == True:
                | Identity already verified. How can I help?
            else:
                | Please provide your email address to verify your identity.
        actions:
            check_identity: @actions.verify_customer
                description: "Verify customer by email"
                with email = ...
                set @variables.is_verified = @outputs.verified
            to_orders: @utils.transition to @topic.order_support
                description: "Go to order support"
                available when @variables.is_verified == True

    actions:
        verify_customer:
            description: "Verify customer identity"
            target: "flow://Verify_Customer"
            inputs:
                email: string
                    description: "Customer email"
            outputs:
                verified: boolean
                    description: "Whether identity was verified"

topic order_support:
    label: "Order Support"
    description: "Handle order status inquiries and shipment tracking"
    reasoning:
        instructions: ->
            | Help the customer with their order.
            | Use lookup_order to check order status.
            | Always reference the order ID from the conversation.
        actions:
            lookup_order: @actions.get_order_status
                description: "Look up order details"
                with order_id = ...
                set @variables.order_id = @outputs.order_id
            back: @utils.transition to @topic.topic_selector
                description: "Route to a different topic"

    actions:
        get_order_status:
            description: "Look up order status by order ID"
            target: "flow://Get_Order_Status"
            inputs:
                order_id: string
                    description: "The order ID"
            outputs:
                order_id: string
                    description: "Order ID"
                status: string
                    description: "Order status"
                    is_displayable: True
```

---

## Phase 3b: Action Invocation Verification

**CRITICAL: After generating, run these 6 checks to prevent hallucination and silent failures.**

### Check 1: setVariables Sequential Collection

If any topic uses `@utils.setVariables` with `available when` guards, instructions MUST use literal mode (`|`) with explicit action-invocation directives:
```
instructions: |
    Step 1: Use set_first_name to capture the customer's first name.
    Step 2: Use set_last_name to capture the customer's last name.
    CRITICAL: Always invoke the setVariables action to save data.
```
Do NOT use procedural mode (`->`) with passive phrasing — the LLM will not call the action.

### Check 2: Backend Action References

Instructions must reference actions by purpose, not just describe the goal. Wrong: "Look up the order." Right: "Use the lookup_order action to find the order status."

### Check 3: Anti-Hallucination

Every topic with backend actions must include anti-hallucination directives:
"Do NOT fabricate order data. Always use the lookup_order action to retrieve real information."

### Check 4: Set Clause Output Completeness

Trace data flow from each `set` clause to where the variable is consumed. Every captured variable must be used somewhere downstream (in instructions, conditions, or other action inputs).

### Check 5: Action Chain Variable Capture

Topics chaining 3+ actions must capture intermediate results in variables. Without intermediate capture, the LLM loses context between action calls.

### Check 6: Instruction Mode Consistency

- Procedural `->` requires ALL content inside `if`/`else` blocks or as `run`/`transition` statements.
- No bare `|` lines after `if` blocks in procedural mode.
- If mixing static text with conditionals, use `->` mode with `|` inside the conditionals.

---

## Phase 4: Validate

```bash
sf agent validate authoring-bundle --api-name <AgentName> -o <org> --json
```

Before running, manually verify:
- Every `@actions.X` referenced in reasoning has a matching Level 1 definition
- Every Level 1 action has `target:`, `inputs:`, `outputs:`
- No misspelled action names
- Input/output parameter types match target signatures
- No circular topic references
- `start_agent` routes to valid topic
- Tab indentation throughout (no spaces)

---

## Phase 5: Scoring Rubric (100 Points)

Score every generated agent before presenting to the user.

| Category | Points | Key Criteria |
|----------|--------|--------------|
| **Structure & Syntax** | 15 | All required blocks present (`config`, `system`, `start_agent`, at least one `topic`). Proper nesting. Consistent tab indentation. No mixed tabs/spaces. Valid field names. All strings double-quoted. |
| **Safety & Responsible AI** | 15 | AI disclosure present. No impersonation/deception/manipulation. Responsible data handling. No harmful content. No discrimination. Clear scope boundaries. Escalation paths for sensitive topics. Deduct 15 for any BLOCK finding, 5 per WARN. |
| **Deterministic Logic** | 20 | `after_reasoning` patterns for post-action routing. FSM transitions with no dead-end topics. `available when` guards for security-sensitive actions. Post-action checks at TOP of `instructions: ->`. |
| **Instruction Resolution** | 20 | Clear, actionable instructions. Procedural mode (`->`) where conditionals needed. Literal mode (`\|`) where static text suffices. Variable injection where dynamic. Conditional instructions based on state. |
| **FSM Architecture** | 10 | Hub-and-spoke or verification gate pattern. Every topic reachable. Every topic has an exit (transition or escalation). No orphan topics. Start topic routes correctly. |
| **Action Configuration** | 10 | Proper Level 1 definitions with targets and I/O schemas. Correct Level 2 invocations with `with`/`set`. Slot-filling (`...`) for conversational inputs. Output capture into variables. Numeric I/O uses `object` + `complex_data_type_name`. |
| **Deployment Readiness** | 10 | Valid `default_agent_user`. `developer_name` matches folder. `bundle-meta.xml` present. Linked variables for service agents (`EndUserId`, `RoutableId`, `ContactId`). |

### Score Interpretation

| Score | Meaning | Action |
|-------|---------|--------|
| 90-100 | Production-ready | Deploy with confidence |
| 80-89 | Good with minor issues | Fix noted items, then deploy |
| 60-79 | Needs work | Address structural issues before deploy |
| Below 60 | BLOCK | Major rework required |

**Minimum to deploy: 80/100. Any category below 10/15 (or 7/10 for FSM/Action/Deploy): automatic failure.**

---

## Phase 6: Preview and Fix Loop

Run a live preview session using `--authoring-bundle` to generate local trace files.

### Start Preview

```bash
SESSION_ID=$(sf agent preview start \
  --authoring-bundle <AgentName> \
  --target-org <org> --json 2>/dev/null \
  | jq -r '.result.sessionId')
```

### Send Test Utterances

```bash
RESPONSE=$(sf agent preview send \
  --session-id "$SESSION_ID" \
  --authoring-bundle <AgentName> \
  --utterance "test utterance" \
  --target-org <org> --json 2>/dev/null)

# Strip control characters (CLI output contains control chars)
PLAN_ID=$(python3 -c "
import json, sys, re
raw = sys.stdin.read()
clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', raw)
d = json.loads(clean)
msgs = d.get('result', {}).get('messages', [])
print(msgs[-1].get('planId', '') if msgs else '')
" <<< "$RESPONSE")
```

### End Session

```bash
TRACES_PATH=$(sf agent preview end \
  --session-id "$SESSION_ID" \
  --authoring-bundle <AgentName> \
  --target-org <org> --json 2>/dev/null \
  | jq -r '.result.tracesPath')
```

### Trace Analysis

Trace files are at: `.sf/agents/<AgentName>/sessions/<sessionId>/traces/<planId>.json`

Key analysis commands:

```bash
# Topic routing
jq -r '.topic' "$TRACE"
jq -r '.plan[] | select(.type == "NodeEntryStateStep") | .data.agent_name' "$TRACE"

# Action invocation
jq -r '.plan[] | select(.type == "BeforeReasoningIterationStep") | .data.action_names[]' "$TRACE"

# Grounding check
jq -r '.plan[] | select(.type == "ReasoningStep") | {category: .category, reason: .reason}' "$TRACE"

# Safety score
jq -r '.plan[] | select(.type == "PlannerResponseStep") | .safetyScore.safetyScore.safety_score' "$TRACE"

# Tool visibility
jq -r '.plan[] | select(.type == "EnabledToolsStep") | .data.enabled_tools[]' "$TRACE"

# Response text
jq -r '.plan[] | select(.type == "PlannerResponseStep") | .message' "$TRACE"

# Variable changes
jq -r '.plan[] | select(.type == "VariableUpdateStep") | .data.variable_updates[] | "\(.variable_name): \(.variable_past_value) -> \(.variable_new_value) (\(.variable_change_reason))"' "$TRACE"
```

### Fix Loop (Max 3 Iterations)

If trace analysis reveals issues, edit the `.agent` file and re-preview.

| Trace Symptom | Fix Location | Fix Strategy |
|---------------|--------------|--------------|
| Wrong topic in `.topic` | `topic: description:` | Add keywords from the utterance to the topic description |
| Action missing from enabled tools | `available when:` guard | Relax guard conditions or remove guard |
| `"category": "UNGROUNDED"` | `instructions:` | Add `{!@variables.x}` references for grounding |
| `topic: "DefaultTopic"` | `topic: description:` or `start_agent: actions:` | Add keywords to descriptions or add transition actions |
| Action invoked but wrong one | Action `description:` fields | Add exclusion language to disambiguate |
| Low safety score | `system: instructions:` | Add safety guidelines and disclaimers |
| Variable not captured | `set` clause in Level 2 | Add `set @variables.x = @outputs.y` binding |
| SMALL_TALK grounding in start_agent | `start_agent: instructions:` | Add "You are a router only. Do NOT answer directly." |

### Present Results

After the fix loop, present results to the user. **Do NOT auto-proceed to deployment.** Ask what they want to do:
- Deploy to org
- Make additional changes
- Run more tests (switch to agentforce-test skill)

---

## Phase 7: Deploy

Once the user explicitly approves deployment:

### Step 1: Check Targets Exist

Verify all flow/apex targets referenced in the `.agent` file exist in the org:
```bash
sf api request rest "/services/data/v63.0/actions/custom/flow/<FlowApiName>" -o <org>
```

### Step 2: Scaffold Missing Targets (if needed)

Generate stubs for any missing Flow or Apex targets. Stubs MUST return realistic data — placeholder `'TODO'` responses cause SMALL_TALK grounding because the LLM falls back to training data.

### Step 3: Deploy Dependencies

Deploy Apex classes, Flows, and Permission Sets before the agent:
```bash
sf project deploy start --source-dir force-app/main/default/classes,force-app/main/default/flows -o <org> --json
```

### Step 4: Publish and Activate

```bash
sf agent publish authoring-bundle --api-name <AgentName> -o <org> --json
sf agent activate --api-name <AgentName> -o <org>
```

### Deployment Gotchas

- Bundle metadata file MUST be `<AgentName>.bundle-meta.xml` (NOT `.aiAuthoringBundle-meta.xml`)
- Use `sf agent publish authoring-bundle` (NOT `sf project deploy start`) for agents
- Use `sf agent validate authoring-bundle` (NOT `sf agent validate --source-dir`)
- Query Einstein Agent User from the TARGET org (not default org)
- `start_agent` and `topic` names must not collide (both create `GenAiPluginDefinition` records)
- After publish, run `sf agent activate` separately — publish does not auto-activate
- VS Code source tracking does NOT support AiAuthoringBundle — use CLI directly

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Agent name | PascalCase | `OrderServiceAgent` |
| `developer_name` | Must match folder name exactly | `OrderServiceAgent` |
| Topic names | snake_case | `order_support` |
| Variable names | snake_case (be consistent) | `order_id` |
| Action definitions (Level 1) | snake_case | `get_order_status` |
| Action invocations (Level 2) | snake_case | `lookup_order` |
| Labels | Human-readable with spaces | `"Order Support"` |
| Apex class names | Max 40 characters | `OrderStatusHandler` |

---

## Production Considerations

### Credit Consumption

| Operation | Credits | Notes |
|-----------|---------|-------|
| `@utils.transition`, `@utils.setVariables`, `@utils.escalate` | FREE | Framework operations |
| `if`/`else` control flow | FREE | Deterministic resolution |
| `before_reasoning` / `after_reasoning` | FREE | Deterministic hooks |
| `reasoning` (LLM turn) | FREE | LLM reasoning not billed |
| Flow actions | 20 | Per action execution |
| Apex actions | 20 | Per action execution |
| Prompt Templates | 2-16 | Per invocation (varies) |

**Cost optimization**: Fetch data once in `before_reasoning:`, cache in variables, reuse across topics.

### Token and Size Limits

| Limit | Value |
|-------|-------|
| Max response size | 1,048,576 bytes (1MB) |
| Plan trace limit (Frontend) | 1M characters |
| Active/Committed agents per org | 100 max |

### Lifecycle Hooks

`before_reasoning:` and `after_reasoning:` content goes DIRECTLY under the block — there is NO `instructions:` wrapper.

```
after_reasoning: ->
    if @variables.case_id != "":
        transition to @topic.confirmation
```

### Latch Variable Pattern

Prevent re-execution of one-time actions:
```
if @variables.data_loaded == False:
    run @actions.load_data
        with id = @variables.customer_id
        set @variables.customer_name = @outputs.name
    set @variables.data_loaded = True
```

### Loop Protection

Agent Scripts have a built-in guardrail that limits iterations to approximately 3-4 loops before breaking out and returning to the Topic Selector.

---

## Error Recovery

- **Deploy fails**: Read error messages, fix code, redeploy
- **Publish fails**: Run `sf agent validate authoring-bundle` first, fix reported issues
- **Activation fails**: Verify all action targets exist in the org
- **Preview fails**: Verify agent is activated and org has Agentforce enabled
- **Safety review fails**: Iterate on system instructions, add guardrails, retest
- **Score below 80**: Address issues by category, re-score, then deploy
