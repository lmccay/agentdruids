/**
 * Named Model Configuration System
 *
 * Models live in the database (see migration 005). This file defines the
 * shape only — there is no in-code default registry. The ModelRegistryService
 * loads all configurations from PostgreSQL at startup.
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
