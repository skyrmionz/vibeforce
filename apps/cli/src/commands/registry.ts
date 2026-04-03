/**
 * Slash command registry for the Harnessforce TUI.
 *
 * Two command types:
 *   - local: executed in-process, result displayed directly
 *   - prompt: expanded into a prompt string and sent to the LLM agent
 */

import {
  readConfig,
  ensureConfigFile,
  ModelRegistry,
  loadSkills,
  getSkillSummaries,
  findSkill,
  writeSkill,
  allTools,
  rollbackToLatest,
  runSfCommand,
  compactMessages,
  estimateMessagesTokens,
  createSessionManager,
  sessionCostTracker,
  restoreLastVersion,
  getLastEditedFile,
  loadHooks,
  openInEditor,
  getTodos,
} from "harnessforce-core";
import type { Skill } from "harnessforce-core";
import { execSync } from "node:child_process";
import {
  formatTable,
  formatQueryResults,
  formatFieldList,
  formatOrgInfo,
} from "./format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandType = "local" | "prompt";

export interface SlashCommand {
  /** Command name without leading slash, e.g. "help", "model", "skill-list" */
  name: string;
  /** Short description shown in the / menu */
  description: string;
  /** Whether the command runs locally or expands into a prompt */
  type: CommandType;
  /** For local commands: execute and return output string */
  execute?: (args: string, context: CommandContext) => Promise<string>;
  /** For prompt commands: return prompt text to send to the agent */
  getPrompt?: (args: string) => string;
}

export interface CommandContext {
  skillsDir: string;
  org?: string;
  model?: string;
  setModel?: (id: string) => void;
  clearMessages?: () => void;
  setPermissionMode?: (mode: string) => void;
}

// ---------------------------------------------------------------------------
// Built-in local commands
// ---------------------------------------------------------------------------

const helpCommand: SlashCommand = {
  name: "help",
  description: "List all available slash commands",
  type: "local",
  execute: async (_args, ctx) => {
    const cmds = getCommands(ctx.skillsDir);
    const maxName = Math.max(...cmds.map((c) => c.name.length));
    const lines = cmds.map((c) => {
      const tag = c.type === "prompt" ? " (prompt)" : "";
      return `  /${c.name.padEnd(maxName + 2)}${c.description}${tag}`;
    });
    return `Available commands:\n\n${lines.join("\n")}\n`;
  },
};

const modelCommand: SlashCommand = {
  name: "model",
  description: "Show current model or switch with /model <id>",
  type: "local",
  execute: async (args, ctx) => {
    ensureConfigFile();
    const config = readConfig();

    if (!args.trim()) {
      return `Current model: ${ctx.model ?? config.defaultModel}`;
    }

    const registry = new ModelRegistry(config);
    const all = registry.listModels();
    const match = all.find((m) => m.id === args.trim() || m.model === args.trim());
    if (!match) {
      return `Model "${args.trim()}" not found. Use /model:list to see available models.`;
    }
    if (ctx.setModel) ctx.setModel(match.id);
    return `Switched to ${match.model} (${match.provider})`;
  },
};

const setKeyCommand: SlashCommand = {
  name: "set-key",
  description: "Save your OpenRouter API key (persists to ~/.harnessforce/models.yaml)",
  type: "local",
  execute: async (args) => {
    const key = args.trim();
    if (!key) {
      return "Usage: /set-key sk-or-your-key-here\n\nGet a key at https://openrouter.ai/keys";
    }

    try {
      const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
      const configDir = join(home, ".harnessforce");
      const configPath = join(configDir, "models.yaml");

      if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

      // Always write a clean OpenRouter config with the key as a direct value
      const content = [
        `default_model: "openrouter:anthropic/claude-opus-4.6"`,
        `providers:`,
        `  openrouter:`,
        `    type: gateway`,
        `    base_url: "https://openrouter.ai/api/v1"`,
        `    api_key: "${key}"`,
        `    models:`,
        `      - anthropic/claude-4.6-sonnet-20260217`,
        `      - anthropic/claude-opus-4.6`,
        `      - anthropic/claude-haiku-4`,
        `      - openai/gpt-5.4`,
        `      - openai/gpt-5.4-pro`,
        `      - google/gemini-3.1-pro-preview`,
        `      - x-ai/grok-4.20-beta`,
        `      - deepseek/deepseek-v3.2`,
        `      - meta-llama/llama-4-maverick`,
        `      - qwen/qwen3.6-plus-preview:free`,
        ``,
      ].join("\n");

      writeFileSync(configPath, content, "utf-8");

      // Also set in current process
      process.env.OPENROUTER_API_KEY = key;

      return `API key saved. Restart harnessforce to connect.`;
    } catch (err: any) {
      return `Error saving key: ${err.message}`;
    }
  },
};

const modelListCommand: SlashCommand = {
  name: "model-list",
  description: "List all available models",
  type: "local",
  execute: async () => {
    ensureConfigFile();
    const config = readConfig();
    const registry = new ModelRegistry(config);
    const models = registry.listModels();

    if (models.length === 0) {
      return "No models configured. Run `harnessforce provider:add` to get started.";
    }

    const defaultId = config.defaultModel;
    const lines = models.map((m) => {
      const isDefault = m.id === defaultId ? " (default)" : "";
      const typeLabel = m.type.toUpperCase().padEnd(7);
      return `  ${typeLabel}  ${m.provider.padEnd(12)}  ${m.model}${isDefault}`;
    });
    return `Available models:\n\n${lines.join("\n")}\n`;
  },
};

const skillListCommand: SlashCommand = {
  name: "skill-list",
  description: "List all loaded skills",
  type: "local",
  execute: async (_args, ctx) => {
    const skills = loadSkills(ctx.skillsDir);
    if (skills.length === 0) {
      return "No skills loaded. Create a .md file in the skills/ directory to add one.";
    }
    const maxName = Math.max(...skills.map((s) => s.name.length));
    const lines = skills.map(
      (s) => `  ${s.name.padEnd(maxName + 2)}${s.description}`
    );
    return `Loaded skills:\n\n${lines.join("\n")}\n`;
  },
};

const skillAddCommand: SlashCommand = {
  name: "skill-add",
  description: "Create a new skill file from template",
  type: "local",
  execute: async (args, ctx) => {
    const name = args.trim();
    if (!name) {
      return "Usage: /skill:add <name>";
    }

    const template = `---
name: ${name}
description: TODO — describe what this skill does
trigger: when the user asks to ${name.replace(/-/g, " ")}
---

# ${name} Skill

## Instructions

TODO — write the skill instructions here.

## Steps

1. First, ...
2. Then, ...
3. Finally, ...
`;

    const filePath = writeSkill(ctx.skillsDir, `${name}.md`, template);
    return `Created skill template at ${filePath}\nEdit the file to customize the skill.`;
  },
};

