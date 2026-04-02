---
name: Integration Patterns
description: Implement Salesforce integrations using Platform Events, Change Data Capture, Named Credentials, REST callouts, External Services, and Outbound Messages
trigger: When user asks to integrate Salesforce with external systems, set up platform events, configure CDC, create callouts, use named credentials, or implement event-driven architecture
tools_used: execute, write_file, read_file, edit_file
---

# Integration Patterns Skill

Build Salesforce integrations: Platform Events, Change Data Capture, Named Credentials, REST callouts, External Services, and Outbound Messages.

## Prerequisites

Verify org connection:

```
execute("sf org display --target-org target-org")
```

## Decision Tree: Which Integration Method?

Choose the right approach:

| Scenario | Method |
|----------|--------|
| Real-time outbound to REST API | **Named Credential + Apex Callout** |
| Event-driven async (fire and forget) | **Platform Events** |
| React to record changes externally | **Change Data Capture** |
| Import external REST API as Apex | **External Services** |
| Simple outbound notification | **Outbound Messages** (legacy) |
| High-volume inbound data | **Bulk API / MuleSoft** |
| Bidirectional real-time sync | **Platform Events + Named Credentials** |

## Platform Events

### Create a Platform Event

```xml
<!-- force-app/main/default/objects/Order_Update__e/Order_Update__e.object-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>Order Update</label>
    <pluralLabel>Order Updates</pluralLabel>
    <deploymentStatus>Deployed</deploymentStatus>
    <eventType>HighVolume</eventType>
    <publishBehavior>PublishAfterCommit</publishBehavior>
    <description>Fired when an order status changes</description>
</CustomObject>
```

**Event type options:**
- `HighVolume` — recommended; stored 72 hours, supports replay
- `StandardVolume` — legacy; counts against daily API limits

**Publish behavior options:**
- `PublishAfterCommit` — fires only if the transaction commits (safer)
- `PublishImmediately` — fires even if the transaction rolls back

Add fields to the event:

```xml
<!-- force-app/main/default/objects/Order_Update__e/fields/Order_Id__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Order_Id__c</fullName>
    <label>Order Id</label>
    <type>Text</type>
    <length>18</length>
</CustomField>
```

```xml
<!-- force-app/main/default/objects/Order_Update__e/fields/New_Status__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>New_Status__c</fullName>
    <label>New Status</label>
    <type>Text</type>
    <length>50</length>
</CustomField>
```

Deploy:

```
execute("sf project deploy start --source-dir force-app/main/default/objects/Order_Update__e --target-org target-org")
```

### Publish from Apex

```apex
// Publish a single event
Order_Update__e event = new Order_Update__e(
    Order_Id__c = orderId,
    New_Status__c = 'Shipped'
);
Database.SaveResult result = EventBus.publish(event);
if (!result.isSuccess()) {
    for (Database.Error err : result.getErrors()) {
        System.debug('Error: ' + err.getStatusCode() + ' - ' + err.getMessage());
    }
}
```

```apex
// Publish multiple events (batch)
List<Order_Update__e> events = new List<Order_Update__e>();
for (Order__c ord : orders) {
    events.add(new Order_Update__e(
        Order_Id__c = ord.Id,
        New_Status__c = ord.Status__c
    ));
}
List<Database.SaveResult> results = EventBus.publish(events);
```

### Subscribe from Apex Trigger

```apex
// triggers/OrderUpdateTrigger.trigger
trigger OrderUpdateTrigger on Order_Update__e (after insert) {
    List<Task> tasks = new List<Task>();
    for (Order_Update__e event : Trigger.New) {
        if (event.New_Status__c == 'Shipped') {
            tasks.add(new Task(
                Subject = 'Follow up on shipped order ' + event.Order_Id__c,
                WhatId = event.Order_Id__c,
                ActivityDate = Date.today().addDays(3)
            ));
        }
    }
    if (!tasks.isEmpty()) {
        insert tasks;
    }
}
```

### Subscribe from Flow

Use a Platform Event-Triggered Flow:
1. Object: `Order_Update__e`
2. Trigger: "A platform event message is received"
3. Set conditions on event fields
4. Use "Resume from last replay ID" for gap-free processing

### Subscribe from LWC (Empapi)

