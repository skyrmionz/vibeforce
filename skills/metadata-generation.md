---
name: Metadata Generation
description: Create Salesforce metadata XML for custom objects, fields, validation rules, page layouts, record types, and permission sets — then deploy and verify
trigger: When user asks to create custom objects, custom fields, validation rules, page layouts, record types, permission sets, or any metadata XML for a Salesforce org
tools_used: execute, write_file, read_file, edit_file
---

# Metadata Generation Skill

Create Salesforce metadata XML from requirements, deploy it, and verify. Covers custom objects, all field types, validation rules, page layouts, record types, and permission sets.

## Prerequisites

Verify org connection and project structure:

```
execute("sf org display --target-org target-org")
execute("ls force-app/main/default/objects")
```

Ensure a valid `sfdx-project.json` exists:

```
execute("cat sfdx-project.json")
```

## Workflow

### Step 1: Describe Before Creating

Always describe an object before adding fields to it. This prevents duplicates and reveals existing field API names:

```
execute("sf sobject describe --sobject Account --target-org target-org")
```

For custom objects, check if it already exists:

```
execute("sf data query --query \"SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName = 'My_Object__c'\" --target-org target-org --result-format json")
```

### Step 2: Custom Object Creation

Full custom object XML with all standard options:

```xml
<!-- force-app/main/default/objects/Booking__c/Booking__c.object-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>Booking</label>
    <pluralLabel>Bookings</pluralLabel>
    <nameField>
        <label>Booking Name</label>
        <type>AutoNumber</type>
        <displayFormat>BK-{00000}</displayFormat>
        <startingNumber>1</startingNumber>
    </nameField>
    <deploymentStatus>Deployed</deploymentStatus>
    <sharingModel>ReadWrite</sharingModel>
    <enableActivities>true</enableActivities>
    <enableBulkApi>true</enableBulkApi>
    <enableFeeds>false</enableFeeds>
    <enableHistory>true</enableHistory>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
    <enableSharing>true</enableSharing>
    <enableStreamingApi>true</enableStreamingApi>
    <description>Tracks customer bookings</description>
</CustomObject>
```

**Name field options:**
- `Text` — user enters free text (default)
- `AutoNumber` — system auto-generates (requires `displayFormat` and `startingNumber`)

Deploy:

```
execute("sf project deploy start --source-dir force-app/main/default/objects/Booking__c --target-org target-org")
```

### Step 3: Custom Field Creation — All Field Types

Each field goes in `force-app/main/default/objects/<Object>/fields/<FieldName>.field-meta.xml`.

**Text Field:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Short_Description__c</fullName>
    <label>Short Description</label>
    <type>Text</type>
    <length>255</length>
    <required>false</required>
    <unique>false</unique>
    <externalId>false</externalId>
</CustomField>
```

**Long Text Area:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Detailed_Notes__c</fullName>
    <label>Detailed Notes</label>
    <type>LongTextArea</type>
    <length>32768</length>
    <visibleLines>6</visibleLines>
</CustomField>
```

**Rich Text Area:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Rich_Description__c</fullName>
    <label>Rich Description</label>
    <type>Html</type>
    <length>32768</length>
    <visibleLines>10</visibleLines>
</CustomField>
```

**Number:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Quantity__c</fullName>
    <label>Quantity</label>
    <type>Number</type>
    <precision>18</precision>
    <scale>0</scale>
    <required>true</required>
    <defaultValue>1</defaultValue>
</CustomField>
```

**Currency:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Total_Price__c</fullName>
    <label>Total Price</label>
    <type>Currency</type>
    <precision>18</precision>
    <scale>2</scale>
</CustomField>
```

**Percent:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Discount_Rate__c</fullName>
    <label>Discount Rate</label>
    <type>Percent</type>
    <precision>5</precision>
    <scale>2</scale>
</CustomField>
```

**Date:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Start_Date__c</fullName>
    <label>Start Date</label>
    <type>Date</type>
    <required>true</required>
</CustomField>
```

**DateTime:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Check_In_Time__c</fullName>
    <label>Check In Time</label>
    <type>DateTime</type>
</CustomField>
```

**Checkbox:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Is_Active__c</fullName>
    <label>Is Active</label>
    <type>Checkbox</type>
    <defaultValue>true</defaultValue>
</CustomField>
```

**Picklist:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Status__c</fullName>
    <label>Status</label>
    <type>Picklist</type>
    <required>false</required>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value>
                <fullName>Draft</fullName>
                <default>true</default>
                <label>Draft</label>
            </value>
            <value>
                <fullName>Active</fullName>
                <default>false</default>
                <label>Active</label>
            </value>
            <value>
                <fullName>Closed</fullName>
                <default>false</default>
                <label>Closed</label>
            </value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

**Multi-Select Picklist:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Categories__c</fullName>
    <label>Categories</label>
    <type>MultiselectPicklist</type>
    <visibleLines>4</visibleLines>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value><fullName>Sales</fullName><default>false</default><label>Sales</label></value>
            <value><fullName>Support</fullName><default>false</default><label>Support</label></value>
            <value><fullName>Marketing</fullName><default>false</default><label>Marketing</label></value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

**Lookup Relationship:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Related_Account__c</fullName>
    <label>Related Account</label>
    <type>Lookup</type>
    <referenceTo>Account</referenceTo>
    <relationshipLabel>Bookings</relationshipLabel>
    <relationshipName>Bookings</relationshipName>
    <deleteConstraint>SetNull</deleteConstraint>
</CustomField>
```

