---
name: Flow Advanced
description: Build complex Salesforce Flows with subflows, error handling, platform events, record-triggered automation, and performance optimization
trigger: When user asks to create a flow, build automation, set up record-triggered flow, handle errors in flows, create subflows, or optimize flow performance
tools_used: execute, write_file, read_file, edit_file
---

# Flow Advanced Skill

Build production-grade Salesforce Flows: record-triggered automation, screen flows, subflow orchestration, error handling, platform events, and performance tuning.

## Prerequisites

Verify org connection:

```
execute("sf org display --target-org dev")
```

Check existing flows:

```
execute("sf data query --query \"SELECT Id, MasterLabel, ProcessType, Status, VersionNumber FROM FlowDefinitionView ORDER BY MasterLabel\" --target-org dev --result-format table")
```

## Workflow

### Step 1: Determine Flow Type

Choose the right flow type for the use case:

| Flow Type | Trigger | Use Case | Runs As |
|-----------|---------|----------|---------|
| **Record-Triggered** | DML on a record | Automations on create/update/delete | System context |
| **Screen Flow** | User interaction | Wizards, guided processes, input forms | User context |
| **Autolaunched** | Called by code/flow | Reusable logic, subflows, process builder migration | System or User context |
| **Scheduled** | Time-based | Batch processing, recurring tasks | System context |
| **Platform Event-Triggered** | Platform event | Event-driven architecture, async processing | System context |

### Step 2: Record-Triggered Flow

Create a record-triggered flow in metadata XML:

```xml
<!-- force-app/main/default/flows/Account_After_Update.flow-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <apiVersion>62.0</apiVersion>
    <label>Account After Update</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Active</status>
    <triggerType>RecordAfterSave</triggerType>
    <objectType>Account</objectType>
    <triggerOrder>1</triggerOrder>

    <!-- Entry conditions: only fire when Industry changes -->
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference>Check_Industry</targetReference>
        </connector>
        <filterLogic>and</filterLogic>
        <filters>
            <field>Industry</field>
            <operator>IsChanged</operator>
            <value>
                <booleanValue>true</booleanValue>
            </value>
        </filters>
        <recordTriggerType>Update</recordTriggerType>
    </start>

    <!-- Decision element -->
    <decisions>
        <name>Check_Industry</name>
        <label>Check Industry</label>
        <locationX>176</locationX>
        <locationY>158</locationY>
        <defaultConnectorLabel>Other Industry</defaultConnectorLabel>
        <defaultConnector>
            <targetReference>Default_Assignment</targetReference>
        </defaultConnector>
        <rules>
            <name>Is_Technology</name>
            <conditionLogic>and</conditionLogic>
            <conditions>
                <leftValueReference>$Record.Industry</leftValueReference>
                <operator>EqualTo</operator>
                <rightValue>
                    <stringValue>Technology</stringValue>
                </rightValue>
            </conditions>
            <connector>
                <targetReference>Update_Tech_Fields</targetReference>
            </connector>
            <label>Is Technology</label>
        </rules>
    </decisions>

    <!-- Assignment for tech accounts -->
    <assignments>
        <name>Update_Tech_Fields</name>
        <label>Update Tech Fields</label>
        <locationX>176</locationX>
        <locationY>300</locationY>
        <assignmentItems>
            <assignToReference>$Record.Description</assignToReference>
            <operator>Assign</operator>
            <value>
                <stringValue>Technology sector account - auto-classified</stringValue>
            </value>
        </assignmentItems>
    </assignments>

    <assignments>
        <name>Default_Assignment</name>
        <label>Default Assignment</label>
        <locationX>400</locationX>
        <locationY>300</locationY>
        <assignmentItems>
            <assignToReference>$Record.Description</assignToReference>
            <operator>Assign</operator>
            <value>
                <stringValue>General account</stringValue>
            </value>
        </assignmentItems>
    </assignments>
</Flow>
```

Deploy:

```
execute("sf project deploy start --source-dir force-app/main/default/flows/Account_After_Update.flow-meta.xml --target-org dev")
```

### Step 3: Screen Flow with Input/Output

Create an interactive screen flow:

