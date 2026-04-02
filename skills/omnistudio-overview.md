---
name: OmniStudio Overview
description: Understand and work with OmniStudio components — OmniScript, FlexCard, DataRaptor/DataMapper, and Integration Procedures
trigger: When user asks about OmniStudio, OmniScript, FlexCard, DataRaptor, DataMapper, Integration Procedures, or Vlocity components
tools_used: execute, read_file, write_file
---

# OmniStudio Overview Skill

Overview of OmniStudio components, namespace detection, component selection, and basic creation patterns. For deep OmniStudio customization, consider installing the dedicated sf-skills OmniStudio skill pack.

## What Is OmniStudio?

OmniStudio is Salesforce's low-code toolset for building guided, industry-specific experiences. It was originally part of Vlocity (acquired by Salesforce) and is now standard in Salesforce Industries.

**Core components:**

| Component | Purpose | Analogy |
|-----------|---------|---------|
| **OmniScript** | Multi-step guided forms / wizards | Screen Flow on steroids |
| **FlexCard** | Dynamic data display cards | LWC component builder |
| **DataRaptor** (legacy) | Read/write/transform Salesforce data | SOQL + DML in a visual tool |
| **DataMapper** (current) | Successor to DataRaptor for transforms | Modern data mapping |
| **Integration Procedure** | Server-side orchestration of data operations | Apex without code |

## Namespace Detection

OmniStudio uses different namespaces depending on the org type. Detect before doing anything:

```
execute("sf data query --query \"SELECT NamespacePrefix FROM PackageLicense WHERE NamespacePrefix IN ('omnistudio','vlocity_cmt','vlocity_ins','vlocity_ps') LIMIT 5\" --target-org target-org --result-format json")
```

| Namespace | Org Type |
|-----------|----------|
| `omnistudio` | Standard OmniStudio (Industries managed package or core) |
| `vlocity_cmt` | Communications, Media & Technology cloud |
| `vlocity_ins` | Insurance / Financial Services cloud |
| `vlocity_ps` | Public Sector cloud |
| (none) | OmniStudio is not installed |

**Always prefix API calls and metadata queries with the detected namespace.** Example:

```
execute("sf data query --query \"SELECT Id, Name, vlocity_cmt__Type__c FROM vlocity_cmt__OmniScript__c LIMIT 10\" --target-org target-org --result-format json")
```

Or for omnistudio namespace:

```
execute("sf data query --query \"SELECT Id, Name, omnistudio__Type__c FROM omnistudio__OmniScript__c LIMIT 10\" --target-org target-org --result-format json")
```

## When to Use Each Component

### Decision Tree

```
Need to build a guided, multi-step experience?
  └── YES → OmniScript
  └── NO →
      Need to display contextual data on a record page?
        └── YES → FlexCard
        └── NO →
            Need to read/write/transform Salesforce data without code?
              └── YES →
                  Simple read/write? → DataRaptor Extract/Load
                  Complex transform? → DataMapper
              └── NO →
                  Need to orchestrate multiple data operations?
                    └── YES → Integration Procedure
                    └── NO → Standard Flow or Apex may be better
```

### OmniScript vs Screen Flow

| Feature | OmniScript | Screen Flow |
|---------|-----------|-------------|
| Multi-step wizard | Excellent (built-in step navigation) | Possible but requires manual design |
| Conditional branching | Visual branching with conditions | Yes (decision elements) |
| Prefill from data | DataRaptor integration (zero code) | Get Records element |
| Custom UI | Extensive theming, custom LWC embed | Limited styling |
| Industries features | Document generation, contract, e-sign | None |
| Learning curve | Higher (OmniStudio-specific) | Lower (standard Salesforce) |
| Deployment | OmniStudio migration / metadata | Change sets, metadata API |
| When to choose | Complex industry processes | Simple internal forms |

### FlexCard vs LWC

