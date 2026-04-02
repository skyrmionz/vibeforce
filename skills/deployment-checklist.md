---
name: Deployment Checklist
description: Pre-flight validation, deployment sequencing, rollback planning, and post-deployment verification for Salesforce production deployments
trigger: When user asks to deploy to production, prepare a release, validate a deployment, create a rollback plan, or run pre-deployment checks
tools_used: execute, read_file, write_file, edit_file
---

# Deployment Checklist Skill

End-to-end production deployment workflow: pre-flight validation, dependency analysis, sequenced deployment, rollback planning, and post-deployment verification.

## Prerequisites

Verify org connections and CLI:

```
execute("sf version")
execute("sf org display --target-org production")
execute("sf org display --target-org staging")
```

Verify source control is clean:

```
execute("git status")
execute("git log --oneline -10")
```

## Workflow

### Step 1: Pre-Flight Validation

**1.1 Check Source Control State**

Ensure the branch is clean and up to date:

```
execute("git status")
execute("git fetch origin")
execute("git log origin/main..HEAD --oneline")
```

All changes should be committed. No uncommitted work should go to production.

**1.2 Validate Project Structure**

```
execute("cat sfdx-project.json")
execute("sf project deploy validate --source-dir force-app --target-org production --test-level RunLocalTests --wait 60")
```

The `--validate` flag performs a full check-only deployment. This:
- Compiles all Apex
- Runs specified tests
- Validates all metadata
- Does NOT deploy anything
- Creates a validation ID for quick deploy later

Record the validation ID from the output.

**1.3 Code Coverage Check**

Ensure coverage exceeds 75%:

```
execute("sf apex run test --test-level RunLocalTests --code-coverage --result-format json --wait 20 --target-org staging")
```

Parse the results:

```
execute("sf data query --query \"SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate WHERE NumLinesUncovered > 0 ORDER BY NumLinesUncovered DESC\" --target-org staging --result-format table")
```

If any class is below 75%, add tests before proceeding.

**1.4 Dependency Analysis**

Check what metadata is being deployed and its dependencies:

```
execute("sf project deploy preview --source-dir force-app --target-org production")
```

Review the component list for:
- New custom objects (need to deploy before Apex referencing them)
- New fields on existing objects (need to deploy before Apex/Flows using them)
- Changed Apex classes (check for callers that might be affected)
- New/changed Flows (check trigger order)
- Permission changes (deploy last)

**1.5 Check Org Limits**

Verify the target org has capacity:

```
execute("sf limits api display --target-org production")
```

Check for:
- API request limits (daily and concurrent)
- Storage limits (data and file)
- Custom object count limits
- Active flow version limits

### Step 2: Create Rollback Plan

**2.1 Backup Current Metadata**

Retrieve the current state of components being changed:

```
execute("sf project retrieve start --target-org production --output-dir rollback-backup")
```

For specific components:

```
execute("sf project retrieve start --metadata ApexClass:MyChangedClass --target-org production --output-dir rollback-backup")
execute("sf project retrieve start --metadata CustomObject:Account --target-org production --output-dir rollback-backup")
execute("sf project retrieve start --metadata Flow:My_Changed_Flow --target-org production --output-dir rollback-backup")
```

Tag the backup:

```
execute("git stash push rollback-backup/ -m 'Pre-deployment backup'")
```

Or create a timestamped backup directory:

```
execute("cp -r rollback-backup rollback-backup-$(date +%Y%m%d-%H%M%S)")
```

**2.2 Document Rollback Steps**

Create a rollback plan document:

```
Rollback Plan
=============
Deployment Date: [DATE]
Deployer: [NAME]
Validation ID: [ID]

Components Changed:
- ApexClass: MyService (modified)
- ApexClass: MyController (new)
- CustomField: Account.New_Field__c (new)
- Flow: Account_After_Update (modified)

Rollback Steps:
1. Deploy rollback-backup/ to production:
   sf project deploy start --source-dir rollback-backup --target-org production
2. If new components were added, delete them:
   sf project deploy start --metadata ApexClass:MyController --target-org production --type delete
3. Run all tests after rollback:
   sf apex run test --test-level RunLocalTests --wait 20 --target-org production
4. Verify functionality in production

Rollback Time Estimate: 15 minutes
```

