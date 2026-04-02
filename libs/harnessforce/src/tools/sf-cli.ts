/**
 * Shared helper for executing Salesforce CLI commands.
 * Wraps child_process.execFile with JSON parsing, timeouts, and error handling.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SfCommandResult {
  success: boolean;
  data: unknown;
  raw: string;
}

export interface SfCommandOptions {
  /** Target org alias or username. Appended as `-o <alias>`. */
  alias?: string;
  /** Timeout in milliseconds (default: 60000). */
  timeout?: number;
  /** Skip appending --json flag (rare). */
  skipJson?: boolean;
}

/**
 * Execute a Salesforce CLI command and return parsed JSON output.
 *
 * @param command - The sf subcommand (e.g. "org", "data")
 * @param args - Additional arguments
 * @param options - Execution options
 */
export async function runSfCommand(
  command: string,
  args: string[],
  options: SfCommandOptions = {},
): Promise<SfCommandResult> {
  const { alias, timeout = 60_000, skipJson = false } = options;

  const fullArgs = [command, ...args];
  if (!skipJson) fullArgs.push("--json");
  if (alias) fullArgs.push("-o", alias);

  let stdout: string;

  try {
    const result = await execFileAsync("sf", fullArgs, { timeout });
    stdout = result.stdout || result.stderr;
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    // SF CLI often exits non-zero but still writes valid JSON to stdout
    if (execErr.stdout) {
      stdout = execErr.stdout;
    } else {
      const message =
        execErr.stderr || execErr.message || "sf command failed";
      return { success: false, data: { error: message }, raw: message };
    }
  }

  // Attempt to parse JSON
  try {
    const parsed = JSON.parse(stdout);
    const success =
      parsed.status === 0 ||
      parsed.result !== undefined ||
      !parsed.message;
    return { success, data: parsed.result ?? parsed, raw: stdout };
  } catch {
    // Not valid JSON — return raw output
    return { success: true, data: { output: stdout }, raw: stdout };
  }
}