```javascript
import { LightningElement } from 'lwc';
import { subscribe, unsubscribe, onError } from 'lightning/empApi';

export default class OrderListener extends LightningElement {
    subscription = {};
    channelName = '/event/Order_Update__e';

    connectedCallback() {
        this.handleSubscribe();
        this.registerErrorListener();
    }

    handleSubscribe() {
        const messageCallback = (response) => {
            const payload = response.data.payload;
            console.log('Order updated:', payload.Order_Id__c, payload.New_Status__c);
        };
        subscribe(this.channelName, -1, messageCallback).then((response) => {
            this.subscription = response;
        });
    }

    registerErrorListener() {
        onError((error) => {
            console.error('EMP API error:', JSON.stringify(error));
        });
    }

    disconnectedCallback() {
        unsubscribe(this.subscription);
    }
}
```

## Change Data Capture (CDC)

### Enable CDC

Enable CDC for objects via Setup or metadata:

```
execute("sf data query --query \"SELECT Id, DurableId, QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName IN ('Account','Contact','Opportunity')\" --target-org target-org --result-format json")
```

Enable via Setup UI: Setup > Change Data Capture > Select Objects > Save

### Subscribe to CDC Events

CDC channel names follow the pattern:
- Standard objects: `/data/AccountChangeEvent`
- Custom objects: `/data/My_Object__ChangeEvent`

**Apex Trigger on CDC:**

```apex
trigger AccountChangeEventTrigger on AccountChangeEvent (after insert) {
    for (AccountChangeEvent event : Trigger.New) {
        EventBus.ChangeEventHeader header = event.ChangeEventHeader;
        String changeType = header.getChangeType(); // CREATE, UPDATE, DELETE, UNDELETE

        List<String> changedFields = header.getChangedFields();
        List<String> recordIds = header.getRecordIds();

        if (changeType == 'UPDATE' && changedFields.contains('Industry')) {
            // React to Industry field change
            System.debug('Account ' + recordIds[0] + ' industry changed to ' + event.Industry);
        }
    }
}
```

**Change types:** `CREATE`, `UPDATE`, `DELETE`, `UNDELETE`, `GAP_CREATE`, `GAP_UPDATE`, `GAP_DELETE`, `GAP_UNDELETE`, `GAP_OVERFLOW`

### CDC vs Platform Events

| Feature | CDC | Platform Events |
|---------|-----|----------------|
| What fires it | Record DML (automatic) | Your code (manual publish) |
| Payload | Changed fields + header | Custom fields you define |
| Use case | React to data changes | Custom event-driven logic |
| Replay | Yes (72 hours) | Yes (72 hours for HighVolume) |

## Named Credentials

### Create Named Credential Metadata

```xml
<!-- force-app/main/default/namedCredentials/External_API.namedCredential-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<NamedCredential xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>External_API</fullName>
    <label>External API</label>
    <endpoint>https://api.example.com</endpoint>
    <principalType>NamedUser</principalType>
    <protocol>Password</protocol>
    <username>api_user@example.com</username>
    <generateAuthorizationHeader>true</generateAuthorizationHeader>
    <allowMergeFieldsInBody>false</allowMergeFieldsInBody>
    <allowMergeFieldsInHeader>false</allowMergeFieldsInHeader>
</NamedCredential>
```

**Protocol options:**
- `Password` — Basic auth (username + password)
- `Oauth` — OAuth 2.0 flow
- `Jwt` — JWT Bearer Token flow
- `NoAuthentication` — No auth header

Deploy:

```
execute("sf project deploy start --source-dir force-app/main/default/namedCredentials --target-org target-org")
```

### Use Named Credential in Apex Callout

```apex
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:External_API/v1/orders');
req.setMethod('GET');
req.setHeader('Content-Type', 'application/json');

Http http = new Http();
HttpResponse res = http.send(req);

if (res.getStatusCode() == 200) {
    Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    System.debug('Response: ' + result);
} else {
    System.debug('Error: ' + res.getStatusCode() + ' ' + res.getBody());
}
```

The `callout:` prefix tells Salesforce to use the Named Credential for auth and endpoint.

## REST Callout Patterns

### Basic Callout (without Named Credential)

```apex
public class ExternalApiService {
    private static final String BASE_URL = 'https://api.example.com';

    public static Map<String, Object> getOrder(String orderId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(BASE_URL + '/v1/orders/' + EncodingUtil.urlEncode(orderId, 'UTF-8'));
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + getApiToken());
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(30000); // 30 seconds

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        }
        throw new CalloutException('API error: ' + res.getStatusCode() + ' ' + res.getBody());
    }

    public static String createOrder(Map<String, Object> orderData) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(BASE_URL + '/v1/orders');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + getApiToken());
        req.setBody(JSON.serialize(orderData));
        req.setTimeout(30000);

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 201) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            return (String) result.get('id');
        }
        throw new CalloutException('Create failed: ' + res.getStatusCode());
    }

    private static String getApiToken() {
        // Retrieve from Custom Metadata Type or Named Credential
        Api_Config__mdt config = Api_Config__mdt.getInstance('Default');
        return config.Api_Token__c;
    }
}
```

