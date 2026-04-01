---
name: remember
description: Save learnings, preferences, or project facts to persistent agent memory
trigger: When the user says "remember this", "save this for later", "note that...", or asks you to remember something
---

# Remember — Save to Agent Memory

Save a learning, preference, or project fact to `.vibeforce/agent.md` so it persists across sessions.

## Steps

1. **Identify what to remember** — extract the key fact, preference, or learning from the conversation. Keep it concise and actionable.

2. **Read existing memory** — check if `.vibeforce/agent.md` exists:
   ```
   read_file(".vibeforce/agent.md")
   ```
   If the file does not exist, create it with a header.

3. **Categorize the entry** — place it under the appropriate section:
   - `## Project Facts` — org aliases, default scratch org, API versions, package namespaces
   - `## Preferences` — coding style, deployment workflow, naming conventions
   - `## Learnings` — patterns discovered, gotchas, workarounds for this project
   - `## Credentials & Endpoints` — NEVER store actual secrets. Only store references like "ElevenLabs key is in .env as ELEVENLABS_API_KEY"

4. **Append the entry** — use edit_file or write_file to add a bullet point under the right section. Use this format:
   ```
   - [YYYY-MM-DD] <concise fact or learning>
   ```

5. **Confirm** — tell the user what was saved and where.

## Example Memory File

```markdown
# Vibeforce Agent Memory

## Project Facts
- [2026-03-31] Default scratch org alias: vf-dev
- [2026-03-31] API version: 62.0
- [2026-03-31] Namespace prefix: vfapp

## Preferences
- [2026-03-31] User prefers deploying to scratch org before packaging
- [2026-03-31] Always run Apex tests after deploy

## Learnings
- [2026-03-31] Custom metadata type DeployConfig__mdt controls feature flags
- [2026-03-31] Flow "Lead Router" must be version 2 — v1 has a known bug with round-robin
```

## Rules

- Never store passwords, tokens, or API keys in the memory file.
- Keep entries concise — one line per fact.
- Deduplicate — if the same fact already exists, update it instead of adding a duplicate.
- Use the current date for each entry.
