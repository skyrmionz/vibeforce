/**
 * Harnessforce middleware — permission model, safety, and audit logging.
 *
 * All middleware follows the same signature and is composable:
 *   (call: ToolCall, next: ToolExecutor) => Promise<ToolResult>
 */

// Re-export types
export type {
  AuditEntry,
  ConfirmFn,
  Middleware,
  OrgInfo,
  PermissionMode,
  RiskLevel,
  ToolCall,
  ToolExecutor,
  ToolResult,
} from './types.js';

// Permissions
export {
  createPermissionsMiddleware,
  detectProductionOrg,
  resetOrgInfoCache,
  riskOf,
  TOOL_RISK_MAP,
} from './permissions.js';
export type { PermissionsMiddlewareOptions } from './permissions.js';

// Dry-run
export { createDryRunMiddleware } from './dry-run.js';
export type { DryRunMiddlewareOptions, DryRunResult } from './dry-run.js';

// Snapshots
export {
  createSnapshotBeforeDeploy,
  createSnapshotMiddleware,
  rollbackToLatest,
} from './snapshots.js';
export type { SnapshotMiddlewareOptions } from './snapshots.js';

// Audit
export { createAuditMiddleware } from './audit.js';
export type { AuditMiddlewareOptions } from './audit.js';

// PII
export {
  createPiiMiddleware,
  detectPiiFields,
  isPiiField,
  maskPiiInRecords,
} from './pii.js';
export type { PiiMiddlewareOptions } from './pii.js';

// Summarization
export {
  createSummarizationMiddleware,
  compactMessages,
  estimateTokens,
  estimateMessagesTokens,
  summarizeMessages,
} from './summarization.js';
export type { SummarizationConfig } from './summarization.js';

// Memory
export {
  createMemoryMiddleware,
  readMemorySources,
  buildMemoryPrompt,
  loadForceInstructions,
} from './memory.js';
export type { MemoryConfig } from './memory.js';

// ---------------------------------------------------------------------------
// Composition helper
// ---------------------------------------------------------------------------

import type { Middleware, ToolExecutor } from './types.js';

/**
 * Compose multiple middleware into a single ToolExecutor.
 *
 * Middleware is applied in order — the first middleware in the array is the
 * outermost wrapper (runs first, delegates inward).
 *
 * @example
 * ```ts
 * const execute = composeMiddleware(
 *   [auditMiddleware, permissionsMiddleware, dryRunMiddleware],
 *   actualToolExecutor,
 * );
 * const result = await execute({ name: 'sf_deploy', args: {} });
 * ```
 */
export function composeMiddleware(
  middlewares: Middleware[],
  executor: ToolExecutor,
): ToolExecutor {
  // Build the chain from right to left
  let current = executor;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i]!;
    const next = current;
    current = (call) => mw(call, next);
  }
  return current;
}
