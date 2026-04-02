/**
 * Deep Salesforce Flow best practices prompt.
 */

export const SF_FLOW_PROMPT = `# Salesforce Flow Best Practices — Deep Reference

## When to Use Flow vs Apex vs LWC

| Use Case | Recommended | Why |
|----------|------------|-----|
| Simple field updates on save | Record-Triggered Flow | No code, declarative, admin-maintainable |
| Complex validation with cross-object logic | Apex Trigger | Flow cannot efficiently query related records in bulk |
| Screen-based wizard for users | Screen Flow | Drag-and-drop UI, embedded in pages/quick actions |
| Scheduled batch processing | Scheduled Flow or Batch Apex | Flow for simple; Batch Apex for >50K records or complex logic |
| External API callout | Apex (Queueable/Future) | Flow HTTP callouts exist but are limited |
| Dynamic UI with real-time reactivity | LWC | Full JavaScript control, reactive data binding |
| Simple automation admins must maintain | Flow | Admins cannot edit Apex |
| High-volume processing (>10K records) | Apex Batch | Flow governor limits are tighter |

## Flow Types

### Record-Triggered Flow
- Fires when a record is created, updated, or deleted
- Replaces Process Builder and Workflow Rules (both retired)
- Can run BEFORE save (fast field updates, no extra DML) or AFTER save (create/update other records)
- Can schedule actions to run at a future time
- Use \$Record to reference the triggering record (no query needed)
- Use \$Record__Prior for old field values in update context

### Screen Flow
- Interactive, user-facing flows with form screens
- Can be embedded in Lightning pages, quick actions, utility bars, Experience Cloud
- Support for custom LWC components inside flow screens
- Input/output variables for passing data in/out

### Autolaunched Flow (No Trigger)
- Invoked by Apex, REST API, another flow, or a button
- Runs in system context by default (no user interaction)
- Good for reusable business logic called from multiple places

### Scheduled Flow
- Runs on a schedule (daily, weekly, etc.)
- Processes batches of records matching criteria
- Limited to 250,000 records per 24-hour period

### Platform Event-Triggered Flow
- Fires when a platform event is published
- Runs asynchronously
- Good for decoupled integrations

## Flow Governor Limits

| Resource | Limit |
|----------|-------|
| Executed elements per transaction | 2,000 |
| Executed elements per flow interview | 2,000 |
| Interviews per transaction | 100 |
| Scheduled actions per hour | 250,000 |
| Record creates/updates per transaction | Subject to standard DML limits (150 DML, 10K rows) |
| SOQL queries per transaction | Subject to standard limit (100 sync) |

Important: Flows share the same transaction limits as Apex. A record-triggered flow that fires from an Apex trigger shares that trigger's governor limit budget.

## Flow Performance Best Practices

### 1. Use Before-Save Flows for Field Updates
Before-save flows update the triggering record WITHOUT an extra DML statement. After-save requires a separate update DML.
\\\`\\\`\\\`
BEFORE SAVE: Set fields on \$Record → saved automatically (0 DML)
AFTER SAVE:  Get Records → Update Records → costs 1 SOQL + 1 DML
\\\`\\\`\\\`

### 2. Minimize Get Records Elements
Each Get Records element is 1 SOQL query. Combine conditions into a single Get Records where possible.

### 3. Use \$Record Instead of Get Records
In record-triggered flows, \$Record already has ALL fields of the triggering record. Do NOT use Get Records to re-query the same record.

### 4. Bulkification
Record-triggered flows ARE automatically bulkified by Salesforce (as of Spring '22). When 200 records are updated at once, the flow runs once per batch, not once per record. However:
- Loops within the flow are NOT automatically bulkified — each iteration counts toward the 2,000 element limit
- Avoid loops with Get/Create/Update Records inside them

### 5. Entry Conditions
Always set entry conditions to restrict when the flow runs. Without conditions, the flow fires on EVERY save.
\\\`\\\`\\\`
Good: "Run when Status equals Closed AND Status (Prior Value) does not equal Closed"
Bad:  "Run every time any field changes"
\\\`\\\`\\\`

## Error Handling in Flows

### Fault Paths
- Every Create/Update/Delete/Get Records element can have a fault connector
- Connect fault paths to a screen (for screen flows) or a custom error handler
- Without fault handling, the entire transaction rolls back silently

### Custom Error Handler Pattern
1. Create a fault connector from the DML element
2. Route to an Assignment element that captures \$Flow.FaultMessage
3. Log the error (create a custom Error_Log__c record or send email)
4. Optionally: display the error to the user (screen flows)

### Fault Variables
- \$Flow.FaultMessage — the error message string
- \$Flow.CurrentDateTime — when the error occurred
- \$Flow.InterviewGuid — unique ID of the flow interview

## Recursion Prevention

Record-triggered flows can cause infinite loops if:
- Flow A updates Record X → triggers Flow B → updates Record X → triggers Flow A again

Prevention:
1. Use entry conditions that check if the field actually changed (compare \$Record.Field to \$Record__Prior.Field)
2. Use a "processed" checkbox field: set it in the flow, add entry condition "Processed__c = false"
3. In Flow Settings, configure "When to Run the Flow for Updated Records": "Only when a record is updated to meet the condition requirements" (avoids re-triggering when record already meets criteria)

## Subflow Patterns

Use subflows for reusable logic:
\\\`\\\`\\\`
Main Flow:
  → Subflow: Validate Address (input: address fields, output: isValid, errorMessage)
  → Decision: Is Valid?
    → Yes: Subflow: Create Related Records (input: parentId)
    → No: Screen: Show Error
\\\`\\\`\\\`

Subflow best practices:
- Define clear input/output variables (mark as "Available for Input" / "Available for Output")
- Keep subflows focused on a single responsibility
- Subflows run in the same transaction as the parent flow (share governor limits)

## Flow vs Process Builder vs Workflow Rule

Process Builder and Workflow Rules are RETIRED as of Spring '23. Salesforce will not add new features to them. All new automation should use Flow. Migrate existing Process Builders and Workflow Rules to Flows using the Migrate to Flow tool in Setup.
`;
