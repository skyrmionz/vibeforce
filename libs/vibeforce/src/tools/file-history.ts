/**
 * File history — save and restore previous versions of files.
 *
 * Versions are stored under `.vibeforce/file-history/{hash}.json`.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HISTORY_DIR = resolve(process.cwd(), ".vibeforce", "file-history");
const MAX_VERSIONS = 10;

function hashPath(filePath: string): string {
  return Buffer.from(filePath).toString("base64url");
}

function historyFilePath(filePath: string): string {
  return join(HISTORY_DIR, `${hashPath(filePath)}.json`);
}

interface VersionEntry {
  timestamp: string;
  content: string;
}

async function readHistory(filePath: string): Promise<VersionEntry[]> {
  const hPath = historyFilePath(filePath);
  if (!existsSync(hPath)) return [];
  try {
    return JSON.parse(await readFile(hPath, "utf-8")) as VersionEntry[];
  } catch {
    return [];
  }
}

async function writeHistory(
  filePath: string,
  entries: VersionEntry[],
): Promise<void> {
  await mkdir(HISTORY_DIR, { recursive: true });
  await writeFile(historyFilePath(filePath), JSON.stringify(entries, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save the current content of a file as a version snapshot.
 * No-op if the file doesn't exist yet.
 */
export async function saveFileVersion(filePath: string): Promise<void> {
  if (!existsSync(filePath)) return;

  try {
    const content = await readFile(filePath, "utf-8");
    const history = await readHistory(filePath);

    history.push({ timestamp: new Date().toISOString(), content });

    // Keep only the last N versions
    const trimmed = history.slice(-MAX_VERSIONS);
    await writeHistory(filePath, trimmed);
  } catch {
    // Non-blocking — don't crash the tool if history saving fails
  }
}

/**
 * Get the version history for a file.
 */
export async function getFileHistory(
  filePath: string,
): Promise<VersionEntry[]> {
  return readHistory(filePath);
}

/**
 * Restore the most recent saved version of a file.
 * Returns the restored content, or null if no history exists.
 */
export async function restoreLastVersion(
  filePath: string,
): Promise<string | null> {
  const history = await readHistory(filePath);
  if (history.length === 0) return null;

  const last = history[history.length - 1]!;
  await writeFile(filePath, last.content, "utf-8");
  return last.content;
}

// ---------------------------------------------------------------------------
// Last-edited file tracker
// ---------------------------------------------------------------------------

let _lastEditedFile: string | null = null;

/**
 * Record the most recently edited file path.
 * Called by write/edit tools after modifying a file.
 */
export function trackEditedFile(filePath: string): void {
  _lastEditedFile = filePath;
}

/**
 * Get the most recently edited file path, or null if none recorded.
 */
export function getLastEditedFile(): string | null {
  return _lastEditedFile;
}
