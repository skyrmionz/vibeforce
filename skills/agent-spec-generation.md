---
name: Agent Spec Generation
description: Generate YAML agent specifications with sf agent generate agent-spec and convert to authoring bundles
trigger: When user asks to generate an agent spec, create an agent from a YAML spec, or use sf agent generate
---

# Agent Spec Generation Skill

Generate Agentforce agent specifications from natural language descriptions using `sf agent generate agent-spec`,
then convert them into deployable authoring bundles. This skill covers the full generate-review-refine-convert-validate
loop for rapid agent prototyping.

## Overview

The agent spec generation pipeline has five stages:

1. **Generate** -- Create a YAML agent spec from flags describing the agent
2. **Review** -- Inspect the generated YAML for correctness and completeness
3. **Refine** -- Edit the YAML to fix issues or add detail
4. **Convert** -- Transform the spec into an authoring bundle (`.agent` + `.bundle-meta.xml`)
5. **Validate** -- Run server-side validation on the bundle

| Stage | Command | Output |
|-------|---------|--------|
| Generate | `sf agent generate agent-spec` | YAML spec file |
| Convert | `sf agent generate authoring-bundle` | `.agent` + `.bundle-meta.xml` |
| Validate | `sf agent validate authoring-bundle` | Validation results |

---

## Prerequisites

- `sf` CLI 2.125.0+ (agent-spec generation requires recent CLI)
- Authenticated org with Agentforce enabled: `sf org login web -a myorg`
- An existing Salesforce project directory with `sfdx-project.json`

Verify setup:

```bash
sf --version
sf org display -o <org> --json | jq -r '.result.username'
```

---

## Stage 1: Generate the YAML Spec

### Basic Generation

```bash
sf agent generate agent-spec \
  --type service \
  --role "Customer support agent for an e-commerce company" \
  --company-name "Acme Corp" \
  --output-dir /tmp/specs \
  --json
```

This produces a YAML file at `/tmp/specs/agent-spec.yaml` (or a timestamped name).

### Flag Reference

| Flag | Required | Description | Example Values |
|------|----------|-------------|----------------|
| `--type` | Yes | Agent type | `service` (customer-facing), `employee` (internal) |
| `--role` | Yes | Natural language description of what the agent does | `"Handle order inquiries and returns"` |
| `--company-name` | No | Company name injected into system instructions | `"Acme Corp"` |
| `--tone` | No | Conversation tone | `professional`, `friendly`, `formal`, `casual` |
| `--max-topics` | No | Maximum number of topics to generate | `3`, `5`, `10` (default varies) |
| `--output-dir` | No | Directory for the output YAML | `/tmp/specs` |
| `--json` | No | Structured JSON output for scripting | -- |

### Practical Flag Combinations

```bash
# Minimal: just type and role
sf agent generate agent-spec \
  --type service \
  --role "Answer questions about product returns and refunds"

# Full control: all flags
sf agent generate agent-spec \
  --type employee \
  --role "Internal IT helpdesk agent that handles password resets, VPN issues, and software requests" \
  --company-name "TechCorp" \
  --tone professional \
  --max-topics 5 \
  --output-dir ./specs \
  --json

# Narrow scope: limit topics for focused agents
sf agent generate agent-spec \
  --type service \
  --role "Shipping and delivery tracking only" \
  --max-topics 2 \
  --json
```

### Capture the Output Path

```bash
SPEC_PATH=$(sf agent generate agent-spec \
  --type service \
  --role "Customer support for order management" \
  --company-name "Acme Corp" \
  --output-dir /tmp/specs \
  --json 2>/dev/null \
  | jq -r '.result.outputFile // .result.path // empty')

echo "Spec written to: $SPEC_PATH"
```

If `--json` output does not include a path field, list the output directory:

```bash
ls -lt /tmp/specs/*.yaml | head -1
```

---

## Stage 2: Review the Generated YAML

### YAML Spec Structure

The generated YAML follows this structure:

