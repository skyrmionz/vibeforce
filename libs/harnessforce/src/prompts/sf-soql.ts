/**
 * Deep Salesforce SOQL optimization prompt.
 */

export const SF_SOQL_PROMPT = `# SOQL Optimization — Deep Reference

## Selective Queries and Indexing

Salesforce maintains indexes on certain fields. Queries that use indexed fields in WHERE clauses are "selective" and perform well even on large data volumes.

### Standard Indexed Fields (Always Indexed)
- Id
- Name
- OwnerId
- CreatedDate
- SystemModstamp
- RecordTypeId
- Lookup/Master-Detail relationship fields (foreign keys)
- External ID fields (custom fields marked as External ID)
- Unique fields

### Custom Indexes
Request custom indexes via Salesforce Support for fields frequently used in WHERE clauses on objects with >100K records.

### Selectivity Thresholds
A query filter is selective when it returns:
- Less than 10% of total records for a standard index
- Less than 5% of total records for a custom index
- Less than 333,333 records (the selectivity cap)

### Non-Selective Patterns (AVOID)
\\\`\\\`\\\`soql
-- Leading wildcard — cannot use index
SELECT Id FROM Account WHERE Name LIKE '%Corp'

-- Negative filter on large dataset — scans all records
SELECT Id FROM Account WHERE Industry != 'Technology'

-- OR with non-indexed field — entire query becomes non-selective
SELECT Id FROM Account WHERE Name = 'Acme' OR Description = 'test'

-- NULL check on non-indexed field
SELECT Id FROM Account WHERE Custom_Field__c = null
\\\`\\\`\\\`

### Selective Patterns (USE THESE)
\\\`\\\`\\\`soql
-- Indexed field in WHERE
SELECT Id FROM Account WHERE Id = '001...'

-- Trailing wildcard on indexed field
SELECT Id FROM Account WHERE Name LIKE 'Acme%'

-- Indexed field with IN clause
SELECT Id FROM Account WHERE Id IN :accountIds

-- Date range on indexed CreatedDate
SELECT Id FROM Account WHERE CreatedDate = LAST_N_DAYS:30
\\\`\\\`\\\`

## Relationship Queries

### Parent-to-Child (Subquery)
Query parent records and include related child records in a single SOQL statement.
\\\`\\\`\\\`soql
SELECT Id, Name,
    (SELECT Id, FirstName, LastName, Email FROM Contacts WHERE IsActive = true)
FROM Account
WHERE Industry = 'Technology'
LIMIT 50
\\\`\\\`\\\`

Rules:
- Use the CHILD RELATIONSHIP NAME (plural, found in the relationship field metadata)
- Custom relationship names end in __r: (SELECT Id FROM Custom_Children__r)
- Maximum 20 subqueries per query
- Each subquery counts as 1 additional SOQL query toward the 100 limit
- Child records returned per parent: up to 200 (default), configurable up to 2,000

### Child-to-Parent (Dot Notation)
Query child records and include parent fields via dot notation.
\\\`\\\`\\\`soql
SELECT Id, FirstName, LastName,
    Account.Name, Account.Industry, Account.Owner.Name
FROM Contact
WHERE Account.Industry = 'Technology'
\\\`\\\`\\\`

Rules:
- Traverse up to 5 levels of parent relationships
- Custom relationships use __r: Contact__r.Account__r.Name
- Each dot-notation field does NOT count as an additional SOQL query

## Aggregate Queries

\\\`\\\`\\\`soql
-- COUNT
SELECT COUNT() FROM Account WHERE Industry = 'Technology'
-- Returns integer; does NOT count toward 50K row limit

SELECT COUNT(Id) cnt FROM Account GROUP BY Industry
-- Returns AggregateResult list

-- SUM, AVG, MIN, MAX
SELECT Industry, SUM(AnnualRevenue) totalRevenue, COUNT(Id) numAccounts
FROM Account
GROUP BY Industry
HAVING SUM(AnnualRevenue) > 1000000
ORDER BY SUM(AnnualRevenue) DESC

-- COUNT_DISTINCT
SELECT COUNT_DISTINCT(Industry) FROM Account
\\\`\\\`\\\`

Aggregate rules:
- GROUP BY required when using aggregate functions with non-aggregated fields
- HAVING filters on aggregated results (like WHERE but for aggregates)
- Aggregate queries return List<AggregateResult>
- Access values: (String) result.get('Industry'), (Decimal) result.get('totalRevenue')
- Maximum 50,000 rows still applies to aggregate queries

## LIMIT, OFFSET, and Pagination

\\\`\\\`\\\`soql
-- Simple pagination
SELECT Id, Name FROM Account ORDER BY Name LIMIT 50 OFFSET 100
\\\`\\\`\\\`

- OFFSET maximum: 2,000 (cannot paginate beyond 2,000 with OFFSET)
- For large datasets, use a WHERE clause with the last record's sort field value instead:
\\\`\\\`\\\`soql
-- Keyset pagination (scales to any size)
SELECT Id, Name FROM Account WHERE Name > 'LastSeenName' ORDER BY Name LIMIT 50
\\\`\\\`\\\`

## FOR UPDATE (Record Locking)

\\\`\\\`\\\`soql
SELECT Id, Status__c FROM Order__c WHERE Id = :orderId FOR UPDATE
\\\`\\\`\\\`

- Locks the selected records for the duration of the transaction
- Other transactions attempting to lock or update the same records will WAIT (up to 10 seconds, then fail)
- Use to prevent race conditions in concurrent processing
- Cannot use with aggregate queries, subqueries, or in @isTest(IsParallel=true)
- Cannot use with ORDER BY

## FOR REFERENCE (Audit Trail)

\\\`\\\`\\\`soql
SELECT Id, Name FROM Account WHERE Id = :accountId FOR REFERENCE
\\\`\\\`\\\`
- Updates the LastReferencedDate on queried records
- Useful for tracking which records are being accessed

## Polymorphic Queries (TYPEOF)

Query fields that can reference multiple object types (e.g., Task.What, Event.Who):
\\\`\\\`\\\`soql
SELECT Id, Subject,
    TYPEOF What
        WHEN Account THEN Name, Industry
        WHEN Opportunity THEN Name, StageName, Amount
        ELSE Name
    END
FROM Task
WHERE CreatedDate = TODAY
\\\`\\\`\\\`

Alternative without TYPEOF:
\\\`\\\`\\\`soql
SELECT Id, Subject, What.Type, What.Name FROM Task
\\\`\\\`\\\`

## Dynamic SOQL

\\\`\\\`\\\`apex
String objectName = 'Account';
String fieldList = 'Id, Name, Industry';
String conditions = 'Industry = :industry';

// SAFE — bind variables work in Database.query
String industry = 'Technology';
String query = 'SELECT ' + fieldList + ' FROM ' + objectName + ' WHERE ' + conditions;
List<SObject> results = Database.query(query);

// SAFE — using String.escapeSingleQuotes for user input
String userInput = String.escapeSingleQuotes(searchTerm);
String query2 = 'SELECT Id, Name FROM Account WHERE Name LIKE \'%' + userInput + '%\'';
\\\`\\\`\\\`

### Security: SOQL Injection Prevention
- ALWAYS use bind variables (:variableName) when possible — they are inherently safe
- When bind variables are not possible (dynamic field names, object names), use String.escapeSingleQuotes()
- When using LIKE with user input, sanitize \\\`%\\\` and \\\`_\\\` wildcards in addition to single quotes — these are special LIKE characters that can return unexpected results
- NEVER concatenate raw user input into SOQL strings
- Use WITH SECURITY_ENFORCED to enforce FLS:
\\\`\\\`\\\`soql
SELECT Id, Name, Secret_Field__c FROM Account WITH SECURITY_ENFORCED
-- Throws an exception if the running user lacks field-level access to any queried field
\\\`\\\`\\\`
- Warning: WITH SECURITY_ENFORCED throws a System.QueryException at runtime if the user lacks access to any queried field. Wrap in try-catch or check field accessibility first with Schema.SObjectType.describe().

## Query Performance Tips

1. **Select only needed fields** — avoid SELECT * patterns; query only the fields you use
2. **Use WHERE to filter early** — reduce the result set at the database level
3. **Use LIMIT** — even if you expect few results, LIMIT prevents runaway queries
4. **Avoid formula fields in WHERE** — they are calculated at query time, not indexed
5. **Use relationship queries instead of multiple queries** — one parent + subquery replaces N+1 queries
6. **Use ALL ROWS** sparingly — includes soft-deleted records, can return massive result sets
7. **Cache query results** — store in a Map<Id, SObject> or static variable to avoid re-querying
8. **Use COUNT() for existence checks** — faster than retrieving full records when you only need to know if records exist

## SOQL For Loops

Process large result sets without hitting heap limits:
\\\`\\\`\\\`apex
// Processes records in batches of 200 automatically
for (Account a : [SELECT Id, Name FROM Account WHERE Industry = 'Tech']) {
    // Process each record — no heap limit risk
}
\\\`\\\`\\\`
Use SOQL for loops when processing more than a few thousand records.

## Dynamic Field Selection (API v59+)

\\\`\\\`\\\`soql
SELECT FIELDS(ALL) FROM Account LIMIT 200
SELECT FIELDS(STANDARD) FROM Contact WHERE Id = '003...'
SELECT FIELDS(CUSTOM) FROM MyObject__c LIMIT 200
\\\`\\\`\\\`
FIELDS(ALL) requires LIMIT ≤ 200. Use FIELDS(STANDARD) or FIELDS(CUSTOM) for specific field sets.
`;
