import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const taskTool = tool(
  async ({ description }) => {
    return `Subagent not yet implemented. Task: "${description}" — handle this directly instead.`;
  },
  {
    name: "task",
    description:
      "Spawn a subagent to handle a subtask. (Placeholder — not yet implemented.)",
    schema: z.object({
      description: z
        .string()
        .describe("Description of the task for the subagent"),
    }),
  }
);
