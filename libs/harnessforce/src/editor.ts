/**
 * External editor support for composing prompts.
 *
 * Ported from Deep Agents' editor.py to TypeScript.
 */

import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

/** Mapping of GUI editor base names to their blocking flag. */
const GUI_WAIT_FLAG: Record<string, string> = {
  code: "--wait",
  cursor: "--wait",
  zed: "--wait",
  atom: "--wait",
  subl: "-w",
  windsurf: "--wait",
};

/** Set of vim-family editor base names that receive `-i NONE`. */
const VIM_EDITORS = new Set(["vi", "vim", "nvim"]);

/**
 * Resolve editor command from environment.
 *
 * Checks $VISUAL, then $EDITOR, then falls back to `vi`.
 * Returns tokenized command list, or `null` if the env var was set but empty.
 */
export function resolveEditor(): string[] | null {
  const editor = process.env.VISUAL || process.env.EDITOR;
  if (!editor) return ["vi"];
  const tokens = editor.split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens : null;
}

/**
 * Build the full command list with appropriate flags.
 */
function prepareCommand(cmd: string[], filepath: string): string[] {
  const result = [...cmd];
  const exe = result[0]!.split("/").pop()!.replace(/\.exe$/i, "").toLowerCase();

  // Auto-inject wait flag for GUI editors
  if (exe in GUI_WAIT_FLAG) {
    const flag = GUI_WAIT_FLAG[exe]!;
    if (!result.includes(flag)) {
      result.splice(1, 0, flag);
    }
  }

  // Vim workaround: avoid viminfo errors in temp environments
  if (VIM_EDITORS.has(exe) && !result.includes("-i")) {
    result.push("-i", "NONE");
  }

  result.push(filepath);
  return result;
}

/**
 * Open `currentText` in an external editor.
 *
 * Creates a temp `.md` file, launches the editor, and reads back the result.
 * Returns the edited text, or `null` if the editor exited with non-zero,
 * was not found, or the result was empty/whitespace-only.
 */
export function openInEditor(currentText: string): string | null {
  const cmd = resolveEditor();
  if (cmd === null) return null;

  const tmpPath = join(tmpdir(), `harnessforce-edit-${randomUUID()}.md`);

  try {
    writeFileSync(tmpPath, currentText, "utf-8");

    const fullCmd = prepareCommand(cmd, tmpPath);
    const [program, ...args] = fullCmd;

    const result = spawnSync(program!, args, {
      stdio: "inherit",
    });

    if (result.status !== 0) return null;

    let edited = readFileSync(tmpPath, "utf-8");

    // Normalize line endings
    edited = edited.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Strip exactly one trailing newline (POSIX convention)
    if (edited.endsWith("\n")) {
      edited = edited.slice(0, -1);
    }

    // Empty result = cancellation
    if (!edited.trim()) return null;

    return edited;
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
  }
}
