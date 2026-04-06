/**
 * Salesforce integration patterns prompt — Platform Events, CDC,
 * Named Credentials, callout patterns, and decision tree.
 */

export const SF_INTEGRATION_PROMPT = `# Salesforce Integration Patterns — Quick Reference

## Integration Decision Tree

Choose the right integration method:

| Need | Method |
|------|--------|
| Real-time outbound REST call | Named Credential + Apex HttpRequest |
| Async event-driven (fire & forget) | Platform Events |
| React to record DML externally | Change Data Capture (CDC) |
| Import REST API as invocable actions | External Services |
| Simple SOAP notification | Outbound Messages (legacy — prefer Platform Events) |
| Bidirectional real-time sync | Platform Events + Named Credentials |
| High-volume inbound data load | Bulk API / MuleSoft |

## Platform Events

### Create Event Metadata
- Object file: \`force-app/main/default/objects/My_Event__e/My_Event__e.object-meta.xml\`
- Set \`<eventType>HighVolume</eventType>\` (the only supported event type — StandardVolume is deprecated)
- Set \`<publishBehavior>PublishAfterCommit</publishBehavior>\` for transactional safety

### Publish from Apex
\`\`\`apex
My_Event__e evt = new My_Event__e(Field__c = 'value');
Database.SaveResult sr = EventBus.publish(evt);
if (!sr.isSuccess()) {
    // handle error — check sr.getErrors()
}
\`\`\`

### Subscribe Options
- **Apex trigger:** \`trigger MyTrigger on My_Event__e (after insert) { ... }\`
- **Flow:** Platform Event-Triggered Flow (select the __e object)
- **LWC:** Import from \`lightning/empApi\`, subscribe to \`/event/My_Event__e\`

### Key Limits (HighVolume Only)
- Stored for 96 hours (replay window), supports replay
- No daily event limit for Enterprise+ (supports 500K+ events daily)
- Max event size: 1 MB

## Change Data Capture (CDC)

### Enable
Setup > Change Data Capture > select objects > Save.

### Channel Names
- Standard: \`/data/AccountChangeEvent\`
- Custom: \`/data/My_Object__ChangeEvent\`

### Subscribe from Apex Trigger
\`\`\`apex
trigger AccountCDC on AccountChangeEvent (after insert) {
    for (AccountChangeEvent evt : Trigger.New) {
        EventBus.ChangeEventHeader header = evt.ChangeEventHeader;
        String changeType = header.getChangeType(); // CREATE, UPDATE, DELETE, UNDELETE
        List<String> changedFields = header.getChangedFields();
        List<String> recordIds = header.getRecordIds();
    }
}
\`\`\`

### CDC vs Platform Events
- CDC fires automatically on record DML — no code needed to publish
- Platform Events fire only when your code explicitly publishes
- CDC payload = changed fields; Platform Event payload = custom fields you define
- Use CDC to react to data changes; use Platform Events for custom event-driven logic

## Named Credentials

### When to Use
Always use Named Credentials for external callouts — they handle auth, endpoint management, and credential rotation without code changes.

### Metadata Structure
\`\`\`xml
<NamedCredential xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>External_API</fullName>
    <label>External API</label>
    <endpoint>https://api.example.com</endpoint>
    <principalType>NamedUser</principalType>
    <protocol>Password</protocol>
    <generateAuthorizationHeader>true</generateAuthorizationHeader>
</NamedCredential>
\`\`\`

### Protocol Options
- \`Password\` — Basic auth
- \`Oauth\` — OAuth 2.0 flow (requires Auth Provider)
- \`Jwt\` — JWT Bearer Token
- \`NoAuthentication\` — No auth header

### Use in Apex
\`\`\`apex
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:External_API/v1/resource');
req.setMethod('GET');
HttpResponse res = new Http().send(req);
\`\`\`

The \`callout:\` prefix tells Salesforce to inject auth from the Named Credential.

## REST Callout Patterns

### Standard Pattern
\`\`\`apex
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:My_Credential/v1/endpoint');
req.setMethod('POST');
req.setHeader('Content-Type', 'application/json');
req.setBody(JSON.serialize(payload));
req.setTimeout(30000); // 30 sec max for sync, 120 sec max overall
HttpResponse res = new Http().send(req);
\`\`\`

### Callout Rules
- No callouts from synchronous triggers — use \`@future(callout=true)\` or Queueable
- Max timeout: 120 seconds
- Max callouts per transaction: 100
- Max response size: 12 MB (6 MB for synchronous Apex)
- Always register endpoint as Remote Site Setting if not using Named Credential

### Test with HttpCalloutMock
\`\`\`apex
@isTest
static void testCallout() {
    Test.setMock(HttpCalloutMock.class, new MyMock());
    // invoke code that makes callout
}

private class MyMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
        HttpResponse res = new HttpResponse();
        res.setStatusCode(200);
        res.setBody('{"status": "ok"}');
        return res;
    }
}
\`\`\`

### Multi-Callout Mock (StaticResourceCalloutMock)
\`\`\`apex
StaticResourceCalloutMock mock = new StaticResourceCalloutMock();
mock.setStaticResource('MyTestResource');
mock.setStatusCode(200);
mock.setHeader('Content-Type', 'application/json');
Test.setMock(HttpCalloutMock.class, mock);
\`\`\`

## External Services

### Setup Flow
1. Create Named Credential for the API
2. Setup > External Services > New
3. Provide OpenAPI spec (URL or paste JSON/YAML)
4. Salesforce auto-generates invocable Apex actions
5. Use generated actions in Flows under "External Services" category

### When to Use
- External REST API with a clean OpenAPI spec
- Want Flow-accessible actions without writing Apex
- Simple CRUD-style API operations

### When NOT to Use
- Complex response parsing needed
- API requires custom auth beyond Named Credential protocols
- Need fine-grained error handling

## Common Gotchas

1. **Callouts in triggers**: Not allowed synchronously. Use \`@future(callout=true)\` or Queueable with \`Database.AllowsCallouts\`
2. **Mixed DML + callout**: Cannot do DML then callout in same transaction. Separate into async
3. **Platform Event in test**: Use \`Test.getEventBus().deliver()\` to force event delivery in tests
4. **CDC in test**: CDC events don't fire in test context — mock the behavior
5. **Named Credential password rotation**: Update in Setup > Named Credentials, no code change needed
6. **Timeout defaults**: HttpRequest default timeout is 10 seconds — always set explicitly
7. **Bulk callouts**: If processing a list, batch into fewer calls (respect 100-callout-per-txn limit)
`;
