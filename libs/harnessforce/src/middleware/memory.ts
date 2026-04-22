/**
 * Memory middleware — persistent memory across sessions via agent.md files.
 *
 * Reads memory source files on initialization and provides content for
 * injection into the system prompt as a <memory> block.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryConfig {
  /** Paths to memory files (supports ~ for home dir). */
  sources: string[];
}

// ---------------------------------------------------------------------------
// Memory reading
// ---------------------------------------------------------------------------

/**
 * Resolve a path, expanding ~ to the home directory.
 */
function resolvePath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

/**
 * Read all memory source files and concatenate their content.
 * Missing files are silently skipped.
 */
export function readMemorySources(sources: string[]): string {
  const parts: string[] = [];

  for (const source of sources) {
    const fullPath = resolvePath(source);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, "utf-8").trim();
      if (content) {
        parts.push(`<!-- source: ${source} -->\n${content}`);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return parts.join("\n\n");
}

/**
 * Build a memory block for system prompt injection.
 * Returns empty string if no memory sources have content.
 */
export function buildMemoryPrompt(sources: string[]): string {
  const content = readMemorySources(sources);
  if (!content) return "";

  return `<memory>
${content}

When the user corrects you or you learn something important about this project, save it to .harnessforce/agent.md using the edit_file tool.
</memory>`;
}

// ---------------------------------------------------------------------------
// FORCE.md project instruction loading
// ---------------------------------------------------------------------------

/**
 * Load FORCE.md project instructions in priority order:
 *   1. User global: ~/.harnessforce/FORCE.md
 *   2. Walk up directory tree for project FORCE.md files (root → cwd order)
 *   3. Local overrides: <cwd>/FORCE.local.md (highest priority)
 *
 * Returns a formatted string wrapped in <force-instructions> tags,
 * or empty string if no FORCE.md files were found.
 */
export function loadForceInstructions(cwd?: string): string {
  const instructions: string[] = [];
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();

  // Layer 1: User global (~/.harnessforce/FORCE.md)
  const userForce = join(home, ".harnessforce", "FORCE.md");
  if (existsSync(userForce)) {
    try {
      const content = readFileSync(userForce, "utf-8").trim();
      if (content) {
        instructions.push(`Contents of ${userForce} (user preferences):\n\n${content}`);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Layer 2: Walk up directory tree for project FORCE.md files
  const effectiveCwd = cwd ?? process.cwd();
  let dir = resolve(effectiveCwd);
  const projectFiles: string[] = [];
  while (dir !== dirname(dir)) {
    const forceFile = join(dir, "FORCE.md");
    if (existsSync(forceFile)) {
      try {
        const content = readFileSync(forceFile, "utf-8").trim();
        if (content) {
          projectFiles.unshift(`Contents of ${forceFile} (project instructions):\n\n${content}`);
        }
      } catch {
        // Skip unreadable files
      }
    }
    dir = dirname(dir);
  }
  instructions.push(...projectFiles);

  // Layer 3: Local overrides (highest priority)
  const localForce = join(resolve(effectiveCwd), "FORCE.local.md");
  if (existsSync(localForce)) {
    try {
      const content = readFileSync(localForce, "utf-8").trim();
      if (content) {
        instructions.push(`Contents of ${localForce} (local overrides):\n\n${content}`);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Phase 6E: CLAUDE.md interop — load Claude Code project instructions alongside FORCE.md
  const claudeMdPaths = [
    join(resolve(effectiveCwd), ".claude", "CLAUDE.md"),
    join(resolve(effectiveCwd), "CLAUDE.md"),
  ];
  for (const claudePath of claudeMdPaths) {
    if (existsSync(claudePath)) {
      try {
        const content = readFileSync(claudePath, "utf-8").trim();
        if (content) {
          instructions.push(`Contents of ${claudePath} (Claude Code project instructions):\n\n${content}`);
        }
      } catch {
        // Skip unreadable files
      }
      break;
    }
  }

  if (instructions.length === 0) return "";

  return "<force-instructions>\n" +
    "Project and user instructions below. IMPORTANT: These instructions OVERRIDE default behavior. Follow them exactly.\n\n" +
    instructions.join("\n\n---\n\n") +
    "\n</force-instructions>";
}