const toolListCommand: SlashCommand = {
  name: "tool-list",
  description: "List all tools with descriptions",
  type: "local",
  execute: async () => {
    const tools = allTools;
    if (tools.length === 0) {
      return "No tools loaded.";
    }
    const maxName = Math.max(...tools.map((t) => t.name.length));
    const lines = tools.map((t) => {
      const desc =
        "description" in t && typeof t.description === "string"
          ? t.description
          : "";
      const short = desc.length > 60 ? desc.slice(0, 57) + "..." : desc;
      return `  ${t.name.padEnd(maxName + 2)}${short}`;
    });
    return `Available tools (${tools.length}):\n\n${lines.join("\n")}\n`;
  },
};

const orgCommand: SlashCommand = {
  name: "org",
  description: "Show current org or switch with /org <alias>",
  type: "local",
  execute: async (args, ctx) => {
    if (!args.trim()) {
      return ctx.org ? `Current org: ${ctx.org}` : "No org connected. Use /org <alias> to set one.";
    }
    // Just report — actual org switching would need more wiring
    return `Org set to: ${args.trim()}`;
  },
};

const orgLoginCommand: SlashCommand = {
  name: "org-login",
  description: "Authenticate a new Salesforce org (opens browser)",
  type: "local",
  execute: async (args) => {
    const alias = args.trim();
    try {
      const { execSync } = await import("node:child_process");
      const aliasFlag = alias ? ` --alias ${alias}` : "";
      execSync(`sf org login web${aliasFlag}`, {
        stdio: "inherit",
        timeout: 120_000,
      });
      return alias
        ? `Authenticated org "${alias}". Use /org ${alias} to switch to it.`
        : "Authenticated new org. Use /org-list to see all orgs.";
    } catch (err: any) {
      return `Login failed: ${err.message}`;
    }
  },
};

const quitCommand: SlashCommand = {
  name: "quit",
  description: "Exit the CLI",
  type: "local",
  execute: async () => {
    process.exit(0);
  },
};

const exitCommand: SlashCommand = {
  name: "exit",
  description: "Exit the CLI",
  type: "local",
  execute: async () => {
    process.exit(0);
  },
};

const clearCommand: SlashCommand = {
  name: "clear",
  description: "Clear message history",
  type: "local",
  execute: async (_args, ctx) => {
    if (ctx.clearMessages) ctx.clearMessages();
    return "Message history cleared.";
  },
};

const statusCommand: SlashCommand = {
  name: "status",
  description: "Show current session info",
  type: "local",
  execute: async (_args, ctx) => {
    ensureConfigFile();
    const config = readConfig();
    const skills = loadSkills(ctx.skillsDir);
    const toolCount = allTools.length;
    const lines = [
      `Model:    ${ctx.model ?? config.defaultModel}`,
      `Org:      ${ctx.org ?? "none"}`,
      `Tools:    ${toolCount}`,
      `Skills:   ${skills.length}`,
      `CWD:      ${process.cwd()}`,
    ];
    return lines.join("\n");
  },
};

const doctorCommand: SlashCommand = {
  name: "doctor",
  description: "Check prerequisites (sf CLI, node, API key, etc.)",
  type: "local",
  execute: async () => {
    const checks: string[] = [];

    // Node version
    const nodeVersion = process.version;
    checks.push(`  Node.js     ${nodeVersion}  OK`);

    // sf CLI
    try {
      const sfVersion = execSync("sf --version 2>/dev/null", { encoding: "utf-8" }).trim().split("\n")[0];
      checks.push(`  sf CLI      ${sfVersion}  OK`);
    } catch {
      checks.push(`  sf CLI      NOT FOUND`);
    }

    // Anthropic API key
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    checks.push(`  API Key     ${hasKey ? "set" : "MISSING (set ANTHROPIC_API_KEY)"}  ${hasKey ? "OK" : "WARN"}`);

    // Python
    try {
      const pyVersion = execSync("python3 --version 2>/dev/null", { encoding: "utf-8" }).trim();
      checks.push(`  Python      ${pyVersion}  OK`);
    } catch {
      checks.push(`  Python      NOT FOUND`);
    }

    // Robot Framework
    try {
      execSync("robot --version 2>/dev/null", { encoding: "utf-8" });
      checks.push(`  Robot FW    installed  OK`);
    } catch {
      checks.push(`  Robot FW    NOT FOUND (optional)`);
    }

    return `Harnessforce Doctor\n\n${checks.join("\n")}\n`;
  },
};

const rollbackCommand: SlashCommand = {
  name: "rollback",
  description: "Restore from latest snapshot",
  type: "local",
  execute: async () => {
    try {
      const result = await rollbackToLatest();
      return result.success
        ? `Rollback successful: ${result.data ?? "restored from latest snapshot"}`
        : `Rollback failed: ${result.error ?? "unknown error"}`;
    } catch (err: any) {
      return `Rollback error: ${err.message}`;
    }
  },
};

const initCommand: SlashCommand = {
  name: "init",
  description: "Run first-time setup (scaffold .harnessforce/, check deps)",
  type: "local",
  execute: async (_args, ctx) => {
    const { mkdirSync, existsSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const cwd = process.cwd();
    const vfDir = join(cwd, ".harnessforce");
    const skillsDir = join(cwd, "skills");

    const steps: string[] = [];

    if (!existsSync(vfDir)) {
      mkdirSync(vfDir, { recursive: true });
      steps.push("Created .harnessforce/ directory");
    } else {
      steps.push(".harnessforce/ already exists");
    }

    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
      steps.push("Created skills/ directory");
    } else {
      steps.push("skills/ already exists");
    }

    const configPath = join(vfDir, "config.json");
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify({ initialized: true }, null, 2));
      steps.push("Created .harnessforce/config.json");
    }

    // Create template FORCE.md if it doesn't exist
    const forcePath = join(cwd, "FORCE.md");
    if (!existsSync(forcePath)) {
      writeFileSync(forcePath, FORCE_MD_TEMPLATE, "utf-8");
      steps.push("Created FORCE.md project instructions template");
    } else {
      steps.push("FORCE.md already exists");
    }

    // Add FORCE.local.md to .gitignore if not already there
    const gitignorePath = join(cwd, ".gitignore");
    if (existsSync(gitignorePath)) {
      const { readFileSync } = await import("node:fs");
      const gitignore = readFileSync(gitignorePath, "utf-8");
      if (!gitignore.includes("FORCE.local.md")) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(gitignorePath, "\n# Harnessforce local overrides\nFORCE.local.md\n");
        steps.push("Added FORCE.local.md to .gitignore");
      }
    }

    ensureConfigFile();
    steps.push("Ensured model config at ~/.harnessforce/config.json");

    return `Harnessforce initialized:\n\n  ${steps.join("\n  ")}\n`;
  },
};

