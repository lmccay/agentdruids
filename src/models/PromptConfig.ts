/**
 * System Prompt Configuration Models
 *
 * These models define the structure for the layered system prompt architecture.
 */

export interface PromptMetadata {
  name: string;
  description?: string;
  author?: string;
  last_updated?: string;
  tags?: string[];
  realm_id?: string;
  agent_id?: string;
}

export interface PromptFrontmatter {
  version: string;
  metadata: PromptMetadata;
  extends?: string;
  immutable_sections?: string[];
  protected_sections?: string[];
  override_points?: string[];
  extension_points?: string[];
}

export interface MarkdownPrompt {
  frontmatter: PromptFrontmatter;
  sections: Map<string, string>;  // H1 heading → Markdown content
  raw: string;                     // Original Markdown body
}

export interface PromptLayer {
  version: string;
  metadata: PromptMetadata;
  sections: Map<string, string>;
  immutable_sections?: string[];
  protected_sections?: string[];
  override_points?: string[];
  extension_points?: string[];
  source_url: string;
  loaded_at: Date;
}

export interface CompositionStep {
  layer: string;
  action: 'include' | 'override' | 'extend' | 'blocked' | 'skip';
  section: string;
  protection?: 'immutable' | 'protected' | 'none';
  reason?: string;
}

export interface ComposedPrompt {
  agent_id: string;
  realm_id?: string;
  agent_type: string;
  layers: PromptLayer[];
  final_prompt: string;
  composition_log: CompositionStep[];
  security_violations: CompositionStep[];
  timestamp: Date;
  cache_key: string;
  ttl: number;
}

export interface RuntimePromptContext {
  session_id?: string;
  user_id?: string;
  realm_id?: string;
  timestamp: string;
  available_tools: string[];
  agent_metadata?: Record<string, any>;
}

/**
 * Agent prompt configuration (stored in database)
 */
export interface AgentPromptConfig {
  // Which centralized layers to use
  baseTemplate: 'standard' | 'minimal';  // standard = type + realm, minimal = type only

  // Agent-specific extension (from UI)
  agentExtension?: string;  // Markdown content

  // Metadata for tracking
  createdFromTemplate?: {
    id: string;          // Template ID
    name: string;        // "Python Reviewer"
    version: string;     // Snapshot version
    createdAt: Date;
  };

  // Advanced options
  disableRealmPrompt?: boolean;
}

/**
 * Prompt source configuration (for URL-based loading)
 */
export interface PromptSourceConfig {
  url: string;
  fallback?: string;
  cache_ttl?: number;
  version?: string;
  auth?: PromptAuthConfig;
  optional?: boolean;
}

export interface PromptAuthConfig {
  type: 'bearer' | 'basic' | 'iam' | 'none';
  token_env?: string;
  username_env?: string;
  password_env?: string;
}

/**
 * Prompt sources configuration (loaded from config file)
 */
export interface PromptSourcesConfig {
  prompt_sources: {
    global_base: PromptSourceConfig;
    agent_types: Record<string, PromptSourceConfig>;
    realm_specific: {
      base_url: string;
      pattern: string;
      cache_ttl?: number;
    };
    agent_specific?: {
      base_url: string;
      pattern: string;
      cache_ttl?: number;
      optional: boolean;
    };
  };
}
