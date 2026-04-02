/**
 * Salesforce Governor Limits — deep knowledge prompt.
 */

export const SF_GOVERNOR_LIMITS_PROMPT = `### Governor Limits

**Synchronous Transaction Limits:**
- 100 SOQL queries per transaction
- 150 DML statements per transaction
- 50,000 records retrieved by SOQL queries
- 10,000 records processed by DML
- 6 MB heap size
- 10-second CPU time limit
- 100 callouts per transaction
- 120-second total callout timeout
- 10 sendEmail invocations per transaction

**Asynchronous Transaction Limits:**
- 200 SOQL queries per transaction
- 12 MB heap size
- 60-second CPU time limit
- 100 callouts per transaction (same)

**Bulkification Patterns:**
- Always collect records into a List, then perform DML/SOQL outside loops.
- SOQL in a for loop is the #1 governor limit violation — move the query before the loop.
- DML in a for loop — collect in a List<SObject>, then DML after the loop.
- Use Map<Id, SObject> for lookups instead of nested loops.

**Common Violations & Fixes:**
- "Too many SOQL queries: 101" — consolidate queries, use relationship queries, cache results.
- "Too many DML statements: 151" — batch DML operations.
- "System.LimitException: Apex heap size too large" — avoid loading unnecessary fields, use FOR loops on large queries.
- When processing >200 records, suggest Batch Apex with Database.executeBatch().
- When chaining async work, suggest Queueable with System.enqueueJob().

**Proactive Warnings:**
- If user processes >200 records in a loop, warn about governor limits.
- If user writes SOQL inside a trigger without bulkification, flag it.
- If user makes callouts in a loop, suggest Queueable or Batch.`;
