/**
 * Per-tool guidance prompts — appended to the system prompt so the agent
 * knows best practices for each tool it has access to.
 *
 * Each entry provides 5-10 lines of deep guidance: when to use, pitfalls,
 * best practices, and example patterns.
 */

export const TOOL_GUIDANCE: Record<string, string> = {
  // ── Core Filesystem & Shell ──────────────────────────────────────────────

  read_file: `### read_file
- **When to use:** Reading file contents before editing, exploring unfamiliar code, reviewing generated output.
- **vs alternatives:** Prefer over \`execute("cat ...")\` — read_file respects sandboxing and provides line numbers.
- **Common pitfalls:** Reading huge files without limit/offset wastes context. Start with \`limit=100\` for exploration.
- **Best practices:**
  - Always use absolute paths — relative paths resolve unpredictably.
  - Use offset+limit for targeted reads of large files (e.g., offset=50, limit=30 to read lines 50-80).
  - Read files BEFORE editing — never edit blind. The edit_file tool will fail if you have not read first.
  - For binary files, use \`ls -la\` to check size first.
- **Example:** Read the first 100 lines of a class: \`read_file({ path: "/force-app/main/default/classes/AccountService.cls", limit: 100 })\``,

  write_file: `### write_file
- **When to use:** Creating brand new files, or complete rewrites where >80% of the file changes.
- **vs alternatives:** Prefer edit_file for modifications — write_file overwrites the entire file with no merge.
- **Common pitfalls:**
  - Overwrites without warning — always read the file first if it exists.
  - Forgetting to include unchanged portions of the file (everything not in your content is lost).
  - Creating files in wrong directories — verify the path exists with ls first.
- **Best practices:**
  - Use for new files or complete rewrites only.
  - Include proper file headers (Apex: class/method docs, LWC: JSDoc, XML: namespace declarations).
  - For Apex classes, always include the API version in the corresponding -meta.xml.
  - Verify the directory exists before writing — use \`ls\` or \`glob\` first.
- **Example:** Create a new Apex class with proper structure and matching meta.xml.`,

  edit_file: `### edit_file
- **When to use:** Modifying existing files — adding methods, fixing bugs, updating logic.
- **vs alternatives:** Prefer over write_file for any partial modification. Use write_file only for complete rewrites.
- **Common pitfalls:**
  - Must read the file first — the tool enforces this and will fail otherwise.
  - old_string must be unique in the file — if it matches multiple locations, the edit fails.
  - Indentation mismatch — preserve exact whitespace (tabs vs spaces) from the file.
  - Providing too little context in old_string — include surrounding lines to ensure uniqueness.
- **Best practices:**
  - Include 2-3 surrounding lines in old_string for uniqueness.
  - Preserve exact indentation from the original file.
  - Use replace_all=true for renaming variables or strings across the entire file.
  - After editing, consider reading the file again to verify the result.
- **Example:** Add a method to a class by matching the closing brace and inserting before it.`,

  execute: `### execute (shell)
- **When to use:** Running CLI commands, build tools, test suites, git operations, sf CLI commands.
- **vs alternatives:** Prefer dedicated sf_* tools for Salesforce operations — they handle JSON parsing and error formatting.
- **Common pitfalls:**
  - Commands that hang (interactive prompts, editors) — always use non-interactive flags.
  - Long-running commands without timeout — set reasonable timeouts.
  - Forgetting to quote paths with spaces.
  - Using \`cd\` instead of absolute paths — working directory resets between calls.
- **Best practices:**
  - Always quote paths with spaces: \`"path with spaces/file.txt"\`.
  - Use absolute paths — avoid \`cd\` as the working directory may not persist.
  - For verbose output, redirect to a temp file and inspect with read_file.
  - Prefer \`sf\` CLI commands for Salesforce operations.
  - When running tests: \`sf apex run test --synchronous --code-coverage --json\`.
  - Add \`--json\` flag to sf commands for parseable output.
  - Chain commands with \`&&\` for sequential execution.
- **Example:** \`execute({ command: "sf apex run test --synchronous --code-coverage --test-level RunLocalTests --json" })\``,

  glob: `### glob
- **When to use:** Finding files by name pattern — first step when exploring a codebase or locating specific file types.
- **vs alternatives:** Faster than \`execute("find ...")\` — use glob for file discovery, grep for content search.
- **Common pitfalls:**
  - Overly broad patterns returning thousands of results — add directory prefixes to narrow scope.
  - Forgetting ** for recursive search — \`*.cls\` only matches current directory, \`**/*.cls\` is recursive.
- **Best practices:**
  - Use \`**/*.cls\` for Apex classes, \`**/*.trigger\` for triggers, \`**/*.js\` for LWC JavaScript.
  - Combine with directory prefixes: \`force-app/**/*.cls\` to scope to source directory.
  - Use for initial exploration before targeted reads.
  - Common SFDX patterns: \`**/classes/*.cls\`, \`**/lwc/**/*.js\`, \`**/triggers/*.trigger\`.
  - Use \`**/*-meta.xml\` to find metadata descriptors.
- **Example:** Find all Apex test classes: \`glob({ pattern: "**/*Test.cls" })\``,

  grep: `### grep
- **When to use:** Searching file contents — finding references, tracking down usage, locating string patterns.
- **vs alternatives:** Use glob for file name patterns, grep for content search. Grep is faster than execute("grep ...").
- **Common pitfalls:**
  - Overly broad patterns returning too many matches — use type filter and glob parameter to narrow scope.
  - Forgetting regex escaping — literal dots, brackets need escaping.
  - Not using output_mode parameter — defaults to files_with_matches which only shows paths.
- **Best practices:**
  - Use \`type\` parameter for language-specific searches: type="apex" for .cls/.trigger files.
  - Use \`output_mode="content"\` to see matching lines with surrounding context.
  - Use \`output_mode="files_with_matches"\` to find which files contain a pattern.
  - Use \`-A\`/\`-B\`/\`-C\` parameters for context lines around matches.
  - Combine glob filter with content search: \`glob="**/classes/*.cls"\` + pattern.
- **Example:** Find all SOQL queries in Apex: \`grep({ pattern: "\\\\[SELECT", type: "apex", output_mode: "content" })\``,

  ls: `### ls
- **When to use:** Listing directory contents to understand project structure or verify file existence.
- **vs alternatives:** Use glob for pattern-based file discovery. ls is better for seeing full directory listings.
- **Common pitfalls:**
  - Listing very large directories (node_modules, .git) — use specific subdirectories.
  - Forgetting that hidden files may not appear by default.
- **Best practices:**
  - Use to verify directory structure before creating files.
  - Good for checking SFDX project layout: force-app/main/default/ subdirectories.
  - Use absolute paths for consistency.
  - Check for sfdx-project.json to confirm SFDX project root.
- **Example:** \`ls({ path: "/force-app/main/default/classes" })\``,

  task: `### task
- **When to use:** Delegating complex subtasks to a separate agent context — parallel research, multi-step operations.
- **vs alternatives:** Use for tasks that benefit from isolated context. Prefer direct tool calls for simple operations.
- **Common pitfalls:**
  - Over-delegating simple tasks — task has overhead from context setup.
  - Not providing enough context in the task description.
  - Tasks cannot share state — each runs in isolation.
- **Best practices:**
  - Provide clear, self-contained task descriptions.
  - Use for research-heavy tasks: "Find all references to AccountService and summarize its API."
  - Use for parallel work: multiple independent file analyses.
  - Keep task scope focused — one clear objective per task.
- **Example:** \`task({ description: "Analyze all trigger handlers and identify any that violate bulkification patterns" })\``,

  // ── Salesforce CLI Tools ─────────────────────────────────────────────────

  sf_query: `### sf_query
- **When to use:** Querying Salesforce data — records, metadata, org info. Primary tool for reading org state.
- **vs alternatives:** Use sf_describe_object to learn field names first, then sf_query. Use sf_run_apex for complex logic.
- **Common pitfalls:**
  - Missing WHERE clause on large objects — always filter or LIMIT.
  - Querying too many fields — select only what you need.
  - Not handling null results — always check for empty result sets.
  - SOQL injection in dynamic queries — use bind variables where possible.
- **Best practices:**
  - Always include a WHERE clause or LIMIT on large objects (Account, Contact, Case).
  - Use relationship queries (\`Account.Name\`) instead of separate queries when possible.
  - For aggregate queries, use GROUP BY with HAVING for filtering.
  - Results are subject to PII middleware — sensitive fields may be masked.
  - Use \`--json\` output for programmatic processing.
  - Query indexed fields in WHERE for performance: Id, Name, CreatedDate, RecordTypeId.
- **Example:** \`sf_query({ query: "SELECT Id, Name, Industry FROM Account WHERE CreatedDate = THIS_YEAR LIMIT 50" })\``,

  sf_deploy: `### sf_deploy
- **When to use:** Deploying metadata to a Salesforce org — after making code changes, creating new components.
- **vs alternatives:** Use sf_retrieve for downloading metadata. Use sf_run_apex for executing anonymous Apex.
- **Common pitfalls:**
  - Deploying to production without validation — always dry-run first.
  - Missing dependencies causing deploy failures — check metadata references.
  - Forgetting to run tests after deploy.
  - Deploying too broadly — target specific directories or files.
- **Best practices:**
  - Always run \`sf project deploy start --dry-run\` first for production orgs.
  - Include \`--json\` flag for parseable output.
  - After deploy, run relevant tests to verify: \`sf apex run test\`.
  - For partial deploys, use \`--source-dir\` to target specific directories.
  - Check deploy status with the returned job ID if async.
  - Use \`--test-level RunLocalTests\` for production deployments.
  - Back up current metadata with sf_retrieve before deploying risky changes.
- **Example:** Deploy a specific class: \`sf_deploy({ sourcePath: "force-app/main/default/classes/AccountService.cls" })\``,

  sf_retrieve: `### sf_retrieve
- **When to use:** Downloading metadata from a Salesforce org — backup before changes, pulling latest org state.
- **vs alternatives:** Use sf_deploy for pushing changes. Use sf_describe_object for schema inspection.
- **Common pitfalls:**
  - Retrieving too broadly — specify target metadata types or directories.
  - Overwriting local changes — check git status before retrieving.
  - Package.xml conflicts with source tracking.
- **Best practices:**
  - Use \`--source-dir\` to target specific directories.
  - Retrieve before making changes to have a clean baseline.
  - Check git diff after retrieve to see what changed in the org.
  - Use for pulling changes made by other developers or through Setup UI.
- **Example:** \`sf_retrieve({ sourcePath: "force-app/main/default/classes" })\``,

  sf_run_apex: `### sf_run_apex
- **When to use:** Executing anonymous Apex — data fixes, one-off scripts, testing logic, exploring APIs.
- **vs alternatives:** Use sf_query for simple data reads. Use sf_deploy for permanent code changes.
- **Common pitfalls:**
  - Apex code with side effects (DML) — be careful in production orgs.
  - Governor limits apply — large operations should use Batch Apex.
  - Syntax errors are common — validate code carefully before execution.
- **Best practices:**
  - Use for data exploration and one-off operations.
  - Always include System.debug() for output inspection.
  - For data modifications, wrap in a try-catch and verify results.
  - Use Test.isRunningTest() to guard test-only code paths.
  - Keep scripts short and focused — complex logic should be deployed as a class.
- **Example:** \`sf_run_apex({ code: "List<Account> accts = [SELECT Id, Name FROM Account LIMIT 5]; System.debug(JSON.serializePretty(accts));" })\``,

  sf_describe_object: `### sf_describe_object
- **When to use:** Inspecting object schema — field names, types, picklist values, relationships.
- **vs alternatives:** Use before sf_query to discover available fields. Use sf_list_metadata_types for object discovery.
- **Common pitfalls:**
  - Large objects return extensive field lists — focus on what you need.
  - Custom field API names end with __c — standard fields do not.
- **Best practices:**
  - Always describe an object before querying it to learn field names and types.
  - Check for required fields before creating records.
  - Use to discover relationship names for SOQL relationship queries.
  - Check picklist values before setting field values.
  - Look for formula fields (calculated) vs editable fields.
- **Example:** \`sf_describe_object({ objectName: "Account" })\``,

  sf_run_tests: `### sf_run_tests
- **When to use:** Running Apex tests — validation before deploy, checking coverage, verifying changes.
- **vs alternatives:** Use sf_deploy with --dry-run for deploy validation. Use execute for custom test scripts.
- **Common pitfalls:**
  - Running all tests in a large org takes too long — target specific classes.
  - Not checking coverage results after tests pass.
  - Tests may fail due to data dependencies — check test isolation.
- **Best practices:**
  - Target specific test classes: \`--tests AccountServiceTest\` for focused testing.
  - Use \`--code-coverage\` to see coverage percentages.
  - Use \`--synchronous\` for immediate results on small test sets.
  - After test runs, check for 75%+ coverage on modified classes.
  - Run tests after every code change before deploying.
- **Example:** Run specific tests with coverage: \`sf_run_tests({ testClasses: ["AccountServiceTest", "ContactServiceTest"], codeCoverage: true })\``,

  sf_data: `### sf_data
- **When to use:** Managing Salesforce data records — insert, update, delete, upsert operations.
- **vs alternatives:** Use sf_query for reading data. Use sf_run_apex for complex multi-step data operations.
- **Common pitfalls:**
  - Accidental data modification in production — always verify the target org.
  - Missing required fields on insert causing failures.
  - Upsert without external ID field specified.
- **Best practices:**
  - Verify you are targeting the correct org before any DML operation.
  - Use upsert with external IDs for idempotent data loading.
  - For bulk operations (>200 records), use Bulk API via execute tool.
  - Always check results for partial failures.
  - Back up data before bulk updates or deletes.
- **Example:** Insert a record: \`sf_data({ operation: "insert", object: "Account", values: { Name: "Acme Corp", Industry: "Technology" } })\``,

  sf_list_orgs: `### sf_list_orgs
- **When to use:** Listing connected Salesforce orgs — finding aliases, checking auth status.
- **vs alternatives:** Use sf_get_org_info for details on a specific org.
- **Common pitfalls:**
  - Expired auth tokens — re-authenticate with \`sf org login web\`.
  - Confusing scratch orgs with sandboxes in the listing.
- **Best practices:**
  - Run at session start to know which orgs are available.
  - Check for the default org alias to understand the current target.
  - Use to verify scratch orgs are still active (not expired).
- **Example:** \`sf_list_orgs({})\``,

  sf_get_org_info: `### sf_get_org_info
- **When to use:** Getting details about a specific Salesforce org — instance URL, org type, limits, features.
- **vs alternatives:** Use sf_list_orgs to find available orgs first, then sf_get_org_info for details.
- **Common pitfalls:**
  - Querying an org with expired auth — re-authenticate first.
  - Not specifying target org — defaults to the org set in sf config.
- **Best practices:**
  - Check org type (production, sandbox, scratch) before destructive operations.
  - Use to verify the org URL matches expectations.
  - Check org edition for feature availability.
  - Verify API version support.
- **Example:** \`sf_get_org_info({ targetOrg: "my-sandbox" })\``,

  sf_org_limits: `### sf_org_limits
- **When to use:** Checking current API usage, storage limits, and governor limit consumption.
- **vs alternatives:** Use sf_get_org_info for general org details. Use sf_org_limits specifically for usage metrics.
- **Common pitfalls:**
  - Limits are org-wide, not transaction-specific — for transaction limits, check Apex debug logs.
  - Some limits refresh daily, others are persistent.
- **Best practices:**
  - Check API request limits before running bulk operations.
  - Monitor storage limits before large data imports.
  - Check DailyApiRequests remaining before automation scripts.
  - Alert when any limit exceeds 80% usage.
- **Example:** \`sf_org_limits({})\``,

  // ── Discovery Tools ──────────────────────────────────────────────────────

  sf_list_metadata_types: `### sf_list_metadata_types
- **When to use:** Discovering what metadata types exist in an org — prerequisite for targeted retrieval.
- **vs alternatives:** Use sf_describe_all_sobjects for SObject discovery. This tool is for metadata types (classes, flows, etc.).
- **Common pitfalls:**
  - Confusing metadata types with SObjects — they are different hierarchies.
  - Large orgs have many types — filter or paginate results.
- **Best practices:**
  - Use to discover available metadata before targeted retrieve operations.
  - Common types: ApexClass, ApexTrigger, CustomObject, Flow, LightningComponentBundle.
  - Use results to build targeted package.xml for retrieval.
- **Example:** \`sf_list_metadata_types({})\``,

  sf_describe_all_sobjects: `### sf_describe_all_sobjects
- **When to use:** Listing all SObjects in an org — standard and custom objects.
- **vs alternatives:** Use sf_describe_object for details on a specific object. This tool provides the full catalog.
- **Common pitfalls:**
  - Returns many objects — filter for custom (__c suffix) or specific standard objects.
  - Does not include field details — use sf_describe_object for that.
- **Best practices:**
  - Use to discover custom objects in an unfamiliar org.
  - Filter results by keyPrefix or custom flag for focused exploration.
  - Combine with sf_describe_object for deep inspection.
- **Example:** \`sf_describe_all_sobjects({})\``,

  sf_list_metadata_of_type: `### sf_list_metadata_of_type
- **When to use:** Listing all metadata items of a specific type — e.g., all Apex classes, all Flows.
- **vs alternatives:** Use sf_list_metadata_types to discover types first, then this tool for items within a type.
- **Common pitfalls:**
  - Large result sets for common types — consider pagination.
  - Type names are case-sensitive: "ApexClass" not "apexclass".
- **Best practices:**
  - Use to audit what exists in an org before development.
  - Common lookups: list all ApexClass, Flow, CustomObject, PermissionSet.
  - Use results to identify naming conventions and patterns in the org.
- **Example:** \`sf_list_metadata_of_type({ metadataType: "ApexClass" })\``,

  // ── Browser Tools ────────────────────────────────────────────────────────

  browser_open: `### browser_open
- **When to use:** Navigating to Salesforce Setup pages or UI pages that cannot be configured via Metadata API.
- **vs alternatives:** Prefer metadata API tools (sf_deploy, sf_retrieve) for declarative config. Use browser only when no API exists.
- **Common pitfalls:**
  - Not authenticating first — call authenticateBrowser before navigating to protected pages.
  - Lightning pages load asynchronously — wait for elements before interacting.
  - Setup pages may redirect — verify the final URL.
- **Best practices:**
  - Always authenticate first if not already logged in.
  - Prefer URL-based navigation to Setup pages over clicking through menus.
  - Setup URL pattern: \`/lightning/setup/<SetupPage>/home\`.
  - Wait for page load before interacting with elements.
  - Take screenshots after navigation to verify the page loaded correctly.
- **Example:** Navigate to Agentforce Setup: \`browser_open({ url: "https://myorg.lightning.force.com/lightning/setup/AgentStudio/home" })\``,

  browser_click: `### browser_click
- **When to use:** Clicking buttons, links, or interactive elements on Salesforce pages.
- **vs alternatives:** Use browser_execute for Shadow DOM elements that normal selectors cannot reach.
- **Common pitfalls:**
  - Element not found — use browser_wait first to ensure the element exists.
  - Clicking wrong element — use specific selectors (data-id, aria-label) over generic ones.
  - Lightning Shadow DOM hides elements from standard selectors.
- **Best practices:**
  - Use specific selectors: \`[data-id="saveButton"]\`, \`button[title="Save"]\`.
  - Wait for elements before clicking: browser_wait then browser_click.
  - For Shadow DOM elements, use browser_execute with shadowRoot traversal.
  - Take a screenshot after clicking to verify the action took effect.
- **Example:** \`browser_click({ selector: "button[title='Save']" })\``,

  browser_fill: `### browser_fill
- **When to use:** Typing text into input fields on Salesforce pages.
- **vs alternatives:** Use browser_execute for Shadow DOM inputs that standard fill cannot reach.
- **Common pitfalls:**
  - Input field not ready — wait for it first.
  - Lightning inputs may require focus events before fill works.
  - Clearing existing text before filling — some fields need explicit clear.
- **Best practices:**
  - Wait for the input element to be visible before filling.
  - Use specific selectors to target the correct input.
  - For Lightning inputs, the actual input may be inside a shadow root.
  - Verify the value was set by reading it back with browser_get_text.
- **Example:** \`browser_fill({ selector: "input[name='Name']", value: "Acme Corp" })\``,

  browser_screenshot: `### browser_screenshot
- **When to use:** Capturing the current page state — verification, debugging, documenting UI state.
- **vs alternatives:** Use browser_get_text for text extraction. Screenshots are better for visual verification.
- **Common pitfalls:**
  - Page not fully loaded — wait for key elements before screenshotting.
  - Large pages may not capture below the fold — scroll first if needed.
- **Best practices:**
  - Take screenshots after actions to verify success.
  - Use after navigation to confirm the correct page loaded.
  - Useful for debugging when element selectors are not working.
  - Screenshots help verify visual layout and component rendering.
- **Example:** \`browser_screenshot({})\``,

  browser_execute: `### browser_execute
- **When to use:** Running JavaScript on the page — essential for Lightning Shadow DOM, reading page state, complex interactions.
- **vs alternatives:** Use browser_click/browser_fill for standard elements. browser_execute is for Shadow DOM and custom logic.
- **Common pitfalls:**
  - Shadow DOM traversal is fragile — component structure changes between releases.
  - Scripts that throw errors silently — always wrap in try/catch.
  - Returning non-serializable values — return strings or simple objects.
- **Best practices:**
  - Essential for Lightning Shadow DOM: \`document.querySelector('one-app-nav-bar').shadowRoot.querySelector(...)\`.
  - Always wrap in try/catch and return meaningful results.
  - Use for reading page state, filling shadow DOM inputs, and clicking shadow DOM buttons.
  - Return results as JSON strings for reliable parsing.
  - Keep scripts focused and short — complex logic should be split into multiple executions.
- **Example:** Read a Lightning input value: \`browser_execute({ script: "return document.querySelector('lightning-input').shadowRoot.querySelector('input').value" })\``,

  browser_close: `### browser_close
- **When to use:** Closing the browser when done with UI operations — frees resources.
- **vs alternatives:** Browser closes automatically when the agent session ends, but explicit close is cleaner.
- **Common pitfalls:**
  - Closing too early — ensure all browser operations are complete first.
  - Trying to use browser tools after closing — must re-open.
- **Best practices:**
  - Close the browser after completing all UI operations.
  - Close before long-running non-browser tasks to free memory.
  - Always close in production to avoid resource leaks.
- **Example:** \`browser_close({})\``,

  // ── Documentation Tools ──────────────────────────────────────────────────

  sf_docs_search: `### sf_docs_search
- **When to use:** Searching Salesforce documentation — finding API references, feature guides, best practices.
- **vs alternatives:** Use web_search for broader internet searches. sf_docs_search is scoped to official SF documentation.
- **Common pitfalls:**
  - Too specific search terms returning no results — use broader terms.
  - Documentation may be for a different API version — check version relevance.
- **Best practices:**
  - Search for concepts, not exact code: "governor limits" not "System.LimitException".
  - Use to find official patterns and recommended approaches.
  - Cross-reference with sf_docs_read for full document content.
  - Good for API references, metadata type documentation, and feature guides.
- **Example:** \`sf_docs_search({ query: "Apex trigger best practices" })\``,

  sf_docs_read: `### sf_docs_read
- **When to use:** Reading a specific Salesforce documentation page in full.
- **vs alternatives:** Use sf_docs_search to find the right doc first, then sf_docs_read for the full content.
- **Common pitfalls:**
  - Long documents may exceed context — focus on specific sections.
  - Docs may reference other pages — follow up with additional reads.
- **Best practices:**
  - Read after sf_docs_search identifies the relevant document.
  - Summarize key points for the user rather than dumping raw docs.
  - Check the API version in the documentation matches the user's org version.
- **Example:** \`sf_docs_read({ path: "apexcode/apex_methods_system_limits.htm" })\``,

  // ── Agentforce Tools ─────────────────────────────────────────────────────

  agent_publish: `### agent_publish
- **When to use:** Publishing an Agentforce agent to the org — after creating or updating the agent definition.
- **vs alternatives:** Use agent_validate before publishing. Use agent_activate after publishing.
- **Common pitfalls:**
  - Publishing without validation — missing action targets cause failures.
  - Forgetting to activate after publish — published agents are not live until activated.
  - Missing permissions — ensure the running user has Agentforce admin permissions.
- **Best practices:**
  - Always validate the agent bundle before publishing.
  - Requires the agent to be activated after publishing for end-user access.
  - Check for missing action targets before publish — use discovery tools.
  - Verify all referenced flows, Apex classes, and prompts exist in the org.
- **Example:** \`agent_publish({ agentName: "Sales_Coach" })\``,

  agent_activate: `### agent_activate
- **When to use:** Activating a published Agentforce agent — makes it available to end users.
- **vs alternatives:** Must publish first with agent_publish. Use agent_preview for testing before activation.
- **Common pitfalls:**
  - Activating an untested agent — always preview first.
  - Activation fails if the agent bundle has unresolved references.
- **Best practices:**
  - Preview the agent thoroughly before activating for end users.
  - Deactivate the current version before activating a new one if needed.
  - Verify the agent responds correctly to key scenarios before going live.
- **Example:** \`agent_activate({ agentName: "Sales_Coach" })\``,

  agent_validate: `### agent_validate
- **When to use:** Validating an Agentforce agent bundle — checking for missing references, syntax errors.
- **vs alternatives:** Always validate before publishing with agent_publish.
- **Common pitfalls:**
  - Validation passes but runtime fails — validation checks structure, not logic.
  - Missing action targets not caught until publish — validate catches most of these.
- **Best practices:**
  - Run validation after any change to agent files.
  - Check validation output for warnings, not just errors.
  - Fix all validation errors before attempting to publish.
- **Example:** \`agent_validate({ agentName: "Sales_Coach" })\``,

  agent_preview: `### agent_preview
- **When to use:** Testing an Agentforce agent interactively — sending test utterances, checking responses.
- **vs alternatives:** Use before agent_activate to verify behavior. Faster than full deployment for testing.
- **Common pitfalls:**
  - Preview may not reflect production configuration exactly.
  - Long preview sessions may time out — keep tests focused.
- **Best practices:**
  - Test key user scenarios: greetings, data queries, action execution.
  - Verify error handling with invalid inputs.
  - Check that the agent routes to the correct actions.
  - Document test results for review.
- **Example:** \`agent_preview({ agentName: "Sales_Coach", utterance: "Show me my top accounts" })\``,

  // ── Data Cloud Tools ─────────────────────────────────────────────────────

  dc_query: `### dc_query (Data Cloud)
- **When to use:** Querying Data Cloud data lakes — analytics, segmentation data, unified profiles.
- **vs alternatives:** Use sf_query for standard Salesforce data. dc_query is for Data Cloud SQL (not SOQL).
- **Common pitfalls:**
  - Using SOQL syntax — Data Cloud uses standard SQL with specific extensions.
  - Wrong table names — prefix with namespace and use correct suffix (\`__dll\`, \`__dlm\`).
  - Large result sets — always use LIMIT for initial exploration.
- **Best practices:**
  - Use Data Cloud SQL syntax, not SOQL.
  - Prefix table names with the correct namespace and suffix (\`__dll\`, \`__dlm\`).
  - JOIN is supported — use it for cross-object analysis.
  - Results can be large — use LIMIT and OFFSET for pagination.
  - Use dc_list_objects to discover available tables first.
- **Example:** \`dc_query({ query: "SELECT Name, Email__c FROM Account_Home__dll LIMIT 100" })\``,

  dc_list_objects: `### dc_list_objects (Data Cloud)
- **When to use:** Discovering available Data Cloud objects — tables, data lake objects, data model objects.
- **vs alternatives:** Use before dc_query to find correct table names. Use dc_describe for field details.
- **Common pitfalls:**
  - Many objects in Data Cloud — filter for relevant namespaces.
  - Object names differ from standard Salesforce object names.
- **Best practices:**
  - Run first when working with Data Cloud to discover available data.
  - Note the namespace and suffix patterns for query construction.
  - Focus on __dll (data lake) and __dlm (data model) objects.
- **Example:** \`dc_list_objects({})\``,

  dc_describe: `### dc_describe (Data Cloud)
- **When to use:** Inspecting a Data Cloud object's schema — field names, types, relationships.
- **vs alternatives:** Use dc_list_objects first to find the object, then dc_describe for details.
- **Common pitfalls:**
  - Field names may differ from standard Salesforce field names.
  - Data types follow Data Cloud conventions, not Salesforce field types.
- **Best practices:**
  - Describe objects before querying to learn field names and types.
  - Check for calculated fields and key fields.
  - Use field information to build accurate SQL queries.
- **Example:** \`dc_describe({ objectName: "Account_Home__dll" })\``,

  dc_ingest_streaming: `### dc_ingest_streaming (Data Cloud)
- **When to use:** Sending real-time data into Data Cloud — streaming ingestion for live data feeds.
- **vs alternatives:** Use dc_ingest_bulk for large batch imports. Streaming is for real-time, event-driven data.
- **Common pitfalls:**
  - Schema mismatch — ensure data matches the target object schema.
  - Rate limits on streaming ingestion — batch when possible for large volumes.
- **Best practices:**
  - Validate data schema before ingestion.
  - Use for real-time event data, not bulk historical loads.
  - Monitor ingestion status for errors.
  - Ensure the target data stream is configured in Data Cloud.
- **Example:** \`dc_ingest_streaming({ objectName: "WebEvents__dll", records: [{ event: "page_view", url: "/home" }] })\``,

  dc_ingest_bulk: `### dc_ingest_bulk (Data Cloud)
- **When to use:** Loading large data volumes into Data Cloud — batch imports, historical data migration.
- **vs alternatives:** Use dc_ingest_streaming for real-time data. Bulk is for large, non-real-time loads.
- **Common pitfalls:**
  - File format requirements — must match expected schema.
  - Large files may take time to process — monitor job status.
- **Best practices:**
  - Use for historical data loads and large batch imports.
  - Validate data format before submission.
  - Monitor bulk job completion status.
  - Split very large files into manageable chunks.
- **Example:** \`dc_ingest_bulk({ objectName: "Transactions__dll", filePath: "/data/transactions.csv" })\``,

  // ── Web Tools ────────────────────────────────────────────────────────────

  web_search: `### web_search
- **When to use:** Searching the internet — Salesforce documentation, error solutions, code examples, best practices.
- **vs alternatives:** Use sf_docs_search for official Salesforce docs. web_search is broader (Stack Overflow, blogs, etc.).
- **Common pitfalls:**
  - Raw search results are not user-friendly — synthesize into a coherent answer.
  - Outdated results — check publication dates for relevance.
  - Multiple conflicting answers — cross-reference with official docs.
- **Best practices:**
  - Synthesize results into a coherent answer — never show raw JSON to the user.
  - Cite sources by mentioning page titles or URLs when relevant.
  - Cross-reference web results with official Salesforce documentation.
  - Prefer recent results for API-version-sensitive topics.
  - Good for error message lookups and community-sourced solutions.
- **Example:** \`web_search({ query: "FIELD_CUSTOM_VALIDATION_EXCEPTION mixed DML operation solution" })\``,

  web_fetch: `### web_fetch
- **When to use:** Fetching a specific web page — reading documentation, downloading resources, checking URLs.
- **vs alternatives:** Use web_search to find URLs first, then web_fetch for specific page content.
- **Common pitfalls:**
  - Large pages may exceed context — fetch only what you need.
  - Dynamic pages (SPAs) may return empty content — the fetcher gets raw HTML.
  - Rate limiting on some sites — space requests.
- **Best practices:**
  - Use for reading specific documentation pages.
  - Extract relevant sections from large pages rather than including everything.
  - Check HTTP status for errors before processing content.
- **Example:** \`web_fetch({ url: "https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm" })\``,

  // ── Planning Tools ───────────────────────────────────────────────────────

  write_todos: `### write_todos
- **When to use:** Creating or updating a structured task list — project planning, tracking progress, breaking down work.
- **vs alternatives:** Use for persistent task tracking. For simple notes, include in conversation context.
- **Common pitfalls:**
  - Overwriting existing todos — read current todos first.
  - Too many granular tasks — group related work.
  - Not updating status as tasks complete.
- **Best practices:**
  - Break complex work into ordered steps.
  - Mark items as complete as you go.
  - Include specific file paths and method names in todo descriptions.
  - Group related tasks under categories.
  - Keep the list focused — 5-15 items for a session.
- **Example:** \`write_todos({ todos: [{ content: "Create AccountService.cls with CRUD methods", status: "pending" }] })\``,
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
