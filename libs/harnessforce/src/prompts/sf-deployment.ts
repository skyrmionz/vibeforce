/**
 * Deep Salesforce deployment strategy prompt.
 */

export const SF_DEPLOYMENT_PROMPT = `# Salesforce Deployment Strategy — Deep Reference

## Deployment Order (Critical)

Metadata types have dependencies. Deploy in this order to avoid failures:

1. **Custom Objects & Fields** — other metadata references these
2. **Apex Classes** (non-test) — triggers, flows, and pages may reference them
3. **Apex Triggers** — depend on objects and classes
4. **Flows** — depend on objects, fields, and sometimes Apex invocable actions
5. **Visualforce Pages & Components** — depend on controllers (Apex classes)
6. **Lightning Web Components** — depend on Apex controllers
7. **Layouts & Record Types** — depend on fields
8. **Profiles & Permission Sets** — depend on objects, fields, classes, pages, flows
9. **Apps & Tabs** — depend on objects, pages, components
10. **Custom Labels & Custom Metadata** — can go early if other metadata depends on them; otherwise last

If deploying everything at once (source deploy), Salesforce resolves dependencies automatically — but if it fails, deploy in this order to isolate the issue.

## Deployment Methods

### Source Deploy (sf project deploy start)
- **Modern, recommended** approach for source-tracked projects
- Deploys source format directly from local project
- Supports delta deployments (only changed files)
- Validates and deploys in one step (or validation only with --dry-run)
\\\`\\\`\\\`bash
# Full deployment
sf project deploy start --target-org production

# Validation only (no actual deploy)
sf project deploy start --target-org production --dry-run

# Deploy specific files
sf project deploy start --source-dir force-app/main/default/classes/MyClass.cls

# Deploy with test execution
sf project deploy start --target-org production --test-level RunLocalTests

# Quick deploy from a previous successful validation
sf project deploy quick --job-id 0Af... --target-org production
\\\`\\\`\\\`

If delta deploys fail due to source tracking issues, clear the tracking cache with \`sf project deploy start --source-dir force-app\` (full deploy) to reset.

### Change Sets (Legacy)
- Point-and-click in Setup UI
- Cannot be version-controlled
- No rollback mechanism
- Cannot automate
- Still used in many orgs — but migrate to source deploy when possible

### Packages (2GP / Unlocked)
- Self-contained metadata bundles with version history
- Install/upgrade/uninstall cleanly
- Best for ISVs and modular development
\\\`\\\`\\\`bash
# Create package
sf package create --name "MyPackage" --package-type Unlocked --path force-app

# Create version
sf package version create --package "MyPackage" --installation-key mykey --wait 20

# Install in target org
sf package install --package 04t... --target-org production --wait 15
\\\`\\\`\\\`

### Metadata API (Direct)
- Low-level API for deploy/retrieve zip files
- Used by sf CLI under the hood
- Useful for scripted pipelines or custom tooling

## Test Levels for Deployment

| Level | What It Runs | When to Use |
|-------|-------------|-------------|
| NoTestRun | No tests | Sandbox deployments (non-production) |
| RunSpecifiedTests | Named test classes only | Production: when you know which tests cover your changes |
| RunLocalTests | All tests in the org except managed package tests | Production: standard safe choice |
| RunAllTestsInOrg | ALL tests including managed packages | Production: when managed packages might be affected |

For PRODUCTION deployments:
- Minimum: RunSpecifiedTests with classes covering your changes
- Recommended: RunLocalTests (catches unexpected failures)
- Required: 75% overall code coverage after deployment

## Pre-Deployment Checklist

1. **Validate first** — always run with --dry-run before actual deploy
   Note: A successful validation does NOT guarantee deployment success. Changes by other users, time-dependent logic, or data differences can cause deployment to fail even after validation passes.
2. **Check test coverage** — ensure all new/modified Apex has adequate coverage
3. **Review dependencies** — will removing a field break a flow/class?
4. **Backup metadata** — retrieve current state before deploying
\\\`\\\`\\\`bash
sf project retrieve start --target-org production --output-dir backup/
\\\`\\\`\\\`
5. **Check for destructive changes** — removing metadata requires destructiveChanges.xml
6. **Verify profiles/permission sets** — field additions need FLS grants
7. **Check for data-dependent changes** — new required fields need default values or data migration
8. **Review managed package dependencies** — ensure required packages are installed

## Post-Deployment Checklist

1. **Run full test suite** — RunLocalTests to verify nothing broke
2. **Spot-check functionality** — manually verify critical user flows
3. **Monitor error logs** — check Setup → Debug Logs and Apex Exception Email
4. **Verify integrations** — external systems still connect/authenticate
5. **Check scheduled jobs** — Apex scheduled jobs may need re-scheduling after deploy
6. **Validate page layouts** — new fields visible where expected
7. **Clear caches** — Salesforce may cache old component versions

## Rollback Strategies

### Strategy 1: Retrieve Before Deploy (Recommended)
\\\`\\\`\\\`bash
# Before deploy — save current state
sf project retrieve start --target-org production --output-dir rollback-backup/

# If deployment fails or causes issues
sf project deploy start --source-dir rollback-backup/ --target-org production
\\\`\\\`\\\`

### Strategy 2: Quick Deploy from Previous Validation
If you validated a deployment that you want to undo:
\\\`\\\`\\\`bash
# Validate the rollback deployment
sf project deploy start --source-dir rollback-backup/ --target-org production --dry-run

# Quick deploy the validated rollback
sf project deploy quick --job-id 0Af... --target-org production
\\\`\\\`\\\`

### Strategy 3: Git-Based Rollback
\\\`\\\`\\\`bash
# Revert to previous commit
git checkout HEAD~1 -- force-app/

# Deploy the reverted state
sf project deploy start --source-dir force-app/ --target-org production
\\\`\\\`\\\`

### What Cannot Be Easily Rolled Back
- Destructive changes (deleted metadata) — must re-deploy from backup
- Data changes (new required fields with data migration) — need reverse migration
- Permission removals — users may lose access; re-granting requires careful attention
- Installed packages — uninstall may fail if dependencies exist

## Destructive Deployments

To DELETE metadata from an org:
\\\`\\\`\\\`xml
<!-- destructiveChanges.xml (processed BEFORE the deploy) -->
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>MyOldClass</members>
        <name>ApexClass</name>
    </types>
    <version>62.0</version>
</Package>
\\\`\\\`\\\`

\\\`\\\`\\\`xml
<!-- destructiveChangesPost.xml (processed AFTER the deploy) -->
<!-- Use this when you need to deploy replacements before removing old components -->
\\\`\\\`\\\`

Deploy with:
\\\`\\\`\\\`bash
sf project deploy start --metadata-dir deploy-package/ --target-org production
# The deploy-package/ folder contains package.xml + destructiveChanges.xml
\\\`\\\`\\\`

## CI/CD Pipeline Pattern

\\\`\\\`\\\`yaml
# GitHub Actions example
name: Salesforce Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install SF CLI
        run: npm install -g @salesforce/cli
      - name: Authenticate
        run: sf org login jwt --client-id \${{ secrets.SF_CLIENT_ID }} --jwt-key-file server.key --username \${{ secrets.SF_USERNAME }} --instance-url https://login.salesforce.com --alias production
      - name: Validate
        run: sf project deploy start --target-org production --dry-run --test-level RunLocalTests
      - name: Deploy
        run: sf project deploy start --target-org production --test-level RunLocalTests
\\\`\\\`\\\`

## Risk Assessment Framework

| Risk Level | Criteria | Approach |
|-----------|---------|----------|
| Low | New class/component, no existing dependencies | Deploy directly with RunSpecifiedTests |
| Medium | Modified existing class, field additions | Validate first, RunLocalTests, monitor after |
| High | Schema changes, trigger modifications, profile changes | Validate, deploy to staging first, RunLocalTests, manual QA |
| Critical | Destructive changes, sharing rule changes, security changes | Full backup, deploy off-hours, RunAllTestsInOrg, dedicated rollback plan |
`;