// ---------------------------------------------------------------------------
// FORCE.md template
// ---------------------------------------------------------------------------

const FORCE_MD_TEMPLATE = `# Project Instructions

<!-- This file tells Harnessforce how to work in this project. -->
<!-- Commit this file to version control. Use FORCE.local.md for personal overrides. -->

## Salesforce Org
<!-- Describe the target org, edition, and any org-specific constraints. -->
<!-- Example: "Production org, Enterprise Edition. Always deploy to sandbox first." -->

## Coding Conventions
<!-- Code style rules, naming conventions, patterns to follow. -->
<!-- Example: "Use camelCase for Apex variables. All triggers must be handler-based." -->

## Deployment Rules
<!-- Deployment process, required checks, approvals. -->
<!-- Example: "Run all tests before deploying. Never deploy directly to production." -->

## Custom Patterns
<!-- Any project-specific patterns, libraries, or tools the agent should know about. -->
`;

// ---------------------------------------------------------------------------
// /force command
// ---------------------------------------------------------------------------

const forceCommand: SlashCommand = {
  name: "force",
  description: "Show current FORCE.md instructions or create one with /force create",
  type: "local",
  execute: async (args) => {
    const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { loadForceInstructions } = await import("harnessforce-core");
    const cwd = process.cwd();

    if (args.trim() === "create") {
      const forcePath = join(cwd, "FORCE.md");
      if (existsSync(forcePath)) {
        return `FORCE.md already exists at ${forcePath}`;
      }
      writeFileSync(forcePath, FORCE_MD_TEMPLATE, "utf-8");
      return `Created FORCE.md at ${forcePath}\nEdit it to add your project instructions.`;
    }

    const instructions = loadForceInstructions(cwd);
    if (!instructions) {
      return "No FORCE.md found. Use /force create to create one.";
    }

    // Show a friendlier view: strip the XML tags for display
    return instructions
      .replace("<force-instructions>\n", "")
      .replace("\n</force-instructions>", "");
  },
};

// ---------------------------------------------------------------------------
// Salesforce local commands
// ---------------------------------------------------------------------------

const orgListCommand: SlashCommand = {
  name: "org-list",
  description: "List all authenticated Salesforce orgs",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("org", ["list"]);
      if (!result.success) return `Error: ${result.raw}`;
      return formatOrgInfo(result.data);
    } catch (err: any) {
      return `Error listing orgs: ${err.message}`;
    }
  },
};

const orgOpenCommand: SlashCommand = {
  name: "org-open",
  description: "Open the default org in the browser",
  type: "local",
  execute: async (args) => {
    try {
      const sfArgs = ["open", "--url-only"];
      if (args.trim()) sfArgs.push("--path", args.trim());
      const result = await runSfCommand("org", sfArgs);
      if (!result.success) return `Error: ${result.raw}`;
      const url =
        typeof result.data === "object" && result.data !== null && "url" in (result.data as any)
          ? (result.data as any).url
          : result.raw.trim();
      if (url) {
        try {
          execSync(`open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null`, { stdio: "ignore" });
        } catch { /* browser open is best-effort */ }
        return `Opened: ${url}`;
      }
      return `Org URL:\n${result.raw}`;
    } catch (err: any) {
      return `Error opening org: ${err.message}`;
    }
  },
};

const orgLimitsCommand: SlashCommand = {
  name: "org-limits",
  description: "Show org API limits (remaining / max)",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("org", ["list", "limits"]);
      if (!result.success) return `Error: ${result.raw}`;
      const limits = Array.isArray(result.data) ? result.data : [];
      if (limits.length === 0) return "No limits data returned.";
      const headers = ["Limit", "Remaining", "Max"];
      const rows = limits.map((l: any) => [
        l.name ?? "",
        String(l.remaining ?? ""),
        String(l.max ?? ""),
      ]);
      return formatTable(headers, rows);
    } catch (err: any) {
      return `Error fetching limits: ${err.message}`;
    }
  },
};

const describeCommand: SlashCommand = {
  name: "describe",
  description: "Describe a Salesforce object's fields",
  type: "local",
  execute: async (args) => {
    const objectName = args.trim();
    if (!objectName) return "Usage: /describe <ObjectName>";
    try {
      const result = await runSfCommand("sobject", ["describe", "--sobject", objectName]);
      if (!result.success) return `Error: ${result.raw}`;
      const data = result.data as any;
      const fields = data?.fields ?? [];
      const label = data?.label ?? objectName;
      return `${label} (${objectName}) — ${fields.length} fields\n\n${formatFieldList(fields)}`;
    } catch (err: any) {
      return `Error describing ${objectName}: ${err.message}`;
    }
  },
};

const metadataCommand: SlashCommand = {
  name: "metadata",
  description: "List metadata types or components of a given type",
  type: "local",
  execute: async (args) => {
    try {
      if (args.trim()) {
        const result = await runSfCommand("org", ["list", "metadata", "--metadata-type", args.trim()]);
        if (!result.success) return `Error: ${result.raw}`;
        const items = Array.isArray(result.data) ? result.data : [];
        if (items.length === 0) return `No ${args.trim()} components found.`;
        const headers = ["Full Name", "Type", "Last Modified"];
        const rows = items.map((m: any) => [
          m.fullName ?? "",
          m.type ?? args.trim(),
          m.lastModifiedDate ?? "",
        ]);
        return formatTable(headers, rows);
      } else {
        const result = await runSfCommand("org", ["list", "metadata-types"]);
        if (!result.success) return `Error: ${result.raw}`;
        const types = Array.isArray(result.data)
          ? result.data
          : (result.data as any)?.metadataObjects ?? [];
        if (types.length === 0) return "No metadata types returned.";
        const headers = ["Type", "Suffix", "Directory"];
        const rows = types.map((t: any) => [
          t.xmlName ?? t.name ?? "",
          t.suffix ?? "",
          t.directoryName ?? "",
        ]);
        return formatTable(headers, rows);
      }
    } catch (err: any) {
      return `Error listing metadata: ${err.message}`;
    }
  },
};

const retrieveCommand: SlashCommand = {
  name: "retrieve",
  description: "Retrieve metadata from the org",
  type: "local",
  execute: async (args) => {
    if (!args.trim()) return "Usage: /retrieve <metadata>, e.g. /retrieve ApexClass:MyClass";
    try {
      const result = await runSfCommand("project", ["retrieve", "start", "--metadata", args.trim()]);
      if (!result.success) return `Error: ${result.raw}`;
      const files = (result.data as any)?.files ?? [];
      if (Array.isArray(files) && files.length > 0) {
        const headers = ["Component", "Type", "Path"];
        const rows = files.map((f: any) => [
          f.fullName ?? "",
          f.type ?? "",
          f.filePath ?? "",
        ]);
        return `Retrieved ${files.length} component${files.length === 1 ? "" : "s"}:\n\n${formatTable(headers, rows)}`;
      }
      return `Retrieve complete.\n${result.raw}`;
    } catch (err: any) {
      return `Error retrieving metadata: ${err.message}`;
    }
  },
};

