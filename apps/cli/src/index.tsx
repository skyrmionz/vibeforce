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
  .action(async (opts) => {
    // Resolve API key: flag > OPENROUTER_API_KEY > ANTHROPIC_API_KEY
    const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;

    // Detect project context
    const ctx = await detectProjectContext(process.cwd());
    const orgAlias = opts.org || ctx.defaultOrg;

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
        "\n    export OPENROUTER_API_KEY=sk-or-..." +
        "\n    vibeforce --api-key sk-or-...\n" +
        "\n  Slash commands still work — type /help to see all.\n"
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
