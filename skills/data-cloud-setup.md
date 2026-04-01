---
name: Data Cloud Setup
description: Set up and configure Salesforce Data Cloud from scratch
trigger: When user asks to set up, configure, or manage Data Cloud
---

# Data Cloud Setup Skill

Set up and configure Salesforce Data Cloud from scratch using Vibeforce tools.

## Prerequisites

- A Salesforce org with Data Cloud provisioned and enabled
- Authenticated via `sf org login` (the default org must have Data Cloud access)
- For ingestion: an Ingestion API connector configured in Data Cloud setup

## Step-by-Step Setup

### Phase 1: Discovery

1. **List available Data Cloud objects** to understand what data already exists:
   ```
   dc_list_objects
   ```
   This returns all DLOs (raw data), DMOs (harmonized data), and CIOs (calculated insights).

2. **Describe specific tables** to understand their schema:
   ```
   dc_describe({ tableName: "ssot__Individual__dlm" })
   ```
   Always do this before querying to confirm exact field names.

3. **Run exploratory queries** using ANSI SQL (not SOQL):
   ```
   dc_query({ sql: "SELECT * FROM ssot__Individual__dlm LIMIT 5" })
   ```

### Phase 2: Data Ingestion

#### Option A: Streaming Ingestion (JSON, near real-time)

Best for: small batches, real-time use cases, application integrations.

1. Ensure an Ingestion API connector exists in Data Cloud setup (UI-only step)
2. Push records:
   ```
   dc_ingest_streaming({
     connectorName: "MyConnector",
     objectName: "runner_profiles",
     records: [
       { "FirstName": "Jane", "LastName": "Doe", "Email": "jane@example.com" }
     ]
   })
   ```

#### Option B: Bulk Ingestion (CSV, batch)

Best for: large data loads, initial data migration.

1. Prepare a CSV file with headers matching the Data Stream schema
2. Upload:
   ```
   dc_ingest_bulk({
     connectorName: "MyConnector",
     objectName: "runner_profiles",
     csvPath: "/path/to/data.csv"
   })
   ```

### Phase 3: Identity Resolution

Create match rules to unify records from different DMOs into a single profile:

```
dc_create_identity_resolution({
  name: "Email and Name Match",
  matchRules: [
    { sourceField: "ssot__Email__c", targetField: "ssot__Email__c", matchType: "Exact" },
    { sourceField: "ssot__FirstName__c", targetField: "ssot__FirstName__c", matchType: "Fuzzy" },
    { sourceField: "ssot__LastName__c", targetField: "ssot__LastName__c", matchType: "Normalized" }
  ]
})
```

Match types:
- **Exact**: Strings must match exactly
- **Fuzzy**: Similarity-based matching (handles typos, variations)
- **Normalized**: Case-insensitive, whitespace-normalized matching

### Phase 4: Segmentation

Create segments to define populations for activation:

```
dc_create_segment({
  name: "US High-Value Customers",
  criteria: "ssot__Country__c = 'US' AND total_revenue__cio > 10000",
  publishSchedule: "Every24Hours"
})
```

### Phase 5: Monitoring

Query billing and usage data to monitor Data Cloud consumption:

```
dc_query({
  sql: "SELECT ResourceType__c, SUM(UsageValue__c) as total FROM TenantBillingUsageEvent__dll GROUP BY ResourceType__c ORDER BY total DESC"
})
```

## Object Type Reference

| Suffix | Type | Description |
|--------|------|-------------|
| `__dll` | DLO (Data Lake Object) | Raw ingested data |
| `__dlm` | DMO (Data Model Object) | Harmonized data mapped to Salesforce data model |
| `__cio` | CIO (Calculated Insight Object) | Computed metrics and aggregated insights |

## Common Field Prefixes

- `ssot__` — Standard fields from the Salesforce data model (e.g., `ssot__FirstName__c`)
- Custom fields follow the org's naming conventions

## UI-Only Operations

These operations cannot be performed via API and require browser automation or manual setup:

- Creating new DLOs (Data Lake Objects)
- Setting up initial Data Streams and field mappings
- Creating Calculated Insights (SQL or visual builder)
- Configuring Data Transforms
- Creating Data Graphs
- Setting up Data Actions and Activations

## Troubleshooting

- **"No objects found"**: Ensure Data Cloud is enabled and data has been ingested
- **Query errors**: Verify field names with `dc_describe` first; Data Cloud uses ANSI SQL, not SOQL
- **Ingestion 404**: The connector name and object name must exactly match the Data Cloud setup configuration
- **Permission errors**: Ensure the authenticated user has Data Cloud Admin or appropriate permissions
