---
name: Headless 360
description: Build against Salesforce Headless 360 APIs for decoupled, API-first CRM, Commerce, Data Cloud, and Agentforce interactions
trigger: When user asks about headless Salesforce, API-first patterns, Headless 360, calling Salesforce without UI, or programmatic agent interactions
---

# Headless 360 Skill

Build applications that interact with Salesforce as a headless, API-first platform.
Headless 360 decouples every Salesforce cloud from its UI, exposing CRM, Commerce, Data Cloud,
and Agentforce as composable API services.

## What is Headless 360?

Headless 360 is Salesforce's initiative (announced at TDX 2026) to expose every major platform
capability as a standalone, UI-independent API service. Instead of building on top of the Salesforce
UI, developers can call CRM, Commerce, Data Cloud, and Agentforce as headless backend services
from any client: custom web apps, mobile apps, IoT devices, external AI agents, or other platforms.

### Key Principles

1. **API-first** -- every capability is available via REST/GraphQL API before any UI is built
2. **Composable** -- mix and match services from different clouds in a single workflow
3. **Decoupled** -- no dependency on Salesforce UI, Lightning, or Visualforce
4. **Event-driven** -- Platform Events and CDC enable reactive architectures
5. **AI-native** -- Agentforce agents are invocable as headless services

### Availability Status (as of TDX 2026 announcement)

| Capability | API Status | Notes |
|-----------|-----------|-------|
| CRM REST API (SOQL, sObjects, Composite) | GA | Available since API v20+, fully headless-ready |
| CRM GraphQL API | GA | Available since Winter '23, supports queries and mutations |
| Commerce Headless APIs (B2C) | GA | Shopper APIs, product, pricing, promotions |
| Commerce Headless APIs (B2B) | GA (partial) | Checkout, cart, pricing; some endpoints in beta |
| Data Cloud Ingestion API | GA | Streaming and bulk ingestion |
| Data Cloud Query API | GA | ANSI SQL queries against DMOs, DLOs, CIOs |
| Data 360 Connect API | GA | Unified profile resolution and segment membership |
| Agentforce Headless API | Beta | Programmatic agent invocation without UI; GA timeline TBD |
| Headless Approval API | Pilot | Programmatic approval process management |
| Einstein AI Services API | GA (partial) | Predictions GA; generative features rolling out |

