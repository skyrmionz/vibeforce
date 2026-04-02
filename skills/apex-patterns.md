---
name: Apex Patterns
description: Implement enterprise Apex patterns including trigger handlers, service layer, repository/selector, domain layer, and dependency injection
trigger: When user asks to create a trigger handler, implement service layer, set up selector pattern, build domain classes, refactor Apex architecture, or implement enterprise patterns
tools_used: execute, write_file, read_file, edit_file
---

# Apex Patterns Skill

Implement enterprise-grade Apex architecture: trigger handler framework, service layer, selector/repository pattern, domain layer, and async processing patterns.

## Prerequisites

Verify org connection:

```
execute("sf org display --target-org dev")
```

Check existing Apex classes:

```
execute("sf data query --query \"SELECT Name, Status FROM ApexClass WHERE NamespacePrefix = null ORDER BY Name\" --target-org dev --result-format table")
```

## Workflow

### Step 1: Trigger Handler Framework

Every object gets exactly ONE trigger that delegates to a handler class.

**Base trigger handler class:**

```apex
// force-app/main/default/classes/TriggerHandler.cls
public virtual class TriggerHandler {
    // Recursion prevention
    private static Set<String> executedHandlers = new Set<String>();

    // Context routing
    public void run() {
        String handlerKey = getHandlerName() + '.' + Trigger.operationType.name();
        if (executedHandlers.contains(handlerKey)) return;
        executedHandlers.add(handlerKey);

        switch on Trigger.operationType {
            when BEFORE_INSERT  { beforeInsert(Trigger.new); }
            when BEFORE_UPDATE  { beforeUpdate(Trigger.new, Trigger.oldMap); }
            when BEFORE_DELETE  { beforeDelete(Trigger.old, Trigger.oldMap); }
            when AFTER_INSERT   { afterInsert(Trigger.new, Trigger.newMap); }
            when AFTER_UPDATE   { afterUpdate(Trigger.new, Trigger.oldMap, Trigger.newMap); }
            when AFTER_DELETE   { afterDelete(Trigger.old, Trigger.oldMap); }
            when AFTER_UNDELETE { afterUndelete(Trigger.new, Trigger.newMap); }
        }
    }

    // Override these in concrete handlers
    protected virtual void beforeInsert(List<SObject> newRecords) {}
    protected virtual void beforeUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {}
    protected virtual void beforeDelete(List<SObject> oldRecords, Map<Id, SObject> oldMap) {}
    protected virtual void afterInsert(List<SObject> newRecords, Map<Id, SObject> newMap) {}
    protected virtual void afterUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap, Map<Id, SObject> newMap) {}
    protected virtual void afterDelete(List<SObject> oldRecords, Map<Id, SObject> oldMap) {}
    protected virtual void afterUndelete(List<SObject> newRecords, Map<Id, SObject> newMap) {}

    // Allow re-entry (use carefully)
    public static void resetHandler(String handlerName) {
        Set<String> toRemove = new Set<String>();
        for (String key : executedHandlers) {
            if (key.startsWith(handlerName)) toRemove.add(key);
        }
        executedHandlers.removeAll(toRemove);
    }

    // Bypass mechanism for data migrations
    private static Set<String> bypassedHandlers = new Set<String>();

    public static void bypass(String handlerName) {
        bypassedHandlers.add(handlerName);
    }

    public static void clearBypass(String handlerName) {
        bypassedHandlers.remove(handlerName);
    }

    private String getHandlerName() {
        return String.valueOf(this).split(':')[0];
    }

    protected Boolean isBypassed() {
        return bypassedHandlers.contains(getHandlerName());
    }
}
```

**Concrete trigger handler:**

