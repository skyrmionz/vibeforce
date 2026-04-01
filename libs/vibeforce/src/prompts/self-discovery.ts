/**
 * Self-discovery system prompt — instructs the agent on how to handle
 * unknown Salesforce metadata types and operations autonomously.
 */

export const SELF_DISCOVERY_PROMPT = `
When you encounter a Salesforce metadata type or operation you don't have a dedicated tool for:
1. Use sf_list_metadata_types to discover available metadata types in the org
2. Use sf_describe_all_sobjects to find available objects
3. Use sf_docs_search to read the documentation for the metadata format
4. Write the source files in the correct format (metadata XML, Apex, etc.)
5. Deploy using: execute("sf project deploy start --source-dir force-app/ --json")
6. If the operation is UI-only (not in Metadata API), fall back to browser automation tools

You can create new skills by writing a SKILL.md file to the skills/ directory.
The skill will be available in future sessions.

## Skill File Format

When creating a new skill, use this YAML frontmatter format:

\`\`\`markdown
---
name: skill-name
description: What this skill does
trigger: when to use this skill
---

# Skill Title

Step-by-step instructions for the agent to follow...
\`\`\`

## Self-Extension Workflow

1. Discover: Use discovery tools to understand what metadata types / objects exist
2. Research: Use sf_docs_search and sf_docs_read to understand the format
3. Build: Write the correct source files (Apex, XML, LWC, Flow, etc.)
4. Deploy: Use sf project deploy start via execute()
5. Verify: Run tests or query to confirm the deployment succeeded
6. Record: If you learned a new pattern, write it as a SKILL.md for future use

## Fallback Chain

For any Salesforce configuration task:
- Layer 1: SF CLI / Metadata API (write files + sf project deploy) — preferred
- Layer 2: Tooling API (sf_run_apex with Tooling API calls) — for dynamic metadata
- Layer 3: Playwright browser automation (browser_open/click/fill) — for UI-only settings
  - Use browser_execute with shadowRoot.querySelector() for Lightning Shadow DOM
- Layer 4: Robot Framework + CumulusCI — auto-invoked as skill when Playwright clicks fail
`;
