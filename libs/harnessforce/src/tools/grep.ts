import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { spawn } from "node:child_process";

export const grepTool = tool(
  async ({ pattern, path, glob, caseInsensitive }) => {
    return new Promise<string>((resolve) => {
      const args = ["--color=never", "-n"];
      if (caseInsensitive) args.push("-i");
      if (glob) args.push("--glob", glob);
      args.push(pattern, path ?? ".");

      const proc = spawn("rg", args, {
        cwd: process.cwd(),
        timeout: 30_000,
      });

      let output = "";
      proc.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        output += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 1) {
          resolve("No matches found.");
        } else if (output) {
          // Truncate if too long
          const lines = output.split("\n");
          if (lines.length > 200) {
            resolve(
              lines.slice(0, 200).join("\n") +
                `\n... (${lines.length - 200} more lines truncated)`
            );
          } else {
            resolve(output);
          }
        } else {
          resolve("No matches found.");
        }
      });

      proc.on("error", (err) => {
        // Fallback to grep if rg not available
        resolve(`Error: ${err.message}. Make sure ripgrep (rg) is installed.`);
      });
    });
  },
  {
    name: "grep",
    description:
      "Search file contents using ripgrep. Supports regex patterns and file type filtering.",
    schema: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      path: z
        .string()
        .optional()
        .describe("File or directory to search in (defaults to cwd)"),
      glob: z
        .string()
        .optional()
        .describe("Glob pattern to filter files (e.g. '*.ts')"),
      caseInsensitive: z
        .boolean()
        .optional()
        .default(false)
        .describe("Case insensitive search"),
    }),
  }
);
