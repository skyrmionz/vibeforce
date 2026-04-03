/**
 * MCP configuration — reads server definitions from ~/.harnessforce/mcp.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface McpServerConfig {
  /** Display name */
  name: string;
  /** Transport: "stdio" (default) */
  transport?: "stdio";
  /** Command to run (e.g. "npx") */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether this server is enabled */
  enabled?: boolean;
}

export interface McpConfig {
  servers: Record<string, McpServerConfig>;
}

const CONFIG_PATH = join(homedir(), ".harnessforce", "mcp.json");

export function loadMcpConfig(): McpConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { servers: {} };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as McpConfig;
  } catch {
    return { servers: {} };
  }
}

export function saveMcpConfig(config: McpConfig): void {
  const dir = join(homedir(), ".harnessforce");
  mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function addMcpServer(name: string, server: McpServerConfig): void {
  const config = loadMcpConfig();
  config.servers[name] = server;
  saveMcpConfig(config);
}

export function removeMcpServer(name: string): boolean {
  const config = loadMcpConfig();
  if (!(name in config.servers)) return false;
  delete config.servers[name];
  saveMcpConfig(config);
  return true;
}
