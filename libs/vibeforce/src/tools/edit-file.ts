import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";

export const editFileTool = tool(
  async ({ filePath, oldString, newString, replaceAll }) => {
    try {
      const content = await readFile(filePath, "utf-8");

      if (!content.includes(oldString)) {
        return `Error: old_string not found in ${filePath}. Make sure it matches exactly including whitespace.`;
      }

      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1 && !replaceAll) {
        return `Error: old_string found ${occurrences} times in ${filePath}. Use replaceAll=true to replace all, or provide a more specific string.`;
      }

      let updated: string;
      if (replaceAll) {
        updated = content.split(oldString).join(newString);
      } else {
        const idx = content.indexOf(oldString);
        updated =
          content.slice(0, idx) +
          newString +
          content.slice(idx + oldString.length);
      }

      await writeFile(filePath, updated, "utf-8");
      const replacements = replaceAll ? occurrences : 1;
      return `Successfully replaced ${replacements} occurrence(s) in ${filePath}`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string match. The old_string must match exactly.",
    schema: z.object({
      filePath: z.string().describe("Absolute path to the file to edit"),
      oldString: z.string().describe("The exact text to find and replace"),
      newString: z.string().describe("The replacement text"),
      replaceAll: z
        .boolean()
        .optional()
        .default(false)
        .describe("Replace all occurrences (default: false)"),
    }),
  }
);
