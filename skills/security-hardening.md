---
name: Security Hardening
description: Configure profiles, permission sets, field-level security, sharing rules, CRUD enforcement, and security health checks in Salesforce
trigger: When user asks to set up security, configure permissions, create permission sets, harden an org, set up sharing rules, audit FLS, or fix security vulnerabilities
tools_used: execute, write_file, read_file, edit_file
---

# Security Hardening Skill

Comprehensive security configuration: profiles, permission sets, FLS, sharing rules, CRUD enforcement, and security health checks.

## Prerequisites

Verify org connection and admin access:

```
execute("sf org display --target-org target-org")
execute("sf data query --query \"SELECT Id, Profile.Name FROM User WHERE Username = '<current_user>'\" --target-org target-org --result-format json")
```

## Workflow

### Step 1: Security Audit — Current State Assessment

Run the Salesforce Health Check:

```
execute("sf data query --query \"SELECT Id, Score, MasterLabel FROM SecurityHealthCheck ORDER BY Score ASC\" --target-org target-org --result-format json")
```

Audit current profiles:

```
execute("sf data query --query \"SELECT Id, Name, UserType, (SELECT Id FROM Users) FROM Profile ORDER BY Name\" --target-org target-org --result-format table")
```

Audit permission sets:

```
execute("sf data query --query \"SELECT Id, Name, Label, IsOwnedByProfile, NamespacePrefix FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Name\" --target-org target-org --result-format table")
```

Check for users with "Modify All Data" or "View All Data":

```
execute("sf data query --query \"SELECT Assignee.Name, PermissionSet.Name FROM PermissionSetAssignment WHERE PermissionSet.PermissionsModifyAllData = true\" --target-org target-org --result-format table")
```

### Step 2: Create Permission Set Groups (Modern Approach)

Salesforce recommends permission set groups over profiles for access control.

**Create a base permission set for standard access:**

```xml
<!-- force-app/main/default/permissionsets/Base_User_Access.permissionset-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>Base User Access</label>
    <description>Minimum access for all internal users</description>
    <hasActivationRequired>false</hasActivationRequired>
    <objectPermissions>
        <object>Account</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
        <allowEdit>true</allowEdit>
        <allowDelete>false</allowDelete>
        <viewAllRecords>false</viewAllRecords>
        <modifyAllRecords>false</modifyAllRecords>
    </objectPermissions>
    <objectPermissions>
        <object>Contact</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
        <allowEdit>true</allowEdit>
        <allowDelete>false</allowDelete>
        <viewAllRecords>false</viewAllRecords>
        <modifyAllRecords>false</modifyAllRecords>
    </objectPermissions>
    <fieldPermissions>
        <field>Account.Name</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
    <fieldPermissions>
        <field>Account.Industry</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
    <fieldPermissions>
        <field>Account.Phone</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
</PermissionSet>
```

**Create a role-specific permission set:**

```xml
<!-- force-app/main/default/permissionsets/Sales_Rep_Access.permissionset-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>Sales Rep Access</label>
    <description>Additional access for sales representatives</description>
    <hasActivationRequired>false</hasActivationRequired>
    <objectPermissions>
        <object>Opportunity</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
        <allowEdit>true</allowEdit>
        <allowDelete>false</allowDelete>
        <viewAllRecords>false</viewAllRecords>
        <modifyAllRecords>false</modifyAllRecords>
    </objectPermissions>
    <objectPermissions>
        <object>Lead</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
        <allowEdit>true</allowEdit>
        <allowDelete>false</allowDelete>
        <viewAllRecords>false</viewAllRecords>
        <modifyAllRecords>false</modifyAllRecords>
    </objectPermissions>
    <tabSettings>
        <tab>standard-Opportunity</tab>
        <visibility>Visible</visibility>
    </tabSettings>
</PermissionSet>
```

**Create a permission set group:**

