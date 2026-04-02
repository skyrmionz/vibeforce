# Harnessforce

<p align="center">
  <img src="apps/cli/src/ui/agent-astro.png" alt="Agent Astro" width="120" />
</p>

<p align="center">
  <strong>An open-source agent harness for Salesforce development</strong><br/>
  Admin work, Apex development, Agentforce agents, Data Cloud, custom apps -- all from your terminal.
</p>

---

## What is Harnessforce?

Harnessforce is a terminal-based AI agent that can do anything on the Salesforce platform. It reads your project, understands your org, and executes real work -- writing Apex, deploying metadata, building Agentforce agents, querying Data Cloud, and more.

It's not a chatbot. It's an agent with 57 tools, 27 specialized skills, and full access to your filesystem, shell, and Salesforce CLI. You describe what you want. It figures out the plan, writes the code, deploys it, and verifies it works.

**Open source. Model agnostic. Built for Salesforce developers who want to move fast.**

## Getting Started

```bash
npx harnessforce
```

That's it. This always runs the latest version. On first launch, set your API key:

```
/set-key sk-or-your-key-here
```

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys) -- one key gives you access to Claude, GPT, Gemini, and 200+ models.

Connect your Salesforce org with `sf org login web`, and Harnessforce will auto-detect it on startup.

## How It Works

### Agent Architecture

Harnessforce is built on [LangGraph](https://github.com/langchain-ai/langgraphjs) with a ReAct (Reason + Act) orchestration loop. The agent receives your message, reasons about what tools to use, executes them, observes the results, and iterates until the task is complete.

```
User message
  → LLM reasoning (plan the approach)
    → Tool execution (read files, run sf commands, write code)
      → Observe results
        → Continue or respond
```

A **MemorySaver checkpointer** preserves full conversation state across turns, so the agent remembers everything within a session and can resume previous sessions.

### Write Code, Not Tools

Instead of needing a dedicated tool for every Salesforce operation, Harnessforce follows a "Write Code, Not Tools" philosophy. The agent writes source files -- Apex classes, Flow XML, LWC components, `.agent` bundles, permission sets -- and deploys them via the `sf` CLI, exactly like a developer would.

This means Harnessforce can handle any of Salesforce's ~470+ metadata types out of the box, even ones it hasn't seen before. It discovers the metadata structure, reads the docs, writes the correct XML, and deploys it.

### Context Intelligence

On startup, Harnessforce scans your project to understand what you're working with. It detects Apex classes, LWC components, Flows, Agentforce agents, your default org, and git state. Based on what it finds, it injects only the relevant Salesforce knowledge into the agent's context -- governor limits, trigger patterns, testing strategies, deployment best practices -- so the agent has deep platform expertise without wasting tokens on irrelevant domains.

### 3-Layer Automation

Not everything in Salesforce has an API. Harnessforce handles this with three layers:

1. **SF CLI + Metadata API** -- The primary path. Write source files and deploy them. Fast, reliable, version-controlled.
2. **Playwright browser automation** -- For Setup operations that have no API equivalent (enabling features, configuring UI settings).
3. **Robot Framework + CumulusCI** -- Fallback for Lightning components with Shadow DOM that Playwright can't reach.

### FORCE.md -- Project Instructions

Like CLAUDE.md for Claude Code, FORCE.md files tell Harnessforce how to work in your project. Three layers merge together: project-level `FORCE.md` (team conventions), user-level `~/.harnessforce/FORCE.md` (personal preferences), and `FORCE.local.md` (private overrides). The agent follows these instructions on every turn.

### Permission Modes

Harnessforce starts every session in **plan mode** -- it analyzes your request and presents a plan before executing anything. After the first turn, it switches to **default mode** where it executes but confirms before destructive operations. Switch to **yolo mode** with Shift+Tab if you want full auto-approval. Production orgs always require confirmation regardless of mode.

### Skills System

Skills are markdown files that teach the agent specialized workflows. Harnessforce ships with 27 skills covering Agentforce development (full ADLC lifecycle with a 100-point rubric), testing automation, CI/CD pipelines, data migration, security hardening, and more. The agent can also create new skills on the fly -- when it learns something new, it saves it for future sessions.

### Memory

The agent persists learnings to `.harnessforce/agent.md` and reads them back on every turn. This means it remembers your org's quirks, your preferred patterns, and solutions to problems it solved in previous sessions.

## What Can It Do?

**Salesforce Admin** -- Create custom objects and fields, configure sharing rules, manage profiles and permission sets, set up org features, query data with SOQL.

**Apex and LWC Development** -- Write triggers with tests, build Lightning Web Components, analyze governor limit risks, generate test classes, debug deployment failures.

**Agentforce Agent Building** -- Full Agent Development Lifecycle support. Design agent personas, write Agent Script (`.agent` files), scaffold Apex actions and Flow XML, deploy bundles, test with structured utterances, analyze session traces from Data Cloud.

**Data Cloud** -- Query Data Model Objects, set up identity resolution, create segments, stream or bulk ingest data.

**Custom Apps** -- Scaffold Python, React, or Next.js apps with Salesforce integration. Deploy to Heroku. Set up Connected Apps with OAuth.

**DevOps** -- Create and manage scratch orgs, build packages, run test suites with coverage analysis, set up CI/CD pipelines, manage sandbox lifecycles.

## Model Support

Defaults to **Claude Opus 4.6** via OpenRouter. Switch models anytime with `/model`:

```
/model openrouter:openai/gpt-5.4
/model openrouter:google/gemini-3.1-pro-preview
/model openrouter:deepseek/deepseek-v3.2
```

Works with any provider -- OpenRouter, direct Anthropic/OpenAI APIs, or local models via Ollama.

## Development

```bash
git clone https://github.com/skyrmionz/harnessforce.git
cd harnessforce
pnpm install
pnpm build
node apps/cli/dist/index.js
```

## License

MIT
