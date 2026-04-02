---
name: CI/CD Pipeline
description: Generate GitHub Actions or GitLab CI pipeline configurations for Salesforce deployments with validation, testing, and automated releases
trigger: When user asks to set up CI/CD, create a deployment pipeline, configure GitHub Actions for Salesforce, automate deployments, or set up continuous integration
tools_used: execute, write_file, read_file, edit_file
---

# CI/CD Pipeline Skill

Generate and configure CI/CD pipelines for Salesforce projects using GitHub Actions, GitLab CI, or Bitbucket Pipelines. Includes validation, testing, and deployment stages.

## Prerequisites

Verify the project structure and version control:

```
execute("cat sfdx-project.json")
execute("git status")
execute("sf version")
```

Ensure the user has:
- A valid SFDX project with `sfdx-project.json`
- Git repository initialized
- SF CLI JWT authentication set up (for headless CI environments)

## Workflow

### Step 1: Set Up JWT Authentication for CI

CI environments cannot use browser-based login. Set up JWT bearer flow:

1. Generate a self-signed certificate:

```
execute("openssl genrsa -out server.key 2048")
execute("openssl req -new -x509 -key server.key -out server.crt -days 365 -subj '/CN=CI-Auth'")
```

2. Create a Connected App in the target org:
   - Navigate to Setup > App Manager > New Connected App
   - Enable OAuth, enable "Use digital signatures"
   - Upload `server.crt`
   - Set OAuth scopes: `api`, `web`, `refresh_token`
   - Set callback URL: `http://localhost:1717/OauthRedirect`

3. Pre-authorize the Connected App:

```
execute("sf org login jwt --client-id <CONSUMER_KEY> --jwt-key-file server.key --username <USERNAME> --set-default-dev-hub --alias CI-DevHub")
```

