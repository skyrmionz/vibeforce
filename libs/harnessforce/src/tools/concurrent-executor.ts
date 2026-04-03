/**
 * Concurrent tool executor — runs read-safe tools in parallel,
 * exclusive tools sequentially.
 *
 * Inspired by Claude Code's StreamingToolExecutor.
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import { riskOf } from "../middleware/permissions.js";

/**
 * Classify whether a tool can be run concurrently with other tools.
 * Read-only tools are concurrent-safe. Write/destructive tools are exclusive.
 */
export function isConcurrentSafe(toolName: string): boolean {
  const risk = riskOf(toolName);
  return risk === "read";
}

/**
 * Execute a batch of tool calls with concurrency control.
 *
 * - Concurrent-safe tools (reads, greps, globs) run in parallel
 * - Exclusive tools (writes, deploys, deletes) run sequentially
 * - If any concurrent tool errors, abort siblings via shared controller
 *
 * @param toolCalls Array of { name, args } to execute
 * @param toolMap Map of tool name → tool instance
 * @param abortSignal Optional parent abort signal
 * @returns Array of results in same order as input
 */
export async function executeConcurrently(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  toolMap: Map<string, StructuredToolInterface>,
  abortSignal?: AbortSignal,
): Promise<Array<{ name: string; result: string; error?: string }>> {
  const results: Array<{ name: string; result: string; error?: string }> = new Array(toolCalls.length);

  // Partition into concurrent and exclusive
  const concurrent: Array<{ index: number; call: typeof toolCalls[0] }> = [];
  const exclusive: Array<{ index: number; call: typeof toolCalls[0] }> = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const call = toolCalls[i]!;
    if (isConcurrentSafe(call.name)) {
      concurrent.push({ index: i, call });
    } else {
      exclusive.push({ index: i, call });
    }
  }

  // Run concurrent tools in parallel with sibling abort
  if (concurrent.length > 0) {
    const siblingController = new AbortController();
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => siblingController.abort(), { once: true });
    }

    const concurrentPromises = concurrent.map(async ({ index, call }) => {
      const tool = toolMap.get(call.name);
      if (!tool) {
        results[index] = { name: call.name, result: "", error: `Tool not found: ${call.name}` };
        return;
      }
      try {
        if (siblingController.signal.aborted) {
          results[index] = { name: call.name, result: "", error: "Aborted by sibling" };
          return;
        }
        const output = await tool.invoke(call.args);
        results[index] = { name: call.name, result: typeof output === "string" ? output : JSON.stringify(output) };
      } catch (err: any) {
        // Sibling abort: kill other concurrent tools
        siblingController.abort();
        results[index] = { name: call.name, result: "", error: err.message };
      }
    });

    await Promise.all(concurrentPromises);
  }

  // Run exclusive tools sequentially
  for (const { index, call } of exclusive) {
    if (abortSignal?.aborted) {
      results[index] = { name: call.name, result: "", error: "Aborted" };
      continue;
    }
    const tool = toolMap.get(call.name);
    if (!tool) {
      results[index] = { name: call.name, result: "", error: `Tool not found: ${call.name}` };
      continue;
    }
    try {
      const output = await tool.invoke(call.args);
      results[index] = { name: call.name, result: typeof output === "string" ? output : JSON.stringify(output) };
    } catch (err: any) {
      results[index] = { name: call.name, result: "", error: err.message };
    }
  }

  return results;
}
