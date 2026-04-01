---
name: Visualforce App
description: Create Visualforce pages, Apex controllers, and Lightning Apps for the App Launcher
trigger: When user asks to create a Visualforce page, VF component, Lightning tab/app, or add something to the App Launcher
tools_used: write_file, execute
---

# Visualforce App Skill

Create Visualforce pages with Apex controllers and make them accessible via Lightning App Launcher. All artifacts are written as source files and deployed via `sf project deploy start`.

## Prerequisites

- Salesforce CLI (`sf`) authenticated to the target org
- SFDX project structure exists (or this skill creates it)

```
execute("sf org display --target-org {alias} --json")
```

## Workflow

### Step 1: Ensure Project Structure

```
execute("mkdir -p force-app/main/default/pages")
execute("mkdir -p force-app/main/default/classes")
execute("mkdir -p force-app/main/default/tabs")
execute("mkdir -p force-app/main/default/customApplications")
execute("mkdir -p force-app/main/default/flexipages")
```

### Step 2: Write the Apex Controller

Create the Apex controller class that backs the Visualforce page.

**Standard Controller Extension** (for a specific SObject):

```
write_file("force-app/main/default/classes/{ControllerName}.cls", `
public with sharing class {ControllerName} {
    private final {SObjectType} record;

    public {ControllerName}(ApexPages.StandardController stdController) {
        this.record = ({SObjectType}) stdController.getRecord();
    }

    public List<{SObjectType}> getRecords() {
        return [
            SELECT Id, Name, CreatedDate
            FROM {SObjectType}
            ORDER BY CreatedDate DESC
            LIMIT 100
        ];
    }
}
`)

write_file("force-app/main/default/classes/{ControllerName}.cls-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexClass>
`)
```

**Custom Controller** (standalone, no standard controller):

```
write_file("force-app/main/default/classes/{ControllerName}.cls", `
public with sharing class {ControllerName} {

    public List<Account> accounts { get; private set; }
    public String searchTerm { get; set; }
    public String message { get; private set; }

    public {ControllerName}() {
        loadAccounts();
    }

    public void loadAccounts() {
        String query = 'SELECT Id, Name, Industry, AnnualRevenue, CreatedDate FROM Account';
        if (String.isNotBlank(searchTerm)) {
            query += ' WHERE Name LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\'';
        }
        query += ' ORDER BY CreatedDate DESC LIMIT 100';
        accounts = Database.query(query);
    }

    public PageReference search() {
        loadAccounts();
        return null;
    }

    public PageReference createAccount() {
        // Example action method
        return Page.{PageName};
    }
}
`)

write_file("force-app/main/default/classes/{ControllerName}.cls-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexClass>
`)
```

### Step 3: Write the Apex Test Class

Every Apex class requires test coverage (minimum 75%) for production deployment:

```
write_file("force-app/main/default/classes/{ControllerName}Test.cls", `
@IsTest
private class {ControllerName}Test {

    @TestSetup
    static void setupData() {
        List<Account> testAccounts = new List<Account>();
        for (Integer i = 0; i < 5; i++) {
            testAccounts.add(new Account(
                Name = 'Test Account ' + i,
                Industry = 'Technology'
            ));
        }
        insert testAccounts;
    }

    @IsTest
    static void testLoadAccounts() {
        {ControllerName} controller = new {ControllerName}();
        System.assertNotEquals(null, controller.accounts, 'Accounts should not be null');
        System.assertEquals(5, controller.accounts.size(), 'Should have 5 test accounts');
    }

    @IsTest
    static void testSearch() {
        {ControllerName} controller = new {ControllerName}();
        controller.searchTerm = 'Test Account 1';
        controller.search();
        System.assert(controller.accounts.size() >= 1, 'Should find at least 1 matching account');
    }

    @IsTest
    static void testSearchNoResults() {
        {ControllerName} controller = new {ControllerName}();
        controller.searchTerm = 'ZZZZNONEXISTENT';
        controller.search();
        System.assertEquals(0, controller.accounts.size(), 'Should find no matching accounts');
    }
}
`)

write_file("force-app/main/default/classes/{ControllerName}Test.cls-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexClass>
`)
```

### Step 4: Write the Visualforce Page

**Basic page with custom controller**:

```
write_file("force-app/main/default/pages/{PageName}.page", `
<apex:page controller="{ControllerName}" lightningStylesheets="true" docType="html-5.0" title="{Page Title}">
    <apex:slds />
    <div class="slds-scope">
        <div class="slds-page-header slds-m-bottom_medium">
            <div class="slds-page-header__row">
                <div class="slds-page-header__col-title">
                    <h1 class="slds-page-header__title">{Page Title}</h1>
                </div>
            </div>
        </div>

        <apex:form>
            <!-- Search Bar -->
            <div class="slds-grid slds-m-bottom_medium">
                <div class="slds-col slds-size_1-of-3">
                    <apex:input value="{!searchTerm}" styleClass="slds-input" html-placeholder="Search accounts..." />
                </div>
                <div class="slds-col slds-m-left_small">
                    <apex:commandButton value="Search" action="{!search}" styleClass="slds-button slds-button_brand" reRender="accountTable" />
                </div>
            </div>

            <!-- Data Table -->
            <apex:outputPanel id="accountTable">
                <table class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped">
                    <thead>
                        <tr class="slds-line-height_reset">
                            <th scope="col"><div class="slds-truncate">Name</div></th>
                            <th scope="col"><div class="slds-truncate">Industry</div></th>
                            <th scope="col"><div class="slds-truncate">Annual Revenue</div></th>
                            <th scope="col"><div class="slds-truncate">Created Date</div></th>
                        </tr>
                    </thead>
                    <tbody>
                        <apex:repeat value="{!accounts}" var="acc">
                            <tr>
                                <td><a href="/{!acc.Id}">{!acc.Name}</a></td>
                                <td>{!acc.Industry}</td>
                                <td><apex:outputField value="{!acc.AnnualRevenue}" /></td>
                                <td><apex:outputField value="{!acc.CreatedDate}" /></td>
                            </tr>
                        </apex:repeat>
                    </tbody>
                </table>
                <apex:outputPanel rendered="{!accounts.size == 0}">
                    <div class="slds-illustration slds-illustration_small slds-p-around_medium">
                        <p class="slds-text-body_regular">No records found.</p>
                    </div>
                </apex:outputPanel>
            </apex:outputPanel>
        </apex:form>
    </div>
</apex:page>
`)

