/**
 * Model Provider Registry — instantiate and manage LangChain chat models.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type ModelConfig, type ModelProvider, resolveApiKey } from './config.js';
import { TIMEOUTS } from '../config/timeouts.js';

export interface ModelInfo {
  id: string; // e.g. "anthropic:claude-opus-4.6"
  provider: string;
  model: string;
  type: ModelProvider['type'];
}

export class ModelRegistry {
  private config: ModelConfig;
  private modelCache = new Map<string, BaseChatModel>();

  constructor(config: ModelConfig) {
    this.config = config;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /**
   * Get a LangChain ChatModel for a given model ID.
   *
   * Model ID format: "provider:model" — e.g. "anthropic:claude-opus-4.6".
   * If only the model name is given we search all providers.
   */
  getModel(modelId: string): BaseChatModel {
    const cached = this.modelCache.get(modelId);
    if (cached) return cached;

    const { providerName, modelName } = this.resolveModelId(modelId);
    const provider = this.config.providers[providerName];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    const model = this.instantiateModel(provider, modelName);
    this.modelCache.set(modelId, model);
    return model;
  }

  /** List all available models across all providers. */
  listModels(): ModelInfo[] {
    const result: ModelInfo[] = [];
    for (const [providerName, provider] of Object.entries(this.config.providers)) {
      for (const model of provider.models) {
        result.push({
          id: `${providerName}:${model}`,
          provider: providerName,
          model,
          type: provider.type,
        });
      }
    }
    return result;
  }

  /** Add or replace a provider at runtime. */
  addProvider(name: string, provider: ModelProvider): void {
    this.config.providers[name] = provider;
    // Invalidate cached models for this provider
    for (const key of this.modelCache.keys()) {
      if (key.startsWith(`${name}:`)) {
        this.modelCache.delete(key);
      }
    }
  }

  /** Test connectivity to a model by sending a tiny prompt. */
  async testModel(modelId: string): Promise<boolean> {
    try {
      const model = this.getModel(modelId);
      await model.invoke('Say "ok"');
      return true;
    } catch {
      return false;
    }
  }

  /** Get the current default model ID. */
  get defaultModel(): string {
    return this.config.defaultModel;
  }

  /** Update the in-memory default model. */
  setDefaultModel(modelId: string): void {
    this.config.defaultModel = modelId;
  }

  /** Get a copy of the current config. */
  getConfig(): ModelConfig {
    return structuredClone(this.config);
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private resolveModelId(modelId: string): {
    providerName: string;
    modelName: string;
  } {
    if (modelId.includes(':')) {
      const [providerName, ...rest] = modelId.split(':');
      return { providerName, modelName: rest.join(':') };
    }

    // Search all providers for this model name
    for (const [providerName, provider] of Object.entries(this.config.providers)) {
      if (provider.models.includes(modelId)) {
        return { providerName, modelName: modelId };
      }
    }

    throw new Error(
      `Model "${modelId}" not found in any provider. Use "provider:model" format or add the model to a provider.`
    );
  }

  private instantiateModel(
    provider: ModelProvider,
    modelName: string
  ): BaseChatModel {
    const apiKey = provider.apiKey ? resolveApiKey(provider.apiKey) : undefined;
    const baseUrl = provider.baseUrl ? resolveApiKey(provider.baseUrl) : provider.baseUrl;

    switch (provider.type) {
      case 'cloud': {
        if (provider.name === 'anthropic') {
          return new ChatAnthropic({
            model: modelName,
            anthropicApiKey: apiKey,
            clientOptions: { timeout: TIMEOUTS.LLM_REQUEST },
          });
        }
        // OpenAI and other cloud providers
        return new ChatOpenAI({
          model: modelName,
          apiKey,
          timeout: TIMEOUTS.LLM_REQUEST,
        });
      }

      case 'local': {
        // Local models (Ollama, vLLM) use OpenAI-compatible API
        return new ChatOpenAI({
          model: modelName,
          configuration: {
            baseURL: baseUrl ?? 'http://localhost:11434/v1',
          },
          apiKey: apiKey ?? 'not-needed-for-local',
          timeout: TIMEOUTS.LLM_REQUEST,
        });
      }

      case 'gateway': {
        if (!baseUrl) {
          throw new Error(
            `Gateway provider "${provider.name}" requires a baseUrl`
          );
        }
        if (!apiKey || apiKey === '' || apiKey === 'not-needed') {
          const isBedrock = provider.name.includes("bedrock") || baseUrl?.includes("sfproxy") || baseUrl?.includes("bedrock");
          throw new Error(
            `No API key for provider "${provider.name}". ` +
            (isBedrock
              ? `Run /provider bedrock <url> <token>, or visit https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/`
              : `Use /set-key to save your key, or set the appropriate env var.`)
          );
        }

        // Bedrock Gateway (sfproxy / LLM Gateway Express) — use ChatAnthropic with authToken
        // The gateway expects Authorization: Bearer <token>, not x-api-key
        const isBedrock = provider.name.includes("bedrock") || baseUrl?.includes("sfproxy") || baseUrl?.includes("bedrock");
        if (isBedrock) {
          const clientOptions: Record<string, any> = { authToken: apiKey, timeout: TIMEOUTS.LLM_REQUEST };
          if (process.env.NODE_EXTRA_CA_CERTS) {
            try {
              const fs = require('node:fs');
              const https = require('node:https');
              const ca = fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS);
              clientOptions.httpAgent = new https.Agent({ ca });
            } catch {
              // CA cert loading failed — proceed without
            }
          }
          // The gateway supports /v1/messages at the root — strip /bedrock suffix
          const apiUrl = baseUrl!.replace(/\/bedrock\/?$/, '');
          return new ChatAnthropic({
            model: modelName,
            anthropicApiUrl: apiUrl,
            anthropicApiKey: 'sk-placeholder', // Required by LangChain constructor; overridden by authToken
            clientOptions,
          });
        }

        // Other gateways (OpenRouter, LiteLLM) — use OpenAI-compatible API
        const fetchOptions: Record<string, any> = {};
        if (process.env.NODE_EXTRA_CA_CERTS) {
          try {
            const fs = require('node:fs');
            const https = require('node:https');
            const ca = fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS);
            fetchOptions.agent = new https.Agent({ ca });
          } catch {
            // CA cert loading failed — proceed without
          }
        }

        return new ChatOpenAI({
          model: modelName,
          configuration: {
            baseURL: baseUrl,
            ...(Object.keys(fetchOptions).length > 0 ? { fetchOptions } : {}),
          },
          apiKey,
          timeout: TIMEOUTS.LLM_REQUEST,
        });
      }

      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }
}