```apex
// force-app/main/default/classes/AccountTriggerHandler.cls
public class AccountTriggerHandler extends TriggerHandler {

    protected override void beforeInsert(List<SObject> newRecords) {
        if (isBypassed()) return;
        List<Account> accounts = (List<Account>) newRecords;
        setDefaultFields(accounts);
    }

    protected override void beforeUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {
        if (isBypassed()) return;
        List<Account> accounts = (List<Account>) newRecords;
        Map<Id, Account> oldAccounts = (Map<Id, Account>) oldMap;
        validateChanges(accounts, oldAccounts);
    }

    protected override void afterInsert(List<SObject> newRecords, Map<Id, SObject> newMap) {
        if (isBypassed()) return;
        List<Account> accounts = (List<Account>) newRecords;
        AccountService.onAfterInsert(accounts);
    }

    protected override void afterUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap, Map<Id, SObject> newMap) {
        if (isBypassed()) return;
        List<Account> accounts = (List<Account>) newRecords;
        Map<Id, Account> oldAccounts = (Map<Id, Account>) oldMap;
        AccountService.onAfterUpdate(accounts, oldAccounts);
    }

    // Private helper methods
    private void setDefaultFields(List<Account> accounts) {
        for (Account acc : accounts) {
            if (String.isBlank(acc.BillingCountry)) {
                acc.BillingCountry = 'US';
            }
        }
    }

    private void validateChanges(List<Account> newAccounts, Map<Id, Account> oldMap) {
        for (Account acc : newAccounts) {
            Account oldAcc = oldMap.get(acc.Id);
            if (acc.Industry != oldAcc.Industry && acc.Industry == 'Government') {
                // Business rule: government accounts need special approval
                if (String.isBlank(acc.Description)) {
                    acc.addError('Government accounts require a description');
                }
            }
        }
    }
}
```

**The trigger itself (minimal):**

```apex
// force-app/main/default/triggers/AccountTrigger.trigger
trigger AccountTrigger on Account (
    before insert, before update, before delete,
    after insert, after update, after delete, after undelete
) {
    new AccountTriggerHandler().run();
}
```

### Step 2: Service Layer

Service classes contain all business logic. They are called by triggers, LWC controllers, REST APIs, and batch jobs.

```apex
// force-app/main/default/classes/AccountService.cls
public with sharing class AccountService {

    /**
     * Called from trigger handler after insert
     */
    public static void onAfterInsert(List<Account> newAccounts) {
        createDefaultContacts(newAccounts);
        notifyAccountOwners(newAccounts);
    }

    /**
     * Called from trigger handler after update
     */
    public static void onAfterUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        List<Account> industryChanged = new List<Account>();
        for (Account acc : newAccounts) {
            if (acc.Industry != oldMap.get(acc.Id).Industry) {
                industryChanged.add(acc);
            }
        }
        if (!industryChanged.isEmpty()) {
            reclassifyAccounts(industryChanged);
        }
    }

    /**
     * Public API: Create accounts with full validation
     */
    public static List<Account> createAccounts(List<Account> accounts) {
        // Validate
        for (Account acc : accounts) {
            if (String.isBlank(acc.Name)) {
                throw new AccountServiceException('Account name is required');
            }
        }

        // Insert
        Database.SaveResult[] results = Database.insert(accounts, false);

        // Process results
        List<Account> successes = new List<Account>();
        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) {
                successes.add(accounts[i]);
            } else {
                System.debug(LoggingLevel.ERROR, 'Failed to insert account: ' +
                    results[i].getErrors()[0].getMessage());
            }
        }

        return successes;
    }

    // Private implementation methods
    private static void createDefaultContacts(List<Account> accounts) {
        List<Contact> contacts = new List<Contact>();
        for (Account acc : accounts) {
            contacts.add(new Contact(
                FirstName = 'Primary',
                LastName = 'Contact',
                AccountId = acc.Id,
                Email = 'primary@' + acc.Name.replaceAll('[^a-zA-Z0-9]', '') + '.com'
            ));
        }
        if (!contacts.isEmpty()) {
            insert contacts;
        }
    }

    private static void notifyAccountOwners(List<Account> accounts) {
        // Queue notification job
        if (!accounts.isEmpty()) {
            System.enqueueJob(new AccountNotificationJob(
                new Map<Id, Account>(accounts).keySet()
            ));
        }
    }

    private static void reclassifyAccounts(List<Account> accounts) {
        // Business logic for reclassification
        List<Account> toUpdate = new List<Account>();
        for (Account acc : accounts) {
            Account update = new Account(Id = acc.Id);
            update.Rating = acc.Industry == 'Technology' ? 'Hot' : 'Warm';
            toUpdate.add(update);
        }
        if (!toUpdate.isEmpty()) {
            update toUpdate;
        }
    }

    public class AccountServiceException extends Exception {}
}
```

