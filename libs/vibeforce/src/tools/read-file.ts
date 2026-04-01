import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFile } from "node:fs/promises";

export const readFileTool = tool(
  async ({ filePath, offset, limit }) => {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const start = offset ?? 0;
      const end = limit ? start + limit : lines.length;
      const slice = lines.slice(start, end);
      const numbered = slice.map((line, i) => `${start + i + 1}\t${line}`);
      return numbered.join("\n");
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file. Returns numbered lines. Use offset/limit for large files.",
    schema: z.object({
      filePath: z.string().describe("Absolute path to the file to read"),
      offset: z
        .number()
        .optional()
        .describe("Line number to start reading from (0-indexed)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of lines to read"),
    }),
  }
);
