/**
 * Tool exports for Harnessforce agent.
 */

// ── Core filesystem & shell tools ──────────────────────────────────────────
export { readFileTool } from "./read-file.js";
export { writeFileTool } from "./write-file.js";
export { editFileTool } from "./edit-file.js";
export { executeTool } from "./execute.js";
export { globTool } from "./glob.js";
export { grepTool } from "./grep.js";
export { lsTool } from "./ls.js";
export { taskTool } from "./task.js";

import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { executeTool } from "./execute.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { lsTool } from "./ls.js";
import { taskTool } from "./task.js";

/** All 8 core filesystem/shell tools */
export const coreTools = [
  readFileTool,
  writeFileTool,
  editFileTool,
  executeTool,
  globTool,
  grepTool,
  lsTool,
  taskTool,
];

// ── Salesforce CLI tools ───────────────────────────────────────────────────
export { runSfCommand, getSfData } from "./sf-cli.js";
export type {
  SfCommandResult,
  SfCommandOptions,
  SfQueryResult,
  SfOrgInfo,
  SfDeployResult,
  SfOrgLimits,
} from "./sf-cli.js";

export {
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
  SfGetTestResultsTool,
  SfGetDebugLogTool,
  coreSfTools,
} from "./salesforce.js";

export {
  SfListMetadataTypesTool,
  SfDescribeAllSobjectsTool,
  SfListMetadataOfTypeTool,
  discoveryTools,
} from "./discovery.js";

export {
  SfScratchOrgCreateTool,
  SfScratchOrgDeleteTool,
  SfScratchOrgListTool,
  SfPackageCreateTool,
  SfPackageVersionCreateTool,
  SfPackageInstallTool,
  SfDeployStatusTool,
  SfDeployCancelTool,
  SfTestCoverageTool,
  SfDataExportTool,
  SfSandboxCreateTool,
  SfEventLogTool,
  extendedSfTools,
} from "./sf-extended.js";

import { coreSfTools } from "./salesforce.js";
import { discoveryTools } from "./discovery.js";
import { extendedSfTools } from "./sf-extended.js";

/** All Salesforce tools combined (core SF + discovery + extended). */
export const allSfTools = [...coreSfTools, ...discoveryTools, ...extendedSfTools];

// ── Documentation tools ──────────────────────────────────────────────────
export { SfDocsSearchTool, SfDocsReadTool, docsTools } from "./docs.js";

import { docsTools } from "./docs.js";

// ── Browser automation tools ─────────────────────────────────────────────
export {
  browserTools,
  browserOpen,
  browserClick,
  browserFill,
  browserScreenshot,
  browserExecute,
  browserClose,
  ensureBrowser,
  closeBrowser,
} from "./browser.js";
export { authenticateBrowser } from "./browser-auth.js";
export { SETUP_PAGES, findSetupPage } from "./setup-pages.js";

import { browserTools } from "./browser.js";

// ── Agentforce tools ─────────────────────────────────────────────────────
export {
  agentforceTools,
  agentPublish,
  agentActivate,
  agentValidate,
  agentPreview,
} from "./agentforce.js";

import { agentforceTools } from "./agentforce.js";

// ── Data Cloud tools ─────────────────────────────────────────────────────
export {
  DcQueryTool,
  DcListObjectsTool,
  DcDescribeTool,
  dataCloudQueryTools,
} from "./datacloud.js";

export {
  DcIngestStreamingTool,
  DcIngestBulkTool,
  dataCloudIngestTools,
} from "./datacloud-ingest.js";

export {
  DcCreateIdentityResolutionTool,
  DcCreateSegmentTool,
  dataCloudConfigTools,
} from "./datacloud-config.js";

import { dataCloudQueryTools } from "./datacloud.js";
import { dataCloudIngestTools } from "./datacloud-ingest.js";
import { dataCloudConfigTools } from "./datacloud-config.js";

/** All 7 Data Cloud tools combined. */
export const dataCloudTools = [
  ...dataCloudQueryTools,
  ...dataCloudIngestTools,
  ...dataCloudConfigTools,
];

// ── Web tools ───────────────────────────────────────────────────────────
export { webSearchTool, webFetchTool, webTools } from "./web-search.js";

import { webTools } from "./web-search.js";

// ── Todo / planning tools ───────────────────────────────────────────────
export { writeTodosTool, getTodos, resetTodos } from "./todos.js";
export type { Todo } from "./todos.js";

import { writeTodosTool } from "./todos.js";

// ── SF Knowledge (lazy-loaded prompts) ──────────────────────────────────
export { sfKnowledgeTool } from "./sf-knowledge.js";

import { sfKnowledgeTool } from "./sf-knowledge.js";

// ── Subagent system ─────────────────────────────────────────────────────
export { agentSpawnTool, initSubagentSystem } from "./agent-spawn.js";

import { agentSpawnTool } from "./agent-spawn.js";

// ── Concurrent execution ────────────────────────────────────────────────
export { executeConcurrently, isConcurrentSafe } from "./concurrent-executor.js";

// ── Unicode safety ──────────────────────────────────────────────────────
export { stripDangerousUnicode, hasDangerousUnicode } from "./unicode-safety.js";

// ── Combined ─────────────────────────────────────────────────────────────

import type { StructuredToolInterface } from "@langchain/core/tools";

/** All tools combined (core + SF + docs + browser + agentforce + data cloud + web + todos + knowledge). */
export const allTools: StructuredToolInterface[] = [
  ...coreTools,
  ...coreSfTools,
  ...discoveryTools,
  ...extendedSfTools,
  ...docsTools,
  ...browserTools,
  ...agentforceTools,
  ...dataCloudTools,
  ...webTools,
  writeTodosTool,
  sfKnowledgeTool,
  agentSpawnTool,
] as StructuredToolInterface[];
