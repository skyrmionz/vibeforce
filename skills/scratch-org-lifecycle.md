---
name: Scratch Org Lifecycle
description: Create, configure, push source, assign permission sets, load data, run tests, and delete Salesforce scratch orgs
trigger: When user asks to create a scratch org, set up a development environment, spin up a new org, or manage scratch org lifecycle
tools_used: execute, read_file, write_file, edit_file
---

# Scratch Org Lifecycle Skill

Manage the full lifecycle of Salesforce scratch orgs: create, configure, push, test, and tear down.

## Prerequisites

Before starting, verify the Salesforce CLI is installed and a Dev Hub is authorized:

```
execute("sf version")
execute("sf org list --all")
```

If `sf` is not found, instruct the user:
- macOS: `brew install sf`
- npm: `npm install -g @salesforce/cli`

If no Dev Hub is authorized:
```
execute("sf org login web --set-default-dev-hub --alias DevHub")
```

Verify Dev Hub status:
```
execute("sf org display --target-org DevHub")
```

## Workflow

### Step 1: Verify SFDX Project Structure

Check that the current directory is a valid SFDX project:

```
execute("cat sfdx-project.json")
```

If `sfdx-project.json` does not exist, initialize the project:

```
execute("sf project generate --name my-project --template standard")
```

Verify the project structure contains:
- `sfdx-project.json` (project definition)
- `config/project-scratch-def.json` (scratch org definition)
- `force-app/main/default/` (source directory)

### Step 2: Create or Update the Scratch Org Definition

Read the existing definition:

```
execute("cat config/project-scratch-def.json")
```

If it does not exist or needs updating, create it:

```json
{
  "orgName": "My Dev Org",
  "edition": "Developer",
  "features": [
    "EnableSetPasswordInApi",
    "Communities",
    "ServiceCloud",
    "SalesCloud"
  ],
  "settings": {
    "lightningExperienceSettings": {
      "enableS1DesktopEnabled": true
    },
    "mobileSettings": {
      "enableS1EncryptedStoragePref2": false
    },
    "securitySettings": {
      "passwordPolicies": {
        "enableSetPasswordInApi": true
      }
    }
  }
}
```

Common features to include based on project needs:
- `Communities` — Experience Cloud sites
- `ServiceCloud` — Case management, Knowledge, Entitlements
- `SalesCloud` — Opportunities, Forecasting
- `MultiCurrency` — Multi-currency support
- `PersonAccounts` — Person Account record type
- `StateAndCountryPicklist` — State/Country picklists
- `FieldAuditTrail` — Field history tracking
- `PlatformEncryption` — Shield encryption

### Step 3: Create the Scratch Org

Create with a meaningful alias and duration:

```
execute("sf org create scratch --definition-file config/project-scratch-def.json --alias dev-scratch --duration-days 7 --set-default --wait 10")
```

Parameters:
- `--alias`: Short name for referencing the org (use descriptive names)
- `--duration-days`: 1-30 days (default 7). Use 1-3 for CI, 7-14 for active dev, 30 for long projects
- `--set-default`: Make this the default org for sf commands
- `--wait`: Minutes to wait for creation (scratch orgs can take 2-5 minutes)

Verify creation:

```
execute("sf org display --target-org dev-scratch")
```

Record the org ID and username from the output for reference.

### Step 4: Push Source to the Org

Deploy all local source to the scratch org:

```
execute("sf project deploy start --target-org dev-scratch")
```

If there are conflicts or errors, check the deployment status:

```
execute("sf project deploy report")
```

For large projects, deploy in stages:

```
# Deploy custom objects first (dependencies)
execute("sf project deploy start --source-dir force-app/main/default/objects --target-org dev-scratch")

# Then deploy Apex classes
execute("sf project deploy start --source-dir force-app/main/default/classes --target-org dev-scratch")

# Then deploy LWC, Flows, etc.
execute("sf project deploy start --source-dir force-app/main/default/lwc --target-org dev-scratch")
execute("sf project deploy start --source-dir force-app/main/default/flows --target-org dev-scratch")
```

### Step 5: Assign Permission Sets

List available permission sets:

```
execute("sf org list metadata --metadata-type PermissionSet --target-org dev-scratch")
```

Assign needed permission sets to the default user:

```
execute("sf org assign permset --name MyAppPermSet --target-org dev-scratch")
```

For multiple permission sets:

```
execute("sf org assign permset --name PermSet1 --target-org dev-scratch")
execute("sf org assign permset --name PermSet2 --target-org dev-scratch")
```

If using permission set groups:

```
execute("sf org assign permsetgroup --name MyPermSetGroup --target-org dev-scratch")
```

### Step 6: Load Sample Data

If the project has data plans or CSV data files, import them:

```
# Using data import with a plan
execute("sf data import tree --plan data/sample-data-plan.json --target-org dev-scratch")

# Or import individual files
execute("sf data import tree --files data/Account.json --target-org dev-scratch")
execute("sf data import tree --files data/Contact.json --target-org dev-scratch")
```

For bulk data loading:

