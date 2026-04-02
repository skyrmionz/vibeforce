/**
 * Session memory extraction — automatically extracts key learnings from
 * a conversation and persists them to .harnessforce/agent.md.
 *
 * Inspired by Claude Code's extractMemories service.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MEMORY_FILE = ".harnessforce/agent.md";

export interface ConversationMessage {
  role: string;
  content: string;
}

/**
 * Build a prompt to extract learnings from a conversation.
 */
function buildExtractionPrompt(messages: ConversationMessage[]): string {
  const transcript = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => {
      const role = m.role === "user" ? "User" : "Agent";
      const content = m.content.length > 500 ? m.content.slice(0, 497) + "..." : m.content;
      return `[${role}]: ${content}`;
    })
    .join("\n");

  return `Extract key learnings from this conversation that would help in future sessions. Focus on:
- Org-specific quirks or configurations discovered
- User preferences for code style or approach
- Errors encountered and their solutions
- Important decisions made

Format as bullet points. Be concise (max 10 bullets). Skip anything obvious or already common knowledge.
If there are no meaningful learnings, respond with "NONE".

Conversation:
${transcript}`;
}

/**
 * Extract memories from conversation and append to agent.md.
 *
 * @param messages - The conversation messages
 * @param llmCall - Optional LLM function. If not provided, uses heuristic extraction.
 */
export async function extractAndSaveMemories(
  messages: ConversationMessage[],
  llmCall?: (prompt: string) => Promise<string>,
): Promise<string | null> {
  // Need at least 4 messages (2 user + 2 assistant) for meaningful extraction
  if (messages.filter(m => m.role === "user" || m.role === "assistant").length < 4) {
    return null;
  }

  let learnings: string;

  if (llmCall) {
    try {
      const prompt = buildExtractionPrompt(messages);
      learnings = await llmCall(prompt);
      if (learnings.trim() === "NONE" || learnings.trim().length < 10) return null;
    } catch {
      // Fall back to heuristic
      learnings = heuristicExtract(messages);
      if (!learnings) return null;
    }
  } else {
    learnings = heuristicExtract(messages);
    if (!learnings) return null;
  }

  // Append to memory file
  try {
    const dir = dirname(MEMORY_FILE);
    mkdirSync(dir, { recursive: true });

    const timestamp = new Date().toISOString().split("T")[0];
    const header = `\n\n## Session ${timestamp}\n\n`;
    const entry = header + learnings.trim() + "\n";

    // Read existing to avoid duplicates
    const existing = existsSync(MEMORY_FILE) ? readFileSync(MEMORY_FILE, "utf-8") : "";
    if (existing.includes(learnings.trim().slice(0, 100))) return null; // Likely duplicate

    appendFileSync(MEMORY_FILE, entry, "utf-8");
    return entry.trim();
  } catch {
    return null;
  }
}

/**
 * Heuristic extraction — no LLM needed.
 * Looks for error patterns, config changes, and user corrections.
 */
function heuristicExtract(messages: ConversationMessage[]): string {
  const learnings: string[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const c = msg.content;

    // Detect error resolution patterns
    if (c.includes("Error:") && c.includes("fix")) {
      const errorLine = c.split("\n").find(l => l.includes("Error:"));
      if (errorLine) learnings.push(`- Resolved: ${errorLine.slice(0, 150)}`);
    }

    // Detect deployment outcomes
    if (c.includes("deployed successfully") || c.includes("Deploy succeeded")) {
      learnings.push("- Successful deployment completed");
    }

    // Detect org-specific info
    if (c.includes("org") && (c.includes("API version") || c.includes("namespace"))) {
      const orgLine = c.split("\n").find(l => l.includes("API version") || l.includes("namespace"));
      if (orgLine) learnings.push(`- Org info: ${orgLine.trim().slice(0, 150)}`);
    }
  }

  // Deduplicate
  const unique = [...new Set(learnings)];
  return unique.length > 0 ? unique.slice(0, 10).join("\n") : "";
}