| Feature | FlexCard | Custom LWC |
|---------|----------|-----------|
| Build speed | Fast (drag and drop) | Slower (code) |
| Data source | DataRaptor, Integration Procedure, SOQL, Apex | Apex, wire adapters |
| Customization | Moderate (can embed LWC) | Unlimited |
| Styling | Template-based with themes | Full CSS control |
| When to choose | Rapid prototyping, standard patterns | Unique/complex UI |

## OmniScript Basics

### List Existing OmniScripts

```
execute("sf data query --query \"SELECT Id, Name, {ns}__Type__c, {ns}__SubType__c, {ns}__Language__c, {ns}__Version__c, {ns}__IsActive__c FROM {ns}__OmniScript__c ORDER BY Name\" --target-org target-org --result-format table")
```

(Replace `{ns}` with your detected namespace.)

### OmniScript Structure

An OmniScript is identified by three keys:
- **Type** — Category (e.g., "Enrollment", "ServiceRequest")
- **SubType** — Specific variant (e.g., "NewMember", "ChangeAddress")
- **Language** — Language code (e.g., "English")

Each OmniScript contains **elements** (steps, fields, actions):

| Element Type | Description |
|-------------|-------------|
| Step | A page/screen in the wizard |
| Text | Static text or instructions |
| Input (Text, Number, Date, etc.) | User input fields |
| Radio / Checkbox / Select | Selection fields |
| DataRaptor Extract Action | Pull data into the script |
| DataRaptor Post Action | Save data from the script |
| Integration Procedure Action | Call a server-side procedure |
| Remote Action | Call Apex |
| Navigate Action | Redirect user |
| Conditional | Show/hide based on data |

### Activate an OmniScript

OmniScripts must be activated before use:

```
execute("sf data query --query \"SELECT Id, Name, {ns}__IsActive__c FROM {ns}__OmniScript__c WHERE Name = 'MyOmniScript'\" --target-org target-org --result-format json")
```

Activate via update:

```
execute("sf data update record --sobject {ns}__OmniScript__c --record-id <id> --values \"{ns}__IsActive__c=true\" --target-org target-org")
```

## FlexCard Basics

### List Existing FlexCards

```
execute("sf data query --query \"SELECT Id, Name, {ns}__IsActive__c, {ns}__Description__c FROM {ns}__OmniCard__c ORDER BY Name\" --target-org target-org --result-format table")
```

### FlexCard Data Sources

FlexCards pull data from one of these sources:

| Source | When to Use |
|--------|------------|
| DataRaptor | Standard Salesforce data reads |
| Integration Procedure | Complex/combined data from multiple objects |
| SOQL | Simple single-object queries |
| Apex (REST) | Custom logic or external data |
| Streaming API | Real-time data updates |

### FlexCard Structure

- **States** — Different visual states (default, loading, empty, error)
- **Data source** — Where data comes from
- **Fields** — What data to display
- **Actions** — Buttons/links (navigate, call OmniScript, call Apex)
- **Child cards** — Nested FlexCards for related data
- **Flyouts** — Expandable detail sections

## DataRaptor / DataMapper Basics

### DataRaptor Types

| Type | Purpose | Direction |
|------|---------|-----------|
| **Extract** | Read data from Salesforce | Salesforce → JSON |
| **Load** | Write data to Salesforce | JSON → Salesforce |
| **Transform** | Reshape data structures | JSON → JSON |
| **Turbo Extract** | High-performance read (batch) | Salesforce → JSON (fast) |

### List DataRaptors

```
execute("sf data query --query \"SELECT Id, Name, {ns}__Type__c, {ns}__InterfaceObject__c FROM {ns}__DRBundle__c ORDER BY Name\" --target-org target-org --result-format table")
```

### DataMapper

DataMapper is the modern replacement for DataRaptor Transform. Use it for:
- Mapping fields between different JSON structures
- Applying formulas during transformation
- Conditional field mapping
- Merging data from multiple sources

