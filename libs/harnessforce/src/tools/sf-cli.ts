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

// ── Typed result interfaces ─────────────────────────────────────────────────

export interface SfQueryResult {
  records: Record<string, unknown>[];
  totalSize: number;
  done: boolean;
}

export interface SfOrgInfo {
  orgId: string;
  username: string;
  instanceUrl: string;
  alias?: string;
  connectedStatus?: string;
  isSandbox?: boolean;
  isScratch?: boolean;
  isDevHub?: boolean;
  isDefaultUsername?: boolean;
}

export interface SfDeployResult {
  id: string;
  status: string;
  success: boolean;
  files?: Array<{
    fullName: string;
    type: string;
    state: string;
    filePath?: string;
  }>;
}

export interface SfOrgLimits {
  name: string;
  max: number;
  remaining: number;
}

/**
 * Type-safe accessor for SfCommandResult.data.
 *
 * @example
 * const result = await runSfCommand("data", ["query", ...]);
 * const query = getSfData<SfQueryResult>(result);
 */
export function getSfData<T>(result: SfCommandResult): T {
  return result.data as T;
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

    // Check for SF-specific errors
    if (parsed.status !== 0 || parsed.name === "ERROR") {
      const msg = parsed.message ?? parsed.result?.message ?? "";
      let userMessage = msg;

      if (msg.includes("INVALID_SESSION") || msg.includes("Session expired")) {
        userMessage = `Session expired. Run: sf org login web -o ${options.alias ?? "default"}\n\nOriginal: ${msg}`;
      } else if (msg.includes("REQUEST_LIMIT_EXCEEDED")) {
        userMessage = `Salesforce API limit reached. Wait a few minutes before retrying.\n\nOriginal: ${msg}`;
      } else if (msg.includes("INSUFFICIENT_ACCESS") || msg.includes("INVALID_CROSS_REFERENCE_KEY")) {
        userMessage = `Insufficient permissions. Check object/field-level security and sharing rules.\n\nOriginal: ${msg}`;
      } else if (msg.includes("MALFORMED_QUERY")) {
        userMessage = `Invalid SOQL query. Check field names and syntax.\n\nOriginal: ${msg}`;
      }

      return { success: false, data: { error: userMessage, code: parsed.name }, raw: stdout };
    }

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
