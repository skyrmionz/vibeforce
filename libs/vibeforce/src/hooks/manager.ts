/**
 * Hooks manager — run user-defined shell commands on lifecycle events.
 *
 * Hooks are configured in `.vibeforce/settings.json` under the `hooks` key.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HookEvent =
  | "session-start"
  | "session-end"
  | "pre-tool-use"
  | "post-tool-use"
  | "user-prompt-submit"
  | "pre-deploy"
  | "post-deploy";

export interface HookConfig {
  event: HookEvent;
  command: string;
  args?: string[];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load hooks from `.vibeforce/settings.json`.
 * Returns an empty array if the file doesn't exist or has no hooks.
 */
export function loadHooks(settingsPath?: string): HookConfig[] {
  const path =
    settingsPath ?? resolve(process.cwd(), ".vibeforce", "settings.json");

  if (!existsSync(path)) return [];

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as {
      hooks?: unknown[];
    };
    if (!Array.isArray(raw.hooks)) return [];

    return raw.hooks.filter(
      (h): h is HookConfig =>
        typeof h === "object" &&
        h !== null &&
        typeof (h as HookConfig).event === "string" &&
        typeof (h as HookConfig).command === "string",
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute all hooks matching the given event.
 *
 * Non-blocking — if a hook fails it logs to stderr but does not throw.
 */
export async function executeHooks(
  event: HookEvent,
  context?: Record<string, string>,
): Promise<void> {
  const hooks = loadHooks();
  const matching = hooks.filter((h) => h.event === event);

  if (matching.length === 0) return;

  const env = { ...process.env, ...context, VIBEFORCE_HOOK_EVENT: event };

  await Promise.allSettled(
    matching.map(
      (hook) =>
        new Promise<void>((res) => {
          execFile(
            hook.command,
            hook.args ?? [],
            { env, timeout: 30_000 },
            (err) => {
              if (err) {
                process.stderr.write(
                  `[vibeforce] hook "${hook.command}" (${event}) failed: ${err.message}\n`,
                );
              }
              res();
            },
          );
        }),
    ),
  );
}