```yaml
agentSpec:
  name: "AcmeSupport"
  type: service
  description: "Customer support agent for Acme Corp e-commerce"

  systemInstructions: |
    You are an AI customer support assistant for Acme Corp.
    Always be professional and helpful.
    If you cannot resolve an issue, offer to connect with a human agent.

  topics:
    - name: order_status
      description: "Help customers check order status and tracking"
      instructions: |
        Ask for the order number.
        Look up the order using the check_order action.
        Provide the current status and estimated delivery date.
      actions:
        - name: check_order
          description: "Look up order by order number"
          type: flow
          target: "Get_Order_Status"
          inputs:
            - name: order_number
              type: string
              description: "Customer's order number"
          outputs:
            - name: status
              type: string
              description: "Current order status"
            - name: delivery_date
              type: string
              description: "Estimated delivery date"

    - name: returns
      description: "Process returns and refund requests"
      instructions: |
        Verify the customer's identity first.
        Check if the order is eligible for return (within 30 days).
        Initiate the return process using the start_return action.
      actions:
        - name: start_return
          description: "Initiate a return for an order"
          type: flow
          target: "Initiate_Return"
          inputs:
            - name: order_id
              type: string
              description: "Order ID to return"
            - name: reason
              type: string
              description: "Reason for return"
          outputs:
            - name: return_id
              type: string
              description: "Return confirmation ID"

    - name: general_inquiry
      description: "Handle general questions about policies, hours, contact info"
      instructions: |
        Answer questions using knowledge base articles.
        For questions outside your scope, direct to the appropriate department.
      actions: []

  guardrails:
    - "Never provide medical, legal, or financial advice"
    - "Always identify as an AI assistant"
    - "Do not share internal company data or other customer information"
    - "Escalate to a human agent if the customer is frustrated or the issue is complex"
```

### 8-Point Review Checklist

After generating, review the YAML against these criteria:

```bash
# Read the generated spec
cat "$SPEC_PATH"
```

| # | Check | What to Look For |
|---|-------|------------------|
| 1 | **Topic coverage** | Does every key use case have a topic? Missing topics = gaps in agent capability |
| 2 | **Topic boundaries** | Are descriptions distinct enough to prevent misrouting? Overlapping descriptions cause confusion |
| 3 | **Action completeness** | Does each topic have the actions it needs? Are input/output types correct? |
| 4 | **Action targets** | Do `target` values match real Flows/Apex in the org? Run discovery first |
| 5 | **Instruction quality** | Are instructions step-by-step and actionable? Vague instructions = unpredictable behavior |
| 6 | **Guardrails** | Are safety guardrails present? AI disclosure, scope boundaries, escalation path? |
| 7 | **System instructions** | Does the agent identify as AI? Are tone and scope clearly defined? |
| 8 | **Variable gaps** | Are there data flows between topics that need variables (e.g., customer ID, order ID)? |

### Discover Real Targets Before Reviewing

The generator may hallucinate action targets. Validate against the actual org:

```bash
# List active autolaunched Flows
sf data query \
  -q "SELECT ApiName, Label FROM FlowDefinitionView WHERE IsActive = true AND ProcessType = 'AutoLaunchedFlow'" \
  -o <org> --json | jq -r '.result.records[] | "\(.ApiName) -- \(.Label)"'

# Get Flow input/output parameters
sf api request rest "/services/data/v63.0/actions/custom/flow/<FlowApiName>" -o <org> \
  | jq '.inputs, .outputs'

# List Apex InvocableMethod classes
sf data query \
  -q "SELECT Name FROM ApexClass WHERE Status = 'Active'" \
  -o <org> --json | jq -r '.result.records[].Name'
```

---

## Stage 3: Refine the YAML

Edit the YAML to fix issues found during review. Common refinements:

### Add a Missing Topic

```yaml
    - name: shipping_inquiry
      description: "Track shipments and resolve delivery issues"
      instructions: |
        Ask for the tracking number or order number.
        Use the track_shipment action to get real-time status.
        If delivery is delayed, apologize and provide updated estimate.
        For lost packages, escalate to human agent.
      actions:
        - name: track_shipment
          description: "Get real-time shipment tracking"
          type: flow
          target: "Track_Shipment"
          inputs:
            - name: tracking_number
              type: string
              description: "Shipment tracking number"
          outputs:
            - name: status
              type: string
              description: "Delivery status"
            - name: eta
              type: string
              description: "Estimated arrival"
```

### Sharpen Topic Descriptions

Vague descriptions cause misrouting. Be specific:

```yaml
# BAD: Too vague, overlaps with other topics
- name: help
  description: "Help customers with their issues"

# GOOD: Specific keywords prevent overlap
- name: billing_support
  description: "Handle billing disputes, payment failures, invoice questions, and subscription changes"
```

### Add Guardrails

