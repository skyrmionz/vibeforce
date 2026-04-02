---
name: LWC Development
description: Create Lightning Web Components with wire service, Jest testing, component communication patterns, and deployment
trigger: When user asks to create a Lightning Web Component, build LWC, add a component to a page, set up LWC Jest tests, or work with wire service
tools_used: execute, write_file, read_file, edit_file
---

# LWC Development Skill

Create, test, and deploy Lightning Web Components: scaffolding, wire service, Apex integration, component communication, Jest testing, and deployment.

## Prerequisites

Verify SF CLI and Node.js (required for Jest):

```
execute("sf version")
execute("node --version")
execute("npm --version")
```

Verify the SFDX project structure:

```
execute("ls force-app/main/default/lwc/")
```

If no LWC directory exists:

```
execute("mkdir -p force-app/main/default/lwc")
```

## Workflow

### Step 1: Scaffold a New Component

Generate a component using SF CLI:

```
execute("sf lightning generate component --name myComponent --output-dir force-app/main/default/lwc --type lwc")
```

This creates:
- `myComponent/myComponent.html` — Template
- `myComponent/myComponent.js` — Controller
- `myComponent/myComponent.js-meta.xml` — Metadata configuration
- `myComponent/myComponent.css` — Styles (optional, create if needed)

### Step 2: Configure Component Metadata

Set visibility and targets in the meta XML:

```xml
<!-- force-app/main/default/lwc/myComponent/myComponent.js-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <apiVersion>62.0</apiVersion>
    <isExposed>true</isExposed>
    <masterLabel>My Component</masterLabel>
    <description>A reusable component for displaying account details</description>
    <targets>
        <target>lightning__RecordPage</target>
        <target>lightning__AppPage</target>
        <target>lightning__HomePage</target>
        <target>lightning__FlowScreen</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="lightning__RecordPage">
            <objects>
                <object>Account</object>
                <object>Contact</object>
            </objects>
            <property name="title" type="String" label="Card Title" default="Details" />
            <property name="maxRecords" type="Integer" label="Max Records" default="10" />
            <property name="showHeader" type="Boolean" label="Show Header" default="true" />
        </targetConfig>
        <targetConfig targets="lightning__FlowScreen">
            <property name="recordId" type="String" label="Record ID" role="inputOnly" />
            <property name="selectedValue" type="String" label="Selected Value" role="outputOnly" />
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

### Step 3: Build the Component Template

```html
<!-- force-app/main/default/lwc/myComponent/myComponent.html -->
<template>
    <lightning-card title={title} icon-name="standard:account">
        <div class="slds-m-around_medium">
            <!-- Loading state -->
            <template lwc:if={isLoading}>
                <lightning-spinner alternative-text="Loading" size="small"></lightning-spinner>
            </template>

            <!-- Error state -->
            <template lwc:if={error}>
                <div class="slds-text-color_error slds-m-bottom_medium">
                    <lightning-icon icon-name="utility:error" size="x-small" class="slds-m-right_x-small"></lightning-icon>
                    {error}
                </div>
            </template>

            <!-- Data display -->
            <template lwc:if={hasRecords}>
                <lightning-datatable
                    key-field="Id"
                    data={records}
                    columns={columns}
                    hide-checkbox-column
                    onrowaction={handleRowAction}
                ></lightning-datatable>
            </template>

            <!-- Empty state -->
            <template lwc:if={isEmpty}>
                <div class="slds-align_absolute-center slds-m-vertical_large">
                    <p class="slds-text-body_regular slds-text-color_weak">No records found.</p>
                </div>
            </template>
        </div>

        <!-- Footer actions -->
        <div slot="footer">
            <lightning-button label="Refresh" onclick={handleRefresh} variant="neutral"></lightning-button>
            <lightning-button label="New Record" onclick={handleNew} variant="brand" class="slds-m-left_x-small"></lightning-button>
        </div>
    </lightning-card>
