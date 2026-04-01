/**
 * Tool exports for VibeForce agent.
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
export { runSfCommand } from "./sf-cli.js";
export type { SfCommandResult, SfCommandOptions } from "./sf-cli.js";

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
  coreSfTools,
} from "./salesforce.js";

export {
  SfListMetadataTypesTool,
  SfDescribeAllSobjectsTool,
  SfListMetadataOfTypeTool,
  discoveryTools,
} from "./discovery.js";

import { coreSfTools } from "./salesforce.js";
import { discoveryTools } from "./discovery.js";

/** All 13 Salesforce tools combined (core SF + discovery). */
export const allSfTools = [...coreSfTools, ...discoveryTools];

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

// ── Combined ─────────────────────────────────────────────────────────────

import type { StructuredToolInterface } from "@langchain/core/tools";

/** All tools combined (core + SF + docs + browser + agentforce + data cloud). */
export const allTools: StructuredToolInterface[] = [
  ...coreTools,
  ...coreSfTools,
  ...discoveryTools,
  ...docsTools,
  ...browserTools,
  ...agentforceTools,
  ...dataCloudTools,
] as StructuredToolInterface[];
