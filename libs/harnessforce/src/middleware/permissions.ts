/**
 * Permission middleware — intercepts tool calls and enforces permission rules
 * based on the active PermissionMode and the tool's risk classification.
 *
 * Production org detection auto-escalates risk levels.
 */

import type {
  ConfirmFn,
  OrgInfo,
  PermissionMode,
  RiskLevel,
} from './types.js';

// ---------------------------------------------------------------------------
// Tool → risk classification
// ---------------------------------------------------------------------------

export const TOOL_RISK_MAP: Record<string, RiskLevel> = {
  // ── read ──────────────────────────────────────────────────────────────────
  sf_query: 'read',
  sf_describe_object: 'read',
  sf_list_orgs: 'read',
  sf_get_org_info: 'read',
  sf_org_limits: 'read',
  sf_run_tests: 'read',
  sf_get_test_results: 'read',
  sf_get_debug_log: 'read',
  sf_list_metadata_types: 'read',
  sf_list_metadata_of_type: 'read',
  sf_describe_all_sobjects: 'read',
  read_file: 'read',
  glob: 'read',
  grep: 'read',
  ls: 'read',
  sf_docs_search: 'read',
  sf_docs_read: 'read',
  browser_screenshot: 'read',
  browser_close: 'read',
  write_todos: 'read',
  web_search: 'read',
  web_fetch: 'read',
  dc_query: 'read',
  dc_list_objects: 'read',
  dc_describe: 'read',

  // ── write ─────────────────────────────────────────────────────────────────
  write_file: 'write',
  edit_file: 'write',
  execute: 'write',
  task: 'write',
  browser_open: 'write',
  agent_validate: 'write',
  agent_preview: 'write',

  // ── destructive ───────────────────────────────────────────────────────────
  sf_deploy: 'destructive',
  sf_data: 'destructive',
  sf_run_apex: 'destructive',
  sf_retrieve: 'destructive',
  agent_publish: 'destructive',
  agent_activate: 'destructive',
  browser_click: 'destructive',
  browser_fill: 'destructive',
  browser_execute: 'destructive',
  dc_ingest_streaming: 'destructive',
  dc_ingest_bulk: 'destructive',
  dc_create_identity_resolution: 'destructive',
  dc_create_segment: 'destructive',
  sf_scratch_org_create: 'write',
  sf_scratch_org_delete: 'destructive',
  sf_scratch_org_list: 'read',
  sf_package_create: 'write',
  sf_package_version_create: 'write',
  sf_package_install: 'destructive',
  sf_deploy_status: 'read',
  sf_deploy_cancel: 'destructive',
  sf_test_coverage: 'read',
  sf_data_export: 'read',
  sf_sandbox_create: 'write',
  sf_event_log: 'read',
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
// Types (kept for backwards compatibility)
// ---------------------------------------------------------------------------

export interface PermissionsMiddlewareOptions {
  mode: PermissionMode;
  confirm: ConfirmFn;
  /** Override the default exec command (used to detect prod org). */
  execCommand?: (cmd: string) => Promise<string>;
}