```yaml
  guardrails:
    - "Always identify as an AI assistant, never claim to be human"
    - "Do not provide medical, legal, or financial advice"
    - "Never share one customer's data with another customer"
    - "If the customer expresses frustration or anger, offer to transfer to a human agent"
    - "Do not process refunds over $500 without human approval"
    - "Never ask for full credit card numbers or SSNs"
```

### Add Variables for Cross-Topic Data Flow

If data needs to flow between topics (e.g., customer ID from verification to order lookup):

```yaml
  variables:
    - name: customer_id
      type: string
      description: "Verified customer ID"
      mutable: true
      default: ""
    - name: is_verified
      type: boolean
      description: "Whether customer identity has been verified"
      mutable: true
      default: false
```

---

## Stage 4: Convert to Authoring Bundle

### Convert Command

```bash
sf agent generate authoring-bundle \
  --spec "$SPEC_PATH" \
  --output-dir force-app/main/default/aiAuthoringBundles \
  --json
```

This produces:

```
force-app/main/default/aiAuthoringBundles/<AgentName>/
  <AgentName>.agent
  <AgentName>.bundle-meta.xml
```

### Verify the Output

```bash
# Check generated files exist
ls -la force-app/main/default/aiAuthoringBundles/*/

# Read the .agent file
cat force-app/main/default/aiAuthoringBundles/*/*.agent

# Read the bundle metadata
cat force-app/main/default/aiAuthoringBundles/*/*.bundle-meta.xml
```

### Post-Conversion Fixes

The converter may produce output that needs manual correction. Check for:

| Issue | Symptom | Fix |
|-------|---------|-----|
| Space indentation | Parser rejects the file | Convert all spaces to tabs |
| Missing `start_agent` router instructions | Agent answers directly instead of routing | Add "You are a router only. Do NOT answer directly." |
| `agent_type` field present | Server crash on publish | Remove the `agent_type` line |
| Missing `bundle-meta.xml` | Deploy fails | Create minimal XML (see below) |
| Level 2 actions missing | Actions defined but never invoked | Add `reasoning: actions:` blocks |
| Wrong `developer_name` | Bundle name mismatch | Ensure it matches the folder name |

### Create bundle-meta.xml if Missing

```bash
AGENT_DIR=$(ls -d force-app/main/default/aiAuthoringBundles/*/ | head -1)
AGENT_NAME=$(basename "$AGENT_DIR")

cat > "${AGENT_DIR}${AGENT_NAME}.bundle-meta.xml" << 'XMLEOF'
<?xml version="1.0" encoding="UTF-8"?>
<AiAuthoringBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <bundleType>AGENT</bundleType>
</AiAuthoringBundle>
XMLEOF
```

### Fix Tab Indentation

```bash
AGENT_FILE=$(ls force-app/main/default/aiAuthoringBundles/*/*.agent)

# Check for space indentation
python3 -c "
with open('$AGENT_FILE') as f:
    for i, line in enumerate(f, 1):
        if line.startswith('  ') and not line.startswith('\t'):
            print(f'Line {i}: space indent detected: {line.rstrip()[:60]}')
" | head -20

# Convert spaces to tabs (4 spaces = 1 tab)
python3 -c "
import re
with open('$AGENT_FILE') as f:
    content = f.read()
# Replace leading spaces with tabs (4 spaces per level)
lines = []
for line in content.split('\n'):
    stripped = line.lstrip(' ')
    spaces = len(line) - len(stripped)
    tabs = spaces // 4
    lines.append('\t' * tabs + stripped)
with open('$AGENT_FILE', 'w') as f:
    f.write('\n'.join(lines))
print('Converted spaces to tabs')
"
```

---

## Stage 5: Validate the Authoring Bundle

### Server-Side Validation

```bash
AGENT_NAME=$(basename $(ls -d force-app/main/default/aiAuthoringBundles/*/))

sf agent validate authoring-bundle \
  --api-name "$AGENT_NAME" \
  -o <org> \
  --json 2>&1 | tee /tmp/validate.json
```

### Parse Validation Results

```bash
python3 -c "
import json
data = json.load(open('/tmp/validate.json'))
result = data.get('result', data)

if isinstance(result, dict):
    errors = result.get('errors', [])
    warnings = result.get('warnings', [])
    
    if not errors and not warnings:
        print('PASSED: No validation errors or warnings')
    else:
        for e in errors:
            print(f'ERROR: {e}')
        for w in warnings:
            print(f'WARNING: {w}')
elif isinstance(result, str):
    print(result)
"
```

