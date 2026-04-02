import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { glob as nodeGlob } from "node:fs/promises";
import { join } from "node:path";

export const globTool = tool(
  async ({ pattern, path }) => {
    try {
      const cwd = path ?? process.cwd();
      const matches: string[] = [];
      for await (const entry of nodeGlob(pattern, { cwd })) {
        matches.push(entry);
        if (matches.length >= 500) break;
      }
      if (matches.length === 0) {
        return "No files matched the pattern.";
      }
      return matches.join("\n");
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
  {
    name: "glob",
    description:
      "Find files matching a glob pattern (e.g. '**/*.ts', 'src/**/*.cls').",
    schema: z.object({
      pattern: z.string().describe("Glob pattern to match files"),
      path: z
        .string()
        .optional()
        .describe("Directory to search in (defaults to cwd)"),
    }),
  }
);