**Important:** Some APIs listed above are announced but not yet GA. Always check the
[Salesforce API release notes](https://developer.salesforce.com/docs/apis) for current status
before building production integrations.

---

## Prerequisites

### Authentication Setup

All headless interactions require OAuth authentication. Choose the right flow:

| Scenario | OAuth Flow | Setup |
|----------|-----------|-------|
| Server-to-server (no user) | Client Credentials | Connected App with client credentials enabled |
| Server-to-server (named user) | JWT Bearer | Connected App with digital certificate |
| User-facing app | Authorization Code + PKCE | Connected App with callback URL |
| External AI agent | Client Credentials or JWT | Service account with scoped permissions |

### Client Credentials Setup (Recommended for Headless)

```bash
# Step 1: Create Connected App (if not exists -- use connected-app-setup skill)
# Ensure "Enable Client Credentials Flow" is checked
# Assign a Run As user with appropriate permissions

# Step 2: Obtain access token
TOKEN_RESPONSE=$(curl -s "https://login.salesforce.com/services/oauth2/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=$SF_CLIENT_ID" \
  -d "client_secret=$SF_CLIENT_SECRET")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
INSTANCE_URL=$(echo "$TOKEN_RESPONSE" | jq -r '.instance_url')

echo "Token: ${ACCESS_TOKEN:0:20}..."
echo "Instance: $INSTANCE_URL"
```

### JWT Bearer Setup (For Named User Context)

```bash
# Generate JWT assertion and exchange for token
# Requires: Connected App with certificate, pre-authorized user

TOKEN_RESPONSE=$(curl -s "https://login.salesforce.com/services/oauth2/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  -d "assertion=$JWT_ASSERTION")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
INSTANCE_URL=$(echo "$TOKEN_RESPONSE" | jq -r '.instance_url')
```

### Helper: Token Refresh Script

```bash
#!/bin/bash
# headless-auth.sh -- Source this to set $ACCESS_TOKEN and $INSTANCE_URL

set -euo pipefail

: "${SF_CLIENT_ID:?Set SF_CLIENT_ID}"
: "${SF_CLIENT_SECRET:?Set SF_CLIENT_SECRET}"
: "${SF_LOGIN_URL:=https://login.salesforce.com}"

TOKEN_RESPONSE=$(curl -sf "$SF_LOGIN_URL/services/oauth2/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=$SF_CLIENT_ID" \
  -d "client_secret=$SF_CLIENT_SECRET")

export ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
export INSTANCE_URL=$(echo "$TOKEN_RESPONSE" | jq -r '.instance_url')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo "ERROR: Authentication failed" >&2
  echo "$TOKEN_RESPONSE" | jq '.' >&2
  exit 1
fi

echo "Authenticated to $INSTANCE_URL" >&2
```

---

## Pattern 1: Headless CRM

### Query Records (REST)

```bash
# SOQL query
curl -s "$INSTANCE_URL/services/data/v63.0/query" \
  -G --data-urlencode "q=SELECT Id, Name, Industry, AnnualRevenue FROM Account WHERE Industry = 'Technology' LIMIT 10" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq '.records[] | {Id, Name, Industry, AnnualRevenue}'
```

### Query Records (GraphQL)

```bash
curl -s "$INSTANCE_URL/services/data/v63.0/graphql" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { uiapi { query { Account(where: { Industry: { eq: \"Technology\" } }, first: 10) { edges { node { Id Name { value } Industry { value } AnnualRevenue { value } } } } } } }"
  }' | jq '.data.uiapi.query.Account.edges[].node'
```

### Create Records

```bash
curl -s "$INSTANCE_URL/services/data/v63.0/sobjects/Account" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "Headless Corp",
    "Industry": "Technology",
    "Website": "https://headless.example.com"
  }' | jq '.'
```

### Composite API (Multiple Operations in One Call)

```bash
curl -s "$INSTANCE_URL/services/data/v63.0/composite" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allOrNone": true,
    "compositeRequest": [
      {
        "method": "POST",
        "url": "/services/data/v63.0/sobjects/Account",
        "referenceId": "newAccount",
        "body": { "Name": "Headless Corp" }
      },
      {
        "method": "POST",
        "url": "/services/data/v63.0/sobjects/Contact",
        "referenceId": "newContact",
        "body": {
          "FirstName": "Jane",
          "LastName": "Doe",
          "AccountId": "@{newAccount.id}"
        }
      }
    ]
  }' | jq '.compositeResponse[] | {referenceId, httpStatusCode, body}'
```

### Invoke Flow Action (Headless)

```bash
# Call an autolaunched Flow as a headless action
curl -s "$INSTANCE_URL/services/data/v63.0/actions/custom/flow/Get_Order_Status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [{
      "order_id": "ORD-12345"
    }]
  }' | jq '.[] | .outputValues'
```

### Invoke Apex Action (Headless)

```bash
# Call an @InvocableMethod as a headless action
curl -s "$INSTANCE_URL/services/data/v63.0/actions/custom/apex/OrderStatusHandler" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [{
      "orderId": "ORD-12345"
    }]
  }' | jq '.[] | .outputValues'
```

---

## Pattern 2: Headless Commerce

### B2C Shopper APIs

Commerce Cloud exposes headless APIs for complete storefront operations.

```bash
# Base URL pattern for B2C Commerce headless
COMMERCE_URL="$INSTANCE_URL/services/data/v63.0/commerce"

# Search products
curl -s "$COMMERCE_URL/webstores/$WEBSTORE_ID/search/product-search" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "searchTerm": "laptop",
    "page": 0,
    "pageSize": 10,
    "fields": ["Name", "Description", "ProductCode"]
  }' | jq '.productsPage.products[] | {name: .name, id: .id}'

# Get product details
curl -s "$COMMERCE_URL/webstores/$WEBSTORE_ID/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq '{name: .name, sku: .sku, description: .description}'

# Create or get cart
CART_ID=$(curl -s "$COMMERCE_URL/webstores/$WEBSTORE_ID/carts/active" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -X POST | jq -r '.cartId')

# Add item to cart
curl -s "$COMMERCE_URL/webstores/$WEBSTORE_ID/carts/$CART_ID/cart-items" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"productId\": \"$PRODUCT_ID\",
    \"quantity\": 1,
    \"type\": \"Product\"
  }" | jq '.'
```

### B2B Commerce APIs

```bash
# B2B buyer product catalog
curl -s "$COMMERCE_URL/webstores/$WEBSTORE_ID/products" \
  -G --data-urlencode "effectiveAccountId=$ACCOUNT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq '.products[] | {id: .id, name: .name}'

# B2B pricing
curl -s "$COMMERCE_URL/webstores/$WEBSTORE_ID/pricing/products" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"pricingLineItems\": [
      { \"productId\": \"$PRODUCT_ID\", \"quantity\": 100 }
    ],
    \"effectiveAccountId\": \"$ACCOUNT_ID\"
  }" | jq '.pricingLineItemResults'
```

---

## Pattern 3: Headless Data Cloud

### Ingest Data (Streaming)

```bash
# Push records into a Data Cloud data stream
curl -s "$INSTANCE_URL/api/v1/ingest/connectors/$CONNECTOR_NAME/streams/$STREAM_NAME" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane@example.com",
        "event_type": "page_view",
        "event_timestamp": "2026-04-21T10:00:00Z"
      }
    ]
  }'
```

### Query Data Cloud (ANSI SQL)

```bash
# Query harmonized data model objects
curl -s "$INSTANCE_URL/api/v2/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT ssot__FirstName__c, ssot__LastName__c, ssot__Email__c FROM ssot__Individual__dlm WHERE ssot__Email__c = '\''jane@example.com'\'' LIMIT 5"
  }' | jq '.data'
```

### Data 360 Connect API (GA)

The Data 360 Connect API provides unified customer profile resolution -- the backbone of headless
customer data access. It resolves a customer identifier to a unified profile with data from
all connected sources.

```bash
# Resolve a unified profile by email
curl -s "$INSTANCE_URL/services/data/v63.0/ssot/360-connect/profiles" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identifiers": [
      {
        "identifierType": "Email",
        "identifierValue": "jane@example.com"
      }
    ],
    "includeSegments": true,
    "includeCalculatedInsights": true
  }' | jq '.'

# Resolve by phone number
curl -s "$INSTANCE_URL/services/data/v63.0/ssot/360-connect/profiles" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identifiers": [
      {
        "identifierType": "Phone",
        "identifierValue": "+14155551234"
      }
    ]
  }' | jq '.profiles[0]'
```

#### Segment Membership Check

```bash
# Check if a customer belongs to a specific segment
curl -s "$INSTANCE_URL/services/data/v63.0/ssot/360-connect/segments/$SEGMENT_ID/members" \
  -G --data-urlencode "identifierType=Email" \
  --data-urlencode "identifierValue=jane@example.com" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq '.isMember'
```

---

## Pattern 4: Headless Agentforce (Beta)

**Status: Beta as of TDX 2026. API surface may change before GA.**

Headless Agentforce enables external systems to invoke Agentforce agents programmatically,
without the Salesforce UI. This is the foundation for external AI agents (like Harnessforce)
to orchestrate Salesforce agent capabilities.

### Start a Headless Agent Session

```bash
# Start a headless agent session
SESSION_RESPONSE=$(curl -s "$INSTANCE_URL/services/data/v63.0/einstein/agent/sessions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"agentApiName\": \"$AGENT_API_NAME\",
    \"context\": {
      \"variables\": {
        \"customerEmail\": \"jane@example.com\"
      }
    }
  }")

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')
echo "Session: $SESSION_ID"
```

### Send a Message to the Agent

```bash
# Send an utterance and get the agent's response
RESPONSE=$(curl -s "$INSTANCE_URL/services/data/v63.0/einstein/agent/sessions/$SESSION_ID/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the status of my order ORD-12345?",
    "sequenceId": 1
  }')

echo "$RESPONSE" | jq '.messages[] | {type, message}'
```

### Multi-Turn Conversation

```bash
#!/bin/bash
# headless-agent-chat.sh -- Multi-turn headless agent conversation
set -euo pipefail

source ./headless-auth.sh

AGENT_API_NAME="${1:-OrderServiceAgent}"
SEQ=0

# Start session
SESSION_ID=$(curl -s "$INSTANCE_URL/services/data/v63.0/einstein/agent/sessions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agentApiName\": \"$AGENT_API_NAME\"}" \
  | jq -r '.sessionId')

echo "Session started: $SESSION_ID"
echo ""

send_message() {
  SEQ=$((SEQ + 1))
  local msg="$1"
  echo ">>> $msg"
  
  RESPONSE=$(curl -s "$INSTANCE_URL/services/data/v63.0/einstein/agent/sessions/$SESSION_ID/messages" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"$msg\", \"sequenceId\": $SEQ}")
  
  echo "$RESPONSE" | jq -r '.messages[] | "<<< \(.message)"'
  echo ""
}

send_message "I need help with my order"
send_message "The order number is ORD-12345"
send_message "I want to return it"

# End session
curl -s -X DELETE "$INSTANCE_URL/services/data/v63.0/einstein/agent/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" > /dev/null

echo "Session ended."
```

### End a Session

```bash
curl -s -X DELETE "$INSTANCE_URL/services/data/v63.0/einstein/agent/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Headless Agentforce Caveats (Beta)

- API endpoints and request/response shapes may change before GA
- Session timeout is approximately 10 minutes of inactivity
- Rate limits apply: check `Sforce-Limit-Info` response header
- Not all agent features are supported in headless mode yet (e.g., file uploads)
- Trace data may not be available for headless sessions in all orgs
- Error responses may be less detailed than CLI preview mode

---

## Pattern 5: Enabling External AI Agents

Headless 360 is the foundation for external AI agents (like those built with Harnessforce,
LangChain, CrewAI, or custom frameworks) to interact with Salesforce programmatically.

### Architecture: External Agent with Salesforce Backend

```
External AI Agent (e.g., Harnessforce)
    |
    +-- Tool: query_crm()       -> CRM REST API
    +-- Tool: resolve_customer() -> Data 360 Connect API
    +-- Tool: run_flow()         -> Flow Actions API
    +-- Tool: search_products()  -> Commerce Headless API
    +-- Tool: ask_agent()        -> Agentforce Headless API (beta)
    +-- Tool: ingest_data()      -> Data Cloud Ingestion API
```

### Tool Mapping for External Agents

Each Salesforce headless API maps to an external AI agent tool:

| Tool Name | Salesforce API | Endpoint |
|-----------|---------------|----------|
| `query_crm` | CRM REST | `GET /services/data/v63.0/query?q={soql}` |
| `resolve_customer` | Data 360 Connect | `POST /services/data/v63.0/ssot/360-connect/profiles` |
| `run_flow` | Flow Actions | `POST /services/data/v63.0/actions/custom/flow/{name}` |
| `run_apex` | Apex Actions | `POST /services/data/v63.0/actions/custom/apex/{name}` |
| `ingest_data` | Data Cloud Ingestion | `POST /api/v1/ingest/connectors/{c}/streams/{s}` |
| `agent_chat` | Agentforce (beta) | `POST /services/data/v63.0/einstein/agent/sessions/{id}/messages` |

Each tool follows the same pattern: authenticate with OAuth, call the endpoint, return JSON. Use the `headless-auth.sh` helper (see Prerequisites) for token management.

---

## Developer Setup

### Step 1: Create a Connected App for Headless Access

```bash
# Use the connected-app-setup skill, or manually:
# Setup > App Manager > New Connected App
# Enable OAuth Settings:
#   - Callback URL: https://localhost (or your app URL)
#   - Selected OAuth Scopes: api, refresh_token, offline_access
#   - Enable Client Credentials Flow (for server-to-server)
#   - Run As: your integration user

# After creation, get the consumer key and secret from:
# Setup > App Manager > View > Manage Consumer Details
```

### Step 2: Configure Permission Sets

```bash
# Create a permission set for the headless integration user
sf data query \
  -q "SELECT Id, Name FROM PermissionSet WHERE Name LIKE '%API%' OR Name LIKE '%Integration%'" \
  -o <org> --json | jq '.result.records[] | {Id, Name}'

# Assign permissions to the integration user
sf org assign permset \
  --name "Salesforce_API_Integration" \
  --target-org <org>
```

### Step 3: Verify Headless Access

```bash
#!/bin/bash
# headless-verify.sh -- Quick check that headless endpoints are reachable
set -euo pipefail
source ./headless-auth.sh

# CRM REST
curl -s "$INSTANCE_URL/services/data/v63.0/sobjects" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.sobjects | length | "CRM: \(.) objects"'

# Flow Actions
curl -s "$INSTANCE_URL/services/data/v63.0/actions/custom/flow" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.actions | length | "Flows: \(.) actions"'

# Data Cloud
curl -s "$INSTANCE_URL/api/v2/query" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) as cnt FROM ssot__Individual__dlm"}' 2>/dev/null \
  | jq 'if .data then "Data Cloud: OK" else "Data Cloud: not available" end'
