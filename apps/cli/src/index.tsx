#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";

// Read version from package.json at runtime (never hardcode)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let CLI_VERSION = "1.2.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  CLI_VERSION = pkg.version;
} catch { /* fallback */ }
import { createHarnessforceAgent, createSessionManager, detectProjectContext, buildContextPrompt, readConfig, ensureConfigFile, resolveApiKey } from "harnessforce-core";
import { modelCommands } from "./commands/model.js";
import { skillCommands } from "./commands/skill.js";
import { toolCommands } from "./commands/tool.js";
import App from "./ui/app.js";
import { renderGreeting } from "./ui/greeting.js";

const program = new Command();

program
  .name("harnessforce")
  .description("Harnessforce — The Salesforce Vibe Coding Agent")
  .version(CLI_VERSION)
  .option(
    "-m, --model <model>",
    "Model to use (provider:model format)",
    undefined
  )
  .option(
    "-p, --permission-mode <mode>",
    "Permission mode (default, plan, yolo, safe)",
    "default"
  )
  .option("-o, --org <alias>", "Default Salesforce org alias")
  .option("-k, --api-key <key>", "Anthropic API key")
  .option("-s, --skills-dir <path>", "Skills directory", "./skills")
  .option("-r, --resume <id>", "Resume a previous session by ID")
  .option("-n, --non-interactive <task>", "Run a single task without TUI and exit")
  .action(async (opts) => {
    // Auto-update check (truly non-blocking)
    const currentVersion = program.version() ?? "0.0.0";
    import("node:child_process").then(({ execFile }) => {
      execFile("npm", ["view", "harnessforce", "version"], { encoding: "utf-8", timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) return;
        const latest = stdout.trim();
        if (latest && latest !== currentVersion) {
          console.log(`\n  Update available: ${currentVersion} → ${latest}`);
          console.log(`  Run: npm install -g harnessforce\n`);
        }
      });
    }).catch(() => {});

    // Read model config (used for API key resolution + greeting)
    ensureConfigFile();
    const modelConfig = readConfig();

    // Resolve API key: flag > env vars > config file
    let apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;

    // Check config file for saved API key if not found in env
    if (!apiKey) {
      for (const provider of Object.values(modelConfig.providers)) {
        if (provider.apiKey && !provider.apiKey.startsWith("${")) {
          apiKey = provider.apiKey;
          break;
        }
      }
    }

    // Detect project context
    const ctx = await detectProjectContext(process.cwd());
    let orgAlias = opts.org || ctx.defaultOrg;
    const [greetingProvider] = modelConfig.defaultModel.includes(":")
      ? modelConfig.defaultModel.split(":")
      : ["openrouter"];
    const greetingModel = modelConfig.defaultModel.includes(":")
      ? modelConfig.defaultModel.split(":").slice(1).join(":")
      : modelConfig.defaultModel;
    const greetingProviderInfo = modelConfig.providers[greetingProvider];
    const greetingHasKey = greetingProviderInfo?.type === "local"
      || (greetingProviderInfo?.apiKey ? !!resolveApiKey(greetingProviderInfo.apiKey) : false);

    // Print the greeting immediately (don't wait for org list)
    console.log(renderGreeting({
      version: program.version() ?? "0.1.0",
      org: orgAlias || undefined,
      cwd: process.cwd(),
      provider: greetingProviderInfo ? `${greetingProvider} (${greetingProviderInfo.type})` : undefined,
      model: greetingModel || undefined,
      setupStatus: !greetingProviderInfo ? "no-provider" : !greetingHasKey ? "no-key" : "ready",
    }));

    // Show detected context
    if (ctx.isSfdxProject && ctx.projectName) {
      console.log(`  Detected SFDX project: ${ctx.projectName}`);
    }
    if (ctx.defaultOrg && !opts.org) {
      console.log(`  Default org: ${ctx.defaultOrg}`);
    }

    // Discover orgs in background (non-blocking — sf org list takes 5-10s)
    if (!orgAlias && !opts.resume) {
      import("node:child_process").then(({ execFile }) => {
        execFile("sf", ["org", "list", "--json"], { encoding: "utf-8", timeout: 15_000 }, (err, stdout) => {
          if (err || !stdout) return;
          try {
            const orgList = JSON.parse(stdout);
            const allOrgs = [
              ...(orgList.result?.nonScratchOrgs ?? []),
              ...(orgList.result?.scratchOrgs ?? []),
            ];

            if (allOrgs.length === 0) {
              console.log("\n  No Salesforce orgs found. Use /org-login to authenticate one.\n");
            } else if (allOrgs.length === 1) {
              const detected = allOrgs[0].alias || allOrgs[0].username;
              console.log(`\n  Detected org: ${detected}\n`);
            } else {
              console.log("\n  Authenticated orgs:");
              allOrgs.slice(0, 10).forEach((o: any, i: number) => {
                const name = o.alias || o.username;
                const type = o.isScratch ? "scratch" : o.isSandbox ? "sandbox" : "production";
                const def = o.isDefaultUsername ? " (default)" : "";
                console.log(`    ${i + 1}. ${name} (${type})${def}`);
              });
              console.log(`\n  Use /org <alias> to switch, or /org-login to add a new org.\n`);
            }
          } catch { /* parse error — skip */ }
        });
      }).catch(() => { /* child_process import failed */ });
    }

    // Create session manager
    const sessionManager = createSessionManager();

    // Generate thread ID for agent checkpointing (reuse resume ID if provided)
    const threadId = opts.resume ?? randomUUID();

    // Auto-recovery: hint about recent sessions (Claude Code pattern)
    let initialMessages: Array<{ role: "user" | "assistant" | "tool" | "system"; content: string }> | undefined;
    if (!opts.resume) {
      try {
        const sessions = await sessionManager.list();
        if (sessions.length > 0) {
          const latest = sessions[0]; // sorted most-recent-first
          if (latest) {
            console.log(`  Last session: ${latest.id.slice(0, 8)}... (${latest.messageCount} messages). To continue: npx harnessforce --resume ${latest.id.slice(0, 8)}\n`);
          }
        }
      } catch { /* no sessions available */ }
    }

    // Resume session if requested
    if (opts.resume) {
      const loaded = await sessionManager.load(opts.resume);
      if (loaded.length > 0) {
        initialMessages = loaded.map((m) => ({
          role: (m.role as "user" | "assistant" | "tool" | "system") ?? "user",
          content: m.content,
        }));
        console.log(`  Resumed session ${opts.resume.slice(0, 8)}... (${loaded.length} messages)\n`);
      } else {
        console.log(`  Session ${opts.resume} not found. Starting fresh.\n`);
      }
    }

    // Check for API key before creating agent
    if (!apiKey) {
      console.log(
        "\n  ⚠  No API key found. Get one at https://openrouter.ai/keys\n" +
        "\n  Set it right here:  /set-key sk-or-your-key-here" +
        "\n  Or in your terminal: export OPENROUTER_API_KEY=sk-or-...\n" +
        "\n  Slash commands still work — type / to see them.\n"
      );
    }

    // Build system prompt from context
    const contextPrompt = buildContextPrompt(ctx);
    let systemPrompt = contextPrompt || undefined;
    if (orgAlias && !contextPrompt.includes(orgAlias)) {
      systemPrompt = (systemPrompt ? systemPrompt + "\n" : "") +
        `The user's default Salesforce org alias is: ${orgAlias}`;
    }

    // ── Non-interactive mode — must await agent ──────────────────────────
    if (opts.nonInteractive) {
      let agent: Awaited<ReturnType<typeof createHarnessforceAgent>> | null = null;
      try {
        agent = await createHarnessforceAgent({
          model: opts.model,
          apiKey,
          skillsDir: opts.skillsDir,
          systemPrompt,
          projectContext: ctx,
        });
      } catch (err: any) {
        console.error(`Error creating agent: ${err.message}`);
        process.exit(1);
      }

      const task = opts.nonInteractive as string;
      if (!agent) {
        console.error("Error: Cannot run non-interactive mode without an API key.");
        process.exit(1);
      }

      sessionManager.appendMessage({ role: "user", content: task, timestamp: new Date().toISOString() });
      let nonInteractiveResponse = "";

      try {
        for await (const event of (agent.stream as any)(task, threadId, opts.permissionMode)) {
          switch (event.type) {
            case "token":
              nonInteractiveResponse += event.content;
              process.stdout.write(event.content);
              break;
            case "tool_call":
              console.log(`\n[tool] ${event.name}(${JSON.stringify(event.args)})`);
              break;
            case "tool_result":
              console.log(`[result] ${event.content}`);
              break;
            case "error":
              console.error(`\nError: ${event.error}`);
              process.exit(1);
              break;
            case "done":
              console.log("");
              break;
          }
        }
        if (nonInteractiveResponse) {
          sessionManager.appendMessage({ role: "assistant", content: nonInteractiveResponse, timestamp: new Date().toISOString() });
        }
        process.exit(0);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      process.exit(0);
    }

    // Check if stdin supports raw mode (required for Ink TUI)
    if (!process.stdin.isTTY) {
      console.error("Error: Harnessforce requires an interactive terminal. Use -n for non-interactive mode.");
      process.exit(1);
    }

    // Create agent in background — TUI renders immediately
    const agentPromise = apiKey
      ? createHarnessforceAgent({
          model: opts.model,
          apiKey,
          skillsDir: opts.skillsDir,
          systemPrompt,
          projectContext: ctx,
        }).catch((err: any) => {
          console.error(`  Error creating agent: ${err.message}`);
          return null;
        })
      : Promise.resolve(null);

    // Render the Ink TUI immediately (agent loads in background)
    const instance = render(
      React.createElement(App, {
        agentPromise,
        skillsDir: opts.skillsDir,
        org: orgAlias,
        model: opts.model,
        sessionManager,
        initialMessages,
        threadId,
        permissionMode: opts.permissionMode,
      })
    );

    // Handle graceful shutdown (Claude Code pattern: cleanup registry)
    const gracefulShutdown = () => {
      // 1. Save session state
      try { sessionManager.save([]); } catch { /* best-effort */ }
      // 2. Clean up browser + MCP servers
      try {
        import("harnessforce-core").then(({ closeBrowser, disconnectAllMcpServers }) => {
          closeBrowser?.();
          disconnectAllMcpServers?.();
        }).catch(() => {});
      } catch { /* cleanup failed */ }
      // 3. Unmount TUI
      instance.unmount();
      process.exit(0);
    };

    process.on("SIGINT", gracefulShutdown);

    process.on("SIGTERM", gracefulShutdown);

    await instance.waitUntilExit();
  });

// ── `harnessforce serve` — MCP server mode for Claude Code integration ──
program
  .command("serve")
  .description("Start Harnessforce as an MCP server (for Claude Code integration)")
  .action(async () => {
    const { startMcpServer } = await import("harnessforce-core/mcp");
    await startMcpServer();
  });

// Register model & provider management commands
for (const cmd of modelCommands) {
  program.addCommand(cmd);
}

// Register skill management commands
for (const cmd of skillCommands) {
  program.addCommand(cmd);
}

// Register tool management commands
for (const cmd of toolCommands) {
  program.addCommand(cmd);
}

program.parse();
