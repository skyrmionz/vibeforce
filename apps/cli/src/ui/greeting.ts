import chalk from "chalk";
import terminalImage from "terminal-image";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CYAN = "#00A1E0";

export interface GreetingOptions {
  version?: string;
  model?: string;
  org?: string;
  cwd?: string;
}

/**
 * Render the Agent Astro greeting with the actual PNG icon.
 * Uses terminal-image which auto-detects:
 *   - Kitty/iTerm2 → native inline image
 *   - Terminal.app → ANSI half-block fallback (▀▄ with colors)
 */
export async function renderGreeting(options?: GreetingOptions): Promise<string> {
  const dim = chalk.dim;
  const bold = chalk.bold;
  const cyan = chalk.hex(CYAN);

  const version = options?.version ?? "0.1.0";
  const model = options?.model ?? "claude-sonnet-4-20250514";
  const org = options?.org;
  const cwd = options?.cwd ?? process.cwd();

  // Render Agent Astro PNG as terminal art
  let imageLines: string[];
  try {
    // In dist/, the PNG is at ../src/ui/agent-astro.png relative to source
    // We ship it alongside the built JS — try multiple paths
    let imgBuffer: Buffer;
    const paths = [
      join(__dirname, "agent-astro.png"),           // same dir as compiled JS
      join(__dirname, "..", "..", "src", "ui", "agent-astro.png"),  // source dir
    ];
    let found = false;
    for (const p of paths) {
      try {
        imgBuffer = await readFile(p);
        found = true;
        break;
      } catch { /* try next */ }
    }
    if (!found) throw new Error("Agent Astro image not found");

    const rendered = await terminalImage.buffer(imgBuffer!, {
      height: 10,
      preserveAspectRatio: true,
    });
    imageLines = rendered.split("\n");
  } catch {
    // Fallback: simple text if image rendering fails
    imageLines = [
      "",
      cyan.bold("  ◉ VibeForce ◉"),
      "",
    ];
  }

  // Build right-side info panel
  const info = [
    "",
    `  ${bold(cyan.bold("VibeForce")) + dim(` v${version}`)}`,
    "",
    `  ${bold("The Salesforce Vibe Coding Agent")}`,
    "",
    `  ${dim(model)}`,
    org ? `  ${dim("org:")} ${org}` : `  ${dim("no org connected")}`,
    `  ${dim(cwd)}`,
    "",
  ];

  // Combine: image on left, info on right
  const maxLines = Math.max(imageLines.length, info.length);
  const lines: string[] = [];

  // Estimate image width for padding (terminal-image output varies)
  const imgWidth = 24; // approximate columns the image takes

  for (let i = 0; i < maxLines; i++) {
    const left = imageLines[i] ?? "";
    const right = info[i] ?? "";
    if (right) {
      // Pad the image line to align the info panel
      const stripped = left.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI for length calc
      const padding = Math.max(0, imgWidth - stripped.length);
      lines.push(`${left}${" ".repeat(padding)}${right}`);
    } else {
      lines.push(left);
    }
  }

  lines.push(`  ${dim("? for shortcuts")}`);

  return "\n" + lines.join("\n") + "\n";
}
