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
    // Line 0: row0+row1 = ears + navy top
    [_, N, N, _, _, _, _, _, _, _, _, N, N, _],  // row 0: ears
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],  // row 1: navy
    // Line 1: row2+row3 = navy + white (top transition, sides stay N)
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],  // row 2: navy
    [_, N, W, W, W, W, W, W, W, W, W, W, N, _],  // row 3: white
    // Line 2: row4+row5 = cyan + cyan (solid face)
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // row 4: cyan
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // row 5: cyan
    // Line 3: row6+row7 = full dark bar (bridge) + DD-CCCC-DD (lenses)
    [_, N, W, D, D, D, D, D, D, D, D, W, N, _],  // row 6: bridge bar
    [_, N, W, D, D, C, C, C, C, D, D, W, N, _],  // row 7: frames+lenses
    // Line 4: row8+row9 = cyan + cyan (solid face)
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // row 8: cyan
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // row 9: cyan
    // Line 5: row10+row11 = white + navy (bottom transition, mirrors line 1)
    [_, N, W, W, W, W, W, W, W, W, W, W, N, _],  // row 10: white
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],  // row 11: navy
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

  const version = options?.version ?? "0.1.0";
  const org = options?.org;
  const cwd = options?.cwd ?? process.cwd();

  const astro = renderAstro();

  // Info panel to the right of the character
  const info = [
    "",
    "",
    `  ${bold(cyan("Vibeforce")) + dim(` v${version}`)}`,
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
