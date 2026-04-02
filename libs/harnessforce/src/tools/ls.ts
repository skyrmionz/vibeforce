import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const lsTool = tool(
  async ({ path }) => {
    try {
      const dir = path ?? process.cwd();
      const entries = await readdir(dir, { withFileTypes: true });
      const lines = entries.map((entry) => {
        const type = entry.isDirectory() ? "dir" : "file";
        return `${type}\t${entry.name}`;
      });
      return lines.join("\n") || "(empty directory)";
    } catch (err: any) {
      return `Error listing directory: ${err.message}`;
    }
  },
  {
    name: "ls",
    description: "List contents of a directory with file type indicators.",
    schema: z.object({
      path: z
        .string()
        .optional()
        .describe("Directory to list (defaults to cwd)"),
    }),
  }
);
