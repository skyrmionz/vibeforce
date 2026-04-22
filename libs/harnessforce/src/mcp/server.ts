/**
 * MCP Server — exposes Harnessforce tools and SF knowledge as an MCP server.
 *
 * Enables Claude Code users to access all Salesforce tools through their
 * existing Claude subscription at zero additional LLM cost.
 *
 * Usage:
 *   harnessforce serve
 *
 * Claude Code config (~/.claude/mcp.json):
 *   { "mcpServers": { "harnessforce": { "command": "npx", "args": ["harnessforce", "serve"] } } }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { allTools } from "../tools/index.js";
import { TOOL_RISK_MAP } from "../middleware/permissions.js";
import type { StructuredToolInterface } from "@langchain/core/tools";

const KNOWLEDGE_TOPICS = [
  "governor-limits",
  "trigger-patterns",
  "testing",
  "flows",
  "lwc",
  "soql",
  "api-strategy",
  "deployment",
  "apex-architecture",
  "integration",
  "metadata-patterns",
  "agentforce",
  "data-cloud",
  "self-discovery",
  "unsupported-metadata",
  "extensibility",
];

function riskToAnnotations(toolName: string): Record<string, boolean> {
  const risk = TOOL_RISK_MAP[toolName];
  if (risk === "read")
    return { readOnlyHint: true, destructiveHint: false };
  if (risk === "destructive")
    return { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
  return { readOnlyHint: false, destructiveHint: false };
}

// ---------------------------------------------------------------------------
// Zod → JSON Schema converter (handles common LangChain tool schemas)
// ---------------------------------------------------------------------------

function isOptional(schema: any): boolean {
  const tn = schema?._def?.typeName;
  return tn === "ZodOptional" || tn === "ZodDefault";
}

function zodFieldToSchema(schema: any): Record<string, any> {
  const def = schema?._def;
  if (!def) return { type: "string" };

  const result: Record<string, any> = {};

  switch (def.typeName) {
    case "ZodString":
      result.type = "string";
      break;
    case "ZodNumber":
      result.type = "number";
      break;
    case "ZodBoolean":
      result.type = "boolean";
      break;
    case "ZodArray":
      result.type = "array";
      result.items = zodFieldToSchema(def.type);
      break;
    case "ZodEnum":
      result.type = "string";
      result.enum = def.values;
      break;
    case "ZodOptional":
    case "ZodDefault":
      return zodFieldToSchema(def.innerType);
    case "ZodRecord":
      result.type = "object";
      result.additionalProperties = true;
      break;
    default:
      result.type = "string";
  }

  if (def.description) result.description = def.description;
  return result;
}

function zodToJsonSchema(zodSchema: any): Record<string, any> {
  try {
    const def = zodSchema?._def;
    if (!def) return { type: "object", properties: {} };

    if (def.typeName === "ZodObject") {
      const shape =
        typeof def.shape === "function" ? def.shape() : def.shape;
      if (!shape) return { type: "object", properties: {} };

      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(
        shape as Record<string, any>,
      )) {
        properties[key] = zodFieldToSchema(value);
        if (!isOptional(value)) required.push(key);
      }

      const result: Record<string, any> = { type: "object", properties };
      if (required.length > 0) result.required = required;
      return result;
    }

    return zodFieldToSchema(zodSchema);
  } catch {
    return { type: "object", properties: {} };
  }
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: "harnessforce", version: "1.8.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ── List Tools ────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = (allTools as StructuredToolInterface[]).map((t: any) => {
      const name: string = t.name;
      const description: string = t.description ?? "";
      const inputSchema = zodToJsonSchema(t.schema);
      return {
        name,
        description,
        inputSchema,
        annotations: riskToAnnotations(name),
      };
    });
    return { tools };
  });

  // ── Call Tool ─────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const lcTool = (allTools as StructuredToolInterface[]).find(
      (t: any) => t.name === name,
    );
    if (!lcTool) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await lcTool.invoke(args ?? {});
      const text =
        typeof result === "string" ? result : JSON.stringify(result);
      return { content: [{ type: "text" as const, text }] };
    } catch (err: any) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${err.message}` },
        ],
        isError: true,
      };
    }
  });

  // ── List Resources (SF Knowledge) ─────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: KNOWLEDGE_TOPICS.map((topic) => ({
        uri: `sf-knowledge://${topic}`,
        name: `Salesforce: ${topic}`,
        description: `Deep platform knowledge on ${topic}`,
        mimeType: "text/plain",
      })),
    };
  });

  // ── Read Resource ─────────────────────────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const topic = uri.replace("sf-knowledge://", "");

    const { sfKnowledgeTool } = await import("../tools/sf-knowledge.js");
    const content = await sfKnowledgeTool.invoke({ topic });

    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text:
            typeof content === "string"
              ? content
              : JSON.stringify(content),
        },
      ],
    };
  });

  // ── Start ─────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
