/** Centralized timeout constants (milliseconds) */
export const TIMEOUTS = {
  /** npm version check on startup */
  NPM_CHECK: 5_000,
  /** SF org list on startup */
  ORG_LIST: 10_000,
  /** Default sf CLI command timeout */
  SF_DEFAULT: 60_000,
  /** grep/search operations */
  SEARCH: 30_000,
  /** Browser operations */
  BROWSER: 10_000,
  /** Browser auth flow */
  BROWSER_AUTH: 30_000,
  /** Data Cloud queries */
  DATA_CLOUD: 120_000,
  /** Context detection */
  CONTEXT_DETECT: 10_000,
  /** Shell command from ! prefix */
  SHELL: 30_000,
  /** SF deploy operations */
  SF_DEPLOY: 600_000,
  /** Package version create */
  PACKAGE_VERSION: 300_000,
  /** Sandbox creation */
  SANDBOX: 600_000,
} as const;