```xml
<!-- force-app/main/default/permissionsetgroups/Sales_Team.permissionsetgroup-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSetGroup xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <label>Sales Team</label>
    <description>All permissions for the sales team</description>
    <permissionSets>
        <permissionSet>Base_User_Access</permissionSet>
        <permissionSet>Sales_Rep_Access</permissionSet>
    </permissionSets>
    <status>Updated</status>
</PermissionSetGroup>
```

Deploy all permission metadata:

```
execute("sf project deploy start --source-dir force-app/main/default/permissionsets --target-org target-org")
execute("sf project deploy start --source-dir force-app/main/default/permissionsetgroups --target-org target-org")
```

### Step 3: Configure Organization-Wide Defaults (OWD)

Check current OWD settings:

```
execute("sf data query --query \"SELECT SobjectType, DefaultAccess, DefaultLocalAccess FROM Organization\" --target-org target-org --result-format json")
```

Best practice OWD recommendations:

| Object | External Default | Internal Default | Rationale |
|--------|-----------------|------------------|-----------|
| Account | Private | Private | Start restrictive, open with sharing rules |
| Contact | Controlled by Parent | Controlled by Parent | Follows Account sharing |
| Opportunity | Private | Private | Sensitive sales data |
| Case | Private | Private | Customer-sensitive |
| Lead | Public Read/Write | Public Read/Write | Usually shared across sales |
| Custom Objects | Private | Private | Default to restrictive |

OWD changes require metadata deployment or manual Setup configuration.

### Step 4: Define Role Hierarchy

Create role hierarchy for record access escalation:

```xml
<!-- force-app/main/default/roles/CEO.role-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Role xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <fullName>CEO</fullName>
    <caseAccessLevel>Edit</caseAccessLevel>
    <contactAccessLevel>Edit</contactAccessLevel>
    <opportunityAccessLevel>Edit</opportunityAccessLevel>
</Role>
```

Verify the hierarchy:

```
execute("sf data query --query \"SELECT Id, Name, ParentRoleId, ParentRole.Name FROM UserRole ORDER BY ParentRoleId\" --target-org target-org --result-format table")
```

### Step 5: Create Sharing Rules

For criteria-based sharing:

```xml
<!-- force-app/main/default/sharingRules/Account.sharingRules-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<SharingRules xmlns="http://soap.sforce.com/2006/metadataWithDefaults">
    <sharingCriteriaRules>
        <fullName>Share_Enterprise_Accounts</fullName>
        <accessLevel>Read</accessLevel>
        <label>Share Enterprise Accounts</label>
        <sharedTo>
            <group>All_Sales</group>
        </sharedTo>
        <criteriaItems>
            <field>Type</field>
            <operation>equals</operation>
            <value>Enterprise</value>
        </criteriaItems>
    </sharingCriteriaRules>
</SharingRules>
```

Deploy sharing rules:

```
execute("sf project deploy start --source-dir force-app/main/default/sharingRules --target-org target-org")
```

### Step 6: Enforce CRUD and FLS in Apex

All Apex code should enforce CRUD and FLS. Use the `WITH SECURITY_ENFORCED` clause or `Security.stripInaccessible()`:

**Pattern 1: SOQL Security Enforcement**

```apex
// Enforces FLS on query — throws exception if user lacks access
List<Account> accounts = [
    SELECT Id, Name, Industry, AnnualRevenue
    FROM Account
    WHERE Industry = 'Technology'
    WITH SECURITY_ENFORCED
];
```

**Pattern 2: stripInaccessible for DML**

```apex
// Strip fields the user cannot create
List<Account> newAccounts = new List<Account>();
newAccounts.add(new Account(Name = 'Test', AnnualRevenue = 1000000));

SObjectAccessDecision decision = Security.stripInaccessible(
    AccessType.CREATABLE, newAccounts
);
insert decision.getRecords();

// Check which fields were stripped
Map<String, Set<String>> removed = decision.getRemovedFields();
if (removed.containsKey('Account')) {
    System.debug('Stripped fields: ' + removed.get('Account'));
}
```

**Pattern 3: Manual CRUD check**

