/**
 * Permission middleware — intercepts tool calls and enforces permission rules
 * based on the active PermissionMode and the tool's risk classification.
 *
 * Production org detection auto-escalates risk levels.
 */

import type {
  ConfirmFn,
  Middleware,
  OrgInfo,
  PermissionMode,
  RiskLevel,
  ToolCall,
  ToolExecutor,
  ToolResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Tool → risk classification
// ---------------------------------------------------------------------------

export const TOOL_RISK_MAP: Record<string, RiskLevel> = {
  // read
  sf_query: 'read',
  sf_describe_object: 'read',
  sf_list_orgs: 'read',
  sf_get_org_info: 'read',
  sf_org_limits: 'read',
  sf_run_tests: 'read',
  sf_list_metadata_types: 'read',
  read_file: 'read',
  glob: 'read',
  grep: 'read',
  ls: 'read',
  sf_docs_search: 'read',
  sf_docs_read: 'read',

  // write
  write_file: 'write',
  edit_file: 'write',
  execute: 'write',

  // destructive
  sf_deploy: 'destructive',
  sf_data: 'destructive',
  sf_run_apex: 'destructive',
  agent_publish: 'destructive',
  agent_activate: 'destructive',
  browser_click: 'destructive',
  browser_fill: 'destructive',
};

/**
 * Resolve the risk level for a tool. Unknown tools default to 'write' to be
 * safe.
 */
export function riskOf(toolName: string): RiskLevel {
  return TOOL_RISK_MAP[toolName] ?? 'write';
}

// ---------------------------------------------------------------------------
// Permission table
// ---------------------------------------------------------------------------

type Action = 'auto' | 'confirm' | 'blocked' | 'hidden';

const PERMISSION_TABLE: Record<PermissionMode, Record<RiskLevel, Action>> = {
  default: { read: 'auto', write: 'auto', destructive: 'confirm' },
  plan: { read: 'auto', write: 'blocked', destructive: 'blocked' },
  yolo: { read: 'auto', write: 'auto', destructive: 'auto' },
  safe: { read: 'auto', write: 'hidden', destructive: 'hidden' },
};

// ---------------------------------------------------------------------------
// Production org detection
// ---------------------------------------------------------------------------

let cachedOrgInfo: OrgInfo | null = null;

/**
 * Detect whether the default Salesforce org is a production org.
 * Result is cached for the lifetime of the process.
 */
export async function detectProductionOrg(
  execCommand: (cmd: string) => Promise<string> = defaultExecCommand,
): Promise<OrgInfo | null> {
  if (cachedOrgInfo !== null) return cachedOrgInfo;

  try {
    const raw = await execCommand('sf org display --json');
    const parsed: { result?: { isSandbox?: boolean; isScratch?: boolean; id?: string; instanceUrl?: string } } =
      JSON.parse(raw);
    const r = parsed.result;
    if (!r) return null;

    cachedOrgInfo = {
      isSandbox: r.isSandbox ?? true,
      isScratch: r.isScratch ?? true,
      orgId: r.id ?? '',
      instanceUrl: r.instanceUrl ?? '',
    };
    return cachedOrgInfo;
  } catch {
    // sf CLI not installed or no default org — assume non-production
    return null;
  }
}

/** Reset the cached org info (for testing). */
export function resetOrgInfoCache(): void {
  cachedOrgInfo = null;
}

async function defaultExecCommand(cmd: string): Promise<string> {
  const { execSync } = await import('node:child_process');
  return execSync(cmd, { encoding: 'utf-8', timeout: 30_000 });
}

function isProductionOrg(org: OrgInfo | null): boolean {
  if (!org) return false;
  return !org.isSandbox && !org.isScratch;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export interface PermissionsMiddlewareOptions {
  mode: PermissionMode;
  confirm: ConfirmFn;
  /** Override the default exec command (used to detect prod org). */
  execCommand?: (cmd: string) => Promise<string>;
}

export function createPermissionsMiddleware(
  options: PermissionsMiddlewareOptions,
): Middleware {
  const { mode, confirm, execCommand } = options;

  const middleware: Middleware = async (
    call: ToolCall,
    next: ToolExecutor,
  ): Promise<ToolResult> => {
    const risk = riskOf(call.name);
    let action = PERMISSION_TABLE[mode][risk];

    // Production org escalation
    const orgInfo = await detectProductionOrg(execCommand);
    if (isProductionOrg(orgInfo)) {
      if (risk === 'write' && action === 'auto') {
        action = 'confirm';
      }
      if (risk === 'destructive' && action !== 'blocked' && action !== 'hidden') {
        action = 'confirm';
      }
    }

    switch (action) {
      case 'auto':
        return next(call);

      case 'confirm': {
        const prodWarning = isProductionOrg(orgInfo)
          ? '\n\x1b[31m⛔ WARNING: This is a PRODUCTION org!\x1b[0m\n'
          : '';
        const confirmed = await confirm(
          `${prodWarning}Tool "${call.name}" (${risk}) requires confirmation. Proceed? [y/N]`,
        );
        if (!confirmed) {
          return { success: false, error: `Blocked by user: ${call.name}` };
        }
        return next(call);
      }

      case 'blocked':
        return {
          success: false,
          error: `Tool "${call.name}" is blocked in "${mode}" mode.`,
        };

      case 'hidden':
        return {
          success: false,
          error: `Tool "${call.name}" is not available in "${mode}" mode.`,
        };
    }
  };

  return middleware;
}