</template>
```

### Step 4: Build the Component Controller

```javascript
// force-app/main/default/lwc/myComponent/myComponent.js
import { LightningElement, api, wire, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import getRecords from '@salesforce/apex/MyComponentController.getRecords';

const COLUMNS = [
    { label: 'Name', fieldName: 'Name', type: 'text', sortable: true },
    { label: 'Industry', fieldName: 'Industry', type: 'text' },
    { label: 'Phone', fieldName: 'Phone', type: 'phone' },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [
                { label: 'View', name: 'view' },
                { label: 'Edit', name: 'edit' }
            ]
        }
    }
];

export default class MyComponent extends NavigationMixin(LightningElement) {
    @api recordId;
    @api title = 'Records';
    @api maxRecords = 10;
    @api showHeader = true;

    columns = COLUMNS;
    error;
    wiredResult;

    // Wire service: reactive query based on recordId
    @wire(getRecords, { recordId: '$recordId', maxRecords: '$maxRecords' })
    wiredGetRecords(result) {
        this.wiredResult = result;
        const { data, error } = result;
        if (data) {
            this.error = undefined;
        } else if (error) {
            this.error = this.reduceErrors(error);
        }
    }

    // Computed properties
    get records() {
        return this.wiredResult?.data || [];
    }

    get isLoading() {
        return !this.wiredResult;
    }

    get hasRecords() {
        return this.records.length > 0;
    }

    get isEmpty() {
        return !this.isLoading && !this.error && this.records.length === 0;
    }

    // Event handlers
    handleRefresh() {
        refreshApex(this.wiredResult);
    }

