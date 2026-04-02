/**
 * Context summarization middleware — automatically compresses older messages
 * when conversation context grows too large.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummarizationConfig {
  /** Token count threshold to trigger summarization (default: 80000). */
  maxTokens?: number;
  /** Always keep the last N messages unsummarized (default: 10). */
  keepRecentMessages?: number;
  /** Directory to save full history before summarization. */
  offloadPath?: string;
}

export interface Message {
  role: string;
  content: string;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate token count using the 4-chars-per-token heuristic.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total token count for a list of messages.
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce(
    (total, msg) => total + estimateTokens(msg.content) + 4, // +4 for role/formatting overhead
    0,
  );
}

// ---------------------------------------------------------------------------
// Summarization logic
// ---------------------------------------------------------------------------

/**
 * Generate a summary prompt from older messages.
 * Returns a single "context summary" message that replaces the originals.
 */
export function summarizeMessages(messages: Message[]): Message {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    // Truncate very long messages in the summary
    const content =
      msg.content.length > 500
        ? msg.content.slice(0, 497) + "..."
        : msg.content;
    lines.push(`[${role}]: ${content}`);
  }

  const summary = `<context_summary>
The following is a summary of the earlier conversation that has been compressed to save context space.

Key points from the conversation:
${lines.join("\n")}

End of conversation summary. The recent messages follow below.
</context_summary>`;

  return {
    role: "system",
    content: summary,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Save full message history to disk before summarization.
 */
function offloadHistory(
  messages: Message[],
  offloadPath: string,
): string {
  const dir = offloadPath;
  mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(dir, `${timestamp}.md`);

  const lines = messages.map((msg) => {
    const role = msg.role === "user" ? "User" : "Assistant";
    const ts = msg.timestamp ? ` (${msg.timestamp})` : "";
    return `## ${role}${ts}\n\n${msg.content}\n`;
  });

  writeFileSync(filePath, `# Conversation History\n\n${lines.join("\n---\n\n")}`, "utf-8");
  return filePath;
}

/**
 * Compact a messages array by summarizing older messages when the token
 * threshold is exceeded.
 *
 * Returns a new array with older messages replaced by a single summary message,
 * or the original array unchanged if under the threshold.
 */
export function compactMessages(
  messages: Message[],
  config: SummarizationConfig = {},
): Message[] {
  const maxTokens = config.maxTokens ?? 80_000;
  const keepRecent = config.keepRecentMessages ?? 10;

  const totalTokens = estimateMessagesTokens(messages);
  if (totalTokens <= maxTokens || messages.length <= keepRecent) {
    return messages;
  }

  // Split into older (to summarize) and recent (to keep)
  const splitIdx = messages.length - keepRecent;
  const olderMessages = messages.slice(0, splitIdx);
  const recentMessages = messages.slice(splitIdx);

  // Offload full history if configured
  if (config.offloadPath) {
    offloadHistory(messages, config.offloadPath);
  }

  // Create summary of older messages
  const summaryMessage = summarizeMessages(olderMessages);

  return [summaryMessage, ...recentMessages];
}

