---
name: Orchestrator
description: Create and manage Salesforce AppFramework orchestrations using sf orchestrator commands
trigger: When user asks to create an orchestrator, manage app templates, or build multi-step workflows with AppFramework
---

## Orchestrator Skill

Build and manage Salesforce AppFramework orchestrations — multi-step, multi-actor workflows that coordinate across users, systems, and time.

---

## Prerequisites

Verify the orchestrator plugin is installed:

```
execute("sf plugins --json | grep orchestrator || sf plugins install @salesforce/plugin-orchestrator")
```

Check org connectivity:

```
execute("sf org display -o DevOrg --json")
```

---

## When to Use Orchestrator vs Flows vs Apex

| Scenario | Use |
|----------|-----|
| Simple automation (single user, linear steps) | **Flow** |
| Complex logic with collections and DML | **Apex** |
| Multi-step process spanning multiple users/days | **Orchestrator** |
| Human-in-the-loop approvals with parallel branches | **Orchestrator** |
| Long-running processes with wait states | **Orchestrator** |
| Real-time, synchronous operations | **Flow or Apex** |

Orchestrator is designed for processes that:
- Span hours, days, or weeks
- Involve multiple actors (users, systems, agents)
- Need parallel execution branches
- Require human decision points with wait states

---

## Step 1: Create an App Template

Templates define the reusable structure of an orchestration:

```
execute("sf orchestrator create template --name 'Employee_Onboarding' --description 'Multi-step onboarding process for new employees' -o DevOrg --json")
```

### Template Structure

A template defines:
- **Steps**: Ordered stages in the process
- **Actors**: Who performs each step (user, system, agent)
- **Transitions**: Conditions for moving between steps
- **Wait States**: Points where the process pauses for input

---

## Step 2: Create an App from Template

Instantiate a running app from a template:

```
execute("sf orchestrator create app --template Employee_Onboarding --name 'Q2_Hire_Onboarding' -o DevOrg --json")
```

---

## Step 3: List and Manage

### List Templates

```
execute("sf orchestrator list template -o DevOrg --json")
```

### List Running Apps

```
execute("sf orchestrator list app -o DevOrg --json")
```

### Display Details

```
execute("sf orchestrator display template --name Employee_Onboarding -o DevOrg --json")
execute("sf orchestrator display app --name Q2_Hire_Onboarding -o DevOrg --json")
```

### Update

```
execute("sf orchestrator update template --name Employee_Onboarding --description 'Updated onboarding with IT provisioning step' -o DevOrg --json")
execute("sf orchestrator update app --name Q2_Hire_Onboarding --status Active -o DevOrg --json")
```

### Delete

```
execute("sf orchestrator delete template --name Employee_Onboarding -o DevOrg --json")
execute("sf orchestrator delete app --name Q2_Hire_Onboarding -o DevOrg --json")
```

---

## Step 4: Design Patterns

### Pattern 1: Sequential Approval Chain

```
Template: Purchase_Approval
  Step 1: Submit Request (Requester)
  Step 2: Manager Approval (Manager) [wait]
  Step 3: Finance Review (Finance Team) [wait]
  Step 4: Procurement (System - auto)
  Step 5: Notification (System - auto)
```

### Pattern 2: Parallel Branches with Join

```
Template: New_Product_Launch
  Step 1: Kickoff (Product Manager)
  Step 2a: Marketing Prep (Marketing) [parallel]
  Step 2b: Engineering Build (Engineering) [parallel]
  Step 2c: Legal Review (Legal) [parallel]
  Step 3: Join (wait for all branches)
  Step 4: Launch Go/No-Go (VP)
  Step 5: Execute Launch (System)
```

### Pattern 3: Agent-Assisted Orchestration

```
Template: Customer_Issue_Resolution
  Step 1: Intake (Agentforce Agent - auto-classify)
  Step 2: Investigation (Support Rep) [wait]
  Step 3: Resolution (Agentforce Agent - draft response)
  Step 4: Review & Send (Support Rep) [wait]
  Step 5: Follow-up Survey (System - scheduled)
```

---

## Best Practices

- **Keep templates generic**: Parameterize with variables, not hardcoded values
- **Design for failure**: Include error handling steps and timeout transitions
- **Use agents for automation steps**: Let Agentforce agents handle data collection and drafting
- **Monitor with Data Cloud**: Pipe orchestration events to Data Cloud for analytics
- **Test with scratch orgs**: Orchestrations are complex — validate in isolation before production
- **Version your templates**: Use source tracking and deploy via CI/CD

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| Template not found | Check exact name with `sf orchestrator list template` |
| App stuck in step | Check actor assignment and wait state conditions |
| Permission error | Verify user has OrchestratorAdmin permission set |
| Plugin not found | Install: `sf plugins install @salesforce/plugin-orchestrator` |
