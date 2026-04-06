/**
 * Common Salesforce metadata XML patterns for the agent to reference
 * when creating or modifying org configuration.
 *
 * Key rule: always create metadata XML and deploy — don't use
 * anonymous Apex for org configuration.
 */

export const SF_METADATA_PATTERNS_PROMPT = `# Salesforce Metadata XML Patterns — Quick Reference

## Golden Rule

**Always create metadata XML files and deploy them.** Never use Anonymous Apex to create objects, fields, validation rules, or permission sets. Metadata-driven changes are trackable, version-controlled, and repeatable.

## Workflow: Describe → Write → Deploy → Verify

1. **Describe** the target object first to see existing fields and avoid duplicates
2. **Write** the metadata XML file to the correct path under force-app/
3. **Deploy** with \`sf project deploy start --source-dir <path>\`
4. **Verify** with \`sf sobject describe\` or SOQL query

## Custom Object

Path: \`force-app/main/default/objects/My_Object__c/My_Object__c.object-meta.xml\`

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>My Object</label>
    <pluralLabel>My Objects</pluralLabel>
    <nameField>
        <label>Name</label>
        <type>Text</type>
    </nameField>
    <deploymentStatus>Deployed</deploymentStatus>
    <sharingModel>ReadWrite</sharingModel>
    <enableActivities>true</enableActivities>
    <enableHistory>true</enableHistory>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
</CustomObject>
\`\`\`

For auto-number names, replace nameField with:
\`\`\`xml
<nameField>
    <label>Auto Number</label>
    <type>AutoNumber</type>
    <displayFormat>REC-{00000}</displayFormat>
    <startingNumber>1</startingNumber>
</nameField>
\`\`\`

## Custom Fields (Common Types)

Path: \`force-app/main/default/objects/My_Object__c/fields/My_Field__c.field-meta.xml\`

### Text
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>My_Field__c</fullName>
    <label>My Field</label>
    <type>Text</type>
    <length>255</length>
</CustomField>
\`\`\`

### Number
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Amount__c</fullName>
    <label>Amount</label>
    <type>Number</type>
    <precision>18</precision>
    <scale>2</scale>
</CustomField>
\`\`\`

### Currency
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Price__c</fullName>
    <label>Price</label>
    <type>Currency</type>
    <precision>18</precision>
    <scale>2</scale>
</CustomField>
\`\`\`

### Checkbox
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Is_Active__c</fullName>
    <label>Is Active</label>
    <type>Checkbox</type>
    <defaultValue>false</defaultValue>
</CustomField>
\`\`\`

### Date / DateTime
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Due_Date__c</fullName>
    <label>Due Date</label>
    <type>Date</type>
</CustomField>
\`\`\`

### Picklist
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Status__c</fullName>
    <label>Status</label>
    <type>Picklist</type>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value><fullName>New</fullName><default>true</default><label>New</label></value>
            <value><fullName>Active</fullName><default>false</default><label>Active</label></value>
            <value><fullName>Closed</fullName><default>false</default><label>Closed</label></value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
\`\`\`

#### Global Value Set Reference
\`\`\`xml
<valueSet>
    <valueSetName>MyGlobalValueSet</valueSetName>
</valueSet>
\`\`\`
Use Global Value Sets when the same picklist values are shared across multiple objects.

### Lookup
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Account__c</fullName>
    <label>Account</label>
    <type>Lookup</type>
    <referenceTo>Account</referenceTo>
    <relationshipLabel>My Objects</relationshipLabel>
    <relationshipName>My_Objects</relationshipName>
    <deleteConstraint>SetNull</deleteConstraint>
</CustomField>
\`\`\`

### Master-Detail
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Parent__c</fullName>
    <label>Parent</label>
    <type>MasterDetail</type>
    <referenceTo>Parent_Object__c</referenceTo>
    <relationshipLabel>Children</relationshipLabel>
    <relationshipName>Children</relationshipName>
    <relationshipOrder>0</relationshipOrder>
</CustomField>
\`\`\`

### Long Text Area
\`\`\`xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Notes__c</fullName>
    <label>Notes</label>
    <type>LongTextArea</type>
    <length>32768</length>
    <visibleLines>6</visibleLines>
</CustomField>
\`\`\`

### Record Types
\`\`\`xml
<!-- force-app/main/default/objects/Account/recordTypes/Customer.recordType-meta.xml -->
<RecordType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Customer</fullName>
    <active>true</active>
    <label>Customer</label>
</RecordType>
\`\`\`

### Custom Metadata Types
\`\`\`xml
<!-- force-app/main/default/customMetadata/App_Config.Default.md-meta.xml -->
<CustomMetadata xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>Default</label>
    <protected>false</protected>
    <values>
        <field>Setting_Value__c</field>
        <value xsi:type="xsd:string">production</value>
    </values>
</CustomMetadata>
\`\`\`
Custom Metadata Types are deployable and accessible in Apex, Flows, and validation rules without SOQL queries.

## Validation Rule

Path: \`force-app/main/default/objects/My_Object__c/validationRules/My_Rule.validationRule-meta.xml\`

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>My_Rule</fullName>
    <active>true</active>
    <errorConditionFormula>ISBLANK(Required_Field__c)</errorConditionFormula>
    <errorDisplayField>Required_Field__c</errorDisplayField>
    <errorMessage>This field is required.</errorMessage>
</ValidationRule>
\`\`\`

## Permission Set

Path: \`force-app/main/default/permissionsets/My_PermSet.permissionset-meta.xml\`

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>My Permission Set</label>
    <description>Access to My Object</description>
    <hasActivationRequired>false</hasActivationRequired>
    <objectPermissions>
        <object>My_Object__c</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
        <allowEdit>true</allowEdit>
        <allowDelete>false</allowDelete>
        <viewAllRecords>false</viewAllRecords>
        <modifyAllRecords>false</modifyAllRecords>
    </objectPermissions>
    <fieldPermissions>
        <field>My_Object__c.My_Field__c</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
</PermissionSet>
\`\`\`

## Deployment Order

Always deploy in this order to avoid dependency errors:

1. Custom objects (object-meta.xml)
2. Custom fields
3. Validation rules
4. Record types
5. Page layouts
6. Permission sets and permission set groups
7. Profiles (if needed)

## Common Deploy Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot find object" | Object not deployed yet | Deploy object first |
| "Duplicate value" | Metadata already exists | Note: The \`--ignore-conflicts\` flag behavior varies by sf CLI version. If it fails, use \`sf project deploy start --source-dir force-app\` for a full deploy instead. |
| "Invalid field in formula" | Field not deployed yet | Deploy fields before validation rules |
| "References non-existent field" | Layout references missing field | Deploy fields before layouts |
| "FIELD_INTEGRITY_EXCEPTION" | Wrong field API name in perm set | Check exact API name with describe |
`;