```

### Step 4: Environment Template

```bash
# .env template for headless development
cat > .env.headless << 'EOF'
# Salesforce Headless 360 Configuration
SF_CLIENT_ID=your_connected_app_consumer_key
SF_CLIENT_SECRET=your_connected_app_consumer_secret
SF_LOGIN_URL=https://login.salesforce.com
SF_API_VERSION=v63.0

# Data Cloud (if using)
DC_CONNECTOR_NAME=your_ingestion_connector
DC_STREAM_NAME=your_data_stream

# Commerce (if using)
WEBSTORE_ID=your_webstore_id

# Agentforce (if using)
AGENT_API_NAME=your_agent_api_name
EOF

echo "Created .env.headless -- fill in values and source before use"
```

---

## Recipes

### Recipe 1: Customer 360 Lookup

Resolve customer, check orders, surface open cases -- all headless:

```bash
#!/bin/bash
set -euo pipefail
source ./headless-auth.sh
EMAIL="${1:-jane@example.com}"

# Step 1: Resolve unified profile
curl -s "$INSTANCE_URL/services/data/v63.0/ssot/360-connect/profiles" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"identifiers\": [{\"identifierType\": \"Email\", \"identifierValue\": \"$EMAIL\"}], \"includeSegments\": true, \"includeCalculatedInsights\": true}" \
  | jq '.profiles[0] | {name: "\(.firstName) \(.lastName)", segments: [.segments[].name], ltv: .calculatedInsights.lifetimeValue}'