### Common Validation Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown action reference` | Level 2 references nonexistent Level 1 action | Add matching Level 1 definition in `topic: actions:` |
| `Invalid target` | Flow/Apex does not exist in org | Create the target or fix the name |
| `Duplicate developer_name` | Agent name conflicts with existing metadata | Rename the agent |
| `Missing required field` | Config block incomplete | Add `developer_name`, `agent_label`, `description` |
| `Invalid indentation` | Spaces instead of tabs | Convert to tabs (see fix above) |
| `Circular reference` | Topics reference each other in a loop | Break the cycle with a hub topic |
| `Reserved word used` | Variable/field named `description`, `label`, etc. | Rename the variable |

---

## Full Pipeline Recipe

### Recipe 1: Quick Agent from Scratch

End-to-end generation in one script:

```bash
#!/bin/bash
set -euo pipefail

ORG="myorg"
SPEC_DIR="/tmp/agent-specs"
BUNDLE_DIR="force-app/main/default/aiAuthoringBundles"

# Step 1: Generate
echo "=== Generating agent spec ==="
sf agent generate agent-spec \
  --type service \
  --role "Customer support agent handling order inquiries, returns, and shipping" \
  --company-name "Acme Corp" \
  --tone professional \
  --max-topics 4 \
  --output-dir "$SPEC_DIR" \
  --json 2>/dev/null | jq '.'

SPEC_FILE=$(ls -t "$SPEC_DIR"/*.yaml | head -1)
echo "Spec: $SPEC_FILE"

# Step 2: Review (display for human review)
echo ""
echo "=== Generated Spec ==="
cat "$SPEC_FILE"
echo ""
echo "Review the spec above. Press Enter to continue or Ctrl+C to edit first."
read -r

# Step 3: Convert
echo "=== Converting to authoring bundle ==="
sf agent generate authoring-bundle \
  --spec "$SPEC_FILE" \
  --output-dir "$BUNDLE_DIR" \
  --json 2>/dev/null | jq '.'

AGENT_NAME=$(basename $(ls -d "$BUNDLE_DIR"/*/))
echo "Agent: $AGENT_NAME"

# Step 4: Validate
echo "=== Validating ==="
sf agent validate authoring-bundle \
  --api-name "$AGENT_NAME" \
  -o "$ORG" \
  --json 2>&1 | jq '.'

echo "=== Done ==="
echo "Agent bundle at: $BUNDLE_DIR/$AGENT_NAME/"
echo "Next: sf agent publish authoring-bundle --api-name $AGENT_NAME -o $ORG"
```

### Recipe 2: Iterative Refinement Loop

When the first generation is not quite right:

```bash
#!/bin/bash
set -euo pipefail

ORG="myorg"
SPEC_FILE="/tmp/agent-specs/agent-spec.yaml"

# Generate initial spec
sf agent generate agent-spec \
  --type employee \
  --role "IT helpdesk for password resets and VPN troubleshooting" \
  --company-name "TechCorp" \
  --max-topics 3 \
  --output-dir /tmp/agent-specs \
  --json

SPEC_FILE=$(ls -t /tmp/agent-specs/*.yaml | head -1)

# Iteration loop
for i in 1 2 3; do
  echo "=== Iteration $i ==="
  
  # Convert
  sf agent generate authoring-bundle \
    --spec "$SPEC_FILE" \
    --output-dir force-app/main/default/aiAuthoringBundles \
    --json 2>/dev/null

  AGENT_NAME=$(basename $(ls -d force-app/main/default/aiAuthoringBundles/*/))

  # Validate
  RESULT=$(sf agent validate authoring-bundle \
    --api-name "$AGENT_NAME" \
    -o "$ORG" \
    --json 2>&1)

  ERRORS=$(echo "$RESULT" | jq -r '.result.errors // [] | length')
  
  if [ "$ERRORS" = "0" ]; then
    echo "Validation passed on iteration $i"
    break
  fi

  echo "Errors found, review and edit $SPEC_FILE before next iteration"
  echo "$RESULT" | jq '.result.errors[]'
  
  # In an agent context, the AI would fix the spec here
  # In manual mode, the user edits the YAML and re-runs
done
```

### Recipe 3: Generate and Preview

Generate, convert, then immediately preview test:

