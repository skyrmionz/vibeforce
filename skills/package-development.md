---
name: Package Development
description: Create, version, promote, and install Salesforce unlocked and managed packages
trigger: When user asks to create a package, manage package versions, promote a package, install a package, or set up 2GP packaging
tools_used: execute, read_file, write_file, edit_file
---

# Package Development Skill

Full lifecycle for Salesforce second-generation packages (2GP): create packages, build versions, promote to released, and install across orgs.

## Prerequisites

Verify SF CLI, Dev Hub authorization, and namespace org (for managed packages):

```
execute("sf version")
execute("sf org display --target-org DevHub")
```

Verify the project has a valid `sfdx-project.json`:

```
execute("cat sfdx-project.json")
```

The Dev Hub must have "Unlocked Packages and Second-Generation Managed Packages" enabled in Setup > Dev Hub.

## Workflow

### Step 1: Determine Package Type

Choose the appropriate package type:

| Type | Use Case | Namespace | Upgradeable | ISV |
|------|----------|-----------|-------------|-----|
| **Unlocked** | Internal apps, open source | Optional | Yes | No |
| **Managed 2GP** | ISV distribution, AppExchange | Required | Yes (managed) | Yes |
| **Org-Dependent Unlocked** | Org-specific extensions | No | Yes | No |

Ask the user which type fits their needs before proceeding.

### Step 2: Configure sfdx-project.json

Ensure the project file has the correct structure:

```json
{
  "packageDirectories": [
    {
      "path": "force-app",
      "default": true,
      "package": "MyPackage",
      "versionName": "ver 1.0",
      "versionNumber": "1.0.0.NEXT",
      "versionDescription": "Initial release"
    }
  ],
  "name": "my-project",
  "namespace": "",
  "sfdcLoginUrl": "https://login.salesforce.com",
  "sourceApiVersion": "62.0"
}
```

For managed packages, set the namespace:

```json
{
  "namespace": "myns",
  "packageDirectories": [
    {
      "path": "force-app",
      "default": true,
      "package": "MyManagedPackage",
      "versionName": "Winter 25",
      "versionNumber": "1.0.0.NEXT"
    }
  ]
}
```

### Step 3: Create the Package

For an unlocked package:

```
execute("sf package create --name MyPackage --package-type Unlocked --path force-app --target-dev-hub DevHub --description 'My unlocked package'")
```

For a managed package:

```
execute("sf package create --name MyManagedPackage --package-type Managed --path force-app --target-dev-hub DevHub --description 'My managed package'")
```

For an org-dependent unlocked package:

```
execute("sf package create --name MyOrgDepPackage --package-type Unlocked --path force-app --target-dev-hub DevHub --no-namespace --org-dependent")
```

This updates `sfdx-project.json` with a `packageAliases` entry containing the package ID (0Ho...).

Verify the package was created:

```
execute("sf package list --target-dev-hub DevHub")
```

### Step 4: Add Package Dependencies (if needed)

If the package depends on other packages, add them to `sfdx-project.json`:

```json
{
  "packageDirectories": [
    {
      "path": "force-app",
      "default": true,
      "package": "MyPackage",
      "versionNumber": "1.0.0.NEXT",
      "dependencies": [
        {
          "package": "DependencyPackage",
          "versionNumber": "2.0.0.LATEST"
        },
        {
          "package": "04t000000000000AAA"
        }
      ]
    }
  ]
}
```

### Step 5: Create a Package Version

Build a beta version:

```
execute("sf package version create --package MyPackage --installation-key test1234 --wait 15 --target-dev-hub DevHub --code-coverage")
```

Parameters:
- `--installation-key`: Password required to install (use empty string for no key: `--installation-key ''`)
- `--wait`: Minutes to wait (version creation can take 5-30 minutes)
- `--code-coverage`: Calculate and enforce 75% code coverage
- `--skip-validation`: Skip test execution (faster, but cannot be promoted)

Check version creation status:

```
execute("sf package version create report --package-create-request-id 08c... --target-dev-hub DevHub")
```

List all versions:

```
execute("sf package version list --packages MyPackage --target-dev-hub DevHub --verbose")
```

### Step 6: Test the Package Version

Install the beta version in a scratch org or sandbox:

```
execute("sf org create scratch --definition-file config/project-scratch-def.json --alias pkg-test --duration-days 3 --target-dev-hub DevHub")
execute("sf package install --package MyPackage@1.0.0-1 --target-org pkg-test --wait 10 --installation-key test1234")
```

Verify the installation:

```
execute("sf package installed list --target-org pkg-test")
```

Run tests in the org to validate:

```
execute("sf apex run test --test-level RunLocalTests --wait 10 --target-org pkg-test")
```

Open the org and manually verify:

```
execute("sf org open --target-org pkg-test")
```