# Step 2: Query recent orders
CONTACT_ID=$(curl -s "$INSTANCE_URL/services/data/v63.0/query" \
  -G --data-urlencode "q=SELECT Id FROM Contact WHERE Email = '$EMAIL' LIMIT 1" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.records[0].Id')

[ "$CONTACT_ID" != "null" ] && curl -s "$INSTANCE_URL/services/data/v63.0/query" \
  -G --data-urlencode "q=SELECT OrderNumber, Status, TotalAmount FROM Order WHERE BillToContactId = '$CONTACT_ID' ORDER BY CreatedDate DESC LIMIT 5" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.records[]'

# Step 3: Check open cases
[ "$CONTACT_ID" != "null" ] && curl -s "$INSTANCE_URL/services/data/v63.0/query" \
  -G --data-urlencode "q=SELECT CaseNumber, Subject, Status FROM Case WHERE ContactId = '$CONTACT_ID' AND IsClosed = false" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.records[]'
```

### Recipe 2: Data Cloud Enrichment Pipeline

Ingest data, query engagement, resolve profile -- all headless:

```bash
#!/bin/bash
set -euo pipefail
source ./headless-auth.sh

# Step 1: Ingest interaction data
curl -s "$INSTANCE_URL/api/v1/ingest/connectors/WebTracker/streams/page_views" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": [{"email": "jane@example.com", "page_url": "/products/laptop-pro", "event_type": "page_view", "event_timestamp": "2026-04-21T10:30:00Z"}]}'

# Step 2: Query engagement history
curl -s "$INSTANCE_URL/api/v2/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sql\": \"SELECT page_url, event_type FROM WebTracker_page_views__dll WHERE email = 'jane@example.com' ORDER BY event_timestamp DESC LIMIT 10\"}" \
  | jq '.data'

# Step 3: Resolve unified profile with calculated insights
curl -s "$INSTANCE_URL/services/data/v63.0/ssot/360-connect/profiles" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"identifiers": [{"identifierType": "Email", "identifierValue": "jane@example.com"}], "includeCalculatedInsights": true}' \
  | jq '.profiles[0].calculatedInsights'
