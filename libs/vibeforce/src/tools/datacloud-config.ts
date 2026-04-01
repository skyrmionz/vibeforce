/**
 * Data Cloud Connect API configuration tools — 2 LangChain StructuredTools.
 *
 * Uses the Salesforce Connect API to create identity resolution rulesets
 * and segments programmatically.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { runSfCommand } from "./sf-cli.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Marker used to extract JSON payload from Apex debug logs. */
const MARKER = "@@@";

/**
 * Run anonymous Apex code and extract the JSON payload delimited by @@@ markers.
 */
async function runApexAndExtract<T = unknown>(
  apexCode: string,
  alias?: string,
): Promise<T> {
  const tmpFile = join(tmpdir(), `dc-config-${randomUUID()}.apex`);
  await writeFile(tmpFile, apexCode, "utf-8");

  try {
    const result = await runSfCommand("apex", ["run", "--file", tmpFile], {
      alias,
      timeout: 120_000,
    });

    const raw = result.raw;

    let logs: string;
    try {
      const parsed = JSON.parse(raw);
      logs =
        parsed?.result?.logs ??
        parsed?.result?.debugLog ??
        parsed?.debugLog ??
        raw;
    } catch {
      logs = raw;
    }

    const matches = logs.match(new RegExp(`${MARKER}([^@]+)${MARKER}`, "g"));
    if (!matches || matches.length === 0) {
      throw new Error(
        `No ${MARKER}-delimited payload found in Apex output. Raw output:\n${raw.slice(0, 2000)}`,
      );
    }

    const lastMatch = matches[matches.length - 1];
    const jsonStr = lastMatch.slice(MARKER.length, -MARKER.length);
    const payload = JSON.parse(jsonStr) as T;

    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as Record<string, unknown>).error === "string"
    ) {
      throw new Error(
        `Apex error: ${(payload as Record<string, unknown>).error}`,
      );
    }

    return payload;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 1. dc_create_identity_resolution
// ---------------------------------------------------------------------------

const matchRuleSchema = z.object({
  sourceField: z
    .string()
    .describe("Source DMO field for matching (e.g. ssot__FirstName__c)"),
  targetField: z
    .string()
    .describe("Target DMO field for matching (e.g. ssot__FirstName__c)"),
  matchType: z
    .enum(["Exact", "Fuzzy", "Normalized"])
    .optional()
    .default("Exact")
    .describe('Match algorithm: "Exact", "Fuzzy", or "Normalized"'),
});

export class DcCreateIdentityResolutionTool extends StructuredTool {
  name = "dc_create_identity_resolution";
  description =
    "Create an identity resolution ruleset in Data Cloud. Defines how records from different DMOs are matched to create unified profiles.";
  schema = z.object({
    name: z.string().describe("Name for the identity resolution ruleset"),
    matchRules: z
      .array(matchRuleSchema)
      .describe("Array of match rules defining field-level matching criteria"),
    description: z
      .string()
      .optional()
      .describe("Optional description for the ruleset"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    name,
    matchRules,
    description,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    // Build the match rules JSON for Apex
    const rulesJson = JSON.stringify(
      matchRules.map((rule) => ({
        sourceField: rule.sourceField,
        targetField: rule.targetField,
        matchType: rule.matchType ?? "Exact",
      })),
    );
    // Escape single quotes for Apex string literal
    const rulesApex = rulesJson.replace(/'/g, "\\'");
    const nameApex = name.replace(/'/g, "\\'");
    const descApex = (description ?? "").replace(/'/g, "\\'");

    const apex = `
try {
    HttpRequest req = new HttpRequest();
    req.setEndpoint(URL.getOrgDomainUrl().toExternalForm() + '/services/data/v62.0/ssot/identity-resolutions');
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');

    Map<String, Object> body = new Map<String, Object>();
    body.put('name', '${nameApex}');
    body.put('description', '${descApex}');

    String rulesStr = '${rulesApex}';
    List<Object> rules = (List<Object>) JSON.deserializeUntyped(rulesStr);
    body.put('matchRules', rules);

    req.setBody(JSON.serialize(body));

    Http http = new Http();
    HttpResponse res = http.send(req);

    Map<String, Object> result = new Map<String, Object>();
    result.put('statusCode', res.getStatusCode());
    result.put('status', res.getStatus());

    try {
        result.put('data', JSON.deserializeUntyped(res.getBody()));
    } catch (Exception parseEx) {
        result.put('body', res.getBody());
    }

    result.put('success', res.getStatusCode() >= 200 && res.getStatusCode() < 300);
    System.debug('${MARKER}' + JSON.serialize(result) + '${MARKER}');
} catch (Exception e) {
    Map<String, String> err = new Map<String, String>();
    err.put('error', e.getMessage());
    err.put('type', e.getTypeName());
    System.debug('${MARKER}' + JSON.serialize(err) + '${MARKER}');
}
`;

    const result = await runApexAndExtract(apex, alias);
    return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 2. dc_create_segment
// ---------------------------------------------------------------------------

export class DcCreateSegmentTool extends StructuredTool {
  name = "dc_create_segment";
  description =
    "Create a segment in Data Cloud. Segments define populations of unified individuals based on filter criteria.";
  schema = z.object({
    name: z.string().describe("Name for the segment"),
    criteria: z
      .string()
      .describe(
        'SQL WHERE clause or filter expression for the segment (e.g. "ssot__Age__c > 25 AND ssot__Country__c = \'US\'")',
      ),
    description: z
      .string()
      .optional()
      .describe("Optional description for the segment"),
    publishSchedule: z
      .enum(["Every12Hours", "Every24Hours", "None"])
      .optional()
      .default("Every24Hours")
      .describe("How often to refresh the segment"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    name,
    criteria,
    description,
    publishSchedule,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const nameApex = name.replace(/'/g, "\\'");
    const descApex = (description ?? "").replace(/'/g, "\\'");
    const criteriaApex = criteria.replace(/'/g, "\\'");
    const scheduleApex = publishSchedule ?? "Every24Hours";

    const apex = `
try {
    HttpRequest req = new HttpRequest();
    req.setEndpoint(URL.getOrgDomainUrl().toExternalForm() + '/services/data/v62.0/ssot/segments');
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');

    Map<String, Object> body = new Map<String, Object>();
    body.put('name', '${nameApex}');
    body.put('description', '${descApex}');
    body.put('criteria', '${criteriaApex}');
    body.put('publishSchedule', '${scheduleApex}');

    req.setBody(JSON.serialize(body));

    Http http = new Http();
    HttpResponse res = http.send(req);

    Map<String, Object> result = new Map<String, Object>();
    result.put('statusCode', res.getStatusCode());
    result.put('status', res.getStatus());

    try {
        result.put('data', JSON.deserializeUntyped(res.getBody()));
    } catch (Exception parseEx) {
        result.put('body', res.getBody());
    }

    result.put('success', res.getStatusCode() >= 200 && res.getStatusCode() < 300);
    System.debug('${MARKER}' + JSON.serialize(result) + '${MARKER}');
} catch (Exception e) {
    Map<String, String> err = new Map<String, String>();
    err.put('error', e.getMessage());
    err.put('type', e.getTypeName());
    System.debug('${MARKER}' + JSON.serialize(err) + '${MARKER}');
}
`;

    const result = await runApexAndExtract(apex, alias);
    return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Export all Data Cloud config tools as instances
// ---------------------------------------------------------------------------
export const dataCloudConfigTools = [
  new DcCreateIdentityResolutionTool(),
  new DcCreateSegmentTool(),
];
