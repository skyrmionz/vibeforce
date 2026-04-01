/**
 * @vibeforce/core — Salesforce vibe coding agent library.
 *
 * Exports: tools, middleware, models, prompts, skills, docs, and the agent factory.
 */

import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { RunnableToolLike } from "@langchain/core/runnables";
import { MemorySaver, type CompiledStateGraph } from "@langchain/langgraph";
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
import { detectPiiFields } from "./middleware/pii.js";

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
  /** Stream a response for a user message, optionally within a thread */
  stream: (
    message: string,
    threadId?: string,
  ) => AsyncGenerator<VibeforceStreamEvent, void, unknown>;
}

export type VibeforceStreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; content: string }
  | { type: "done" }
  | { type: "error"; error: string };

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------

const AUDIT_LOG_PATH = ".vibeforce/audit.log";

function appendAuditLog(entry: Record<string, unknown>): void {
  try {
    const dir = dirname(AUDIT_LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // best-effort — never crash the agent loop over logging
  }
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

  // Combine all tools (raw — middleware is handled at event-stream level)
  const combinedTools = [...allTools, ...extraTools];

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

  // ── Checkpointer (replaces manual conversationHistory) ──────────────────
  const checkpointer = new MemorySaver();

  const graph = createReactAgent({
    llm,
    tools: combinedTools,
    prompt,
    checkpointer,
  });

  async function* stream(
    message: string,
    threadId?: string,
  ): AsyncGenerator<VibeforceStreamEvent, void, unknown> {
    const tid = threadId ?? randomUUID();

    try {
      const eventStream = graph.streamEvents(
        { messages: [{ role: "user", content: message }] },
        {
          version: "v2",
          recursionLimit: 100,
          configurable: { thread_id: tid },
        },
      );

      for await (const event of eventStream) {
        // ── Event-level middleware: audit logging ──────────────────────
        if (event.event === "on_tool_start") {
          appendAuditLog({
            timestamp: new Date().toISOString(),
            tool: event.name,
            args: event.data?.input ?? {},
            event: "start",
          });

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
          const contentStr = typeof content === "string" ? content : String(content);

          appendAuditLog({
            timestamp: new Date().toISOString(),
            tool: event.name,
            result: "success",
            event: "end",
          });

          // PII check for sf_query results
          if (event.name === "sf_query") {
            try {
              const parsed = JSON.parse(contentStr);
              const records = Array.isArray(parsed)
                ? parsed
                : parsed?.records ?? [];
              if (records.length > 0) {
                const piiFields = detectPiiFields(records[0]);
                if (piiFields.length > 0) {
                  yield {
                    type: "tool_result",
                    name: event.name,
                    content: `⚠️ PII fields detected: ${piiFields.join(", ")}. ${contentStr}`,
                  };
                  continue;
                }
              }
            } catch {
              // not JSON — fall through to normal yield
            }
          }

          yield {
            type: "tool_result",
            name: event.name,
            content: contentStr,
          };
        } else if (
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
        }
      }

      yield { type: "done" };
    } catch (err: any) {
      yield { type: "error", error: err.message ?? String(err) };
    }
  }

  return { graph, stream };
}
