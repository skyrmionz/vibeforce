---
name: Performance Optimization
description: Analyze and fix governor limit violations, optimize SOQL queries, implement bulkification patterns, and use async processing
trigger: When user asks to optimize performance, fix governor limits, bulkify code, speed up queries, fix "too many SOQL queries", or improve Apex efficiency
tools_used: execute, read_file, write_file, edit_file
---

# Performance Optimization Skill

Analyze and resolve Salesforce governor limit violations, optimize SOQL/DML patterns, bulkify Apex code, and implement asynchronous processing.

## Prerequisites

Verify org connection and check current limits:

```
execute("sf limits api display --target-org dev --result-format json")
```

## Workflow

### Step 1: Identify Performance Issues

Check debug logs for governor limit consumption:

```
execute("sf apex tail log --target-org dev --color")
```

Query recent limit violations:

```
execute("sf data query --query \"SELECT Id, LogLength, Operation, Status, DurationMilliseconds FROM ApexLog WHERE Status = 'Error' AND Request = 'API' ORDER BY StartTime DESC LIMIT 20\" --target-org dev --result-format table")
```

Review event log files for slow transactions:

```
execute("sf data query --query \"SELECT Id, EventType, LogDate, LogFileLength FROM EventLogFile WHERE EventType = 'ApexExecution' AND LogDate > LAST_N_DAYS:7 ORDER BY LogDate DESC LIMIT 10\" --target-org dev --result-format json")
```

### Step 2: Governor Limits Reference

**Synchronous Transaction Limits:**

| Limit | Value | What Triggers It |
|-------|-------|-----------------|
| SOQL queries | 100 | Queries in loops, unoptimized triggers |
| DML statements | 150 | DML in loops, single-record operations |
| SOQL query rows | 50,000 | Unbounded queries, missing WHERE clauses |
| Heap size | 6 MB | Large collections, JSON deserialization |
| CPU time | 10,000 ms | Complex logic, nested loops |
| Callouts | 100 | External API calls in loops |
| Future calls | 50 | Excessive @future invocations |
| Queueable jobs | 50 | Too many chained jobs |
| DML rows | 10,000 | Bulk operations without batching |

**Asynchronous Limits (Batch, Future, Queueable):**

| Limit | Value |
|-------|-------|
| SOQL queries | 200 |
| Heap size | 12 MB |
| CPU time | 60,000 ms |
| SOQL query rows | 50,000 |

### Step 3: Fix SOQL-in-Loop (Most Common Issue)

**Anti-pattern — SOQL inside a loop:**

```apex
// BAD: This burns 1 SOQL query per record (hits 100 limit at 100 records)
for (Account acc : Trigger.new) {
    List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
    acc.Contact_Count__c = contacts.size();
}
```

**Fixed — Bulkified query:**

```apex
// GOOD: Single query for all records
Set<Id> accountIds = new Set<Id>();
for (Account acc : Trigger.new) {
    accountIds.add(acc.Id);
}

Map<Id, Integer> contactCountMap = new Map<Id, Integer>();
for (AggregateResult ar : [
    SELECT AccountId, COUNT(Id) cnt
    FROM Contact
    WHERE AccountId IN :accountIds
    GROUP BY AccountId
]) {
    contactCountMap.put((Id) ar.get('AccountId'), (Integer) ar.get('cnt'));
}

for (Account acc : Trigger.new) {
    acc.Contact_Count__c = contactCountMap.containsKey(acc.Id)
        ? contactCountMap.get(acc.Id) : 0;
}
```

### Step 4: Fix DML-in-Loop

**Anti-pattern — DML inside a loop:**

```apex
// BAD: 1 DML per record
for (Account acc : accounts) {
    acc.Status__c = 'Processed';
    update acc;
}
```

**Fixed — Collect and DML once:**

```apex
// GOOD: Single DML for all records
List<Account> toUpdate = new List<Account>();
for (Account acc : accounts) {
    acc.Status__c = 'Processed';
    toUpdate.add(acc);
}
if (!toUpdate.isEmpty()) {
    update toUpdate;
}
```

### Step 5: Optimize SOQL Queries

**Use selective WHERE clauses:**

```apex
// BAD: Full table scan
List<Account> accounts = [SELECT Id, Name FROM Account WHERE Name LIKE '%test%'];

// GOOD: Use indexed fields (Id, Name, CreatedDate, SystemModstamp, RecordTypeId, custom External IDs)
List<Account> accounts = [SELECT Id, Name FROM Account WHERE CreatedDate > :startDate AND Industry = 'Technology'];
```

