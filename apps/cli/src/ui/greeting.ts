import chalk from "chalk";

// Agent Astro palette (from the actual icon)
const NAVY = "#1B2A4A";
const CYAN = "#00A1E0";
const WHITE = "#FFFFFF";
const DARK = "#0D1B2A";

export interface GreetingOptions {
  version?: string;
  org?: string;
  cwd?: string;
}

/**
 * Half-block pixel helper.
 * Each character cell renders 2 vertical pixels using ▀ with fg (top) and bg (bottom).
 */
function px(top: string | null, bottom: string | null): string {
  if (top && bottom) {
    // Both colors: upper half = fg, lower half = bg
    return chalk.hex(top).bgHex(bottom)("▀");
  }
  if (top && !bottom) {
    // Top pixel only
    return chalk.hex(top)("▀");
  }
  if (!top && bottom) {
    // Bottom pixel only
    return chalk.hex(bottom)("▄");
  }
  return " ";
}

/**
 * Render Agent Astro as a compact pixel character (~5 lines, ~10 chars wide).
 * Designed to match the actual Agent Astro icon:
 *   - Dark navy circular body with small ears
 *   - Cyan flame-shaped face
 *   - Dark sunglasses
 *   - White ring outline
 *
 * The pixel grid (10 wide x 10 tall) compresses to 5 terminal lines via half-blocks.
 */
function renderAstro(): string[] {
  const N = NAVY;
  const C = CYAN;
  const W = WHITE;
  const D = DARK;
  const _ = null; // transparent (terminal bg)

  // 14x14 pixel grid — balanced proportions, thick glasses with bridge
  const grid: (string | null)[][] = [
    // Half-block pairing: line N renders row 2N (top) + row 2N+1 (bottom)
    //
    // Line 0: ears + navy
    [_, N, N, _, _, _, _, _, _, _, _, N, N, _],
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],
    // Line 1: navy + white (top transition)
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],
    [_, N, W, W, W, W, W, W, W, W, W, W, N, _],
    // Line 2: cyan + cyan (solid face, no gap)
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],
    // Line 3: bridge bar + DDD-CC-DDD frames
    [_, N, W, D, D, D, D, D, D, D, D, W, N, _],
    [_, N, W, D, D, D, C, C, D, D, D, W, N, _],
    // Line 4: cyan + cyan (solid face below glasses)
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],
    // Line 5: white + white (thick white bar, matches navy bar thickness)
    [_, N, W, W, W, W, W, W, W, W, W, W, N, _],
    [_, N, W, W, W, W, W, W, W, W, W, W, N, _],
    // Line 6: navy + navy (thick bottom bar)
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],
  ];

  const lines: string[] = [];
  for (let y = 0; y < grid.length; y += 2) {
    const topRow = grid[y]!;
    const bottomRow = grid[y + 1] ?? Array(topRow.length).fill(null);
    let line = "";
    for (let x = 0; x < topRow.length; x++) {
      line += px(topRow[x], bottomRow[x]);
    }
    lines.push(line);
  }
  return lines;
}

export function renderGreeting(options?: GreetingOptions): string {
  const dim = chalk.dim;
  const bold = chalk.bold;
  const cyan = chalk.hex(CYAN);

  const version = options?.version ?? "unknown";
  const org = options?.org;
  const cwd = options?.cwd ?? process.cwd();

  const astro = renderAstro();

  // Info panel to the right of the character
  const info = [
    "",
    "",
    `  ${bold(cyan("Harnessforce")) + dim(` v${version}`)}`,
    "",
    org ? `  ${dim("org:")} ${org}` : `  ${dim("no org connected")}`,
    `  ${dim(cwd)}`,
    "",
  ];

  // Combine character (left) + info (right)
  const maxLines = Math.max(astro.length, info.length);
  const lines: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    const left = `    ${astro[i] ?? "          "}`;
    const right = info[i] ?? "";
    lines.push(`${left}${right}`);
  }

  lines.push("");

  return "\n" + lines.join("\n") + "\n";
}