    handleNew() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: {
                objectApiName: 'Account',
                actionName: 'new'
            }
        });
    }

    handleRowAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;

        switch (action.name) {
            case 'view':
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: {
                        recordId: row.Id,
                        actionName: 'view'
                    }
                });
                break;
            case 'edit':
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: {
                        recordId: row.Id,
                        actionName: 'edit'
                    }
                });
                break;
            default:
                break;
        }
    }

    // Utility: reduce error to string
    reduceErrors(error) {
        if (typeof error === 'string') return error;
        if (error.body) {
            if (typeof error.body.message === 'string') return error.body.message;
            if (error.body.fieldErrors) {
                return Object.values(error.body.fieldErrors)
                    .flat()
                    .map(e => e.message)
                    .join(', ');
            }
        }
        return 'Unknown error';
    }

    // Show toast notification
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
```

### Step 5: Create the Apex Controller

```apex
// force-app/main/default/classes/MyComponentController.cls
public with sharing class MyComponentController {

    @AuraEnabled(cacheable=true)
    public static List<Account> getRecords(Id recordId, Integer maxRecords) {
        if (maxRecords == null || maxRecords <= 0) {
            maxRecords = 10;
        }
        if (maxRecords > 200) {
            maxRecords = 200;
        }

        return [
            SELECT Id, Name, Industry, Phone, CreatedDate
            FROM Account
            WHERE Id != null
            WITH SECURITY_ENFORCED
            ORDER BY CreatedDate DESC
            LIMIT :maxRecords
        ];
    }

    @AuraEnabled
    public static Account saveRecord(Account record) {
        try {
            SObjectAccessDecision decision = Security.stripInaccessible(
                AccessType.UPSERTABLE,
                new List<Account>{ record }
            );
            upsert decision.getRecords();
            return (Account) decision.getRecords()[0];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
```

### Step 6: Component Communication Patterns

**Parent to Child (Public Properties):**

```html
<!-- parentComponent.html -->
<template>
    <c-child-component
        record-id={recordId}
        title="Child Title"
        onselected={handleChildSelected}
    ></c-child-component>
</template>
```

```javascript
// childComponent.js
import { LightningElement, api } from 'lwc';

export default class ChildComponent extends LightningElement {
    @api recordId;
    @api title;

    // Public method callable by parent
    @api
    refresh() {
        // Refresh logic
    }
}
```

**Child to Parent (Custom Events):**

```javascript
// childComponent.js — dispatch event
handleClick() {
    const event = new CustomEvent('selected', {
        detail: { recordId: this.selectedId, name: this.selectedName },
        bubbles: false, // default: does not bubble
        composed: false  // default: does not cross shadow DOM
    });
    this.dispatchEvent(event);
}
```

```javascript
// parentComponent.js — handle event
handleChildSelected(event) {
    const { recordId, name } = event.detail;
    this.selectedRecordId = recordId;
}
```

**Sibling Communication (Lightning Message Service):**

```javascript
// Publisher component
import { publish, MessageContext } from 'lightning/messageService';
import RECORD_SELECTED from '@salesforce/messageChannel/RecordSelected__c';

@wire(MessageContext) messageContext;

publishMessage(recordId) {
    publish(this.messageContext, RECORD_SELECTED, { recordId: recordId });
}
```

```javascript
// Subscriber component
import { subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import RECORD_SELECTED from '@salesforce/messageChannel/RecordSelected__c';

@wire(MessageContext) messageContext;
subscription = null;

connectedCallback() {
    this.subscription = subscribe(
        this.messageContext,
        RECORD_SELECTED,
        (message) => this.handleMessage(message)
    );
}

disconnectedCallback() {
    unsubscribe(this.subscription);
    this.subscription = null;
}

handleMessage(message) {
    this.recordId = message.recordId;
}
```

### Step 7: Set Up Jest Testing

Install LWC Jest dependencies:

```
execute("sf lightning generate test --name myComponent --output-dir force-app/main/default/lwc/myComponent/__tests__")
```

If Jest is not set up in the project:

```
execute("npm install --save-dev @salesforce/sfdx-lwc-jest @lwc/jest-preset")
```

Add to `package.json`:

```json
{
  "scripts": {
    "test:unit": "sfdx-lwc-jest",
    "test:unit:watch": "sfdx-lwc-jest --watch",
    "test:unit:coverage": "sfdx-lwc-jest --coverage"
  }
}
```

Create a test file:

```javascript
// force-app/main/default/lwc/myComponent/__tests__/myComponent.test.js
import { createElement } from 'lwc';
import MyComponent from 'c/myComponent';
import getRecords from '@salesforce/apex/MyComponentController.getRecords';

// Mock Apex method
jest.mock('@salesforce/apex/MyComponentController.getRecords', () => ({
    default: jest.fn()
}), { virtual: true });

// Mock data
const MOCK_RECORDS = [
    { Id: '001xx000003DGTAL', Name: 'Acme Corp', Industry: 'Technology', Phone: '555-1234' },
    { Id: '001xx000003DGTAM', Name: 'Global Inc', Industry: 'Finance', Phone: '555-5678' }
];

describe('c-my-component', () => {
    afterEach(() => {
        // Clean up DOM
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders component with title', () => {
        const element = createElement('c-my-component', { is: MyComponent });
        element.title = 'Test Title';
        document.body.appendChild(element);

        const card = element.shadowRoot.querySelector('lightning-card');
        expect(card.title).toBe('Test Title');
    });

    it('displays records when data is loaded', async () => {
        getRecords.mockResolvedValue(MOCK_RECORDS);

        const element = createElement('c-my-component', { is: MyComponent });
        element.recordId = '001xx000003DGTAL';
        document.body.appendChild(element);

        // Wait for async wire to resolve
        await Promise.resolve();
        await Promise.resolve();

        const datatable = element.shadowRoot.querySelector('lightning-datatable');
        expect(datatable).not.toBeNull();
        expect(datatable.data.length).toBe(2);
    });

    it('shows error message on wire error', async () => {
        getRecords.mockRejectedValue({ body: { message: 'Test error' } });

        const element = createElement('c-my-component', { is: MyComponent });
        element.recordId = '001xx000003DGTAL';
        document.body.appendChild(element);

        await Promise.resolve();
        await Promise.resolve();

        const errorDiv = element.shadowRoot.querySelector('.slds-text-color_error');
        expect(errorDiv).not.toBeNull();
    });

    it('shows empty state when no records', async () => {
        getRecords.mockResolvedValue([]);

        const element = createElement('c-my-component', { is: MyComponent });
        element.recordId = '001xx000003DGTAL';
        document.body.appendChild(element);

        await Promise.resolve();
        await Promise.resolve();

        const emptyMessage = element.shadowRoot.querySelector('.slds-align_absolute-center');
        expect(emptyMessage).not.toBeNull();
    });

    it('fires custom event on row action', async () => {
        getRecords.mockResolvedValue(MOCK_RECORDS);

        const element = createElement('c-my-component', { is: MyComponent });
        document.body.appendChild(element);

        await Promise.resolve();

        const handler = jest.fn();
        element.addEventListener('selected', handler);

        // Simulate row action
        const datatable = element.shadowRoot.querySelector('lightning-datatable');
        datatable.dispatchEvent(
            new CustomEvent('rowaction', {
                detail: { action: { name: 'view' }, row: MOCK_RECORDS[0] }
            })
        );

        // Verify navigation was attempted (would need NavigationMixin mock)
    });
});
```

Run tests:

```
execute("npm run test:unit")
execute("npm run test:unit:coverage")
```

### Step 8: Deploy the Component

Deploy to the org:

```
execute("sf project deploy start --source-dir force-app/main/default/lwc/myComponent --target-org dev")
```

Also deploy the Apex controller:

```
execute("sf project deploy start --source-dir force-app/main/default/classes/MyComponentController.cls force-app/main/default/classes/MyComponentController.cls-meta.xml --target-org dev")
```

### Step 9: Add to Lightning Page

Open the org and use Lightning App Builder:

```
execute("sf org open --target-org dev --path /lightning/setup/FlexiPageList/home")
```

Or create a FlexiPage programmatically:

```xml
<!-- force-app/main/default/flexipages/My_Custom_Page.flexipage-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentName>c:myComponent</componentName>
                <componentInstanceProperties>
                    <name>title</name>
                    <value>Account List</value>
                </componentInstanceProperties>
            </componentInstance>
        </itemInstances>
        <name>main</name>
        <type>Region</type>
    </flexiPageRegions>
    <masterLabel>My Custom Page</masterLabel>
    <type>AppPage</type>
</FlexiPage>
```

## Error Handling & Troubleshooting

### "Cannot find module" in Jest tests
- Run `sf lightning setup jest` to configure Jest paths
- Verify `jest.config.js` has the correct module name mapper
- Clear Jest cache: `npx jest --clearCache`

### Component not showing in App Builder
- Verify `isExposed` is `true` in the meta XML
- Check `targets` includes the page type you're editing
- Redeploy the component and refresh the page

### Wire service not returning data
- Verify the Apex method has `@AuraEnabled(cacheable=true)`
- Check that reactive properties (prefixed with `$`) are set before wire fires
- Use `refreshApex()` to force a fresh call

### "Access denied" or FLS errors
- Apex controller must use `with sharing` (or explicit security checks)
- Use `WITH SECURITY_ENFORCED` in SOQL queries
- Verify the user's profile/permission set has access to the Apex class

### LWC styling issues
- LWC uses Shadow DOM — external CSS cannot penetrate
- Use SLDS classes for consistent styling
- Use CSS custom properties (`--lwc-*`) for theming
- For one-off overrides, use `:host` selector in component CSS

### Event not received by parent
- Verify event name matches (lowercase, no "on" prefix in dispatch)
- Check `bubbles` and `composed` flags if crossing component boundaries
- Use Lightning Message Service for cross-page communication
