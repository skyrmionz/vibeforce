/**
 * Data Cloud query tools — 3 LangChain StructuredTools.
 *
 * Uses ConnectApi.CdpQuery via anonymous Apex to execute ANSI SQL
 * against Data Cloud (DLOs, DMOs, CIOs).
 *
 * Ported from buildify-skills/data-360 bash scripts.
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
 * Returns the parsed object, or throws on failure.
 */
async function runApexAndExtract<T = unknown>(
  apexCode: string,
  alias?: string,
): Promise<T> {
  const tmpFile = join(tmpdir(), `dc-${randomUUID()}.apex`);
  await writeFile(tmpFile, apexCode, "utf-8");

  try {
    const result = await runSfCommand("apex", ["run", "--file", tmpFile], {
      alias,
      timeout: 120_000, // Data Cloud queries can be slow
    });

    const raw = result.raw;

    // Extract logs from JSON output (sf apex run --json)
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

    // Find the last @@@...@@@ payload (the USER_DEBUG line, not the source echo)
    const matches = logs.match(new RegExp(`${MARKER}([^@]+)${MARKER}`, "g"));
    if (!matches || matches.length === 0) {
      throw new Error(
        `No ${MARKER}-delimited payload found in Apex output. Raw output:\n${raw.slice(0, 2000)}`,
      );
    }

    const lastMatch = matches[matches.length - 1];
    const jsonStr = lastMatch.slice(MARKER.length, -MARKER.length);
    const payload = JSON.parse(jsonStr) as T;

    // Check for Apex-level error
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

/**
 * Base64-encode a string (Node.js Buffer).
 * Used to safely embed SQL in Apex without shell/quote escaping issues.
 */
function base64Encode(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

// ---------------------------------------------------------------------------
// 1. dc_query
// ---------------------------------------------------------------------------

interface DcQueryResult {
  rowCount: number;
  data: string[][];
  metadata: Record<
    string,
    { placeInOrder: number; type: string; typeCode: number }
  >;
}

export class DcQueryTool extends StructuredTool {
  name = "dc_query";
  description =
    "Execute ANSI SQL against Data Cloud (NOT SOQL). Use for querying DLOs (__dll), DMOs (__dlm), and CIOs (__cio). Run dc_describe first to confirm field names.";
  schema = z.object({
    sql: z
      .string()
      .describe(
        'ANSI SQL query (e.g. "SELECT ssot__FirstName__c FROM ssot__Individual__dlm LIMIT 10")',
      ),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ sql, alias }: z.infer<typeof this.schema>): Promise<string> {
    const sqlB64 = base64Encode(sql);

    const apex = `
try {
    ConnectApi.QuerySqlInput query = new ConnectApi.QuerySqlInput();
    query.sql = EncodingUtil.base64Decode('${sqlB64}').toString();
    ConnectApi.QuerySqlOutput queryOutput = ConnectApi.CdpQuery.querySql(query, 'dc-query', 'default');
    ConnectApi.QuerySqlStatus status = queryOutput.status;
    while (status.completionStatus != ConnectApi.QuerySqlStatusEnum.FINISHED) {
        status = ConnectApi.CdpQuery.querySqlStatus(status.queryId, 'dc-query', 'default');
    }
    List<List<String>> rows = new List<List<String>>();
    Integer numProcessed = 0;
    Integer chunkSize = 10000;
    ConnectApi.QuerySqlPageOutput lastPage = null;
    while (numProcessed < status.rowCount) {
        ConnectApi.QuerySqlPageOutput pageOutput = ConnectApi.CdpQuery.querySqlRows(status.queryId, numProcessed, chunkSize, 'dc-query', 'default');
        lastPage = pageOutput;
        for (ConnectApi.QuerySqlRow rowObj : pageOutput.dataRows) {
            List<String> row = new List<String>();
            for (Object o : rowObj.row) {
                row.add(o != null ? String.valueOf(o) : null);
            }
            rows.add(row);
        }
        numProcessed += pageOutput.dataRows.size();
        if (pageOutput.dataRows.isEmpty()) break;
    }
    Map<String, Map<String, Object>> meta = new Map<String, Map<String, Object>>();
    if (!rows.isEmpty() && lastPage != null && lastPage.metadata != null) {
        for (Integer i = 0; i < lastPage.metadata.size(); i++) {
            ConnectApi.QuerySqlMetadataItem m = lastPage.metadata[i];
            Map<String, Object> item = new Map<String, Object>();
            item.put('placeInOrder', i);
            item.put('type', m.type != null ? String.valueOf(m.type) : 'VARCHAR');
            item.put('typeCode', 12);
            meta.put(m.name != null ? m.name : ('col' + i), item);
        }
    } else if (!rows.isEmpty()) {
        for (Integer i = 0; i < rows[0].size(); i++) {
            Map<String, Object> item = new Map<String, Object>();
            item.put('placeInOrder', i);
            item.put('type', 'VARCHAR');
            item.put('typeCode', 12);
            meta.put('col' + i, item);
        }
    }
    Map<String, Object> result = new Map<String, Object>();
    result.put('rowCount', status.rowCount);
    result.put('data', rows);
    result.put('metadata', meta);
    String json = JSON.serialize(result);
    System.debug('${MARKER}' + json + '${MARKER}');
} catch (Exception e) {
    Map<String, String> err = new Map<String, String>();
    err.put('error', e.getMessage());
    err.put('type', e.getTypeName());
    System.debug('${MARKER}' + JSON.serialize(err) + '${MARKER}');
}
`;

    const result = await runApexAndExtract<DcQueryResult>(apex, alias);
    return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 2. dc_list_objects
// ---------------------------------------------------------------------------

interface DcObjectInfo {
  name: string;
  label: string;
  type?: string;
}

export class DcListObjectsTool extends StructuredTool {
  name = "dc_list_objects";
  description =
    "List all Data Cloud objects: DLOs (__dll), DMOs (__dlm), and CIOs (__cio). Uses pg_catalog query with fallback to Schema.getGlobalDescribe().";
  schema = z.object({
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ alias }: z.infer<typeof this.schema>): Promise<string> {
    // Primary approach: pg_catalog query (works for DLOs which aren't in org schema)
    const pgSql =
      "SELECT relname FROM pg_catalog.pg_class WHERE relkind = 'v' AND (relname LIKE '%__dlm' OR relname LIKE '%__dll' OR relname LIKE '%__cio') ORDER BY relname";

    try {
      const queryTool = new DcQueryTool();
      const rawResult = await queryTool._call({ sql: pgSql, alias });
      const parsed = JSON.parse(rawResult) as DcQueryResult;

      if (parsed.data && parsed.data.length > 0) {
        const objects: DcObjectInfo[] = parsed.data.map((row) => {
          const name = row[0];
          let type = "unknown";
          if (name.endsWith("__dlm")) type = "DMO";
          else if (name.endsWith("__dll")) type = "DLO";
          else if (name.endsWith("__cio")) type = "CIO";
          return { name, label: name, type };
        });
        return JSON.stringify(objects, null, 2);
      }
    } catch {
      // Fall through to Schema.getGlobalDescribe() fallback
    }

    // Fallback: Schema.getGlobalDescribe()
    const apex = `
List<Map<String, String>> objects = new List<Map<String, String>>();
for (Schema.SObjectType objType : Schema.getGlobalDescribe().values()) {
    String name = objType.getDescribe().getName();
    if (name.endsWith('__dlm') || name.endsWith('__dll') || name.endsWith('__cio')) {
        Map<String, String> m = new Map<String, String>();
        m.put('name', name);
        m.put('label', objType.getDescribe().getLabel());
        String objTypeName = 'unknown';
        if (name.endsWith('__dlm')) objTypeName = 'DMO';
        else if (name.endsWith('__dll')) objTypeName = 'DLO';
        else if (name.endsWith('__cio')) objTypeName = 'CIO';
        m.put('type', objTypeName);
        objects.add(m);
    }
}
String output = System.JSON.serialize(objects);
System.debug('${MARKER}' + output + '${MARKER}');
`;

    const result = await runApexAndExtract<DcObjectInfo[]>(apex, alias);
    return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 3. dc_describe
// ---------------------------------------------------------------------------

export class DcDescribeTool extends StructuredTool {
  name = "dc_describe";
  description =
    "Get the schema (column names and types) for a Data Cloud table. Uses pg_catalog metadata query.";
  schema = z.object({
    tableName: z
      .string()
      .describe(
        "Data Cloud table name (e.g. ssot__Individual__dlm, TenantBillingUsageEvent__dll)",
      ),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    tableName,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    // Escape single quotes in table name for SQL safety
    const safeTable = tableName.replace(/'/g, "''");

    // pg_catalog query to get column names and types
    const sql = `SELECT a.attname, t.typname FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_class c ON (c.relnamespace = n.oid) JOIN pg_catalog.pg_attribute a ON (a.attrelid = c.oid) JOIN pg_catalog.pg_type t ON (a.atttypid = t.oid) WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relname='${safeTable}'`;

    const queryTool = new DcQueryTool();
    const rawResult = await queryTool._call({ sql, alias });
    const parsed = JSON.parse(rawResult) as DcQueryResult;

    // Transform into a more readable schema format
    const columns = parsed.data.map((row) => ({
      name: row[0],
      type: row[1] ?? "unknown",
    }));

    return JSON.stringify(
      {
        tableName,
        columnCount: columns.length,
        columns,
      },
      null,
      2,
    );
  }
}

// ---------------------------------------------------------------------------
// Export all Data Cloud query tools as instances
// ---------------------------------------------------------------------------
export const dataCloudQueryTools = [
  new DcQueryTool(),
  new DcListObjectsTool(),
  new DcDescribeTool(),
];
