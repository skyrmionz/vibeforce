/**
 * Extended Salesforce CLI tools — 12 LangChain StructuredTools.
 *
 * Covers scratch orgs, sandboxes, packages, deploy lifecycle,
 * test coverage, data export, and event logs.
 */

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { runSfCommand } from "./sf-cli.js";

// ---------------------------------------------------------------------------
// 1. sf_scratch_org_create
// ---------------------------------------------------------------------------
export class SfScratchOrgCreateTool extends StructuredTool {
  name = "sf_scratch_org_create";
  description =
    "Create a new Salesforce scratch org from a definition file";
  schema = z.object({
    definitionFile: z
      .string()
      .describe("Path to the scratch org definition JSON file"),
    alias: z
      .string()
      .optional()
      .describe("Alias for the new scratch org"),
    durationDays: z
      .number()
      .optional()
      .describe("Number of days before the scratch org expires (1-30, default 7)"),
    devhub: z
      .string()
      .optional()
      .describe("Dev Hub org alias or username"),
  });

  async _call({
    definitionFile,
    alias,
    durationDays,
    devhub,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = ["create", "scratch", "--definition-file", definitionFile];
    if (alias) args.push("--alias", alias);
    if (durationDays) args.push("--duration-days", String(durationDays));
    if (devhub) args.push("--target-dev-hub", devhub);
    const result = await runSfCommand("org", args, { timeout: 300_000 });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 2. sf_scratch_org_delete
// ---------------------------------------------------------------------------
export class SfScratchOrgDeleteTool extends StructuredTool {
  name = "sf_scratch_org_delete";
  description = "Delete a Salesforce scratch org";
  schema = z.object({
    targetOrg: z
      .string()
      .describe("Scratch org alias or username to delete"),
    noPrompt: z
      .boolean()
      .optional()
      .describe("Skip confirmation prompt (default true)"),
  });

  async _call({
    targetOrg,
    noPrompt,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = ["delete", "scratch", "--target-org", targetOrg];
    if (noPrompt !== false) args.push("--no-prompt");
    const result = await runSfCommand("org", args);
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 3. sf_scratch_org_list
// ---------------------------------------------------------------------------
export class SfScratchOrgListTool extends StructuredTool {
  name = "sf_scratch_org_list";
  description = "List all authenticated scratch orgs";
  schema = z.object({});

  async _call(): Promise<string> {
    const result = await runSfCommand("org", ["list"]);
    const data = result.data as any;
    const scratchOrgs = (data?.scratchOrgs ?? []).map((o: any) => ({
      alias: o.alias,
      username: o.username,
      orgId: o.orgId,
      instanceUrl: o.instanceUrl,
      status: o.status ?? o.connectedStatus,
      expirationDate: o.expirationDate,
      devHubOrgId: o.devHubOrgId,
    }));
    return JSON.stringify(scratchOrgs, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 4. sf_package_create
// ---------------------------------------------------------------------------
export class SfPackageCreateTool extends StructuredTool {
  name = "sf_package_create";
  description = "Create a new Salesforce package (managed or unlocked)";
  schema = z.object({
    name: z.string().describe("Package name"),
    packageType: z
      .enum(["Managed", "Unlocked"])
      .describe("Package type: Managed or Unlocked"),
    path: z
      .string()
      .optional()
      .describe("Path to the package directory"),
    devhub: z
      .string()
      .optional()
      .describe("Dev Hub org alias or username"),
  });

  async _call({
    name,
    packageType,
    path,
    devhub,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = [
      "create",
      "--name",
      name,
      "--package-type",
      packageType,
    ];
    if (path) args.push("--path", path);
    if (devhub) args.push("--target-dev-hub", devhub);
    const result = await runSfCommand("package", args);
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 5. sf_package_version_create
// ---------------------------------------------------------------------------
export class SfPackageVersionCreateTool extends StructuredTool {
  name = "sf_package_version_create";
  description = "Create a new version of a Salesforce package";
  schema = z.object({
    package: z
      .string()
      .describe("Package ID or alias"),
    installationKey: z
      .string()
      .optional()
      .describe("Installation key for the package version"),
    wait: z
      .number()
      .optional()
      .describe("Minutes to wait for completion (default 10)"),
    devhub: z
      .string()
      .optional()
      .describe("Dev Hub org alias or username"),
  });

  async _call({
    package: pkg,
    installationKey,
    wait,
    devhub,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = ["version", "create", "--package", pkg];
    if (installationKey) args.push("--installation-key", installationKey);
    if (wait) args.push("--wait", String(wait));
    if (devhub) args.push("--target-dev-hub", devhub);
    const result = await runSfCommand("package", args, {
      timeout: (wait ?? 10) * 60_000 + 30_000,
    });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 6. sf_package_install
// ---------------------------------------------------------------------------
export class SfPackageInstallTool extends StructuredTool {
  name = "sf_package_install";
  description = "Install a Salesforce package in an org";
  schema = z.object({
    package: z
      .string()
      .describe("Package version ID (04t...) or alias"),
    alias: z
      .string()
      .optional()
      .describe("Target org alias or username"),
    installationKey: z
      .string()
      .optional()
      .describe("Installation key if required"),
    wait: z
      .number()
      .optional()
      .describe("Minutes to wait for completion (default 10)"),
  });

  async _call({
    package: pkg,
    alias,
    installationKey,
    wait,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = ["install", "--package", pkg];
    if (installationKey) args.push("--installation-key", installationKey);
    if (wait) args.push("--wait", String(wait));
    const result = await runSfCommand("package", args, {
      alias,
      timeout: (wait ?? 10) * 60_000 + 30_000,
    });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 7. sf_deploy_status
// ---------------------------------------------------------------------------
export class SfDeployStatusTool extends StructuredTool {
  name = "sf_deploy_status";
  description =
    "Check the status of the most recent deployment (sf project deploy report)";
  schema = z.object({
    jobId: z
      .string()
      .optional()
      .describe("Specific deploy job ID to check (defaults to most recent)"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    jobId,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = ["deploy", "report"];
    if (jobId) args.push("--job-id", jobId);
    const result = await runSfCommand("project", args, { alias });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 8. sf_deploy_cancel
// ---------------------------------------------------------------------------
export class SfDeployCancelTool extends StructuredTool {
  name = "sf_deploy_cancel";
  description = "Cancel a running deployment (sf project deploy cancel)";
  schema = z.object({
    jobId: z
      .string()
      .optional()
      .describe("Specific deploy job ID to cancel (defaults to most recent)"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    jobId,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = ["deploy", "cancel"];
    if (jobId) args.push("--job-id", jobId);
    const result = await runSfCommand("project", args, { alias });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 9. sf_test_coverage
// ---------------------------------------------------------------------------
export class SfTestCoverageTool extends StructuredTool {
  name = "sf_test_coverage";
  description =
    "Run Apex tests with code coverage report (sf apex run test --code-coverage)";
  schema = z.object({
    tests: z
      .string()
      .optional()
      .describe(
        "Comma-separated test class names. If omitted, runs all tests.",
      ),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    tests,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = [
      "run",
      "test",
      "--code-coverage",
      "--result-format",
      "json",
    ];
    if (tests) args.push("--tests", tests);
    const result = await runSfCommand("apex", args, {
      alias,
      timeout: 300_000,
    });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 10. sf_data_export
// ---------------------------------------------------------------------------
export class SfDataExportTool extends StructuredTool {
  name = "sf_data_export";
  description = "Run a SOQL query and return results in CSV format";
  schema = z.object({
    soql: z.string().describe("SOQL query string"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    soql,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand(
      "data",
      ["query", "--query", soql, "--result-format", "csv"],
      { alias, skipJson: true },
    );
    return result.raw;
  }
}

// ---------------------------------------------------------------------------
// 11. sf_sandbox_create
// ---------------------------------------------------------------------------
export class SfSandboxCreateTool extends StructuredTool {
  name = "sf_sandbox_create";
  description = "Create a new Salesforce sandbox org";
  schema = z.object({
    definitionFile: z
      .string()
      .optional()
      .describe("Path to the sandbox definition JSON file"),
    name: z
      .string()
      .describe("Name for the sandbox"),
    alias: z
      .string()
      .optional()
      .describe("Alias for the new sandbox"),
    targetOrg: z
      .string()
      .optional()
      .describe("Production org alias or username to create sandbox from"),
  });

  async _call({
    definitionFile,
    name,
    alias,
    targetOrg,
  }: z.infer<typeof this.schema>): Promise<string> {
    const args = ["create", "sandbox", "--name", name];
    if (definitionFile) args.push("--definition-file", definitionFile);
    if (alias) args.push("--alias", alias);
    if (targetOrg) args.push("--target-org", targetOrg);
    const result = await runSfCommand("org", args, { timeout: 300_000 });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 12. sf_event_log
// ---------------------------------------------------------------------------
export class SfEventLogTool extends StructuredTool {
  name = "sf_event_log";
  description =
    "Query EventLogFile records to view org event logs (login, API, etc.)";
  schema = z.object({
    eventType: z
      .string()
      .optional()
      .describe(
        "Event type to filter (e.g. Login, API, ApexExecution). If omitted, returns all recent events.",
      ),
    last: z
      .number()
      .optional()
      .describe("Number of days to look back (default 1)"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    eventType,
    last,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const days = last ?? 1;
    const dateFilter = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];
    let soql = `SELECT Id, EventType, LogDate, LogFileLength FROM EventLogFile WHERE LogDate >= ${dateFilter}`;
    if (eventType) soql += ` AND EventType = '${eventType}'`;
    soql += " ORDER BY LogDate DESC LIMIT 50";
    const result = await runSfCommand(
      "data",
      ["query", "--query", soql],
      { alias },
    );
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Export all 12 extended SF tools as instances
// ---------------------------------------------------------------------------
export const extendedSfTools = [
  new SfScratchOrgCreateTool(),
  new SfScratchOrgDeleteTool(),
  new SfScratchOrgListTool(),
  new SfPackageCreateTool(),
  new SfPackageVersionCreateTool(),
  new SfPackageInstallTool(),
  new SfDeployStatusTool(),
  new SfDeployCancelTool(),
  new SfTestCoverageTool(),
  new SfDataExportTool(),
  new SfSandboxCreateTool(),
  new SfEventLogTool(),
];
