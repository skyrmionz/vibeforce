/**
 * Browser automation tools — VibeForce Feature 5
 *
 * Exports:
 * - browserTools: Array of 6 LangChain StructuredTools for Playwright automation
 * - authenticateBrowser: Helper to log into Salesforce via front door link
 * - SETUP_PAGES / findSetupPage: Map of common Salesforce Setup page URLs
 */

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
