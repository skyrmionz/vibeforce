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
    //         1  2  3  4  5  6  7  8  9 10 11 12 13 14
    // Row 0:  ears
    [_, N, N, _, _, _, _, _, _, _, _, N, N, _],  // 14 cols
    // Row 1:  navy top border
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],  // 14
    // Row 2:  navy top border row 2
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],  // 14
    // Row 3:  white border top
    [_, N, W, W, W, W, W, W, W, W, W, W, N, _],  // 14
    // Row 4:  cyan face
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // 14
    // Row 5:  cyan face
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // 14
    // Row 6:  glasses top bar (full dark connecting bar)
    [_, N, W, D, D, D, D, D, D, D, D, W, N, _],  // 14
    // Row 7:  glasses: frame D, lens CC, bridge DD, lens CC, frame D
    [_, N, W, D, C, C, D, D, C, C, D, W, N, _],  // 14  inner: D CC DD CC D
    // Row 8:  cyan face
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // 14
    // Row 9:  cyan face
    [_, N, W, C, C, C, C, C, C, C, C, W, N, _],  // 14
    // Row 10: white border bottom
    [_, N, W, W, W, W, W, W, W, W, W, W, N, _],  // 14
    // Row 11: navy bottom border
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],  // 14
    // Row 12: navy bottom border row 2
    [_, N, N, N, N, N, N, N, N, N, N, N, N, _],  // 14
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
