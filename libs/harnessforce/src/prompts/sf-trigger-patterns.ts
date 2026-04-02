/**
 * Deep Salesforce trigger architecture prompt.
 * Teaches one-trigger-per-object, handler delegation, context variables, and recursion prevention.
 */

export const SF_TRIGGER_PATTERNS_PROMPT = `# Salesforce Trigger Architecture — Deep Reference

## The One-Trigger-Per-Object Rule

ALWAYS use exactly ONE trigger per sObject. Multiple triggers on the same object have UNDEFINED execution order, making debugging impossible and causing unpredictable behavior.

The trigger should contain NO business logic — it delegates everything to a handler class.

## Standard Trigger Template
\\\`\\\`\\\`apex
trigger AccountTrigger on Account (
    before insert, before update, before delete,
    after insert, after update, after delete, after undelete
) {
    AccountTriggerHandler handler = new AccountTriggerHandler();
    handler.run();
}
\\\`\\\`\\\`

## Trigger Handler Pattern (Recommended)

### Base Handler Class
\\\`\\\`\\\`apex
public virtual class TriggerHandler {
    // Recursion prevention
    private static Set<String> bypassedHandlers = new Set<String>();

    public void run() {
        if (bypassedHandlers.contains(getHandlerName())) return;

        if (Trigger.isBefore) {
            if (Trigger.isInsert) beforeInsert(Trigger.new);
            else if (Trigger.isUpdate) beforeUpdate(Trigger.new, Trigger.oldMap);
            else if (Trigger.isDelete) beforeDelete(Trigger.old);
        } else if (Trigger.isAfter) {
            if (Trigger.isInsert) afterInsert(Trigger.new);
            else if (Trigger.isUpdate) afterUpdate(Trigger.new, Trigger.oldMap);
            else if (Trigger.isDelete) afterDelete(Trigger.old);
            else if (Trigger.isUndelete) afterUndelete(Trigger.new);
        }
    }

    protected virtual void beforeInsert(List<SObject> newRecords) {}
    protected virtual void beforeUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {}
    protected virtual void beforeDelete(List<SObject> oldRecords) {}
    protected virtual void afterInsert(List<SObject> newRecords) {}
    protected virtual void afterUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {}
    protected virtual void afterDelete(List<SObject> oldRecords) {}
    protected virtual void afterUndelete(List<SObject> newRecords) {}

    private String getHandlerName() {
        return String.valueOf(this).split(':')[0];
    }

    public static void bypass(String handlerName) {
        bypassedHandlers.add(handlerName);
    }

    public static void clearBypass(String handlerName) {
        bypassedHandlers.remove(handlerName);
    }

    public static void clearAllBypasses() {
        bypassedHandlers.clear();
    }
}
\\\`\\\`\\\`

### Concrete Handler Example
\\\`\\\`\\\`apex
public class AccountTriggerHandler extends TriggerHandler {

    protected override void beforeInsert(List<SObject> newRecords) {
        List<Account> accounts = (List<Account>) newRecords;
        AccountService.setDefaults(accounts);
        AccountService.validateRequiredFields(accounts);
    }

    protected override void afterInsert(List<SObject> newRecords) {
        List<Account> accounts = (List<Account>) newRecords;
        AccountService.createDefaultContacts(accounts);
        AccountService.notifyOwners(accounts);
    }

    protected override void beforeUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {
        List<Account> accounts = (List<Account>) newRecords;
        Map<Id, Account> oldAccounts = (Map<Id, Account>) oldMap;
        AccountService.validateFieldChanges(accounts, oldAccounts);
    }

    protected override void afterUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {
        List<Account> accounts = (List<Account>) newRecords;
        Map<Id, Account> oldAccounts = (Map<Id, Account>) oldMap;
        AccountService.syncRelatedRecords(accounts, oldAccounts);
    }
}
\\\`\\\`\\\`

## All Trigger Context Variables

| Variable | Type | Available In | Description |
|----------|------|-------------|-------------|
| Trigger.new | List<SObject> | insert, update, undelete | New versions of records (read-only in after) |
| Trigger.old | List<SObject> | update, delete | Old versions of records (always read-only) |
| Trigger.newMap | Map<Id, SObject> | after insert, update, undelete | Map of new records by Id (NOT available in before insert) |
| Trigger.oldMap | Map<Id, SObject> | update, delete | Map of old records by Id |
| Trigger.isInsert | Boolean | All | True if insert operation |
| Trigger.isUpdate | Boolean | All | True if update operation |
| Trigger.isDelete | Boolean | All | True if delete operation |
| Trigger.isUndelete | Boolean | All | True if undelete operation |
| Trigger.isBefore | Boolean | All | True if before context |
| Trigger.isAfter | Boolean | All | True if after context |
| Trigger.isExecuting | Boolean | All | True if current context is a trigger |
| Trigger.operationType | System.TriggerOperation | All | Enum: BEFORE_INSERT, BEFORE_UPDATE, etc. |
| Trigger.size | Integer | All | Number of records in the trigger invocation |

## When to Use Before vs After

### Before Triggers
- Validate data before it is saved (add errors to prevent save)
- Set field values without extra DML (changes to Trigger.new are saved automatically)
- Prevent DML by calling record.addError('message')
- Records do NOT have Ids yet in before insert

### After Triggers
- Create/update related records (the triggering records now have Ids)
- Make callouts (via @future or Queueable)
- Publish platform events
- Trigger.new is READ-ONLY in after triggers — you cannot modify the triggering records

## Recursion Prevention Patterns

### Pattern 1: Static Boolean Flag (Simple)
\\\`\\\`\\\`apex
public class RecursionPrevention {
    public static Boolean isFirstRun = true;
}

// In handler:
if (RecursionPrevention.isFirstRun) {
    RecursionPrevention.isFirstRun = false;
    // Do work
}
\\\`\\\`\\\`
WARNING: This blocks ALL subsequent executions. If a legitimate re-entry occurs (e.g., workflow field update causing re-trigger), it will be skipped.

### Pattern 2: Set of Processed IDs (Better)
\\\`\\\`\\\`apex
public class RecursionPrevention {
    private static Set<Id> processedIds = new Set<Id>();

    public static Boolean isAlreadyProcessed(Id recordId) {
        return processedIds.contains(recordId);
    }

    public static void markProcessed(Set<Id> recordIds) {
        processedIds.addAll(recordIds);
    }

    public static void reset() {
        processedIds.clear();
    }
}
\\\`\\\`\\\`
This allows re-processing of records that were NOT already handled, while preventing infinite loops on the same records.

### Pattern 3: Handler Bypass (Best — Built into TriggerHandler base)
Use the bypass mechanism in the TriggerHandler base class:
\\\`\\\`\\\`apex
TriggerHandler.bypass('AccountTriggerHandler');
update someAccounts; // Trigger fires but handler is bypassed
TriggerHandler.clearBypass('AccountTriggerHandler');
\\\`\\\`\\\`

## Critical Rules for Trigger Development

1. NEVER hardcode record IDs — use Custom Metadata Types or Custom Settings for configurable values.
2. NEVER use SOQL or DML in a loop — bulkify all operations.
3. Always handle bulk — Trigger.new can contain up to 200 records (or 2000 via Bulk API).
4. Use addError() for validation in before triggers — do NOT throw exceptions for user-facing validation.
5. Detect changed fields in update triggers to avoid unnecessary processing:
\\\`\\\`\\\`apex
for (Account newAcc : (List<Account>) Trigger.new) {
    Account oldAcc = (Account) Trigger.oldMap.get(newAcc.Id);
    if (newAcc.Industry != oldAcc.Industry) {
        // Only process records where Industry actually changed
    }
}
\\\`\\\`\\\`
6. Order of execution matters: Before triggers → System validation → After triggers → Assignment rules → Workflows → Process Builders → Flows → Entitlement rules → Rollup summaries → Cross-object workflows → Post-commit logic (emails, futures).
7. Trigger.new is the same reference in before and the saved record — changes to Trigger.new in before triggers ARE persisted without DML.
8. Test triggers with bulk data — always insert/update 200+ records in tests.

## Trigger + Service Layer Integration

The trigger handler should ONLY dispatch to service classes. Business logic lives in the service layer:

Trigger → TriggerHandler → Service Class → Selector Class (SOQL)
                                         → Domain Class (record logic)

This separation enables:
- Unit testing service methods independently
- Reusing service logic from REST endpoints, batch jobs, and LWC controllers
- Clear responsibility boundaries
`;
