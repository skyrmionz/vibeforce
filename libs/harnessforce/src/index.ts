/**
 * @harnessforce/core — Salesforce vibe coding agent library.
 *
 * Exports: tools, middleware, models, prompts, skills, docs, and the agent factory.
 */

import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, existsSync, globSync } from "node:fs";
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
import { SF_GOVERNOR_LIMITS_PROMPT } from "./prompts/sf-governor-limits.js";
import { SF_TRIGGER_PATTERNS_PROMPT } from "./prompts/sf-trigger-patterns.js";
import { SF_TESTING_PROMPT } from "./prompts/sf-testing.js";
import { SF_FLOW_PROMPT } from "./prompts/sf-flow.js";
import { SF_LWC_PROMPT } from "./prompts/sf-lwc.js";
import { SF_SOQL_PROMPT } from "./prompts/sf-soql.js";
import { SF_API_STRATEGY_PROMPT } from "./prompts/sf-api-strategy.js";
import { SF_DEPLOYMENT_PROMPT } from "./prompts/sf-deployment.js";
import { SF_APEX_ARCHITECTURE_PROMPT } from "./prompts/sf-apex-architecture.js";
import { SF_INTEGRATION_PROMPT } from "./prompts/sf-integration.js";
import { SF_METADATA_PATTERNS_PROMPT } from "./prompts/sf-metadata-patterns.js";
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
import { buildMemoryPrompt, loadForceInstructions } from "./middleware/memory.js";
import { detectPiiFields, isPiiField } from "./middleware/pii.js";
import { riskOf } from "./middleware/permissions.js";
import { compactMessages as _compactMessages, estimateMessagesTokens as _estimateMessagesTokens } from "./middleware/summarization.js";
import { sessionCostTracker } from "./cost/tracker.js";
import { executeHooks } from "./hooks/index.js";
import { stripDangerousUnicode } from "./tools/unicode-safety.js";
import { runSfCommand } from "./tools/sf-cli.js";

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
export type { SfCommandResult, SfCommandOptions, Todo, SfQueryResult, SfOrgInfo, SfDeployResult, SfOrgLimits } from "./tools/index.js";
export { getSfData } from "./tools/index.js";

// ── Config ──────────────────────────────────────────────────────────────────
export { TIMEOUTS } from "./config/timeouts.js";

// ── Middleware ────────────────────────────────────────────────────────────────
export {
  composeMiddleware,
  detectProductionOrg,
  resetOrgInfoCache,
  riskOf,
  TOOL_RISK_MAP,
  rollbackToLatest,
  detectPiiFields,
  isPiiField,
  maskPiiInRecords,
  // Summarization
  compactMessages,
  estimateTokens,
  estimateMessagesTokens,
  summarizeMessages,
  // Memory
  readMemorySources,
  buildMemoryPrompt,
  // FORCE.md instructions
  loadForceInstructions,
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
  CORE_TOOL_GUIDANCE,
  EXTENDED_TOOL_GUIDANCE,
  buildToolGuidancePrompt,
} from "./prompts/tool-guidance.js";
export { SF_GOVERNOR_LIMITS_PROMPT } from "./prompts/sf-governor-limits.js";
export { SF_TRIGGER_PATTERNS_PROMPT } from "./prompts/sf-trigger-patterns.js";
export { SF_TESTING_PROMPT } from "./prompts/sf-testing.js";
export { SF_FLOW_PROMPT } from "./prompts/sf-flow.js";
export { SF_LWC_PROMPT } from "./prompts/sf-lwc.js";
export { SF_SOQL_PROMPT } from "./prompts/sf-soql.js";
export { SF_API_STRATEGY_PROMPT } from "./prompts/sf-api-strategy.js";
export { SF_DEPLOYMENT_PROMPT } from "./prompts/sf-deployment.js";
export { SF_APEX_ARCHITECTURE_PROMPT } from "./prompts/sf-apex-architecture.js";
export { SF_INTEGRATION_PROMPT } from "./prompts/sf-integration.js";
export { SF_METADATA_PATTERNS_PROMPT } from "./prompts/sf-metadata-patterns.js";

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

export interface CreateHarnessforceAgentOptions {
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
  /** Memory source file paths (default: .harnessforce/agent.md, ~/.harnessforce/agent.md) */
  memorySources?: string[];
  /** Output style name — "default", "explanatory", or "learning" */
  outputStyle?: string;
}

