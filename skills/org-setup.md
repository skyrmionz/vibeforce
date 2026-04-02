---
name: Org Setup
description: Configure Salesforce orgs with custom metadata types, custom settings, feature flags, custom objects, and org-wide defaults
trigger: When user asks to set up an org, create custom metadata, configure custom settings, add feature flags, create custom objects, or initialize org configuration
tools_used: execute, write_file, read_file, edit_file
---

# Org Setup Skill

Configure a Salesforce org from scratch: custom metadata types, custom settings, feature flags, custom objects, org-wide defaults, and app configuration.

## Prerequisites

Verify org connection:

```
execute("sf org display --target-org dev")
```

Verify project structure:

```
execute("cat sfdx-project.json")
execute("ls force-app/main/default/")
```

## Workflow

### Step 1: Create Custom Metadata Types

Custom Metadata Types are the recommended approach for app configuration (deployable, packageable, test-visible without `SeeAllData`).

**Create the metadata type definition:**

```xml
<!-- force-app/main/default/customMetadata/App_Config.md-meta.xml won't work — need object definition first -->
<!-- force-app/main/default/objects/App_Config__mdt/App_Config__mdt.object-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>App Config</label>
    <pluralLabel>App Configs</pluralLabel>
    <visibility>Public</visibility>
</CustomObject>
```

**Add fields to the metadata type:**

```xml
<!-- force-app/main/default/objects/App_Config__mdt/fields/Value__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Value__c</fullName>
    <label>Value</label>
    <type>Text</type>
    <length>255</length>
</CustomField>
```

```xml
<!-- force-app/main/default/objects/App_Config__mdt/fields/Is_Active__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Is_Active__c</fullName>
    <label>Is Active</label>
    <type>Checkbox</type>
    <defaultValue>true</defaultValue>
</CustomField>
```

```xml
<!-- force-app/main/default/objects/App_Config__mdt/fields/Category__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Category__c</fullName>
    <label>Category</label>
    <type>Picklist</type>
    <valueSet>
        <valueSetDefinition>
            <value>
                <fullName>General</fullName>
                <default>true</default>
                <label>General</label>
            </value>
            <value>
                <fullName>Integration</fullName>
                <default>false</default>
                <label>Integration</label>
            </value>
            <value>
                <fullName>Feature</fullName>
                <default>false</default>
                <label>Feature</label>
            </value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

**Create metadata records:**

```xml
<!-- force-app/main/default/customMetadata/App_Config.API_Endpoint.md-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomMetadata xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>API Endpoint</label>
    <protected>false</protected>
    <values>
        <field>Value__c</field>
        <value>https://api.example.com/v2</value>
    </values>
    <values>
        <field>Is_Active__c</field>
        <value>true</value>
    </values>
    <values>
        <field>Category__c</field>
        <value>Integration</value>
    </values>
</CustomMetadata>
```

**Access in Apex:**

```apex
public class AppConfigService {
    private static Map<String, App_Config__mdt> configCache;

    public static String getValue(String developerName) {
        if (configCache == null) {
            configCache = App_Config__mdt.getAll();
        }
        App_Config__mdt config = configCache.get(developerName);
        return config != null && config.Is_Active__c ? config.Value__c : null;
    }

    public static List<App_Config__mdt> getByCategory(String category) {
        return [
            SELECT DeveloperName, Value__c, Is_Active__c
            FROM App_Config__mdt
            WHERE Category__c = :category AND Is_Active__c = true
        ];
    }
}
```

Deploy:

```
execute("sf project deploy start --source-dir force-app/main/default/objects/App_Config__mdt --target-org dev")
execute("sf project deploy start --source-dir force-app/main/default/customMetadata --target-org dev")
```

### Step 2: Create Custom Settings (for org/profile/user-level config)

Use Custom Settings when you need different values per user or profile:

```xml
<!-- force-app/main/default/objects/Feature_Flags__c/Feature_Flags__c.object-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <customSettingsType>Hierarchy</customSettingsType>
    <label>Feature Flags</label>
    <visibility>Public</visibility>
</CustomObject>
```

```xml
<!-- force-app/main/default/objects/Feature_Flags__c/fields/Enable_New_UI__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Enable_New_UI__c</fullName>
    <label>Enable New UI</label>
    <type>Checkbox</type>
    <defaultValue>false</defaultValue>
</CustomField>
```

```xml
<!-- force-app/main/default/objects/Feature_Flags__c/fields/Enable_Advanced_Search__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Enable_Advanced_Search__c</fullName>
    <label>Enable Advanced Search</label>
    <type>Checkbox</type>
    <defaultValue>false</defaultValue>
