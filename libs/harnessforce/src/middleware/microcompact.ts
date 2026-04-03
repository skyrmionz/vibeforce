/**
 * Microcompact — cache-preserving tool result clearing.
 *
 * Instead of rewriting the entire message history (which breaks prompt cache),
 * replaces old tool result contents in-place with a placeholder.
 * This preserves message structure and cache prefix.
 *
 * Inspired by Claude Code's microCompact.ts.
 */

/**
 * Tools whose results can be safely cleared after a few turns.
 * These produce large but transient outputs (file contents, query results).
 */
const CLEARABLE_TOOLS = new Set([
  "read_file", "write_file", "edit_file", "execute",
  "glob", "grep", "ls", "sf_query", "sf_describe_object",
  "sf_run_apex", "sf_data", "sf_data_export",
  "browser_screenshot", "browser_get_text", "browser_execute",
  "web_search", "web_fetch", "sf_knowledge",
  "dc_query", "dc_list_objects", "dc_describe",
]);

const CLEARED_PLACEHOLDER = "[Old tool result cleared to save context]";

export interface MicrocompactOptions {
  /** Number of recent turns to preserve (default: 3). */
  keepRecentTurns?: number;
  /** Minimum content length to bother clearing (default: 200). */
  minContentLength?: number;
}

/**
 * Clear old tool results in a message array in-place.
 * Returns the number of results cleared and estimated tokens saved.
 *
 * Messages are modified in-place to preserve array identity (important for
 * MemorySaver cache key stability).
 */
export function microcompactMessages(
  messages: any[],
  options: MicrocompactOptions = {},
): { cleared: number; estimatedTokensSaved: number } {
  const keepRecent = options.keepRecentTurns ?? 3;
  const minLength = options.minContentLength ?? 200;

  // Count user messages to determine "turns"
  let userMsgCount = 0;
  const userMsgIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const role = messages[i]._getType?.() ?? messages[i].role;
    if (role === "human" || role === "user") {
      userMsgCount++;
      userMsgIndices.push(i);
    }
  }

  // Only clear results from turns older than keepRecent
  const cutoffIndex = userMsgIndices[Math.max(0, userMsgCount - keepRecent)] ?? messages.length;

  let cleared = 0;
  let tokensSaved = 0;

  for (let i = 0; i < cutoffIndex; i++) {
    const msg = messages[i];
    const role = msg._getType?.() ?? msg.role;

    // Look for tool results (ToolMessage in LangChain)
    if (role === "tool") {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const toolName = msg.name ?? "";

      if (
        content.length > minLength &&
        content !== CLEARED_PLACEHOLDER &&
        CLEARABLE_TOOLS.has(toolName)
      ) {
        const saved = Math.ceil(content.length / 4); // ~tokens
        // Replace content in-place
        if (typeof msg.content === "string") {
          msg.content = CLEARED_PLACEHOLDER;
        } else {
          msg.content = CLEARED_PLACEHOLDER;
        }
        cleared++;
        tokensSaved += saved;
      }
    }

    // Also clear large AI message content blocks that contain tool results
    if (role === "ai" || role === "assistant") {
      if (Array.isArray(msg.content)) {
        for (let j = 0; j < msg.content.length; j++) {
          const block = msg.content[j];
          if (block.type === "tool_use" && block.input) {
            const inputStr = JSON.stringify(block.input);
            if (inputStr.length > 2000) {
              block.input = { _cleared: true, original_length: inputStr.length };
              tokensSaved += Math.ceil(inputStr.length / 4);
            }
          }
        }
      }
    }
  }

  return { cleared, estimatedTokensSaved: tokensSaved };
}