**Master-Detail Relationship:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Parent_Booking__c</fullName>
    <label>Parent Booking</label>
    <type>MasterDetail</type>
    <referenceTo>Booking__c</referenceTo>
    <relationshipLabel>Child Bookings</relationshipLabel>
    <relationshipName>Child_Bookings</relationshipName>
    <relationshipOrder>0</relationshipOrder>
    <reparentableMasterDetail>false</reparentableMasterDetail>
    <writeRequiresMasterRead>false</writeRequiresMasterRead>
</CustomField>
```

**Formula Field:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Days_Until_Start__c</fullName>
    <label>Days Until Start</label>
    <type>Number</type>
    <precision>18</precision>
    <scale>0</scale>
    <formula>Start_Date__c - TODAY()</formula>
    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>
</CustomField>
```

**Roll-Up Summary (only on master-detail parent):**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Total_Booking_Value__c</fullName>
    <label>Total Booking Value</label>
    <type>Summary</type>
    <summarizedField>Booking_Line__c.Amount__c</summarizedField>
    <summaryForeignKey>Booking_Line__c.Booking__c</summaryForeignKey>
    <summaryOperation>sum</summaryOperation>
</CustomField>
```

**Email:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Notification_Email__c</fullName>
    <label>Notification Email</label>
    <type>Email</type>
    <unique>false</unique>
</CustomField>
```

**Phone:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Alt_Phone__c</fullName>
    <label>Alternate Phone</label>
    <type>Phone</type>
</CustomField>
```

**URL:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Website_Link__c</fullName>
    <label>Website Link</label>
    <type>Url</type>
</CustomField>
```

**External ID Text:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>External_Key__c</fullName>
    <label>External Key</label>
    <type>Text</type>
    <length>50</length>
    <externalId>true</externalId>
    <unique>true</unique>
    <caseSensitive>false</caseSensitive>
</CustomField>
```

**Encrypted Text:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>SSN__c</fullName>
    <label>SSN</label>
    <type>EncryptedText</type>
    <length>20</length>
    <maskChar>asterisk</maskChar>
    <maskType>lastFour</maskType>
</CustomField>
```

**Geolocation:**

```xml
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Location__c</fullName>
    <label>Location</label>
    <type>Location</type>
    <displayLocationInDecimal>true</displayLocationInDecimal>
    <scale>6</scale>
</CustomField>
```

### Step 4: Validation Rules

```xml
<!-- force-app/main/default/objects/Booking__c/validationRules/Require_Start_Before_End.validationRule-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Require_Start_Before_End</fullName>
    <active>true</active>
    <description>Start date must be before end date</description>
    <errorConditionFormula>
        AND(
            NOT(ISBLANK(Start_Date__c)),
            NOT(ISBLANK(End_Date__c)),
            Start_Date__c >= End_Date__c
        )
    </errorConditionFormula>
    <errorDisplayField>End_Date__c</errorDisplayField>
    <errorMessage>End date must be after the start date.</errorMessage>
</ValidationRule>
```

**Common validation formula patterns:**

```
// Require field when checkbox is true
AND(Is_Active__c, ISBLANK(Notification_Email__c))

// Email format validation
AND(
    NOT(ISBLANK(Notification_Email__c)),
    NOT(REGEX(Notification_Email__c, "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"))
)

// Prevent past dates
Start_Date__c < TODAY()

// Cross-object validation
AND(
    ISPICKVAL(Status__c, "Closed"),
    Related_Account__c = null
)

// Restrict picklist transitions (only allow Draft → Active → Closed)
AND(
    ISCHANGED(Status__c),
    OR(
        AND(ISPICKVAL(PRIORVALUE(Status__c), "Active"), ISPICKVAL(Status__c, "Draft")),
        AND(ISPICKVAL(PRIORVALUE(Status__c), "Closed"), NOT(ISPICKVAL(Status__c, "Closed")))
    )
)
```

### Step 5: Page Layout Modifications

```xml
<!-- force-app/main/default/layouts/Booking__c-Booking Layout.layout-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Layout xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Booking__c-Booking Layout</fullName>
    <layoutSections>
        <customLabel>true</customLabel>
        <label>Booking Information</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Required</behavior>
                <field>Name</field>
            </layoutItems>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Related_Account__c</field>
            </layoutItems>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Status__c</field>
            </layoutItems>
        </layoutColumns>
        <layoutColumns>
            <layoutItems>
                <behavior>Required</behavior>
                <field>Start_Date__c</field>
            </layoutItems>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>End_Date__c</field>
            </layoutItems>
            <layoutItems>
                <behavior>Readonly</behavior>
                <field>Days_Until_Start__c</field>
            </layoutItems>
        </layoutColumns>
        <style>TwoColumnsLeftToRight</style>
    </layoutSections>
    <layoutSections>
        <customLabel>true</customLabel>
        <label>Details</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Detailed_Notes__c</field>
            </layoutItems>
        </layoutColumns>
        <style>OneColumn</style>
    </layoutSections>
</Layout>
```

