/**
 * Model configuration types and loader.
 *
 * Config is stored in ~/.vibeforce/models.yaml and supports environment
 * variable references (${VAR}) for API keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface ModelProvider {
  name: string;
  type: 'cloud' | 'local' | 'gateway';
  baseUrl?: string;
  apiKey?: string; // Can reference env vars: "${ANTHROPIC_API_KEY}"
  models: string[];
  autoDiscover?: boolean; // For Ollama: list models dynamically
}

export interface ModelConfig {
  defaultModel: string; // "anthropic:claude-opus-4.6"
  providers: Record<string, ModelProvider>;
}

/**
 * Resolve ${ENV_VAR} references in a string to the actual env value.
 * Returns the original string if no pattern is matched.
 */
export function resolveApiKey(key: string): string {
  const envVarPattern = /^\$\{(\w+)\}$/;
  const match = key.match(envVarPattern);
  if (match) {
    const envName = match[1];
    const value = process.env[envName];
    if (!value) {
      return "";
    }
    return value;
  }
  return key;
}

/**
 * Return the built-in default configuration (Anthropic + OpenAI).
 * API keys are env-var references that get resolved at call time.
 */
export function getDefaultConfig(): ModelConfig {
  return {
    defaultModel: 'openrouter:anthropic/claude-4.6-sonnet-20260217',
    providers: {
      openrouter: {
        name: 'openrouter',
        type: 'gateway',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '${OPENROUTER_API_KEY}',
        models: [
          // Anthropic (Apr 2026)
          'anthropic/claude-opus-4.6',
          'anthropic/claude-4.6-sonnet-20260217',
          'anthropic/claude-haiku-4',
          // OpenAI
          'openai/gpt-5.4',
          'openai/gpt-5.4-pro',
          // Google
          'google/gemini-3.1-pro-preview',
          'google/gemini-3.1-flash-lite-preview',
          // xAI
          'x-ai/grok-4.20-beta',
          'x-ai/grok-4.1-fast',
          // DeepSeek
          'deepseek/deepseek-v3.2',
          // Meta
          'meta-llama/llama-4-maverick',
          // Qwen (free)
          'qwen/qwen3.6-plus-preview:free',
          // Mistral
          'mistralai/devstral-2',
          // Free tier
          'nvidia/nemotron-3-super-120b-a12b:free',
        ],
      },
    },
  };
}

/**
 * Raw YAML shape before we normalise into ModelConfig.
 */
interface RawYamlConfig {
  default_model?: string;
  providers?: Record<
    string,
    {
      type?: string;
      base_url?: string;
      api_key?: string;
      models?: string[];
      auto_discover?: boolean;
    }
  >;
}

/**
 * Convert the raw YAML (snake_case) into our TypeScript ModelConfig.
 */
export function parseRawConfig(raw: RawYamlConfig): ModelConfig {
  const providers: Record<string, ModelProvider> = {};

  if (raw.providers) {
    for (const [name, p] of Object.entries(raw.providers)) {
      providers[name] = {
        name,
        type: (p.type as ModelProvider['type']) ?? 'cloud',
        baseUrl: p.base_url,
        apiKey: p.api_key,
        models: p.models ?? [],
        autoDiscover: p.auto_discover,
      };
    }
  }

  return {
    defaultModel: raw.default_model ?? 'anthropic:claude-sonnet-4-20250514',
    providers,
  };
}

/**
 * Load model config from a YAML file path.
 *
 * If no path is given the default ~/.vibeforce/models.yaml is used.
 * If the file does not exist the built-in default config is returned.
 */
export function loadModelConfig(configPath?: string): ModelConfig {
  const resolvedPath =
    configPath ??
    path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? '~',
      '.vibeforce',
      'models.yaml'
    );

  if (!fs.existsSync(resolvedPath)) {
    return getDefaultConfig();
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const raw = yaml.load(content) as RawYamlConfig;
  return parseRawConfig(raw);
}
