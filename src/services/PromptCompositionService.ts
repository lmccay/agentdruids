/**
 * Prompt Composition Service
 *
 * Main service for composing system prompts from multiple layers.
 * Handles caching, security enforcement, and runtime context injection.
 */

import path from 'path';
import { Agent } from '../models/Agent';
import {
  ComposedPrompt,
  RuntimePromptContext,
  PromptSourcesConfig,
  PromptSourceConfig,
  PromptLayer
} from '../models/PromptConfig';
import { PromptSourceResolver } from './PromptSourceResolver';
import { PromptComposer } from './PromptComposer';

export class PromptCompositionService {
  private sourceResolver: PromptSourceResolver;
  private composer: PromptComposer;
  private config: PromptSourcesConfig;
  private cache: Map<string, ComposedPrompt>;  // Simple in-memory cache for now

  constructor(config: PromptSourcesConfig, sourceResolver?: PromptSourceResolver) {
    this.config = config;
    this.sourceResolver = sourceResolver || new PromptSourceResolver();
    this.composer = new PromptComposer();
    this.cache = new Map();
  }

  /**
   * Compose complete system prompt for an agent
   */
  async composePrompt(
    agent: Agent,
    runtimeContext: RuntimePromptContext
  ): Promise<ComposedPrompt> {
    // Build cache key
    const cacheKey = this.buildCacheKey(agent, runtimeContext);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`🎯 Cache HIT for prompt: ${cacheKey}`);
      return cached;
    }

    console.log(`🔄 Composing prompt for agent: ${agent.id} (${agent.type})`);

    // Load prompt layers
    const layers: PromptLayer[] = [];

    // Layer 1: Global Base (required)
    try {
      console.log('📥 Loading Layer 1: Global Base...');
      const globalBase = await this.sourceResolver.resolveSource(
        this.config.prompt_sources.global_base
      );
      layers.push(globalBase);
      console.log(`✅ Loaded global base v${globalBase.version}`);
    } catch (error: any) {
      console.error('❌ Failed to load global base prompt:', error.message);
      throw new Error('Global base prompt is required');
    }

    // Layer 2: Agent Type Base (required)
    const agentTypeSource = this.config.prompt_sources.agent_types[agent.type];
    if (agentTypeSource) {
      try {
        console.log(`📥 Loading Layer 2: Agent Type (${agent.type})...`);
        const agentTypeLayer = await this.sourceResolver.resolveSource(agentTypeSource);
        layers.push(agentTypeLayer);
        console.log(`✅ Loaded ${agent.type} base v${agentTypeLayer.version}`);
      } catch (error: any) {
        if (!agentTypeSource.optional) {
          throw error;
        }
        console.warn(`⚠️  Optional agent type prompt not found for ${agent.type}`);
      }
    }

    // Layer 3: Realm Context (optional, configurable)
    const shouldLoadRealm = runtimeContext.realm_id &&
                            agent.promptConfig?.baseTemplate !== 'minimal' &&
                            !agent.promptConfig?.disableRealmPrompt;

    if (shouldLoadRealm) {
      const realmSource = this.buildRealmPromptSource(runtimeContext.realm_id!);
      try {
        console.log(`📥 Loading Layer 3: Realm Context (${runtimeContext.realm_id})...`);
        const realmLayer = await this.sourceResolver.resolveSource(realmSource);
        layers.push(realmLayer);
        console.log(`✅ Loaded realm context v${realmLayer.version}`);
      } catch (error: any) {
        // Realm prompts are optional
        console.warn(`⚠️  Realm prompt not found for ${runtimeContext.realm_id}: ${error.message}`);
      }
    }

    // Layer 4: Agent Extension (from database, optional)
    if (agent.promptConfig?.agentExtension) {
      try {
        console.log('📥 Loading Layer 4: Agent Extension (database)...');
        const agentLayer = await this.sourceResolver.parseAgentExtension(
          agent.promptConfig.agentExtension,
          agent.id
        );
        layers.push(agentLayer);
        console.log('✅ Loaded agent extension from database');
      } catch (error: any) {
        console.error(`❌ Failed to parse agent extension: ${error.message}`);
        // Continue without agent extension rather than failing
      }
    } else {
      console.log('ℹ️  No agent extension configured');
    }

    // Compose layers
    console.log(`🔧 Composing ${layers.length} layers...`);
    const composed = this.composer.composeLayers(layers);

    if (composed.security_violations.length > 0) {
      console.warn(`⚠️  ${composed.security_violations.length} security violations detected during composition`);
    }

    // Render to string
    let finalPrompt = this.composer.renderSections(composed.sections);

    // Add runtime context
    const contextForComposer: {
      session_id?: string;
      user_id?: string;
      realm_id?: string;
      timestamp: string;
      available_tools: string[];
    } = {
      timestamp: runtimeContext.timestamp,
      available_tools: runtimeContext.available_tools
    };
    if (runtimeContext.session_id) contextForComposer.session_id = runtimeContext.session_id;
    if (runtimeContext.user_id) contextForComposer.user_id = runtimeContext.user_id;
    if (runtimeContext.realm_id) contextForComposer.realm_id = runtimeContext.realm_id;

    finalPrompt = this.composer.addRuntimeContext(finalPrompt, contextForComposer);

    // Add security postamble (always last)
    finalPrompt = this.composer.addSecurityPostamble(finalPrompt);

    // Build result
    const composedPrompt: ComposedPrompt = {
      agent_id: agent.id,
      agent_type: agent.type,
      layers,
      final_prompt: finalPrompt,
      composition_log: composed.composition_log,
      security_violations: composed.security_violations,
      timestamp: new Date(),
      cache_key: cacheKey,
      ttl: this.config.prompt_sources.global_base.cache_ttl || 3600
    };
    if (runtimeContext.realm_id) {
      composedPrompt.realm_id = runtimeContext.realm_id;
    }

    // Cache the result
    this.cache.set(cacheKey, composedPrompt);
    console.log(`✅ Prompt composed successfully (${finalPrompt.length} chars)`);

    return composedPrompt;
  }

  /**
   * Invalidate cache for an agent
   */
  invalidateCache(agentId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(agentId)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`🔄 Invalidated ${keysToDelete.length} cache entries for agent ${agentId}`);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🔄 Cleared all prompt cache');
  }

  /**
   * Build cache key
   */
  private buildCacheKey(agent: Agent, context: RuntimePromptContext): string {
    // Include agent.updatedAt to auto-invalidate when agent is edited
    return `prompt:${agent.id}:${agent.type}:${context.realm_id || 'none'}:${agent.updatedAt}`;
  }

  /**
   * Build realm prompt source config
   */
  private buildRealmPromptSource(realmId: string): PromptSourceConfig {
    const baseUrl = this.config.prompt_sources.realm_specific.base_url;
    const pattern = this.config.prompt_sources.realm_specific.pattern;
    const url = path.join(baseUrl, pattern.replace('{realmId}', realmId));

    const config: PromptSourceConfig = {
      url,
      optional: true
    };
    if (this.config.prompt_sources.realm_specific.cache_ttl !== undefined) {
      config.cache_ttl = this.config.prompt_sources.realm_specific.cache_ttl;
    }
    return config;
  }
}
