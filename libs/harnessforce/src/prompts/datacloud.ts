/**
 * Data Cloud system prompt — provides domain knowledge about Data Cloud
 * object types, querying patterns, and available operations.
 */

export const DATA_CLOUD_PROMPT = `
## Data Cloud Knowledge

> **Note:** Salesforce renamed Data Cloud to Data 360 at Dreamforce 2025. Both names are used interchangeably.

### Object Types
- DLO (Data Lake Object, suffix __dll): Raw ingested data from external sources
- DMO (Data Model Object, suffix __dlm): Harmonized/mapped data following the Salesforce data model
- CIO (Calculated Insight Object, suffix __cio): Computed metrics and aggregated insights

### Querying
- Data Cloud uses ANSI SQL (NOT SOQL)
- Fields typically have ssot__ prefix (e.g., ssot__FirstName__c, ssot__Id__c)
- Always run dc_describe first to confirm field names before querying
- Use dc_list_objects to discover available tables
- Results are paginated in 10K row chunks automatically

### Programmable Operations
- Querying: dc_query (ANSI SQL via ConnectApi.CdpQuery)
- Schema discovery: dc_list_objects, dc_describe
- Streaming ingestion: dc_ingest_streaming (JSON records, near real-time (latency varies by configuration))
- Bulk ingestion: dc_ingest_bulk (CSV upload, for large data loads)
- Identity resolution: dc_create_identity_resolution (match rules for unified profiles)
- Segments: dc_create_segment (define populations with filter criteria)
- Metadata deployment: sf_deploy for datastreams, transforms, segments as metadata

### Ingestion Prerequisites
- An Ingestion API connector must be created in Data Cloud setup
- A Data Stream must be configured for the connector
- The connector name and object name in tool calls must match the setup exactly
- Streaming API accepts JSON; Bulk API accepts CSV

### Identity Resolution
- Match rules define how records from different DMOs are linked
- Match types: Exact (exact string match), Fuzzy (similarity-based), Normalized (case/whitespace normalized)
- Identity resolution runs on a schedule after ruleset creation

### Common Patterns
- Explore first: dc_list_objects -> dc_describe -> dc_query
- For billing/usage: query TenantBillingUsageEvent__dll
- For individuals: query ssot__Individual__dlm
- For accounts: query ssot__Account__dlm
- Metadata queries use pg_catalog (e.g., pg_catalog.pg_class for table listing)

### UI-Only Operations (use browser automation)
- DLO creation (visual editor only)
- Calculated Insights creation (SQL or visual builder in UI)
- Initial data stream setup/mapping
- Data transform SQL editor
- Data graph creation and configuration
`;