### Step 3: Deployment Sequencing

Deploy metadata in the correct order to avoid dependency failures:

**Phase 1: Schema Changes (objects, fields)**

```
execute("sf project deploy start --source-dir force-app/main/default/objects --target-org production --wait 30")
```

Verify:

```
execute("sf project deploy report")
```

**Phase 2: Apex Code (classes, triggers)**

```
execute("sf project deploy start --source-dir force-app/main/default/classes --target-org production --wait 30")
execute("sf project deploy start --source-dir force-app/main/default/triggers --target-org production --wait 30")
```

**Phase 3: Automation (flows, process builders)**

```
execute("sf project deploy start --source-dir force-app/main/default/flows --target-org production --wait 30")
```

**Phase 4: UI Components (LWC, Aura, Visualforce)**

```
execute("sf project deploy start --source-dir force-app/main/default/lwc --target-org production --wait 30")
execute("sf project deploy start --source-dir force-app/main/default/aura --target-org production --wait 30")
execute("sf project deploy start --source-dir force-app/main/default/pages --target-org production --wait 30")
```

**Phase 5: Configuration (layouts, apps, flexipages)**

```
execute("sf project deploy start --source-dir force-app/main/default/layouts --target-org production --wait 30")
execute("sf project deploy start --source-dir force-app/main/default/flexipages --target-org production --wait 30")
execute("sf project deploy start --source-dir force-app/main/default/applications --target-org production --wait 30")
```

**Phase 6: Security (permission sets, profiles, sharing rules)**

```
execute("sf project deploy start --source-dir force-app/main/default/permissionsets --target-org production --wait 30")
execute("sf project deploy start --source-dir force-app/main/default/permissionsetgroups --target-org production --wait 30")
```

### Step 4: Quick Deploy (Recommended for Production)

If you validated in Step 1.2, use quick deploy to skip re-running tests:

```
execute("sf project deploy quick --job-id <validation-job-id> --target-org production --wait 30")
```

Quick deploy benefits:
- Uses the already-validated deployment
- Skips test execution (already passed during validation)
- Much faster than a full deployment
- Valid for 10 days after validation

### Step 5: Post-Deployment Verification

**5.1 Run Full Test Suite**

```
execute("sf apex run test --test-level RunLocalTests --code-coverage --wait 30 --target-org production")
```

**5.2 Verify Deployed Components**

Check that all components are present:

```
execute("sf project deploy report")
```

Query specific metadata:

```
execute("sf data query --query \"SELECT Name, Status FROM ApexClass WHERE Name IN ('MyService','MyController') ORDER BY Name\" --target-org production --result-format table")
```

Verify flows are active:

```
execute("sf data query --query \"SELECT MasterLabel, Status, VersionNumber FROM FlowDefinitionView WHERE MasterLabel = 'Account After Update'\" --target-org production --result-format json")
```

**5.3 Smoke Test Critical Functionality**

Run targeted tests for the changed components:

```
execute("sf apex run test --class-names MyServiceTest,MyControllerTest --wait 15 --target-org production")
```

**5.4 Check Error Logs**

Monitor for new errors in the 15 minutes after deployment:

```
execute("sf data query --query \"SELECT Id, LogLength, Operation, Status, DurationMilliseconds, StartTime FROM ApexLog WHERE Status = 'Error' AND StartTime > LAST_N_MINUTES:15 ORDER BY StartTime DESC\" --target-org production --result-format table")
```

**5.5 Verify User Access**

Ensure permission changes took effect:

```
execute("sf data query --query \"SELECT Assignee.Name, PermissionSet.Name FROM PermissionSetAssignment WHERE PermissionSet.Name IN ('MyNewPermSet') ORDER BY Assignee.Name\" --target-org production --result-format table")
```

### Step 6: Post-Deployment Tasks

**6.1 Run Data Migration Scripts (if any)**

```
execute("sf apex run --file scripts/post-deploy-data.apex --target-org production")
```

**6.2 Activate Scheduled Jobs**

```apex
// scripts/schedule-jobs.apex
// Schedule new batch jobs
System.schedule('Nightly Cleanup', '0 0 2 * * ?', new AccountCleanupScheduler());
System.debug('Scheduled jobs activated');
```