write_file("force-app/main/default/pages/{PageName}.page-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ApexPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <availableInTouch>true</availableInTouch>
    <confirmationTokenRequired>false</confirmationTokenRequired>
    <label>{Page Title}</label>
    <description>{Description of what this page does}</description>
</ApexPage>
`)
```

**Page with Standard Controller + Extension**:

```
write_file("force-app/main/default/pages/{PageName}.page", `
<apex:page standardController="{SObjectType}" extensions="{ControllerName}" lightningStylesheets="true" docType="html-5.0">
    <apex:slds />
    <div class="slds-scope">
        <apex:detail subject="{!{SObjectType}.Id}" relatedList="true" inlineEdit="true" />
    </div>
</apex:page>
`)
```

### Step 5: Create a Custom Tab for the VF Page

To make the VF page accessible as a tab in Lightning:

```
write_file("force-app/main/default/tabs/{PageName}.tab-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<CustomTab xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>{Tab Label}</label>
    <mobileReady>true</mobileReady>
    <motif>Custom70: Handsaw</motif>
    <page>{PageName}</page>
</CustomTab>
`)
```

Common motif values (tab icons):
- `Custom1: Heart` through `Custom100: *` (custom icons)
- `Custom70: Handsaw` (tools/utility)
- `Custom18: Wrench` (settings)
- `Custom24: Laptop` (technology)
- `Custom46: Gauge` (dashboard/metrics)

### Step 6: Create a Lightning App for App Launcher

To make the tab appear in the Lightning App Launcher, create a Lightning Application:

```
write_file("force-app/main/default/customApplications/{AppName}.app-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<CustomApplication xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>{App Display Name}</label>
    <description>{App description}</description>
    <formFactors>
        <formFactor>Large</formFactor>
        <formFactor>Medium</formFactor>
        <formFactor>Small</formFactor>
    </formFactors>
    <isNavAutoTempTabsDisabled>false</isNavAutoTempTabsDisabled>
    <isNavPersonalizationDisabled>false</isNavPersonalizationDisabled>
    <isNavTabPersistenceDisabled>false</isNavTabPersistenceDisabled>
    <navType>Standard</navType>
    <tabs>standard-home</tabs>
    <tabs>{PageName}</tabs>
    <uiType>Lightning</uiType>
    <utilityBar>NONE</utilityBar>
</CustomApplication>
`)
```

### Step 7: Create a FlexiPage (Optional, for Lightning App Page)

If you want the VF page embedded in a Lightning page (instead of a standalone tab):

```
write_file("force-app/main/default/flexipages/{PageName}_Lightning.flexipage-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>pageName</name>
                    <value>{PageName}</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>height</name>
                    <value>800</value>
                </componentInstanceProperties>
                <componentName>flexipage:visualforcePage</componentName>
                <identifier>{PageName}_vf_embed</identifier>
            </componentInstance>
        </itemInstances>
        <name>main</name>
        <type>Region</type>
    </flexiPageRegions>
    <masterLabel>{Page Title} Lightning Page</masterLabel>
    <template>
        <name>flexipage:appHomeTemplateSingleColumn</name>
    </template>
    <type>AppPage</type>
</FlexiPage>
`)
```

### Step 8: Deploy Everything

Deploy all components at once:

```
execute("sf project deploy start --source-dir force-app --target-org {alias}")
```

Or deploy incrementally to catch errors early:

```
# Deploy Apex classes first (controller + test)
execute("sf project deploy start --source-dir force-app/main/default/classes --target-org {alias}")

# Run tests to verify
execute("sf apex run test --class-names {ControllerName}Test --target-org {alias} --synchronous --result-format human")

# Deploy VF page
execute("sf project deploy start --source-dir force-app/main/default/pages --target-org {alias}")

