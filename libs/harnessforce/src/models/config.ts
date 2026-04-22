/**
 * Model configuration types and loader.
 *
 * Config is stored in ~/.harnessforce/models.yaml and supports environment
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
  // Phase 7A: Prefer enterprise Bedrock gateway > direct Anthropic > OpenRouter
  const hasBedrockGateway = !!process.env.ANTHROPIC_AUTH_TOKEN && !!process.env.ANTHROPIC_BEDROCK_BASE_URL;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const defaultModel = hasBedrockGateway
    ? 'bedrock-gateway:us.anthropic.claude-opus-4-6-v1'
    : hasAnthropicKey
      ? 'anthropic:claude-opus-4.6'
      : 'openrouter:anthropic/claude-opus-4.6';
  return {
    defaultModel,
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
          // Mistral
          'mistralai/devstral-2',
          // Free models
          'qwen/qwen3.6-plus-preview:free',
          'nvidia/nemotron-3-super-120b-a12b:free',
          'google/gemma-3-27b-it:free',
          'meta-llama/llama-4-scout:free',
          'deepseek/deepseek-chat-v3-0324:free',
        ],
      },
      // Phase 7A: Direct Anthropic provider (no OpenRouter markup, ~15-30% cheaper)
      ...(hasAnthropicKey
        ? {
            anthropic: {
              name: 'anthropic',
              type: 'cloud' as const,
              apiKey: '${ANTHROPIC_API_KEY}',
              models: [
                'claude-opus-4.6',
                'claude-sonnet-4.6',
                'claude-haiku-4.5',
              ],
            },
          }
        : {}),
      // Enterprise Bedrock via LLM Gateway Express (zero-cost for enterprise users)
      ...(hasBedrockGateway
        ? {
            'bedrock-gateway': {
              name: 'bedrock-gateway',
              type: 'gateway' as const,
              baseUrl: '${ANTHROPIC_BEDROCK_BASE_URL}',
              apiKey: '${ANTHROPIC_AUTH_TOKEN}',
              models: [
                'us.anthropic.claude-opus-4-6-v1',
                'us.anthropic.claude-sonnet-4-6-v1',
                'us.anthropic.claude-haiku-4-5-20251001-v1:0',
              ],
            },
          }
        : {}),
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
 * If no path is given the default ~/.harnessforce/models.yaml is used.
 * If the file does not exist the built-in default config is returned.
 */
export function loadModelConfig(configPath?: string): ModelConfig {
  const resolvedPath =
    configPath ??
    path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? '~',
      '.harnessforce',
      'models.yaml'
    );

  if (!fs.existsSync(resolvedPath)) {
    return getDefaultConfig();
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const raw = yaml.load(content) as RawYamlConfig;
  const userConfig = parseRawConfig(raw);

  // Merge default models into user config so new models are available
  const defaults = getDefaultConfig();
  for (const [providerName, defaultProvider] of Object.entries(defaults.providers)) {
    const userProvider = userConfig.providers[providerName];
    if (userProvider) {
      // Add any models from defaults that the user doesn't already have
      for (const model of defaultProvider.models) {
        if (!userProvider.models.includes(model)) {
          userProvider.models.push(model);
        }
      }
    }
  }

  return userConfig;
}
