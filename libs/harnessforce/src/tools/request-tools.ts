/**
 * request_tools meta-tool — activates additional tool categories on demand.
 *
 * The agent starts with ~26 tier-1 tools and uses request_tools to activate
 * categories like browser, agentforce, data-cloud when needed.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TOOL_CATEGORIES, CATEGORY_DESCRIPTIONS } from "./tool-tiers.js";

const activatedCategories = new Set<string>();

export function getActivatedCategories(): ReadonlySet<string> {
  return activatedCategories;
}

export function resetActivatedCategories(): void {
  activatedCategories.clear();
}

export const requestToolsTool = tool(
  async ({ category }) => {
    if (category === "list") {
      const lines = Object.entries(CATEGORY_DESCRIPTIONS).map(([cat, desc]) => {
        const active = activatedCategories.has(cat) ? " [active]" : "";
        const count = TOOL_CATEGORIES[cat]?.length ?? 0;
        return `  ${cat} (${count} tools)${active}: ${desc}`;
      });
      return `Available tool categories:\n${lines.join("\n")}`;
    }

    if (!TOOL_CATEGORIES[category]) {
      return `Unknown category "${category}". Available: ${Object.keys(TOOL_CATEGORIES).join(", ")}, or "list" to see all.`;
    }

    if (activatedCategories.has(category)) {
      return `Category "${category}" is already active. Tools: ${TOOL_CATEGORIES[category]!.join(", ")}`;
    }

    activatedCategories.add(category);
    const tools = TOOL_CATEGORIES[category]!;
    return `Activated "${category}" (${tools.length} tools): ${tools.join(", ")}. These tools will be available on your next action.`;
  },
  {
    name: "request_tools",
    description:
      "Load additional tool categories on demand. Categories: browser (UI automation), agentforce (agent management), data-cloud (Data Cloud ops), extended-sf (scratch orgs, packages, sandboxes), discovery (metadata exploration), docs (SF documentation). Use 'list' to see all.",
    schema: z.object({
      category: z.string().describe("Category to activate: browser, agentforce, data-cloud, extended-sf, discovery, docs, or 'list'"),
    }),
  },
);