const queryCommand: SlashCommand = {
  name: "query",
  description: "Run a SOQL query against the default org",
  type: "local",
  execute: async (args) => {
    if (!args.trim()) return "Usage: /query <SOQL>\nExample: /query SELECT Id, Name FROM Account LIMIT 10";
    try {
      const result = await runSfCommand("data", ["query", "--query", args.trim()]);
      if (!result.success) return `Error: ${result.raw}`;
      return formatQueryResults(result.data as { records: any[] });
    } catch (err: any) {
      return `Error running query: ${err.message}`;
    }
  },
};

const queryDcCommand: SlashCommand = {
  name: "query-dc",
  description: "Run a Data Cloud ANSI SQL query",
  type: "prompt",
  getPrompt: (args) =>
    `Run this Data Cloud ANSI SQL query using the dc_query tool: ${args}`,
};

const insertCommand: SlashCommand = {
  name: "insert",
  description: "Insert a record: /insert ObjectName Field=Value Field=Value",
  type: "local",
  execute: async (args) => {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) return "Usage: /insert <ObjectName> Field=Value Field=Value ...";
    const objectName = parts[0]!;
    const values = parts.slice(1).join(" ");
    try {
      const result = await runSfCommand("data", ["create", "record", "--sobject", objectName, "--values", values]);
      if (!result.success) return `Error: ${result.raw}`;
      const id = (result.data as any)?.id ?? "";
      return id ? `Record created: ${objectName} ${id}` : `Record created.\n${result.raw}`;
    } catch (err: any) {
      return `Error inserting record: ${err.message}`;
    }
  },
};

const agentPreviewCommand: SlashCommand = {
  name: "agent-preview",
  description: "Preview an Agentforce agent with an utterance",
  type: "local",
  execute: async (args) => {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) return "Usage: /agent:preview <AgentName> <utterance>";
    const agentName = parts[0]!;
    const utterance = parts.slice(1).join(" ");
    try {
      const start = await runSfCommand("agent", ["preview", "start", "--name", agentName]);
      if (!start.success) return `Error starting preview: ${start.raw}`;

      const send = await runSfCommand("agent", ["preview", "send", "--message", utterance]);

      await runSfCommand("agent", ["preview", "end"]);

      if (!send.success) return `Error sending message: ${send.raw}`;
      const output = (send.data as any)?.output ?? (send.data as any)?.message ?? send.raw;
      return `Agent response:\n\n${typeof output === "string" ? output : JSON.stringify(output, null, 2)}`;
    } catch (err: any) {
      try { await runSfCommand("agent", ["preview", "end"]); } catch { /* best-effort cleanup */ }
      return `Error in agent preview: ${err.message}`;
    }
  },
};

const dcObjectsCommand: SlashCommand = {
  name: "dc-objects",
  description: "List all Data Cloud objects",
  type: "prompt",
  getPrompt: () =>
    "Use the dc_list_objects tool to list all Data Cloud objects",
};

const dcDescribeCommand: SlashCommand = {
  name: "dc-describe",
  description: "Describe a Data Cloud table",
  type: "prompt",
  getPrompt: (args) =>
    `Use the dc_describe tool to describe this Data Cloud table: ${args}`,
};

const deployStatusCommand: SlashCommand = {
  name: "deploy-status",
  description: "Check the status of the most recent deployment",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("project", ["deploy", "report"]);
      if (!result.success) return `Error: ${result.raw}`;
      const data = result.data as any;
      const status = data?.status ?? "Unknown";
      const components = data?.numberComponentsDeployed ?? "?";
      const errors = data?.numberComponentErrors ?? 0;
      return `Deploy Status: ${status}\nComponents deployed: ${components}\nErrors: ${errors}${errors > 0 ? `\n\n${result.raw}` : ""}`;
    } catch (err: any) {
      return `Error checking deploy status: ${err.message}`;
    }
  },
};

const deployCancelCommand: SlashCommand = {
  name: "deploy-cancel",
  description: "Cancel the most recent deployment",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("project", ["deploy", "cancel"]);
      if (!result.success) return `Error: ${result.raw}`;
      return "Deploy cancelled.";
    } catch (err: any) {
      return `Error cancelling deploy: ${err.message}`;
    }
  },
};

const testCoverageCommand: SlashCommand = {
  name: "test-coverage",
  description: "Run Apex tests and show code coverage",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("apex", [
        "run", "test", "--code-coverage", "--result-format", "json",
      ]);
      if (!result.success) return `Error: ${result.raw}`;
      const data = result.data as any;
      const coverage = data?.coverage?.coverage ?? data?.codeCoverage ?? [];
      if (Array.isArray(coverage) && coverage.length > 0) {
        const headers = ["Class", "Coverage %", "Lines Covered", "Lines Missed"];
        const rows = coverage.map((c: any) => {
          const covered = c.numLinesCovered ?? 0;
          const uncovered = c.numLinesUncovered ?? 0;
          const total = covered + uncovered;
          const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
          return [c.name ?? "", `${pct}%`, String(covered), String(uncovered)];
        });
        return formatTable(headers, rows);
      }
      return `Test run complete.\n${result.raw}`;
    } catch (err: any) {
      return `Error running tests: ${err.message}`;
    }
  },
};

const logsCommand: SlashCommand = {
  name: "logs",
  description: "View debug logs: /logs [logId] or /logs [count]",
  type: "local",
  execute: async (args) => {
    try {
      const trimmed = args.trim();
      if (trimmed && /^[a-zA-Z0-9]{15,18}$/.test(trimmed)) {
        const result = await runSfCommand("apex", ["get", "log", "--log-id", trimmed]);
        if (!result.success) return `Error: ${result.raw}`;
        return result.raw;
      }
      const count = trimmed && /^\d+$/.test(trimmed) ? trimmed : "5";
      const result = await runSfCommand("apex", ["list", "log", "--number", count]);
      if (!result.success) return `Error: ${result.raw}`;
      const logs = Array.isArray(result.data) ? result.data : [];
      if (logs.length === 0) return "No debug logs found.";
      const headers = ["Id", "Application", "Operation", "Status", "Size"];
      const rows = logs.map((l: any) => [
        l.Id ?? "",
        l.Application ?? "",
        l.Operation ?? "",
        l.Status ?? "",
        String(l.LogLength ?? ""),
      ]);
      return formatTable(headers, rows);
    } catch (err: any) {
      return `Error fetching logs: ${err.message}`;
    }
  },
};

// ---------------------------------------------------------------------------
// Salesforce prompt commands
// ---------------------------------------------------------------------------

