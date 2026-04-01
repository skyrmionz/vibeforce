/**
 * Memory middleware — persistent memory across sessions via agent.md files.
 *
 * Reads memory source files on initialization and provides content for
 * injection into the system prompt as a <memory> block.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { Middleware, ToolCall, ToolExecutor, ToolResult } from "./types.js";

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

When the user corrects you or you learn something important about this project, save it to .vibeforce/agent.md using the edit_file tool.
</memory>`;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create a memory middleware.
 *
 * Like the summarization middleware, memory injection happens at the prompt
 * level rather than at the tool-call level. This middleware is a pass-through
 * for tool calls, but exposes `buildMemoryPrompt` for the agent to use.
 */
export function createMemoryMiddleware(config?: MemoryConfig): Middleware {
  const _config = config ?? {
    sources: [".vibeforce/agent.md", "~/.vibeforce/agent.md"],
  };

  const middleware: Middleware = async (
    call: ToolCall,
    next: ToolExecutor,
  ): Promise<ToolResult> => {
    return next(call);
  };

  return middleware;
}
