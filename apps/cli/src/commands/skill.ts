/**
 * CLI commands for skill management (Commander subcommands).
 *
 * Subcommands:
 *   skill:list  — list all loaded skills
 *   skill:add   — create a new skill file from template
 */

import { Command } from "commander";
import { loadSkills, writeSkill } from "harnessforce-core";

// ---------------------------------------------------------------------------
// skill:list
// ---------------------------------------------------------------------------
const skillList = new Command("skill-list")
  .description("List all loaded skills with name and description")
  .option("-d, --dir <path>", "Skills directory", "./skills")
  .action((opts: { dir: string }) => {
    const skills = loadSkills(opts.dir);

    if (skills.length === 0) {
      console.log(
        "No skills loaded. Create a .md file in the skills/ directory to add one."
      );
      return;
    }

    const maxName = Math.max(...skills.map((s) => s.name.length));
    console.log("\nLoaded skills:\n");
    for (const s of skills) {
      console.log(`  ${s.name.padEnd(maxName + 2)}${s.description}`);
    }
    console.log("");
  });

// ---------------------------------------------------------------------------
// skill:add
// ---------------------------------------------------------------------------
const skillAdd = new Command("skill-add")
  .argument("<name>", "Skill name (e.g. deploy-lwc)")
  .description("Create a new skill file from template")
  .option("-d, --dir <path>", "Skills directory", "./skills")
  .action((name: string, opts: { dir: string }) => {
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

    const filePath = writeSkill(opts.dir, `${name}.md`, template);
    console.log(`Created skill template at ${filePath}`);
    console.log("Edit the file to customize the skill.");
  });

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const skillCommands = [skillList, skillAdd];