const apexCommand: SlashCommand = {
  name: "apex",
  description: "Execute or generate Apex code",
  type: "prompt",
  getPrompt: (args) =>
    `Execute or generate Apex code. If this looks like Apex code, run it as anonymous Apex. If it's a description, write the Apex class and test class: ${args}`,
};

const lwcCommand: SlashCommand = {
  name: "lwc",
  description: "Create or modify a Lightning Web Component",
  type: "prompt",
  getPrompt: (args) =>
    `Create or modify a Lightning Web Component. Generate the JS, HTML, CSS, and meta.xml files: ${args}`,
};

const flowCommand: SlashCommand = {
  name: "flow",
  description: "Create or describe a Salesforce Flow",
  type: "prompt",
  getPrompt: (args) =>
    `Create or describe a Salesforce Flow. Generate the Flow XML metadata: ${args}`,
};

const triggerCommand: SlashCommand = {
  name: "trigger",
  description: "Create an Apex trigger with handler class pattern",
  type: "prompt",
  getPrompt: (args) =>
    `Create an Apex trigger with handler class pattern (one trigger per object) and test class: ${args}`,
};

const agentBuildCommand: SlashCommand = {
  name: "agent-build",
  description: "Build a complete Agentforce agent end-to-end",
  type: "prompt",
  getPrompt: (args) =>
    `Build a complete Agentforce agent end-to-end. Use the agentforce-build skill. Requirements: ${args}`,
};

const agentTestCommand: SlashCommand = {
  name: "agent-test",
  description: "Test an Agentforce agent",
  type: "prompt",
  getPrompt: (args) =>
    `Test an Agentforce agent. Use the agentforce-test skill. Target: ${args}`,
};

const agentDeployCommand: SlashCommand = {
  name: "agent-deploy",
  description: "Publish and activate an Agentforce agent bundle",
  type: "prompt",
  getPrompt: (args) =>
    `Publish and activate an Agentforce agent bundle. Deploy dependencies first, then publish, then activate: ${args}`,
};

const dcSetupCommand: SlashCommand = {
  name: "dc-setup",
  description: "Set up Data Cloud configuration",
  type: "prompt",
  getPrompt: (args) =>
    `Set up Data Cloud configuration. Use the data-cloud-setup skill: ${args}`,
};

const testGenerateCommand: SlashCommand = {
  name: "test-generate",
  description: "Generate comprehensive Apex test classes",
  type: "prompt",
  getPrompt: (args) =>
    `Generate comprehensive Apex test classes for the specified class. Include positive, negative, bulk, and governor limit test cases: ${args}`,
};

const exportCommand: SlashCommand = {
  name: "export",
  description: "Run a SOQL query and save results to CSV",
  type: "prompt",
  getPrompt: (args) =>
    `Run this SOQL query and save the results to a CSV file: ${args}`,
};

const debugCommand: SlashCommand = {
  name: "debug",
  description: "Analyze a Salesforce error or debug log",
  type: "prompt",
  getPrompt: (args) =>
    `Analyze this Salesforce error or debug log and explain the root cause with a fix: ${args}`,
};

const governorCommand: SlashCommand = {
  name: "governor",
  description: "Analyze Apex code for governor limit risks",
  type: "prompt",
  getPrompt: (args) =>
    `Analyze the specified Apex code for governor limit risks. Check for SOQL in loops, DML in loops, CPU time issues: ${args}`,
};

const scaffoldCommand: SlashCommand = {
  name: "scaffold",
  description: "Scaffold a full-stack app connected to Salesforce",
  type: "prompt",
  getPrompt: (args) =>
    `Scaffold a full-stack application connected to Salesforce. Use the app-scaffold skill: ${args}`,
};

const connectedAppCommand: SlashCommand = {
  name: "connected-app",
  description: "Create a Connected App in Salesforce",
  type: "prompt",
  getPrompt: (args) =>
    `Create a Connected App in Salesforce. Use the connected-app-setup skill: ${args}`,
};

const setupCommand: SlashCommand = {
  name: "setup",
  description: "Configure a Salesforce org setting",
  type: "prompt",
  getPrompt: (args) =>
    `Configure this Salesforce org setting. If it requires the Setup UI, use browser automation tools: ${args}`,
};

// ---------------------------------------------------------------------------
// MCP commands
// ---------------------------------------------------------------------------

const mcpListCommand: SlashCommand = {
  name: "mcp-list",
  description: "List configured MCP servers and their tools",
  type: "local",
  execute: async () => {
    try {
      const { loadMcpConfig, listConnectedServers } = await import("harnessforce-core");
      const config = loadMcpConfig();
      const connected = listConnectedServers();
      const serverNames = Object.keys(config.servers);
      if (serverNames.length === 0) return "No MCP servers configured.\n\nAdd one: /mcp-add <name> <command> [args...]\nConfig: ~/.harnessforce/mcp.json";
      const lines = serverNames.map(name => {
        const server = config.servers[name]!;
        const conn = connected.find(c => c.name === name);
        const status = conn ? `connected (${conn.toolCount} tools)` : (server.enabled === false ? "disabled" : "not connected");
        return `  ${name}: ${server.command} ${(server.args ?? []).join(" ")} [${status}]`;
      });
      return `MCP Servers:\n${lines.join("\n")}\n\nServers auto-connect on agent startup.`;
    } catch (e: any) { return `Error: ${e.message}`; }
  },
};

const mcpAddCommand: SlashCommand = {
  name: "mcp-add",
  description: "Add an MCP server (usage: /mcp-add <name> <command> [args...])",
  type: "local",
  execute: async (args) => {
    const parts = args.split(/\s+/);
    if (parts.length < 2) return "Usage: /mcp-add <name> <command> [args...]\nExample: /mcp-add explorer npx -y claude-code-explorer-mcp";
    const [name, command, ...cmdArgs] = parts;
    try {
      const { addMcpServer } = await import("harnessforce-core");
      addMcpServer(name!, { name: name!, command: command!, args: cmdArgs });
      return `Added MCP server "${name}". It will connect on next agent startup.\nOr restart now to connect immediately.`;
    } catch (e: any) { return `Error: ${e.message}`; }
  },
};

const mcpRemoveCommand: SlashCommand = {
  name: "mcp-remove",
  description: "Remove an MCP server",
  type: "local",
  execute: async (args) => {
    const name = args.trim();
    if (!name) return "Usage: /mcp-remove <name>";
    try {
      const { removeMcpServer, disconnectMcpServer } = await import("harnessforce-core");
      const removed = removeMcpServer(name);
      if (!removed) return `Server "${name}" not found.`;
      await disconnectMcpServer(name);
      return `Removed MCP server "${name}".`;
    } catch (e: any) { return `Error: ${e.message}`; }
  },
};

// ---------------------------------------------------------------------------
// Plugin commands
// ---------------------------------------------------------------------------