Layout `behavior` options:
- `Required` — field is required on the layout
- `Edit` — field is editable
- `Readonly` — field is read-only on this layout

Layout `style` options:
- `OneColumn` — full width
- `TwoColumnsTopToBottom` — two columns, fill top to bottom
- `TwoColumnsLeftToRight` — two columns, fill left to right

### Step 6: Record Types and Business Processes

```xml
<!-- force-app/main/default/objects/Booking__c/recordTypes/Standard_Booking.recordType-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<RecordType xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Standard_Booking</fullName>
    <active>true</active>
    <label>Standard Booking</label>
    <description>Standard booking type for regular customers</description>
    <picklistValues>
        <picklist>Status__c</picklist>
        <values>
            <fullName>Draft</fullName>
            <default>true</default>
        </values>
        <values>
            <fullName>Active</fullName>
            <default>false</default>
        </values>
        <values>
            <fullName>Closed</fullName>
            <default>false</default>
        </values>
    </picklistValues>
</RecordType>
```

### Step 7: Permission Set for the New Object

```xml
<!-- force-app/main/default/permissionsets/Booking_User.permissionset-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>Booking User</label>
    <description>Access to Booking object and fields</description>
    <hasActivationRequired>false</hasActivationRequired>
    <objectPermissions>
        <object>Booking__c</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
        <allowEdit>true</allowEdit>
        <allowDelete>false</allowDelete>
        <viewAllRecords>false</viewAllRecords>
        <modifyAllRecords>false</modifyAllRecords>
    </objectPermissions>
    <fieldPermissions>
        <field>Booking__c.Short_Description__c</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
    <fieldPermissions>
        <field>Booking__c.Status__c</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
    <fieldPermissions>
        <field>Booking__c.Start_Date__c</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
    <fieldPermissions>
        <field>Booking__c.Total_Price__c</field>
        <readable>true</readable>
        <editable>false</editable>
    </fieldPermissions>
    <tabSettings>
        <tab>standard-Booking__c</tab>
        <visibility>Visible</visibility>
    </tabSettings>
</PermissionSet>
```

### Step 8: FLS Best Practices

**Principle of least privilege:** Only grant field access that the role requires.

**Field permission patterns:**
- `readable: true, editable: true` — full access
- `readable: true, editable: false` — read-only (formula fields, sensitive data)
- `readable: false, editable: false` — hidden (omit from permission set)

**Audit current FLS for an object:**

```
execute("sf data query --query \"SELECT Parent.Profile.Name, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE SobjectType = 'Booking__c'\" --target-org target-org --result-format table")
```

**Never grant:**
- `editable` without `readable` (Salesforce will reject it)
- Modify All on custom objects unless absolutely needed
- View All Data / Modify All Data to non-admin permission sets

### Step 9: Deploy and Verify

Deploy all metadata at once:

```
execute("sf project deploy start --source-dir force-app/main/default/objects/Booking__c --target-org target-org")
execute("sf project deploy start --source-dir force-app/main/default/permissionsets/Booking_User.permissionset-meta.xml --target-org target-org")
execute("sf project deploy start --source-dir force-app/main/default/layouts --target-org target-org")
```

Verify deployment:

```
execute("sf sobject describe --sobject Booking__c --target-org target-org")
execute("sf data query --query \"SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Booking__c'\" --target-org target-org --result-format table")
```

Verify permission set:

```
execute("sf data query --query \"SELECT Id, Name FROM PermissionSet WHERE Name = 'Booking_User'\" --target-org target-org --result-format json")
```

## Deployment Order

Always deploy metadata in this order to avoid dependency errors:

1. Custom objects (object-meta.xml only — no fields yet)
2. Custom fields (fields directory)
3. Validation rules
4. Record types
5. Page layouts
6. Permission sets / permission set groups
7. Profiles (if modifying)

## Error Handling & Troubleshooting

### "Cannot find object" on field deploy
- Deploy the object-meta.xml first, then fields separately
- Use `--source-dir` pointed at the object directory

### "Duplicate value" on picklist deploy
- A picklist value with the same API name already exists
- Check existing values: `sf sobject describe --sobject Object__c`

### "Invalid field" in validation rule formula
- Field API name is wrong or the field hasn't been deployed yet
- Deploy fields before validation rules

### "Layout references non-existent field"
- Deploy fields before layouts
- Check field API names match exactly (case-sensitive)

### "Permission set references non-existent object"
- Deploy the object and fields before the permission set
- Ensure object API name includes `__c` suffix

### Formula field compile errors
- Check field types in formula (can't do math on text fields)
- Use `VALUE()` to convert text to number
- Use `TEXT()` to convert picklist to string for comparisons
