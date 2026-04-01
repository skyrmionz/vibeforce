/**
 * Skill loader — reads SKILL.md files from a directory and makes them
 * available for system prompt injection and runtime lookup.
 *
 * Skill files use YAML frontmatter with fields:
 *   name, description, trigger
 *
 * Example:
 * ```markdown
 * ---
 * name: deploy-lwc
 * description: Deploy a Lightning Web Component to a Salesforce org
 * trigger: when the user asks to create or deploy an LWC
 * ---
 *
 * # Deploy LWC Skill
 * ...instructions...
 * ```
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Skill {
  /** Unique name for the skill (from frontmatter). */
  name: string;
  /** Human-readable description (from frontmatter). */
  description: string;
  /** When the agent should use this skill (from frontmatter). */
  trigger: string;
  /** Full SKILL.md content including frontmatter. */
  content: string;
  /** File path the skill was loaded from. */
  filePath: string;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface Frontmatter {
  name?: string;
  description?: string;
  trigger?: string;
}

/**
 * Parse simple YAML frontmatter from markdown content.
 * Handles basic `key: value` pairs (no nested objects or arrays).
 */
function parseFrontmatter(content: string): {
  data: Frontmatter;
  body: string;
} {
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
  const match = fmRegex.exec(content);

  if (!match) {
    return { data: {}, body: content };
  }

  const fmBlock = match[1];
  const body = content.slice(match[0].length);
  const data: Record<string, string> = {};

  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  return { data: data as Frontmatter, body };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load all SKILL.md files from a directory.
 *
 * Reads all `.md` files, parses frontmatter, and returns Skill objects.
 * Files without valid frontmatter (missing name) are skipped.
 */
export function loadSkills(skillsDir: string): Skill[] {
  let files: string[];
  try {
    files = readdirSync(skillsDir);
  } catch {
    // Directory doesn't exist — no skills to load
    return [];
  }

  const skills: Skill[] = [];

  for (const file of files) {
    if (extname(file) !== ".md") continue;

    const filePath = join(skillsDir, file);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { data } = parseFrontmatter(content);

    if (!data.name) {
      // Skip files without a name in frontmatter
      continue;
    }

    skills.push({
      name: data.name,
      description: data.description ?? "",
      trigger: data.trigger ?? "",
      content,
      filePath,
    });
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Summary generation (for system prompt injection)
// ---------------------------------------------------------------------------

/**
 * Generate a compact summary of available skills for injection into
 * the agent's system prompt.
 *
 * Format:
 * ```
 * Available Skills:
 * - deploy-lwc: Deploy a Lightning Web Component [trigger: when user asks to create or deploy an LWC]
 * - create-flow: Generate a Flow XML file [trigger: when user asks to create a Flow]
 * ```
 */
export function getSkillSummaries(skills: Skill[]): string {
  if (skills.length === 0) {
    return "No custom skills loaded. You can create new skills by writing a SKILL.md file to the skills/ directory.";
  }

  const lines = ["Available Skills:"];
  for (const skill of skills) {
    let line = `- ${skill.name}`;
    if (skill.description) {
      line += `: ${skill.description}`;
    }
    if (skill.trigger) {
      line += ` [trigger: ${skill.trigger}]`;
    }
    lines.push(line);
  }

  lines.push(
    "",
    "To use a skill, reference it by name. To create a new skill, write a SKILL.md file to the skills/ directory.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Skill lookup
// ---------------------------------------------------------------------------

/**
 * Find a skill by name (case-insensitive).
 */
export function findSkill(skills: Skill[], name: string): Skill | undefined {
  const nameLower = name.toLowerCase();
  return skills.find((s) => s.name.toLowerCase() === nameLower);
}

// ---------------------------------------------------------------------------
// Skill writing
// ---------------------------------------------------------------------------

/**
 * Write a new skill file to the skills directory.
 * Creates the directory if it doesn't exist.
 */
export function writeSkill(
  skillsDir: string,
  filename: string,
  content: string,
): string {
  mkdirSync(skillsDir, { recursive: true });
  const filePath = join(
    skillsDir,
    filename.endsWith(".md") ? filename : `${filename}.md`,
  );
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}