```xml
<!-- force-app/main/default/flows/Create_Case_Wizard.flow-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <apiVersion>62.0</apiVersion>
    <label>Create Case Wizard</label>
    <processType>Flow</processType>
    <status>Active</status>

    <!-- Input variable (passed from LWC or Quick Action) -->
    <variables>
        <name>inputAccountId</name>
        <dataType>String</dataType>
        <isInput>true</isInput>
        <isOutput>false</isOutput>
    </variables>

    <!-- Output variable -->
    <variables>
        <name>outputCaseId</name>
        <dataType>String</dataType>
        <isInput>false</isInput>
        <isOutput>true</isOutput>
    </variables>

    <variables>
        <name>caseRecord</name>
        <dataType>SObject</dataType>
        <objectType>Case</objectType>
        <isInput>false</isInput>
        <isOutput>false</isOutput>
    </variables>

    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference>Case_Input_Screen</targetReference>
        </connector>
    </start>

    <!-- Screen: Collect case details -->
    <screens>
        <name>Case_Input_Screen</name>
        <label>Case Details</label>
        <locationX>176</locationX>
        <locationY>158</locationY>
        <connector>
            <targetReference>Create_Case_Record</targetReference>
        </connector>
        <fields>
            <name>Subject_Input</name>
            <fieldType>InputField</fieldType>
            <fieldText>Subject</fieldText>
            <isRequired>true</isRequired>
            <dataType>String</dataType>
        </fields>
        <fields>
            <name>Description_Input</name>
            <fieldType>LargeTextArea</fieldType>
            <fieldText>Description</fieldText>
            <isRequired>false</isRequired>
        </fields>
        <fields>
            <name>Priority_Input</name>
            <fieldType>DropdownBox</fieldType>
            <fieldText>Priority</fieldText>
            <isRequired>true</isRequired>
            <choiceReferences>Priority_Choices</choiceReferences>
        </fields>
    </screens>

    <!-- Picklist choices -->
    <choices>
        <name>Priority_Choices</name>
        <choiceText>Low</choiceText>
        <dataType>String</dataType>
        <value>
            <stringValue>Low</stringValue>
        </value>
    </choices>

    <!-- Create the case record -->
    <recordCreates>
        <name>Create_Case_Record</name>
        <label>Create Case</label>
        <locationX>176</locationX>
        <locationY>300</locationY>
        <connector>
            <targetReference>Confirmation_Screen</targetReference>
        </connector>
        <faultConnector>
            <targetReference>Error_Screen</targetReference>
        </faultConnector>
        <inputAssignments>
            <field>Subject</field>
            <value>
                <elementReference>Subject_Input</elementReference>
            </value>
        </inputAssignments>
        <inputAssignments>
            <field>Description</field>
            <value>
                <elementReference>Description_Input</elementReference>
            </value>
        </inputAssignments>
        <inputAssignments>
            <field>AccountId</field>
            <value>
                <elementReference>inputAccountId</elementReference>
            </value>
        </inputAssignments>
        <inputAssignments>
            <field>Status</field>
            <value>
                <stringValue>New</stringValue>
            </value>
        </inputAssignments>
        <object>Case</object>
        <storeOutputAutomatically>true</storeOutputAutomatically>
    </recordCreates>

    <!-- Success screen -->
    <screens>
        <name>Confirmation_Screen</name>
        <label>Success</label>
        <locationX>176</locationX>
        <locationY>450</locationY>
        <fields>
            <name>Success_Message</name>
            <fieldType>DisplayText</fieldType>
            <fieldText>&lt;p&gt;Case created successfully!&lt;/p&gt;&lt;p&gt;Case Number: {!Create_Case_Record}&lt;/p&gt;</fieldText>
        </fields>
    </screens>

    <!-- Error screen (fault path) -->
    <screens>
        <name>Error_Screen</name>
        <label>Error</label>
        <locationX>400</locationX>
        <locationY>450</locationY>
        <fields>
            <name>Error_Message</name>
            <fieldType>DisplayText</fieldType>
            <fieldText>&lt;p&gt;&lt;b&gt;Error:&lt;/b&gt; {!$Flow.FaultMessage}&lt;/p&gt;&lt;p&gt;Please contact your administrator.&lt;/p&gt;</fieldText>
        </fields>
    </screens>
</Flow>
```

### Step 4: Subflow Pattern (Reusable Logic)

Create a reusable subflow:

```xml
<!-- force-app/main/default/flows/Send_Notification_Subflow.flow-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <apiVersion>62.0</apiVersion>
    <label>Send Notification Subflow</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Active</status>

    <!-- Input variables -->
    <variables>
        <name>recipientUserId</name>
        <dataType>String</dataType>
        <isInput>true</isInput>
    </variables>
    <variables>
        <name>notificationTitle</name>
        <dataType>String</dataType>
        <isInput>true</isInput>
    </variables>
    <variables>
        <name>notificationBody</name>
        <dataType>String</dataType>
        <isInput>true</isInput>
    </variables>
    <variables>
        <name>targetRecordId</name>
        <dataType>String</dataType>
        <isInput>true</isInput>
    </variables>

    <!-- Output: success/failure -->
    <variables>
        <name>isSuccess</name>
        <dataType>Boolean</dataType>
        <isOutput>true</isOutput>
        <value>
            <booleanValue>false</booleanValue>
        </value>
    </variables>

    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference>Send_Custom_Notification</targetReference>
        </connector>
    </start>

    <actionCalls>
        <name>Send_Custom_Notification</name>
        <label>Send Custom Notification</label>
        <locationX>176</locationX>
        <locationY>158</locationY>
        <actionName>customNotificationAction</actionName>
        <actionType>customNotificationAction</actionType>
        <connector>
            <targetReference>Set_Success</targetReference>
        </connector>
        <faultConnector>
            <targetReference>Log_Error</targetReference>
        </faultConnector>
        <inputParameters>
            <name>customNotifTypeId</name>
            <value>
                <elementReference>notificationTypeId</elementReference>
            </value>
        </inputParameters>
        <inputParameters>
            <name>recipientIds</name>
            <value>
                <elementReference>recipientUserId</elementReference>
            </value>
        </inputParameters>
        <inputParameters>
            <name>title</name>
            <value>
                <elementReference>notificationTitle</elementReference>
            </value>
        </inputParameters>
        <inputParameters>
            <name>body</name>
            <value>
                <elementReference>notificationBody</elementReference>
            </value>
        </inputParameters>
        <inputParameters>
            <name>targetId</name>
            <value>
                <elementReference>targetRecordId</elementReference>
            </value>
        </inputParameters>
    </actionCalls>

    <assignments>
        <name>Set_Success</name>
        <label>Set Success</label>
        <locationX>176</locationX>
        <locationY>300</locationY>
        <assignmentItems>
            <assignToReference>isSuccess</assignToReference>
            <operator>Assign</operator>
            <value>
                <booleanValue>true</booleanValue>
            </value>
        </assignmentItems>
    </assignments>

    <assignments>
        <name>Log_Error</name>
        <label>Log Error</label>
        <locationX>400</locationX>
        <locationY>300</locationY>
        <assignmentItems>
            <assignToReference>isSuccess</assignToReference>
            <operator>Assign</operator>
            <value>
                <booleanValue>false</booleanValue>
            </value>
        </assignmentItems>
    </assignments>
</Flow>
```

Call the subflow from a parent flow using the `subflows` element:

```xml
<subflows>
    <name>Call_Notification_Subflow</name>
    <label>Send Notification</label>
    <flowName>Send_Notification_Subflow</flowName>
    <inputAssignments>
        <name>recipientUserId</name>
        <value>
            <elementReference>ownerUserId</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <name>notificationTitle</name>
        <value>
            <stringValue>Record Updated</stringValue>
        </value>
    </inputAssignments>
    <outputAssignments>
        <assignToReference>notificationSent</assignToReference>
        <name>isSuccess</name>
    </outputAssignments>
</subflows>
```

### Step 5: Error Handling in Flows

Every DML and action element should have a fault connector:

**Pattern: Fault path with logging**

1. Connect the element's fault connector to an error-handling path
2. Use `$Flow.FaultMessage` to capture the error message
3. Create a custom object record for error logging or use Platform Events

**Error logging via Platform Event:**

```xml
<!-- Create a platform event for error tracking -->
<!-- force-app/main/default/objects/Flow_Error__e/Flow_Error__e.object-meta.xml -->
```

```xml
<recordCreates>
    <name>Log_Flow_Error</name>
    <label>Log Flow Error</label>
    <inputAssignments>
        <field>Error_Message__c</field>
        <value>
            <elementReference>$Flow.FaultMessage</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>Flow_Name__c</field>
        <value>
            <stringValue>Account_After_Update</stringValue>
        </value>
    </inputAssignments>
    <object>Flow_Error__e</object>
</recordCreates>
```