</CustomField>
```

```xml
<!-- force-app/main/default/objects/Feature_Flags__c/fields/Max_Records_Per_Page__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Max_Records_Per_Page__c</fullName>
    <label>Max Records Per Page</label>
    <type>Number</type>
    <precision>4</precision>
    <scale>0</scale>
    <defaultValue>25</defaultValue>
</CustomField>
```

**Access in Apex:**

```apex
public class FeatureFlagService {
    // Gets the effective value for the running user (hierarchy: user > profile > org default)
    public static Boolean isNewUIEnabled() {
        Feature_Flags__c flags = Feature_Flags__c.getInstance();
        return flags != null && flags.Enable_New_UI__c;
    }

    public static Boolean isAdvancedSearchEnabled() {
        Feature_Flags__c flags = Feature_Flags__c.getInstance();
        return flags != null && flags.Enable_Advanced_Search__c;
    }

    public static Integer getMaxRecordsPerPage() {
        Feature_Flags__c flags = Feature_Flags__c.getInstance();
        return flags != null && flags.Max_Records_Per_Page__c != null
            ? Integer.valueOf(flags.Max_Records_Per_Page__c) : 25;
    }

    // Set org-wide defaults
    public static void setOrgDefaults(Feature_Flags__c defaults) {
        Feature_Flags__c existing = Feature_Flags__c.getOrgDefaults();
        if (existing.Id != null) {
            defaults.Id = existing.Id;
            update defaults;
        } else {
            insert defaults;
        }
    }
}
```

**Set org defaults via Apex:**

```apex
// scripts/setup-feature-flags.apex
Feature_Flags__c defaults = new Feature_Flags__c(
    Enable_New_UI__c = false,
    Enable_Advanced_Search__c = true,
    Max_Records_Per_Page__c = 25
);
FeatureFlagService.setOrgDefaults(defaults);
System.debug('Feature flags initialized');
```

```
execute("sf apex run --file scripts/setup-feature-flags.apex --target-org dev")
```

### Step 3: Create Custom Objects

For the application data model, create custom objects:

```xml
<!-- force-app/main/default/objects/Project__c/Project__c.object-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>Project</label>
    <pluralLabel>Projects</pluralLabel>
    <nameField>
        <label>Project Name</label>
        <type>Text</type>
    </nameField>
    <deploymentStatus>Deployed</deploymentStatus>
    <sharingModel>Private</sharingModel>
    <enableActivities>true</enableActivities>
    <enableHistory>true</enableHistory>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
</CustomObject>
```

**Add fields:**

```xml
<!-- force-app/main/default/objects/Project__c/fields/Status__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Status__c</fullName>
    <label>Status</label>
    <type>Picklist</type>
    <required>true</required>
    <valueSet>
        <valueSetDefinition>
            <value><fullName>Not Started</fullName><default>true</default><label>Not Started</label></value>
            <value><fullName>In Progress</fullName><default>false</default><label>In Progress</label></value>
            <value><fullName>Completed</fullName><default>false</default><label>Completed</label></value>
            <value><fullName>On Hold</fullName><default>false</default><label>On Hold</label></value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

```xml
<!-- force-app/main/default/objects/Project__c/fields/Start_Date__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Start_Date__c</fullName>
    <label>Start Date</label>
    <type>Date</type>
    <required>false</required>
</CustomField>
```

```xml
<!-- force-app/main/default/objects/Project__c/fields/Budget__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>Budget__c</fullName>
    <label>Budget</label>
    <type>Currency</type>
    <precision>16</precision>
    <scale>2</scale>
    <required>false</required>
</CustomField>
```

Deploy objects:

```
execute("sf project deploy start --source-dir force-app/main/default/objects --target-org dev")
```

### Step 4: Create Page Layouts

```xml
<!-- force-app/main/default/layouts/Project__c-Project Layout.layout-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Layout xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>Information</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Required</behavior>
                <field>Name</field>
            </layoutItems>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Status__c</field>
            </layoutItems>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Start_Date__c</field>
            </layoutItems>
        </layoutColumns>
        <layoutColumns>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>Budget__c</field>
            </layoutItems>
            <layoutItems>
                <behavior>Edit</behavior>
                <field>OwnerId</field>
            </layoutItems>
        </layoutColumns>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>System Information</label>
        <layoutColumns>
            <layoutItems>
                <behavior>Readonly</behavior>
                <field>CreatedById</field>
            </layoutItems>
        </layoutColumns>
        <layoutColumns>
            <layoutItems>
                <behavior>Readonly</behavior>
                <field>LastModifiedById</field>
            </layoutItems>
        </layoutColumns>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
</Layout>
```

### Step 5: Create Lightning App and Tab

```xml
<!-- force-app/main/default/tabs/Project__c.tab-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomTab xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <customObject>true</customObject>
    <motif>Custom57: Smiley</motif>
</CustomTab>
```

