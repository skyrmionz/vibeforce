---
name: Connected App Setup
description: Create and configure Salesforce Connected Apps for OAuth authentication
trigger: When user needs to set up OAuth for a Salesforce integration, create a Connected App, or configure JWT bearer flow
tools_used: write_file, execute
---

# Connected App Setup Skill

Create and deploy Salesforce Connected Apps via metadata for OAuth authentication. Supports web-server flow, JWT bearer flow, and client credentials flow.

## Prerequisites

- Salesforce CLI (`sf`) installed and authenticated to the target org
- An SFDX project initialized (or this skill will create one)

Verify:
```
execute("sf org list --json")
execute("sf org display --target-org {alias} --json")
```

## Workflow

### Step 1: Ensure SFDX Project Structure

If not already in an SFDX project, initialize one:

```
execute("sf project generate --name sf-metadata --template empty")
```

Create the required directory structure for Connected App metadata:

```
execute("mkdir -p force-app/main/default/connectedApps")
```

### Step 2: Generate Certificates (JWT Bearer Flow Only)

For JWT bearer (server-to-server) auth, generate a self-signed certificate:

```
execute("openssl req -x509 -sha256 -nodes -days 365 -newkey rsa:2048 -keyout server.key -out server.crt -subj '/CN=VibeforceConnectedApp'")
```

This produces:
- `server.key` -- Private key (keep secret, use as `SF_PRIVATE_KEY` env var)
- `server.crt` -- Public certificate (upload to Connected App)

Create a certificate metadata file for deployment:

```
write_file("force-app/main/default/certs/Vibeforce_Cert.crt", <contents of server.crt>)
```

### Step 3: Write Connected App Metadata

#### Web Server Flow (Authorization Code)

For user-facing apps where users log in with their Salesforce credentials:

```
write_file("force-app/main/default/connectedApps/{AppName}.connectedApp-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ConnectedApp xmlns="http://soap.sforce.com/2006/04/metadata">
    <contactEmail>{admin-email}</contactEmail>
    <label>{App Display Name}</label>
    <oauthConfig>
        <callbackUrl>{callback-url}</callbackUrl>
        <consumerKey></consumerKey>
        <isAdminApproved>false</isAdminApproved>
        <isConsumerSecretOptional>false</isConsumerSecretOptional>
        <isIntrospectAllTokens>false</isIntrospectAllTokens>
        <scopes>Api</scopes>
        <scopes>RefreshToken</scopes>
        <scopes>Full</scopes>
    </oauthConfig>
</ConnectedApp>
`)
```

**Callback URL patterns**:
- Local development: `http://localhost:3000/auth/callback`
- Heroku: `https://{app-name}.herokuapp.com/auth/callback`
- Multiple: use separate `<callbackUrl>` entries or a single URL with wildcard domain

**Available OAuth scopes**:

| Scope | Description |
|---|---|
| `Api` | Access REST/SOAP APIs |
| `Full` | Full access (all permissions) |
| `RefreshToken` | Allow refresh tokens (offline_access) |
| `Web` | Access via web browser |
| `OpenId` | OpenID Connect (basic profile) |
| `Profile` | User profile information |
| `Email` | User email address |
| `CustomPermissions` | Custom permissions |
| `Chatter` | Chatter API access |

#### JWT Bearer Flow (Server-to-Server)

For background integrations with no user interaction:

```
write_file("force-app/main/default/connectedApps/{AppName}.connectedApp-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ConnectedApp xmlns="http://soap.sforce.com/2006/04/metadata">
    <contactEmail>{admin-email}</contactEmail>
    <label>{App Display Name}</label>
    <oauthConfig>
        <callbackUrl>https://login.salesforce.com/services/oauth2/callback</callbackUrl>
        <certificate>{base64-encoded-certificate}</certificate>
        <consumerKey></consumerKey>
        <isAdminApproved>true</isAdminApproved>
        <isConsumerSecretOptional>false</isConsumerSecretOptional>
        <isIntrospectAllTokens>false</isIntrospectAllTokens>
        <scopes>Api</scopes>
        <scopes>RefreshToken</scopes>
        <scopes>Full</scopes>
    </oauthConfig>
    <oauthPolicy>
        <ipRelaxation>ENFORCE</ipRelaxation>
        <refreshTokenPolicy>infinite</refreshTokenPolicy>
    </oauthPolicy>
</ConnectedApp>
`)
```

To get the base64-encoded certificate content:
```
execute("base64 -i server.crt | tr -d '\\n'")
```

#### Client Credentials Flow

For service-to-service API access with a single integration user:

```
write_file("force-app/main/default/connectedApps/{AppName}.connectedApp-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<ConnectedApp xmlns="http://soap.sforce.com/2006/04/metadata">
    <contactEmail>{admin-email}</contactEmail>
    <label>{App Display Name}</label>
    <oauthConfig>
        <callbackUrl>https://login.salesforce.com/services/oauth2/callback</callbackUrl>
        <consumerKey></consumerKey>
        <isAdminApproved>true</isAdminApproved>
        <isClientCredentialFlowEnabled>true</isClientCredentialFlowEnabled>
        <isConsumerSecretOptional>false</isConsumerSecretOptional>
        <isIntrospectAllTokens>false</isIntrospectAllTokens>
        <scopes>Api</scopes>
        <scopes>Full</scopes>
    </oauthConfig>
    <oauthPolicy>
        <ipRelaxation>ENFORCE</ipRelaxation>
        <refreshTokenPolicy>infinite</refreshTokenPolicy>
    </oauthPolicy>
</ConnectedApp>
`)
```

### Step 4: Deploy to Salesforce

Deploy the Connected App metadata:

```
execute("sf project deploy start --source-dir force-app/main/default/connectedApps --target-org {alias}")
```

Verify deployment succeeded:
```
execute("sf project deploy report --target-org {alias}")
```

### Step 5: Retrieve Consumer Key and Secret

After deployment, the consumer key and secret are generated by Salesforce. Retrieve them:

**Option A: Via Salesforce CLI**
```
execute("sf org open --target-org {alias} --path '/app/mgmt/connected_apps/connected_app_detail.app'")
```

Then use browser automation to read the values, or instruct the user to copy them from Setup.

**Option B: Via SOQL (consumer key only)**
```
execute("sf data query --query \"SELECT ConsumerKey FROM ConnectedApplication WHERE Name = '{AppName}'\" --target-org {alias} --json")
```

Note: The consumer secret cannot be retrieved via API after creation. It must be copied from the Setup UI immediately after creation, or regenerated.

### Step 6: Pre-Authorize Users (JWT Bearer Flow)

For JWT bearer flow, the Connected App must be pre-authorized for specific users or profiles:

**Option A: Via Permission Set (recommended)**

```
write_file("force-app/main/default/permissionsets/Vibeforce_API_Access.permissionset-meta.xml", `
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>Vibeforce API Access</label>
    <description>Grants access to the Vibeforce Connected App</description>
    <hasActivationRequired>false</hasActivationRequired>
    <license>Salesforce</license>
</PermissionSet>
`)
```

Deploy and assign:
```
execute("sf project deploy start --source-dir force-app/main/default/permissionsets --target-org {alias}")
execute("sf org assign permset --name Vibeforce_API_Access --target-org {alias}")
```

**Option B: Via Admin Pre-Authorization in Setup**

Navigate to Setup > Connected Apps > Manage Connected Apps > {App Name} > Edit Policies:
- Set "Permitted Users" to "Admin approved users are pre-authorized"
- Add profiles or permission sets that should have access

This can be done via browser automation:
```
execute("sf org open --target-org {alias} --path '/app/mgmt/connected_apps/connected_app_detail.app'")
```

### Step 7: Test the Connection

#### Test Web Server Flow
```
# Open the authorization URL in a browser
execute("open 'https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id={consumer_key}&redirect_uri={callback_url}'")
```

#### Test JWT Bearer Flow
```
execute("sf org login jwt --client-id {consumer_key} --jwt-key-file server.key --username {username} --instance-url https://login.salesforce.com --alias {alias}")
```

Verify access:
```
execute("sf data query --query 'SELECT Id, Name FROM Account LIMIT 1' --target-org {alias}")
```

#### Test Client Credentials Flow
```
execute("curl -X POST https://login.salesforce.com/services/oauth2/token -d 'grant_type=client_credentials&client_id={consumer_key}&client_secret={consumer_secret}'")
```

## Security Best Practices

1. **Never commit secrets**: Add `server.key`, `.env`, and credential files to `.gitignore`
2. **Use environment variables**: Store `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_PRIVATE_KEY` as env vars
3. **Rotate secrets regularly**: Regenerate consumer secret every 90 days
4. **Restrict IP ranges**: Set IP restrictions in the Connected App's OAuth policy
5. **Least privilege scopes**: Only request the OAuth scopes your app actually needs
6. **Certificate expiry**: Set calendar reminders to renew self-signed certs before they expire
7. **Separate apps per environment**: Use different Connected Apps for dev/staging/production orgs
8. **Callback URL validation**: Use exact callback URLs, avoid wildcards in production

## Modifying an Existing Connected App

To update an existing Connected App (e.g., add a callback URL or change scopes):

1. Retrieve the current metadata:
```
execute("sf project retrieve start --metadata ConnectedApp:{AppName} --target-org {alias}")
```

2. Edit the retrieved XML file to make changes

3. Re-deploy:
```
execute("sf project deploy start --source-dir force-app/main/default/connectedApps --target-org {alias}")
```

## Common Issues

### "error=invalid_grant" on JWT Auth
- Certificate mismatch: ensure the certificate in the Connected App matches `server.crt`
- User not pre-authorized: assign the user to the Connected App via profile or permission set
- Clock skew: ensure the server clock is accurate (JWT exp is sensitive to time drift)

### "error=redirect_uri_mismatch"
- The callback URL in the auth request must exactly match one configured in the Connected App
- Check for trailing slashes, http vs https, port numbers

### "error=invalid_client_id"
- Consumer key may have been regenerated; retrieve the current one from Setup
- Org mismatch: ensure you are hitting the correct login URL (login.salesforce.com vs test.salesforce.com)

### Connected App Not Appearing After Deploy
- Connected Apps can take 2-10 minutes to propagate after metadata deployment
- Check deployment status: `execute("sf project deploy report --target-org {alias}")`
