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

  // 14x16 pixel grid — larger, squarer design
  // Structure: navy outer border → white inner border → cyan face → dark glasses
  // Two small navy ears on top
  const grid: (string | null)[][] = [
    // Row 0:  ears (two small navy squares on top)
    [_, _, N, N, _, _, _, _, _, _, N, N, _, _],
    // Row 1:  ears bottom + navy top border starts
    [_, _, N, N, N, N, N, N, N, N, N, N, _, _],
    // Row 2:  navy outer border top
    [_, _, N, N, N, N, N, N, N, N, N, N, _, _],
    // Row 3:  navy | white inner border top
    [_, _, N, W, W, W, W, W, W, W, W, N, _, _],
    // Row 4:  navy | white | cyan face top
    [_, _, N, W, C, C, C, C, C, C, W, N, _, _],
    // Row 5:  navy | white | cyan face
    [_, _, N, W, C, C, C, C, C, C, W, N, _, _],
    // Row 6:  navy | white | glasses: dark-dark-cyan-cyan-dark-dark
    [_, _, N, W, D, D, C, C, D, D, W, N, _, _],
    // Row 7:  navy | white | glasses: dark-dark-dark-dark-dark-dark (bridge connects)
    [_, _, N, W, D, D, D, D, D, D, W, N, _, _],
    // Row 8:  navy | white | cyan face bottom
    [_, _, N, W, C, C, C, C, C, C, W, N, _, _],
    // Row 9:  navy | white | cyan face bottom
    [_, _, N, W, C, C, C, C, C, C, W, N, _, _],
    // Row 10: navy | white inner border bottom
    [_, _, N, W, W, W, W, W, W, W, W, N, _, _],
    // Row 11: navy outer border bottom
    [_, _, N, N, N, N, N, N, N, N, N, N, _, _],
    // Row 12: navy outer border bottom
    [_, _, N, N, N, N, N, N, N, N, N, N, _, _],
    // Row 13: padding
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _],
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