```
execute("sf data import bulk --sobject Account --file data/accounts.csv --target-org dev-scratch")
```

If no sample data exists, create a data plan from an existing org:

```
execute("sf data export tree --query \"SELECT Id, Name, Industry FROM Account LIMIT 50\" --plan --output-dir data --target-org source-org")
```

### Step 7: Run Post-Setup Scripts

Execute any Apex scripts needed for org configuration:

```
execute("sf apex run --file scripts/setup.apex --target-org dev-scratch")
```

Common post-setup tasks in Apex:

```apex
// Enable features, create default records
Account defaultAccount = new Account(
    Name = 'Test Account',
    Industry = 'Technology'
);
insert defaultAccount;

Contact defaultContact = new Contact(
    FirstName = 'Test',
    LastName = 'User',
    AccountId = defaultAccount.Id,
    Email = 'test@example.com'
);
insert defaultContact;

System.debug('Setup complete: Account=' + defaultAccount.Id + ', Contact=' + defaultContact.Id);
```

### Step 8: Set Password (Optional)

Generate a password for the scratch org user (useful for manual login):

```
execute("sf org generate password --target-org dev-scratch")
```

Display login credentials:

```
execute("sf org display --target-org dev-scratch --verbose")
```

### Step 9: Run Tests

Execute all tests to verify the org is correctly configured:

```
execute("sf apex run test --test-level RunLocalTests --wait 10 --code-coverage --result-format human --target-org dev-scratch")
```

Check results:

```
execute("sf apex get test --test-run-id <test-run-id> --target-org dev-scratch")
```

For specific test classes:

```
execute("sf apex run test --class-names MyClassTest,MyOtherClassTest --wait 10 --target-org dev-scratch")
```

### Step 10: Open the Org

Open the scratch org in a browser:

```
execute("sf org open --target-org dev-scratch")
```

Open a specific page:

```
execute("sf org open --target-org dev-scratch --path /lightning/setup/SetupOneHome/home")
```

### Step 11: Pull Changes Back

After making changes in the scratch org UI, pull them to source:

```
execute("sf project retrieve start --target-org dev-scratch")
```

Check for conflicts:

```
execute("sf project retrieve preview --target-org dev-scratch")
```

### Step 12: Delete the Scratch Org

When finished with development:

```
execute("sf org delete scratch --target-org dev-scratch --no-prompt")
```

Verify deletion:

```
execute("sf org list --all")
```

## Automation: Setup Script

Create a single setup script for the entire lifecycle:

```bash
#!/bin/bash
# scripts/scratch-setup.sh
set -e

ALIAS=${1:-dev-scratch}
DURATION=${2:-7}

echo "Creating scratch org: $ALIAS (${DURATION} days)"
sf org create scratch \
  --definition-file config/project-scratch-def.json \
  --alias "$ALIAS" \
  --duration-days "$DURATION" \
  --set-default \
  --wait 10

echo "Pushing source..."
sf project deploy start --target-org "$ALIAS"

echo "Assigning permission sets..."
sf org assign permset --name MyAppPermSet --target-org "$ALIAS"

echo "Loading sample data..."
sf data import tree --plan data/sample-data-plan.json --target-org "$ALIAS"

echo "Running post-setup scripts..."
sf apex run --file scripts/setup.apex --target-org "$ALIAS"

echo "Running tests..."
sf apex run test --test-level RunLocalTests --wait 10 --target-org "$ALIAS"

echo "Opening org..."
sf org open --target-org "$ALIAS"

echo "Done! Scratch org $ALIAS is ready."
```

## Error Handling & Troubleshooting

### "The scratch org couldn't be created"
- Check Dev Hub limits: `sf limits api display --target-org DevHub`
- Verify active scratch org count: `sf org list --all` (max varies by edition)
- Remove unused scratch orgs to free up slots

### "Source push failed"
- Check for metadata API version conflicts in `sfdx-project.json`
- Look for duplicate API names across metadata types
- Deploy in stages to isolate the failing component
- Check `sf project deploy report` for detailed error messages

### "Permission set assignment failed"
- Verify the permission set exists: `sf data query --query "SELECT Name FROM PermissionSet WHERE Name='MyPermSet'" --target-org dev-scratch`
- Check for license prerequisites (some perm sets require specific licenses)

### "Data import failed"
- Validate JSON format of data files
- Check for missing required fields
- Verify external ID fields exist on target objects
- Import parent records before child records (respect lookup relationships)

### "Tests failing in scratch org"
- Pull the test results: `sf apex get test --test-run-id <id> --target-org dev-scratch`
- Check for missing custom settings or custom metadata
- Run post-setup scripts before tests to ensure test data exists
- Verify all permission sets are assigned

### Scratch org expired
- Scratch orgs auto-delete after their duration
- Create a new one following the full workflow above
- Keep duration-days aligned with your sprint length

### Dev Hub limits reached
- List all active scratch orgs: `sf org list --all`
- Delete unused orgs: `sf org delete scratch --target-org <alias> --no-prompt`
- Check your Salesforce edition's scratch org limit (Developer Edition: 3 active, others vary)
