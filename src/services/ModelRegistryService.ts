/**
 * Model Registry Service
 *
 * Database-backed registry of named model configurations. There is no in-code
 * fallback or default set — all definitions live in `druids_core.model_configurations`
 * (seeded by migration 005). On boot, `initialize()` loads every row into an
 * in-memory cache for fast synchronous reads; mutations write through to the
 * database and refresh the cache.
 */

import { ModelConfiguration } from '../models/ModelConfiguration';
import { LLMConfiguration } from '../models/Agent';
import { ModelRepository } from './ModelRepository';

export class ModelRegistryService {
  private models: Map<string, ModelConfiguration> = new Map();
  private repository: ModelRepository | undefined;
  private initialized: boolean = false;

  /**
   * Configure the database-backed repository. Must be called before `initialize()`.
   */
  setRepository(repository: ModelRepository): void {
    this.repository = repository;
  }

  /**
   * Load all model configurations from the database into the in-memory cache.
   * Idempotent — re-calling re-reads from the DB.
   */
  async initialize(): Promise<void> {
    if (!this.repository) {
      throw new Error('ModelRegistryService: repository not configured. Call setRepository() first.');
    }
    const rows = await this.repository.findAll();
    this.models = new Map(rows.map(m => [m.id, m]));
    this.initialized = true;
    console.log(`🔧 ModelRegistryService loaded ${this.models.size} model configuration(s) from database`);
  }

  /** Returns true after a successful `initialize()` call. */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Reads (synchronous, served from the in-memory cache) ─────────────────

  getAllModels(): ModelConfiguration[] {
    return Array.from(this.models.values());
  }

  getAvailableModels(): ModelConfiguration[] {
    return this.getAllModels().filter(m => m.isActive !== false);
  }

  getModel(id: string): ModelConfiguration | undefined {
    return this.models.get(id);
  }

  getModelsByTag(tag: string): ModelConfiguration[] {
    return this.getAvailableModels().filter(m => m.tags.includes(tag));
  }

  /**
   * Returns the model marked `isDefault`. Falls back to the first active model.
   * Throws if no model is registered.
   */
  getDefaultModel(): ModelConfiguration {
    const explicit = this.getAllModels().find(m => m.isDefault === true);
    if (explicit) return explicit;

    const firstActive = this.getAvailableModels()[0];
    if (firstActive) return firstActive;

    throw new Error('No model configurations registered (database empty or not initialized).');
  }

  isModelAvailable(id: string): boolean {
    const m = this.getModel(id);
    return m !== undefined && m.isActive !== false;
  }

  /** Group active models by tag for category-style UIs. */
  getModelsByCategory(): Record<string, ModelConfiguration[]> {
    const categories: Record<string, ModelConfiguration[]> = {};
    for (const model of this.getAvailableModels()) {
      for (const tag of model.tags) {
        if (!categories[tag]) {
          categories[tag] = [];
        }
        if (!categories[tag]!.includes(model)) {
          categories[tag]!.push(model);
        }
      }
    }
    return categories;
  }

  /**
   * Convert a named model configuration to a runtime LLMConfiguration that
   * agents can use directly.
   */
  resolveModelConfig(modelId: string, systemPrompt?: string): LLMConfiguration {
    const modelConfig = this.getModel(modelId);
    if (!modelConfig) {
      throw new Error(`Model configuration not found: ${modelId}`);
    }

    const llmConfig: LLMConfiguration = {
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      systemPrompt: this.buildSystemPrompt(modelConfig, systemPrompt),
      modelConfigId: modelId
    };

    if (modelConfig.topP !== undefined) {
      llmConfig.topP = modelConfig.topP;
    }
    if (modelConfig.frequencyPenalty !== undefined) {
      llmConfig.frequencyPenalty = modelConfig.frequencyPenalty;
    }
    if (modelConfig.presencePenalty !== undefined) {
      llmConfig.presencePenalty = modelConfig.presencePenalty;
    }

    return llmConfig;
  }

  private buildSystemPrompt(modelConfig: ModelConfiguration, agentPrompt?: string): string {
    const parts: string[] = [];
    if (modelConfig.systemPromptPrefix) {
      parts.push(modelConfig.systemPromptPrefix);
    }
    if (agentPrompt) {
      parts.push(agentPrompt);
    }
    return parts.join('\n\n');
  }

  // ─── Mutations (async; write-through to DB, then refresh cache) ───────────

  async addModel(model: ModelConfiguration): Promise<void> {
    const repo = this.requireRepository();
    const stored = await repo.upsert(model);
    this.models.set(stored.id, stored);
  }

  async updateModel(id: string, updates: Partial<ModelConfiguration>): Promise<boolean> {
    const repo = this.requireRepository();
    const existing = this.models.get(id);
    if (!existing) {
      return false;
    }
    const merged: ModelConfiguration = { ...existing, ...updates, id };
    const stored = await repo.upsert(merged);
    this.models.set(stored.id, stored);
    return true;
  }

  async removeModel(id: string): Promise<boolean> {
    const repo = this.requireRepository();
    const removed = await repo.delete(id);
    if (removed) {
      this.models.delete(id);
    }
    return removed;
  }

  async setModelActive(id: string, active: boolean): Promise<boolean> {
    return this.updateModel(id, { isActive: active });
  }

  private requireRepository(): ModelRepository {
    if (!this.repository) {
      throw new Error('ModelRegistryService: repository not configured. Call setRepository() first.');
    }
    return this.repository;
  }
}

// Singleton instance. `setRepository()` and `initialize()` are called from
// the application bootstrap (see index.ts) after database migrations have run.
export const modelRegistryService = new ModelRegistryService();