```

---

## Preparing for GA: Migration Checklist

Since some Headless 360 APIs are still in beta or pilot, use this checklist to prepare:

### Now (GA APIs)

- [ ] Set up Connected App with Client Credentials flow
- [ ] Implement CRM REST/GraphQL queries for headless record access
- [ ] Set up Data Cloud ingestion pipeline
- [ ] Implement Data 360 Connect for customer profile resolution
- [ ] Build Commerce headless storefront APIs (if using Commerce Cloud)
- [ ] Create Flow and Apex actions as headless-callable services
- [ ] Set up Platform Events for event-driven headless notifications

### When Agentforce Headless Goes GA

- [ ] Migrate from CLI-based agent testing to headless API sessions
- [ ] Implement external agent tool definitions for Agentforce
- [ ] Add agent session management (create, message, end)
- [ ] Set up monitoring for headless agent session metrics
- [ ] Configure rate limiting and circuit breakers for agent API calls

### Ongoing

- [ ] Monitor Salesforce release notes for Headless 360 GA announcements
- [ ] Test beta endpoints in sandbox before production
- [ ] Keep OAuth tokens refreshed with proper token management
- [ ] Implement circuit breaker pattern for all headless API calls
- [ ] Log all headless API interactions for debugging and compliance

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|---------|
| `INVALID_SESSION_ID` | Token expired or invalid | Re-authenticate; tokens expire after session timeout |
| `INSUFFICIENT_ACCESS` | Missing permissions | Check permission set assignments for the integration user |
| `API_DISABLED_FOR_ORG` | API access not enabled | Enable API access in Setup > User Profiles |
| `REQUEST_LIMIT_EXCEEDED` | Hit API rate limits | Check `Sforce-Limit-Info` header; implement backoff |
| Data Cloud query returns empty | Data not yet harmonized | Check DLO vs DMO; data may still be in raw (DLO) state |
| Data 360 Connect no profiles | Identity resolution not run | Verify identity resolution rules are configured and have run |
| Commerce API 404 | Wrong webstore ID or not enabled | Verify webstore ID: query `WebStore` sObject |
| Agentforce headless 404 | Beta not enabled in org | Check org settings; may need pilot/beta flag enabled |
| `UNKNOWN_EXCEPTION` on agent session | Agent not published or activated | Publish and activate the agent first |
| GraphQL query returns null | Field-level security | Verify FLS for the querying user's profile |

## Dependencies

- Salesforce org with appropriate cloud licenses (CRM, Commerce, Data Cloud, Agentforce)
- Connected App configured for headless OAuth flow
- `curl` and `jq` for command-line recipes
- `python3` with `requests` library for Python integration patterns
- `sf` CLI for org management and metadata deployment
