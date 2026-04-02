/**
 * Dry-run middleware — intercepts `sf_deploy` calls and runs a validation
 * dry-run before executing the real deploy.
 */

import type {
  ConfirmFn,
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
// Types
// ---------------------------------------------------------------------------

export interface DryRunMiddlewareOptions {
  confirm: ConfirmFn;
  /** Override the default exec command (for testing). */
  execCommand?: (cmd: string) => Promise<string>;
}
