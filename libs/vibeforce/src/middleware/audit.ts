/**
 * Audit logging middleware — logs every tool invocation to a JSONL file.
 */

import type {
  AuditEntry,
  Middleware,
  ToolCall,
  ToolExecutor,
  ToolResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(filePath: string): Promise<void> {
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function appendLine(filePath: string, line: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.appendFile(filePath, line + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export interface AuditMiddlewareOptions {
  /** Path to the audit log file. */
  logPath: string;
}

export function createAuditMiddleware(
  options: AuditMiddlewareOptions,
): Middleware {
  const { logPath } = options;
  let dirEnsured = false;

  const middleware: Middleware = async (
    call: ToolCall,
    next: ToolExecutor,
  ): Promise<ToolResult> => {
    if (!dirEnsured) {
      await ensureDir(logPath);
      dirEnsured = true;
    }

    const start = Date.now();
    let result: ToolResult;
    let status: AuditEntry['result'] = 'success';

    try {
      result = await next(call);
      if (!result.success) {
        status = result.error?.includes('Blocked') || result.error?.includes('blocked')
          ? 'blocked'
          : 'error';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      status = 'error';
      result = { success: false, error: message };
    }

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      tool: call.name,
      args: call.args,
      result: status,
      duration_ms: Date.now() - start,
      ...(result.error ? { error: result.error } : {}),
    };

    try {
      await appendLine(logPath, JSON.stringify(entry));
    } catch {
      // Logging failure should not break the tool chain
    }

    return result;
  };

  return middleware;
}