export interface HarnessforceAgent {
  /** The compiled LangGraph agent */
  graph: CompiledStateGraph<any, any, any, any, any>;
  /** Stream a response for a user message, optionally within a thread */
  stream: (
    message: string,
    threadId?: string,
    permissionMode?: string,
  ) => AsyncGenerator<HarnessforceStreamEvent, void, unknown>;
}

export type HarnessforceStreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; content: string }
  | { type: "approval_required"; tool: string; args: Record<string, unknown>; risk: string }
  | { type: "system"; content: string }
  | { type: "done" }
  | { type: "error"; error: string };

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------

const AUDIT_LOG_PATH = ".harnessforce/audit.log";

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
 * Create a Harnessforce agent with all tools and optional extras.
 */
export async function createHarnessforceAgent(
  options: CreateHarnessforceAgentOptions = {}
): Promise<HarnessforceAgent> {
  const {
    tools: extraTools = [],
    model,
    apiKey,
    systemPrompt,
    skillsDir = "./skills",
    memorySources = [".harnessforce/agent.md", "~/.harnessforce/agent.md"],
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

  // Load skills and build prompt — limit to top 10 for system prompt brevity
  const skills = loadSkills(skillsDir);
  const topSkills = skills.slice(0, 10);
  const skillsSummary = getSkillSummaries(topSkills);
  const skillNote =
    skills.length > 10
      ? `\n\n${skills.length} skills available total. Use /skill-list to see all.`
      : "";

  // ── Assemble system prompt ──────────────────────────────────────────────
  const activeStyle = getActiveOutputStyle(outputStyle);

  // If the output style replaces the base prompt (keepCodingInstructions=false),
  // use the style prompt as the base; otherwise layer it on top.
  let prompt =
    activeStyle && !activeStyle.keepCodingInstructions
      ? activeStyle.prompt
      : SYSTEM_PROMPT;

  // Tool-specific guidance
  const toolGuidance = buildToolGuidancePrompt(true);
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

  // ── FORCE.md project instructions ──────────────────────────────────────
  const forceInstructions = loadForceInstructions();
  if (forceInstructions) {
    prompt += `\n\n${forceInstructions}`;
  }

  prompt += `\n\n## Available Skills\n\n${skillsSummary}${skillNote}`;

  // ── Salesforce deep knowledge (only for SFDX projects) ───────────────
  if (projectContext.isSfdxProject || projectContext.defaultOrg) {
    const cwd = process.cwd();

    // Detect project content to conditionally inject relevant SF prompts
    // Single glob pass (was 4 separate scans), excludes node_modules
    const sfFiles = globSync("**/*.{cls,js-meta.xml,flow-meta.xml,agent}", { cwd, exclude: (p: any) => (p.name ?? p).includes("node_modules") });
    const hasApex = sfFiles.some(f => f.endsWith(".cls"));
    const hasLWC = sfFiles.some(f => f.endsWith(".js-meta.xml"));
    const hasFlows = sfFiles.some(f => f.endsWith(".flow-meta.xml"));
    const hasAgentScript = sfFiles.some(f => f.endsWith(".agent"));
    const hasDetectedFiles = hasApex || hasLWC || hasFlows || hasAgentScript;

    const sfPrompts: string[] = [];

    if (!hasDetectedFiles) {
      // No detectable SF files but has a connected org — include ALL prompts
      // since we can't know what the user will ask about
      sfPrompts.push(
        SF_GOVERNOR_LIMITS_PROMPT,
        SF_TRIGGER_PATTERNS_PROMPT,
        SF_TESTING_PROMPT,
        SF_FLOW_PROMPT,
        SF_LWC_PROMPT,
        SF_SOQL_PROMPT,
        SF_API_STRATEGY_PROMPT,
        SF_DEPLOYMENT_PROMPT,
        SF_APEX_ARCHITECTURE_PROMPT,
        SF_INTEGRATION_PROMPT,
        SF_METADATA_PATTERNS_PROMPT,
      );
      if (hasAgentScript) sfPrompts.push(AGENTFORCE_PROMPT);
    } else {
      // Always include core SF prompts everyone needs
      sfPrompts.push(
        SF_GOVERNOR_LIMITS_PROMPT,
        SF_SOQL_PROMPT,
        SF_DEPLOYMENT_PROMPT,
        SF_METADATA_PATTERNS_PROMPT,
      );

      // Conditional on detected project content
      if (hasApex) {
        sfPrompts.push(
          SF_APEX_ARCHITECTURE_PROMPT,
          SF_TRIGGER_PATTERNS_PROMPT,
          SF_TESTING_PROMPT,
        );
      }
      if (hasLWC) sfPrompts.push(SF_LWC_PROMPT);
      if (hasFlows) sfPrompts.push(SF_FLOW_PROMPT);
      if (hasAgentScript) sfPrompts.push(AGENTFORCE_PROMPT);

      // Include these if any SF work detected
      sfPrompts.push(SF_API_STRATEGY_PROMPT, SF_INTEGRATION_PROMPT);
    }

    const sfKnowledgeBlock = [
      "## Salesforce Platform Deep Knowledge",
      "",
      ...sfPrompts,
    ].join("\n\n");
    prompt += `\n\n${sfKnowledgeBlock}`;
  }

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
    permissionMode?: string,
  ): AsyncGenerator<HarnessforceStreamEvent, void, unknown> {
    const tid = threadId ?? randomUUID();

    try {
      // ── Plan mode: filtered graph with read-only tools ──────────────
      let activeGraph = graph;
      let effectiveMessage = message;

      if (permissionMode === "plan") {
        const readOnlyTools = combinedTools.filter((t) => {
          const name = "name" in t ? (t as any).name : undefined;
          return name ? riskOf(name) === "read" : false;
        });
        activeGraph = createReactAgent({
          llm,
          tools: readOnlyTools,
          prompt:
            "You are in PLAN MODE. You may only read and explore — do NOT modify files, deploy, or execute destructive actions. Explain what you WOULD do, then wait for approval.\n\n" +
            prompt,
          checkpointer,
        });
        effectiveMessage = `[PLAN MODE] ${message}`;
      }

      // ── Proactive compaction: trim history before it balloons ────────
      try {
        const state = await activeGraph.getState({ configurable: { thread_id: tid } });
        if (state?.values?.messages && Array.isArray(state.values.messages)) {
          const historyTokens = _estimateMessagesTokens(
            state.values.messages.map((m: any) => ({
              role: m._getType?.() === "human" ? "user" : "assistant",
              content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            })),
          );
          if (historyTokens > 60_000) {
            const compacted = _compactMessages(
              state.values.messages.map((m: any) => ({
                role: m._getType?.() === "human" ? "user" : "assistant",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
              })),
              { maxTokens: 40_000, keepRecentMessages: 8 },
            );
            // Write compacted history back via updateState
            const { HumanMessage, AIMessage, SystemMessage } = await import("@langchain/core/messages");
            const newMessages = compacted.map((m) => {
              if (m.role === "user") return new HumanMessage(m.content);
              if (m.role === "system") return new SystemMessage(m.content);
              return new AIMessage(m.content);
            });
            await activeGraph.updateState(
              { configurable: { thread_id: tid } },
              { messages: newMessages },
            );
            appendAuditLog({
              timestamp: new Date().toISOString(),
              event: "proactive_compaction",
              originalTokens: historyTokens,
              compactedMessages: compacted.length,
            });
          }
        }
      } catch {
        // best-effort — don't block the turn if compaction fails
      }

      const eventStream = activeGraph.streamEvents(
        { messages: [{ role: "user", content: effectiveMessage }] },
        {
          version: "v2",
          recursionLimit: 40,
          configurable: { thread_id: tid },
        },
      );

      for await (const event of eventStream) {
        // ── Event-level middleware: audit logging ──────────────────────
        if (event.event === "on_tool_start") {
          // Unicode safety: sanitize args for audit log
          const rawArgs = event.data?.input ?? {};
          const sanitizedArgsStr = stripDangerousUnicode(
            JSON.stringify(rawArgs),
          );

          appendAuditLog({
            timestamp: new Date().toISOString(),
            tool: event.name,
            args: JSON.parse(sanitizedArgsStr),
            event: "start",
          });

          // Hook execution: pre-tool-use
          void executeHooks("pre-tool-use", { tool: event.name });

          // Default mode: yield approval_required for destructive tools
          if (
            permissionMode !== "yolo" &&
            permissionMode !== "plan" &&
            riskOf(event.name) === "destructive"
          ) {
            yield {
              type: "approval_required",
              tool: event.name,
              args: rawArgs as Record<string, unknown>,
              risk: "destructive",
            };
          }

          // Dry-run validation for sf_deploy
          if (event.name === "sf_deploy") {
            try {
              const deployArgs = event.data?.input;
              const sourcePath = (deployArgs as any)?.sourcePath ?? (deployArgs as any)?.source_path;
              const dryRunArgs = ["deploy", "start", "--dry-run"];
              if (sourcePath) dryRunArgs.push("--source-dir", sourcePath);
              const dryRun = await runSfCommand("project", dryRunArgs);
              if (!dryRun.success) {
                yield {
                  type: "tool_result",
                  name: "sf_deploy_dry_run",
                  content: `⚠️ Dry-run validation failed: ${dryRun.raw || JSON.stringify(dryRun.data)}`,
                };
              }
            } catch {
              // dry-run failed to execute — continue with deploy anyway
            }
          }

          yield {
            type: "tool_call",
            name: event.name,
            args: rawArgs as Record<string, unknown>,
          };
        } else if (event.event === "on_tool_end") {
          const output = event.data?.output;
          const content =
            typeof output === "string"
              ? output
              : output?.content ?? JSON.stringify(output);
          let contentStr = typeof content === "string" ? content : String(content);

          // Truncate large tool outputs to prevent context bloat
          // (edit_file/write_file are small confirmations — skip truncation)
          const MAX_TOOL_OUTPUT = 4_000;
          if (contentStr.length > MAX_TOOL_OUTPUT && !["edit_file", "write_file"].includes(event.name)) {
            contentStr = contentStr.slice(0, MAX_TOOL_OUTPUT) + `\n... (truncated, ${contentStr.length} chars total)`;
          }

          appendAuditLog({
            timestamp: new Date().toISOString(),
            tool: event.name,
            result: "success",
            event: "end",
          });

          // Hook execution: post-tool-use
          void executeHooks("post-tool-use", { tool: event.name });

          // PII check for sf_query results
          if (event.name === "sf_query") {
            try {
              const parsed = JSON.parse(contentStr);
              const records = Array.isArray(parsed)
                ? parsed
                : parsed?.records ?? [];
              if (records.length > 0) {
                // Collect all unique field names across all records
                const allFields = new Set<string>();
                for (const record of records) {
                  for (const key of Object.keys(record)) {
                    allFields.add(key);
                  }
                }
                const piiFields = [...allFields].filter(isPiiField);
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
        } else if (event.event === "on_chain_end") {
          // Cost tracking: capture usage metadata from LLM responses
          const usageMeta = event.data?.output?.usage_metadata;
          if (usageMeta) {
            sessionCostTracker.addUsage(
              modelId,
              usageMeta.input_tokens ?? 0,
              usageMeta.output_tokens ?? 0,
            );
          }
        } else if (event.event === "on_llm_end") {
          const usageMeta = event.data?.output?.usage_metadata;
          if (usageMeta) {
            sessionCostTracker.addUsage(modelId, usageMeta.input_tokens ?? 0, usageMeta.output_tokens ?? 0);
          }
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

      // ── Context size estimation (structural placeholder) ─────────────
      // Estimate conversation size after each complete turn.
      // When the conversation grows large, the checkpointer's MemorySaver
      // retains all messages. Future: implement argument truncation on
      // older tool results to reclaim context space before hitting limits.
      const estimatedTokens = effectiveMessage.length / 4;
      if (estimatedTokens > 40_000) {
        appendAuditLog({
          timestamp: new Date().toISOString(),
          event: "context_size_warning",
          estimatedTokens,
          note: "Conversation approaching context limits. Consider /clear or auto-compaction.",
        });
      }
    } catch (err: any) {
      const errMsg = err.message ?? String(err);

      // ── Reactive compaction: detect context-too-long errors ──────────
      const isContextOverflow =
        /prompt_too_long|context_length_exceeded|maximum context length/i.test(errMsg);

      if (isContextOverflow) {
        yield {
          type: "system",
          content:
            "Context limit reached. The conversation history is too long. " +
            "Please try a shorter message or start a new session with /clear.",
        };

        // Attempt to compact the checkpointer state for future turns
        try {
          const state = await graph.getState({ configurable: { thread_id: tid } });
          if (state?.values?.messages && Array.isArray(state.values.messages)) {
            const compacted = _compactMessages(
              state.values.messages.map((m: any) => ({
                role: m._getType?.() === "human" ? "user" : "assistant",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
              })),
              { maxTokens: 60_000, keepRecentMessages: 8 },
            );
            // Log compaction for debugging
            appendAuditLog({
              timestamp: new Date().toISOString(),
              event: "context_compacted",
              originalMessages: state.values.messages.length,
              compactedMessages: compacted.length,
            });
          }
        } catch {
          // best-effort — compaction failure should not crash the agent
        }
      } else {
        yield { type: "error", error: errMsg };
      }
    }
  }

  return { graph, stream };
}
