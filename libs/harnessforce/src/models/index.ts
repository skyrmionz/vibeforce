/**
 * Model provider management — public API surface.
 */

export {
  type ModelProvider,
  type ModelConfig,
  loadModelConfig,
  resolveApiKey,
  getDefaultConfig,
  parseRawConfig,
} from './config.js';

export { ModelRegistry, type ModelInfo } from './registry.js';

export {
  configFilePath,
  ensureConfigFile,
  readConfig,
  writeConfig,
  setDefaultModel,
  addProvider,
  removeProvider,
} from './config-io.js';

export {
  type ModelTier,
  type RoutingConfig,
  getDefaultRoutingConfig,
  classifyMessage,
  resolveRoutingModel,
} from './router.js';
