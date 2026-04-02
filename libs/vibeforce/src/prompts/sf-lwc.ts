/**
 * Deep Salesforce Lightning Web Components lifecycle and patterns prompt.
 */

export const SF_LWC_PROMPT = `# Lightning Web Components (LWC) — Deep Reference

## Component Lifecycle

The LWC lifecycle follows a strict order:

1. **constructor()** — Component instance created
   - Called when component is instantiated
   - Must call super() first
   - Do NOT access child elements (not rendered yet)
   - Do NOT inspect attributes (@api properties not set yet)
   - Do NOT access this.template (not available)

2. **connectedCallback()** — Component inserted into DOM
   - Access @api properties (set by parent)
   - Make imperative Apex calls
   - Subscribe to message channels, events
   - Add event listeners on window/document
   - Can fire events
   - May be called multiple times if component is moved in DOM

3. **render()** — (Optional) Return alternate template
   - Rarely used; default renders the component HTML
   - Use for conditional template switching

4. **renderedCallback()** — Component finished rendering
   - Called after EVERY render cycle (not just the first)
   - Safe to access child elements via this.template.querySelector()
   - BEWARE: Modifying reactive properties here causes re-render → infinite loop
   - Guard with a flag: if (this.isRendered) return; this.isRendered = true;

5. **disconnectedCallback()** — Component removed from DOM
   - Clean up: unsubscribe from message channels, remove event listeners, cancel timers
   - Called when component is removed or parent re-renders without it

6. **errorCallback(error, stack)** — Descendant throws error
   - Only catches errors from child components, not from this component
   - Use for error boundary patterns

## @wire Service

The wire service provides REACTIVE data binding to Apex methods or Lightning Data Service.

### Wiring to Apex
\\\`\\\`\\\`javascript
import { LightningElement, wire } from 'lwc';
import getAccounts from '@salesforce/apex/AccountController.getAccounts';

export default class AccountList extends LightningElement {
    searchTerm = '';

    // Wire to a property — reactive, auto-refreshes when searchTerm changes
    @wire(getAccounts, { searchTerm: '\$searchTerm' })
    accounts;
    // accounts.data and accounts.error are populated automatically

    // Wire to a function — more control
    @wire(getAccounts, { searchTerm: '\$searchTerm' })
    wiredAccounts({ error, data }) {
        if (data) {
            this.accounts = data;
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.accounts = undefined;
        }
    }
}
\\\`\\\`\\\`

### Wire Service Rules
- Parameters prefixed with \$ are REACTIVE — wire re-invokes when they change
- Wire results are READ-ONLY (immutable). To modify, spread into a new object/array.
- Wire is provisioned AFTER connectedCallback but timing is not guaranteed
- Wire caches results — same parameters return cached data
- Use refreshApex() to force re-fetch:
\\\`\\\`\\\`javascript
import { refreshApex } from '@salesforce/apex';

// Store the wire result reference
@wire(getAccounts, { searchTerm: '\$searchTerm' })
wiredResult;

handleRefresh() {
    return refreshApex(this.wiredResult);
}
\\\`\\\`\\\`

## Imperative Apex Calls

Use when you need to:
- Call Apex on a user action (button click)
- Pass complex parameters
- Handle the response before displaying

\\\`\\\`\\\`javascript
import getAccountById from '@salesforce/apex/AccountController.getAccountById';

async handleClick() {
    try {
        this.account = await getAccountById({ accountId: this.recordId });
    } catch (error) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: error.body.message,
                variant: 'error'
            })
        );
    }
}
\\\`\\\`\\\`

### @wire vs Imperative

| Criteria | @wire | Imperative |
|----------|-------|-----------|
| Auto-refresh on param change | Yes | No |
| Caching | Yes (LDS-aware) | No |
| Call on user action | Not ideal | Yes |
| Error handling | Declarative | try/catch |
| Complex params | Limited | Full control |
| Use for initial data load | Yes | Possible but @wire is better |

## Component Communication Patterns

### 1. Parent → Child: @api Properties
\\\`\\\`\\\`javascript
// Child component
export default class ChildComponent extends LightningElement {
    @api recordId;     // Set by parent
    @api accountName;  // Set by parent

    // Public method callable by parent
    @api
    refreshData() {
        // ...
    }
}
\\\`\\\`\\\`
\\\`\\\`\\\`html
<!-- Parent template -->
<c-child-component record-id={selectedId} account-name={name}></c-child-component>
\\\`\\\`\\\`

### 2. Child → Parent: Custom Events
\\\`\\\`\\\`javascript
// Child dispatches event
this.dispatchEvent(new CustomEvent('accountselected', {
    detail: { accountId: this.account.Id, accountName: this.account.Name }
}));
\\\`\\\`\\\`
\\\`\\\`\\\`html
<!-- Parent handles event (note: lowercase, no "on" prefix in JS, but "on" prefix in HTML) -->
<c-child-component onaccountselected={handleAccountSelected}></c-child-component>
\\\`\\\`\\\`

Event naming rules:
- Event name must be lowercase, no hyphens
- In HTML template: prefix with "on" (onaccountselected)
- In JS: use the name without "on" (accountselected)

### 3. Sibling Communication: Lightning Message Service (LMS)
\\\`\\\`\\\`javascript
import { publish, subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import ACCOUNT_SELECTED from '@salesforce/messageChannel/AccountSelected__c';

// Publisher
@wire(MessageContext) messageContext;

handleSelect(event) {
    const payload = { accountId: event.detail.accountId };
    publish(this.messageContext, ACCOUNT_SELECTED, payload);
}

// Subscriber (different component)
@wire(MessageContext) messageContext;
subscription = null;

connectedCallback() {
    this.subscription = subscribe(this.messageContext, ACCOUNT_SELECTED, (message) => {
        this.selectedAccountId = message.accountId;
    });
}

disconnectedCallback() {
    unsubscribe(this.subscription);
    this.subscription = null;
}
\\\`\\\`\\\`

LMS works across:
- LWC to LWC
- LWC to Aura
- LWC to Visualforce
- Across Lightning page regions (even utility bar)

### 4. Pub/Sub Module (Deprecated pattern — use LMS instead)
Custom pubsub utility is legacy. LMS is the standard for cross-component communication.

## Shadow DOM and Styling

LWC uses Shadow DOM for encapsulation:
- Styles in a component do NOT leak out and external styles do NOT leak in
- CSS selectors cannot cross shadow boundaries
- Events with composed: false (default) do NOT cross shadow boundaries
- Events with composed: true and bubbles: true cross shadow boundaries

### Event Propagation Options
\\\`\\\`\\\`javascript
// Stays within component shadow DOM
new CustomEvent('selected', { detail: data });

// Bubbles up through DOM but stops at shadow boundary
new CustomEvent('selected', { bubbles: true, detail: data });

// Crosses shadow boundaries (use sparingly)
new CustomEvent('selected', { bubbles: true, composed: true, detail: data });
\\\`\\\`\\\`

### Styling Across Shadow DOM
- Use CSS custom properties (--my-color) which pierce shadow DOM
- Use SLDS design tokens for consistent styling
- Use :host selector to style the component host element
- Use ::slotted() pseudo-element for slot content styling (limited support)

## Performance Best Practices

1. **Avoid unnecessary re-renders** — only update reactive properties when values actually change
2. **Use tracked fields wisely** — in modern LWC, all fields are reactive; avoid creating computed properties that trigger cascading updates
3. **Debounce user input** — for search fields, wait 300ms after typing stops before calling Apex
4. **Use wire for read data** — caching reduces server round-trips
5. **Lazy load components** — use lwc:if/lwc:elseif/lwc:else (not if:true/if:false which are deprecated)
6. **Minimize DOM manipulation** — let the framework handle it through reactive data binding
7. **Use lightning-record-form / lightning-record-edit-form** for standard CRUD — automatic FLS enforcement, no Apex needed

## Apex Controller Pattern for LWC
\\\`\\\`\\\`apex
public with sharing class AccountController {
    @AuraEnabled(cacheable=true)
    public static List<Account> getAccounts(String searchTerm) {
        String key = '%' + searchTerm + '%';
        return [SELECT Id, Name, Industry FROM Account WHERE Name LIKE :key LIMIT 50];
    }

    @AuraEnabled
    public static Account updateAccount(Account acc) {
        update acc;
        return acc;
    }
}
\\\`\\\`\\\`

- Use cacheable=true for read operations (enables wire caching)
- Do NOT use cacheable=true for DML operations (cache prevents fresh data)
- Use "with sharing" to enforce record-level security
`;
