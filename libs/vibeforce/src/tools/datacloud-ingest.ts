/**
 * Data Cloud Ingestion tools — 2 LangChain StructuredTools.
 *
 * Supports both Streaming Ingestion API (JSON, near real-time) and
 * Bulk Ingestion API (CSV, batch processing).
 *
 * Both APIs require OAuth with `cdp_ingest_api` scope. The tools use
 * the Salesforce CLI's authenticated session to obtain access tokens.
 */

import { readFile } from "node:fs/promises";
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { runSfCommand } from "./sf-cli.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OrgInfo {
  instanceUrl: string;
  accessToken: string;
}

/**
 * Get the instance URL and access token from the current SF CLI session.
 * Uses `sf org display` to retrieve connection details.
 */
async function getOrgInfo(alias?: string): Promise<OrgInfo> {
  const result = await runSfCommand("org", ["display"], { alias });
  const data = result.data as Record<string, unknown>;

  const instanceUrl =
    (data.instanceUrl as string) ??
    (data.result as Record<string, unknown>)?.instanceUrl;
  const accessToken =
    (data.accessToken as string) ??
    (data.result as Record<string, unknown>)?.accessToken;

  if (!instanceUrl || !accessToken) {
    throw new Error(
      "Could not retrieve instanceUrl/accessToken from org. Ensure you are authenticated.",
    );
  }

  return { instanceUrl: instanceUrl.replace(/\/$/, ""), accessToken };
}

/**
 * Make an authenticated HTTP request to a Salesforce Data Cloud API endpoint.
 */
async function dcFetch(
  org: OrgInfo,
  path: string,
  options: {
    method?: string;
    body?: string;
    contentType?: string;
  } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { method = "GET", body, contentType = "application/json" } = options;

  const url = `${org.instanceUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${org.accessToken}`,
    "Content-Type": contentType,
  };

  const response = await fetch(url, {
    method,
    headers,
    ...(body ? { body } : {}),
  });

  let data: unknown;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = { output: text };
  }

  return { ok: response.ok, status: response.status, data };
}

// ---------------------------------------------------------------------------
// 1. dc_ingest_streaming
// ---------------------------------------------------------------------------

export class DcIngestStreamingTool extends StructuredTool {
  name = "dc_ingest_streaming";
  description =
    "Push JSON records to Data Cloud via the Streaming Ingestion API. Near real-time ingestion (~15 min latency). Requires a configured Ingestion API connector and Data Stream in the org.";
  schema = z.object({
    connectorName: z
      .string()
      .describe(
        "The API name of the Ingestion API connector (created in Data Cloud setup)",
      ),
    objectName: z
      .string()
      .describe(
        "The object/schema name within the connector (e.g. runner_profiles)",
      ),
    records: z
      .array(z.record(z.string(), z.unknown()))
      .describe("Array of JSON records to ingest"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    connectorName,
    objectName,
    records,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const org = await getOrgInfo(alias);

    const path = `/api/v1/ingest/sources/${encodeURIComponent(connectorName)}/objects/${encodeURIComponent(objectName)}`;
    const body = JSON.stringify({ data: records });

    const result = await dcFetch(org, path, {
      method: "POST",
      body,
    });

    if (!result.ok) {
      return JSON.stringify(
        {
          success: false,
          status: result.status,
          error: result.data,
          hint: "Ensure the Ingestion API connector and Data Stream are configured in Data Cloud setup. The connector name and object name must match exactly.",
        },
        null,
        2,
      );
    }

    return JSON.stringify(
      {
        success: true,
        status: result.status,
        recordCount: records.length,
        data: result.data,
      },
      null,
      2,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. dc_ingest_bulk
// ---------------------------------------------------------------------------

export class DcIngestBulkTool extends StructuredTool {
  name = "dc_ingest_bulk";
  description =
    "Push CSV data to Data Cloud via the Bulk Ingestion API. Creates a job, uploads the CSV, and closes the job. Suitable for large data loads.";
  schema = z.object({
    connectorName: z
      .string()
      .describe(
        "The API name of the Ingestion API connector (created in Data Cloud setup)",
      ),
    objectName: z
      .string()
      .describe(
        "The object/schema name within the connector (e.g. runner_profiles)",
      ),
    csvPath: z
      .string()
      .describe("Absolute path to the CSV file to upload"),
    operation: z
      .enum(["upsert", "delete"])
      .optional()
      .default("upsert")
      .describe('Operation type: "upsert" (default) or "delete"'),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    connectorName,
    objectName,
    csvPath,
    operation,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const org = await getOrgInfo(alias);
    const basePath = `/api/v1/ingest/sources/${encodeURIComponent(connectorName)}/objects/${encodeURIComponent(objectName)}`;

    // Step 1: Create a bulk ingestion job
    const createResult = await dcFetch(org, `${basePath}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        object: objectName,
        operation: operation ?? "upsert",
      }),
    });

    if (!createResult.ok) {
      return JSON.stringify(
        {
          success: false,
          step: "create_job",
          status: createResult.status,
          error: createResult.data,
        },
        null,
        2,
      );
    }

    const jobData = createResult.data as Record<string, unknown>;
    const jobId = jobData.id as string;

    if (!jobId) {
      return JSON.stringify(
        {
          success: false,
          step: "create_job",
          error: "No job ID returned",
          data: jobData,
        },
        null,
        2,
      );
    }

    // Step 2: Upload CSV data
    let csvContent: string;
    try {
      csvContent = await readFile(csvPath, "utf-8");
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          step: "read_csv",
          error: `Could not read CSV file: ${(err as Error).message}`,
          jobId,
        },
        null,
        2,
      );
    }

    const uploadResult = await dcFetch(
      org,
      `${basePath}/jobs/${encodeURIComponent(jobId)}/batches`,
      {
        method: "PUT",
        body: csvContent,
        contentType: "text/csv",
      },
    );

    if (!uploadResult.ok) {
      // Attempt to abort the job on upload failure
      await dcFetch(org, `${basePath}/jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "Aborted" }),
      }).catch(() => {});

      return JSON.stringify(
        {
          success: false,
          step: "upload_csv",
          status: uploadResult.status,
          error: uploadResult.data,
          jobId,
        },
        null,
        2,
      );
    }

    // Step 3: Close the job to trigger processing
    const closeResult = await dcFetch(
      org,
      `${basePath}/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ state: "UploadComplete" }),
      },
    );

    if (!closeResult.ok) {
      return JSON.stringify(
        {
          success: false,
          step: "close_job",
          status: closeResult.status,
          error: closeResult.data,
          jobId,
        },
        null,
        2,
      );
    }

    return JSON.stringify(
      {
        success: true,
        jobId,
        state: "UploadComplete",
        message:
          "Bulk ingestion job created and CSV uploaded. Data will be processed asynchronously.",
      },
      null,
      2,
    );
  }
}

// ---------------------------------------------------------------------------
// Export all Data Cloud ingestion tools as instances
// ---------------------------------------------------------------------------
export const dataCloudIngestTools = [
  new DcIngestStreamingTool(),
  new DcIngestBulkTool(),
];