const pluginListCommand: SlashCommand = {
  name: "plugin-list",
  description: "List installed plugins",
  type: "local",
  execute: async () => {
    try {
      const { listPluginDirs } = await import("harnessforce-core");
      const plugins = listPluginDirs();
      if (plugins.length === 0) return "No plugins installed.\n\nInstall plugins to ~/.harnessforce/plugins/<name>/index.js\nEach plugin exports { tools?, hooks?, mcpServers? }";
      return `Installed plugins:\n${plugins.map(p => `  ${p}`).join("\n")}`;
    } catch (e: any) { return `Error: ${e.message}`; }
  },
};

// ---------------------------------------------------------------------------
// Extended Salesforce commands
// ---------------------------------------------------------------------------

const scratchCreateCommand: SlashCommand = {
  name: "scratch-create",
  description: "Create a new scratch org from a definition file",
  type: "local",
  execute: async (args) => {
    const parts = args.trim().split(/\s+/);
    const defFile = parts[0];
    if (!defFile) return "Usage: /scratch-create <definition-file> [alias]";
    const alias = parts[1];
    try {
      const sfArgs = ["create", "scratch", "--definition-file", defFile];
      if (alias) sfArgs.push("--alias", alias);
      const result = await runSfCommand("org", sfArgs, { timeout: 300_000 });
      if (!result.success) return `Error: ${result.raw}`;
      const data = result.data as any;
      const orgId = data?.orgId ?? data?.id ?? "";
      const username = data?.username ?? "";
      return `Scratch org created${alias ? ` (${alias})` : ""}${orgId ? `\nOrg ID: ${orgId}` : ""}${username ? `\nUsername: ${username}` : ""}`;
    } catch (err: any) {
      return `Error creating scratch org: ${err.message}`;
    }
  },
};

const scratchDeleteCommand: SlashCommand = {
  name: "scratch-delete",
  description: "Delete a scratch org",
  type: "local",
  execute: async (args) => {
    const targetOrg = args.trim();
    if (!targetOrg) return "Usage: /scratch-delete <alias-or-username>";
    try {
      const result = await runSfCommand("org", [
        "delete", "scratch", "--target-org", targetOrg, "--no-prompt",
      ]);
      if (!result.success) return `Error: ${result.raw}`;
      return `Scratch org "${targetOrg}" deleted.`;
    } catch (err: any) {
      return `Error deleting scratch org: ${err.message}`;
    }
  },
};

const packageCreateCommand: SlashCommand = {
  name: "package-create",
  description: "Create a new Salesforce package",
  type: "local",
  execute: async (args) => {
    const parts = args.trim().split(/\s+/);
    const name = parts[0];
    if (!name) return "Usage: /package-create <name> [Managed|Unlocked]";
    const packageType = parts[1] ?? "Unlocked";
    try {
      const result = await runSfCommand("package", [
        "create", "--name", name, "--package-type", packageType,
      ]);
      if (!result.success) return `Error: ${result.raw}`;
      return `Package "${name}" created (${packageType}).`;
    } catch (err: any) {
      return `Error creating package: ${err.message}`;
    }
  },
};

const packageVersionCommand: SlashCommand = {
  name: "package-version",
  description: "Create a new package version",
  type: "local",
  execute: async (args) => {
    const pkg = args.trim();
    if (!pkg) return "Usage: /package-version <package-id-or-alias>";
    try {
      const result = await runSfCommand("package", [
        "version", "create", "--package", pkg,
      ], { timeout: 600_000 });
      if (!result.success) return `Error: ${result.raw}`;
      const data = result.data as any;
      const versionId = data?.SubscriberPackageVersionId ?? data?.id ?? "";
      return `Package version created.${versionId ? `\nVersion ID: ${versionId}` : ""}`;
    } catch (err: any) {
      return `Error creating package version: ${err.message}`;
    }
  },
};

const coverageCommand: SlashCommand = {
  name: "coverage",
  description: "Run Apex tests and show code coverage (alias for /test-coverage)",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("apex", [
        "run", "test", "--code-coverage", "--result-format", "json",
      ], { timeout: 300_000 });
      if (!result.success) return `Error: ${result.raw}`;
      const data = result.data as any;
      const coverage = data?.coverage?.coverage ?? data?.codeCoverage ?? [];
      if (Array.isArray(coverage) && coverage.length > 0) {
        const headers = ["Class", "Coverage %", "Lines Covered", "Lines Missed"];
        const rows = coverage.map((c: any) => {
          const covered = c.numLinesCovered ?? 0;
          const uncovered = c.numLinesUncovered ?? 0;
          const total = covered + uncovered;
          const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
          return [c.name ?? "", `${pct}%`, String(covered), String(uncovered)];
        });
        return formatTable(headers, rows);
      }
      return `Test run complete.\n${result.raw}`;
    } catch (err: any) {
      return `Error running tests: ${err.message}`;
    }
  },
};

const deployHistoryCommand: SlashCommand = {
  name: "deploy-history",
  description: "Show the most recent deployment report",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("project", ["deploy", "report"]);
      if (!result.success) return `Error: ${result.raw}`;
      const data = result.data as any;
      const status = data?.status ?? "Unknown";
      const components = data?.numberComponentsDeployed ?? "?";
      const errors = data?.numberComponentErrors ?? 0;
      return `Deploy Status: ${status}\nComponents deployed: ${components}\nErrors: ${errors}${errors > 0 ? `\n\n${result.raw}` : ""}`;
    } catch (err: any) {
      return `Error checking deploy status: ${err.message}`;
    }
  },
};

const orgDiffCommand: SlashCommand = {
  name: "org-diff",
  description: "Compare metadata between two orgs",
  type: "prompt",
  getPrompt: (args) =>
    `Compare metadata between these two orgs: ${args}`,
};

const dataExportCommand: SlashCommand = {
  name: "data-export",
  description: "Run a SOQL query and export results as CSV",
  type: "local",
  execute: async (args) => {
    if (!args.trim()) return "Usage: /data-export <SOQL>\nExample: /data-export SELECT Id, Name FROM Account LIMIT 100";
    try {
      const result = await runSfCommand(
        "data",
        ["query", "--query", args.trim(), "--result-format", "csv"],
        { skipJson: true },
      );
      if (!result.success) return `Error: ${result.raw}`;
      return result.raw;
    } catch (err: any) {
      return `Error exporting data: ${err.message}`;
    }
  },
};

