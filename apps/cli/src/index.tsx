#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { createVibeforceAgent, createSessionManager, detectProjectContext, buildContextPrompt } from "vibeforce-core";
import { modelCommands } from "./commands/model.js";
import { skillCommands } from "./commands/skill.js";
import { toolCommands } from "./commands/tool.js";
import App from "./ui/app.js";
import { renderGreeting } from "./ui/greeting.js";

const program = new Command();

program
  .name("vibeforce")
  .description("Vibeforce — The Salesforce Vibe Coding Agent")
  .version("0.1.0")
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
    // Auto-update check (non-blocking, background)
    try {
      const { execSync } = await import("node:child_process");
      const currentVersion = program.version() ?? "0.0.0";
      const latest = execSync("npm view vibeforce version 2>/dev/null", { encoding: "utf-8", timeout: 5000 }).trim();
      if (latest && latest !== currentVersion) {
        console.log(`\n  Update available: ${currentVersion} → ${latest}`);
        console.log(`  Run: npm install -g vibeforce\n`);
      }
    } catch { /* offline or npm not available — skip silently */ }

    // Resolve API key: flag > env vars > config file
    let apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;

    // Check config file for saved API key if not found in env
    if (!apiKey) {
      try {
        const { readConfig, ensureConfigFile } = await import("vibeforce-core");
        ensureConfigFile();
        const config = readConfig();
        for (const provider of Object.values(config.providers)) {
          if (provider.apiKey && !provider.apiKey.startsWith("${")) {
            apiKey = provider.apiKey;
            break;
          }
        }
      } catch { /* config not available yet */ }
    }

    // Detect project context
    const ctx = await detectProjectContext(process.cwd());
    let orgAlias = opts.org || ctx.defaultOrg;

    // If no org set, check for authenticated orgs and prompt
    if (!orgAlias && !opts.resume) {
      try {
        const { execSync } = await import("node:child_process");
        const orgListRaw = execSync("sf org list --json 2>/dev/null", { encoding: "utf-8", timeout: 10_000 });
        const orgList = JSON.parse(orgListRaw);
        const allOrgs = [
          ...(orgList.result?.nonScratchOrgs ?? []),
          ...(orgList.result?.scratchOrgs ?? []),
        ];

        if (allOrgs.length === 0) {
          console.log("\n  No Salesforce orgs found. Use /org-login to authenticate one.\n");
        } else if (allOrgs.length === 1) {
          orgAlias = allOrgs[0].alias || allOrgs[0].username;
          console.log(`\n  Using org: ${orgAlias}\n`);
        } else {
          // Multiple orgs — show list and ask to pick
          console.log("\n  Authenticated orgs:");
          allOrgs.slice(0, 10).forEach((o: any, i: number) => {
            const name = o.alias || o.username;
            const type = o.isScratch ? "scratch" : o.isSandbox ? "sandbox" : "production";
            const def = o.isDefaultUsername ? " (default)" : "";
            console.log(`    ${i + 1}. ${name} (${type})${def}`);
          });
          console.log(`\n  Use /org <alias> to switch, or /org-login to add a new org.\n`);

          // Use the default org if one exists
          const defaultOrg = allOrgs.find((o: any) => o.isDefaultUsername);
          if (defaultOrg) {
            orgAlias = defaultOrg.alias || defaultOrg.username;
          }
        }
      } catch { /* sf CLI not available or failed */ }
    }

    // Print the greeting
    console.log(renderGreeting({
      version: program.version() ?? "0.1.0",
      org: orgAlias,
      cwd: process.cwd(),
    }));

    // Show detected context
    if (ctx.isSfdxProject && ctx.projectName) {
      console.log(`  Detected SFDX project: ${ctx.projectName}`);
    }
    if (ctx.defaultOrg && !opts.org) {
      console.log(`  Default org: ${ctx.defaultOrg}`);
    }

    // Create session manager
    const sessionManager = createSessionManager();

    // Resume session if requested
    let initialMessages: Array<{ role: "user" | "assistant" | "tool" | "system"; content: string }> | undefined;
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

    // Create the agent (may be null if no API key)
    let agent: Awaited<ReturnType<typeof createVibeforceAgent>> | null = null;
    try {
      agent = await createVibeforceAgent({
        model: opts.model,
        apiKey,
        skillsDir: opts.skillsDir,
        systemPrompt,
        projectContext: ctx,
      });
    } catch (err: any) {
      if (!apiKey) {
        // Expected — no key, agent won't work but slash commands will
      } else {
        console.error(`  Error creating agent: ${err.message}`);
      }
    }

    // ── Non-interactive mode ──────────────────────────────────────────────
    if (opts.nonInteractive) {
      const task = opts.nonInteractive as string;
      if (!agent) {
        console.error("Error: Cannot run non-interactive mode without an API key.");
        process.exit(1);
      }

      try {
        for await (const event of agent.stream(task)) {
          switch (event.type) {
            case "token":
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
        process.exit(0);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      process.exit(0);
    }

    // Check if stdin supports raw mode (required for Ink TUI)
    if (!process.stdin.isTTY) {
      console.error("Error: Vibeforce requires an interactive terminal. Use -n for non-interactive mode.");
      process.exit(1);
    }

    // Render the Ink TUI with slash command context
    const instance = render(
      React.createElement(App, {
        agent: agent!,
        skillsDir: opts.skillsDir,
        org: orgAlias,
        model: opts.model,
        sessionManager,
        initialMessages,
      })
    );

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      instance.unmount();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      instance.unmount();
      process.exit(0);
    });

    await instance.waitUntilExit();
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
