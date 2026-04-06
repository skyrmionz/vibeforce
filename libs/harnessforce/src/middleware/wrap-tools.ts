/**
 * Tool wrapping — injects the approval gate into each tool's _call method
 * so destructive tools block until the user approves.
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ApprovalGate } from "./approval-gate.js";

/**
 * Wrap all tools with the approval gate. The gate auto-approves
 * non-destructive tools with zero overhead, so it's safe to wrap everything.
 */
export function wrapAllTools(
  tools: StructuredToolInterface[],
  gate: ApprovalGate,
): StructuredToolInterface[] {
  return tools.map((tool) => wrapToolWithApproval(tool, gate));
}

/**
 * Wrap a single tool with the approval gate.
 * Overrides _call on the instance (not the prototype).
 */
function wrapToolWithApproval(
  tool: StructuredToolInterface,
  gate: ApprovalGate,
): StructuredToolInterface {
  const t = tool as any;

  // Only wrap tools that have a _call method (StructuredTool instances)
  if (typeof t._call !== "function") {
    return tool;
  }

  const originalCall = t._call.bind(t);
  const toolName: string = t.name;

  t._call = async function (args: any, runManager?: any): Promise<string> {
    const approved = await gate.requestApproval(toolName, args);
    if (!approved) {
      return `Tool execution rejected by user: ${toolName}. The user declined to run this tool. Ask the user how they'd like to proceed or suggest an alternative approach.`;
    }
    return originalCall(args, runManager);
  };

  return tool;
}
