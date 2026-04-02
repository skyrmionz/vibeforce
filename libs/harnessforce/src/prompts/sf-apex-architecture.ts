/**
 * Deep Salesforce Apex architecture patterns prompt.
 */

export const SF_APEX_ARCHITECTURE_PROMPT = `# Apex Architecture Patterns — Deep Reference

## Overview: Separation of Concerns

Well-architected Apex follows a layered pattern where each layer has a single responsibility:

\\\`\\\`\\\`
┌─────────────────────────────────────────┐
│         Entry Points                     │
│  (Triggers, REST, LWC, Batch, Flow)     │
├─────────────────────────────────────────┤
│         Service Layer                    │
│  (Business logic, orchestration)         │
├─────────────────────────────────────────┤
│         Domain Layer                     │
│  (Record-level validation & behavior)    │
├─────────────────────────────────────────┤
│         Selector Layer                   │
│  (SOQL queries, data access)             │
├─────────────────────────────────────────┤
│         Unit of Work                     │
│  (DML operations, transaction mgmt)      │
└─────────────────────────────────────────┘
\\\`\\\`\\\`

## Service Layer

The service layer contains all business logic. It is called by triggers, REST endpoints, LWC controllers, Batch Apex, and Flow invocable actions. It NEVER performs SOQL or DML directly — it delegates to selectors and unit of work.

\\\`\\\`\\\`apex
public with sharing class AccountService {

    // Entry point for trigger handler
    public static void setDefaults(List<Account> accounts) {
        for (Account acc : accounts) {
            if (acc.BillingCountry == null) {
                acc.BillingCountry = 'US';
            }
            if (acc.Rating == null) {
                acc.Rating = 'Warm';
            }
        }
    }

    // Complex business operation
    public static void mergeAccounts(Id masterId, Set<Id> duplicateIds) {
        // 1. Query all data needed
        Account master = AccountSelector.getById(masterId);
        List<Account> duplicates = AccountSelector.getByIds(duplicateIds);
        List<Contact> orphanedContacts = ContactSelector.getByAccountIds(duplicateIds);

        // 2. Business logic
        for (Contact c : orphanedContacts) {
            c.AccountId = masterId;
        }

        // 3. DML
        update orphanedContacts;
        delete duplicates;
    }

    // Invocable method for Flow
    @InvocableMethod(label='Create Account with Contacts' description='Creates an account and default contacts')
    public static List<Id> createWithContacts(List<AccountRequest> requests) {
        List<Id> accountIds = new List<Id>();
        List<Account> accountsToInsert = new List<Account>();
        Map<Integer, List<Contact>> contactsByIndex = new Map<Integer, List<Contact>>();

        for (Integer i = 0; i < requests.size(); i++) {
            AccountRequest req = requests[i];
            accountsToInsert.add(new Account(Name = req.accountName, Industry = req.industry));
            contactsByIndex.put(i, new List<Contact>());
            for (String contactName : req.contactNames) {
                contactsByIndex.get(i).add(new Contact(LastName = contactName));
            }
        }

        insert accountsToInsert;

        List<Contact> allContacts = new List<Contact>();
        for (Integer i = 0; i < accountsToInsert.size(); i++) {
            for (Contact c : contactsByIndex.get(i)) {
                c.AccountId = accountsToInsert[i].Id;
                allContacts.add(c);
            }
            accountIds.add(accountsToInsert[i].Id);
        }
        insert allContacts;

        return accountIds;
    }

    public class AccountRequest {
        @InvocableVariable(required=true) public String accountName;
        @InvocableVariable public String industry;
        @InvocableVariable public List<String> contactNames;
    }
}
\\\`\\\`\\\`

### Service Layer Rules
1. All methods are static (stateless)
2. Use "with sharing" to enforce record-level security
3. Business logic lives HERE, not in triggers, controllers, or selectors
4. Callable from any entry point (trigger, REST, LWC, batch, flow)
5. Handle bulkification — methods accept List<SObject>, not single records

## Selector Layer (Repository Pattern)

Selectors encapsulate ALL SOQL queries. No other layer should contain inline SOQL.

\\\`\\\`\\\`apex
public inherited sharing class AccountSelector {

    public static Account getById(Id accountId) {
        List<Account> results = getByIds(new Set<Id>{ accountId });
        return results.isEmpty() ? null : results[0];
    }

    public static List<Account> getByIds(Set<Id> accountIds) {
        return [
            SELECT Id, Name, Industry, BillingCountry, Rating, OwnerId,
                   AnnualRevenue, NumberOfEmployees, Phone, Website
            FROM Account
            WHERE Id IN :accountIds
        ];
    }

    public static List<Account> getByIndustry(String industry) {
        return [
            SELECT Id, Name, Industry, BillingCountry, Rating
            FROM Account
            WHERE Industry = :industry
            ORDER BY Name
        ];
    }

    public static List<Account> getWithContacts(Set<Id> accountIds) {
        return [
            SELECT Id, Name, Industry,
                (SELECT Id, FirstName, LastName, Email FROM Contacts ORDER BY LastName)
            FROM Account
            WHERE Id IN :accountIds
        ];
    }

    public static Integer countByIndustry(String industry) {
        return [SELECT COUNT() FROM Account WHERE Industry = :industry];
    }
}
\\\`\\\`\\\`

### Selector Rules
1. Use "inherited sharing" — inherits the caller's sharing context
2. Return fully-queried records with all commonly needed fields
3. Centralize field lists — if you need a new field, add it to the selector (one place to update)
4. Method names describe what they return: getByIds, getWithContacts, countByIndustry
5. Always use bind variables for security
6. Include ORDER BY for deterministic results

## Domain Layer

Domain classes contain record-level logic: validation, field derivation, record behavior. They operate on collections of records.

\\\`\\\`\\\`apex
public inherited sharing class Accounts {
    private List<Account> records;

    public Accounts(List<Account> records) {
        this.records = records;
    }

    // Validation
    public void validate() {
        for (Account acc : records) {
            if (String.isBlank(acc.Name)) {
                acc.Name.addError('Account Name is required');
            }
            if (acc.AnnualRevenue != null && acc.AnnualRevenue < 0) {
                acc.AnnualRevenue.addError('Annual Revenue cannot be negative');
            }
        }
    }

    // Field derivation
    public void deriveRating() {
        for (Account acc : records) {
            if (acc.AnnualRevenue != null && acc.AnnualRevenue > 1000000) {
                acc.Rating = 'Hot';
            } else if (acc.AnnualRevenue != null && acc.AnnualRevenue > 100000) {
                acc.Rating = 'Warm';
            } else {
                acc.Rating = 'Cold';
            }
        }
    }

    // Filter
    public List<Account> getChanged(Map<Id, Account> oldMap, String fieldName) {
        List<Account> changed = new List<Account>();
        for (Account acc : records) {
            Account oldAcc = oldMap.get(acc.Id);
            if (oldAcc != null && acc.get(fieldName) != oldAcc.get(fieldName)) {
                changed.add(acc);
            }
        }
        return changed;
    }
}
\\\`\\\`\\\`

## Trigger Handler Framework

### Simple Custom Framework
\\\`\\\`\\\`apex
public virtual class TriggerHandler {
    public void run() {
        switch on Trigger.operationType {
            when BEFORE_INSERT  { beforeInsert(Trigger.new); }
            when BEFORE_UPDATE  { beforeUpdate(Trigger.new, Trigger.oldMap); }
            when BEFORE_DELETE  { beforeDelete(Trigger.old); }
            when AFTER_INSERT   { afterInsert(Trigger.new); }
            when AFTER_UPDATE   { afterUpdate(Trigger.new, Trigger.oldMap); }
            when AFTER_DELETE   { afterDelete(Trigger.old); }
            when AFTER_UNDELETE { afterUndelete(Trigger.new); }
        }
    }

    protected virtual void beforeInsert(List<SObject> newRecords) {}
    protected virtual void beforeUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {}
    protected virtual void beforeDelete(List<SObject> oldRecords) {}
    protected virtual void afterInsert(List<SObject> newRecords) {}
    protected virtual void afterUpdate(List<SObject> newRecords, Map<Id, SObject> oldMap) {}
    protected virtual void afterDelete(List<SObject> oldRecords) {}
    protected virtual void afterUndelete(List<SObject> newRecords) {}
}
\\\`\\\`\\\`

### fflib Enterprise Patterns (Advanced)
The Apex Enterprise Patterns (fflib) by Andrew Fawcett provide:
- fflib_SObjectDomain — base domain class with trigger routing
- fflib_SObjectSelector — base selector with standard field lists
- fflib_SObjectUnitOfWork — manages all DML in a single transaction
- fflib_Application — factory for creating instances (supports dependency injection)

Use fflib for large projects with multiple developers. For smaller projects, the simple framework above is sufficient.

## Dependency Injection for Testing

\\\`\\\`\\\`apex
public class ExternalIntegrationService {
    // @TestVisible allows tests to inject a mock
    @TestVisible
    private static IExternalClient client = new ExternalClient();

    public static String fetchData(String endpoint) {
        return client.get(endpoint);
    }

    public interface IExternalClient {
        String get(String endpoint);
    }

    private class ExternalClient implements IExternalClient {
        public String get(String endpoint) {
            Http http = new Http();
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            HttpResponse res = http.send(req);
            return res.getBody();
        }
    }
}

// In test:
@isTest
static void testFetchData() {
    ExternalIntegrationService.client = new MockClient();
    Test.startTest();
    String result = ExternalIntegrationService.fetchData('https://api.example.com');
    Test.stopTest();
    System.assertEquals('mock response', result);
}

private class MockClient implements ExternalIntegrationService.IExternalClient {
    public String get(String endpoint) {
        return 'mock response';
    }
}
\\\`\\\`\\\`

## Error Handling Patterns

### Custom Exception Classes
\\\`\\\`\\\`apex
public class AccountServiceException extends Exception {}
public class ValidationException extends Exception {}
public class IntegrationException extends Exception {}

// Usage
if (accounts.isEmpty()) {
    throw new AccountServiceException('No accounts found for processing');
}
\\\`\\\`\\\`

### Try-Catch-Finally in Service Methods
\\\`\\\`\\\`apex
public static void processAccounts(List<Account> accounts) {
    Savepoint sp = Database.setSavepoint();
    try {
        // Business logic
        update accounts;
        publishEvents(accounts);
    } catch (DmlException e) {
        Database.rollback(sp);
        // Log error
        ErrorLogger.log('AccountService.processAccounts', e);
        throw new AccountServiceException('Failed to process accounts: ' + e.getMessage());
    } catch (Exception e) {
        Database.rollback(sp);
        ErrorLogger.log('AccountService.processAccounts', e);
        throw e;
    }
}
\\\`\\\`\\\`

### Database.Savepoint for Transaction Control
- Database.setSavepoint() captures the current state
- Database.rollback(sp) undoes ALL DML after the savepoint
- Use in service methods that perform multiple DML operations
- Savepoints count toward the DML limit

## Async Patterns

### Queueable (Recommended for Most Async)
\\\`\\\`\\\`apex
public class AccountSyncQueueable implements Queueable, Database.AllowsCallouts {
    private List<Id> accountIds;

    public AccountSyncQueueable(List<Id> accountIds) {
        this.accountIds = accountIds;
    }

    public void execute(QueueableContext context) {
        List<Account> accounts = AccountSelector.getByIds(new Set<Id>(accountIds));
        // Make callouts, process data, etc.

        // Chain another Queueable if needed
        if (!accountIds.isEmpty()) {
            System.enqueueJob(new AccountSyncQueueable(remainingIds));
        }
    }
}

// Enqueue from trigger/service
System.enqueueJob(new AccountSyncQueueable(accountIds));
\\\`\\\`\\\`

Advantages: Supports chaining, accepts complex parameters (not just primitives like @future), allows callouts with Database.AllowsCallouts.

### Batch Apex (For Large Data Volumes)
\\\`\\\`\\\`apex
public class AccountCleanupBatch implements Database.Batchable<SObject>, Database.Stateful {
    private Integer totalProcessed = 0;
    private Integer totalErrors = 0;

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator(
            'SELECT Id, Name, LastActivityDate FROM Account WHERE LastActivityDate < LAST_N_YEARS:2'
        );
    }

    public void execute(Database.BatchableContext bc, List<Account> scope) {
        List<Account> toUpdate = new List<Account>();
        for (Account acc : scope) {
            acc.Status__c = 'Inactive';
            toUpdate.add(acc);
        }
        List<Database.SaveResult> results = Database.update(toUpdate, false);
        for (Database.SaveResult sr : results) {
            if (sr.isSuccess()) totalProcessed++;
            else totalErrors++;
        }
    }

    public void finish(Database.BatchableContext bc) {
        // Send summary email, log results
        System.debug('Processed: ' + totalProcessed + ', Errors: ' + totalErrors);
    }
}

// Execute with scope size
Database.executeBatch(new AccountCleanupBatch(), 200);
\\\`\\\`\\\`

### Schedulable (Cron-Based)
\\\`\\\`\\\`apex
public class AccountCleanupScheduler implements Schedulable {
    public void execute(SchedulableContext sc) {
        Database.executeBatch(new AccountCleanupBatch(), 200);
    }
}

// Schedule: every day at 2 AM
System.schedule('Daily Account Cleanup', '0 0 2 * * ?', new AccountCleanupScheduler());
\\\`\\\`\\\`

Cron expression format: Seconds Minutes Hours Day_of_month Month Day_of_week Optional_year

## Key Architecture Decisions

| Decision | Recommendation |
|----------|---------------|
| Where does business logic go? | Service layer (never triggers, never controllers) |
| Where do SOQL queries go? | Selector classes (never inline in services or triggers) |
| Where does validation go? | Domain layer for complex validation; before triggers for simple field-level |
| Where does DML go? | Service layer (or Unit of Work for complex multi-object transactions) |
| How to handle async? | Queueable for most cases; Batch for >50K records; @future only for simple fire-and-forget |
| How to test? | TestDataFactory for data; @TestSetup for shared setup; mock interfaces for external services |
| How to handle errors? | Custom exceptions; try-catch in service layer; Database.SaveResult for partial success |
`;
