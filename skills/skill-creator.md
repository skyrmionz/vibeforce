---
name: skill-creator
description: Step-by-step guide for creating new Harnessforce skills
trigger: When the user asks to create a new skill, add a skill, or teach harnessforce something new
---

# Skill Creator — Build New Harnessforce Skills

Follow these 6 steps to create a well-structured skill file.

## Step 1: Gather Requirements

Ask the user:
- **What does this skill do?** — one sentence description.
- **When should it trigger?** — what user phrases or situations activate it.
- **What tools does it need?** — which Harnessforce tools (execute, sf_deploy, browser_open, etc.) are involved.

If the user already provided this information, skip the questions.

## Step 2: Choose a Name

- Use lowercase kebab-case: `data-loader`, `flow-builder`, `apex-test-gen`.
- Keep it short (2-3 words max).
- Avoid generic names like `helper` or `utility`.

## Step 3: Write the Frontmatter

Every skill file starts with YAML frontmatter:

```yaml
---
name: <skill-name>
description: <one-line description>
trigger: <when to use this skill>
---
```

## Step 4: Write the Instructions

Structure the body as numbered steps the agent should follow. Include:

- **Prerequisites** — what must be true before starting (e.g., "org must be authenticated").
- **Steps** — ordered list of actions. Use tool names explicitly (e.g., "Use `execute` to run...").
- **Verification** — how to confirm the skill succeeded.
- **Error handling** — common failure modes and how to recover.

Best practices:
- Be specific — use actual command syntax, not vague descriptions.
- Include example commands with realistic values.
- Reference Salesforce documentation URLs for complex metadata types.
- Keep it under 100 lines — if longer, the skill is probably too broad. Split it.

## Step 5: Save the Skill

Write the file to the skills directory:

```
write_file("skills/<skill-name>.md", <content>)
```

## Step 6: Verify

1. Read the file back to confirm it was saved correctly.
2. Tell the user the skill is available and will be loaded in future sessions.
3. Demonstrate the skill if the user wants to test it immediately.

## Example Skill

```markdown
---
name: apex-test-gen
description: Generate Apex test classes for existing Apex classes
trigger: When the user asks to generate tests, create test coverage, or write test classes
---

# Apex Test Generator

Generate comprehensive Apex test classes with proper bulk testing patterns.

## Prerequisites
- A Salesforce project with force-app/main/default/classes/ directory.
- At least one Apex class to generate tests for.

## Steps

1. **Identify target classes** — use glob to find Apex classes:
   ```
   glob("**/classes/*.cls")
   ```

2. **Read the class** — understand methods, dependencies, and DML operations:
   ```
   read_file("force-app/main/default/classes/MyClass.cls")
   ```

3. **Generate test class** — create a test class that:
   - Uses @IsTest annotation
   - Creates test data in @TestSetup method
   - Tests positive, negative, and bulk scenarios
   - Asserts expected outcomes (not just "no exception")
   - Handles governor limits (200+ record tests)

4. **Write the test file**:
   ```
   write_file("force-app/main/default/classes/MyClassTest.cls", <content>)
   write_file("force-app/main/default/classes/MyClassTest.cls-meta.xml", <meta>)
   ```

5. **Deploy and run**:
   ```
   execute("sf project deploy start --source-dir force-app/main/default/classes/MyClassTest.cls --json")
   execute("sf apex run test --class-names MyClassTest --synchronous --code-coverage --json")
   ```

## Verification
- Test class compiles and deploys successfully.
- All test methods pass.
- Code coverage meets minimum threshold (75%+).
```
