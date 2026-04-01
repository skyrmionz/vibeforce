---
name: App Scaffold
description: Scaffold full-stack applications connected to Salesforce in any language
trigger: When user asks to create/scaffold/build a web app, API, or dashboard that connects to Salesforce
tools_used: write_file, execute
---

# App Scaffold Skill

Scaffold a complete full-stack application with Salesforce REST API integration. Supports Node.js (Next.js), Python (Flask), Ruby (Rails), and Java (Spring Boot). Each scaffold includes OAuth setup, environment configuration, Procfile for Heroku, and basic CRUD operations against Salesforce data.

## Common Setup (All Templates)

### Environment Variables

Every scaffold requires these environment variables for Salesforce OAuth:

| Variable | Description |
|---|---|
| `SF_CLIENT_ID` | Connected App consumer key |
| `SF_CLIENT_SECRET` | Connected App consumer secret |
| `SF_LOGIN_URL` | `https://login.salesforce.com` (prod) or `https://test.salesforce.com` (sandbox) |
| `SF_REDIRECT_URI` | OAuth callback URL (e.g., `https://{app}.herokuapp.com/auth/callback`) |
| `SF_USERNAME` | For JWT bearer flow: the Salesforce username |
| `SF_PRIVATE_KEY` | For JWT bearer flow: PEM-encoded private key |
| `SESSION_SECRET` | Random secret for session encryption |

### Connected App Prerequisite

Before scaffolding, ensure a Connected App exists in the target Salesforce org. Use the `connected-app-setup` skill if one does not exist yet.

### Choosing an Auth Flow

| Flow | Use Case |
|---|---|
| **Web Server (Authorization Code)** | User-facing apps where each user logs in with their own SF credentials |
| **JWT Bearer** | Server-to-server integrations, background jobs, no user interaction |
| **Client Credentials** | Service-to-service, API-only access with a single integration user |

---

## Template 1: Next.js + Salesforce REST API (TypeScript)

### Scaffold Command

```
execute("npx create-next-app@latest {app-name} --typescript --tailwind --app --eslint")
```

### Project Structure

```
write_file("{app-name}/lib/salesforce.ts", `
import { cookies } from 'next/headers';

const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const SF_CLIENT_ID = process.env.SF_CLIENT_ID!;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET!;
const SF_REDIRECT_URI = process.env.SF_REDIRECT_URI!;