```xml
<!-- force-app/main/default/applications/My_App.app-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomApplication xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>My App</label>
    <formFactors>
        <formFactor>Large</formFactor>
        <formFactor>Medium</formFactor>
        <formFactor>Small</formFactor>
    </formFactors>
    <navType>Standard</navType>
    <uiType>Lightning</uiType>
    <tabs>
        <tab>standard-home</tab>
        <tab>Project__c</tab>
        <tab>standard-Account</tab>
        <tab>standard-Contact</tab>
    </tabs>
</CustomApplication>
```

Deploy apps and tabs:

```
execute("sf project deploy start --source-dir force-app/main/default/tabs --target-org dev")
execute("sf project deploy start --source-dir force-app/main/default/applications --target-org dev")
```

### Step 6: Configure Named Credentials

For external service integrations:

```xml
<!-- force-app/main/default/namedCredentials/External_API.namedCredential-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<NamedCredential xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>External API</label>
    <fullName>External_API</fullName>
    <endpoint>https://api.example.com</endpoint>
    <principalType>NamedUser</principalType>
    <protocol>Password</protocol>
</NamedCredential>
```

**Access in Apex:**

```apex
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:External_API/v2/data');
req.setMethod('GET');
Http http = new Http();
HttpResponse res = http.send(req);
```

### Step 7: Set Up Remote Site Settings

```xml
<!-- force-app/main/default/remoteSiteSettings/ExternalAPI.remoteSite-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<RemoteSiteSetting xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>ExternalAPI</fullName>
    <isActive>true</isActive>
    <url>https://api.example.com</url>
    <description>External API for data sync</description>
    <disableProtocolSecurity>false</disableProtocolSecurity>
</RemoteSiteSetting>
```

### Step 8: Initialize Org Data

Run setup scripts to populate required data:

```apex
// scripts/org-init.apex
// Create default custom settings
Feature_Flags__c flags = new Feature_Flags__c(
    SetupOwnerId = UserInfo.getOrganizationId(),
    Enable_New_UI__c = true,
    Enable_Advanced_Search__c = true,
    Max_Records_Per_Page__c = 25
);
upsert flags SetupOwnerId;

// Create sample data for development
List<Account> sampleAccounts = new List<Account>{
    new Account(Name = 'Acme Corporation', Industry = 'Technology'),
    new Account(Name = 'Global Industries', Industry = 'Manufacturing'),
    new Account(Name = 'Summit Healthcare', Industry = 'Healthcare')
};
insert sampleAccounts;

System.debug('Org initialization complete');
System.debug('Accounts created: ' + sampleAccounts.size());
```

```
execute("sf apex run --file scripts/org-init.apex --target-org dev")
```

### Step 9: Deploy Everything

Deploy all metadata in the correct order:

```
# 1. Objects and fields first
execute("sf project deploy start --source-dir force-app/main/default/objects --target-org dev")

# 2. Custom metadata records
execute("sf project deploy start --source-dir force-app/main/default/customMetadata --target-org dev")

# 3. Apex classes
execute("sf project deploy start --source-dir force-app/main/default/classes --target-org dev")

# 4. LWC components
execute("sf project deploy start --source-dir force-app/main/default/lwc --target-org dev")

# 5. Layouts, tabs, apps
execute("sf project deploy start --source-dir force-app/main/default/layouts --target-org dev")
execute("sf project deploy start --source-dir force-app/main/default/tabs --target-org dev")
execute("sf project deploy start --source-dir force-app/main/default/applications --target-org dev")

# 6. Permission sets
execute("sf project deploy start --source-dir force-app/main/default/permissionsets --target-org dev")
```

## Error Handling & Troubleshooting

### "Custom Metadata Type not found"
- Deploy the object definition before deploying records
- Check the API name matches (include `__mdt` suffix)
- Verify the metadata type is in the correct directory

### "Cannot deploy Custom Setting"
- Hierarchy custom settings data cannot be deployed via metadata
- Use Apex scripts (`sf apex run`) to populate custom settings values
- Only the custom setting definition (object + fields) is deployable

### "Duplicate developer name"
- Each metadata record needs a unique `DeveloperName`
- Check existing records: `sf data query --query "SELECT DeveloperName FROM App_Config__mdt"`
- Use unique naming convention: `Category_Name` format

### "Missing required field" on object deployment
- Ensure all required fields have default values or are set to not-required initially
- Deploy the object without required constraints, load data, then add required constraint

### Permission errors after deployment
- Assign newly created objects/fields to permission sets
- Deploy permission sets AFTER objects and fields
- Check that the deploying user has "Customize Application" permission

### Custom metadata not visible in tests
- Custom metadata IS visible in tests without `SeeAllData=true` — this is correct behavior
- If not visible, the records may not have been deployed to the test org
- Use `App_Config__mdt.getAll()` instead of SOQL in tests for reliability