```
execute("sf apex run --file scripts/schedule-jobs.apex --target-org production")
```

**6.3 Update External Integrations**

If API changes were deployed, notify integration partners and update documentation.

**6.4 Tag the Release**

```
execute("git tag -a v1.2.0 -m 'Production release 1.2.0 - Account automation updates'")
execute("git push origin v1.2.0")
```

## Risk Assessment Framework

Before deploying, assess risk level:

| Risk Level | Criteria | Approval Needed |
|-----------|----------|-----------------|
| **Low** | Config-only changes (layouts, page assignments), no Apex/Flow changes | Self-approve |
| **Medium** | New Apex classes, new Flows, new fields | Peer review |
| **High** | Modified existing Apex/Flows, schema changes to existing objects, permission changes | Tech lead approval |
| **Critical** | Trigger changes, sharing rule changes, profile modifications, data model changes | Release manager + stakeholder sign-off |

## Deployment Timing

| Scenario | Recommended Window |
|----------|-------------------|
| Low risk | Any time during business hours |
| Medium risk | Early morning or late afternoon |
| High risk | After business hours, with rollback window |
| Critical | Weekend maintenance window |

## Full Deployment vs. Delta Deployment

| Approach | When to Use | Command |
|----------|-------------|---------|
| **Full deploy** | First deployment, major releases | `sf project deploy start --source-dir force-app` |
| **Delta deploy** | Incremental changes, hotfixes | `sf project deploy start --metadata ApexClass:MyClass,CustomField:Account.New__c` |
| **Manifest deploy** | Controlled subset of components | `sf project deploy start --manifest manifest/package.xml` |
| **Quick deploy** | After successful validation | `sf project deploy quick --job-id <id>` |

Create a manifest for controlled deployments:

```xml
<!-- manifest/package.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <types>
        <members>MyService</members>
        <members>MyController</members>
        <members>MyServiceTest</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>AccountTrigger</members>
        <name>ApexTrigger</name>
    </types>
    <types>
        <members>Account_After_Update</members>
        <name>Flow</name>
    </types>
    <version>62.0</version>
</Package>
```

```
execute("sf project deploy start --manifest manifest/package.xml --target-org production --test-level RunSpecifiedTests --tests MyServiceTest,MyControllerTest --wait 30")
```

## Error Handling & Troubleshooting

### "Deployment failed: Test failure"
- Check which tests failed: `sf project deploy report`
- Run the failing tests individually in a sandbox to debug
- Fix test failures before re-validating
- Do NOT use `--test-level NoTestRun` for production

### "Deployment failed: Missing dependency"
- Check deployment order — deploy dependencies first
- Look for missing custom objects, fields, or Apex classes referenced by the component
- Use manifest (`package.xml`) to deploy all dependencies together

### "Quick deploy expired"
- Validations expire after 10 days
- Re-run the validation: `sf project deploy validate --source-dir force-app --target-org production --test-level RunLocalTests --wait 60`
- Then quick deploy with the new job ID

### "Cannot delete component — it is referenced"
- Query what references the component: check Apex classes, Flows, layouts, and permission sets
- Remove references first, deploy the removal, then delete the component
- Use `sf project deploy start --metadata ApexClass:OldClass --type delete` for destructive changes

### "Deployment timeout"
- Increase `--wait` time (production can take 60+ minutes for large deployments)
- Check deployment status manually: `sf project deploy report`
- Consider breaking the deployment into smaller phases

### Rollback needed
1. Stop any running deployment: `sf project deploy cancel`
2. Deploy the rollback backup: `sf project deploy start --source-dir rollback-backup --target-org production`
3. Delete any new components added in the failed deployment
4. Run all tests to verify rollback: `sf apex run test --test-level RunLocalTests --wait 30 --target-org production`
5. Notify stakeholders of the rollback
6. Post-mortem: analyze what went wrong before re-attempting

### Partial deployment failure
- Some components deployed successfully, others failed
- Do NOT re-deploy the entire package (would duplicate already-deployed components)
- Fix the failing components and deploy ONLY those
- Or roll back everything to a known-good state
