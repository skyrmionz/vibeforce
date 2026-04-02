/**
 * Dry-run middleware — intercepts `sf_deploy` calls and runs a validation
 * dry-run before executing the real deploy.
 */

import type {
  ConfirmFn,
  Middleware,
  ToolCall,
  ToolExecutor,
  ToolResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface DryRunResult {
  success: boolean;
  /** Number of components that passed validation */
  componentsPassed: number;
  /** Number of components that failed validation */
  componentsFailed: number;
  /** Human-readable summary */
  summary: string;
  /** Raw JSON output from the CLI */
  raw: unknown;
}

async function defaultExecCommand(cmd: string): Promise<string> {
  const { execSync } = await import('node:child_process');
  return execSync(cmd, { encoding: 'utf-8', timeout: 120_000 });
}

/**
 * Build the dry-run command from the original deploy args.
 */
function buildDryRunCommand(args: Record<string, unknown>): string {
  const parts = ['sf project deploy start --dry-run --json'];

  if (typeof args['sourcePath'] === 'string' && args['sourcePath']) {
    parts.push(`--source-dir "${args['sourcePath']}"`);
  }
  if (typeof args['metadata'] === 'string' && args['metadata']) {
    parts.push(`--metadata "${args['metadata']}"`);
  }
  if (typeof args['manifest'] === 'string' && args['manifest']) {
    parts.push(`--manifest "${args['manifest']}"`);
  }
  if (typeof args['targetOrg'] === 'string' && args['targetOrg']) {
    parts.push(`--target-org "${args['targetOrg']}"`);
  }
  if (typeof args['wait'] === 'number') {
    parts.push(`--wait ${args['wait']}`);
  }

  return parts.join(' ');
}

function parseDryRunOutput(raw: string): DryRunResult {
  try {
    const parsed = JSON.parse(raw) as {
      status?: number;
      result?: {
        numberComponentsDeployed?: number;
        numberComponentErrors?: number;
        success?: boolean;
      };
    };
    const result = parsed.result;
    const passed = result?.numberComponentsDeployed ?? 0;
    const failed = result?.numberComponentErrors ?? 0;
    const success = result?.success ?? (failed === 0);

    return {
      success,
      componentsPassed: passed,
      componentsFailed: failed,
      summary: success
        ? `Dry-run passed: ${passed} component(s) validated.`
        : `Dry-run failed: ${failed} component error(s) out of ${passed + failed}.`,
      raw: parsed,
    };
  } catch {
    return {
      success: false,
      componentsPassed: 0,
      componentsFailed: 0,
      summary: `Dry-run produced unparseable output.`,
      raw,
    };
  }
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export interface DryRunMiddlewareOptions {
  confirm: ConfirmFn;
  /** Override the default exec command (for testing). */
  execCommand?: (cmd: string) => Promise<string>;
}

export function createDryRunMiddleware(
  options: DryRunMiddlewareOptions,
): Middleware {
  const { confirm, execCommand = defaultExecCommand } = options;

  const middleware: Middleware = async (
    call: ToolCall,
    next: ToolExecutor,
  ): Promise<ToolResult> => {
    // Only intercept deploy calls
    if (call.name !== 'sf_deploy') {
      return next(call);
    }

    // 1. Run dry-run validation
    const cmd = buildDryRunCommand(call.args);
    let dryRunResult: DryRunResult;

    try {
      const output = await execCommand(cmd);
      dryRunResult = parseDryRunOutput(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Dry-run failed: ${message}`,
      };
    }

    // 2. Show results
    if (!dryRunResult.success) {
      return {
        success: false,
        error: dryRunResult.summary,
        data: dryRunResult.raw,
      };
    }

    // 3. Ask user to confirm real deploy
    const confirmed = await confirm(
      `${dryRunResult.summary}\nDeploy for real? [y/N]`,
    );

    if (!confirmed) {
      return {
        success: false,
        error: 'Deploy aborted by user after dry-run.',
      };
    }

    // 4. Proceed with the actual deploy
    return next(call);
  };

  return middleware;
}
