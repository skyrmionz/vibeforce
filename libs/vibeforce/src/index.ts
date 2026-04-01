/**
 * @vibeforce/core — Salesforce vibe coding agent library.
 *
 * Exports: tools, middleware, models, prompts, skills, docs, and the agent factory.
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { RunnableToolLike } from "@langchain/core/runnables";
import type { CompiledStateGraph } from "@langchain/langgraph";
import { allTools, coreTools } from "./tools/index.js";
import { loadSkills, getSkillSummaries } from "./skills/loader.js";
import { SELF_DISCOVERY_PROMPT } from "./prompts/self-discovery.js";
import { UNSUPPORTED_METADATA_PROMPT } from "./prompts/unsupported-metadata.js";
import { AGENTFORCE_PROMPT } from "./prompts/agentforce.js";
import { DATA_CLOUD_PROMPT } from "./prompts/datacloud.js";
import {
  ModelRegistry,
  loadModelConfig,
  type ModelConfig,
} from "./models/index.js";

// ── Tools ────────────────────────────────────────────────────────────────────
export {
  // Core tools
  coreTools,
  readFileTool,
  writeFileTool,
  editFileTool,
  executeTool,
  globTool,
  grepTool,
  lsTool,
  taskTool,
  // SF CLI
  runSfCommand,
  coreSfTools,
  allSfTools,
  // Discovery
  discoveryTools,
  SfListOrgsTool,
  SfGetOrgInfoTool,
  SfDescribeObjectTool,
  SfQueryTool,
  SfRunApexTool,
  SfDeployTool,
  SfRetrieveTool,
  SfDataTool,
  SfRunTestsTool,
  SfOrgLimitsTool,
  SfListMetadataTypesTool,
  SfDescribeAllSobjectsTool,
  SfListMetadataOfTypeTool,
  // Docs
  docsTools,
  SfDocsSearchTool,
  SfDocsReadTool,
  // Browser
  browserTools,
  browserOpen,
  browserClick,
  browserFill,
  browserScreenshot,
  browserExecute,
  browserClose,
  ensureBrowser,
  closeBrowser,
  authenticateBrowser,
  SETUP_PAGES,
  findSetupPage,
  // Agentforce
  agentforceTools,
  agentPublish,
  agentActivate,
  agentValidate,
  agentPreview,
  // Data Cloud
  dataCloudTools,
  dataCloudQueryTools,
  dataCloudIngestTools,
  dataCloudConfigTools,
  DcQueryTool,
  DcListObjectsTool,
  DcDescribeTool,
  DcIngestStreamingTool,
  DcIngestBulkTool,
  DcCreateIdentityResolutionTool,
  DcCreateSegmentTool,
  // Web tools
  webSearchTool,
  webFetchTool,
  webTools,
  // All tools combined
  allTools,
} from "./tools/index.js";
export type { SfCommandResult, SfCommandOptions } from "./tools/index.js";

// ── Middleware ────────────────────────────────────────────────────────────────
export {
  composeMiddleware,
  createPermissionsMiddleware,
  createDryRunMiddleware,
  createSnapshotMiddleware,
  createSnapshotBeforeDeploy,
  createAuditMiddleware,
  createPiiMiddleware,
  detectProductionOrg,
  resetOrgInfoCache,
  riskOf,
  TOOL_RISK_MAP,
  rollbackToLatest,
  detectPiiFields,
  isPiiField,
  maskPiiInRecords,
  // Summarization
  createSummarizationMiddleware,
  compactMessages,
  estimateTokens,
  estimateMessagesTokens,
  summarizeMessages,
  // Memory
  createMemoryMiddleware,
  readMemorySources,
  buildMemoryPrompt,
} from "./middleware/index.js";
export type {
  AuditEntry,
  AuditMiddlewareOptions,
  ConfirmFn,
  DryRunMiddlewareOptions,
  DryRunResult,
  Middleware,
  MemoryConfig,
  OrgInfo,
  PermissionMode,
  PermissionsMiddlewareOptions,
  PiiMiddlewareOptions,
  RiskLevel,
  SnapshotMiddlewareOptions,
  SummarizationConfig,
  ToolCall,
  ToolExecutor,
  ToolResult,
} from "./middleware/index.js";

// ── Models ───────────────────────────────────────────────────────────────────
export {
  ModelRegistry,
  loadModelConfig,
  resolveApiKey,
  getDefaultConfig,
  parseRawConfig,
  configFilePath,
  ensureConfigFile,
  readConfig,
  writeConfig,
  setDefaultModel,
  addProvider,
  removeProvider,
} from "./models/index.js";
export type { ModelProvider, ModelConfig, ModelInfo } from "./models/index.js";

// ── Skills ───────────────────────────────────────────────────────────────────
export {
  loadSkills,
  getSkillSummaries,
  findSkill,
  writeSkill,
} from "./skills/loader.js";
export type { Skill } from "./skills/loader.js";

// ── Prompts ──────────────────────────────────────────────────────────────────
export { SELF_DISCOVERY_PROMPT } from "./prompts/self-discovery.js";
export {
  UNSUPPORTED_METADATA_TYPES,
  UNSUPPORTED_METADATA_PROMPT,
  isUnsupportedMetadataType,
} from "./prompts/unsupported-metadata.js";
export type { UnsupportedMetadataType } from "./prompts/unsupported-metadata.js";
export { AGENTFORCE_PROMPT } from "./prompts/agentforce.js";
export { DATA_CLOUD_PROMPT } from "./prompts/datacloud.js";

// ── Sessions ────────────────────────────────────────────────────────────────
export {
  createSessionManager,
  appendMessage,
} from "./sessions/manager.js";
export type { Session, SessionManager } from "./sessions/manager.js";

// ── Context Detection ───────────────────────────────────────────────────────
export {
  detectProjectContext,
  buildContextPrompt,
} from "./context/detector.js";
export type { ProjectContext } from "./context/detector.js";

// ── Docs ─────────────────────────────────────────────────────────────────────
export { downloadDocs, DOC_SOURCES, DOCS_DIR } from "./docs/download-docs.js";

// ── Agent Factory ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Vibeforce, a Salesforce vibe coding agent. You help developers build, customize, and deploy Salesforce applications using natural language.

You have access to tools for reading files, writing files, editing files, executing shell commands, searching codebases, managing Salesforce orgs, browser automation, Agentforce agent building, and Data Cloud operations.

Key principles:
- Be direct and concise in your responses
- Use tools proactively — read files before editing, run commands to verify your work
- When making changes, explain what you're doing and why
- If a task is ambiguous, ask for clarification
- Always verify your changes compile/work when possible

You are running as a CLI agent on the user's machine with full filesystem and shell access.

## Salesforce Platform Knowledge

You are an expert on the Salesforce platform including:
- Apex (classes, triggers, tests)
- Lightning Web Components (LWC)
- Flows and Process Builder
- SOQL/SOSL queries
- Metadata API and source-based deployments
- Salesforce CLI (sf commands)
- Permission sets, profiles, and sharing rules
- Custom objects, fields, and relationships

${SELF_DISCOVERY_PROMPT}

${UNSUPPORTED_METADATA_PROMPT}

${AGENTFORCE_PROMPT}

${DATA_CLOUD_PROMPT}
`;

export interface CreateVibeforceAgentOptions {
  /** Additional tools beyond the built-in set */
  tools?: (StructuredToolInterface | RunnableToolLike)[];
  /** Model ID — "provider:model" format (default: uses config default) */
  model?: string;
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Custom system prompt (appended to default) */
  systemPrompt?: string;
  /** Path to skills directory (default: ./skills) */
  skillsDir?: string;
}

