/**
 * Shared types for the VibeForce permission & safety middleware.
 */

// ---------------------------------------------------------------------------
// Permission & Risk
// ---------------------------------------------------------------------------

export type PermissionMode = 'default' | 'plan' | 'yolo' | 'safe';

export type RiskLevel = 'read' | 'write' | 'destructive';

// ---------------------------------------------------------------------------
// Tool call representation
// ---------------------------------------------------------------------------

export interface ToolCall {
  /** Tool name, e.g. "sf_deploy" */
  name: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
}

export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Arbitrary payload returned by the tool */
  data?: unknown;
  /** Error message when success=false */
  error?: string;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * A middleware wraps a tool executor.
 * It receives the tool call + the next executor in the chain, and returns a
 * ToolResult (or throws).
 */
export type ToolExecutor = (call: ToolCall) => Promise<ToolResult>;

export type Middleware = (
  call: ToolCall,
  next: ToolExecutor,
) => Promise<ToolResult>;

// ---------------------------------------------------------------------------
// Confirmation callback
// ---------------------------------------------------------------------------

/**
 * Called when the middleware needs interactive confirmation from the user.
 * The TUI layer (Ink) provides a concrete implementation; tests can stub it.
 *
 * Return `true` to proceed, `false` to abort.
 */
export type ConfirmFn = (message: string) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Audit log entry
// ---------------------------------------------------------------------------

export interface AuditEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  result: 'success' | 'error' | 'blocked';
  duration_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Org info (subset we care about)
// ---------------------------------------------------------------------------

export interface OrgInfo {
  isSandbox: boolean;
  isScratch: boolean;
  orgId: string;
  instanceUrl: string;
}
