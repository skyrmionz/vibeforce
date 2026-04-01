/**
 * Per-tool guidance prompts — appended to the system prompt so the agent
 * knows best practices for each tool it has access to.
 */

export const TOOL_GUIDANCE: Record<string, string> = {
  execute: `### execute (shell)
- Always quote paths with spaces.
- Run from the working directory — use absolute paths, avoid \`cd\`.
- For verbose output, use quiet flags or redirect to a temp file and inspect with read_file.
- Prefer \`sf\` CLI commands for Salesforce operations.
- When running tests: \`sf apex run test --synchronous --code-coverage --json\`.`,

  sf_query: `### sf_query
- Use SOQL best practices: always include a WHERE clause or LIMIT on large objects.
- Respect governor limits — query only fields you need.
- Use relationship queries (\`Account.Name\`) instead of separate queries when possible.
- For aggregate queries, use GROUP BY with HAVING for filtering.
- Results are subject to PII middleware — sensitive fields may be masked.`,

  sf_deploy: `### sf_deploy
- Always run \`sf project deploy start --dry-run\` first for production orgs.
- Include \`--json\` flag for parseable output.
- After deploy, run relevant tests to verify: \`sf apex run test\`.
- For partial deploys, use \`--source-dir\` to target specific directories.
- Check deploy status with the returned job ID if async.`,

  browser_open: `### browser_open
- Use for Salesforce Setup pages that cannot be configured via Metadata API.
- Always authenticate first if not already logged in.
- Prefer URL-based navigation to Setup pages over clicking through menus.
- Setup URL pattern: \`/lightning/setup/<SetupPage>/home\`.`,

  browser_execute: `### browser_execute
- Essential for Lightning Shadow DOM — use \`shadowRoot.querySelector()\` chains.
- Pattern: \`document.querySelector('one-app-nav-bar').shadowRoot.querySelector(...)\`.
- Always wrap in try/catch and return meaningful results.
- Use for reading page state, filling shadow DOM inputs, and clicking shadow DOM buttons.`,

  dc_query: `### dc_query (Data Cloud)
- Use Data Cloud SQL syntax, not SOQL.
- Prefix table names with the correct namespace and suffix (\`__dll\`, \`__dlm\`).
- JOIN is supported — use it for cross-object analysis.
- Results can be large — use LIMIT and OFFSET for pagination.`,

  agent_publish: `### agent_publish
- Publishes an Agentforce agent to the org.
- Always validate the agent bundle before publishing.
- Requires the agent to be activated after publishing for end-user access.
- Check for missing action targets before publish — use discovery tools.`,

  read_file: `### read_file
- Always use absolute paths.
- Start with \`limit=100\` when exploring unfamiliar files.
- Use offset+limit for targeted reads of large files.
- Read files BEFORE editing — never edit blind.`,

  write_file: `### write_file
- Creates or overwrites entire files. Prefer edit_file for modifications.
- Read the file first if it exists — this tool will overwrite without merge.
- Use for new files or complete rewrites only.`,

  edit_file: `### edit_file
- Requires reading the file first — will fail otherwise.
- Provide a unique old_string with enough context to match exactly once.
- Preserve exact indentation from the file.
- Use replace_all for renaming variables or strings across the file.`,

  glob: `### glob
- Use glob patterns: \`**/*.cls\` for Apex classes, \`**/*.js\` for LWC.
- Faster than shell find — use this instead.
- Good first step when exploring a codebase.`,

  grep: `### grep
- Supports full regex syntax.
- Use \`type\` parameter for language-specific searches (e.g., type="apex").
- Use \`output_mode="content"\` to see matching lines with context.
- Use \`output_mode="files_with_matches"\` to find which files match.`,

  web_search: `### web_search
- Search for Salesforce documentation, error solutions, and code examples.
- Synthesize results into a coherent answer — never show raw JSON to the user.
- Cite sources by mentioning page titles or URLs when relevant.`,
};

/**
 * Build a combined tool guidance section for the system prompt.
 * Only includes guidance for tools that are listed.
 */
export function buildToolGuidancePrompt(
  toolNames?: string[],
): string {
  const entries = toolNames
    ? Object.entries(TOOL_GUIDANCE).filter(([k]) => toolNames.includes(k))
    : Object.entries(TOOL_GUIDANCE);

  if (entries.length === 0) return "";

  const sections = entries.map(([, v]) => v).join("\n\n");
  return `## Tool-Specific Guidance\n\n${sections}`;
}
