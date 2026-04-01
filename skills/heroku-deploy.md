---
name: Heroku Deploy
description: Deploy any application to Heroku with proper buildpacks, config vars, and verification
trigger: When user asks to deploy to Heroku, create a Heroku app, or push changes to an existing Heroku app
tools_used: execute, write_file
---

# Heroku Deploy Skill

Deploy any application (Node.js, Python, Ruby, Java, Go, etc.) to Heroku from the current working directory.

## Prerequisites

Before starting, verify the Heroku CLI is installed and authenticated:

```
execute("heroku --version")
execute("heroku auth:whoami")
```

If `heroku` is not found, instruct the user:
- macOS: `brew install heroku/brew/heroku`
- npm: `npm install -g heroku`

If not authenticated: `heroku login` (interactive) or `HEROKU_API_KEY` env var.

## Workflow

### Step 1: Detect Project Type

Inspect the working directory to determine the app type and required buildpack:

| File Present | Stack | Buildpack |
|---|---|---|
| `package.json` | Node.js | `heroku/nodejs` |
| `requirements.txt` or `Pipfile` | Python | `heroku/python` |
| `Gemfile` | Ruby | `heroku/ruby` |
| `pom.xml` or `build.gradle` | Java | `heroku/java` or `heroku/gradle` |
| `go.mod` | Go | `heroku/go` |
| `Dockerfile` | Container | Container stack (no buildpack) |

If multiple detected, ask the user which is the primary runtime.

### Step 2: Validate the Project

Run the appropriate build/lint check before deploying:

- **Node.js**: `execute("npm run build")` or `execute("npx next build")` for Next.js
- **Python**: `execute("python -m py_compile app.py")` or `execute("python manage.py check")` for Django
- **Ruby**: `execute("bundle exec rake assets:precompile")` for Rails
- **Java**: `execute("mvn package -DskipTests")` or `execute("gradle build -x test")`

If validation fails, fix the issue before continuing. Do not deploy broken code.

### Step 3: Ensure Procfile Exists

Every Heroku app needs a `Procfile`. Check if one exists; if not, create it based on the detected stack:

**Node.js (Express/generic)**:
```
write_file("Procfile", "web: node server.js")
```

**Node.js (Next.js)**:
```
write_file("Procfile", "web: npm start")
```

**Python (Flask)**:
```
write_file("Procfile", "web: gunicorn app:app")
```

**Python (Django)**:
```
write_file("Procfile", "web: gunicorn myproject.wsgi")
```

**Ruby (Rails)**:
```
write_file("Procfile", "web: bundle exec puma -C config/puma.rb")
```

**Java (Spring Boot)**:
```
write_file("Procfile", "web: java -jar target/*.jar --server.port=$PORT")
```

### Step 4: Create or Identify the Heroku App

**New app**:
```
execute("heroku create {app-name}")
```

If user does not specify a name, let Heroku auto-generate one:
```
execute("heroku create")
```

**Existing app** (remote already configured):
```
execute("heroku apps:info -a {app-name}")
```

**Existing app** (need to add remote):
```
execute("heroku git:remote -a {app-name}")
```

### Step 5: Configure Buildpacks

Set the correct buildpack for the detected stack:

```
execute("heroku buildpacks:set heroku/nodejs -a {app}")
```

For multi-buildpack apps (e.g., Node.js frontend + Python backend):
```
execute("heroku buildpacks:add --index 1 heroku/nodejs -a {app}")
execute("heroku buildpacks:add --index 2 heroku/python -a {app}")
```

For Dockerfile-based deploys, use the container stack:
```
execute("heroku stack:set container -a {app}")
```

### Step 6: Set Config Vars

Set environment variables required by the app. Never hardcode secrets in source code.

```
execute("heroku config:set NODE_ENV=production -a {app}")
execute("heroku config:set DATABASE_URL={url} -a {app}")
execute("heroku config:set SECRET_KEY={key} -a {app}")
```

For Salesforce-connected apps, typical config vars:
```
execute("heroku config:set SF_CLIENT_ID={id} SF_CLIENT_SECRET={secret} SF_LOGIN_URL=https://login.salesforce.com -a {app}")
```