### Step 6: Flow Governor Limits

Be aware of flow-specific limits:

| Limit | Value | Mitigation |
|-------|-------|------------|
| Executed elements per flow interview | 2,000 | Avoid large loops; use Apex for complex iteration |
| Total elements per flow | 2,000 | Break into subflows |
| SOQL queries (combined with Apex) | 100 | Minimize Get Records elements; combine queries |
| DML statements | 150 | Batch updates with Collection variables |
| Scheduled paths per object | 1 trigger flow | Combine scheduled logic into one flow |
| Versions per flow | 50 | Delete old inactive versions |

### Step 7: Flow Performance Best Practices

1. **Use `$Record` for trigger context** — avoid Get Records for the triggering record
2. **Minimize Get Records elements** — each one counts as a SOQL query
3. **Use "Only the first record" option** when you need a single result
4. **Bulkify**: Flows are automatically bulkified, but avoid per-record subflows in loops
5. **Entry conditions**: Filter early to avoid unnecessary processing
6. **Scheduled paths**: Use for time-delayed actions instead of time-based workflows

### Step 8: Testing Flows

Test flows by triggering the DML that invokes them:

```apex
@isTest
private class AccountFlowTest {
    @isTest
    static void testRecordTriggeredFlow() {
        Account acc = new Account(Name = 'Flow Test', Industry = 'Finance');
        insert acc;

        Test.startTest();
        acc.Industry = 'Technology';
        update acc;
        Test.stopTest();

        Account result = [SELECT Description FROM Account WHERE Id = :acc.Id];
        System.assertEquals('Technology sector account - auto-classified', result.Description);
    }

    @isTest
    static void testFlowBulk() {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 200; i++) {
            accounts.add(new Account(Name = 'Bulk Test ' + i, Industry = 'Finance'));
        }
        insert accounts;

        Test.startTest();
        for (Account a : accounts) {
            a.Industry = 'Technology';
        }
        update accounts;
        Test.stopTest();

        List<Account> results = [SELECT Description FROM Account WHERE Name LIKE 'Bulk Test%'];
        for (Account a : results) {
            System.assertEquals('Technology sector account - auto-classified', a.Description);
        }
    }
}
```

Deploy and run tests:

```
execute("sf project deploy start --source-dir force-app/main/default/flows --target-org dev")
execute("sf apex run test --class-names AccountFlowTest --wait 10 --target-org dev")
```

### Step 9: Activate and Monitor

Activate the flow:

```
execute("sf data query --query \"SELECT Id, ActiveVersionId, LatestVersionId FROM FlowDefinition WHERE DeveloperName = 'Account_After_Update'\" --target-org dev --result-format json")
```

Monitor flow execution:

```
execute("sf data query --query \"SELECT Id, FlowVersionView.FlowLabel, Status, InterviewStartTimestamp FROM FlowInterview WHERE Status = 'Error' ORDER BY InterviewStartTimestamp DESC LIMIT 20\" --target-org dev --result-format table")
```

## Error Handling & Troubleshooting

### "FLOW_ELEMENT_LIMIT_EXCEEDED"
- Flow has exceeded 2,000 executed elements
- Move loop logic to Apex (invocable action)
- Break flow into subflows to stay under limits
- Reduce iteration count by filtering data before the loop

### "FLOW_EXCEPTION: An unhandled fault has occurred"
- Add fault connectors to all DML and action elements
- Log `$Flow.FaultMessage` for debugging
- Check debug logs for the full stack trace

### "The flow isn't valid" on activation
- Check for disconnected elements (orphaned nodes)
- Verify all required inputs have values
- Ensure all variable references point to existing variables

### Record-triggered flow fires multiple times
- Check for recursion: flow updates the record, which re-triggers the flow
- Use entry conditions to prevent re-entry (e.g., check if field is already set)
- Set `triggerOrder` to control execution sequence

### Flow runs in wrong context (system vs user)
- Record-triggered flows run in system context by default
- Screen flows run in user context
- Use "Run flow as" settings to control context
- Add CRUD/FLS checks manually if running in system context

### "This flow can't be saved" in Flow Builder
- Check for circular references between elements
- Verify all element API names are unique
- Remove unused variables and resources
- Save incrementally — add elements one at a time to isolate the issue
