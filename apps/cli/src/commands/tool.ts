/**
 * CLI commands for tool management (Commander subcommands).
 *
 * Subcommands:
 *   tool:list — list all tools with descriptions
 */

import { Command } from "commander";
import { allTools } from "harnessforce-core";

// ---------------------------------------------------------------------------
// tool:list
// ---------------------------------------------------------------------------
const toolList = new Command("tool-list")
  .description("List all available tools with descriptions")
  .action(() => {
    const tools = allTools;

    if (tools.length === 0) {
      console.log("No tools loaded.");
      return;
    }

    const maxName = Math.max(...tools.map((t) => t.name.length));
    console.log(`\nAvailable tools (${tools.length}):\n`);

    for (const t of tools) {
      const desc =
        "description" in t && typeof t.description === "string"
          ? t.description
          : "";
      const short = desc.length > 70 ? desc.slice(0, 67) + "..." : desc;
      console.log(`  ${t.name.padEnd(maxName + 2)}${short}`);
    }
    console.log("");
  });

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const toolCommands = [toolList];