To view current config:
```
execute("heroku config -a {app}")
```

### Step 7: Add Add-ons (if needed)

Common add-ons:

**PostgreSQL**:
```
execute("heroku addons:create heroku-postgresql:essential-0 -a {app}")
```

**Redis**:
```
execute("heroku addons:create heroku-redis:mini -a {app}")
```

### Step 8: Initialize Git and Commit

Ensure the project is a git repo with all changes committed:

```
execute("git init")
execute("git add -A")
execute("git commit -m 'Prepare for Heroku deployment'")
```

If already a git repo, just commit any uncommitted changes:
```
execute("git add -A && git commit -m 'Deploy updates' || true")
```

### Step 9: Deploy

Push to Heroku:
```
execute("git push heroku main")
```

If the default branch is `master`:
```
execute("git push heroku master")
```

If deploying a non-default branch:
```
execute("git push heroku {branch}:main")
```

For container-based deploys:
```
execute("heroku container:push web -a {app}")
execute("heroku container:release web -a {app}")
```

### Step 10: Run Post-Deploy Tasks

**Database migrations** (if applicable):
```
execute("heroku run 'npx prisma migrate deploy' -a {app}")        # Node.js + Prisma
execute("heroku run 'python manage.py migrate' -a {app}")          # Django
execute("heroku run 'bundle exec rake db:migrate' -a {app}")       # Rails
execute("heroku run 'java -jar target/*.jar --migrate' -a {app}")  # Java/Flyway
```

### Step 11: Verify Deployment

Run all verification checks:

```
execute("heroku releases -a {app} | head -5")
execute("heroku ps -a {app}")
execute("heroku logs --tail -n 50 -a {app}")
```

Check that at least one `web` dyno is running. If dynos are crashed, inspect logs for the error.

Open the app to confirm it loads:
```
execute("heroku open -a {app}")
```

### Step 12: Scale (if needed)

By default Heroku starts one `web` dyno. To scale:

```
execute("heroku ps:scale web=2 -a {app}")
```

To add a worker process (defined in Procfile as `worker:`):
```
execute("heroku ps:scale worker=1 -a {app}")
```

## Troubleshooting

### Build Fails
1. Check build logs: `execute("heroku builds -a {app}")`
2. Common Node.js issue: missing `engines` field in `package.json` -- add `"engines": {"node": "20.x"}`
3. Common Python issue: missing `runtime.txt` -- create with `python-3.12.0`

### App Crashes on Start
1. Check logs: `execute("heroku logs --tail -a {app}")`
2. Common cause: app not binding to `$PORT` env var (Heroku assigns dynamic port)
3. For Node.js: use `process.env.PORT || 3000`
4. For Python/Flask: use `app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))`

### H10 (App Crashed) Error
1. Run one-off dyno to debug: `execute("heroku run bash -a {app}")`
2. Check if Procfile command is correct
3. Verify all required env vars are set: `execute("heroku config -a {app}")`

### Memory Quota Exceeded (R14/R15)
1. Check memory: `execute("heroku logs --tail --ps web -a {app}")`
2. Scale to larger dyno: `execute("heroku ps:type web=standard-1x -a {app}")`

### Database Connection Issues
1. Verify DATABASE_URL is set: `execute("heroku config:get DATABASE_URL -a {app}")`
2. Check connection pool size (Heroku limits vary by plan)
3. For Node.js: set `?connection_limit=10&pool_timeout=30` on DATABASE_URL

## Redeployment (Subsequent Pushes)

For subsequent deploys after the initial setup:

```
execute("git add -A && git commit -m 'Update: {description}'")
execute("git push heroku main")
execute("heroku releases -a {app} | head -3")
execute("heroku ps -a {app}")
```

If deploy fails, rollback to previous release:
```
execute("heroku releases:rollback -a {app}")
```

## Pipeline Deploys (Staging -> Production)

For apps with a Heroku Pipeline:

```
execute("heroku pipelines:info {pipeline-name}")
execute("heroku pipelines:promote -a {staging-app}")
```
