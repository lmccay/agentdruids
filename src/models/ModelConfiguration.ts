/**
 * Named Model Configuration System
 * Provides user-friendly model selection with optimized settings
 */

import { LLMProvider } from './Types';

export interface ModelConfiguration {
  id: string;           // Unique identifier like "creative-writer"
  name: string;         // Display name like "Creative Writer"
  description: string;  // User-friendly description
  provider: LLMProvider;
  model: string;        // Provider-specific model name
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPromptPrefix?: string; // Optional prefix added to agent's system prompt
  tags: string[];       // Categorization tags
  isDefault?: boolean;  // Whether this is a default/fallback model
  isActive?: boolean;   // Whether this model is currently available
}

export interface ModelRegistry {
  models: ModelConfiguration[];
  getModel(id: string): ModelConfiguration | undefined;
  getModelsByTag(tag: string): ModelConfiguration[];
  getDefaultModel(): ModelConfiguration;
  getActiveModels(): ModelConfiguration[];
  addModel(model: ModelConfiguration): void;
  updateModel(id: string, updates: Partial<ModelConfiguration>): boolean;
  removeModel(id: string): boolean;
}

/**
 * Default model configurations
 */
export const DEFAULT_MODELS: ModelConfiguration[] = [
  {
    id: "creative-writer",
    name: "Creative Writer",
    description: "Optimized for creative writing, storytelling, and imaginative content",
    provider: "ollama",
    model: "qwen2.5:1.5b",
    temperature: 0.9,
    maxTokens: 4000,
    topP: 0.9,
    tags: ["creative", "writing", "storytelling"],
    isActive: true
  },
  {
    id: "analytical-researcher",
    name: "Analytical Researcher", 
    description: "Focused on analysis, research, and fact-based responses",
    provider: "ollama",
    model: "qwen2.5:1.5b",
    temperature: 0.3,
    maxTokens: 2000,
    topP: 0.7,
    tags: ["analysis", "research", "factual"],
    isActive: true,
    isDefault: true
  },
  {
    id: "balanced-assistant",
    name: "Balanced Assistant",
    description: "Well-rounded model for general tasks and conversations",
    provider: "ollama", 
    model: "qwen2.5:1.5b",
    temperature: 0.7,
    maxTokens: 2500,
    topP: 0.8,
    tags: ["general", "balanced", "conversation"],
    isActive: true
  },
  {
    id: "technical-specialist",
    name: "Technical Specialist",
    description: "Optimized for technical tasks, coding, and precise instructions",
    provider: "ollama",
    model: "qwen2.5:1.5b", 
    temperature: 0.2,
    maxTokens: 3000,
    topP: 0.6,
    tags: ["technical", "coding", "precise"],
    isActive: true
  },
  {
    id: "gpt4-premium",
    name: "GPT-4 Premium",
    description: "High-quality responses with advanced reasoning (requires OpenAI API)",
    provider: "openai",
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 3000,
    topP: 0.9,
    tags: ["premium", "reasoning", "quality"],
    isActive: true // Enabled - will require API key for execution
  },
  {
    id: "gpt4-turbo",
    name: "GPT-4 Turbo",
    description: "Fast and efficient GPT-4 variant (requires OpenAI API)",
    provider: "openai",
    model: "gpt-4-turbo-preview",
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.9,
    tags: ["premium", "fast", "efficient"],
    isActive: false
  },
  {
    id: "claude-creative",
    name: "Claude Creative",
    description: "Anthropic's Claude optimized for creative tasks (requires Anthropic API)",
    provider: "anthropic",
    model: "claude-3-sonnet-20240229",
    temperature: 0.8,
    maxTokens: 3000,
    topP: 0.9,
    tags: ["creative", "anthropic", "premium"],
    isActive: false
  }
];

/**
 * Model Registry Implementation
 */
export class DefaultModelRegistry implements ModelRegistry {
  public models: ModelConfiguration[];

  constructor(models: ModelConfiguration[] = DEFAULT_MODELS) {
    this.models = models;
  }

  getModel(id: string): ModelConfiguration | undefined {
    return this.models.find(model => model.id === id);
  }

  getModelsByTag(tag: string): ModelConfiguration[] {
    return this.models.filter(model => 
      model.tags.includes(tag) && model.isActive !== false
    );
  }

  getDefaultModel(): ModelConfiguration {
    const defaultModel = this.models.find(model => model.isDefault);
    if (defaultModel) return defaultModel;
    
    // Fallback to first active model
    const activeModel = this.getActiveModels()[0];
    if (activeModel) return activeModel;
    
    // Ultimate fallback - should always have at least one model
    if (this.models.length === 0) {
      throw new Error('No models configured in registry');
    }
    return this.models[0]!; // Non-null assertion since we checked length
  }

  getActiveModels(): ModelConfiguration[] {
    return this.models.filter(model => model.isActive !== false);
  }

  addModel(model: ModelConfiguration): void {
    this.models.push(model);
  }

  updateModel(id: string, updates: Partial<ModelConfiguration>): boolean {
    const index = this.models.findIndex(model => model.id === id);
    if (index === -1) return false;
    
    const existingModel = this.models[index]!;
    this.models[index] = { ...existingModel, ...updates } as ModelConfiguration;
    return true;
  }

  removeModel(id: string): boolean {
    const index = this.models.findIndex(model => model.id === id);
    if (index === -1) return false;
    
    this.models.splice(index, 1);
    return true;
  }
}