import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { spawn } from "node:child_process";
import { checkBashSafety } from "./bash-safety.js";

export const executeTool = tool(
  async ({ command, cwd, timeout }) => {
    // Safety check before executing
    const safety = checkBashSafety(command);
    if (!safety.safe && safety.severity === "block") {
      return `BLOCKED: ${safety.reason}\nCommand was not executed.`;
    }

    const warningPrefix =
      safety.severity === "warning" ? `WARNING: ${safety.reason}\n\n` : "";

    const timeoutMs = timeout ?? 120_000;
    return new Promise<string>((resolve) => {
      const proc = spawn("bash", ["-c", command], {
        cwd: cwd ?? process.cwd(),
        env: process.env,
        timeout: timeoutMs,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");
        if (code !== 0) {
          resolve(`${warningPrefix}Exit code ${code}\n${output}`);
        } else {
          resolve(`${warningPrefix}${output || "(no output)"}`);
        }
      });

      proc.on("error", (err) => {
        resolve(`${warningPrefix}Error executing command: ${err.message}`);
      });
    });
  },
  {
    name: "execute",
    description:
      "Execute a shell command and return its output. Use for running builds, tests, git, sf cli, etc.",
    schema: z.object({
      command: z.string().describe("The shell command to execute"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (defaults to current)"),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in milliseconds (default: 120000)"),
    }),
  }
);
