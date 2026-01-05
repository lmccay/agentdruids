/**
 * Model Registry Service
 * Manages named model configurations and provides them to the application
 */

import { ModelConfiguration, ModelRegistry, DefaultModelRegistry } from '../models/ModelConfiguration';
import { LLMConfiguration } from '../models/Agent';

export class ModelRegistryService {
  private registry: ModelRegistry;

  constructor(registry?: ModelRegistry) {
    this.registry = registry || new DefaultModelRegistry();
  }

  /**
   * Get all available models
   */
  getAllModels(): ModelConfiguration[] {
    return this.registry.models;
  }

  /**
   * Get only active/available models
   */
  getAvailableModels(): ModelConfiguration[] {
    return this.registry.getActiveModels();
  }

  /**
   * Get a specific model by ID
   */
  getModel(id: string): ModelConfiguration | undefined {
    return this.registry.getModel(id);
  }

  /**
   * Get models by category/tag
   */
  getModelsByTag(tag: string): ModelConfiguration[] {
    return this.registry.getModelsByTag(tag);
  }

  /**
   * Get the default model
   */
  getDefaultModel(): ModelConfiguration {
    return this.registry.getDefaultModel();
  }

  /**
   * Convert a named model configuration to LLM configuration
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

    // Add optional properties only if they exist
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

  /**
   * Build system prompt by combining model prefix with agent prompt
   */
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

  /**
   * Add a new model configuration
   */
  addModel(model: ModelConfiguration): void {
    this.registry.addModel(model);
  }

  /**
   * Update an existing model configuration
   */
  updateModel(id: string, updates: Partial<ModelConfiguration>): boolean {
    return this.registry.updateModel(id, updates);
  }

  /**
   * Remove a model configuration
   */
  removeModel(id: string): boolean {
    return this.registry.removeModel(id);
  }

  /**
   * Enable/disable a model
   */
  setModelActive(id: string, active: boolean): boolean {
    return this.updateModel(id, { isActive: active });
  }

  /**
   * Get models grouped by category
   */
  getModelsByCategory(): Record<string, ModelConfiguration[]> {
    const models = this.getAvailableModels();
    const categories: Record<string, ModelConfiguration[]> = {};

    models.forEach(model => {
      model.tags.forEach(tag => {
        if (!categories[tag]) {
          categories[tag] = [];
        }
        if (!categories[tag].includes(model)) {
          categories[tag].push(model);
        }
      });
    });

    return categories;
  }

  /**
   * Check if a model is available
   */
  isModelAvailable(id: string): boolean {
    const model = this.getModel(id);
    return model !== undefined && model.isActive !== false;
  }
}

// Export singleton instance
export const modelRegistryService = new ModelRegistryService();