/**
 * sf_knowledge tool — lazy-loads Salesforce deep knowledge prompts on demand.
 *
 * Instead of injecting ~21K tokens of SF prompts into every system message,
 * the agent requests specific topics when it needs them.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { SF_GOVERNOR_LIMITS_PROMPT } from "../prompts/sf-governor-limits.js";
import { SF_TRIGGER_PATTERNS_PROMPT } from "../prompts/sf-trigger-patterns.js";
import { SF_TESTING_PROMPT } from "../prompts/sf-testing.js";
import { SF_FLOW_PROMPT } from "../prompts/sf-flow.js";
import { SF_LWC_PROMPT } from "../prompts/sf-lwc.js";
import { SF_SOQL_PROMPT } from "../prompts/sf-soql.js";
import { SF_API_STRATEGY_PROMPT } from "../prompts/sf-api-strategy.js";
import { SF_DEPLOYMENT_PROMPT } from "../prompts/sf-deployment.js";
import { SF_APEX_ARCHITECTURE_PROMPT } from "../prompts/sf-apex-architecture.js";
import { SF_INTEGRATION_PROMPT } from "../prompts/sf-integration.js";
import { SF_METADATA_PATTERNS_PROMPT } from "../prompts/sf-metadata-patterns.js";
import { AGENTFORCE_PROMPT } from "../prompts/agentforce.js";
import { DATA_CLOUD_PROMPT } from "../prompts/datacloud.js";
import { SELF_DISCOVERY_PROMPT } from "../prompts/self-discovery.js";
import { UNSUPPORTED_METADATA_PROMPT } from "../prompts/unsupported-metadata.js";

const EXTENSIBILITY_PROMPT = `## Extensibility — What Users Can Customize

Users can extend Harnessforce capabilities. Some changes take effect immediately, others require a restart.

### Immediate (no restart needed):
- **Skills**: Create/edit markdown files in the \`skills/\` directory. They auto-register as slash commands.
- **FORCE.md**: Edit project instructions in \`FORCE.md\`, \`~/.harnessforce/FORCE.md\`, or \`FORCE.local.md\`. Loaded every turn.
- **Agent memory**: Edit \`.harnessforce/agent.md\`. Loaded every turn.

### Requires restart:
- **MCP servers**: Edit \`~/.harnessforce/mcp.json\`. Servers connect at startup only.
- **Plugins**: Add JS modules to \`~/.harnessforce/plugins/\`. Loaded at startup only.
- **Model provider/API key config**: Edit \`~/.harnessforce/models.yaml\`. The running session uses in-memory config. Use \`/provider\` and \`/set-key\` commands instead, or restart.

IMPORTANT: When you edit a file that requires a restart, ALWAYS tell the user: "This change will take effect after you restart Harnessforce."
`;

const KNOWLEDGE_MAP: Record<string, string> = {
  "governor-limits": SF_GOVERNOR_LIMITS_PROMPT,
  "trigger-patterns": SF_TRIGGER_PATTERNS_PROMPT,
  "testing": SF_TESTING_PROMPT,
  "flows": SF_FLOW_PROMPT,
  "lwc": SF_LWC_PROMPT,
  "soql": SF_SOQL_PROMPT,
  "api-strategy": SF_API_STRATEGY_PROMPT,
  "deployment": SF_DEPLOYMENT_PROMPT,
  "apex-architecture": SF_APEX_ARCHITECTURE_PROMPT,
  "integration": SF_INTEGRATION_PROMPT,
  "metadata-patterns": SF_METADATA_PATTERNS_PROMPT,
  "agentforce": AGENTFORCE_PROMPT,
  "data-cloud": DATA_CLOUD_PROMPT,
  "self-discovery": SELF_DISCOVERY_PROMPT,
  "unsupported-metadata": UNSUPPORTED_METADATA_PROMPT,
  "extensibility": EXTENSIBILITY_PROMPT,
};

export const sfKnowledgeTool = tool(
  async ({ topic }) => {
    // Support partial matching
    const key = Object.keys(KNOWLEDGE_MAP).find(
      k => k === topic || k.includes(topic) || topic.includes(k)
    );
    if (key) {
      return KNOWLEDGE_MAP[key]!;
    }
    // List available topics
    return `Topic "${topic}" not found. Available topics:\n${Object.keys(KNOWLEDGE_MAP).map(k => `  - ${k}`).join("\n")}`;
  },
  {
    name: "sf_knowledge",
    description: "Load deep Salesforce platform knowledge on a specific topic. Available topics: governor-limits, trigger-patterns, testing, flows, lwc, soql, api-strategy, deployment, apex-architecture, integration, metadata-patterns, agentforce, data-cloud, self-discovery, unsupported-metadata, extensibility. Use this when you need detailed guidance for a Salesforce task.",
    schema: z.object({
      topic: z.string().describe("The knowledge topic to load (e.g. 'apex-architecture', 'deployment', 'agentforce')"),
    }),
  }
);
