/**
 * CLI commands for model management.
 *
 * Subcommands:
 *   model:list     — list all available models
 *   model:current  — show the current default model
 *   model:select   — switch model for session (alias for model:default)
 *   model:default  — set persistent default model
 *   model:test     — test model connectivity
 *   provider:add   — interactive wizard to add a provider
 *   provider:remove — remove a provider
 */

import { Command } from 'commander';
import {
  type ModelProvider,
  ModelRegistry,
  readConfig,
  setDefaultModel as persistDefaultModel,
  addProvider as persistProvider,
  removeProvider as persistRemoveProvider,
  ensureConfigFile,
} from '@vibeforce/core';

// ----------------------------------------------------------------
// model:list
// ----------------------------------------------------------------
const modelList = new Command('model:list')
  .description('List all available models with provider and type labels')
  .action(() => {
    ensureConfigFile();
    const config = readConfig();
    const registry = new ModelRegistry(config);
    const models = registry.listModels();

    if (models.length === 0) {
      console.log('No models configured. Run `vibeforce provider:add` to get started.');
      return;
    }

    const defaultId = config.defaultModel;
    console.log('\nAvailable models:\n');

    for (const m of models) {
      const isDefault = m.id === defaultId ? ' (default)' : '';
      const typeLabel = m.type.toUpperCase().padEnd(7);
      console.log(`  ${typeLabel}  ${m.provider.padEnd(12)}  ${m.model}${isDefault}`);
    }
    console.log('');
  });

// ----------------------------------------------------------------
// model:current
// ----------------------------------------------------------------
const modelCurrent = new Command('model:current')
  .description('Show the current default model')
  .action(() => {
    ensureConfigFile();
    const config = readConfig();
    console.log(`Current model: ${config.defaultModel}`);
  });

// ----------------------------------------------------------------
// model:select
// ----------------------------------------------------------------
const modelSelect = new Command('model:select')
  .argument('<id>', 'Model ID (e.g. "anthropic:claude-opus-4.6")')
  .description('Switch model for session')
  .action((id: string) => {
    ensureConfigFile();
    const config = readConfig();
    const registry = new ModelRegistry(config);
    const all = registry.listModels();
    const match = all.find((m) => m.id === id || m.model === id);

    if (!match) {
      console.error(`Error: Model "${id}" not found. Run \`vibeforce model:list\` to see available models.`);
      process.exit(1);
    }
    console.log(`Switched to ${match.model} (${match.provider})`);
  });

// ----------------------------------------------------------------
// model:default
// ----------------------------------------------------------------
const modelDefault = new Command('model:default')
  .argument('<id>', 'Model ID to set as default')
  .description('Set persistent default model')
  .action((id: string) => {
    ensureConfigFile();
    const config = readConfig();
    const registry = new ModelRegistry(config);
    const all = registry.listModels();
    const match = all.find((m) => m.id === id || m.model === id);

    if (!match) {
      console.error(`Error: Model "${id}" not found. Run \`vibeforce model:list\` to see available models.`);
      process.exit(1);
    }
    persistDefaultModel(match.id);
    console.log(`Default model set to ${match.id}`);
  });

// ----------------------------------------------------------------
// model:test
// ----------------------------------------------------------------
const modelTest = new Command('model:test')
  .argument('<id>', 'Model ID to test')
  .description('Test model connectivity')
  .action(async (id: string) => {
    ensureConfigFile();
    const config = readConfig();
    const registry = new ModelRegistry(config);
    const all = registry.listModels();
    const match = all.find((m) => m.id === id || m.model === id);

    if (!match) {
      console.error(`Error: Model "${id}" not found.`);
      process.exit(1);
    }

    console.log(`Testing ${match.id}...`);
    const ok = await registry.testModel(match.id);
    if (ok) {
      console.log(`  OK — ${match.id} is reachable.`);
    } else {
      console.log(`  FAIL — could not reach ${match.id}. Check your API key and network.`);
      process.exit(1);
    }
  });

// ----------------------------------------------------------------
// provider:add  (non-interactive for now — flags-based)
// ----------------------------------------------------------------
const providerAdd = new Command('provider:add')
  .description('Add a model provider')
  .requiredOption('--name <name>', 'Provider name (e.g. "ollama")')
  .requiredOption('--type <type>', 'Provider type: cloud | local | gateway')
  .option('--base-url <url>', 'Base URL for local/gateway providers')
  .option('--api-key <key>', 'API key or env var reference (e.g. "${OPENAI_API_KEY}")')
  .option('--models <models>', 'Comma-separated list of model names')
  .option('--auto-discover', 'Auto-discover models (for local providers)')
  .action((opts: {
    name: string;
    type: string;
    baseUrl?: string;
    apiKey?: string;
    models?: string;
    autoDiscover?: boolean;
  }) => {
    ensureConfigFile();

    const providerType = opts.type as ModelProvider['type'];
    if (!['cloud', 'local', 'gateway'].includes(providerType)) {
      console.error('Error: --type must be one of: cloud, local, gateway');
      process.exit(1);
    }

    const provider: ModelProvider = {
      name: opts.name,
      type: providerType,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      models: opts.models ? opts.models.split(',').map((m) => m.trim()) : [],
      autoDiscover: opts.autoDiscover,
    };

    persistProvider(opts.name, provider);
    console.log(`Provider "${opts.name}" added with ${provider.models.length} model(s).`);
  });

// ----------------------------------------------------------------
// provider:remove
// ----------------------------------------------------------------
const providerRemove = new Command('provider:remove')
  .argument('<name>', 'Provider name to remove')
  .description('Remove a model provider')
  .action((name: string) => {
    ensureConfigFile();
    const removed = persistRemoveProvider(name);
    if (removed) {
      console.log(`Provider "${name}" removed.`);
    } else {
      console.error(`Error: Provider "${name}" not found.`);
      process.exit(1);
    }
  });

// ----------------------------------------------------------------
// Export all commands for registration
// ----------------------------------------------------------------
export const modelCommands = [
  modelList,
  modelCurrent,
  modelSelect,
  modelDefault,
  modelTest,
  providerAdd,
  providerRemove,
];