const limitsWatchCommand: SlashCommand = {
  name: "limits-watch",
  description: "Show current org limits (alias for /org-limits)",
  type: "local",
  execute: async () => {
    try {
      const result = await runSfCommand("org", ["list", "limits"]);
      if (!result.success) return `Error: ${result.raw}`;
      const limits = Array.isArray(result.data) ? result.data : [];
      if (limits.length === 0) return "No limits data returned.";
      const headers = ["Limit", "Remaining", "Max"];
      const rows = limits.map((l: any) => [
        l.name ?? "",
        String(l.remaining ?? ""),
        String(l.max ?? ""),
      ]);
      return formatTable(headers, rows);
    } catch (err: any) {
      return `Error fetching limits: ${err.message}`;
    }
  },
};

const sandboxCreateCommand: SlashCommand = {
  name: "sandbox-create",
  description: "Create a new Salesforce sandbox",
  type: "local",
  execute: async (args) => {
    const parts = args.trim().split(/\s+/);
    const name = parts[0];
    if (!name) return "Usage: /sandbox-create <name> [definition-file]";
    const defFile = parts[1];
    try {
      const sfArgs = ["create", "sandbox", "--name", name];
      if (defFile) sfArgs.push("--definition-file", defFile);
      const result = await runSfCommand("org", sfArgs, { timeout: 300_000 });
      if (!result.success) return `Error: ${result.raw}`;
      return `Sandbox "${name}" creation started.`;
    } catch (err: any) {
      return `Error creating sandbox: ${err.message}`;
    }
  },
};

// ---------------------------------------------------------------------------
// Built-in prompt commands
// ---------------------------------------------------------------------------

const commitCommand: SlashCommand = {
  name: "commit",
  description: "Review staged changes and create a git commit",
  type: "prompt",
  getPrompt: () =>
    "Review the currently staged git changes (run `git diff --cached` and `git status`). Then create a git commit with a clear, descriptive commit message that summarizes the changes. If nothing is staged, let me know.",
};

const diffCommand: SlashCommand = {
  name: "diff",
  description: "Show and explain the current git diff",
  type: "prompt",
  getPrompt: () =>
    "Run `git diff` to show the current unstaged changes, and `git diff --cached` for staged changes. Explain what the changes do in plain English.",
};

const deployCommand: SlashCommand = {
  name: "deploy",
  description: "Deploy the current Salesforce project to the default org",
  type: "prompt",
  getPrompt: () =>
    "Deploy the current Salesforce project to the default org. Auto-detect changed files. Run a dry-run validation first with `sf project deploy start --dry-run`. Show results. If validation passes, ask to deploy for real with `sf project deploy start`. If there are errors, explain them and suggest fixes.",
};

const testCommand: SlashCommand = {
  name: "test",
  description: "Run all Apex tests and report results",
  type: "prompt",
  getPrompt: () =>
    "Run all Apex tests in the current Salesforce project using `sf apex run test --synchronous --result-format human`. Report the results including any failures with details.",
};

const compactCommand: SlashCommand = {
  name: "compact",
  description: "Summarize older messages to free up context space",
  type: "local",
  execute: async () => {
    const tokensBefore = estimateMessagesTokens([]);
    // Note: actual compaction requires access to the conversation messages
    // which are in the LangGraph checkpointer. For now, report status.
    return `Context compaction available.\nEstimated tokens: ${tokensBefore}\nTo free context, start a new session or use a model with a larger context window.`;
  },
};

const rememberCommand: SlashCommand = {
  name: "remember",
  description: "Save what you learned in this conversation to memory",
  type: "prompt",
  getPrompt: (args: string) => {
    const extra = args.trim() ? `\n\nSpecifically, remember: ${args}` : "";
    return `Review this conversation and save any important learnings, corrections, or project-specific knowledge to .harnessforce/agent.md. Create the file if it doesn't exist. Use a structured format with headers and bullet points.${extra}`;
  },
};

const threadsCommand: SlashCommand = {
  name: "threads",
  description: "List previous conversation sessions",
  type: "local",
  execute: async () => {
    const manager = createSessionManager();
    const sessions = await manager.list();

    if (sessions.length === 0) {
      return "No saved sessions found.";
    }

    const lines = sessions.map((s) => {
      const started = new Date(s.startedAt).toLocaleString();
      const last = new Date(s.lastMessageAt).toLocaleString();
      return `  ${s.id.slice(0, 8)}...  ${s.messageCount} msgs  started ${started}  last ${last}`;
    });

    return `Saved sessions (${sessions.length}):\n\n${lines.join("\n")}\n`;
  },
};

const resumeCommand: SlashCommand = {
  name: "resume",
  description: "Resume a previous conversation session",
  type: "local",
  execute: async () => {
    const manager = createSessionManager();
    const sessions = await manager.list();
    if (sessions.length === 0) return "No previous sessions found.";

    const lines = sessions.slice(0, 10).map((s, i) =>
      `  ${i + 1}. ${s.id.slice(0, 8)}... (${s.messageCount} messages, ${new Date(s.lastMessageAt).toLocaleString()})`,
    );
    return `Previous sessions:\n\n${lines.join("\n")}\n\nUse: harnessforce --resume <session-id> to resume.`;
  },
};

const costCommand: SlashCommand = {
  name: "cost",
  description: "Show token usage and estimated cost for this session",
  type: "local",
  execute: async () => {
    return sessionCostTracker.getUsageSummary();
  },
};

const undoCommand: SlashCommand = {
  name: "undo",
  description: "Restore the previous version of the last edited file",
  type: "local",
  execute: async () => {
    const lastFile = getLastEditedFile();
    if (!lastFile) return "No recent file edits to undo.";
    const restored = await restoreLastVersion(lastFile);
    if (restored) return `Restored previous version of ${lastFile}`;
    return `No history found for ${lastFile}`;
  },
};

const hooksCommand: SlashCommand = {
  name: "hooks",
  description: "List configured hooks from .harnessforce/settings.json",
  type: "local",
  execute: async () => {
    const hooks = loadHooks();
    if (hooks.length === 0) return "No hooks configured.\nAdd hooks to .harnessforce/settings.json";
    const lines = hooks.map((h) => `  ${h.event}: ${h.command} ${(h.args || []).join(" ")}`);
    return `Configured hooks:\n\n${lines.join("\n")}`;
  },
};

// ---------------------------------------------------------------------------
// Editor, Output Style, Todos commands
// ---------------------------------------------------------------------------

const editorCommand: SlashCommand = {
  name: "editor",
  description: "Open current input in an external editor ($VISUAL / $EDITOR)",
  type: "local",
  execute: async (_args, ctx) => {
    const result = await openInEditor("");
    if (result === null) return "Editor cancelled (empty result).";
    return `Editor content:\n${result}`;
    // Note: ideally this would submit the content as a message,
    // but for now just show what was typed
  },
};

/** Available output styles. */
const OUTPUT_STYLES = ["default", "explanatory", "learning"] as const;
let currentOutputStyle: string = "default";

export function getOutputStyle(): string {
  return currentOutputStyle;
}

