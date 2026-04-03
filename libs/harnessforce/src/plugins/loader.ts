/**
 * Plugin loader — discovers and loads plugins from ~/.harnessforce/plugins/
 *
 * Inspired by Claude Code's plugin system (~/.claude/plugins/).
 * Each plugin is a directory with an index.js that exports tools, hooks, or MCP server configs.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import type { StructuredToolInterface } from "@langchain/core/tools";

export interface HarnessforcePlugin {
  /** Plugin name (directory name) */
  name: string;
  /** Additional tools this plugin provides */
  tools?: StructuredToolInterface[];
  /** Hook handlers */
  hooks?: Record<string, (...args: any[]) => Promise<void>>;
  /** MCP server configs to auto-connect */
  mcpServers?: Record<string, { command: string; args?: string[] }>;
}

export interface LoadedPlugins {
  plugins: HarnessforcePlugin[];
  tools: StructuredToolInterface[];
  errors: Array<{ name: string; error: string }>;
}

const PLUGINS_DIR = join(homedir(), ".harnessforce", "plugins");

/**
 * Discover and load all plugins.
 */
export async function loadPlugins(): Promise<LoadedPlugins> {
  const result: LoadedPlugins = { plugins: [], tools: [], errors: [] };

  if (!existsSync(PLUGINS_DIR)) return result;

  const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = join(PLUGINS_DIR, entry.name);
    const indexPath = join(pluginDir, "index.js");

    if (!existsSync(indexPath)) {
      result.errors.push({ name: entry.name, error: "Missing index.js" });
      continue;
    }

    try {
      const pluginUrl = pathToFileURL(indexPath).href;
      const mod = await import(pluginUrl);

      const plugin: HarnessforcePlugin = {
        name: entry.name,
        tools: mod.tools ?? mod.default?.tools,
        hooks: mod.hooks ?? mod.default?.hooks,
        mcpServers: mod.mcpServers ?? mod.default?.mcpServers,
      };

      result.plugins.push(plugin);

      if (plugin.tools) {
        result.tools.push(...plugin.tools);
      }
    } catch (err: any) {
      result.errors.push({ name: entry.name, error: err.message });
    }
  }

  return result;
}

/**
 * List installed plugins (without loading them).
 */
export function listPluginDirs(): string[] {
  if (!existsSync(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(PLUGINS_DIR, e.name, "index.js")))
    .map(e => e.name);
}
