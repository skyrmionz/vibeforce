import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { saveFileVersion, trackEditedFile } from "./file-history.js";

export const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const warnings: string[] = [];

      // Apex convention enforcement for .cls files
      if (filePath.endsWith(".cls")) {
        const fileName = filePath.split("/").pop()?.replace(".cls", "") ?? "";
        if (fileName && !/^[A-Z]/.test(fileName)) {
          warnings.push(`Tip: Apex class names should use PascalCase. "${fileName}" should start with an uppercase letter.`);
        }
        if (!content.includes("with sharing") && !content.includes("without sharing") && !content.includes("inherited sharing")) {
          warnings.push("Tip: Apex class is missing a sharing declaration. Consider adding 'with sharing' for security (enforces record-level access).");
        }
        if (fileName.toLowerCase().endsWith("test") || fileName.toLowerCase().startsWith("test")) {
          if (!content.includes("@isTest") && !content.includes("@IsTest")) {
            warnings.push("Warning: Test class is missing @isTest annotation. Add @isTest to ensure it's recognized as a test class.");
          }
        }

        // Auto-create companion -meta.xml if missing
        const metaPath = filePath + "-meta.xml";
        try {
          const { access } = await import("node:fs/promises");
          await access(metaPath);
        } catch {
          const metaContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">\n    <apiVersion>62.0</apiVersion>\n    <status>Active</status>\n</ApexClass>\n`;
          await mkdir(dirname(metaPath), { recursive: true });
          await writeFile(metaPath, metaContent, "utf-8");
          warnings.push(`Created companion metadata: ${metaPath}`);
        }
      }

      // Save a version snapshot before overwriting
      await saveFileVersion(filePath);

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      trackEditedFile(filePath);
      const result = `Successfully wrote ${content.split("\n").length} lines to ${filePath}`;
      return warnings.length > 0 ? `${warnings.join("\n")}\n\n${result}` : result;
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
