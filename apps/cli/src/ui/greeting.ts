import chalk from "chalk";

// Agent Astro color palette (from the actual icon)
const NAVY = "#1B2A4A";       // Dark navy body/head
const CYAN = "#00A1E0";       // Bright cyan flame face
const WHITE = "#FFFFFF";       // White outline ring
const DARK = "#0D1B2A";       // Darkest navy (sunglasses)

export function renderGreeting(options?: {
  version?: string;
  model?: string;
  org?: string;
  cwd?: string;
}): string {
  const navy = chalk.hex(NAVY);
  const cyan = chalk.hex(CYAN);
  const white = chalk.hex(WHITE);
  const dark = chalk.hex(DARK);
  const dim = chalk.dim;
  const bold = chalk.bold;

  // Agent Astro pixel art — matches the actual icon:
  // Dark navy circle with ears, cyan flame face, dark sunglasses, white ring
  const n = navy.bold("█");   // navy block
  const c = cyan.bold("█");   // cyan block
  const w = white.bold("█");  // white block
  const d = dark.bold("█");   // dark (sunglasses)
  const _ = " ";              // empty

  const astro = [
    `    ${n}${n}${_}${_}${_}${_}${_}${_}${_}${_}${n}${n}`,
    `    ${n}${n}${w}${w}${w}${w}${w}${w}${w}${w}${n}${n}`,
    `     ${w}${n}${n}${n}${n}${n}${n}${n}${n}${w}`,
    `     ${w}${n}${n}${c}${c}${c}${c}${n}${n}${w}`,
    `     ${w}${n}${c}${c}${c}${c}${c}${c}${n}${w}`,
    `     ${w}${n}${d}${d}${c}${c}${d}${d}${n}${w}`,
    `     ${w}${n}${n}${c}${c}${c}${c}${n}${n}${w}`,
    `     ${w}${n}${n}${n}${n}${n}${n}${n}${n}${w}`,
    `      ${w}${w}${w}${w}${w}${w}${w}${w}`,
  ];

  const version = options?.version ?? "0.1.0";
  const model = options?.model ?? "claude-sonnet-4-20250514";
  const org = options?.org;
  const cwd = options?.cwd ?? process.cwd();

  // Right-side info panel (matches Claude Code's layout)
  const info = [
    ``,
    ``,
    `  ${bold(cyan.bold("VibeForce")) + dim(` v${version}`)}`,
    ``,
    `  ${bold("The Salesforce Vibe Coding Agent")}`,
    ``,
    `  ${dim(model)}`,
    org ? `  ${dim("org:")} ${org}` : `  ${dim("no org connected")}`,
    `  ${dim(cwd)}`,
  ];

  // Combine pixel art (left) with info panel (right)
  const lines: string[] = [];
  const maxLines = Math.max(astro.length, info.length);
  for (let i = 0; i < maxLines; i++) {
    const left = astro[i] ?? "              ";
    const right = info[i] ?? "";
    lines.push(`${left}${right}`);
  }

  // Tips/hints below
  lines.push("");
  lines.push(`  ${dim("? for shortcuts")}`)

  return "\n" + lines.join("\n") + "\n";
}
