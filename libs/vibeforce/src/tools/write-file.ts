import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      return `Successfully wrote ${content.split("\n").length} lines to ${filePath}`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
  {
    name: "write_file",
    description:
      "Write content to a file. Creates parent directories if needed. Overwrites existing content.",
    schema: z.object({
      filePath: z.string().describe("Absolute path to the file to write"),
      content: z.string().describe("The full content to write to the file"),
    }),
  }
);