export interface VibeforceAgent {
  /** The compiled LangGraph agent */
  graph: CompiledStateGraph<any, any, any, any, any>;
  /** Stream a response for a user message */
  stream: (
    message: string
  ) => AsyncGenerator<VibeforceStreamEvent, void, unknown>;
}

export type VibeforceStreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; content: string }
  | { type: "done" }
  | { type: "error"; error: string };

/**
 * Create a Vibeforce agent with all tools and optional extras.
 */
export function createVibeforceAgent(
  options: CreateVibeforceAgentOptions = {}
): VibeforceAgent {
  const {
    tools: extraTools = [],
    model,
    apiKey,
    systemPrompt,
    skillsDir = "./skills",
  } = options;

  // Load model config and resolve the model
  const modelConfig = loadModelConfig();
  const registry = new ModelRegistry(modelConfig);
  const modelId = model ?? modelConfig.defaultModel;
  const llm = registry.getModel(modelId);

  // Combine all tools
  const combinedTools = [...allTools, ...extraTools];

  // Load skills and build prompt
  const skills = loadSkills(skillsDir);
  const skillsSummary = getSkillSummaries(skills);

  let prompt = SYSTEM_PROMPT;
  prompt += `\n\n## Available Skills\n\n${skillsSummary}`;
  if (systemPrompt) {
    prompt += `\n\n${systemPrompt}`;
  }

  const graph = createReactAgent({
    llm,
    tools: combinedTools,
    prompt,
  });

  async function* stream(
    message: string
  ): AsyncGenerator<VibeforceStreamEvent, void, unknown> {
    try {
      const eventStream = graph.streamEvents(
        { messages: [{ role: "user", content: message }] },
        { version: "v2" }
      );

      for await (const event of eventStream) {
        if (
          event.event === "on_chat_model_stream" &&
          event.data?.chunk?.content
        ) {
          const content = event.data.chunk.content;
          if (typeof content === "string") {
            yield { type: "token", content };
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (
                block.type === "text" &&
                typeof block.text === "string" &&
                block.text.length > 0
              ) {
                yield { type: "token", content: block.text };
              }
            }
          }
        } else if (event.event === "on_tool_start") {
          yield {
            type: "tool_call",
            name: event.name,
            args: event.data?.input ?? {},
          };
        } else if (event.event === "on_tool_end") {
          const output = event.data?.output;
          const content =
            typeof output === "string"
              ? output
              : output?.content ?? JSON.stringify(output);
          yield {
            type: "tool_result",
            name: event.name,
            content: typeof content === "string" ? content : String(content),
          };
        }
      }

      yield { type: "done" };
    } catch (err: any) {
      yield { type: "error", error: err.message ?? String(err) };
    }
  }

  return { graph, stream };
}