### Step 3: Selector/Repository Pattern

Selector classes centralize all SOQL queries for an object:

```apex
// force-app/main/default/classes/AccountSelector.cls
public inherited sharing class AccountSelector {

    // Standard field set for most queries
    private static final List<String> STANDARD_FIELDS = new List<String>{
        'Id', 'Name', 'Industry', 'BillingStreet', 'BillingCity',
        'BillingState', 'BillingPostalCode', 'BillingCountry',
        'Phone', 'Website', 'OwnerId', 'CreatedDate'
    };

    /**
     * Select accounts by ID
     */
    public static List<Account> selectById(Set<Id> accountIds) {
        return [
            SELECT Id, Name, Industry, Phone, Website, OwnerId, CreatedDate
            FROM Account
            WHERE Id IN :accountIds
            WITH SECURITY_ENFORCED
        ];
    }

    /**
     * Select accounts by name (partial match)
     */
    public static List<Account> selectByName(String searchTerm, Integer limitCount) {
        String safeTerm = '%' + String.escapeSingleQuotes(searchTerm) + '%';
        return [
            SELECT Id, Name, Industry, Phone
            FROM Account
            WHERE Name LIKE :safeTerm
            WITH SECURITY_ENFORCED
            ORDER BY Name
            LIMIT :limitCount
        ];
    }

    /**
     * Select accounts with related contacts
     */
    public static List<Account> selectWithContacts(Set<Id> accountIds) {
        return [
            SELECT Id, Name, Industry,
                (SELECT Id, FirstName, LastName, Email, Phone
                 FROM Contacts
                 ORDER BY LastName
                 LIMIT 100)
            FROM Account
            WHERE Id IN :accountIds
            WITH SECURITY_ENFORCED
        ];
    }

    /**
     * Select accounts with aggregate data
     */
    public static List<AggregateResult> selectCountByIndustry() {
        return [
            SELECT Industry, COUNT(Id) cnt
            FROM Account
            WHERE Industry != null
            WITH SECURITY_ENFORCED
            GROUP BY Industry
            ORDER BY COUNT(Id) DESC
        ];
    }

    /**
     * Select accounts for batch processing (returns QueryLocator)
     */
    public static Database.QueryLocator selectForBatch(Date olderThan) {
        return Database.getQueryLocator([
            SELECT Id, Name, Industry, LastModifiedDate
            FROM Account
            WHERE LastModifiedDate < :olderThan
            ORDER BY LastModifiedDate
        ]);
    }
}
```

### Step 4: Domain Layer

Domain classes encapsulate record-level business logic and validation:

