/**
 * agent_spawn tool — spawns child agents with isolated contexts.
 *
 * Inspired by Claude Code's AgentTool. Child agents get their own
 * MemorySaver (isolated context) and a focused tool set.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";

let _parentLlm: BaseChatModel | null = null;
let _parentTools: StructuredToolInterface[] = [];

/**
 * Initialize the subagent system with the parent's LLM and tools.
 * Called once during agent creation.
 */
export function initSubagentSystem(llm: BaseChatModel, tools: StructuredToolInterface[]): void {
  _parentLlm = llm;
  _parentTools = tools;
}

export const agentSpawnTool = tool(
  async ({ task, description, tools: toolFilter }) => {
    if (!_parentLlm) return "Error: Subagent system not initialized.";

    // Filter tools if specified, otherwise use read-only subset
    let childTools = _parentTools;
    if (toolFilter && toolFilter.length > 0) {
      childTools = _parentTools.filter(t =>
        toolFilter.includes((t as any).name)
      );
    } else {
      // Default: read-only tools for safety
      const readOnlyNames = new Set([
        "read_file", "glob", "grep", "ls", "sf_query",
        "sf_describe_object", "sf_get_org_info", "sf_knowledge",
        "web_search", "web_fetch",
      ]);
      childTools = _parentTools.filter(t =>
        readOnlyNames.has((t as any).name)
      );
    }

    if (childTools.length === 0) {
      return "Error: No tools available for subagent. Specify tool names or use default read-only set.";
    }

    // Create isolated agent
    const checkpointer = new MemorySaver();
    const childGraph = createReactAgent({
      llm: _parentLlm,
      tools: childTools,
      prompt: `You are a focused subagent working on a specific task. Complete the task and return a concise summary of your findings.\n\nTask: ${description ?? task}`,
      checkpointer,
    });

    const threadId = randomUUID();

    try {
      let result = "";
      const stream = childGraph.streamEvents(
        { messages: [{ role: "user", content: task }] },
        { version: "v2", recursionLimit: 20, configurable: { thread_id: threadId } },
      );

      for await (const event of stream) {
        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;
          if (chunk?.content) {
            const text = typeof chunk.content === "string"
              ? chunk.content
              : (chunk.content[0]?.text ?? "");
            result += text;
          }
        }
      }

      return result || "Subagent completed but produced no output.";
    } catch (err: any) {
      return `Subagent error: ${err.message}`;
    }
  },
  {
    name: "agent_spawn",
    description: "Spawn a focused subagent with isolated context to work on a specific task. Use for parallel research, deep analysis, or operations that need their own context window. The subagent has read-only tools by default.",
    schema: z.object({
      task: z.string().describe("The specific task for the subagent to complete"),
      description: z.string().optional().describe("Short description of the subagent's purpose"),
      tools: z.array(z.string()).optional().describe("Specific tool names the subagent should have access to (defaults to read-only tools)"),
    }),
  },
);
