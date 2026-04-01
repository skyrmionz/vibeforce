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
import { SYSTEM_PROMPT } from "./prompts/system.js";
import { buildToolGuidancePrompt } from "./prompts/tool-guidance.js";
import {
  getActiveOutputStyle,
  type OutputStyleConfig,
} from "./prompts/output-styles.js";
import {
  ModelRegistry,
  loadModelConfig,
  type ModelConfig,
} from "./models/index.js";
import {
  detectProjectContext,
  buildContextPrompt,
  type ProjectContext,
} from "./context/detector.js";
import { buildMemoryPrompt } from "./middleware/memory.js";
import { createAuditMiddleware } from "./middleware/audit.js";
import { createPiiMiddleware } from "./middleware/pii.js";
import { composeMiddleware } from "./middleware/index.js";
import type { Middleware, ToolCall, ToolExecutor, ToolResult } from "./middleware/types.js";

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
  // Todos
  writeTodosTool,
  getTodos,
  resetTodos,
  // Unicode safety
  stripDangerousUnicode,
  hasDangerousUnicode,
  // All tools combined
  allTools,
} from "./tools/index.js";
export type { SfCommandResult, SfCommandOptions, Todo } from "./tools/index.js";

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
export { SYSTEM_PROMPT } from "./prompts/system.js";
export { SELF_DISCOVERY_PROMPT } from "./prompts/self-discovery.js";
export {
  UNSUPPORTED_METADATA_TYPES,
  UNSUPPORTED_METADATA_PROMPT,
  isUnsupportedMetadataType,
} from "./prompts/unsupported-metadata.js";
export type { UnsupportedMetadataType } from "./prompts/unsupported-metadata.js";
export { AGENTFORCE_PROMPT } from "./prompts/agentforce.js";
export { DATA_CLOUD_PROMPT } from "./prompts/datacloud.js";
export {
  OUTPUT_STYLES,
  loadCustomOutputStyles,
  getActiveOutputStyle,
} from "./prompts/output-styles.js";
export type { OutputStyleConfig } from "./prompts/output-styles.js";
export {
  TOOL_GUIDANCE,
  buildToolGuidancePrompt,
} from "./prompts/tool-guidance.js";

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

// ── Cost Tracking ──────────────────────────────────────────────────────────
export { sessionCostTracker, CostTracker } from "./cost/tracker.js";

// ── File History ───────────────────────────────────────────────────────────
export {
  saveFileVersion,
  getFileHistory,
  restoreLastVersion,
  trackEditedFile,
  getLastEditedFile,
} from "./tools/file-history.js";

// ── Hooks ──────────────────────────────────────────────────────────────────
export { loadHooks, executeHooks } from "./hooks/index.js";
export type { HookConfig, HookEvent } from "./hooks/manager.js";

// ── Bash Safety ──────────────────────────────────────────────────────────
export { checkBashSafety } from "./tools/bash-safety.js";
export type { SafetyCheck } from "./tools/bash-safety.js";

// ── Editor ──────────────────────────────────────────────────────────────────
export { resolveEditor, openInEditor } from "./editor.js";

// ── Docs ─────────────────────────────────────────────────────────────────────
export { downloadDocs, DOC_SOURCES, DOCS_DIR } from "./docs/download-docs.js";

// ── Agent Factory ────────────────────────────────────────────────────────────

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
  /** Pre-detected project context (auto-detected if not provided) */
  projectContext?: ProjectContext;
  /** Memory source file paths (default: .vibeforce/agent.md, ~/.vibeforce/agent.md) */
  memorySources?: string[];
  /** Output style name — "default", "explanatory", or "learning" */
  outputStyle?: string;
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

// ---------------------------------------------------------------------------
// Middleware wiring helper
// ---------------------------------------------------------------------------

/**
 * Wrap a LangChain tool's `_call` with a middleware stack.
 *
 * The middleware stack receives a ToolCall / ToolResult representation and
 * delegates to the original `_call` as the innermost executor.
 */
function wrapToolWithMiddleware(
  t: StructuredToolInterface | RunnableToolLike,
  middlewareStack: Middleware[],
): typeof t {
  // Only wrap tools that expose a mutable _call (StructuredTool instances)
  const st = t as StructuredToolInterface & {
    _call?: (...args: any[]) => Promise<any>;
    name: string;
  };
  if (typeof st._call !== "function") return t;

  const original = st._call.bind(st);

  const executor: ToolExecutor = async (call: ToolCall): Promise<ToolResult> => {
    try {
      const data = await original(call.args);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message ?? String(err) };
    }
  };

  const composed = composeMiddleware(middlewareStack, executor);

  st._call = async (input: any) => {
    const result = await composed({ name: st.name, args: input as Record<string, unknown> });
    if (!result.success) throw new Error(result.error ?? "Tool execution failed");
    return result.data;
  };

  return t;
}

/**
 * Create a Vibeforce agent with all tools and optional extras.
 */
export async function createVibeforceAgent(
  options: CreateVibeforceAgentOptions = {}
): Promise<VibeforceAgent> {
  const {
    tools: extraTools = [],
    model,
    apiKey,
    systemPrompt,
    skillsDir = "./skills",
    memorySources = [".vibeforce/agent.md", "~/.vibeforce/agent.md"],
    outputStyle,
  } = options;

  // Load model config and resolve the model
  const modelConfig = loadModelConfig();
  const registry = new ModelRegistry(modelConfig);
  const modelId = model ?? modelConfig.defaultModel;
  const llm = registry.getModel(modelId);

  // ── Context detection ───────────────────────────────────────────────────
  const projectContext =
    options.projectContext ?? (await detectProjectContext(process.cwd()));
  const contextBlock = buildContextPrompt(projectContext);

  // ── Memory ──────────────────────────────────────────────────────────────
  const memoryBlock = buildMemoryPrompt(memorySources);

  // ── Middleware stacks ───────────────────────────────────────────────────
  const auditMw = createAuditMiddleware({
    logPath: ".vibeforce/audit.jsonl",
  });
  const piiMw = createPiiMiddleware({
    confirm: async () => true, // auto-confirm in agent mode; TUI overrides
  });

  // Combine all tools and wrap with middleware
  const combinedTools = [...allTools, ...extraTools].map((t) => {
    const toolName = (t as { name?: string }).name ?? "";

    // PII middleware only for sf_query
    const stack: Middleware[] =
      toolName === "sf_query" ? [auditMw, piiMw] : [auditMw];

    return wrapToolWithMiddleware(t, stack);
  });

  // Load skills and build prompt
  const skills = loadSkills(skillsDir);
  const skillsSummary = getSkillSummaries(skills);

  // ── Assemble system prompt ──────────────────────────────────────────────
  const activeStyle = getActiveOutputStyle(outputStyle);

  // If the output style replaces the base prompt (keepCodingInstructions=false),
  // use the style prompt as the base; otherwise layer it on top.
  let prompt =
    activeStyle && !activeStyle.keepCodingInstructions
      ? activeStyle.prompt
      : SYSTEM_PROMPT;

  // Tool-specific guidance
  const toolGuidance = buildToolGuidancePrompt();
  if (toolGuidance) {
    prompt += `\n\n${toolGuidance}`;
  }

  // Output style overlay (when keepCodingInstructions is true)
  if (activeStyle?.keepCodingInstructions) {
    prompt += `\n\n${activeStyle.prompt}`;
  }

  if (contextBlock) {
    prompt += `\n\n${contextBlock}`;
  }
  if (memoryBlock) {
    prompt += `\n\n${memoryBlock}`;
  }
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
        { version: "v2", recursionLimit: 100 }
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