```bash
#!/bin/bash
set -euo pipefail

ORG="myorg"

# Generate and convert
sf agent generate agent-spec \
  --type service \
  --role "Appointment scheduling assistant" \
  --company-name "HealthClinic" \
  --max-topics 3 \
  --output-dir /tmp/specs --json

SPEC=$(ls -t /tmp/specs/*.yaml | head -1)

sf agent generate authoring-bundle \
  --spec "$SPEC" \
  --output-dir force-app/main/default/aiAuthoringBundles \
  --json

AGENT_NAME=$(basename $(ls -d force-app/main/default/aiAuthoringBundles/*/))

# Validate
sf agent validate authoring-bundle --api-name "$AGENT_NAME" -o "$ORG" --json

# Preview session
SESSION_ID=$(sf agent preview start \
  --authoring-bundle "$AGENT_NAME" \
  --target-org "$ORG" --json 2>/dev/null \
  | jq -r '.result.sessionId')

# Test a basic utterance
sf agent preview send \
  --session-id "$SESSION_ID" \
  --authoring-bundle "$AGENT_NAME" \
  --utterance "I need to schedule an appointment for next Tuesday" \
  --target-org "$ORG" --json 2>/dev/null | python3 -c "
import json, sys, re
raw = sys.stdin.read()
clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', raw)
d = json.loads(clean)
msgs = d.get('result', {}).get('messages', [])
for m in msgs:
    print(f\"[{m.get('type','?')}] {m.get('message','')}\")
"

# End session
sf agent preview end \
  --session-id "$SESSION_ID" \
  --authoring-bundle "$AGENT_NAME" \
  --target-org "$ORG" --json 2>/dev/null | jq -r '.result.tracesPath'
```

---

## YAML Spec Best Practices

### Topic Design

1. **One responsibility per topic** -- a topic that handles both "order status" and "returns" will confuse the router
2. **Keyword-rich descriptions** -- the router uses topic descriptions to match utterances; include synonyms
3. **3-7 topics is the sweet spot** -- fewer than 3 means the agent is too narrow; more than 7 causes routing ambiguity
4. **Always include an escalation path** -- every topic should define when to hand off to a human

### Action Design

1. **Match targets to real org resources** -- always discover targets before finalizing
2. **Use descriptive input/output names** -- `order_number` not `param1`
3. **Include descriptions on all I/O** -- the LLM uses descriptions to fill slots
4. **Type correctly** -- `string`, `boolean`, `number`, `object`; numeric I/O should use `object` type with `complex_data_type_name`

### Instruction Design

1. **Step-by-step, not paragraphs** -- "Step 1: Ask for X. Step 2: Call Y. Step 3: Respond with Z."
2. **Reference actions by name** -- "Use the check_order action" not "look up the order"
3. **Include anti-hallucination directives** -- "Do NOT fabricate data. Always use actions to retrieve real information."
4. **State what NOT to do** -- negative instructions prevent common failure modes

### Guardrail Design

1. **AI disclosure is mandatory** -- "Always identify as an AI assistant"
2. **Scope boundaries** -- "Only handle topics related to X. For other topics, say..."
3. **PII protection** -- "Never ask for full SSN or credit card numbers"
4. **Escalation triggers** -- "Transfer to human if: customer is upset, issue is unresolved after 3 attempts, regulatory question"

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|---------|
| `sf agent generate agent-spec` not found | CLI too old | Update: `sf update` (requires 2.125.0+) |
| Empty YAML output | Role description too vague | Provide a more specific `--role` with concrete tasks |
| Too many topics generated | No `--max-topics` limit | Add `--max-topics 4` to constrain |
| Convert fails with parse error | Invalid YAML syntax | Validate YAML: `python3 -c "import yaml; yaml.safe_load(open('spec.yaml'))"` |
| Validation fails: unknown target | Flow/Apex not in org | Create stubs or fix target names to match real resources |
| Bundle has spaces not tabs | Converter output format | Run the tab conversion script (see Stage 4) |
| `developer_name` mismatch | Name in `.agent` differs from folder | Edit `config: developer_name:` to match folder name exactly |
| Preview fails after convert | Bundle not validated/published | Run validate first, then publish before preview |

## Dependencies

- `sf` CLI 2.125.0+ (for `agent generate agent-spec` and `agent generate authoring-bundle`)
- `jq` (system) -- JSON processing
- `python3` -- For result parsing and YAML validation
- Target org with Agentforce enabled and Einstein Agent User configured
