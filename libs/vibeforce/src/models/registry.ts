/**
 * Model Provider Registry — instantiate and manage LangChain chat models.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type ModelConfig, type ModelProvider, resolveApiKey } from './config.js';

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

    switch (provider.type) {
      case 'cloud': {
        if (provider.name === 'anthropic') {
          return new ChatAnthropic({
            model: modelName,
            anthropicApiKey: apiKey,
          });
        }
        // OpenAI and other cloud providers
        return new ChatOpenAI({
          model: modelName,
          apiKey,
        });
      }

      case 'local': {
        // Local models (Ollama, vLLM) use OpenAI-compatible API
        return new ChatOpenAI({
          model: modelName,
          configuration: {
            baseURL: provider.baseUrl ?? 'http://localhost:11434/v1',
          },
          apiKey: apiKey ?? 'not-needed-for-local',
        });
      }

      case 'gateway': {
        // Gateways (LiteLLM, etc.) also use OpenAI-compatible API
        if (!provider.baseUrl) {
          throw new Error(
            `Gateway provider "${provider.name}" requires a baseUrl`
          );
        }
        return new ChatOpenAI({
          model: modelName,
          configuration: { baseURL: provider.baseUrl },
          apiKey: apiKey ?? 'not-needed',
        });
      }

      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }
}