**Use relationship queries instead of multiple queries:**

```apex
// BAD: Two separate queries
List<Account> accounts = [SELECT Id, Name FROM Account WHERE Industry = 'Tech' LIMIT 100];
Set<Id> accIds = new Set<Id>();
for (Account a : accounts) accIds.add(a.Id);
List<Contact> contacts = [SELECT Id, Name, AccountId FROM Contact WHERE AccountId IN :accIds];

// GOOD: Single query with subquery
List<Account> accounts = [
    SELECT Id, Name,
        (SELECT Id, FirstName, LastName, Email FROM Contacts)
    FROM Account
    WHERE Industry = 'Technology'
    LIMIT 100
];
```

**Use aggregate queries for counts and sums:**

```apex
// BAD: Query all records just to count
Integer count = [SELECT Id FROM Opportunity WHERE StageName = 'Closed Won'].size();

// GOOD: Use COUNT()
Integer count = [SELECT COUNT() FROM Opportunity WHERE StageName = 'Closed Won'];

// GOOD: Use aggregate functions
List<AggregateResult> results = [
    SELECT StageName, COUNT(Id) cnt, SUM(Amount) totalAmount
    FROM Opportunity
    GROUP BY StageName
    HAVING COUNT(Id) > 5
];
```

**Add LIMIT to prevent exceeding 50K row limit:**

```apex
// Always use LIMIT when you don't need all records
List<Account> accounts = [SELECT Id, Name FROM Account ORDER BY CreatedDate DESC LIMIT 1000];
```

### Step 6: Reduce Heap Size

**Avoid loading large collections into memory:**

```apex
// BAD: Load all records into a list
List<Account> allAccounts = [SELECT Id, Name, Description FROM Account]; // Could exceed 6MB

// GOOD: Use SOQL for-loop for large datasets
for (List<Account> batch : [SELECT Id, Name FROM Account]) {
    // Process 200 records at a time
    processAccounts(batch);
}
```

**Use selective field lists:**

```apex
// BAD: SELECT * equivalent
List<Account> accounts = [SELECT Id, Name, Description, BillingAddress,
    ShippingAddress, Website, Phone, Fax, /* 50 more fields */ FROM Account];

// GOOD: Only select fields you need
List<Account> accounts = [SELECT Id, Name, Industry FROM Account];
```

**Clear references when done:**

```apex
List<Account> largeList = getLargeDataSet();
processData(largeList);
largeList = null; // Help garbage collector reclaim memory
```

### Step 7: Implement Async Processing

When synchronous limits are insufficient, use async patterns:

**Future Method (simple async, no chaining):**

```apex
public class AsyncProcessor {
    @future(callout=true)
    public static void processExternalCallout(Set<Id> recordIds) {
        List<Account> accounts = [SELECT Id, Name, External_Id__c FROM Account WHERE Id IN :recordIds];
        for (Account acc : accounts) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('https://api.example.com/sync/' + acc.External_Id__c);
            req.setMethod('POST');
            new Http().send(req);
        }
    }
}
```

**Queueable (chainable, supports complex types):**

```apex
public class AccountProcessingJob implements Queueable, Database.AllowsCallouts {
    private List<Id> accountIds;
    private Integer retryCount;

    public AccountProcessingJob(List<Id> accountIds) {
        this.accountIds = accountIds;
        this.retryCount = 0;
    }

    public void execute(QueueableContext context) {
        List<Account> accounts = [SELECT Id, Name FROM Account WHERE Id IN :accountIds LIMIT 200];

        // Process batch
        List<Account> toUpdate = new List<Account>();
        for (Account acc : accounts) {
            acc.Description = 'Processed on ' + DateTime.now();
            toUpdate.add(acc);
        }
        update toUpdate;

        // Chain next batch if more records remain
        List<Id> remaining = new List<Id>();
        for (Integer i = 200; i < accountIds.size(); i++) {
            remaining.add(accountIds[i]);
        }
        if (!remaining.isEmpty()) {
            System.enqueueJob(new AccountProcessingJob(remaining));
        }
    }
}

// Usage
System.enqueueJob(new AccountProcessingJob(accountIdList));
```

**Batch Apex (for >50K records):**

