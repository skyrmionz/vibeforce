/**
 * MCP Client — connects to MCP servers and wraps their tools as LangChain StructuredTools.
 *
 * Inspired by Claude Code's MCP integration (25 dirs under services/mcp/).
 * Simplified for Harnessforce: stdio transport only.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { McpServerConfig } from "./config.js";

interface ConnectedServer {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  tools: StructuredToolInterface[];
}

const connectedServers = new Map<string, ConnectedServer>();

/**
 * Connect to an MCP server and discover its tools.
 */
export async function connectMcpServer(
  name: string,
  config: McpServerConfig,
): Promise<StructuredToolInterface[]> {
  // Already connected?
  if (connectedServers.has(name)) {
    return connectedServers.get(name)!.tools;
  }

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
  });

  const client = new Client({
    name: `harnessforce-${name}`,
    version: "1.0.0",
  });

  await client.connect(transport);

  // Discover tools
  const { tools: mcpTools } = await client.listTools();
  const wrappedTools: StructuredToolInterface[] = [];

  for (const mcpTool of mcpTools) {
    // Convert MCP tool schema to a LangChain tool
    const lcTool = tool(
      async (args) => {
        try {
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: args,
          });
          // Extract text content from result
          if (Array.isArray(result.content)) {
            return result.content
              .map((c: any) => (c.type === "text" ? c.text : JSON.stringify(c)))
              .join("\n");
          }
          return JSON.stringify(result.content);
        } catch (err: any) {
          return `Error calling ${mcpTool.name}: ${err.message}`;
        }
      },
      {
        name: `mcp_${name}_${mcpTool.name}`,
        description: mcpTool.description ?? `MCP tool from ${name}: ${mcpTool.name}`,
        schema: z.record(z.unknown()),
      },
    );
    wrappedTools.push(lcTool as unknown as StructuredToolInterface);
  }

  connectedServers.set(name, { name, client, transport, tools: wrappedTools });
  return wrappedTools;
}

/**
 * Connect to all configured MCP servers and return all discovered tools.
 */
export async function connectAllMcpServers(
  servers: Record<string, McpServerConfig>,
): Promise<StructuredToolInterface[]> {
  const allTools: StructuredToolInterface[] = [];

  for (const [name, config] of Object.entries(servers)) {
    if (config.enabled === false) continue;
    try {
      const tools = await connectMcpServer(name, config);
      allTools.push(...tools);
    } catch (err: any) {
      // Log but don't fail — one broken server shouldn't block others
      console.error(`  MCP server "${name}" failed to connect: ${err.message}`);
    }
  }

  return allTools;
}

/**
 * Disconnect a specific MCP server.
 */
export async function disconnectMcpServer(name: string): Promise<void> {
  const server = connectedServers.get(name);
  if (server) {
    try {
      await server.transport.close();
    } catch { /* best-effort */ }
    connectedServers.delete(name);
  }
}

/**
 * Disconnect all MCP servers (for graceful shutdown).
 */
export async function disconnectAllMcpServers(): Promise<void> {
  for (const [name] of connectedServers) {
    await disconnectMcpServer(name);
  }
}

/**
 * List currently connected servers and their tool counts.
 */
export function listConnectedServers(): Array<{ name: string; toolCount: number }> {
  return [...connectedServers.entries()].map(([name, server]) => ({
    name,
    toolCount: server.tools.length,
  }));
}