const outputStyleCommand: SlashCommand = {
  name: "output-style",
  description: "Show or switch output style (default, explanatory, learning)",
  type: "local",
  execute: async (args) => {
    const style = args.trim().toLowerCase();
    if (!style) {
      const lines = OUTPUT_STYLES.map(
        (s) => `  ${s === currentOutputStyle ? "* " : "  "}${s}`,
      );
      return `Output styles:\n\n${lines.join("\n")}\n`;
    }
    if (!(OUTPUT_STYLES as readonly string[]).includes(style)) {
      return `Unknown style "${style}". Available: ${OUTPUT_STYLES.join(", ")}`;
    }
    currentOutputStyle = style;
    return `Output style switched to: ${style}`;
  },
};

const todosCommand: SlashCommand = {
  name: "todos",
  description: "Show the current todo list from the session",
  type: "local",
  execute: async () => {
    const todos = getTodos();
    if (todos.length === 0) return "No todos. The agent can create todos with the write_todos tool.";
    const lines = todos.map((t) => {
      const icon =
        t.status === "completed"
          ? "\u2713"
          : t.status === "in_progress"
            ? "\u25C9"
            : "\u2610";
      return `${icon} [${t.id}] ${t.title}`;
    });
    return lines.join("\n");
  },
};

// ---------------------------------------------------------------------------
// Plan / Approve, Version, Changelog, Feedback, Tokens, Reload
// ---------------------------------------------------------------------------

const planCommand: SlashCommand = {
  name: "plan",
  description: "Enter plan mode — agent explores but can't make changes",
  type: "local",
  execute: async (_args, ctx) => {
    if (ctx.setPermissionMode) ctx.setPermissionMode("plan");
    return "Entered plan mode. Agent can explore but won't make changes.\nUse /approve to exit plan mode and execute.";
  },
};

const approveCommand: SlashCommand = {
  name: "approve",
  description: "Exit plan mode and let the agent execute changes",
  type: "local",
  execute: async (_args, ctx) => {
    if (ctx.setPermissionMode) ctx.setPermissionMode("default");
    return "Plan approved. Agent can now make changes.";
  },
};

const versionCommand: SlashCommand = {
  name: "version",
  description: "Show the current Harnessforce version",
  type: "local",
  execute: async () => `Harnessforce v${process.env.npm_package_version ?? "0.7.4"}`,
};

const changelogCommand: SlashCommand = {
  name: "changelog",
  description: "Open the changelog / release notes in the browser",
  type: "local",
  execute: async () => {
    try { (await import("node:child_process")).execSync("open https://github.com/skyrmionz/harnessforce/releases"); } catch {}
    return "Opened changelog in browser.";
  },
};

const feedbackCommand: SlashCommand = {
  name: "feedback",
  description: "Open GitHub Issues to submit feedback",
  type: "local",
  execute: async () => {
    try { (await import("node:child_process")).execSync("open https://github.com/skyrmionz/harnessforce/issues/new"); } catch {}
    return "Opened GitHub Issues in browser.";
  },
};

const tokensCommand: SlashCommand = {
  name: "tokens",
  description: "Show token usage and estimated cost (alias for /cost)",
  type: "local",
  execute: async () => sessionCostTracker.getUsageSummary(),
};

const reloadCommand: SlashCommand = {
  name: "reload",
  description: "Reload configuration from ~/.harnessforce/models.yaml",
  type: "local",
  execute: async () => {
    ensureConfigFile();
    return "Configuration reloaded from ~/.harnessforce/models.yaml";
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const builtInCommands: SlashCommand[] = [
  helpCommand,
  setKeyCommand,
  modelCommand,
  modelListCommand,
  skillListCommand,
  skillAddCommand,
  toolListCommand,
  orgCommand,
  orgLoginCommand,
  quitCommand,
  exitCommand,
  clearCommand,
  statusCommand,
  doctorCommand,
  rollbackCommand,
  initCommand,
  forceCommand,
  commitCommand,
  diffCommand,
  deployCommand,
  testCommand,
  compactCommand,
  rememberCommand,
  threadsCommand,
  resumeCommand,
  costCommand,
  undoCommand,
  hooksCommand,
  editorCommand,
  outputStyleCommand,
  todosCommand,
  planCommand,
  approveCommand,
  versionCommand,
  changelogCommand,
  feedbackCommand,
  tokensCommand,
  reloadCommand,
  // Salesforce local commands
  orgListCommand,
  orgOpenCommand,
  orgLimitsCommand,
  describeCommand,
  metadataCommand,
  retrieveCommand,
  queryCommand,
  queryDcCommand,
  insertCommand,
  agentPreviewCommand,
  dcObjectsCommand,
  dcDescribeCommand,
  deployStatusCommand,
  deployCancelCommand,
  testCoverageCommand,
  logsCommand,
  // Extended Salesforce commands
  scratchCreateCommand,
  scratchDeleteCommand,
  packageCreateCommand,
  packageVersionCommand,
  coverageCommand,
  deployHistoryCommand,
  orgDiffCommand,
  dataExportCommand,
  limitsWatchCommand,
  sandboxCreateCommand,
  // Salesforce prompt commands
  apexCommand,
  lwcCommand,
  flowCommand,
  triggerCommand,
  agentBuildCommand,
  agentTestCommand,
  agentDeployCommand,
  dcSetupCommand,
  testGenerateCommand,
  exportCommand,
  debugCommand,
  governorCommand,
  scaffoldCommand,
  connectedAppCommand,
  setupCommand,
  // MCP
  mcpListCommand,
  mcpAddCommand,
  mcpRemoveCommand,
  // Plugins
  pluginListCommand,
];

/**
 * Get all registered slash commands, including skill-based prompt commands.
 */
export function getCommands(skillsDir: string = "./skills"): SlashCommand[] {
  const skills = loadSkills(skillsDir);
  const skillCommands = skillsToCommands(skills);
  return [...builtInCommands, ...skillCommands];
}

/**
 * Find a command by name (with or without leading slash).
 */
export function findCommand(
  input: string,
  skillsDir: string = "./skills"
): SlashCommand | undefined {
  const name = input.startsWith("/") ? input.slice(1) : input;
  // Split to separate command name from args
  const cmdName = name.split(/\s+/)[0]!.toLowerCase();
  const commands = getCommands(skillsDir);
  return commands.find((c) => c.name.toLowerCase() === cmdName);
}

/**
 * Convert loaded skills into prompt-type slash commands.
 */
function skillsToCommands(skills: Skill[]): SlashCommand[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description || skill.trigger || `Run the ${skill.name} skill`,
    type: "prompt" as CommandType,
    getPrompt: (args: string) => {
      let prompt = `Use the "${skill.name}" skill.\n\n`;
      prompt += `Skill instructions:\n${skill.content}\n`;
      if (args.trim()) {
        prompt += `\nUser context: ${args}`;
      }
      return prompt;
    },
  }));
}
