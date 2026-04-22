---
name: Agent Spec Generation
description: Generate Agentforce agent specifications from natural language using sf agent generate commands
trigger: When user asks to generate an agent spec, create an agent from a description, or scaffold agent YAML
---

## Agent Spec Generation Skill

Generate a complete Agentforce agent specification from natural language requirements, convert it to an authoring bundle, and validate it — all from the CLI.

---

## Step 1: Gather Requirements

Before generating, clarify these details:

1. **Agent type**: service, sales, commerce, custom
2. **Role description**: What does this agent do? (1-2 sentences)
3. **Company context**: Company name, industry, tone
4. **Topic scope**: What topics should the agent handle? (max 5-8 recommended)
5. **Target org**: Which org will this deploy to?

---

## Step 2: Generate the Agent Spec

Use `sf agent generate agent-spec` to AI-generate a YAML specification:

```
execute("sf agent generate agent-spec --type service --role 'Handle customer order inquiries including status, returns, and exchanges' --company-name 'Acme Corp' --tone professional --max-topics 5 --output-dir ./agent-specs --json")
```

### Available Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--type` | Yes | Agent type: service, sales, commerce, custom |
| `--role` | Yes | Natural language role description |
| `--company-name` | No | Company name for branding context |
| `--tone` | No | Communication style: professional, friendly, casual, formal |
| `--max-topics` | No | Maximum number of topics to generate (default: 5) |
| `--output-dir` | No | Output directory (default: current dir) |

---

## Step 3: Review the Generated Spec

Read the generated YAML spec file:

```
read_file("./agent-specs/agent-spec.yaml")
```

### YAML Structure to Verify

```yaml
agentDefinition:
  name: "Order_Support_Agent"
  masterLabel: "Order Support Agent"
  description: "Handles customer order inquiries"

  topics:
    - name: "Order_Status"
      description: "Check order status and tracking"
      scope: "Handle questions about order status, delivery tracking, estimated arrival"
      instructions:
        - "Always verify the customer's identity before sharing order details"
        - "Provide tracking numbers when available"
      actions:
        - name: "Get_Order_Status"
          type: "flow"
          target: "flow://Get_Order_Status"
          description: "Retrieves current order status"
          inputs:
            - name: "orderId"
              type: "string"
              description: "The order ID to look up"
          outputs:
            - name: "status"
              type: "string"
              description: "Current order status"

  guardrails:
    - "Always identify as an AI assistant"
    - "Do not share customer PII with unauthorized parties"
    - "Escalate to a human agent for refund requests over $500"
```

### Review Checklist

- [ ] Each topic has clear scope and instructions
- [ ] Actions have correct types (flow, apex, api)
- [ ] Input/output parameters are accurate
- [ ] Guardrails include AI disclosure and escalation paths
- [ ] Topic count is reasonable (5-8 for most agents)

---

## Step 4: Refine the Spec

Edit the YAML to add missing elements:

1. **Add safety guardrails** (required for all agents):
   - AI disclosure instruction
   - Scope boundaries
   - Escalation paths for sensitive topics

2. **Refine topic instructions**: Make them specific and actionable

3. **Verify action targets exist** in the org:
```
execute("sf flow list -o DevOrg --json")
```

4. **Add classification examples** for each topic (improves routing accuracy):
```yaml
topics:
  - name: "Order_Status"
    classificationExamples:
      - "Where is my order?"
      - "When will my package arrive?"
      - "Track order #12345"
```

---

## Step 5: Convert to Authoring Bundle

Convert the YAML spec into deployable Agent Script metadata:

```
execute("sf agent generate authoring-bundle --spec ./agent-specs/agent-spec.yaml --output-dir ./force-app/main/default --json")
```

This creates:
- `.agent` file (Agent Script DSL)
- Supporting metadata files
- Action reference stubs

---

## Step 6: Validate

Validate the generated authoring bundle:

```
execute("sf agent validate authoring-bundle --api-name Order_Support_Agent -o DevOrg --json")
```

### Common Validation Errors

| Error | Fix |
|-------|-----|
| Missing action target | Create the Flow/Apex class in the org first |
| Invalid topic reference | Check topic name spelling matches exactly |
| Duplicate action name | Rename actions to be unique across topics |
| Missing required field | Add missing inputs/outputs per action schema |

---

## Step 7: Iterate

If validation fails:

1. Read the error output
2. Fix the `.agent` file directly:
```
edit_file({ filePath: "force-app/main/default/aiAuthoringBundles/Order_Support_Agent.agent", ... })
```
3. Re-validate:
```
execute("sf agent validate authoring-bundle --api-name Order_Support_Agent -o DevOrg --json")
```

Repeat until validation passes, then proceed to publish:

```
execute("sf agent publish authoring-bundle --api-name Order_Support_Agent -o DevOrg --json")
execute("sf agent activate --api-name Order_Support_Agent -o DevOrg --json")
```

---

## Best Practices

- **Start small**: 3-5 topics, then expand. Over-scoped agents route poorly.
- **One action per task**: Don't combine multiple operations in a single action.
- **Test before publishing**: Use `sf agent preview` to smoke-test locally.
- **Version your specs**: Commit the YAML spec alongside the generated `.agent` file.
- **Guardrails are mandatory**: Every agent needs AI disclosure, scope boundaries, and escalation paths.
