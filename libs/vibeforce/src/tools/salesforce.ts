/**
 * Core Salesforce CLI tools — 10 LangChain StructuredTools.
 *
 * Ported from Buildify MCP server with additions:
 *   sf_list_orgs, sf_get_org_info, sf_describe_object, sf_query,
 *   sf_run_apex, sf_deploy, sf_retrieve, sf_data, sf_run_tests, sf_org_limits
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { runSfCommand } from "./sf-cli.js";

// ---------------------------------------------------------------------------
// 1. sf_list_orgs
// ---------------------------------------------------------------------------
export class SfListOrgsTool extends StructuredTool {
  name = "sf_list_orgs";
  description = "List all authenticated Salesforce orgs";
  schema = z.object({});

  async _call(): Promise<string> {
    const result = await runSfCommand("org", ["list"]);
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 2. sf_get_org_info
// ---------------------------------------------------------------------------
export class SfGetOrgInfoTool extends StructuredTool {
  name = "sf_get_org_info";
  description =
    "Get information about a Salesforce org (URL, username, edition, etc.)";
  schema = z.object({
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ alias }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand("org", ["display"], { alias });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 3. sf_describe_object
// ---------------------------------------------------------------------------
export class SfDescribeObjectTool extends StructuredTool {
  name = "sf_describe_object";
  description =
    "Describe a Salesforce sObject and its fields (e.g. Account, Contact)";
  schema = z.object({
    sobject: z.string().describe("SObject API name (e.g. Account, Contact)"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    sobject,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand(
      "sobject",
      ["describe", "--sobject", sobject],
      { alias },
    );
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 4. sf_query
// ---------------------------------------------------------------------------
export class SfQueryTool extends StructuredTool {
  name = "sf_query";
  description = "Run a SOQL query against a Salesforce org";
  schema = z.object({
    soql: z.string().describe("SOQL query string"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ soql, alias }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand("data", ["query", "--query", soql], {
      alias,
    });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 5. sf_run_apex
// ---------------------------------------------------------------------------
export class SfRunApexTool extends StructuredTool {
  name = "sf_run_apex";
  description = "Execute anonymous Apex code against a Salesforce org";
  schema = z.object({
    code: z.string().describe("Anonymous Apex code to execute"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ code, alias }: z.infer<typeof this.schema>): Promise<string> {
    const tmpFile = join(tmpdir(), `apex-${randomUUID()}.apex`);
    await writeFile(tmpFile, code, "utf-8");
    try {
      const result = await runSfCommand("apex", ["run", "--file", tmpFile], {
        alias,
      });
      return JSON.stringify(result.data, null, 2);
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// 6. sf_deploy
// ---------------------------------------------------------------------------
export class SfDeployTool extends StructuredTool {
  name = "sf_deploy";
  description = "Deploy source to a Salesforce org";
  schema = z.object({
    sourcePath: z.string().describe("Path to the source directory to deploy"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    sourcePath,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand(
      "project",
      ["deploy", "start", "--source-dir", sourcePath],
      { alias },
    );
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 7. sf_retrieve
// ---------------------------------------------------------------------------
export class SfRetrieveTool extends StructuredTool {
  name = "sf_retrieve";
  description =
    "Retrieve metadata from a Salesforce org (e.g. 'ApexClass:MyClass')";
  schema = z.object({
    metadata: z
      .string()
      .describe("Metadata to retrieve (e.g. 'ApexClass:MyClass')"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    metadata,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand(
      "project",
      ["retrieve", "start", "--metadata", metadata],
      { alias },
    );
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 8. sf_data — unified DML tool
// ---------------------------------------------------------------------------
const sfDataOperations = [
  "insert",
  "update",
  "upsert",
  "delete",
] as const;

export class SfDataTool extends StructuredTool {
  name = "sf_data";
  description =
    "Perform DML operations (insert, update, upsert, delete) on Salesforce records";
  schema = z.object({
    operation: z
      .enum(sfDataOperations)
      .describe("DML operation to perform"),
    sobject: z.string().describe("SObject API name (e.g. Account)"),
    values: z
      .string()
      .optional()
      .describe(
        'Field=value pairs for insert/update/upsert (e.g. "Name=Acme Type=Customer")',
      ),
    recordId: z
      .string()
      .optional()
      .describe("Record ID (required for update and delete)"),
    externalId: z
      .string()
      .optional()
      .describe("External ID field name (required for upsert)"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    operation,
    sobject,
    values,
    recordId,
    externalId,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    let subcommand: string;
    const args: string[] = [];

    switch (operation) {
      case "insert": {
        subcommand = "create";
        args.push("record", "--sobject", sobject);
        if (values) args.push("--values", values);
        break;
      }
      case "update": {
        subcommand = "update";
        args.push("record", "--sobject", sobject);
        if (recordId) args.push("--record-id", recordId);
        if (values) args.push("--values", values);
        break;
      }
      case "upsert": {
        subcommand = "upsert";
        args.push("bulk", "--sobject", sobject);
        if (externalId) args.push("--external-id", externalId);
        if (values) args.push("--values", values);
        break;
      }
      case "delete": {
        subcommand = "delete";
        args.push("record", "--sobject", sobject);
        if (recordId) args.push("--record-id", recordId);
        break;
      }
    }

    const result = await runSfCommand("data", [subcommand!, ...args], {
      alias,
    });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 9. sf_run_tests
// ---------------------------------------------------------------------------
export class SfRunTestsTool extends StructuredTool {
  name = "sf_run_tests";
  description = "Run Apex test classes against a Salesforce org";
  schema = z.object({
    tests: z
      .string()
      .describe(
        "Comma-separated list of test class names (e.g. 'MyTest,OtherTest')",
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
    const result = await runSfCommand(
      "apex",
      ["run", "test", "--tests", tests, "--result-format", "json"],
      { alias },
    );
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 10. sf_org_limits
// ---------------------------------------------------------------------------
export class SfOrgLimitsTool extends StructuredTool {
  name = "sf_org_limits";
  description = "List org limits and current usage for a Salesforce org";
  schema = z.object({
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ alias }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand("org", ["list", "limits"], { alias });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Export all 10 core SF tools as instances
// ---------------------------------------------------------------------------
export const coreSfTools = [
  new SfListOrgsTool(),
  new SfGetOrgInfoTool(),
  new SfDescribeObjectTool(),
  new SfQueryTool(),
  new SfRunApexTool(),
  new SfDeployTool(),
  new SfRetrieveTool(),
  new SfDataTool(),
  new SfRunTestsTool(),
  new SfOrgLimitsTool(),
];