export function getAuthUrl(): string {
  return \`\${SF_LOGIN_URL}/services/oauth2/authorize?response_type=code&client_id=\${SF_CLIENT_ID}&redirect_uri=\${encodeURIComponent(SF_REDIRECT_URI)}\`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(\`\${SF_LOGIN_URL}/services/oauth2/token\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: SF_CLIENT_ID,
      client_secret: SF_CLIENT_SECRET,
      redirect_uri: SF_REDIRECT_URI,
    }),
  });
  return res.json();
}

export async function sfQuery(instanceUrl: string, accessToken: string, soql: string) {
  const res = await fetch(
    \`\${instanceUrl}/services/data/v62.0/query?q=\${encodeURIComponent(soql)}\`,
    { headers: { Authorization: \`Bearer \${accessToken}\` } }
  );
  if (!res.ok) throw new Error(\`SF Query failed: \${res.status}\`);
  return res.json();
}

export async function sfCreate(instanceUrl: string, accessToken: string, sobject: string, data: Record<string, unknown>) {
  const res = await fetch(
    \`\${instanceUrl}/services/data/v62.0/sobjects/\${sobject}\`,
    {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${accessToken}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  );
  return res.json();
}

export async function sfUpdate(instanceUrl: string, accessToken: string, sobject: string, id: string, data: Record<string, unknown>) {
  const res = await fetch(
    \`\${instanceUrl}/services/data/v62.0/sobjects/\${sobject}/\${id}\`,
    {
      method: 'PATCH',
      headers: {
        Authorization: \`Bearer \${accessToken}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  );
  if (res.status === 204) return { success: true };
  return res.json();
}

export async function sfDelete(instanceUrl: string, accessToken: string, sobject: string, id: string) {
  const res = await fetch(
    \`\${instanceUrl}/services/data/v62.0/sobjects/\${sobject}/\${id}\`,
    {
      method: 'DELETE',
      headers: { Authorization: \`Bearer \${accessToken}\` },
    }
  );
  return { success: res.status === 204 };
}
`)
```

### OAuth Callback Route

```
write_file("{app-name}/app/auth/callback/route.ts", `
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/salesforce';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const tokens = await exchangeCodeForTokens(code);
  if (tokens.error) return NextResponse.json(tokens, { status: 400 });

  const cookieStore = await cookies();
  cookieStore.set('sf_access_token', tokens.access_token, { httpOnly: true, secure: true, maxAge: 7200 });
  cookieStore.set('sf_instance_url', tokens.instance_url, { httpOnly: true, secure: true, maxAge: 7200 });

  return NextResponse.redirect(new URL('/dashboard', req.url));
}
`)
```

### API Route Example (Query Accounts)

```
write_file("{app-name}/app/api/accounts/route.ts", `
import { NextRequest, NextResponse } from 'next/server';
import { sfQuery } from '@/lib/salesforce';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sf_access_token')?.value;
  const instanceUrl = cookieStore.get('sf_instance_url')?.value;

  if (!accessToken || !instanceUrl) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const result = await sfQuery(instanceUrl, accessToken, 'SELECT Id, Name, Industry, AnnualRevenue FROM Account ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 20');
  return NextResponse.json(result.records);
}
`)
```

### Procfile and Engine Config

```
write_file("{app-name}/Procfile", "web: npm start")
```

Add engines to `package.json`:
```json
"engines": {
  "node": "20.x"
}
```

### .env.local Template

```
write_file("{app-name}/.env.local", `
SF_CLIENT_ID=your_connected_app_consumer_key
SF_CLIENT_SECRET=your_connected_app_consumer_secret
SF_LOGIN_URL=https://login.salesforce.com
SF_REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=generate-a-random-secret-here
`)
```

---

## Template 2: Python Flask + simple-salesforce

### Scaffold

```
execute("mkdir -p {app-name}")
```

### Requirements

```
write_file("{app-name}/requirements.txt", `
Flask==3.1.0
gunicorn==23.0.0
simple-salesforce==1.12.6
python-dotenv==1.1.0
requests==2.32.3
`)
```

### Runtime

```
write_file("{app-name}/runtime.txt", "python-3.12.0")
```

### Main Application

```
write_file("{app-name}/app.py", `
import os
from flask import Flask, redirect, request, session, jsonify, url_for
from simple_salesforce import Salesforce
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'dev-secret-change-me')

SF_CLIENT_ID = os.environ['SF_CLIENT_ID']
SF_CLIENT_SECRET = os.environ['SF_CLIENT_SECRET']
SF_LOGIN_URL = os.environ.get('SF_LOGIN_URL', 'https://login.salesforce.com')
SF_REDIRECT_URI = os.environ['SF_REDIRECT_URI']


def get_sf():
    """Get an authenticated Salesforce client from session tokens."""
    return Salesforce(
        instance_url=session['sf_instance_url'],
        session_id=session['sf_access_token']
    )


@app.route('/')
def index():
    if 'sf_access_token' in session:
        return redirect(url_for('dashboard'))
    return '<a href="/auth/login">Login with Salesforce</a>'


@app.route('/auth/login')
def auth_login():
    auth_url = (
        f"{SF_LOGIN_URL}/services/oauth2/authorize"
        f"?response_type=code"
        f"&client_id={SF_CLIENT_ID}"
        f"&redirect_uri={SF_REDIRECT_URI}"
    )
    return redirect(auth_url)


@app.route('/auth/callback')
def auth_callback():
    code = request.args.get('code')
    if not code:
        return jsonify(error='Missing authorization code'), 400

    token_url = f"{SF_LOGIN_URL}/services/oauth2/token"
    resp = requests.post(token_url, data={
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': SF_CLIENT_ID,
        'client_secret': SF_CLIENT_SECRET,
        'redirect_uri': SF_REDIRECT_URI,
    })
    tokens = resp.json()

    if 'error' in tokens:
        return jsonify(tokens), 400

    session['sf_access_token'] = tokens['access_token']
    session['sf_instance_url'] = tokens['instance_url']
    return redirect(url_for('dashboard'))


@app.route('/dashboard')
def dashboard():
    if 'sf_access_token' not in session:
        return redirect(url_for('index'))
    sf = get_sf()
    accounts = sf.query("SELECT Id, Name, Industry FROM Account LIMIT 20")
    return jsonify(accounts['records'])


@app.route('/api/accounts', methods=['GET'])
def list_accounts():
    sf = get_sf()
    result = sf.query("SELECT Id, Name, Industry, AnnualRevenue FROM Account ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 20")
    return jsonify(result['records'])


@app.route('/api/accounts', methods=['POST'])
def create_account():
    sf = get_sf()
    data = request.get_json()
    result = sf.Account.create(data)
    return jsonify(result), 201


@app.route('/api/accounts/<account_id>', methods=['PATCH'])
def update_account(account_id):
    sf = get_sf()
    data = request.get_json()
    sf.Account.update(account_id, data)
    return jsonify(success=True)


@app.route('/api/accounts/<account_id>', methods=['DELETE'])
def delete_account(account_id):
    sf = get_sf()
    sf.Account.delete(account_id)
    return jsonify(success=True)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
`)
```

### Procfile

```
write_file("{app-name}/Procfile", "web: gunicorn app:app")
```

### .env Template

```
write_file("{app-name}/.env", `
SF_CLIENT_ID=your_connected_app_consumer_key
SF_CLIENT_SECRET=your_connected_app_consumer_secret
SF_LOGIN_URL=https://login.salesforce.com
SF_REDIRECT_URI=http://localhost:5000/auth/callback
SESSION_SECRET=generate-a-random-secret-here
`)
```

---

## Template 3: Ruby on Rails + Restforce

### Scaffold

```
execute("rails new {app-name} --api --database=postgresql --skip-test")
```

### Add Restforce Gem

```
write_file("{app-name}/Gemfile.append", `
# Append to existing Gemfile:
gem 'restforce', '~> 7.0'
gem 'dotenv-rails', groups: [:development, :test]
`)
```

Then: `execute("cd {app-name} && bundle install")`

### Salesforce Client Initializer

```
write_file("{app-name}/config/initializers/salesforce.rb", `
Restforce.configure do |config|
  config.client_id       = ENV['SF_CLIENT_ID']
  config.client_secret   = ENV['SF_CLIENT_SECRET']
  config.authentication_retries = 1
end
`)
```

### Salesforce Service

```
write_file("{app-name}/app/services/salesforce_service.rb", `
class SalesforceService
  def initialize(access_token:, instance_url:)
    @client = Restforce.new(
      oauth_token: access_token,
      instance_url: instance_url,
      api_version: '62.0'
    )
  end

  def query(soql)
    @client.query(soql)
  end

  def create(sobject, attrs)
    @client.create!(sobject, attrs)
  end

  def update(sobject, attrs)
    @client.update!(sobject, attrs)
  end

  def destroy(sobject, id)
    @client.destroy!(sobject, id)
  end
end
`)
```

### Accounts Controller

```
write_file("{app-name}/app/controllers/accounts_controller.rb", `
class AccountsController < ApplicationController
  before_action :require_auth

  def index
    sf = salesforce_client
    accounts = sf.query("SELECT Id, Name, Industry, AnnualRevenue FROM Account ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 20")
    render json: accounts
  end

  def create
    sf = salesforce_client
    id = sf.create('Account', account_params)
    render json: { id: id }, status: :created
  end

  def update
    sf = salesforce_client
    sf.update('Account', { Id: params[:id] }.merge(account_params))
    render json: { success: true }
  end

  def destroy
    sf = salesforce_client
    sf.destroy('Account', params[:id])
    render json: { success: true }
  end

  private

  def require_auth
    unless session[:sf_access_token]
      render json: { error: 'Not authenticated' }, status: :unauthorized
    end
  end

  def salesforce_client
    SalesforceService.new(
      access_token: session[:sf_access_token],
      instance_url: session[:sf_instance_url]
    )
  end

  def account_params
    params.require(:account).permit(:Name, :Industry, :AnnualRevenue)
  end
end
`)
```

### Routes

```
write_file("{app-name}/config/routes.rb", `
Rails.application.routes.draw do
  get  '/auth/login',    to: 'auth#login'
  get  '/auth/callback', to: 'auth#callback'
  resources :accounts, only: [:index, :create, :update, :destroy]
end
`)
```

### Procfile

```
write_file("{app-name}/Procfile", "web: bundle exec puma -C config/puma.rb")
```

---

## Template 4: Java Spring Boot + Salesforce REST

### Scaffold

```
execute("curl -s https://start.spring.io/starter.tgz -d dependencies=web,security -d type=maven-project -d language=java -d bootVersion=3.4.5 -d groupId=com.example -d artifactId={app-name} -d name={app-name} -d javaVersion=21 | tar -xzf - -C {app-name}")
```

### Salesforce Client

```
write_file("{app-name}/src/main/java/com/example/{appName}/service/SalesforceClient.java", `
package com.example.{appName}.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
public class SalesforceClient {

    @Value("${salesforce.login-url:https://login.salesforce.com}")
    private String loginUrl;

    @Value("${salesforce.client-id}")
    private String clientId;

    @Value("${salesforce.client-secret}")
    private String clientSecret;

    private final RestTemplate restTemplate = new RestTemplate();
    private static final String API_VERSION = "v62.0";

    public Map<String, Object> query(String instanceUrl, String accessToken, String soql) {
        String url = instanceUrl + "/services/data/" + API_VERSION + "/query?q=" + soql;
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
        return response.getBody();
    }

    public Map<String, Object> create(String instanceUrl, String accessToken, String sobject, Map<String, Object> data) {
        String url = instanceUrl + "/services/data/" + API_VERSION + "/sobjects/" + sobject;
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(data, headers);
        ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
        return response.getBody();
    }

    public void update(String instanceUrl, String accessToken, String sobject, String id, Map<String, Object> data) {
        String url = instanceUrl + "/services/data/" + API_VERSION + "/sobjects/" + sobject + "/" + id;
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(data, headers);
        restTemplate.exchange(url, HttpMethod.PATCH, entity, Void.class);
    }

    public void delete(String instanceUrl, String accessToken, String sobject, String id) {
        String url = instanceUrl + "/services/data/" + API_VERSION + "/sobjects/" + sobject + "/" + id;
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        restTemplate.exchange(url, HttpMethod.DELETE, entity, Void.class);
    }

    public Map<String, Object> exchangeCodeForTokens(String code, String redirectUri) {
        String url = loginUrl + "/services/oauth2/token";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        String body = "grant_type=authorization_code"
            + "&code=" + code
            + "&client_id=" + clientId
            + "&client_secret=" + clientSecret
            + "&redirect_uri=" + redirectUri;
        HttpEntity<String> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
        return response.getBody();
    }
}
`)
```

### Application Properties

```
write_file("{app-name}/src/main/resources/application.properties", `
server.port=${PORT:8080}
salesforce.client-id=${SF_CLIENT_ID}
salesforce.client-secret=${SF_CLIENT_SECRET}
salesforce.login-url=${SF_LOGIN_URL:https://login.salesforce.com}
`)
```

### system.properties (for Heroku Java version)

```
write_file("{app-name}/system.properties", "java.runtime.version=21")
```

### Procfile

```
write_file("{app-name}/Procfile", "web: java -Dserver.port=$PORT -jar target/*.jar")
```

---

## JWT Bearer Flow (Server-to-Server)

For background jobs or service-to-service integrations where no user login is involved, use the JWT Bearer flow instead of the authorization code flow.

### Node.js JWT Example

```
write_file("{app-name}/lib/salesforce-jwt.ts", `
import * as jwt from 'jsonwebtoken';

const SF_CLIENT_ID = process.env.SF_CLIENT_ID!;
const SF_USERNAME = process.env.SF_USERNAME!;
const SF_PRIVATE_KEY = process.env.SF_PRIVATE_KEY!;
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

export async function getJwtAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  const claim = {
    iss: SF_CLIENT_ID,
    sub: SF_USERNAME,
    aud: SF_LOGIN_URL,
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  const assertion = jwt.sign(claim, SF_PRIVATE_KEY, { algorithm: 'RS256' });

  const res = await fetch(\`\${SF_LOGIN_URL}/services/oauth2/token\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(\`JWT auth failed: \${data.error_description}\`);
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}
`)
```

### Python JWT Example

```
write_file("{app-name}/salesforce_jwt.py", `
import os
import time
import jwt
import requests

SF_CLIENT_ID = os.environ['SF_CLIENT_ID']
SF_USERNAME = os.environ['SF_USERNAME']
SF_PRIVATE_KEY = os.environ['SF_PRIVATE_KEY']
SF_LOGIN_URL = os.environ.get('SF_LOGIN_URL', 'https://login.salesforce.com')


def get_jwt_access_token():
    claim = {
        'iss': SF_CLIENT_ID,
        'sub': SF_USERNAME,
        'aud': SF_LOGIN_URL,
        'exp': int(time.time()) + 300,
    }
    assertion = jwt.encode(claim, SF_PRIVATE_KEY, algorithm='RS256')

    resp = requests.post(f'{SF_LOGIN_URL}/services/oauth2/token', data={
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': assertion,
    })
    data = resp.json()
    if 'error' in data:
        raise Exception(f"JWT auth failed: {data['error_description']}")
    return data['access_token'], data['instance_url']
`)
```

---

## Post-Scaffold Steps

After scaffolding, always:

1. **Create a `.gitignore`** that excludes `.env`, `node_modules/`, `__pycache__/`, `target/`, `.venv/`
2. **Create a Connected App** in the target SF org (use `connected-app-setup` skill)
3. **Set environment variables** locally (`.env`) and on Heroku (`heroku config:set`)
4. **Test locally** before deploying
5. **Deploy to Heroku** (use `heroku-deploy` skill)
