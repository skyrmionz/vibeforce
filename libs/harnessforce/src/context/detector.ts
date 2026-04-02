/**
 * Local context detection — auto-detect project context on startup.
 *
 * Detects SFDX project configuration, git state, and default org
 * to inject relevant context into the agent's system prompt.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectContext {
  /** Whether an sfdx-project.json was found. */
  isSfdxProject: boolean;
  /** Project name from sfdx-project.json. */
  projectName?: string;
  /** Default org alias from sf config. */
  defaultOrg?: string;
  /** Current git branch. */
  gitBranch?: string;
  /** Git status: "clean" or "dirty". */
  gitStatus?: string;
  /** Package directories from sfdx-project.json. */
  packageDirectories?: string[];
  /** Source API version from sfdx-project.json. */
  apiVersion?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function execSafe(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 3_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * Detect project context from the current working directory.
 *
 * Checks for sfdx-project.json, git state, and sf CLI configuration.
 */
export async function detectProjectContext(
  cwd?: string,
): Promise<ProjectContext> {
  const dir = cwd ?? process.cwd();
  const context: ProjectContext = {
    isSfdxProject: false,
  };

  // Check for sfdx-project.json
  const projectJsonPath = join(dir, "sfdx-project.json");
  if (existsSync(projectJsonPath)) {
    context.isSfdxProject = true;

    try {
      const projectJson = JSON.parse(
        readFileSync(projectJsonPath, "utf-8"),
      ) as Record<string, unknown>;

      if (typeof projectJson.name === "string") {
        context.projectName = projectJson.name;
      }

      if (typeof projectJson.sourceApiVersion === "string") {
        context.apiVersion = projectJson.sourceApiVersion;
      }

      if (Array.isArray(projectJson.packageDirectories)) {
        context.packageDirectories = (
          projectJson.packageDirectories as Array<{ path?: string }>
        )
          .map((d) => d.path)
          .filter((p): p is string => typeof p === "string");
      }
    } catch {
      // JSON parse error — still mark as SFDX project
    }
  }

  // Git branch
  const branch = execSafe("git branch --show-current", dir);
  if (branch) {
    context.gitBranch = branch;
  }

  // Git status
  const status = execSafe("git status --porcelain", dir);
  if (status !== null) {
    context.gitStatus = status.length === 0 ? "clean" : "dirty";
  }

  // Default org from sf CLI
  const orgJson = execSafe("sf config get target-org --json", dir);
  if (orgJson) {
    try {
      const parsed = JSON.parse(orgJson) as {
        result?: Array<{ value?: string }>;
      };
      const value = parsed.result?.[0]?.value;
      if (value) {
        context.defaultOrg = value;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return context;
}

/**
 * Build a context block for system prompt injection.
 * Returns empty string if no useful context was detected.
 */
export function buildContextPrompt(context: ProjectContext): string {
  const lines: string[] = [];

  if (context.isSfdxProject) {
    lines.push("This is a Salesforce DX project.");
    if (context.projectName) lines.push(`Project: ${context.projectName}`);
    if (context.apiVersion) lines.push(`API Version: ${context.apiVersion}`);
    if (context.packageDirectories?.length) {
      lines.push(
        `Package Directories: ${context.packageDirectories.join(", ")}`,
      );
    }
  }

  if (context.defaultOrg) {
    lines.push(`Default Org: ${context.defaultOrg}`);
  }

  if (context.gitBranch) {
    lines.push(`Git Branch: ${context.gitBranch}`);
    if (context.gitStatus) {
      lines.push(`Git Status: ${context.gitStatus}`);
    }
  }

  if (lines.length === 0) return "";

  return `<project_context>\n${lines.join("\n")}\n</project_context>`;
}