### Step 7: Promote to Released

Once testing passes, promote the version (makes it installable in production):

```
execute("sf package version promote --package MyPackage@1.0.0-1 --target-dev-hub DevHub --no-prompt")
```

**WARNING**: Promotion is irreversible. A promoted version cannot be deleted.

Verify the promotion:

```
execute("sf package version list --packages MyPackage --released --target-dev-hub DevHub")
```

### Step 8: Install in Target Orgs

Install the released version in production or sandbox:

```
# In a sandbox
execute("sf package install --package MyPackage@1.0.0-1 --target-org MySandbox --wait 15 --installation-key test1234 --publish-wait 10")

# In production
execute("sf package install --package MyPackage@1.0.0-1 --target-org MyProd --wait 15 --installation-key test1234 --security-type AdminsOnly")
```

Security type options:
- `AdminsOnly` — Only admins can access package components (default)
- `AllUsers` — All users with appropriate licenses can access

Check installation status:

```
execute("sf package install report --request-id 0Hf... --target-org MySandbox")
```

### Step 9: Upgrade an Existing Installation

Create a new version with incremented version number:

```
execute("sf package version create --package MyPackage --installation-key test1234 --wait 15 --target-dev-hub DevHub --code-coverage")
```

Promote and install the upgrade:

```
execute("sf package version promote --package MyPackage@1.1.0-1 --target-dev-hub DevHub --no-prompt")
execute("sf package install --package MyPackage@1.1.0-1 --target-org MySandbox --wait 15 --installation-key test1234 --upgrade-type Mixed")
```

Upgrade types:
- `DeprecateOnly` — Deprecated removed components (safest)
- `Mixed` — Deprecated + delete removed components
- `Delete` — Delete all removed components (use with caution)

### Step 10: Uninstall a Package

Remove a package from an org:

```
execute("sf package uninstall --package MyPackage --target-org MySandbox --wait 10")
```

**WARNING**: Uninstalling deletes all data stored in package custom objects and fields.

### Step 11: Delete Unused Package Versions

Clean up beta versions that were never promoted:

```
execute("sf package version delete --package MyPackage@1.0.0-1 --target-dev-hub DevHub --no-prompt")
```

Delete the entire package (only if no versions are installed anywhere):

```
execute("sf package delete --package MyPackage --target-dev-hub DevHub --no-prompt")
```

## Version Numbering Strategy

Use semantic versioning: `MAJOR.MINOR.PATCH.BUILD`

- **MAJOR** (1.x.x): Breaking changes, new major features
- **MINOR** (x.1.x): New features, backward-compatible
- **PATCH** (x.x.1): Bug fixes
- **BUILD**: Auto-incremented with `NEXT` keyword

Example `sfdx-project.json` progression:
- Development: `1.0.0.NEXT` (auto-increments build)
- First release: promote `1.0.0-1`
- Bug fix: `1.0.1.NEXT` → promote `1.0.1-1`
- New feature: `1.1.0.NEXT` → promote `1.1.0-1`

## Ancestor Version Management

For managed packages, specify the ancestor to enable upgrades:

```json
{
  "packageDirectories": [
    {
      "package": "MyManagedPackage",
      "versionNumber": "1.1.0.NEXT",
      "ancestorVersion": "1.0.0.1",
      "ancestorId": "04t..."
    }
  ]
}
```

Use `"ancestorVersion": "HIGHEST"` to automatically use the latest released version.

## Error Handling & Troubleshooting

### "Package version creation failed"
- Check the detailed error: `sf package version create report --package-create-request-id 08c...`
- Common causes: Apex compilation errors, missing dependencies, invalid metadata
- Fix the source and retry

### "Code coverage is below 75%"
- Run tests locally first: `sf apex run test --code-coverage --target-org dev-scratch`
- Add tests for uncovered Apex classes
- Use `--skip-validation` for development iterations (cannot promote these)

### "Package installation failed"
- Check prerequisites: all dependencies must be installed first
- Verify the target org edition supports the package features
- Check for namespace conflicts
- Review: `sf package install report --request-id 0Hf... --target-org <org>`

### "Cannot delete package version"
- Promoted versions cannot be deleted
- Versions installed in any org cannot be deleted
- Uninstall from all orgs first, then delete

### "Dependency resolution failed"
- Verify dependency packages are installed in the Dev Hub
- Check version numbers match exactly
- Use `--skip-ancestor-check` if ancestor version conflicts arise during development

### "Namespace is already in use"
- Each namespace can only be linked to one Dev Hub
- Use a different namespace or link the existing one
- For testing, use unlocked packages (no namespace required)

### Version creation timeout
- Large packages can take 30+ minutes
- Increase `--wait` time or check status manually
- Use `sf package version create list --target-dev-hub DevHub` to see all pending requests