```apex
// force-app/main/default/classes/Accounts.cls
public class Accounts {
    private List<Account> records;

    public Accounts(List<Account> records) {
        this.records = records;
    }

    /**
     * Validate accounts meet business rules
     */
    public void validate() {
        for (Account acc : records) {
            if (acc.Industry == 'Government' && String.isBlank(acc.Description)) {
                acc.addError('Government accounts require a description');
            }
            if (acc.AnnualRevenue != null && acc.AnnualRevenue < 0) {
                acc.AnnualRevenue.addError('Annual revenue cannot be negative');
            }
        }
    }

    /**
     * Apply default values
     */
    public void applyDefaults() {
        for (Account acc : records) {
            if (String.isBlank(acc.BillingCountry)) {
                acc.BillingCountry = 'US';
            }
            if (acc.Rating == null) {
                acc.Rating = deriveRating(acc);
            }
        }
    }

    /**
     * Get accounts that changed a specific field
     */
    public List<Account> getChanged(String fieldName, Map<Id, Account> oldMap) {
        List<Account> changed = new List<Account>();
        Schema.SObjectField field = Schema.SObjectType.Account.fields.getMap().get(fieldName);
        for (Account acc : records) {
            Account oldAcc = oldMap.get(acc.Id);
            if (oldAcc != null && acc.get(field) != oldAcc.get(field)) {
                changed.add(acc);
            }
        }
        return changed;
    }

    /**
     * Filter accounts by criteria
     */
    public List<Account> getByIndustry(String industry) {
        List<Account> result = new List<Account>();
        for (Account acc : records) {
            if (acc.Industry == industry) {
                result.add(acc);
            }
        }
        return result;
    }

    // Private helpers
    private String deriveRating(Account acc) {
        if (acc.AnnualRevenue != null && acc.AnnualRevenue > 1000000) return 'Hot';
        if (acc.Industry == 'Technology') return 'Warm';
        return 'Cold';
    }
}
```

### Step 5: Async Patterns

**Queueable with chaining:**

```apex
// force-app/main/default/classes/AccountProcessingJob.cls
public class AccountProcessingJob implements Queueable, Database.AllowsCallouts {
    private List<Id> accountIds;
    private Integer batchIndex;

    public AccountProcessingJob(List<Id> accountIds) {
        this(accountIds, 0);
    }

    private AccountProcessingJob(List<Id> accountIds, Integer batchIndex) {
        this.accountIds = accountIds;
        this.batchIndex = batchIndex;
    }

    public void execute(QueueableContext context) {
        // Process current batch (200 at a time)
        Integer startIdx = batchIndex * 200;
        Integer endIdx = Math.min(startIdx + 200, accountIds.size());

        if (startIdx >= accountIds.size()) return;

        List<Id> batch = new List<Id>();
        for (Integer i = startIdx; i < endIdx; i++) {
            batch.add(accountIds[i]);
        }

        // Do work
        List<Account> accounts = AccountSelector.selectById(new Set<Id>(batch));
        AccountService.createAccounts(accounts);

        // Chain next batch
        if (endIdx < accountIds.size()) {
            System.enqueueJob(new AccountProcessingJob(accountIds, batchIndex + 1));
        }
    }
}
```

**Batch Apex with stateful tracking:**

```apex
// force-app/main/default/classes/AccountCleanupBatch.cls
public class AccountCleanupBatch implements Database.Batchable<SObject>, Database.Stateful {
    private Integer successCount = 0;
    private Integer errorCount = 0;
    private List<String> errorMessages = new List<String>();

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return AccountSelector.selectForBatch(Date.today().addYears(-2));
    }

    public void execute(Database.BatchableContext bc, List<Account> scope) {
        List<Account> toUpdate = new List<Account>();
        for (Account acc : scope) {
            acc.Status__c = 'Archived';
            toUpdate.add(acc);
        }

        Database.SaveResult[] results = Database.update(toUpdate, false);
        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) {
                successCount++;
            } else {
                errorCount++;
                for (Database.Error err : results[i].getErrors()) {
                    errorMessages.add(toUpdate[i].Name + ': ' + err.getMessage());
                }
            }
        }
    }

    public void finish(Database.BatchableContext bc) {
        // Send summary email
        Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
        email.setToAddresses(new String[]{ UserInfo.getUserEmail() });
        email.setSubject('Account Cleanup Batch Complete');
        email.setPlainTextBody(
            'Success: ' + successCount + '\n' +
            'Errors: ' + errorCount + '\n' +
            (errorMessages.isEmpty() ? '' : '\nErrors:\n' + String.join(errorMessages, '\n'))
        );
        Messaging.sendEmail(new Messaging.SingleEmailMessage[]{ email });
    }
}
```

