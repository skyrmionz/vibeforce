/**
 * Snapshot & rollback middleware — takes a snapshot of the metadata being
 * deployed before destructive operations, enabling rollback.
 */

import type {
  Middleware,
  ToolCall,
  ToolExecutor,
  ToolResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function defaultExecCommand(cmd: string): Promise<string> {
  const { execSync } = await import('node:child_process');
  return execSync(cmd, { encoding: 'utf-8', timeout: 120_000 });
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Build the retrieve command that captures the current state of whatever
 * we're about to deploy.
 */
function buildRetrieveCommand(
  args: Record<string, unknown>,
  outputDir: string,
): string {
  const parts = ['sf project retrieve start --json'];

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

  parts.push(`--output-dir "${outputDir}"`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SnapshotMiddlewareOptions {
  /** Root directory for snapshots. Defaults to `.vibeforce/snapshots`. */
  snapshotDir?: string;
  /** Override the default exec command (for testing). */
  execCommand?: (cmd: string) => Promise<string>;
}

/**
 * Create the snapshot middleware. It intercepts `sf_deploy` calls and saves
 * a snapshot before proceeding.
 */
export function createSnapshotMiddleware(
  options: SnapshotMiddlewareOptions = {},
): Middleware {
  const {
    snapshotDir = '.vibeforce/snapshots',
    execCommand = defaultExecCommand,
  } = options;

  const middleware: Middleware = async (
    call: ToolCall,
    next: ToolExecutor,
  ): Promise<ToolResult> => {
    if (call.name !== 'sf_deploy') {
      return next(call);
    }

    // Take snapshot before deploy
    try {
      await createSnapshotBeforeDeploy(call.args, { snapshotDir, execCommand });
    } catch {
      // Snapshot failure should not block the deploy — log and continue
      // In a real system we might emit a warning event here
    }

    return next(call);
  };

  return middleware;
}

/**
 * Save a snapshot of the metadata we're about to deploy.
 * Returns the path to the snapshot directory.
 */
export async function createSnapshotBeforeDeploy(
  deployArgs: Record<string, unknown>,
  options: SnapshotMiddlewareOptions = {},
): Promise<string> {
  const {
    snapshotDir = '.vibeforce/snapshots',
    execCommand = defaultExecCommand,
  } = options;

  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const ts = timestamp();
  const outputDir = path.join(snapshotDir, ts);
  await fs.mkdir(outputDir, { recursive: true });

  // Write a manifest of what we're deploying
  const manifestPath = path.join(outputDir, 'deploy-args.json');
  await fs.writeFile(manifestPath, JSON.stringify(deployArgs, null, 2), 'utf-8');

  // Retrieve current state from org
  const cmd = buildRetrieveCommand(deployArgs, outputDir);
  await execCommand(cmd);

  return outputDir;
}

/**
 * Rollback to the latest (most recent) snapshot by deploying its contents.
 */
export async function rollbackToLatest(
  options: SnapshotMiddlewareOptions = {},
): Promise<ToolResult> {
  const {
    snapshotDir = '.vibeforce/snapshots',
    execCommand = defaultExecCommand,
  } = options;

  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  let entries: string[];
  try {
    entries = await fs.readdir(snapshotDir);
  } catch {
    return { success: false, error: 'No snapshots directory found.' };
  }

  // Sort descending to get latest first
  const sorted = entries
    .filter((e) => !e.startsWith('.'))
    .sort()
    .reverse();

  if (sorted.length === 0) {
    return { success: false, error: 'No snapshots available for rollback.' };
  }

  const latest = sorted[0]!;
  const latestDir = path.join(snapshotDir, latest);

  // Read the deploy-args to figure out target org
  let targetOrg = '';
  try {
    const argsRaw = await fs.readFile(
      path.join(latestDir, 'deploy-args.json'),
      'utf-8',
    );
    const args = JSON.parse(argsRaw) as Record<string, unknown>;
    if (typeof args['targetOrg'] === 'string') {
      targetOrg = args['targetOrg'];
    }
  } catch {
    // proceed without target org
  }

  const cmd = [
    'sf project deploy start --json',
    `--source-dir "${latestDir}"`,
    targetOrg ? `--target-org "${targetOrg}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    const output = await execCommand(cmd);
    return {
      success: true,
      data: { snapshot: latest, output: JSON.parse(output) },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Rollback deploy failed: ${message}`,
    };
  }
}
