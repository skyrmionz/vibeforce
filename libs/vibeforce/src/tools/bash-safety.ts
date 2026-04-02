/**
 * Bash safety — detect dangerous shell commands before execution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafetyCheck {
  safe: boolean;
  reason?: string;
  severity?: "warning" | "block";
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

interface Pattern {
  regex: RegExp;
  severity: "warning" | "block";
  reason: string;
}

const PATTERNS: Pattern[] = [
  // ── Blocks ──────────────────────────────────────────────────────────────
  {
    regex: /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/\s/,
    severity: "block",
    reason: "rm -rf / would destroy the entire filesystem",
  },
  {
    regex: /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+~\s/,
    severity: "block",
    reason: "rm -rf ~ would destroy the home directory",
  },
  {
    regex: /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/$/,
    severity: "block",
    reason: "rm -rf / would destroy the entire filesystem",
  },
  {
    regex: /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+~$/,
    severity: "block",
    reason: "rm -rf ~ would destroy the home directory",
  },

  // ── Warnings ────────────────────────────────────────────────────────────
  {
    regex: /rm\s+-[a-zA-Z]*r/,
    severity: "warning",
    reason: "Recursive file deletion — verify the target path",
  },
  {
    regex: /DROP\s+TABLE/i,
    severity: "warning",
    reason: "DROP TABLE detected — verify this is intentional",
  },
  {
    regex: /DELETE\s+FROM\s+\S+(?!\s+WHERE)/i,
    severity: "warning",
    reason: "DELETE FROM without WHERE clause — may delete all rows",
  },
  {
    regex: />\s*\/dev\/null/,
    severity: "warning",
    reason: "Output redirected to /dev/null — results will be discarded",
  },
  {
    regex: /\btruncate\b/i,
    severity: "warning",
    reason: "truncate command detected — will erase file/table contents",
  },
  {
    regex: /curl\s.*\|\s*(ba)?sh/,
    severity: "block",
    reason: "Piping curl to shell is dangerous — download the script first, review it, then run it",
  },
  {
    regex: /wget\s.*\|\s*(ba)?sh/,
    severity: "block",
    reason: "Piping wget to shell is dangerous — download the script first, review it, then run it",
  },
  {
    regex: /chmod\s+777/,
    severity: "warning",
    reason: "chmod 777 makes files world-writable — use more restrictive permissions",
  },
  {
    regex: /kill\s+-9/,
    severity: "warning",
    reason: "kill -9 sends SIGKILL — process cannot clean up gracefully",
  },
];

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

/**
 * Check a bash command for dangerous patterns.
 *
 * Returns `{ safe: true }` if no issues found, otherwise returns
 * the highest-severity match.
 */
export function checkBashSafety(command: string): SafetyCheck {
  let worstMatch: Pattern | undefined;

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(command)) {
      // Blocks always win
      if (pattern.severity === "block") {
        return { safe: false, reason: pattern.reason, severity: "block" };
      }
      // Track worst warning
      if (!worstMatch) {
        worstMatch = pattern;
      }
    }
  }

  if (worstMatch) {
    return { safe: true, reason: worstMatch.reason, severity: "warning" };
  }

  return { safe: true };
}
