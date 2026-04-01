#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { createVibeforceAgent } from "vibeforce-core";
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
  .action(async (opts) => {
    // Resolve API key: flag > env var
    const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;

    // Print the greeting
    console.log(renderGreeting({
      version: program.version() ?? "0.1.0",
      org: opts.org,
      cwd: process.cwd(),
    }));

    // Check for API key before creating agent
    if (!apiKey) {
      console.log(
        "\n  ⚠  No API key found. Set ANTHROPIC_API_KEY or pass --api-key:\n" +
        "\n    export ANTHROPIC_API_KEY=sk-ant-..." +
        "\n    vibeforce --api-key sk-ant-...\n" +
        "\n  You can still use / commands (type /help to see all).\n"
      );
    }

    // Create the agent (may be null if no API key)
    let agent: ReturnType<typeof createVibeforceAgent> | null = null;
    try {
      agent = createVibeforceAgent({
        model: opts.model,
        apiKey,
        skillsDir: opts.skillsDir,
        systemPrompt: opts.org
          ? `The user's default Salesforce org alias is: ${opts.org}`
          : undefined,
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
        org: opts.org,
        model: opts.model,
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
