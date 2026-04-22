# Why Harnessforce?

Harnessforce started with a question: **what if there was an interface purpose-built to help you build on and use Salesforce better?**

Many developers are now fluent in using general-purpose coding agents like Claude Code. These tools perform remarkably well and can get you 80% of the way on any Salesforce task. But the final 20% is where things break down — and it's the 20% that matters most.

What are the best patterns for writing production-grade Apex? What's actually required to make your org production-ready beyond just passing tests? What are the specific recipes that make a good hybrid reasoning agent on Agentforce? How do you wire up Data Cloud, identity resolution, and platform events correctly the first time?

That's domain knowledge you can't expect a general coding agent to just have. It needs to be **baked into the tools, the prompts, and the process** of a harness that makes it a domain expert.

Harnessforce is what an opinionated, custom-made harness looks like when Salesforce builds it for their own platform — grounded in the best practices, standards, and patterns we know work. Not a generic agent with Salesforce docs bolted on, but a purpose-built experience where every tool, every prompt, and every workflow embodies platform expertise.

## What makes this different from a general coding agent?

General-purpose agents are powerful, but they treat Salesforce like any other platform. Harnessforce knows the difference:

- **Tools that enforce best practices** — `sf_deploy` detects production orgs and requires dry-runs. `sf_query` warns about non-selective SOQL. `write_file` enforces `with sharing` on Apex classes. These guardrails are in the tool logic, not just suggestions in a prompt the agent might ignore.

- **Domain knowledge on demand** — 16 Salesforce knowledge topics (Apex architecture, governor limits, trigger patterns, testing strategies, deployment workflows, Agentforce ADLC, Data Cloud, and more) loaded exactly when needed. Not a generic context dump, but opinionated guidance grounded in what actually works in production.

- **Skills as recipes, not docs** — 30 operational workflows for real Salesforce tasks: scaffolding apps, building Agentforce agents, running deployment checklists, setting up CI/CD, migrating data. Each skill is a step-by-step recipe with executable commands, not a reference page.

- **Platform-aware safety** — Production org detection, DML bulk warnings, governor limit scanning in anonymous Apex, test coverage enforcement before deployment. The harness prevents costly mistakes before they happen.

## The vision

Every interaction with Harnessforce should feel like pairing with a senior Salesforce architect who knows the platform deeply — someone who doesn't just write code that works, but code that's production-grade, maintainable, and follows the patterns that scale.
