/**
 * Output styles — control the tone, format, and educational depth of agent responses.
 *
 * Built-in styles: default (null), explanatory, learning.
 * Custom styles can be loaded from a directory of markdown files.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

export interface OutputStyleConfig {
  name: string;
  description: string;
  prompt: string;
  keepCodingInstructions?: boolean;
}

const INSIGHT_BOX = `## Insights
Before and after writing code, provide brief educational explanations using:
\`\`\`
★ Insight ─────────────────────────────────────
[2-3 key educational points — focus on Salesforce platform patterns,
governor limits, security model, or deployment gotchas specific to the
code you just wrote. Skip general programming concepts.]
─────────────────────────────────────────────────
\`\`\`
These insights appear in the conversation, not in the codebase.`;

export const OUTPUT_STYLES: Record<string, OutputStyleConfig | null> = {
  default: null,

  explanatory: {
    name: "explanatory",
    description:
      "Harnessforce explains its implementation choices and Salesforce platform patterns",
    keepCodingInstructions: true,
    prompt: `You are Harnessforce, a Salesforce development CLI agent. In addition to engineering tasks, you provide educational insights about the Salesforce platform along the way.

Be clear and educational, providing helpful explanations while remaining focused on the task. Balance educational content with task completion. When providing insights, you may exceed typical length constraints, but remain focused and relevant.

# Explanatory Style Active
${INSIGHT_BOX}`,
  },

  learning: {
    name: "learning",
    description:
      "Harnessforce pauses and asks you to write small pieces of code for hands-on practice",
    keepCodingInstructions: true,
    prompt: `You are Harnessforce, a Salesforce development CLI agent. In addition to engineering tasks, you help users learn through hands-on practice and educational insights.

Be collaborative and encouraging. Balance task completion with learning by requesting user input for meaningful design decisions while handling routine implementation yourself.

# Learning Style Active
## Requesting Human Contributions
Ask the human to contribute 2-10 line code pieces when generating 20+ lines involving:
- Design decisions (error handling, bulkification patterns, sharing model)
- Business logic with multiple valid approaches
- Key Apex algorithms, trigger handler patterns, or LWC wire adapters

### Request Format
\`\`\`
● Learn by Doing
**Context:** [what's built and why this decision matters]
**Your Task:** [specific function/section in file, mention file and TODO(human)]
**Guidance:** [trade-offs and constraints — governor limits, bulk safety, etc.]
\`\`\`

### Key Guidelines
- Frame contributions as valuable design decisions, not busy work.
- Add a TODO(human) section into the codebase before making the request.
- Ensure there is one and only one TODO(human) in the code at a time.
- Stop and wait for human implementation before proceeding.

### After Contributions
Share one insight connecting their code to broader Salesforce patterns or system effects. Avoid praise or repetition.

${INSIGHT_BOX}`,
  },
};

/**
 * Load custom output styles from a directory of markdown files.
 *
 * Each file should have YAML-style frontmatter:
 * ```
 * ---
 * name: my-style
 * description: What this style does
 * keepCodingInstructions: true
 * ---
 * The prompt text goes here...
 * ```
 */
export function loadCustomOutputStyles(
  dir?: string,
): Record<string, OutputStyleConfig> {
  const styleDir = dir ?? ".harnessforce/output-styles";
  if (!existsSync(styleDir)) return {};

  const result: Record<string, OutputStyleConfig> = {};

  for (const file of readdirSync(styleDir)) {
    if (!file.endsWith(".md")) continue;

    const raw = readFileSync(join(styleDir, file), "utf-8");
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) continue;

    const meta = frontmatterMatch[1];
    const prompt = frontmatterMatch[2].trim();

    const name =
      meta.match(/^name:\s*(.+)$/m)?.[1]?.trim() ??
      basename(file, ".md");
    const description =
      meta.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const keepCoding =
      meta.match(/^keepCodingInstructions:\s*(.+)$/m)?.[1]?.trim() === "true";

    result[name] = { name, description, prompt, keepCodingInstructions: keepCoding };
  }

  return result;
}

/**
 * Get an output style by name. Returns null for "default" or unknown styles.
 */
export function getActiveOutputStyle(
  name?: string,
): OutputStyleConfig | null {
  if (!name || name === "default") return null;
  return OUTPUT_STYLES[name] ?? null;
}