### Mock Callout for Tests

```apex
@isTest
public class ExternalApiServiceTest {

    private class MockHttpResponse implements HttpCalloutMock {
        private Integer statusCode;
        private String body;

        public MockHttpResponse(Integer statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(this.statusCode);
            res.setBody(this.body);
            res.setHeader('Content-Type', 'application/json');
            return res;
        }
    }

    @isTest
    static void testGetOrder_Success() {
        String mockBody = '{"id": "ORD-001", "status": "shipped"}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponse(200, mockBody));

        Test.startTest();
        Map<String, Object> result = ExternalApiService.getOrder('ORD-001');
        Test.stopTest();

        System.assertEquals('ORD-001', result.get('id'));
        System.assertEquals('shipped', result.get('status'));
    }

    @isTest
    static void testGetOrder_Error() {
        Test.setMock(HttpCalloutMock.class, new MockHttpResponse(500, 'Internal Error'));

        Test.startTest();
        try {
            ExternalApiService.getOrder('ORD-001');
            System.assert(false, 'Should have thrown');
        } catch (CalloutException e) {
            System.assert(e.getMessage().contains('500'));
        }
        Test.stopTest();
    }
}
```

### Remote Site Settings

If not using Named Credentials, you must register the endpoint:

```xml
<!-- force-app/main/default/remoteSiteSettings/External_API.remoteSiteSetting-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<RemoteSiteSetting xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>External_API</fullName>
    <isActive>true</isActive>
    <url>https://api.example.com</url>
    <disableProtocolSecurity>false</disableProtocolSecurity>
    <description>External API endpoint</description>
</RemoteSiteSetting>
```

## External Services

External Services let you import an OpenAPI spec and auto-generate Apex actions.

### Setup Steps

1. Register a Named Credential for the external API
2. Go to Setup > External Services
3. Provide the OpenAPI (Swagger) spec URL or paste JSON
4. Salesforce generates invocable Apex actions automatically
5. Use the generated actions in Flows or Apex

### Use in Flow

After registration, External Service actions appear as Flow actions under "External Services" category. Each endpoint becomes a separate action with typed inputs/outputs.

## Outbound Messages (Legacy)

Outbound Messages send SOAP messages when workflow rules fire. Prefer Platform Events for new work.

```xml
<!-- force-app/main/default/workflows/Account.workflow-meta.xml (snippet) -->
<outboundMessages>
    <fullName>Account_Update_Notification</fullName>
    <apiVersion>59.0</apiVersion>
    <endpointUrl>https://api.example.com/sf-webhook</endpointUrl>
    <fields>Id</fields>
    <fields>Name</fields>
    <fields>Industry</fields>
    <includeSessionId>false</includeSessionId>
    <integrationUser>integration@example.com</integrationUser>
    <name>Account Update Notification</name>
    <protected>false</protected>
    <useDeadLetterQueue>true</useDeadLetterQueue>
</outboundMessages>
```

## Error Handling & Troubleshooting

### "Unauthorized endpoint" on callout
- Register the URL as a Remote Site Setting or use Named Credentials
- Check that the Named Credential endpoint URL matches exactly

### Platform Event publish failures
- Check `EventBusSubscriber` for subscriber status
- Query: `SELECT Name, Position, Retries, LastError FROM EventBusSubscriber WHERE Topic = 'Order_Update__e'`
- Retries exhaust after 9 attempts over 26 hours

### CDC events not firing
- Verify CDC is enabled for the object in Setup
- CDC requires appropriate user permissions
- Events fire only for DML, not formula recalculations or workflow field updates

### Callout from trigger error
- Apex triggers cannot make synchronous callouts
- Use `@future(callout=true)` or Queueable with `Database.AllowsCallouts`

### "Read timed out" on callout
- Increase timeout: `req.setTimeout(120000)` (max 120 seconds)
- Consider async processing for slow endpoints
- Implement retry logic with exponential backoff

### Named Credential auth failures
- Check that the auth provider is configured correctly
- For OAuth, verify refresh token is still valid
- Test the endpoint directly with the same credentials
