---
name: Data Migration
description: Export, transform, and import Salesforce data with external ID mapping, rollback plans, and validation
trigger: When user asks to migrate data, export data, import records, transfer data between orgs, load data, or set up data seeding
tools_used: execute, write_file, read_file, edit_file
---

# Data Migration Skill

Full data migration workflow: export from source org, transform, import to target org with external ID relationships, validation, and rollback.

## Prerequisites

Verify SF CLI and org connections:

```
execute("sf version")
execute("sf org list")
```

Ensure both source and target orgs are authenticated:

```
execute("sf org display --target-org source-org")
execute("sf org display --target-org target-org")
```

## Workflow

### Step 1: Analyze the Data Model

Understand the objects and relationships to migrate:

```
execute("sf sobject describe --sobject Account --target-org source-org")
execute("sf sobject describe --sobject Contact --target-org source-org")
```

Build a dependency map of objects. Always migrate parents before children:

**Migration Order Template:**
1. Users (reference only — don't migrate, map by email)
2. Accounts
3. Contacts (depends on Account)
4. Opportunities (depends on Account)
5. OpportunityContactRoles (depends on Opportunity + Contact)
6. Cases (depends on Account + Contact)
7. Tasks/Events (depends on multiple parents)
8. Custom objects (determine order by lookups)

Query relationship fields to understand dependencies:

```
execute("sf data query --query \"SELECT QualifiedApiName, DataType, ReferenceTo FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Contact' AND DataType = 'Lookup'\" --target-org source-org --result-format json")
```

### Step 2: Set Up External ID Fields

External IDs are critical for maintaining relationships during migration. Create them on each object if they don't exist:

```xml
<!-- force-app/main/default/objects/Account/fields/Migration_ID__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Migration_ID__c</fullName>
    <label>Migration ID</label>
    <type>Text</type>
    <length>50</length>
    <externalId>true</externalId>
    <unique>true</unique>
    <caseSensitive>false</caseSensitive>
</CustomField>
```

Deploy the external ID fields:

```
execute("sf project deploy start --source-dir force-app/main/default/objects --target-org target-org")
```

Populate external IDs in the source org (if not already set):

```apex
// scripts/populate-migration-ids.apex
List<Account> accounts = [SELECT Id FROM Account WHERE Migration_ID__c = null];
for (Account a : accounts) {
    a.Migration_ID__c = a.Id; // Use Salesforce ID as migration ID
}
update accounts;
System.debug('Updated ' + accounts.size() + ' accounts with migration IDs');
```

```
execute("sf apex run --file scripts/populate-migration-ids.apex --target-org source-org")
```

### Step 3: Export Data from Source Org

Export each object using SOQL queries:

```
execute("sf data query --query \"SELECT Id, Name, Industry, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, Phone, Website, Migration_ID__c FROM Account WHERE IsDeleted = false\" --target-org source-org --result-format csv > data/export/accounts.csv")
```

```
execute("sf data query --query \"SELECT Id, FirstName, LastName, Email, Phone, Account.Migration_ID__c, Title, Department, Migration_ID__c FROM Contact WHERE IsDeleted = false\" --target-org source-org --result-format csv > data/export/contacts.csv")
```

For large datasets (>50,000 records), use Bulk API:

```
execute("sf data query --query \"SELECT Id, Name, Migration_ID__c FROM Account\" --target-org source-org --result-format csv --bulk > data/export/accounts-bulk.csv")
```

Using tree export for hierarchical data with relationships:

```
execute("sf data export tree --query \"SELECT Id, Name, Migration_ID__c, (SELECT Id, FirstName, LastName, Email, Migration_ID__c FROM Contacts) FROM Account\" --plan --output-dir data/export --target-org source-org")
```

### Step 4: Transform Data

Common transformations needed before import:

**Remove Salesforce IDs (use External IDs instead):**

```python
# scripts/transform.py
import csv
import sys

input_file = sys.argv[1]
output_file = sys.argv[2]
skip_columns = ['Id', 'attributes']

with open(input_file, 'r') as inf, open(output_file, 'w', newline='') as outf:
    reader = csv.DictReader(inf)
    fieldnames = [f for f in reader.fieldnames if f not in skip_columns]
    writer = csv.DictWriter(outf, fieldnames=fieldnames)
    writer.writeheader()
    for row in reader:
        writer.writerow({k: row[k] for k in fieldnames})
```

```
execute("python3 scripts/transform.py data/export/accounts.csv data/import/accounts.csv")
```

**Map relationship fields to external IDs:**

Replace `AccountId` with `Account.Migration_ID__c` in contact CSV headers.

**Sanitize data:**
- Remove invalid email formats
- Truncate fields exceeding length limits
- Replace org-specific IDs with external ID references
- Handle null vs empty string differences

### Step 5: Create Import Plan

Organize imports in dependency order. Create a manifest file:

```json
{
  "importOrder": [
    {
      "object": "Account",
      "file": "data/import/accounts.csv",
      "externalId": "Migration_ID__c",
      "operation": "upsert",
      "batchSize": 200
    },
    {
      "object": "Contact",
      "file": "data/import/contacts.csv",
      "externalId": "Migration_ID__c",
      "operation": "upsert",
      "batchSize": 200,
      "dependsOn": ["Account"]
    },
    {
      "object": "Opportunity",
      "file": "data/import/opportunities.csv",
      "externalId": "Migration_ID__c",
      "operation": "upsert",
      "batchSize": 200,
      "dependsOn": ["Account"]
    }
  ]
}
```

### Step 6: Import Data to Target Org

For tree-based import (preserves relationships via plan):

```
execute("sf data import tree --plan data/export/Account-Contact-plan.json --target-org target-org")
```

For CSV-based bulk upsert:

```
execute("sf data upsert bulk --sobject Account --file data/import/accounts.csv --external-id Migration_ID__c --target-org target-org --wait 10")
```

```
execute("sf data upsert bulk --sobject Contact --file data/import/contacts.csv --external-id Migration_ID__c --target-org target-org --wait 10")
```

For smaller datasets (under 200 records), use record-by-record:

```
execute("sf data import tree --files data/import/accounts.json --target-org target-org")
```

### Step 7: Validate the Migration

Run validation queries to compare record counts:

```
execute("sf data query --query \"SELECT COUNT(Id) FROM Account\" --target-org source-org --result-format json")
execute("sf data query --query \"SELECT COUNT(Id) FROM Account\" --target-org target-org --result-format json")
```

Check for orphaned records (children without parents):

```
execute("sf data query --query \"SELECT Id, Name FROM Contact WHERE AccountId = null AND Migration_ID__c != null\" --target-org target-org --result-format json")
```

Spot-check specific records:

```
execute("sf data query --query \"SELECT Name, Industry, (SELECT FirstName, LastName, Email FROM Contacts) FROM Account WHERE Migration_ID__c = '<known_id>' LIMIT 5\" --target-org target-org --result-format json")
```

Generate a validation report:

```apex
// scripts/validate-migration.apex
Integer sourceAccountCount = 1500; // Known count from source
Integer targetAccountCount = [SELECT COUNT() FROM Account];
Integer sourceContactCount = 3200;
Integer targetContactCount = [SELECT COUNT() FROM Contact];

System.debug('=== Migration Validation ===');
System.debug('Accounts: ' + targetAccountCount + ' / ' + sourceAccountCount +
  ' (' + (targetAccountCount == sourceAccountCount ? 'PASS' : 'FAIL') + ')');
System.debug('Contacts: ' + targetContactCount + ' / ' + sourceContactCount +
  ' (' + (targetContactCount == sourceContactCount ? 'PASS' : 'FAIL') + ')');
```

```
execute("sf apex run --file scripts/validate-migration.apex --target-org target-org")
```

### Step 8: Rollback Plan

If migration needs to be reversed, delete imported records:

**Option A: Delete by Migration ID (safest)**

```
execute("sf data query --query \"SELECT Id FROM Account WHERE Migration_ID__c != null\" --target-org target-org --result-format csv > data/rollback/accounts-to-delete.csv")
execute("sf data delete bulk --sobject Account --file data/rollback/accounts-to-delete.csv --target-org target-org --wait 10")
```

**Option B: Delete all records of an object (dangerous — only for fresh orgs)**

```
execute("sf data delete bulk --sobject Contact --file data/rollback/contacts-to-delete.csv --target-org target-org --wait 10")
execute("sf data delete bulk --sobject Account --file data/rollback/accounts-to-delete.csv --target-org target-org --wait 10")
```

**Always delete children before parents** (reverse of import order).

### Step 9: Clean Up

Remove migration-specific fields if no longer needed:

```
execute("sf project deploy start --metadata CustomField:Account.Migration_ID__c --target-org target-org --type delete")
```

Or keep them for future reference / incremental syncs.

## Large-Volume Data Migration Tips

For migrations over 100K records:

1. **Use Bulk API v2**: `--bulk` flag on sf data commands
2. **Batch in chunks**: Split CSV files into 10K record batches
3. **Disable triggers temporarily**: Use Custom Settings to gate trigger logic
4. **Disable validation rules**: Deactivate via metadata deploy, re-enable after
5. **Disable workflow rules**: Same approach as validation rules
6. **Schedule during off-hours**: Reduce impact on daily users
7. **Monitor API limits**: `sf limits api display --target-org target-org`

Disable triggers pattern:

```apex
// Custom Setting: MigrationSettings__c.Disable_Triggers__c (checkbox)
// In trigger handler:
if (MigrationSettings__c.getOrgDefaults().Disable_Triggers__c) {
    return; // Skip trigger logic during migration
}
```

## Error Handling & Troubleshooting

### "DUPLICATE_VALUE" errors
- External ID already exists in target org
- Switch from `insert` to `upsert` operation
- Or delete existing records first

### "REQUIRED_FIELD_MISSING"
- Export query is missing a required field
- Add the field to the SOQL SELECT clause
- Or provide default values in the transformation step

### "INVALID_CROSS_REFERENCE_KEY"
- Parent record doesn't exist in target org
- Verify migration order (parents before children)
- Check that external ID values match between parent and child CSVs

### "ENTITY_IS_DELETED" errors
- Records were soft-deleted in source org
- Add `WHERE IsDeleted = false` to export queries
- Or query the Recycle Bin separately if needed

### Bulk job timeout
- Split large files into smaller batches (5K-10K records each)
- Increase `--wait` time
- Check job status: `sf data bulk results --job-id <id> --target-org target-org`

### Record type mismatches
- Export must include `RecordType.DeveloperName`
- Map to target org record type IDs during transformation
- Ensure record types exist in target org before importing

### Lookup filter violations
- Target records don't meet lookup filter criteria
- Temporarily deactivate lookup filters during migration
- Fix data to meet filter requirements