## Integration Procedure Basics

### What Integration Procedures Do

Integration Procedures are server-side orchestrations that combine multiple data operations into a single callable unit:

1. Read data (DataRaptor Extract)
2. Transform data (DataMapper)
3. Call external APIs (HTTP Action)
4. Write data (DataRaptor Load)
5. Execute Apex (Remote Action)
6. Conditional branching

### List Integration Procedures

```
execute("sf data query --query \"SELECT Id, Name, {ns}__Type__c, {ns}__SubType__c, {ns}__IsActive__c FROM {ns}__OmniProcess__c WHERE {ns}__IsIntegrationProcedure__c = true ORDER BY Name\" --target-org target-org --result-format table")
```

### Calling an Integration Procedure

From Apex:

```apex
Map<String, Object> input = new Map<String, Object>{
    'accountId' => '001xx000003DGb0'
};
Map<String, Object> output = new Map<String, Object>();
Map<String, Object> options = new Map<String, Object>();

// Replace namespace as appropriate
omnistudio.IntegrationProcedureService.runIntegrationService(
    'Type_SubType',  // Type/SubType of the Integration Procedure
    input,
    output,
    options
);
System.debug('Result: ' + output);
```

From REST API:

```
POST /services/apexrest/{ns}/v1/integrationprocedure/Type_SubType
Content-Type: application/json
{
    "accountId": "001xx000003DGb0"
}
```

## Dependency Analysis

OmniStudio components reference each other. Before modifying or deleting, check dependencies:

### What References What

```
OmniScript
  ├── DataRaptor Extract (prefill data)
  ├── DataRaptor Load (save data)
  ├── Integration Procedure (server-side logic)
  ├── FlexCard (embedded display)
  └── Custom LWC (embedded components)

FlexCard
  ├── DataRaptor Extract (data source)
  ├── Integration Procedure (data source)
  └── OmniScript (action launch)

Integration Procedure
  ├── DataRaptor Extract (read step)
  ├── DataRaptor Load (write step)
  ├── DataMapper (transform step)
  ├── HTTP Action (external callout)
  └── Remote Action (Apex)
```

### Find Dependencies

```
execute("sf data query --query \"SELECT Id, Name, {ns}__Type__c, {ns}__PropertySet__c FROM {ns}__Element__c WHERE {ns}__PropertySet__c LIKE '%DataRaptorName%' LIMIT 50\" --target-org target-org --result-format json")
```

## Migration / Deployment

### Export OmniStudio Components

```
execute("sf omnistudio migrate --from target-org --type OmniScript --name MyOmniScript/SubType/English --output-dir omnistudio-export/")
```

### Deploy OmniStudio Components

```
execute("sf omnistudio migrate --to target-org --input-dir omnistudio-export/")
```

### Version Considerations

- OmniStudio versions are independent of Salesforce API versions
- Deactivate old versions before activating new ones
- Only one version of a Type/SubType/Language combination can be active

## Error Handling & Troubleshooting

### "No namespace found"
- OmniStudio is not installed in the org
- Check: Setup > Installed Packages
- Industries clouds include OmniStudio automatically

### OmniScript shows blank page
- Check browser console for LWC errors
- Verify the OmniScript is activated
- Check that all referenced DataRaptors exist and are active

### DataRaptor returns empty results
- Verify the extract query fields and filters
- Check FLS — the running user must have field access
- Test the underlying SOQL manually

### Integration Procedure timeout
- Default timeout is 120 seconds
- Break large procedures into smaller steps
- Use async patterns for long-running operations

### FlexCard shows "No data available"
- Check the data source configuration
- Verify the context record ID is being passed
- Test the DataRaptor/Integration Procedure independently

### Deployment fails with "Element not found"
- Export and deploy all dependent components together
- Deploy DataRaptors before OmniScripts that reference them
- Deploy in order: DataRaptor → Integration Procedure → FlexCard → OmniScript