```apex
public class AccountCleanupBatch implements Database.Batchable<SObject>, Database.Stateful {
    private Integer totalProcessed = 0;
    private Integer totalErrors = 0;

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([
            SELECT Id, Name, Industry, LastModifiedDate
            FROM Account
            WHERE LastModifiedDate < LAST_N_YEARS:2
        ]);
    }

    public void execute(Database.BatchableContext bc, List<Account> scope) {
        List<Account> toUpdate = new List<Account>();
        for (Account acc : scope) {
            acc.Status__c = 'Archived';
            toUpdate.add(acc);
        }

        Database.SaveResult[] results = Database.update(toUpdate, false);
        for (Database.SaveResult sr : results) {
            if (sr.isSuccess()) {
                totalProcessed++;
            } else {
                totalErrors++;
            }
        }
    }

    public void finish(Database.BatchableContext bc) {
        System.debug('Batch complete. Processed: ' + totalProcessed + ', Errors: ' + totalErrors);
        // Send completion email or log results
    }
}

// Usage: process 200 records per batch (default)
Database.executeBatch(new AccountCleanupBatch(), 200);
```

### Step 8: Optimize Trigger Performance

**Use trigger handler pattern to control execution:**

```apex
public class TriggerHandler {
    private static Set<String> executedHandlers = new Set<String>();

    public static Boolean hasRun(String handlerName) {
        return executedHandlers.contains(handlerName);
    }

    public static void setRun(String handlerName) {
        executedHandlers.add(handlerName);
    }

    public static void reset(String handlerName) {
        executedHandlers.remove(handlerName);
    }
}

// In trigger handler:
public class AccountTriggerHandler {
    public static void handleBeforeUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        if (TriggerHandler.hasRun('AccountTriggerHandler.beforeUpdate')) return;
        TriggerHandler.setRun('AccountTriggerHandler.beforeUpdate');

        // Only process changed records
        List<Account> changedAccounts = new List<Account>();
        for (Account acc : newAccounts) {
            Account old = oldMap.get(acc.Id);
            if (acc.Industry != old.Industry || acc.Name != old.Name) {
                changedAccounts.add(acc);
            }
        }

        if (!changedAccounts.isEmpty()) {
            processChangedAccounts(changedAccounts);
        }
    }
}
```

### Step 9: Monitor and Measure

Set up debug log monitoring:

```
execute("sf apex log tail --target-org dev --color")
```

Check org limits usage:

```
execute("sf limits api display --target-org dev")
```

Query limit consumption from debug logs:

```
execute("sf data query --query \"SELECT Id, DurationMilliseconds, Operation, Status FROM ApexLog WHERE DurationMilliseconds > 5000 ORDER BY DurationMilliseconds DESC LIMIT 20\" --target-org dev --result-format table")
```

### Step 10: Platform Cache for Repeated Data

```apex
// Store frequently accessed data in Platform Cache
Cache.Org.put('local.MyPartition.configData', configMap, 3600); // TTL in seconds

// Retrieve cached data
Map<String, String> cached = (Map<String, String>) Cache.Org.get('local.MyPartition.configData');
if (cached == null) {
    cached = loadConfigFromDatabase();
    Cache.Org.put('local.MyPartition.configData', cached, 3600);
}
```

## Performance Checklist

Before deploying, verify:

- [ ] No SOQL inside loops
- [ ] No DML inside loops
- [ ] All queries have selective WHERE clauses
- [ ] All queries use LIMIT where appropriate
- [ ] Collections used instead of single-record operations
- [ ] Triggers only process changed fields (compare old vs new)
- [ ] Recursion prevention in place for all triggers
- [ ] Batch Apex used for >50K record operations
- [ ] Callouts moved to @future or Queueable
- [ ] Test classes include bulk tests (200+ records)

## Error Handling & Troubleshooting

### "System.LimitException: Too many SOQL queries: 101"
- Search for SOQL inside `for` loops
- Move queries before the loop, use `Map<Id, List<SObject>>` for lookups
- Check trigger recursion — same trigger firing multiple times

### "System.LimitException: Too many DML statements: 151"
- Collect records in lists, perform single DML after loop
- Check for hidden DML in utility methods called inside loops

### "System.LimitException: Apex CPU time limit exceeded"
- Profile the code: add `System.debug(Limits.getCpuTime())` at key points
- Move complex processing to async (Queueable or Batch)
- Optimize nested loops — use Maps instead of nested iterations
- Reduce the number of records processed per transaction

### "System.LimitException: Apex heap size too large"
- Use SOQL for-loops for large queries
- Select only needed fields
- Clear large collections after use (set to null)
- Process records in smaller batches

### Query performance is slow (not hitting limits but slow)
- Add custom indexes (contact Salesforce Support for non-standard fields)
- Use skinny tables for frequently queried objects
- Avoid LIKE '%text%' (leading wildcard prevents index usage)
- Use `WITH SECURITY_ENFORCED` instead of manual FLS checks (faster)