4. Store secrets in CI:
   - `SF_CONSUMER_KEY` — Connected App consumer key
   - `SF_JWT_KEY` — Contents of `server.key` (base64 encoded)
   - `SF_USERNAME` — Salesforce username
   - `SF_INSTANCE_URL` — Login URL (https://login.salesforce.com or custom domain)

### Step 2: Choose CI Platform

Ask the user which platform they use, then generate the appropriate configuration.

### Step 3a: GitHub Actions Pipeline

Create `.github/workflows/salesforce-ci.yml`:

```yaml
name: Salesforce CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'force-app/**'
      - 'sfdx-project.json'
  pull_request:
    branches: [main, develop]
    paths:
      - 'force-app/**'
      - 'sfdx-project.json'

env:
  SF_CLI_VERSION: '2'
  NODE_VERSION: '20'

jobs:
  validate:
    name: Validate & Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install Salesforce CLI
        run: npm install -g @salesforce/cli

      - name: Decode JWT Key
        run: echo "${{ secrets.SF_JWT_KEY }}" | base64 --decode > server.key

      - name: Authenticate to Dev Hub
        run: |
          sf org login jwt \
            --client-id ${{ secrets.SF_CONSUMER_KEY }} \
            --jwt-key-file server.key \
            --username ${{ secrets.SF_DEVHUB_USERNAME }} \
            --set-default-dev-hub \
            --alias CI-DevHub

      - name: Create Scratch Org
        run: |
          sf org create scratch \
            --definition-file config/project-scratch-def.json \
            --alias ci-scratch \
            --duration-days 1 \
            --wait 10

      - name: Push Source
        run: sf project deploy start --target-org ci-scratch

      - name: Assign Permission Sets
        run: |
          sf org assign permset --name MyAppPermSet --target-org ci-scratch || true

      - name: Run Apex Tests
        run: |
          sf apex run test \
            --test-level RunLocalTests \
            --wait 20 \
            --code-coverage \
            --result-format json \
            --output-dir test-results \
            --target-org ci-scratch

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/

      - name: Check Code Coverage
        run: |
          COVERAGE=$(cat test-results/test-result-codecoverage.json | python3 -c "
          import json, sys
          data = json.load(sys.stdin)
          total = sum(r.get('NumLinesCovered', 0) for r in data)
          uncovered = sum(r.get('NumLinesUncovered', 0) for r in data)
          pct = (total / (total + uncovered) * 100) if (total + uncovered) > 0 else 0
          print(f'{pct:.1f}')
          ")
          echo "Code coverage: ${COVERAGE}%"
          if (( $(echo "$COVERAGE < 75" | bc -l) )); then
            echo "::error::Code coverage ${COVERAGE}% is below the 75% threshold"
            exit 1
          fi

      - name: Delete Scratch Org
        if: always()
        run: sf org delete scratch --target-org ci-scratch --no-prompt || true

  deploy-sandbox:
    name: Deploy to Sandbox
    needs: validate
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: sandbox
    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Install Salesforce CLI
        run: npm install -g @salesforce/cli

      - name: Decode JWT Key
        run: echo "${{ secrets.SF_JWT_KEY }}" | base64 --decode > server.key

      - name: Authenticate to Sandbox
        run: |
          sf org login jwt \
            --client-id ${{ secrets.SF_CONSUMER_KEY }} \
            --jwt-key-file server.key \
            --username ${{ secrets.SF_SANDBOX_USERNAME }} \
            --instance-url https://test.salesforce.com \
            --alias CI-Sandbox

      - name: Validate Deployment (Dry Run)
        run: |
          sf project deploy start \
            --target-org CI-Sandbox \
            --dry-run \
            --test-level RunLocalTests \
            --wait 30

      - name: Deploy to Sandbox
        run: |
          sf project deploy start \
            --target-org CI-Sandbox \
            --test-level RunLocalTests \
            --wait 30

  deploy-production:
    name: Deploy to Production
    needs: validate
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Install Salesforce CLI
        run: npm install -g @salesforce/cli

      - name: Decode JWT Key
        run: echo "${{ secrets.SF_JWT_KEY }}" | base64 --decode > server.key

      - name: Authenticate to Production
        run: |
          sf org login jwt \
            --client-id ${{ secrets.SF_CONSUMER_KEY }} \
            --jwt-key-file server.key \
            --username ${{ secrets.SF_PROD_USERNAME }} \
            --instance-url https://login.salesforce.com \
            --alias CI-Prod

      - name: Validate Deployment (Dry Run)
        run: |
          sf project deploy validate \
            --target-org CI-Prod \
            --test-level RunLocalTests \
            --wait 60

      - name: Quick Deploy (uses validation)
        run: |
          sf project deploy quick \
            --target-org CI-Prod \
            --wait 30
```

### Step 3b: GitLab CI Pipeline

Create `.gitlab-ci.yml`:

```yaml
image: node:20

stages:
  - validate
  - deploy-sandbox
  - deploy-production

variables:
  SF_CLI_VERSION: "2"

before_script:
  - npm install -g @salesforce/cli
  - echo "$SF_JWT_KEY" | base64 --decode > server.key

validate:
  stage: validate
  script:
    - sf org login jwt --client-id $SF_CONSUMER_KEY --jwt-key-file server.key --username $SF_DEVHUB_USERNAME --set-default-dev-hub --alias CI-DevHub
    - sf org create scratch --definition-file config/project-scratch-def.json --alias ci-scratch --duration-days 1 --wait 10
    - sf project deploy start --target-org ci-scratch
    - sf apex run test --test-level RunLocalTests --wait 20 --code-coverage --target-org ci-scratch
  after_script:
    - sf org delete scratch --target-org ci-scratch --no-prompt || true
  rules:
    - if: $CI_MERGE_REQUEST_ID
    - if: $CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "develop"
      changes:
        - force-app/**/*
        - sfdx-project.json

deploy-sandbox:
  stage: deploy-sandbox
  script:
    - sf org login jwt --client-id $SF_CONSUMER_KEY --jwt-key-file server.key --username $SF_SANDBOX_USERNAME --instance-url https://test.salesforce.com --alias CI-Sandbox
    - sf project deploy start --target-org CI-Sandbox --test-level RunLocalTests --wait 30
  environment:
    name: sandbox
  rules:
    - if: $CI_COMMIT_BRANCH == "develop"

deploy-production:
  stage: deploy-production
  script:
    - sf org login jwt --client-id $SF_CONSUMER_KEY --jwt-key-file server.key --username $SF_PROD_USERNAME --instance-url https://login.salesforce.com --alias CI-Prod
    - sf project deploy validate --target-org CI-Prod --test-level RunLocalTests --wait 60
    - sf project deploy quick --target-org CI-Prod --wait 30
  environment:
    name: production
  when: manual
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

### Step 4: Configure Branch Strategy

Recommended branching model for Salesforce:

```
main (production)
 └── develop (sandbox/UAT)
      └── feature/JIRA-123-my-feature (scratch orgs)
```

- **feature branches**: Validated with scratch orgs in CI
- **develop**: Auto-deploys to sandbox on merge
- **main**: Requires manual approval, deploys to production

### Step 5: Add Status Badges

For GitHub:

```markdown
![Salesforce CI](https://github.com/<org>/<repo>/actions/workflows/salesforce-ci.yml/badge.svg)
```

### Step 6: Set Up Notifications

For Slack notifications, add to the GitHub Actions workflow:

```yaml
      - name: Notify Slack
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Salesforce deployment failed on ${{ github.ref }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Failed* :x:\n*Branch:* ${{ github.ref }}\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Delta Deployments (Advanced)

For large projects, deploy only changed metadata using `sfdx-git-delta`:

```yaml
      - name: Install sfdx-git-delta
        run: |
          echo 'y' | sf plugins install sfdx-git-delta

      - name: Generate delta package
        run: |
          sf sgd source delta \
            --from "HEAD~1" \
            --to "HEAD" \
            --output delta-package/ \
            --generate-delta

      - name: Deploy delta
        run: |
          sf project deploy start \
            --manifest delta-package/package/package.xml \
            --target-org CI-Sandbox \
            --wait 30
```

## Error Handling & Troubleshooting

### "Authentication failed in CI"
- Verify `SF_JWT_KEY` is properly base64 encoded: `cat server.key | base64`
- Check Connected App is approved for the target user's profile
- Ensure the Connected App callback URL matches
- Verify the username is correct (sandbox usernames end with `.sandboxname`)

### "Scratch org creation failed in CI"
- Dev Hub may have reached active scratch org limit
- Add cleanup step at the beginning of CI to delete stale orgs
- Use `--duration-days 1` to minimize resource usage

### "Deployment validation timed out"
- Increase `--wait` time (large orgs can take 60+ minutes)
- Use `sf project deploy report` to check progress manually
- Consider delta deployments for faster validation

### "Tests fail in CI but pass locally"
- CI scratch orgs have clean state — check for missing test data setup
- Ensure `@TestSetup` methods create all needed data
- Check for hardcoded org-specific IDs
- Verify all required features are in `project-scratch-def.json`

### "Quick deploy expired"
- Validated deployments expire after 10 days
- Re-run the validation step before quick deploy
- Use `sf project deploy start` instead of validate + quick for simpler flows

### Pipeline is too slow
- Use delta deployments instead of full source push
- Cache node_modules: `actions/cache@v4` with `node_modules` path
- Use `--skip-validation` for non-production environments (scratch orgs run tests separately)
- Parallelize test execution across multiple scratch orgs
