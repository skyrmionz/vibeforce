/**
 * Config file I/O — read, write, and bootstrap ~/.harnessforce/models.yaml.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  type ModelConfig,
  type ModelProvider,
  getDefaultConfig,
  parseRawConfig,
} from './config.js';

/** Resolve the config directory path (~/.harnessforce). */
function configDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '~';
  return path.join(home, '.harnessforce');
}

/** Resolve the models.yaml path. */
export function configFilePath(): string {
  return path.join(configDir(), 'models.yaml');
}

/**
 * Ensure ~/.harnessforce/ exists and write the default models.yaml if it is
 * missing. Returns the path to the config file.
 */
export function ensureConfigFile(): string {
  const dir = configDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = configFilePath();
  if (!fs.existsSync(filePath)) {
    writeConfig(getDefaultConfig());
  }
  return filePath;
}

/** Convert a ModelConfig back into the YAML-friendly snake_case shape. */
function toYamlShape(
  config: ModelConfig
): Record<string, unknown> {
  const providers: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(config.providers)) {
    const entry: Record<string, unknown> = {
      type: p.type,
      models: p.models,
    };
    if (p.baseUrl) entry.base_url = p.baseUrl;
    if (p.apiKey) entry.api_key = p.apiKey;
    if (p.autoDiscover !== undefined) entry.auto_discover = p.autoDiscover;
    providers[name] = entry;
  }
  return {
    default_model: config.defaultModel,
    providers,
  };
}

/** Write a ModelConfig to ~/.harnessforce/models.yaml. */
export function writeConfig(config: ModelConfig): void {
  const dir = configDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = yaml.dump(toYamlShape(config), {
    lineWidth: 120,
    noRefs: true,
  });
  fs.writeFileSync(configFilePath(), content, 'utf-8');
}

/** Read the current config from disk (returns defaults if missing). Merges new default models. */
export function readConfig(): ModelConfig {
  const filePath = configFilePath();
  if (!fs.existsSync(filePath)) {
    return getDefaultConfig();
  }
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  const userConfig = parseRawConfig(raw as Parameters<typeof parseRawConfig>[0]);

  // Merge defaults: add missing providers (e.g. bedrock from env vars) and models
  const defaults = getDefaultConfig();
  for (const [providerName, defaultProvider] of Object.entries(defaults.providers)) {
    const userProvider = userConfig.providers[providerName];
    if (userProvider) {
      for (const model of defaultProvider.models) {
        if (!userProvider.models.includes(model)) {
          userProvider.models.push(model);
        }
      }
    } else {
      userConfig.providers[providerName] = defaultProvider;
    }
  }

  // Only auto-switch to bedrock if user hasn't explicitly chosen a different provider.
  // If the user config has an explicit default_model (read from disk), respect their choice.
  // Only override if the config still has the generic fallback default.
  const rawDefaultModel = (raw as any)?.default_model as string | undefined;
  const isExplicitUserChoice = rawDefaultModel && !rawDefaultModel.includes('claude-sonnet-4-20250514');
  if (!isExplicitUserChoice && userConfig.providers['bedrock-gateway'] && !userConfig.defaultModel.startsWith('bedrock-gateway:')) {
    userConfig.defaultModel = defaults.defaultModel;
  }

  return userConfig;
}

/** Set the persistent default model and write to disk. */
export function setDefaultModel(modelId: string): void {
  const config = readConfig();
  config.defaultModel = modelId;
  writeConfig(config);
}

/** Add or replace a provider in the config and persist. */
export function addProvider(name: string, provider: ModelProvider): void {
  const config = readConfig();
  config.providers[name] = provider;
  writeConfig(config);
}

/** Remove a provider from the config and persist. */
export function removeProvider(name: string): boolean {
  const config = readConfig();
  if (!(name in config.providers)) return false;
  delete config.providers[name];
  writeConfig(config);
  return true;
}
