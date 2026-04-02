/**
 * Salesforce discovery tools — 3 LangChain StructuredTools.
 *
 * Tools for exploring org metadata:
 *   sf_list_metadata_types, sf_describe_all_sobjects, sf_list_metadata_of_type
 */

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { runSfCommand } from "./sf-cli.js";

// ---------------------------------------------------------------------------
// 1. sf_list_metadata_types
// ---------------------------------------------------------------------------
export class SfListMetadataTypesTool extends StructuredTool {
  name = "sf_list_metadata_types";
  description =
    "List all metadata types available in a Salesforce org";
  schema = z.object({
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ alias }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand("org", ["list", "metadata-types"], {
      alias,
    });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 2. sf_describe_all_sobjects
// ---------------------------------------------------------------------------
export class SfDescribeAllSobjectsTool extends StructuredTool {
  name = "sf_describe_all_sobjects";
  description =
    "List all sObjects available in a Salesforce org";
  schema = z.object({
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({ alias }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand("sobject", ["list"], { alias });
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 3. sf_list_metadata_of_type
// ---------------------------------------------------------------------------
export class SfListMetadataOfTypeTool extends StructuredTool {
  name = "sf_list_metadata_of_type";
  description =
    "List all metadata components of a specific type in a Salesforce org";
  schema = z.object({
    metadataType: z
      .string()
      .describe("Metadata type name (e.g. ApexClass, CustomObject, Flow)"),
    alias: z
      .string()
      .optional()
      .describe("Org alias or username (defaults to current default org)"),
  });

  async _call({
    metadataType,
    alias,
  }: z.infer<typeof this.schema>): Promise<string> {
    const result = await runSfCommand(
      "org",
      ["list", "metadata", "--metadata-type", metadataType],
      { alias },
    );
    return JSON.stringify(result.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Export all 3 discovery tools as instances
// ---------------------------------------------------------------------------
export const discoveryTools = [
  new SfListMetadataTypesTool(),
  new SfDescribeAllSobjectsTool(),
  new SfListMetadataOfTypeTool(),
];
