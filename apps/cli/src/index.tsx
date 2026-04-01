#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { createVibeForceAgent } from "@vibeforce/core";
import { modelCommands } from "./commands/model.js";
import App from "./ui/app.js";
import { renderGreeting } from "./ui/greeting.js";

const program = new Command();

program
  .name("vibeforce")
  .description("VibeForce — The Salesforce Vibe Coding Agent")
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
    // Print the greeting
    console.log(renderGreeting());

    // Create the agent
    const agent = createVibeForceAgent({
      model: opts.model,
      apiKey: opts.apiKey,
      skillsDir: opts.skillsDir,
      systemPrompt: opts.org
        ? `The user's default Salesforce org alias is: ${opts.org}`
        : undefined,
    });

    // Render the Ink TUI
    const instance = render(React.createElement(App, { agent }));

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

program.parse();