**Schedulable:**

```apex
// force-app/main/default/classes/AccountCleanupScheduler.cls
public class AccountCleanupScheduler implements Schedulable {
    public void execute(SchedulableContext sc) {
        Database.executeBatch(new AccountCleanupBatch(), 200);
    }
}

// Schedule: Run every Sunday at 2 AM
// System.schedule('Weekly Account Cleanup', '0 0 2 ? * SUN', new AccountCleanupScheduler());
```

### Step 6: Error Handling Pattern

```apex
// force-app/main/default/classes/AppException.cls
public virtual class AppException extends Exception {
    public String errorCode { get; private set; }

    public AppException(String errorCode, String message) {
        this(message);
        this.errorCode = errorCode;
    }
}

// force-app/main/default/classes/ValidationException.cls
public class ValidationException extends AppException {
    public List<String> fieldErrors { get; private set; }

    public ValidationException(String message, List<String> fieldErrors) {
        this('VALIDATION_ERROR', message);
        this.fieldErrors = fieldErrors;
    }
}

// Usage in service layer
public class OrderService {
    public static Order__c createOrder(Order__c order) {
        try {
            // Validate
            if (order.Amount__c == null || order.Amount__c <= 0) {
                throw new ValidationException('Invalid order', new List<String>{ 'Amount must be positive' });
            }

            insert order;
            return order;
        } catch (DmlException e) {
            throw new AppException('DML_ERROR', 'Failed to create order: ' + e.getMessage());
        }
    }
}
```

### Step 7: Deploy and Test

Deploy all classes:

```
execute("sf project deploy start --source-dir force-app/main/default/classes --target-org dev")
execute("sf project deploy start --source-dir force-app/main/default/triggers --target-org dev")
```

Run all tests:

```
execute("sf apex run test --test-level RunLocalTests --code-coverage --wait 15 --target-org dev")
```

## Architecture Decision Guide

| Question | Pattern |
|----------|---------|
| Where does business logic go? | **Service layer** (not triggers, not controllers) |
| Where do SOQL queries go? | **Selector classes** (one per object) |
| Where does record validation go? | **Domain layer** (record-level) or **trigger handler** (context-specific) |
| How do I prevent trigger recursion? | **TriggerHandler base class** with static tracking |
| How do I process >50K records? | **Batch Apex** with `Database.Batchable` |
| How do I make external callouts from triggers? | **Queueable** with `Database.AllowsCallouts` |
| How do I share logic between triggers and APIs? | **Service layer** called by both |

## Error Handling & Troubleshooting

### "Maximum trigger depth exceeded"
- Trigger is calling itself recursively
- Use the recursion prevention in `TriggerHandler` base class
- Check if trigger updates cause re-entry

### "Too many SOQL queries" in trigger context
- Move all queries to Selector classes
- Ensure selectors are called once with bulk data (Set<Id>), not per-record
- Check for hidden queries in service method calls

### "System.LimitException" in batch jobs
- Reduce batch size: `Database.executeBatch(batch, 50)`
- Move callouts to separate Queueable jobs
- Use `Database.Stateful` sparingly (increases heap usage)

### Trigger handler not firing
- Verify the trigger file lists all required events
- Check if the handler is bypassed: `TriggerHandler.clearBypass('AccountTriggerHandler')`
- Verify the handler method name matches the context (e.g., `afterUpdate` not `afterInsert`)

### Service layer not accessible from LWC
- Apex methods called from LWC need `@AuraEnabled` annotation
- For cacheable queries, use `@AuraEnabled(cacheable=true)`
- Service methods should be `public static`