```apex
if (!Schema.sObjectType.Account.isAccessible()) {
    throw new SecurityException('Insufficient access to Account');
}
if (!Schema.sObjectType.Account.fields.Name.isUpdateable()) {
    throw new SecurityException('Cannot update Account.Name');
}
```

### Step 7: Configure Session Security

Check current session settings:

```
execute("sf data query --query \"SELECT SecurityLevel, SessionType FROM SessionPermSetActivation\" --target-org target-org --result-format json")
```

Recommended session security settings (configure in Setup):
- **Session timeout**: 2 hours for standard users, 15 minutes for admin
- **Lock sessions to IP**: Enable for API users
- **Require secure connections (HTTPS)**: Always enable
- **Enable clickjack protection**: All pages
- **CSP**: Enable Content Security Policy
- **CORS**: Restrict to known domains only

### Step 8: Audit Login History and Access

Check for suspicious login activity:

```
execute("sf data query --query \"SELECT UserId, LoginTime, SourceIp, Status, Application FROM LoginHistory WHERE LoginTime > LAST_N_DAYS:7 AND Status != 'Success' ORDER BY LoginTime DESC LIMIT 50\" --target-org target-org --result-format table")
```

Check active sessions:

```
execute("sf data query --query \"SELECT Id, UsersId, NumSecondsValid, SessionType FROM AuthSession WHERE IsCurrent = true\" --target-org target-org --result-format table")
```

### Step 9: Enable Field Audit Trail

Track sensitive field changes:

```
execute("sf data query --query \"SELECT Id, Field, OldValue, NewValue, CreatedDate, CreatedBy.Name FROM AccountHistory WHERE CreatedDate > LAST_N_DAYS:30 ORDER BY CreatedDate DESC LIMIT 50\" --target-org target-org --result-format table")
```

### Step 10: Security Health Check Remediation

Run the full security health check and fix issues:

```
execute("sf data query --query \"SELECT SettingGroup, Setting, RiskType, OrgValue, StandardValue FROM SecurityHealthCheckRisks WHERE RiskType IN ('HIGH_RISK', 'MEDIUM_RISK') ORDER BY RiskType\" --target-org target-org --result-format table")
```

Common fixes:
- **Password complexity**: Require uppercase, lowercase, number, special character
- **Password expiration**: Set to 90 days
- **Login IP ranges**: Restrict by profile
- **Session timeout**: Reduce to 2 hours
- **API access**: Restrict to required profiles only

## Security Checklist

Before any production deployment, verify:

- [ ] All custom objects have appropriate OWD settings
- [ ] Permission sets are used instead of profile modifications
- [ ] All Apex code uses `WITH SECURITY_ENFORCED` or `stripInaccessible()`
- [ ] No hardcoded credentials in Apex or metadata
- [ ] SOQL injection prevented (no string concatenation in queries)
- [ ] CSRF protection enabled on Visualforce pages
- [ ] Lightning Locker/LWS enabled for LWC
- [ ] Guest user profiles are minimally permissioned
- [ ] API users have dedicated profiles with IP restrictions
- [ ] Sharing rules follow principle of least privilege

## Error Handling & Troubleshooting

### "Insufficient access" errors
- Check object CRUD: `Schema.sObjectType.Account.isAccessible()`
- Check field FLS: `Schema.sObjectType.Account.fields.Name.isAccessible()`
- Verify the user's profile and permission set assignments
- Check OWD and sharing rules for record-level access

### "FIELD_INTEGRITY_EXCEPTION" on permission set deploy
- Field API names must match exactly (case-sensitive)
- Object must exist before deploying field permissions
- Deploy objects first, then permission sets

### Sharing rule recalculation takes too long
- Large orgs may take hours to recalculate
- Schedule during off-hours
- Consider async sharing recalculation

### Permission set group calculation pending
- After changes, groups need recalculation
- Check status: Setup > Permission Set Groups > [Group] > Status
- Usually completes within minutes

### Users can see records they shouldn't
- Check OWD settings
- Audit role hierarchy (higher roles see lower roles' records)
- Review all sharing rules for the object
- Check for "View All" on object permission sets
- Inspect apex sharing (Apex managed sharing records)
