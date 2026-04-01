# Contributing to VibeForce

Thanks for your interest in contributing! VibeForce is an open-source project and we welcome contributions of all kinds.

## Getting Started

```bash
git clone https://github.com/skyrmionz/vibeforce.git
cd vibeforce
pnpm install
pnpm build
```

## Project Structure

```
vibeforce/
├── libs/vibeforce/     # @vibeforce/core — agent library (tools, middleware, prompts)
├── apps/cli/           # @vibeforce/cli — terminal UI (Ink + Commander)
├── skills/             # Reusable workflow definitions (SKILL.md files)
├── evals/              # SalesforceBench evaluation tests
└── docs/               # User-facing documentation
```

## Development

```bash
pnpm dev          # Watch mode for both packages
pnpm build        # Build both packages
```

## Adding a New Tool

1. Create `libs/vibeforce/src/tools/my-tool.ts`
2. Extend `StructuredTool` from `@langchain/core/tools`
3. Define a Zod input schema
4. Export from `libs/vibeforce/src/tools/index.ts`
5. Add to the appropriate tools array (`allTools`)

## Adding a New Skill

1. Create `skills/my-skill.md` with YAML frontmatter:
   ```yaml
   ---
   name: My Skill
   description: What this skill does
   trigger: When this skill should be used
   ---
   ```
2. Write the skill instructions in markdown
3. The skill loader picks it up automatically

## Pull Requests

- Fork the repo and create your branch from `main`
- Keep PRs focused — one feature or fix per PR
- Ensure `pnpm build` passes with no errors
- Add a clear description of what changed and why
