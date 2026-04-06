/**
 * Deep Salesforce API strategy prompt.
 */

export const SF_API_STRATEGY_PROMPT = `# Salesforce API Strategy — Deep Reference

## API Overview and When to Use Each

### REST API
- **Use for:** Standard CRUD operations, external integrations, mobile apps, modern web apps
- **Data format:** JSON (default) or XML
- **Authentication:** OAuth 2.0 (recommended), Session ID
- **Base URL:** /services/data/vXX.0/sobjects/
- **Best for:** Single-record or small-batch operations (<2,000 records)
- **Limits:** Subject to API request limits (per 24-hour rolling window)
- **Key endpoints:**
  - GET /sobjects/Account/001xx — retrieve record
  - POST /sobjects/Account — create record
  - PATCH /sobjects/Account/001xx — update record
  - DELETE /sobjects/Account/001xx — delete record
  - GET /query/?q=SELECT+Id+FROM+Account — SOQL query
  - POST /composite/batch — batch up to 25 subrequests

### SOAP API
- **Use for:** Legacy integrations, strongly-typed clients, WSDL-based development
- **Data format:** XML only
- **Authentication:** login() call returns session ID
- **Best for:** Enterprise integrations requiring WSDL contracts
- **Key operations:** create(), update(), upsert(), delete(), query(), search()
- **Note:** Higher overhead than REST; prefer REST for new integrations

### Tooling API
- **Use for:** Development tooling — Apex classes, triggers, Visualforce, LWC metadata, code coverage, debug logs
- **Base URL:** /services/data/vXX.0/tooling/
- **Key uses:**
  - Query ApexClass, ApexTrigger, ApexCodeCoverage
  - Create/update Apex classes without deploying
  - Run anonymous Apex
  - Query debug logs
  - Access code coverage results
- **Advantage:** Faster than Metadata API for individual component operations

### Metadata API
- **Use for:** Deploying and retrieving metadata packages (zip-based), org configuration
- **Key operations:**
  - deploy() — deploy a zip of metadata components
  - retrieve() — retrieve metadata from org
  - listMetadata() — list available metadata components
  - describeMetadata() — describe available metadata types
- **Best for:** CI/CD pipelines, org-to-org migration, package development
- **Note:** sf CLI uses Metadata API under the hood for sf project deploy/retrieve

### Bulk API 2.0
- **Use for:** Large data volumes (>2,000 records, up to millions)
- **Process:** Create job → Upload CSV data → Monitor job → Get results
- **Key characteristics:**
  - Asynchronous — submit job, poll for completion
  - CSV format for data
  - Supports insert, update, upsert, delete, hard delete
  - 150 MB per file upload, 10 batches per job
  - Processed in chunks of up to 10,000 records
- **When to use:**
  - Data migration (>10K records)
  - Nightly data syncs
  - Mass updates/deletes
  - Initial data loads

### Streaming API
- **Use for:** Real-time notifications, event-driven architecture
- **Types:**
  - **PushTopic:** Subscribe to record changes matching a SOQL query (legacy — use CDC)
  - **Change Data Capture (CDC):** Subscribe to create/update/delete/undelete events on any object
  - **Platform Events:** Custom pub/sub events for decoupled integration
  - **Generic Events:** Simple key-value notifications
- **Transport:** CometD (long polling) or gRPC (Pub/Sub API)
- **Best for:** Real-time dashboards, sync to external systems, event-driven workflows

### Composite API
- **Use for:** Reducing API calls by batching multiple operations
- **Types:**
  - **Composite:** Up to 25 subrequests; results from one subrequest can be used in subsequent ones (reference IDs)
  - **Composite Batch:** Up to 25 independent subrequests (no dependencies between them)
  - **Composite Graph:** Up to 500 nodes; complex dependency graphs
  - **SObject Tree:** Create a record and its related children in one call (up to 200 records)
- **Key advantage:** One HTTP request → multiple API operations → one response

### Connect API (Chatter REST API)
- **Use for:** Chatter feeds, files, groups, recommendations, Einstein features
- **Base URL:** /services/data/vXX.0/connect/

## API Version Strategy

### For New Projects
- Use the LATEST stable API version (check release notes)
- As of this knowledge: API version 66.0 (Spring '26) is current
- New API versions ship 3x/year with Salesforce releases

### For Existing Projects
- Match the API version already used in the project for consistency
- Upgrade API versions deliberately, not incidentally
- Test thoroughly after upgrading — behavior can change between versions

### Salesforce Release Cycle
- **Spring (Feb):** Major release, typically most features
- **Summer (Jun):** Mid-year release
- **Winter (Oct):** Year-end release
- Each release increments the API version by 1
- Salesforce deprecates API versions older than 3 years. Always use the latest stable version.
- Minimum supported version shifts forward with each release

### API Version in Code
\\\`\\\`\\\`apex
// Apex classes have an API version set in their metadata
// Force.com Migration Tool / sf CLI sets this on deploy
// To check: Setup → Apex Classes → find the class → API Version column
\\\`\\\`\\\`

## API Limits

### Per-24-Hour Rolling Window
API calls per 24 hours = base + (per-user-license multiplier x number of licenses)

| Edition | Base | Per License |
|---------|------|------------|
| Enterprise | 1,000 | 1,000 per user license |
| Unlimited | 5,000 | 5,000 per user license |
| Performance | 5,000 | 5,000 per user license |

Minimum: 15,000 regardless of calculation

### Per-Request Limits
- Composite: 25 subrequests
- Composite Graph: 500 nodes
- Bulk API: 15,000 batches per rolling 24 hours
- Streaming: 50,000 events/day (Enterprise), 200,000 (Unlimited)

### Monitoring API Usage
\\\`\\\`\\\`
sf org display --json | grep apiVersion
sf limits api display --target-org myOrg
\\\`\\\`\\\`

Or query via REST: GET /services/data/vXX.0/limits/

## Authentication Patterns

### OAuth 2.0 Web Server Flow (Most Common)
1. Redirect user to Salesforce authorization endpoint
2. User approves, Salesforce redirects back with authorization code
3. Exchange code for access token + refresh token
4. Use access token in Authorization header

### OAuth 2.0 JWT Bearer Flow (Server-to-Server)
1. Create a connected app with a certificate
2. Sign a JWT with the private key
3. POST JWT to token endpoint
4. Receive access token (no user interaction required)
Best for: CI/CD pipelines, backend integrations, daemon processes

### OAuth 2.0 Client Credentials Flow
1. POST client_id + client_secret to token endpoint
2. Receive access token
Best for: Service-to-service where no user context is needed

### Named Credentials (Salesforce-Managed Auth)
- Configure authentication in Setup, reference by name in Apex
- Salesforce handles token refresh automatically
- Recommended for all callouts from Apex to external systems
`;