# Deploy tab
execute("sf project deploy start --source-dir force-app/main/default/tabs --target-org {alias}")

# Deploy Lightning app
execute("sf project deploy start --source-dir force-app/main/default/customApplications --target-org {alias}")
```

### Step 9: Verify Deployment

Check that all components deployed successfully:

```
execute("sf project deploy report --target-org {alias}")
```

Open the org and navigate to the app:
```
execute("sf org open --target-org {alias} --path '/lightning/app/{namespace}__{AppName}'")
```

Or open the VF page directly:
```
execute("sf org open --target-org {alias} --path '/apex/{PageName}'")
```

## Advanced Patterns

### Visualforce Page with Remote Actions (JavaScript Remoting)

For pages that need asynchronous data loading:

```
write_file("force-app/main/default/classes/{ControllerName}.cls", `
public with sharing class {ControllerName} {

    @RemoteAction
    public static List<Account> searchAccounts(String term) {
        String searchPattern = '%' + String.escapeSingleQuotes(term) + '%';
        return [SELECT Id, Name, Industry FROM Account WHERE Name LIKE :searchPattern LIMIT 50];
    }

    @RemoteAction
    public static Account getAccountDetail(String accountId) {
        return [SELECT Id, Name, Industry, AnnualRevenue, BillingAddress, Phone, Website
                FROM Account WHERE Id = :accountId LIMIT 1];
    }
}
`)
```

In the VF page, call remote actions with JavaScript:
```html
<script>
    function searchAccounts(term) {
        Visualforce.remoting.Manager.invokeAction(
            '{!$RemoteAction.{ControllerName}.searchAccounts}',
            term,
            function(result, event) {
                if (event.status) {
                    // Handle result
                    console.log(result);
                } else {
                    console.error(event.message);
                }
            },
            { escape: true }
        );
    }
</script>
```

### Visualforce Email Template

For email templates that use VF markup:

```
write_file("force-app/main/default/email/{TemplateName}.email", `
<messaging:emailTemplate subject="{Subject}" recipientType="Contact" relatedToType="Account">
    <messaging:htmlEmailBody>
        <html>
            <body style="font-family: Arial, sans-serif;">
                <h2>Hello {!relatedTo.Name}</h2>
                <p>This is a templated email from Salesforce.</p>
                <table style="border-collapse: collapse; width: 100%;">
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;">Account</td>
                        <td style="border: 1px solid #ddd; padding: 8px;">{!relatedTo.Name}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;">Industry</td>
                        <td style="border: 1px solid #ddd; padding: 8px;">{!relatedTo.Industry}</td>
                    </tr>
                </table>
            </body>
        </html>
    </messaging:htmlEmailBody>
</messaging:emailTemplate>
`)
```

### Visualforce Component (Reusable)

For reusable VF components included in multiple pages:

```
write_file("force-app/main/default/components/{ComponentName}.component", `
<apex:component controller="{ComponentControllerName}">
    <apex:attribute name="recordId" type="Id" description="The record ID to display" assignTo="{!recId}" />
    <apex:attribute name="title" type="String" description="Section title" />

    <div class="slds-card">
        <div class="slds-card__header">
            <h2 class="slds-text-heading_small">{!title}</h2>
        </div>
        <div class="slds-card__body slds-card__body_inner">
            <apex:outputPanel rendered="{!record != null}">
                <dl class="slds-list_horizontal slds-wrap">
                    <dt class="slds-item_label">Name:</dt>
                    <dd class="slds-item_detail">{!record.Name}</dd>
                </dl>
            </apex:outputPanel>
        </div>
    </div>
</apex:component>
`)

write_file("force-app/main/default/components/{ComponentName}.component-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ApexComponent xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>{Component Label}</label>
    <description>{Component description}</description>
</ApexComponent>
`)
```

Use in a page: `<c:{ComponentName} recordId="{!account.Id}" title="Account Summary" />`

## Common Issues

### "Visualforce Page Not Available in Lightning"
- Ensure `<availableInTouch>true</availableInTouch>` is set in the `.page-meta.xml`
- The page must be wrapped in `<apex:slds />` for SLDS styling in Lightning

### "Insufficient Privileges" Error
- Check the user's profile has access to the Apex class and VF page
- In Setup > Profiles > {Profile} > Visualforce Page Access, add the page
- In Setup > Profiles > {Profile} > Apex Class Access, add the controller

### "Tab Not Showing in App Launcher"
- Ensure the tab is added to a Lightning App (`<tabs>` element in app metadata)
- Check that the user's profile or permission set includes the custom tab
- App Launcher visibility: Setup > App Manager > {App} > Edit > User Profiles

### Deployment Fails with "Test Coverage" Error
- Ensure test class covers at least 75% of the controller
- Run tests before deploying: `execute("sf apex run test --class-names {ControllerName}Test --target-org {alias} --synchronous")`
- Check test results: `execute("sf apex get test --test-run-id {id} --target-org {alias}")`

### SLDS Styles Not Applying
- Add `<apex:slds />` inside the `<apex:page>` tag
- Wrap all content in `<div class="slds-scope">`
- Use `lightningStylesheets="true"` attribute on `<apex:page>`
