import { AgentId } from '../models/Types';
import {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentSummary,
  AgentQueryFilters,
  DruidPersona,
  RealmAccess
} from '../models/Agent';
import { AgentType } from '../models/Types';
import { OllamaClient, ChatRequest, createDefaultOllamaConfig } from './OllamaClient';
import { OpenAIClient, OpenAIChatRequest, createDefaultOpenAIConfig } from './OpenAIClient';
import { PolicyEngine } from './PolicyEngine';
import { RepositoryManager } from './RepositoryManager';
import { RealmService } from './RealmService';
import { generateUUID, AgentIdMapper } from '../utils/uuidUtils';
import { MCPConfigLoader } from './mcp/MCPConfigLoader';
import { HttpMCPClient } from './mcp/HttpMCPClient';
import { SSEMCPClient } from './mcp/SSEMCPClient';
import { PromptCompositionService } from './PromptCompositionService';
import { PromptSourcesConfig } from '../models/PromptConfig';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Agent execution request for LLM operations
 */
interface AgentExecutionRequest {
  prompt: string;
  context?: any;
  systemPrompt?: string;
  temperature?: number;
  // Session ID for session-scoped state management (realm tracking, task queues)
  sessionId?: string;
  // Collaboration context for enhanced persona prompts
  collaborationContext?: {
    scenarioName?: string;
    scenarioType?: string;
    agentRole?: string;
    usePersonaPrompt?: boolean;
  };
}

/**
 * Agent execution response from LLM operations
 */
interface AgentExecutionResponse {
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  executionTime: number;
  toolCalls?: AgentToolCall[];
  metadata?: {
    agenticLoop?: {
      enabled: boolean;
      iterations: number;
      maxIterations: number;
    };
  };
}

/**
 * Agent tool call execution result
 */
interface AgentToolCall {
  tool: string;
  params: any;
  result: any;
  success: boolean;
  executionTime: number;
}

/**
 * Processed agent response with tool calls
 */
interface ProcessedAgentResponse {
  finalResponse: string;
  toolCalls: AgentToolCall[];
}

/**
 * Agent validation result
 */
interface AgentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Agent Service for managing agent lifecycle, LLM integration, and policy enforcement
 */
export class AgentService {
  private agents: Map<AgentId, Agent> = new Map();
  private repositoryManager: RepositoryManager | null = null;
  private ollamaClient: OllamaClient;
  private openaiClient: OpenAIClient | null = null;
  private policyEngine: PolicyEngine;
  private realmService: RealmService;
  private mcpConfigLoader: MCPConfigLoader;
  private mcpClients: Map<string, HttpMCPClient | SSEMCPClient> = new Map();
  private coordinationService?: any; // Avoid circular import, set via setter
  private promptCompositionService: PromptCompositionService | null = null;

  constructor(ollamaClient?: OllamaClient, policyEngine?: PolicyEngine, openaiClient?: OpenAIClient) {
    this.ollamaClient = ollamaClient || new OllamaClient(createDefaultOllamaConfig());
    this.policyEngine = policyEngine || new PolicyEngine();
    this.realmService = new RealmService();
    
    // Initialize OpenAI client if API key is available
    try {
      this.openaiClient = openaiClient || new OpenAIClient(createDefaultOpenAIConfig());
    } catch (error) {
      console.warn('OpenAI client not initialized (API key missing):', error instanceof Error ? error.message : 'Unknown error');
    }

    // Initialize MCP config loader
    this.mcpConfigLoader = new MCPConfigLoader();
    this.initializeMCPConfig();

    // Initialize prompt composition service
    this.initializePromptComposition().catch(error => {
      console.warn('Failed to initialize prompt composition:', error instanceof Error ? error.message : 'Unknown error');
    });

    this.initializeSystemAgents();

    // Initialize service with dual persistence
    this.initializeService().catch(error => {
      console.warn('Failed to initialize AgentService with database:', error instanceof Error ? error.message : 'Unknown error');
    });
  }

  /**
   * Initialize MCP configuration
   */
  private async initializeMCPConfig(): Promise<void> {
    try {
      await this.mcpConfigLoader.load();

      // Watch for config changes (hot reload) in non-test environments
      if (process.env['NODE_ENV'] !== 'test') {
        this.mcpConfigLoader.watch();
      }

      console.log('✅ MCP config initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MCP config:', error);
      // Continue without MCP support
    }
  }

  /**
   * Initialize prompt composition service
   */
  private async initializePromptComposition(): Promise<void> {
    try {
      // Load prompt sources configuration
      const configPath = path.join(process.cwd(), 'config', 'prompt-sources.json');
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config: PromptSourcesConfig = JSON.parse(configContent);

      this.promptCompositionService = new PromptCompositionService(config);
      console.log('✅ Prompt composition service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize prompt composition:', error);
      // Continue without prompt composition (will use fallback behavior)
    }
  }

  /**
   * Set the RealmService instance (for shared service injection)
   */
  public setRealmService(realmService: RealmService): void {
    this.realmService = realmService;
    console.log('✅ RealmService instance injected into AgentService');
  }

  /**
   * Set the CoordinationService instance (for session-scoped realm tracking)
   */
  public setCoordinationService(coordinationService: any): void {
    this.coordinationService = coordinationService;
    console.log('✅ CoordinationService instance injected into AgentService');
  }

  private async initializeService(): Promise<void> {
    // Try to initialize database connection
    try {
      this.repositoryManager = await RepositoryManager.initialize();
      console.log('✅ Database connection established for AgentService');
      
      // Database is available - load from database as source of truth
      await this.loadAgentsFromDatabase();
    } catch (error) {
      console.warn('⚠️ Database connection failed, using Redis-only fallback mode:', error instanceof Error ? error.message : 'Unknown error');
      this.repositoryManager = null;
      
      // Only use Redis if database is unavailable (fallback mode)
      await this.loadAgentsFromStorage();
    }
  }

  private async loadAgentsFromDatabase(): Promise<void> {
    if (!this.repositoryManager) {
      return;
    }

    try {
      const dbAgents = await this.repositoryManager.agents.findAll();
      
      // Load database agents into memory for fast access
      for (const dbAgent of dbAgents) {
        // Generate slug ID from agent name
        const slugId = dbAgent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        // Establish the mapping between slug ID and UUID
        AgentIdMapper.mapExistingAgent(slugId, dbAgent.id);
        
        // Use the slug ID as the service ID
        const serviceAgent = { ...dbAgent, id: slugId };
        this.agents.set(slugId, serviceAgent);
        
        console.log(`🔄 Loaded agent ${slugId} (DB UUID: ${dbAgent.id}) from database`);
      }
      
      if (dbAgents.length > 0) {
        console.log(`✅ Loaded ${dbAgents.length} agents from database`);
      } else {
        console.log('⚠️ No agents found in database.');
      }
    } catch (error) {
      console.warn('Failed to load agents from database:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Create a new agent with LLM configuration and policy validation
   */
  async createAgent(request: CreateAgentRequest): Promise<Agent> {
    // Validate agent configuration
    const validation = await this.validateAgentConfiguration(request);
    if (!validation.isValid) {
      throw new Error(`Agent validation failed: ${validation.errors.join(', ')}`);
    }

    // Check policy permissions for agent creation
    console.log('🔐 Checking access for agent creation:', {
      subjectId: 'system',
      subjectType: 'user',
      resourceType: 'agent',
      resourceId: request.id || 'new',
      operation: 'create',
      requestedAccess: 'write'
    });

    const accessDecision = await this.policyEngine.checkAccess({
      subjectId: 'system',
      subjectType: 'user',
      resourceType: 'agent',
      resourceId: request.id || 'new',
      operation: 'create',
      requestedAccess: 'write'
    });

    console.log('🔐 Access decision result:', accessDecision);

    if (!accessDecision.allowed) {
      throw new Error(`Access denied: ${accessDecision.reason}`);
    }

    const agentId = request.id || this.generateAgentId();
    const dbAgentId = AgentIdMapper.needsMapping(agentId) ? AgentIdMapper.getUUIDForStringId(agentId) : agentId;
    const now = Date.now().toString();

    const agent: Agent = {
      id: agentId,
      type: request.type,
      name: request.name,
      description: request.description,
      status: 'inactive',
      capabilities: request.capabilities,
      specialization: request.specialization,
      personality: request.personality,
      mcpTools: request.mcpTools,
      toolPermissions: request.toolPermissions,
      resourceAccess: request.resourceAccess,
      llmConfig: request.llmConfig,
      resourceLimits: request.resourceLimits || {
        maxMemoryMB: 512,
        maxCpuPercent: 50,
        maxConcurrentTasks: 10,
        maxExecutionTimeMs: 300000
      },
      bindings: [],
      ...(request.realmAccess && { realmAccess: request.realmAccess }),
      ...(request.promptConfig && { promptConfig: request.promptConfig }),
      tags: request.tags || [],
      metadata: request.metadata || {},
      createdAt: now,
      updatedAt: now
    };

    this.agents.set(agentId, agent);
    
    // Write to database as single source of truth
    if (this.repositoryManager) {
      try {
        const dbAgent = { ...agent, id: dbAgentId };
        await this.repositoryManager.agents.create(dbAgent);
        console.log(`💾 Stored agent ${agentId} (DB ID: ${dbAgentId}) in database`);
      } catch (error) {
        // Remove from memory cache if database write fails
        this.agents.delete(agentId);
        console.error('Failed to persist agent to database:', error instanceof Error ? error.message : 'Unknown error');
        throw error; // Fail fast - don't create agent if DB write fails
      }
    } else {
      console.warn('⚠️ Database unavailable, agent only stored in memory (will be lost on restart)');
    }

    // Update realm if agent has realm access
    if (agent.realmAccess) {
      try {
        if (agent.realmAccess.boundRealmId) {
          // For elemental agents, add to single bound realm
          const realm = await this.realmService.getRealm(agent.realmAccess.boundRealmId);
          if (realm) {
            // Update only the agentIds field to avoid schema issues
            const updatedAgentIds = realm.agentIds.includes(agentId) 
              ? realm.agentIds 
              : [...realm.agentIds, agentId];
            // Only update agentIds field to avoid field mapping issues
            await this.realmService.updateRealm(agent.realmAccess.boundRealmId, { 
              agentIds: updatedAgentIds 
            });
            console.log(`🌍 Added agent ${agentId} to bound realm ${agent.realmAccess.boundRealmId}`);
          }
        } else if (agent.realmAccess.accessibleRealms && agent.realmAccess.accessibleRealms.length > 0) {
          // For druid agents, add to all accessible realms
          for (const realmAccess of agent.realmAccess.accessibleRealms) {
            const realm = await this.realmService.getRealm(realmAccess.realmId);
            if (realm) {
              // Update only the agentIds field to avoid schema issues
              const updatedAgentIds = realm.agentIds.includes(agentId) 
                ? realm.agentIds 
                : [...realm.agentIds, agentId];
              // Only update agentIds field to avoid field mapping issues
              await this.realmService.updateRealm(realmAccess.realmId, { 
                agentIds: updatedAgentIds 
              });
              console.log(`🌍 Added agent ${agentId} to accessible realm ${realmAccess.realmId}`);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to update realm with new agent ${agentId}:`, error instanceof Error ? error.message : 'Unknown error');
        // Don't fail agent creation if realm update fails - agent is still valid
      }
    }
    
    console.log(`✅ Created agent ${agentId} with database persistence`);
    return agent;
  }

  /**
   * Get an agent by ID with policy enforcement
   */
  async getAgent(agentId: AgentId, requesterId?: string): Promise<Agent> {
    // 1. Check memory first (fastest)
    let agent = this.agents.get(agentId);
    
    if (!agent) {
      // 2. Read from database as single source of truth
      if (this.repositoryManager) {
        try {
          const dbAgentId = AgentIdMapper.needsMapping(agentId) ? 
            AgentIdMapper.getUUIDForStringId(agentId) : agentId;
          const dbAgent = await this.repositoryManager.agents.findById(dbAgentId);
          
          if (dbAgent) {
            // Convert database format back to application format
            agent = { ...dbAgent, id: agentId };
            
            // Update memory cache
            this.agents.set(agentId, agent);
            console.log(`📥 Database hit: Loaded agent ${agentId} into memory cache`);
          }
        } catch (error) {
          console.warn('Database read failed:', error instanceof Error ? error.message : 'Unknown error');
        }
      } else {
        console.warn('⚠️ Database unavailable for agent lookup');
      }
    }
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Check read access
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'agent',
        resourceId: agentId,
        operation: 'read',
        requestedAccess: 'read'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    return agent;
  }

  /**
   * List agents with optional filtering and access control
   */
  async listAgents(filters: AgentQueryFilters = {}, requesterId?: string): Promise<AgentSummary[]> {
    // Use in-memory agents (already loaded from database on startup)
    // No need to refresh from Redis on every call - prevents duplication
    let agents = Array.from(this.agents.values());
    console.log(`🔍 AgentService: Total agents in memory: ${agents.length}`);
    console.log(`🔍 AgentService: Agent IDs:`, agents.map(a => `${a.id}(${a.status})`));

    // Apply filters
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      agents = agents.filter(agent => types.includes(agent.type));
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      agents = agents.filter(agent => statuses.includes(agent.status));
    }

    if (filters.realmId) {
      agents = agents.filter(agent => {
        // Check the agent's realm through multiple possible sources
        const agentRealmId = (agent as any).realmId || 
                           agent.realmAccess?.currentRealmId || 
                           agent.realmAccess?.boundRealmId;
        return agentRealmId === filters.realmId;
      });
    }

    if (filters.capabilities) {
      // Ensure capabilities is always an array
      const capabilities = Array.isArray(filters.capabilities) ? filters.capabilities : [filters.capabilities];
      
      // If capabilities array is empty, it means "any agent matches" (no capability requirements)
      // If capabilities array has items, agent must have at least one of the required capabilities
      if (capabilities.length > 0) {
        agents = agents.filter(agent => 
          capabilities.some(cap => agent.capabilities.includes(cap))
        );
      }
      // If capabilities array is empty ([]), no filtering is applied - all agents match
    }

    if (filters.domain) {
      agents = agents.filter(agent => 
        agent.specialization.domain === filters.domain
      );
    }

    if (filters.tags) {
      agents = agents.filter(agent => 
        filters.tags!.some(tag => agent.tags?.includes(tag))
      );
    }

    // Apply access control if requesterId provided
    if (requesterId) {
      const accessibleAgents: Agent[] = [];
      for (const agent of agents) {
        try {
          const accessDecision = await this.policyEngine.checkAccess({
            subjectId: requesterId,
            subjectType: 'user',
            resourceType: 'agent',
            resourceId: agent.id,
            operation: 'read',
            requestedAccess: 'read'
          });

          if (accessDecision.allowed) {
            accessibleAgents.push(agent);
          }
        } catch (error) {
          console.warn(`Access check failed for agent ${agent.id}:`, error);
        }
      }
      agents = accessibleAgents;
    }

    // Convert to AgentSummary format and sort alphabetically by name
    const summaries = agents.map(agent => {
      const summary: any = {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        capabilities: agent.capabilities,
        domain: agent.specialization.domain,
        lastActive: agent.updatedAt
      };
      
      // Include realmId from multiple possible sources
      const agentRealmId = (agent as any).realmId || 
                          agent.deployment?.realmId || 
                          agent.realmAccess?.currentRealmId || 
                          agent.realmAccess?.boundRealmId;
      if (agentRealmId) {
        summary.realmId = agentRealmId;
      }
      
      // Include realmAccess if it exists
      if (agent.realmAccess) {
        summary.realmAccess = agent.realmAccess;
      }
      
      return summary;
    });

    // Sort alphabetically by name (case-insensitive)
    summaries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return summaries;
  }

  /**
   * Update an agent with policy enforcement
   */
  async updateAgent(agentId: AgentId, updateData: UpdateAgentRequest, requesterId?: string): Promise<Agent> {
    const agent = await this.getAgent(agentId, requesterId);

    // Check update access
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'agent',
        resourceId: agentId,
        operation: 'update',
        requestedAccess: 'write'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    // Apply updates safely
    const updatedAgent: Agent = {
      ...agent,
      name: updateData.name || agent.name,
      description: updateData.description || agent.description,
      type: updateData.type || agent.type, // Add support for type updates
      status: updateData.status || agent.status, // Add support for status updates
      capabilities: updateData.capabilities || agent.capabilities,
      specialization: {
        ...agent.specialization,
        ...(updateData.specialization || {})
      },
      personality: {
        ...agent.personality,
        ...(updateData.personality || {})
      },
      mcpTools: updateData.mcpTools !== undefined ? updateData.mcpTools : agent.mcpTools,
      toolPermissions: updateData.toolPermissions || agent.toolPermissions,
      resourceAccess: updateData.resourceAccess !== undefined ? updateData.resourceAccess : agent.resourceAccess,
      llmConfig: {
        ...agent.llmConfig,
        ...(updateData.llmConfig || {})
      },
      resourceLimits: updateData.resourceLimits || agent.resourceLimits,
      tags: updateData.tags !== undefined ? updateData.tags : (agent.tags || []),
      metadata: updateData.metadata !== undefined ? updateData.metadata : (agent.metadata || {}),
      promptConfig: updateData.promptConfig !== undefined ? updateData.promptConfig : agent.promptConfig,
      updatedAt: Date.now().toString(),
      ...(requesterId && { lastModifiedBy: requesterId }),
      // Replace realmAccess completely instead of merging to allow removing fields
      ...(updateData.realmAccess !== undefined && { realmAccess: updateData.realmAccess as RealmAccess })
    };

    console.log(`🔍 DEBUG AgentService: Setting agent ${agentId} with realmAccess:`, updatedAgent.realmAccess);
    this.agents.set(agentId, updatedAgent);
    
    // Write-through cache: Database is source of truth, Redis is cache
    if (this.repositoryManager) {
      try {
        const dbAgentId = AgentIdMapper.needsMapping(agentId) ? AgentIdMapper.getUUIDForStringId(agentId) : agentId;
        const dbAgent = { ...updatedAgent, id: dbAgentId };
        
        // Try to update first, if it returns null (not found), create the agent
        const updateResult = await this.repositoryManager.agents.update(dbAgentId, dbAgent);
        if (updateResult === null) {
          // Agent not found in database, create it
          console.log(`⚠️ Agent ${agentId} not found in database, creating new entry...`);
          await this.repositoryManager.agents.create(dbAgent);
          console.log(`💾 Created agent ${agentId} (DB ID: ${dbAgentId}) in database`);
        } else {
          console.log(`💾 Updated agent ${agentId} (DB ID: ${dbAgentId}) in database`);
        }
        
        // Update cache on successful database write
        try {
          // Redis removed - database is single source of truth
          console.log(`🔄 Cache updated for agent ${agentId}`);
        } catch (cacheError) {
          console.warn(`⚠️ Cache update failed for agent ${agentId}:`, cacheError);
        }
      } catch (error) {
        console.error('Failed to persist agent to database:', error instanceof Error ? error.message : 'Unknown error');
        throw error; // Fail fast - don't update agent if DB write fails
      }
    } else {
      // Fallback to Redis-only if database unavailable
      console.warn('⚠️ Database unavailable, using Redis-only persistence');
      // Redis removed - database is single source of truth
    }
    
    console.log(`✅ Updated agent ${agentId} with write-through cache`);
    return updatedAgent;
  }

  /**
   * Start an agent with LLM initialization
   */
  async startAgent(agentId: AgentId, requesterId?: string): Promise<Agent> {
    const agent = await this.getAgent(agentId, requesterId);

    // Check control access
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'agent',
        resourceId: agentId,
        operation: 'control',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    if (agent.status === 'active') {
      throw new Error(`Agent ${agentId} is already running`);
    }

    // Initialize LLM connection if configured
    if (agent.llmConfig.model) {
      await this.initializeLLMForAgent(agent);
    }

    const updatedAgent: Agent = {
      ...agent,
      status: 'active',
      deployment: {
        realmId: agent.deployment?.realmId || 'default',
        deployedAt: Date.now().toString(),
        lastHeartbeat: Date.now().toString(),
        health: 'healthy',
        resourceUsage: {
          memoryMB: 0,
          cpuPercent: 0,
          activeTasks: 0,
          queuedTasks: 0
        },
        performance: {
          tasksCompleted: 0,
          averageTaskTime: 0,
          successRate: 1.0,
          errorCount: 0
        }
      },
      updatedAt: Date.now().toString(),
      ...(requesterId && { lastModifiedBy: requesterId })
    };

    this.agents.set(agentId, updatedAgent);
    
    // Persist status change to storage
    try {
      // Redis removed - database is single source of truth
    } catch (error) {
      console.warn('Failed to persist agent status change to storage:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    return updatedAgent;
  }

  /**
   * Stop an agent
   */
  async stopAgent(agentId: AgentId, requesterId?: string): Promise<Agent> {
    const agent = await this.getAgent(agentId, requesterId);

    // Check control access
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'agent',
        resourceId: agentId,
        operation: 'control',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    const updatedAgent: Agent = {
      ...agent,
      status: 'inactive',
      updatedAt: Date.now().toString(),
      ...(requesterId && { lastModifiedBy: requesterId })
    };

    this.agents.set(agentId, updatedAgent);
    
    // Persist status change to storage
    try {
      // Redis removed - database is single source of truth
    } catch (error) {
      console.warn('Failed to persist agent stop to storage:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    return updatedAgent;
  }

  /**
   * Execute a prompt through an agent's LLM with optional agentic loop for iterative tool usage
   */
  async executeAgentPrompt(agentId: AgentId, request: AgentExecutionRequest, requesterId?: string): Promise<AgentExecutionResponse> {
    const agent = await this.getAgent(agentId, requesterId);

    if (agent.status !== 'active') {
      throw new Error(`Agent ${agentId} is not active`);
    }

    // Check execution access
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'agent',
        resourceId: agentId,
        operation: 'execute',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    const startTime = Date.now();

    // Generate system prompt
    let systemPrompt: string;

    if (request.systemPrompt) {
      // Use explicit system prompt override (for backward compatibility)
      systemPrompt = request.systemPrompt;
    } else if (request.collaborationContext?.usePersonaPrompt && request.collaborationContext.scenarioName) {
      // Generate enhanced persona-aware system prompt for collaborations (legacy)
      const collaborationContextStr = this.generateCollaborationContext(
        request.collaborationContext.scenarioName,
        request.collaborationContext.scenarioType,
        request.collaborationContext.agentRole
      );
      const baseSystemPrompt = this.generatePersonaSystemPrompt(
        agent,
        collaborationContextStr,
        request.collaborationContext.agentRole
      );
      systemPrompt = await this.generateRealmAwareSystemPrompt(agent, baseSystemPrompt, request.sessionId);
      const toolInformation = await this.generateToolAwarenessPrompt(agent);
      if (toolInformation) {
        systemPrompt += toolInformation;
      }
    } else if (this.promptCompositionService && agent.promptConfig) {
      // Use new prompt composition system (layered approach)
      try {
        // Get current realm ID from session if available
        let realmId: string | undefined;
        if (request.sessionId && agent.realmAccess?.currentRealmId) {
          realmId = agent.realmAccess.currentRealmId;
        } else if (agent.realmAccess?.boundRealmId) {
          realmId = agent.realmAccess.boundRealmId;
        }

        // Get available tools
        const availableTools = agent.mcpTools || [];

        const composedPrompt = await this.promptCompositionService.composePrompt(agent, {
          session_id: request.sessionId,
          user_id: 'system', // TODO: Pass actual user ID when available
          realm_id: realmId,
          timestamp: new Date().toISOString(),
          available_tools: availableTools
        });

        systemPrompt = composedPrompt.final_prompt;

        // Add tool awareness information after prompt composition
        const toolInformation = await this.generateToolAwarenessPrompt(agent);
        if (toolInformation) {
          systemPrompt += toolInformation;
        }

        if (composedPrompt.security_violations.length > 0) {
          console.warn(`⚠️  Agent ${agentId} has ${composedPrompt.security_violations.length} security violations in prompt composition`);
        }
      } catch (error) {
        console.error('Failed to compose prompt, falling back to legacy behavior:', error);
        // Fall back to legacy behavior
        const baseSystemPrompt = agent.llmConfig.systemPrompt || `You are ${agent.name}. ${agent.description}`;
        systemPrompt = await this.generateRealmAwareSystemPrompt(agent, baseSystemPrompt, request.sessionId);
        const toolInformation = await this.generateToolAwarenessPrompt(agent);
        if (toolInformation) {
          systemPrompt += toolInformation;
        }
      }
    } else {
      // Legacy behavior: use agent's configured system prompt or fallback
      const baseSystemPrompt = agent.llmConfig.systemPrompt || `You are ${agent.name}. ${agent.description}`;
      systemPrompt = await this.generateRealmAwareSystemPrompt(agent, baseSystemPrompt, request.sessionId);
      const toolInformation = await this.generateToolAwarenessPrompt(agent);
      if (toolInformation) {
        systemPrompt += toolInformation;
      }
    }

    // Check if agentic loop is enabled for this agent
    const agenticLoopEnabled = agent.llmConfig.agenticLoop?.enabled ?? false;

    if (agenticLoopEnabled) {
      // Use agentic loop for iterative tool calling
      return await this.executeAgentPromptWithAgenticLoop(
        agent,
        agentId,
        request,
        systemPrompt,
        startTime
      );
    } else {
      // Use traditional single-shot execution (backward compatibility)
      return await this.executeAgentPromptSingleShot(
        agent,
        agentId,
        request,
        systemPrompt,
        startTime
      );
    }
  }

  /**
   * Optimize tool results for context - truncate or summarize large responses
   */
  private optimizeToolResults(
    toolResults: string,
    agent: Agent,
    toolCalls: AgentToolCall[]
  ): string {
    const config = agent.llmConfig.agenticLoop;
    const maxTokens = config?.maxToolResultTokens ?? 1000;
    const shouldSummarize = config?.summarizeToolResults ?? true;

    // Rough token estimate (4 chars ≈ 1 token)
    const estimatedTokens = toolResults.length / 4;

    if (estimatedTokens <= maxTokens) {
      return toolResults; // Small enough, return as-is
    }

    // For GitHub/code review tools, extract key information instead of full JSON
    if (shouldSummarize && toolCalls.some(tc => tc.tool.includes('github'))) {
      return this.summarizeGitHubResults(toolResults, toolCalls);
    }

    // Fallback: truncate with ellipsis
    const charLimit = maxTokens * 4;
    if (toolResults.length > charLimit) {
      return toolResults.substring(0, charLimit) + '\n\n... [truncated ' +
        Math.round((toolResults.length - charLimit) / 1000) + 'KB of output]';
    }

    return toolResults;
  }

  /**
   * Summarize GitHub API results to extract only relevant information for code review
   */
  private summarizeGitHubResults(toolResults: string, _toolCalls: AgentToolCall[]): string {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(toolResults);

      // Handle array of PRs - ultra-compact format for agentic loop
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].number !== undefined) {
        return `Found ${parsed.length} PR(s):\n` + parsed.map(pr =>
          `#${pr.number}: ${pr.title.substring(0, 60)}${pr.title.length > 60 ? '...' : ''}`
        ).join('\n');
      }

      // Handle single PR details - minimal format
      if (parsed.number !== undefined && parsed.title !== undefined) {
        return `PR #${parsed.number}: ${parsed.title.substring(0, 80)}\n` +
          `${parsed.state} | ${parsed.user?.login} | +${parsed.additions ?? 0}/-${parsed.deletions ?? 0} in ${parsed.changed_files ?? '?'} files`;
      }

      // Handle PR files - ultra-compact, max 20 files shown
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].filename !== undefined) {
        const filesToShow = parsed.slice(0, 20);
        const fileList = filesToShow.map(file =>
          `${file.filename} (+${file.additions}/-${file.deletions})`
        ).join(', ');
        const truncated = parsed.length > 20 ? ` ... +${parsed.length - 20} more` : '';
        return `Files (${parsed.length}): ${fileList}${truncated}`;
      }

      // Fallback: return truncated JSON
      return JSON.stringify(parsed, null, 2).substring(0, 4000) + '\n... [truncated]';
    } catch (e) {
      // Not JSON, return truncated string
      return toolResults.substring(0, 4000) + '\n... [truncated]';
    }
  }

  /**
   * Apply sliding window to conversation history to limit context size
   */
  private applySlidingWindow(
    messages: Array<{ role: string; content: string }>,
    windowSize: number
  ): Array<{ role: string; content: string }> {
    if (messages.length <= windowSize + 1) {
      return messages; // +1 to always keep system message
    }

    // Always keep system message (first) + sliding window of recent messages
    const systemMessage = messages[0];
    if (!systemMessage) {
      return messages; // Safety check
    }

    const recentMessages = messages.slice(-windowSize);
    return [systemMessage, ...recentMessages];
  }

  /**
   * Execute agent prompt with agentic loop - enables iterative tool calling
   * The agent can make tool calls, see results, and decide on next actions in a loop
   */
  private async executeAgentPromptWithAgenticLoop(
    agent: Agent,
    agentId: AgentId,
    request: AgentExecutionRequest,
    systemPrompt: string,
    startTime: number
  ): Promise<AgentExecutionResponse> {
    const maxIterations = agent.llmConfig.agenticLoop?.maxIterations ?? 10;
    const trackCosts = agent.llmConfig.agenticLoop?.trackCosts ?? true;
    const contextStrategy = agent.llmConfig.agenticLoop?.contextStrategy ?? 'summarized';
    const slidingWindowSize = agent.llmConfig.agenticLoop?.slidingWindowSize ?? 5;

    // Initialize conversation history
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.prompt }
    ];

    let totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };

    let allToolCalls: AgentToolCall[] = [];
    let finalResponse = '';
    let iteration = 0;

    console.log(`🔄 Starting agentic loop for agent ${agentId} (max ${maxIterations} iterations)`);
    console.log(`📋 Context strategy: ${contextStrategy}, Model: ${agent.llmConfig.model}`);

    try {
      while (iteration < maxIterations) {
        iteration++;
        console.log(`🔄 Agentic loop iteration ${iteration}/${maxIterations}`);

        // Estimate current context size (rough approximation: 4 chars ≈ 1 token)
        const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
        const estimatedTokens = Math.round(totalChars / 4);
        console.log(`📊 Estimated context tokens: ~${estimatedTokens}`);

        // Warn if approaching common context limits and auto-adjust
        if (estimatedTokens > 6000 && agent.llmConfig.model.includes('3.5')) {
          console.warn(`⚠️ Context size (${estimatedTokens} tokens) approaching GPT-3.5 limit (8K). Consider using gpt-4 (128K context) or enabling sliding-window strategy.`);

          // If context is dangerously high, force sliding window to prevent failure
          if (estimatedTokens > 5000 && contextStrategy !== 'sliding-window') {
            console.warn(`⚠️ Auto-applying sliding window to prevent context overflow`);
            const windowedMessages = this.applySlidingWindow(messages, 3);
            messages.length = 0;
            messages.push(...windowedMessages);

            const newEstimate = Math.round(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
            console.log(`📊 Context reduced from ~${estimatedTokens} to ~${newEstimate} tokens`);
          }
        }

        // Call LLM with current conversation history
        // Dynamically adjust max_tokens based on context size to prevent overflow
        const dynamicTemperature = request.temperature;
        const { response, usage } = await this.callLLM(agent, messages, dynamicTemperature);

        // Accumulate token usage
        if (trackCosts && usage) {
          totalUsage.promptTokens += usage.promptTokens;
          totalUsage.completionTokens += usage.completionTokens;
          totalUsage.totalTokens += usage.totalTokens;
        }

        // Add assistant's response to conversation
        messages.push({ role: 'assistant', content: response });

        // Process any tool calls in the response
        const processedResponse = await this.processAgentToolCalls(agent, response, agentId);
        allToolCalls.push(...processedResponse.toolCalls);

        // If no tool calls were made, this is the final response
        if (processedResponse.toolCalls.length === 0) {
          console.log(`✅ Agentic loop completed - no more tool calls (iteration ${iteration})`);
          finalResponse = response;
          break;
        }

        // Tool calls were made - add results to conversation for next iteration
        console.log(`🔧 Processed ${processedResponse.toolCalls.length} tool call(s) in iteration ${iteration}`);

        // Optimize tool results based on context strategy
        let optimizedResults = processedResponse.finalResponse;
        if (contextStrategy === 'summarized') {
          const originalSize = optimizedResults.length;
          optimizedResults = this.optimizeToolResults(
            optimizedResults,
            agent,
            processedResponse.toolCalls
          );
          const savedBytes = originalSize - optimizedResults.length;
          if (savedBytes > 0) {
            console.log(`📉 Context optimization saved ~${Math.round(savedBytes / 1000)}KB (~${Math.round(savedBytes / 4)} tokens)`);
          }
        }

        // Create a user message with tool results for the next iteration
        const toolResultsMessage = `Tool execution results:\n${optimizedResults}`;
        messages.push({ role: 'user', content: toolResultsMessage });

        // Apply sliding window if configured
        if (contextStrategy === 'sliding-window') {
          const beforeCount = messages.length;
          const windowedMessages = this.applySlidingWindow(messages, slidingWindowSize);
          if (windowedMessages.length < beforeCount) {
            console.log(`🪟 Sliding window reduced context from ${beforeCount} to ${windowedMessages.length} messages`);
            messages.length = 0;
            messages.push(...windowedMessages);
          }
        }

        // Continue loop for next iteration
      }

      // If we exited due to max iterations, use the last response
      if (iteration >= maxIterations && !finalResponse) {
        console.warn(`⚠️ Agentic loop reached max iterations (${maxIterations})`);
        finalResponse = messages[messages.length - 1]?.content || 'Max iterations reached';
      }

      return {
        response: finalResponse,
        usage: totalUsage,
        executionTime: Date.now() - startTime,
        toolCalls: allToolCalls,
        metadata: {
          agenticLoop: {
            enabled: true,
            iterations: iteration,
            maxIterations
          }
        }
      };

    } catch (error) {
      console.error(`❌ Agentic loop failed at iteration ${iteration}:`, error);
      throw new Error(`Agentic loop execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute agent prompt in single-shot mode (original behavior, no agentic loop)
   */
  private async executeAgentPromptSingleShot(
    agent: Agent,
    agentId: AgentId,
    request: AgentExecutionRequest,
    systemPrompt: string,
    startTime: number
  ): Promise<AgentExecutionResponse> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.prompt }
    ];

    try {
      // Call LLM once
      const { response, usage } = await this.callLLM(agent, messages, request.temperature);

      // Process tool calls in the response
      const processedResponse = await this.processAgentToolCalls(agent, response, agentId, request.sessionId);

      return {
        response: processedResponse.finalResponse,
        usage,
        executionTime: Date.now() - startTime,
        toolCalls: processedResponse.toolCalls
      };
    } catch (error) {
      throw new Error(`LLM execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Call LLM with message history - abstracted to support both OpenAI and Ollama
   */
  private async callLLM(
    agent: Agent,
    messages: Array<{ role: string; content: string }>,
    temperature?: number
  ): Promise<{ response: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    if (agent.llmConfig.provider === 'openai') {
      if (!this.openaiClient) {
        throw new Error('OpenAI client not available. Please configure OPENAI_API_KEY.');
      }

      // Calculate dynamic max_tokens based on model context limits
      let maxTokens = agent.llmConfig.maxTokens || 3000;

      // Estimate current context size
      const contextChars = messages.reduce((sum, m) => sum + m.content.length, 0);
      const estimatedContextTokens = Math.round(contextChars / 4);

      // Get model context limit
      const modelContextLimit = agent.llmConfig.model.includes('gpt-4') ? 128000 :
                                agent.llmConfig.model.includes('gpt-3.5') ? 8192 : 8192;

      // Calculate safe max_tokens (leave buffer for model overhead)
      const safeMaxTokens = Math.max(500, modelContextLimit - estimatedContextTokens - 200);

      // Use the smaller of configured or safe limit
      if (maxTokens > safeMaxTokens) {
        console.log(`📉 Adjusting max_tokens from ${maxTokens} to ${safeMaxTokens} (context: ~${estimatedContextTokens} tokens, model limit: ${modelContextLimit})`);
        maxTokens = safeMaxTokens;
      }

      const openaiRequest: OpenAIChatRequest = {
        model: agent.llmConfig.model,
        messages: messages.map(m => ({ role: m.role as any, content: m.content })),
        temperature: temperature || agent.llmConfig.temperature || 0.7,
        max_tokens: maxTokens,
        ...(agent.llmConfig.topP && { top_p: agent.llmConfig.topP }),
        ...(agent.llmConfig.frequencyPenalty && { frequency_penalty: agent.llmConfig.frequencyPenalty }),
        ...(agent.llmConfig.presencePenalty && { presence_penalty: agent.llmConfig.presencePenalty })
      };

      const openaiResponse = await this.openaiClient.chat(openaiRequest);
      return {
        response: openaiResponse.choices[0]?.message?.content || '',
        usage: {
          promptTokens: openaiResponse.usage?.prompt_tokens || 0,
          completionTokens: openaiResponse.usage?.completion_tokens || 0,
          totalTokens: openaiResponse.usage?.total_tokens || 0
        }
      };
    } else {
      // Default to Ollama for 'ollama' provider and fallback
      const chatRequest: ChatRequest = {
        model: agent.llmConfig.model,
        messages: messages.map(m => ({ role: m.role as any, content: m.content })),
        options: {
          temperature: temperature || agent.llmConfig.temperature || 0.7,
          ...(agent.llmConfig.topP && { top_p: agent.llmConfig.topP }),
          ...(agent.llmConfig.maxTokens && { num_predict: agent.llmConfig.maxTokens })
        }
      };

      const ollamaResponse = await this.ollamaClient.chat(chatRequest);
      return {
        response: ollamaResponse.message.content,
        usage: {
          promptTokens: ollamaResponse.prompt_eval_count || 0,
          completionTokens: ollamaResponse.eval_count || 0,
          totalTokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
        }
      };
    }
  }

  /**
   * Generate tool awareness prompt that informs the agent about available tools
   */
  private async generateToolAwarenessPrompt(agent: Agent): Promise<string> {
    const availableTools = await this.getAvailableToolsForAgent(agent);

    console.log(`🛠️  Generated ${availableTools.length} tools for agent ${agent.id}:`, availableTools.map(t => t.name).join(', '));

    if (availableTools.length === 0) {
      return '';
    }

    let toolPrompt = `

## Available Tools
You have access to the following tools. To use tools, include one or more TOOL_CALL entries in your response with this exact format:
TOOL_CALL: {"tool": "tool_name", "params": {"param1": "value1", "param2": "value2"}}

You can make multiple tool calls in a single response by including multiple TOOL_CALL entries. Each will be executed in sequence.

Available tools:
`;

    for (const tool of availableTools) {
      toolPrompt += `- **${tool.name}**: ${tool.description}\n`;
      if (tool.parameters && Object.keys(tool.parameters).length > 0) {
        toolPrompt += `  Parameters: ${Object.keys(tool.parameters).join(', ')}\n`;
      }
    }

    toolPrompt += `\nOnly use tools that are explicitly listed above. Tool calls will be processed and results will be provided back to you. You can make multiple tool calls in a single response to accomplish complex tasks.

**CRITICAL**: When using file tools:
- list_files returns a "path" field for each file - use this EXACT value with read_file/write_file
- Do NOT modify paths - preserve underscores, hyphens, and special characters exactly as returned
- Example: If list_files returns {"path": "file:///app/data/My_File_Name.md"}, use that exact string`;

    return toolPrompt;
  }

  /**
   * Get list of tools available to a specific agent based on type and permissions
   */
  private async getAvailableToolsForAgent(agent: Agent): Promise<Array<{name: string, description: string, parameters?: any}>> {
    const tools: Array<{name: string, description: string, parameters?: any}> = [];

    console.log(`🔍 Getting tools for agent ${agent.id}:`, {
      hasResourceAccess: !!agent.resourceAccess,
      allowedLocations: agent.resourceAccess?.allowedLocations?.length || 0
    });

    // Universal inter-agent communication tools (all agents)
    tools.push(
      {
        name: 'message_agent',
        description: 'Send a message to another agent and get their response',
        parameters: { agent_id: 'target agent ID', message: 'message text' }
      },
      {
        name: 'delegate_task',
        description: 'Delegate a task to another agent for interactive collaboration (allows back-and-forth)',
        parameters: { agent_id: 'target agent ID', task: 'task description' }
      },
      {
        name: 'assign_simple_task',
        description: 'Assign a task to another agent for immediate completion (no interaction expected)',
        parameters: { agent_id: 'target agent ID', task: 'task description' }
      },
      {
        name: 'get_step_content',
        description: 'Retrieve content from a previous coordination step by content ID',
        parameters: { content_id: 'content ID from previous step (e.g., coordination/session-123-step-1)' }
      }
    );

    // Universal file and URL access tools (all agents with explicit opt-in via resourceAccess)
    if (agent.resourceAccess && (
      (agent.resourceAccess.allowedLocations && agent.resourceAccess.allowedLocations.length > 0) ||
      (agent.resourceAccess.allowedFilePaths && agent.resourceAccess.allowedFilePaths.length > 0) ||
      (agent.resourceAccess.allowedUrls && agent.resourceAccess.allowedUrls.length > 0)
    )) {
      // Check if agent has file access permissions
      const hasFileAccess = [
        ...(agent.resourceAccess.allowedLocations || []),
        ...(agent.resourceAccess.allowedFilePaths || [])
      ].some(loc => loc.startsWith('file:///'));

      // Check if agent has URL access permissions
      const hasUrlAccess = [
        ...(agent.resourceAccess.allowedLocations || []),
        ...(agent.resourceAccess.allowedUrls || [])
      ].some(loc => loc.startsWith('http://') || loc.startsWith('https://'));

      if (hasFileAccess) {
        console.log(`✅ Agent ${agent.id} has file access - adding file tools including process_files_batch`);
        tools.push(
          {
            name: 'read_file',
            description: 'Read content from a file. Requires file:/// URL with permission. CRITICAL: Use the EXACT path from list_files, preserving underscores and special characters.',
            parameters: { file_url: 'file:/// URL to read (e.g., file:///app/data/file.txt). MUST match exact path from list_files.' }
          },
          {
            name: 'write_file',
            description: 'Write content to a file. Requires file:/// URL with permission. Use exact paths with underscores preserved.',
            parameters: { file_url: 'file:/// URL to write', content: 'content to write to file' }
          },
          {
            name: 'list_files',
            description: 'List files and directories in a directory. Returns array with "path" field containing EXACT file URLs to use with read_file/write_file.',
            parameters: { directory_url: 'file:/// URL to directory (e.g., file:///app/data/)' }
          },
          {
            name: 'process_files_batch',
            description: 'Process multiple files in a directory with automatic iteration. Reads each file, executes processing instructions, and writes outputs. Handles all files automatically - no manual looping needed.',
            parameters: {
              input_directory: 'file:/// URL to input directory',
              output_directory: 'file:/// URL to output directory',
              file_pattern: 'optional glob pattern (e.g., *.md, *.txt)',
              processing_instructions: 'what to do with each file (e.g., "extract key concepts and create learning module")',
              output_filename_template: 'template for output filenames. Supported variables: {basename}, {filename}, {filename_without_extension} (with single or double braces). Example: "{basename}_module.md"'
            }
          }
        );
      } else {
        console.log(`❌ Agent ${agent.id} does NOT have file access - skipping file tools`);
      }

      if (hasUrlAccess) {
        tools.push(
          {
            name: 'fetch_url',
            description: 'Fetch content from an HTTP/HTTPS URL. Requires URL permission.',
            parameters: { url: 'HTTP or HTTPS URL to fetch', method: 'HTTP method (GET, POST, etc.)', body: 'optional request body', headers: 'optional request headers' }
          }
        );
      }
    }

    // Realm navigation tools (druids only)
    if (agent.type === 'druid') {
      tools.push(
        {
          name: 'travel_to_realm',
          description: 'Travel to a different realm (requires realm access permissions)',
          parameters: { target_realm: 'realm ID to travel to' }
        },
        {
          name: 'get_current_realm',
          description: 'Get information about your current realm location'
        },
        {
          name: 'get_realm_elementals',
          description: 'List elemental agents available in a specific realm',
          parameters: { realm_id: 'realm ID to query' }
        }
      );
    }

    // MCP tools via gateway (based on agent's mcpTools configuration)
    if (agent.mcpTools && agent.mcpTools.length > 0) {
      // Add tools from agent's MCP configuration
      // These will be validated and routed through the MCP Gateway
      for (const mcpTool of agent.mcpTools) {
        // Check if this is a wildcard pattern (e.g., "github:*")
        if (mcpTool.endsWith(':*')) {
          // Extract server prefix and discover actual tools
          const serverPrefix = mcpTool.slice(0, -2); // Remove ":*"
          const discoveredTools = await this.discoverMCPTools(agent, serverPrefix);
          tools.push(...discoveredTools);
        } else {
          // Static tool name
          tools.push({
            name: mcpTool,
            description: `Specialized tool: ${mcpTool} (routed via MCP Gateway)`,
            parameters: { /* Parameters will be validated by MCP Gateway */ }
          });
        }
      }
    }

    return tools;
  }

  /**
   * Discover available tools from an MCP server for dynamic tool resolution
   */
  private async discoverMCPTools(agent: Agent, serverPrefix: string): Promise<Array<{name: string, description: string, parameters?: any}>> {
    try {
      // Get agent's realm
      const realmId = agent.realmAccess?.boundRealmId || (agent as any).realmId;
      if (!realmId) {
        console.warn(`Cannot discover MCP tools for agent ${agent.id}: no realm binding`);
        return [];
      }

      // Get realm's MCP servers
      let realmServers: string[] = [];
      try {
        realmServers = await this.realmService.getMCPServers(realmId);
      } catch (error) {
        // Try config fallback
        const realmBinding = this.mcpConfigLoader.getRealmBinding(realmId);
        if (realmBinding && realmBinding.servers) {
          realmServers = realmBinding.servers;
        }
      }

      // Find the MCP server matching the prefix
      const targetServerId = realmServers.find(serverId => serverId === serverPrefix);
      if (!targetServerId) {
        console.warn(`MCP server ${serverPrefix} not found in realm ${realmId}`);
        return [];
      }

      // Get server config
      const serverConfig = this.mcpConfigLoader.getServer(targetServerId);
      if (!serverConfig || !serverConfig.baseUrl) {
        console.warn(`No config found for MCP server ${targetServerId}`);
        return [];
      }

      // Get authentication token
      let token: string | null = null;
      if (serverConfig.authentication.tokenSource === 'env' && serverConfig.authentication.envVar) {
        token = process.env[serverConfig.authentication.envVar] || null;
      }

      // Create appropriate MCP client
      let client: any;
      if (serverConfig.transport === 'sse') {
        const { SSEMCPClient } = await import('./mcp/SSEMCPClient');
        client = new SSEMCPClient(
          serverConfig.baseUrl,
          token,
          serverConfig.authentication.header,
          serverConfig.authentication.prefix,
          (serverConfig as any).customHeaders || {}
        );
      } else {
        const { HttpMCPClient } = await import('./mcp/HttpMCPClient');
        client = new HttpMCPClient(
          serverConfig.baseUrl,
          token,
          serverConfig.authentication.header,
          serverConfig.authentication.prefix
        );
      }

      // Call tools/list to discover available tools
      console.log(`🔍 Discovering tools from MCP server ${targetServerId}...`);
      const mcpResponse: any = await client.listTools();

      // Convert MCP tools to our format
      const tools: Array<{name: string, description: string, parameters?: any}> = [];
      if (Array.isArray(mcpResponse)) {
        // Response is directly an array of tools
        for (const tool of mcpResponse) {
          tools.push({
            name: `${serverPrefix}:${tool.name}`,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.inputSchema?.properties || {}
          });
        }
      } else if (mcpResponse && Array.isArray(mcpResponse.tools)) {
        // Response has a tools property
        for (const tool of mcpResponse.tools) {
          tools.push({
            name: `${serverPrefix}:${tool.name}`,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.inputSchema?.properties || {}
          });
        }
      }

      console.log(`✅ Discovered ${tools.length} tools from ${targetServerId}`);
      return tools;

    } catch (error) {
      console.error(`Failed to discover MCP tools for ${serverPrefix}:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Generate a realm-aware system prompt that includes realm context when agent is bound to a specific realm
   */
  private async generateRealmAwareSystemPrompt(agent: Agent, baseSystemPrompt: string, sessionId?: string): Promise<string> {
    // Determine which realm the agent is in
    let currentRealmId: string | undefined;

    // Check session-scoped realm state first (takes precedence for concurrent sessions)
    if (sessionId && this.coordinationService) {
      const sessionAgentManager = this.coordinationService.getSessionAgentManager(sessionId);
      if (sessionAgentManager) {
        const sessionState = sessionAgentManager.getAgentSessionState(agent.id);
        if (sessionState) {
          currentRealmId = sessionState.currentRealm;
          console.log(`🔍 Using session-scoped realm for agent ${agent.id} in session ${sessionId}: ${currentRealmId}`);
        }
      }
    }

    // Fall back to global agent realm state if no session context
    if (!currentRealmId) {
      currentRealmId = agent.realmAccess?.currentRealmId || agent.realmAccess?.boundRealmId;
    }

    if (!currentRealmId) {
      // No realm binding, return original system prompt
      return baseSystemPrompt;
    }

    try {
      // Get realm information
      const realm = await this.realmService.getRealm(currentRealmId);
      if (!realm || !realm.description) {
        // Realm not found or no description, return original system prompt
        return baseSystemPrompt;
      }

      // Combine base system prompt with realm context
      const realmContext = `

## Realm Context
You are currently operating within "${realm.name}". ${realm.description}

Your responses and behavior should be appropriate to this realm's context and characteristics while maintaining your core abilities and personality.`;

      return baseSystemPrompt + realmContext;
    } catch (error) {
      console.warn(`Failed to get realm context for agent ${agent.id}:`, error instanceof Error ? error.message : 'Unknown error');
      // Return original prompt if realm lookup fails
      return baseSystemPrompt;
    }
  }

  /**
   * Generate a persona-aware system prompt that incorporates agent's personality,
   * specialization, and collaboration context
   */
  private generatePersonaSystemPrompt(
    agent: Agent,
    collaborationContext?: string,
    agentRole?: string
  ): string {
    const personality = agent.personality;
    const specialization = agent.specialization;
    const agentTypeGuidance = this.getAgentTypePromptSuffix(agent.type);

    let prompt = `You are a ${agent.type} agent named "${agent.name}"`;

    if (collaborationContext) {
      prompt += ` ${collaborationContext}`;
    }

    prompt += `.\n\n`;

    // Include agent's custom system prompt if configured
    // This allows agent-specific guidance (e.g., github-elemental-oss thoroughness requirements)
    if (agent.llmConfig?.systemPrompt) {
      prompt += `AGENT-SPECIFIC INSTRUCTIONS:\n`;
      prompt += agent.llmConfig.systemPrompt;
      prompt += `\n\n`;
    }

    // Role and Specialization Section
    prompt += `ROLE & SPECIALIZATION:\n`;
    if (agentRole) {
      prompt += `- Role: ${agentRole}\n`;
    }
    prompt += `- Domain: ${specialization.domain}\n`;
    prompt += `- Expertise: ${specialization.expertise.join(', ')}\n`;
    if (specialization.skillLevel) {
      prompt += `- Skill Level: ${specialization.skillLevel}\n`;
    }
    prompt += `\n`;

    // Personality Section
    prompt += `PERSONALITY TRAITS:\n`;
    prompt += `- Communication Style: ${personality.communicationStyle}\n`;
    prompt += `- Decision Making: ${personality.decisionMaking}\n`;
    prompt += `- Core Traits: ${personality.traits.join(', ')}\n`;
    if (personality.riskTolerance) {
      prompt += `- Risk Tolerance: ${personality.riskTolerance}\n`;
    }
    if (personality.collaborationPreference) {
      prompt += `- Collaboration Style: ${personality.collaborationPreference}\n`;
    }
    prompt += `\n`;

    // Behavior Guidelines Section
    prompt += `BEHAVIOR GUIDELINES:\n`;
    prompt += this.generateBehaviorGuidelines(personality);
    prompt += `\n`;

    // Agent Type Specific Guidance
    prompt += `AGENT TYPE SPECIALIZATION:\n`;
    prompt += agentTypeGuidance;
    prompt += `\n`;

    // Task Approach Section
    prompt += `TASK APPROACH:\n`;
    prompt += `- Apply your ${agent.type} capabilities systematically\n`;
    prompt += `- Maintain ${personality.communicationStyle} communication standards\n`;
    prompt += `- Use ${personality.decisionMaking} decision-making approach\n`;
    prompt += `- Demonstrate traits: ${personality.traits.join(', ')}\n`;
    if (specialization.expertise.length > 0) {
      prompt += `- Leverage your expertise in: ${specialization.expertise.join(', ')}\n`;
    }

    return prompt;
  }
  
  /**
   * Generate behavior guidelines based on personality traits
   */
  private generateBehaviorGuidelines(personality: DruidPersona): string {
    let guidelines = '';
    
    // Communication style guidelines
    switch (personality.communicationStyle) {
      case 'formal':
        guidelines += '- Communicate with professional formality and clear structure\n';
        break;
      case 'casual':
        guidelines += '- Use approachable, friendly communication style\n';
        break;
      case 'technical':
        guidelines += '- Focus on precise, technical language and detailed explanations\n';
        break;
      case 'concise':
        guidelines += '- Keep responses brief and to-the-point\n';
        break;
      case 'verbose':
        guidelines += '- Provide comprehensive, detailed explanations\n';
        break;
    }
    
    // Decision making guidelines
    switch (personality.decisionMaking) {
      case 'analytical':
        guidelines += '- Approach decisions through systematic analysis and data evaluation\n';
        break;
      case 'intuitive':
        guidelines += '- Trust instincts and pattern recognition in decision making\n';
        break;
      case 'consensus-seeking':
        guidelines += '- Seek input and agreement from collaborators before decisions\n';
        break;
      case 'independent':
        guidelines += '- Make autonomous decisions based on available information\n';
        break;
      case 'rule-based':
        guidelines += '- Follow established procedures and guidelines strictly\n';
        break;
      case 'optimization-focused':
        guidelines += '- Always seek the most efficient and optimal solutions\n';
        break;
    }
    
    // Trait-specific guidelines
    personality.traits.forEach((trait: string) => {
      switch (trait.toLowerCase()) {
        case 'collaborative':
          guidelines += '- Actively engage with other agents and seek collaborative solutions\n';
          break;
        case 'focused':
          guidelines += '- Maintain clear focus on objectives and avoid unnecessary distractions\n';
          break;
        case 'reliable':
          guidelines += '- Deliver consistent, dependable results and follow through on commitments\n';
          break;
        case 'creative':
          guidelines += '- Explore innovative approaches and think outside conventional boundaries\n';
          break;
        case 'methodical':
          guidelines += '- Follow systematic, step-by-step approaches to problem-solving\n';
          break;
        case 'adaptive':
          guidelines += '- Adjust strategies based on changing circumstances and feedback\n';
          break;
      }
    });
    
    return guidelines;
  }
  
  /**
   * Get agent type-specific prompt guidance
   */
  private getAgentTypePromptSuffix(agentType: AgentType): string {
    switch (agentType) {
      case 'druid':
        return 'As a druid, you excel at coordination and high-level reasoning. Provide wise guidance, facilitate collaboration, and maintain harmony between different perspectives. Your strength lies in seeing the bigger picture and orchestrating complex multi-agent interactions.';
      case 'elemental':
        return 'As an elemental, you excel at specialized domain tasks with precision and structure. Focus on accurate execution of specific capabilities, maintain consistency in your approach, and deliver reliable results within your area of expertise.';
      case 'gaia':
        return 'As gaia, you excel at system-wide harmony and collaborative nurturing. Foster team dynamics, ensure balanced outcomes, and maintain the overall health of collaborative processes. Your role is to support and sustain the collaborative ecosystem.';
      case 'worldtree':
        return 'As worldtree, you excel at knowledge synthesis and maintaining contextual connections. Provide comprehensive insights that bridge different domains, maintain context across interactions, and serve as a knowledge hub for the collaboration.';
      default:
        return 'Apply your specialized capabilities systematically while maintaining your unique perspective and approach to problem-solving.';
    }
  }
  
  /**
   * Generate collaboration context description
   */
  private generateCollaborationContext(scenarioName: string, scenarioType?: string, agentRole?: string): string {
    let context = `participating in collaboration "${scenarioName}"`;
    
    if (scenarioType || agentRole) {
      context += '.\n\nCOLLABORATION DETAILS:';
      
      if (scenarioType) {
        context += `\n- Scenario Type: ${scenarioType}`;
      }
      
      if (agentRole) {
        context += `\n- Your Role: ${agentRole}`;
      }
      
      context += `\n- Expected collaboration style: ${scenarioType === 'collaboration' ? 'cooperative and coordinated' : 'professional and goal-oriented'}`;
    }
    
    return context;
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: AgentId, requesterId?: string): Promise<void> {
    const agent = await this.getAgent(agentId, requesterId);

    // Check delete access
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'agent',
        resourceId: agentId,
        operation: 'delete',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    // Stop agent first if running
    if (agent.status === 'active') {
      await this.stopAgent(agentId, requesterId);
    }

    // Delete from database first
    if (this.repositoryManager?.agents) {
      try {
        // Convert service ID to database UUID if needed
        const dbUUID = AgentIdMapper.getUUIDForStringId(agentId) || agentId;
        await this.repositoryManager.agents.delete(dbUUID);
        console.log(`🗑️ Agent ${agentId} deleted from database (UUID: ${dbUUID})`);
      } catch (error) {
        console.error('Failed to delete agent from database:', error instanceof Error ? error.message : 'Unknown error');
        throw new Error(`Failed to delete agent from database: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.warn('⚠️ Database unavailable for agent deletion');
      throw new Error('Database unavailable for agent deletion');
    }

    // Delete from memory cache
    this.agents.delete(agentId);
    
    console.log(`✅ Agent ${agentId} deleted successfully from both database and memory`);
  }

  /**
   * Validate agent configuration
   */
  private async validateAgentConfiguration(request: CreateAgentRequest): Promise<AgentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!request.name?.trim()) {
      errors.push('Agent name is required');
    }

    if (!request.type) {
      errors.push('Agent type is required');
    }

    if (!request.capabilities?.length) {
      errors.push('At least one capability is required');
    }

    // Validate LLM configuration
    if (request.llmConfig?.model && !request.llmConfig.model.trim()) {
      errors.push('LLM model name cannot be empty');
    }

    if (request.llmConfig?.temperature !== undefined) {
      if (request.llmConfig.temperature < 0 || request.llmConfig.temperature > 2) {
        errors.push('LLM temperature must be between 0 and 2');
      }
    }

    // Validate resource limits
    if (request.resourceLimits?.maxMemoryMB !== undefined && request.resourceLimits.maxMemoryMB < 1) {
      errors.push('Memory limit must be at least 1 MB');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Initialize LLM connection for an agent
   */
  private async initializeLLMForAgent(agent: Agent): Promise<void> {
    try {
      if (agent.llmConfig.provider === 'openai') {
        if (!this.openaiClient) {
          throw new Error('OpenAI client not available. Please configure OPENAI_API_KEY.');
        }
        // Test OpenAI connectivity
        await this.openaiClient.listModels();
      } else {
        // Test Ollama connectivity (default)
        await this.ollamaClient.listModels();
      }
    } catch (error) {
      throw new Error(`Failed to initialize LLM for agent ${agent.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize system agents
   */
  private initializeSystemAgents(): void {
    // No automatic test agent creation - require real agents
    console.log('🚀 AgentService initialized. Use the API to create agents.');
    // This would be expanded to create default system agents if needed
    // For now, just ensuring the service is ready
  }

  /**
   * Load agents from persistent storage into memory cache
   */
  private async loadAgentsFromStorage(): Promise<void> {
    // Redis removed - agents are loaded from database during initialization
    // This method is kept for compatibility but no longer loads from Redis cache
    console.log('📥 AgentService: Using database-only persistence, agents loaded during init');
  }

  /**
   * Refresh agent cache from database to get latest updates
   * Useful for concurrent user scenarios where agents may have been 
   * created/updated/deleted by other users
   */
  async refreshAgentCache(): Promise<void> {
    console.log('🔄 Refreshing agent cache from database...');

    // Clear current cache
    this.agents.clear();

    // Clear ID mappings
    AgentIdMapper.clearMappings();

    // Reload from database
    await this.loadAgentsFromDatabase();

    console.log(`✅ Agent cache refreshed - now contains ${this.agents.size} agents`);
  }

  /**
   * Extract and parse MCP response content from nested JSON structure
   * MCP responses come in format: { content: [{ type: "text", text: "..." }] }
   * The text field may contain escaped JSON that needs to be parsed
   */
  private extractMCPContent(mcpResponse: any): any {
    // If there's an error flag, return the error content
    if (mcpResponse?.isError) {
      return mcpResponse;
    }

    // Check if this is an MCP-formatted response
    if (mcpResponse?.content && Array.isArray(mcpResponse.content)) {
      // Extract the text from the first content item
      const firstContent = mcpResponse.content[0];
      if (firstContent?.type === 'text' && firstContent.text) {
        const textContent = firstContent.text;

        // Try to parse the text as JSON if it looks like JSON
        if (typeof textContent === 'string' &&
            (textContent.trim().startsWith('[') || textContent.trim().startsWith('{'))) {
          try {
            const parsed = JSON.parse(textContent);
            console.log(`✅ Successfully parsed MCP content JSON`);
            return parsed;
          } catch (parseError) {
            // Not valid JSON, return as-is
            console.log(`⚠️ MCP content text is not valid JSON, returning as string`);
            return textContent;
          }
        }

        // Return text content directly
        return textContent;
      }
    }

    // Not an MCP response format, return as-is
    return mcpResponse;
  }

  /**
   * Process tool calls in an agent's response and execute them
   */
  private async processAgentToolCalls(agent: Agent, response: string, agentId: AgentId, sessionId?: string): Promise<ProcessedAgentResponse> {
    const toolCalls: AgentToolCall[] = [];
    let processedResponse = response;

    // Parse tool calls from the response using brace counting for robust JSON extraction
    const matches: Array<{0: string, 1: string, index: number}> = [];
    const toolCallPrefix = /TOOL_CALL:\s*/g;
    let prefixMatch;

    while ((prefixMatch = toolCallPrefix.exec(response)) !== null) {
      const startIndex = prefixMatch.index + prefixMatch[0].length;

      // Extract JSON by counting braces
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let jsonEnd = -1;

      for (let i = startIndex; i < response.length; i++) {
        const char = response[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') braceCount++;
          else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
      }

      if (jsonEnd > startIndex) {
        const jsonStr = response.substring(startIndex, jsonEnd);
        matches.push({
          0: prefixMatch[0] + jsonStr,
          1: jsonStr,
          index: prefixMatch.index
        } as any);
      }
    }

    if (matches.length === 0) {
      // No tool calls found, return original response
      return {
        finalResponse: response,
        toolCalls: []
      };
    }

    // Process each tool call
    for (const match of matches) {
      try {
        console.log(`🔍 Raw tool call match: ${match[1]}`);
        const toolCallJson = JSON.parse(match[1]!);
        console.log(`🔍 Parsed tool call JSON:`, JSON.stringify(toolCallJson, null, 2));
        const toolName = toolCallJson.tool;
        const params = toolCallJson.params || {};

        console.log(`🔧 Agent ${agentId} calling tool: ${toolName}`, params);

        const toolCallStart = Date.now();
        let toolResult: any;
        let success = true;

        try {
          // Execute the tool call through internal MCP interface (with session context if available)
          const rawToolResult = await this.executeAgentTool(agent, toolName, params, sessionId);

          // Extract and parse MCP response content for better agent consumption
          toolResult = this.extractMCPContent(rawToolResult);

        } catch (error) {
          console.error(`❌ Tool call failed for agent ${agentId}:`, error);
          toolResult = { error: error instanceof Error ? error.message : 'Tool execution failed' };
          success = false;
        }

        const toolCall: AgentToolCall = {
          tool: toolName,
          params,
          result: toolResult,
          success,
          executionTime: Date.now() - toolCallStart
        };

        toolCalls.push(toolCall);

        // Replace the tool call in the response with the result
        // Apply optimization for agentic loop to prevent token explosion
        let toolResultText: string;
        if (!success) {
          toolResultText = `TOOL_ERROR: ${toolResult.error}`;
        } else {
          // Check if agentic loop is enabled and should optimize
          const shouldOptimize = agent.llmConfig.agenticLoop?.enabled &&
            (agent.llmConfig.agenticLoop?.contextStrategy === 'summarized' ||
             agent.llmConfig.agenticLoop?.contextStrategy === undefined);

          if (shouldOptimize) {
            // Optimize tool results before adding to context
            const stringified = JSON.stringify(toolResult, null, 2);
            const optimized = this.optimizeToolResults(stringified, agent, [toolCall]);
            toolResultText = `TOOL_RESULT: ${optimized}`;

            const savedTokens = Math.round((stringified.length - optimized.length) / 4);
            if (savedTokens > 100) {
              console.log(`📉 Tool result optimized: saved ~${savedTokens} tokens`);
            }
          } else {
            // No optimization - original behavior
            toolResultText = `TOOL_RESULT: ${JSON.stringify(toolResult, null, 2)}`;
          }
        }

        processedResponse = processedResponse.replace(match[0], toolResultText);

      } catch (parseError) {
        console.error(`❌ Failed to parse tool call for agent ${agentId}:`, parseError);
        processedResponse = processedResponse.replace(match[0], 'TOOL_ERROR: Invalid tool call format');
      }
    }

    return {
      finalResponse: processedResponse,
      toolCalls
    };
  }

  /**
   * Execute a specific tool call for an agent
   */
  private async executeAgentTool(agent: Agent, toolName: string, params: any, sessionId?: string): Promise<any> {
    // Define built-in tools that are handled internally (not via MCP Gateway)
    const builtInTools = [
      'message_agent', 'delegate_task', 'assign_simple_task', 'get_step_content',      // Communication tools (all agents)
      'travel_to_realm', 'get_current_realm', 'get_realm_elementals',  // Realm tools (druids only)
      'read_file', 'write_file', 'list_files', 'process_files_batch', 'fetch_url'  // Resource access tools (opt-in via resourceAccess)
    ];

    // Check if this is a built-in tool
    if (builtInTools.includes(toolName)) {
      return await this.executeBuiltInTool(agent, toolName, params, sessionId);
    }

    // All other tools are MCP tools that must go through the gateway
    console.log(`🌐 Routing MCP tool ${toolName} for agent ${agent.id} through MCP Gateway`);
    return await this.routeToolThroughMCPGateway(agent.id, toolName, params);
  }

  /**
   * Execute built-in tools (communication and realm navigation)
   */
  private async executeBuiltInTool(agent: Agent, toolName: string, params: any, sessionId?: string): Promise<any> {
    // Define inter-agent communication tools that all agents can access
    const communicationTools = ['message_agent', 'delegate_task', 'assign_simple_task', 'get_step_content'];

    // Define realm navigation tools (for druids)
    const realmTools = ['travel_to_realm', 'get_current_realm', 'get_realm_elementals'];

    // Define resource access tools (all agents with explicit opt-in)
    const resourceAccessTools = ['read_file', 'write_file', 'list_files', 'process_files_batch', 'fetch_url'];

    // Check access permissions based on agent type and tool category
    if (communicationTools.includes(toolName)) {
      // All agents can use inter-agent communication tools
      console.log(`✅ Agent ${agent.id} (${agent.type}) accessing communication tool: ${toolName}`);
    } else if (realmTools.includes(toolName)) {
      // Only druids can use realm navigation tools
      if (agent.type !== 'druid') {
        throw new Error(`Agent ${agent.id} (${agent.type}) cannot access realm navigation tool: ${toolName}. Only druid agents can navigate realms.`);
      }
      console.log(`✅ Druid agent ${agent.id} accessing realm navigation tool: ${toolName}`);
    } else if (resourceAccessTools.includes(toolName)) {
      // All agents can use resource access tools if they have explicit permissions
      if (!agent.resourceAccess) {
        throw new Error(`Agent ${agent.id} cannot access ${toolName}: no resourceAccess configured. Configure allowedLocations to grant access.`);
      }
      console.log(`✅ Agent ${agent.id} (${agent.type}) accessing resource tool: ${toolName}`);
    } else {
      throw new Error(`Unknown built-in tool: ${toolName}`);
    }

    // Route to appropriate tool implementation
    switch (toolName) {
      case 'message_agent':
        return await this.toolMessageAgent(agent.id, params);
      
      case 'delegate_task':
        return await this.toolDelegateTask(agent.id, params);
      
      case 'assign_simple_task':
        return await this.toolAssignSimpleTask(agent.id, params);
      
      case 'get_step_content':
        return await this.toolGetStepContent(params);
      
      case 'travel_to_realm':
        return await this.toolTravelToRealm(agent.id, params, sessionId);

      case 'get_current_realm':
        return await this.toolGetCurrentRealm(agent.id);
      
      case 'get_realm_elementals':
        return await this.toolGetRealmElementals(params);

      case 'read_file':
        return await this.toolReadFile(agent, params);

      case 'write_file':
        return await this.toolWriteFile(agent, params);

      case 'list_files':
        return await this.toolListFiles(agent, params);

      case 'process_files_batch':
        return await this.toolProcessFilesBatch(agent, params, sessionId);

      case 'fetch_url':
        return await this.toolFetchUrl(agent, params);

      default:
        throw new Error(`Unknown built-in tool: ${toolName}`);
    }
  }

  /**
   * Tool: Discover other agents within the same realm
   * This tool only shows agents that are in the same realm as the requesting agent
   */
  public async toolDiscoverAgents(requestingAgent: Agent, params: { capabilities?: string[] }): Promise<any> {
    // Get the agent's current realm
    const currentRealmId = (requestingAgent as any).realmId || 
                          requestingAgent.realmAccess?.currentRealmId || 
                          requestingAgent.realmAccess?.boundRealmId;
    
    if (!currentRealmId) {
      throw new Error(`Agent ${requestingAgent.name} (${requestingAgent.id}) is not bound to any realm and cannot discover other agents`);
    }

    const filters: AgentQueryFilters = {
      status: ['active'], // Only return active agents
      realmId: currentRealmId // Only agents in the same realm
    };

    // Only apply capability filtering if specific capabilities were requested
    if (params.capabilities && params.capabilities.length > 0) {
      filters.capabilities = params.capabilities;
    }

    console.log(`🔍 Agent ${requestingAgent.name} (${requestingAgent.id}) discovering agents in realm: ${currentRealmId}`);
    const agents = await this.listAgents(filters);
    
    // Remove the requesting agent from the results (agents can't discover themselves)
    const otherAgents = agents.filter(agent => agent.id !== requestingAgent.id);
    
    console.log(`🔍 Found ${otherAgents.length} other agents in realm ${currentRealmId}:`, otherAgents.map(a => `${a.id}(${a.name})`));
    
    return {
      realm: currentRealmId,
      agents: otherAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        capabilities: agent.capabilities,
        domain: agent.domain,
        realmId: agent.realmId
      })),
      count: otherAgents.length
    };
  }

  /**
   * Resolve agent name to agent ID if needed (similar to CoordinationService)
   */
  private async resolveAgentId(agentIdOrName: string): Promise<string> {
    // First, try to get agent by ID directly
    try {
      const agent = await this.getAgent(agentIdOrName as AgentId);
      if (agent) {
        return agentIdOrName; // It's already an ID
      }
    } catch (error) {
      // Not found by ID, try name resolution
    }

    // Name patterns for common agents
    const namePatterns = [
      { pattern: /pierre robert/i, id: 'pierre-robert' },
      { pattern: /de lint/i, id: 'de-lint' },
      { pattern: /tolkien/i, id: 'tolkien' },
      { pattern: /asimov/i, id: 'asimov' },
      { pattern: /lucas/i, id: 'lucas' },
      { pattern: /colleen/i, id: 'colleen' }
    ];

    // Check for specific agent name patterns
    for (const pattern of namePatterns) {
      if (pattern.pattern.test(agentIdOrName)) {
        try {
          const agent = await this.getAgent(pattern.id as AgentId);
          if (agent) {
            console.log(`🔄 Resolved agent name "${agentIdOrName}" to ID "${pattern.id}"`);
            return pattern.id;
          }
        } catch (error) {
          // Continue to next pattern
        }
      }
    }

    // If no pattern matches, try to find by name from all agents
    try {
      const agents = await this.listAgents({});
      const matchingAgent = agents.find(agent => 
        agent.name.toLowerCase() === agentIdOrName.toLowerCase() ||
        agent.name.toLowerCase().includes(agentIdOrName.toLowerCase()) ||
        agentIdOrName.toLowerCase().includes(agent.name.toLowerCase())
      );
      
      if (matchingAgent) {
        console.log(`🔄 Resolved agent name "${agentIdOrName}" to ID "${matchingAgent.id}"`);
        return matchingAgent.id;
      }
    } catch (error) {
      console.error('❌ Error searching agents by name:', error);
    }

    // If all else fails, return original value
    console.warn(`⚠️ Could not resolve agent identifier "${agentIdOrName}"`);
    return agentIdOrName;
  }

  /**
   * Tool: Send a message to another agent
   */
  private async toolMessageAgent(fromAgentId: AgentId, params: { agent_id: string; message: string }): Promise<any> {
    // Resolve agent name to ID if needed
    const resolvedAgentId = await this.resolveAgentId(params.agent_id);
    const targetAgent = await this.getAgent(resolvedAgentId as AgentId);
    
    if (targetAgent.status !== 'active') {
      throw new Error(`Target agent ${resolvedAgentId} is not active`);
    }

    // Execute the message as a prompt to the target agent
    const response = await this.executeAgentPrompt(resolvedAgentId as AgentId, {
      prompt: `Message from agent ${fromAgentId}: ${params.message}`,
      collaborationContext: {
        scenarioName: 'Inter-agent Communication',
        usePersonaPrompt: true
      }
    });

    return {
      target_agent: resolvedAgentId,
      message_sent: params.message,
      response: response.response,
      execution_time: response.executionTime
    };
  }

  /**
   * Tool: Delegate a task to another agent
   */
  private async toolDelegateTask(fromAgentId: AgentId, params: { agent_id: string; task: string }): Promise<any> {
    const fromAgent = await this.getAgent(fromAgentId);
    
    // Resolve agent name to ID if needed
    const resolvedAgentId = await this.resolveAgentId(params.agent_id);
    const targetAgent = await this.getAgent(resolvedAgentId as AgentId);
    
    if (targetAgent.status !== 'active') {
      throw new Error(`Target agent ${resolvedAgentId} is not active`);
    }

    // Check if target agent is in the same realm as the delegating agent
    const fromAgentRealm = fromAgent.realmAccess?.currentRealmId || fromAgent.realmAccess?.boundRealmId || 'default';
    const targetAgentRealm = targetAgent.realmAccess?.currentRealmId || targetAgent.realmAccess?.boundRealmId || 'default';

    if (fromAgentRealm !== targetAgentRealm) {
      throw new Error(`Cannot delegate to agent ${resolvedAgentId} in realm ${targetAgentRealm} from realm ${fromAgentRealm}. Agents can only delegate to other agents in their current realm.`);
    }

    // Execute the task delegation
    const response = await this.executeAgentPrompt(resolvedAgentId as AgentId, {
      prompt: `Task delegated from agent ${fromAgentId}: ${params.task}. Please execute this task and provide your results.`,
      collaborationContext: {
        scenarioName: 'Task Delegation',
        agentRole: 'task_executor',
        usePersonaPrompt: true
      }
    });

    return {
      target_agent: resolvedAgentId,
      task_delegated: params.task,
      result: response.response,
      execution_time: response.executionTime
    };
  }

  /**
   * Tool: Assign a simple task to another agent (no interactive collaboration)
   */
  private async toolAssignSimpleTask(fromAgentId: AgentId, params: { agent_id: string; task: string }): Promise<any> {
    const fromAgent = await this.getAgent(fromAgentId);
    
    // Resolve agent name to ID if needed
    const resolvedAgentId = await this.resolveAgentId(params.agent_id);
    const targetAgent = await this.getAgent(resolvedAgentId as AgentId);
    
    if (targetAgent.status !== 'active') {
      throw new Error(`Target agent ${resolvedAgentId} is not active`);
    }

    // Check if target agent is in the same realm as the delegating agent
    const fromAgentRealm = fromAgent.realmAccess?.currentRealmId || fromAgent.realmAccess?.boundRealmId || 'default';
    const targetAgentRealm = targetAgent.realmAccess?.currentRealmId || targetAgent.realmAccess?.boundRealmId || 'default';

    if (fromAgentRealm !== targetAgentRealm) {
      throw new Error(`Cannot assign task to agent ${resolvedAgentId} in realm ${targetAgentRealm} from realm ${fromAgentRealm}. Agents can only assign tasks to other agents in their current realm.`);
    }

    // Execute the simple task assignment with clear completion instruction
    const response = await this.executeAgentPrompt(resolvedAgentId as AgentId, {
      prompt: `SIMPLE TASK ASSIGNMENT from ${fromAgentId}: ${params.task}

IMPORTANT: This is a simple task assignment that should be completed in a single response. Please:
1. Use your own available tools and capabilities to complete this task
2. Complete the requested task fully
3. Provide your final result/deliverable
4. Do not ask questions or request further input
5. Consider this task complete when you finish your response

Task: ${params.task}

Please use your available tools to execute this task now and provide your complete result.`,
      collaborationContext: {
        scenarioName: 'Simple Task Assignment',
        agentRole: 'task_executor',
        usePersonaPrompt: true
      }
    });

    return {
      target_agent: resolvedAgentId,
      task_assigned: params.task,
      result: response.response,
      execution_time: response.executionTime,
      completion_type: 'simple_assignment'
    };
  }

  /**
   * Tool: Get content from a previous coordination step
   */
  private async toolGetStepContent(params: { content_id: string }): Promise<any> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      // content_id format: "step-session-{sessionId}-step-{stepNumber}"
      const contentId = params.content_id;
      
      if (!contentId.startsWith('step-session-')) {
        throw new Error(`Invalid content ID format: ${contentId}. Expected format: step-session-{sessionId}-step-{stepNumber}`);
      }
      
      // Extract session ID from content ID (keep the full session-xxx format)
      const sessionMatch = contentId.match(/step-(session-[^-]+(?:-[^-]+)*)-step-\d+/);
      if (!sessionMatch || !sessionMatch[1]) {
        throw new Error(`Could not extract session ID from content ID: ${contentId}`);
      }
      
      const fullSessionId = sessionMatch[1]; // This will be "session-1762622832666-af856d88"
      
      // Build path to session content file
      const sessionDir = path.join(process.cwd(), 'data', 'published_content', 'sessions', 'sessions', fullSessionId);
      const contentFilePath = path.join(sessionDir, `${contentId}.json`);
      
      console.log(`🔍 Retrieving step content from: ${contentFilePath}`);
      
      // Check if file exists
      try {
        await fs.access(contentFilePath);
      } catch (error) {
        throw new Error(`Step content not found: ${contentId}. File does not exist at ${contentFilePath}`);
      }
      
      // Read and parse the content file
      const contentData = await fs.readFile(contentFilePath, 'utf-8');
      const stepContent = JSON.parse(contentData);
      
      // Extract the actual content/output from the step
      const output = stepContent.data?.output || stepContent.output || '';
      const agentId = stepContent.data?.agent_id || stepContent.metadata?.agentId || 'unknown';
      const timestamp = stepContent.data?.timestamp || stepContent.metadata?.createdAt || 'unknown';
      
      console.log(`✅ Retrieved step content: ${contentId} from agent ${agentId}`);
      
      return {
        content_id: contentId,
        session_id: fullSessionId,
        agent_id: agentId,
        timestamp: timestamp,
        content: output,
        raw_data: stepContent.data || stepContent
      };
      
    } catch (error) {
      console.error(`❌ Failed to retrieve step content ${params.content_id}:`, error);
      throw new Error(`Failed to retrieve step content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Tool: Travel to a different realm (Druid agents only)
   */
  private async toolTravelToRealm(agentId: AgentId, params: { target_realm: string }, sessionId?: string): Promise<any> {
    const agent = await this.getAgent(agentId);

    // Check if agent is a druid (druids inherently have realm travel abilities)
    if (agent.type !== 'druid') {
      throw new Error(`Agent ${agentId} is not a druid and cannot travel between realms`);
    }

    // Resolve target realm name to UUID if needed
    let targetRealmId = params.target_realm;

    // Check if the target_realm is a name (not a UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.target_realm);

    if (!isUUID) {
      // Try to find realm by name (case-insensitive, handle common variations)
      const realms = await this.realmService.listRealms();

      // Normalize the search term: lowercase, remove common suffixes like " realm"
      const normalizeRealmName = (name: string) => {
        return name
          .toLowerCase()
          .replace(/\s+realm\s*$/i, '') // Remove " realm" suffix
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();
      };

      const normalizedSearch = normalizeRealmName(params.target_realm);

      const targetRealm = realms.find(realm =>
        normalizeRealmName(realm.name) === normalizedSearch
      );

      if (targetRealm) {
        targetRealmId = targetRealm.id;
      }
    }

    // Check if agent has access to target realm (check both the original param and resolved UUID)
    const hasAccess = agent.realmAccess?.accessibleRealms?.some(
      realm => {
        const realmId = typeof realm === 'string' ? realm : realm.realmId;
        return realmId === params.target_realm || realmId === targetRealmId;
      }
    );

    if (!hasAccess) {
      throw new Error(`Agent ${agentId} does not have access to realm ${params.target_realm} (resolved: ${targetRealmId})`);
    }

    // Determine previous realm
    const previousRealmId = agent.realmAccess?.currentRealmId || agent.realmAccess?.boundRealmId || 'default';

    // Update realm location - session-aware for concurrent sessions
    if (sessionId && this.coordinationService) {
      // Session-scoped travel: Update SessionAgentManager state only (doesn't affect agent's global state)
      const sessionAgentManager = this.coordinationService.getSessionAgentManager(sessionId);
      if (sessionAgentManager) {
        sessionAgentManager.updateAgentRealmState(agentId, targetRealmId, previousRealmId);
        console.log(`🌍 Session-scoped realm travel: Agent ${agentId} moved to ${targetRealmId} in session ${sessionId}`);
      } else {
        console.warn(`⚠️ SessionAgentManager not found for session ${sessionId}, falling back to global state update`);
        // Fallback to global update if session manager not available
        await this.updateAgent(agentId, {
          realmAccess: {
            ...agent.realmAccess,
            currentRealmId: targetRealmId
          }
        });
      }
    } else {
      // Non-session travel: Update agent's global current realm (original behavior)
      await this.updateAgent(agentId, {
        realmAccess: {
          ...agent.realmAccess,
          currentRealmId: targetRealmId
        }
      });
      console.log(`🌍 Global realm travel: Agent ${agentId} moved to ${targetRealmId}`);
    }

    return {
      agent_id: agentId,
      previous_realm: previousRealmId,
      current_realm: targetRealmId,
      realm_name: params.target_realm,
      travel_time: new Date().toISOString()
    };
  }

  /**
   * Tool: Get current realm location
   */
  private async toolGetCurrentRealm(agentId: AgentId): Promise<any> {
    const agent = await this.getAgent(agentId);
    
    const currentRealm = agent.realmAccess?.currentRealmId || 
                        agent.realmAccess?.boundRealmId || 
                        'default';

    return {
      agent_id: agentId,
      current_realm: currentRealm,
      agent_type: agent.type,
      can_travel: agent.type === 'druid' && agent.realmAccess?.allowRealmTravel
    };
  }

  /**
   * Tool: Get elemental agents in a specific realm
   */
  private async toolGetRealmElementals(params: { realm_id: string }): Promise<any> {
    // Get full agent data to access realmAccess information
    const allAgents = Array.from(this.agents.values()).filter(agent => 
      agent.type === 'elemental' && 
      agent.status === 'active' &&
      agent.realmAccess?.boundRealmId === params.realm_id
    );

    return {
      realm_id: params.realm_id,
      elementals: allAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        capabilities: agent.capabilities,
        domain: agent.specialization.domain,
        status: agent.status
      })),
      count: allAgents.length
    };
  }

  /**
   * Route MCP tool calls through the gateway with config-based routing
   */
  private async routeToolThroughMCPGateway(agentId: AgentId, toolName: string, params: any): Promise<any> {
    try {
      // 1. Get agent
      const agent = await this.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // 2. Verify agent is elemental
      if (agent.type !== 'elemental') {
        throw new Error(
          `Only elementals can call MCP tools (agent ${agentId} is ${agent.type})`
        );
      }

      // 3. Get realm ID - elementals should have boundRealmId
      const realmId = agent.realmAccess?.boundRealmId || (agent as any).realmId;
      if (!realmId) {
        throw new Error(`Elemental ${agentId} has no realmId (checked realmAccess.boundRealmId and realmId)`);
      }

      // 4. Get realm binding - check which MCP servers are available in this realm
      // First try database, then fall back to config
      let realmServers: string[] = [];

      try {
        // Try to get from database first (primary source)
        realmServers = await this.realmService.getMCPServers(realmId);
        console.log(`🔍 MCP: Got ${realmServers.length} servers from database for realm ${realmId}:`, realmServers);
      } catch (error) {
        // Realm not found in database or error - try config fallback
        console.log(`⚠️ Could not get realm MCP servers from database, trying config fallback. Error:`, error);
      }

      // If no servers in database, try config fallback
      if (realmServers.length === 0) {
        console.log(`🔍 MCP: No servers from database, trying config fallback for realm ${realmId}`);
        const realmBinding = this.mcpConfigLoader.getRealmBinding(realmId);
        console.log(`🔍 MCP: Config realm binding for ${realmId}:`, realmBinding);
        if (realmBinding && realmBinding.servers) {
          realmServers = realmBinding.servers;
          console.log(`🔍 MCP: Using config servers:`, realmServers);
        }
      }

      console.log(`🔍 MCP: Final realmServers array:`, realmServers);
      if (realmServers.length === 0) {
        throw new Error(
          `No MCP servers configured for realm ${realmId}. ` +
          `Add MCP servers to the realm via the UI or config file.`
        );
      }

      // 5. Find which server provides this tool (with wildcard support)
      let targetServerId: string | null = null;
      let targetServerConfig: any = null;

      for (const serverId of realmServers) {
        const serverConfig = this.mcpConfigLoader.getServer(serverId);
        if (serverConfig) {
          // Check if tool is available (support wildcards)
          const toolAvailable = serverConfig.tools.some((toolPattern: string) => {
            if (toolPattern === '*') {
              return true; // Wildcard matches all tools
            }
            if (toolPattern.includes('*')) {
              // Pattern matching (e.g., "get_*", "*_commit")
              const regex = new RegExp('^' + toolPattern.replace(/\*/g, '.*') + '$');
              return regex.test(toolName);
            }
            return toolPattern === toolName; // Exact match
          });

          if (toolAvailable) {
            targetServerId = serverId;
            targetServerConfig = serverConfig;
            break;
          }
        }
      }

      if (!targetServerId || !targetServerConfig) {
        throw new Error(
          `Tool ${toolName} not available in any MCP server for realm ${realmId}. ` +
          `Available servers: ${realmServers.join(', ')}`
        );
      }

      // 6. Validate agent has permission using wildcard pattern matching
      const hasPermission = agent.mcpTools?.some(pattern => {
        // Support both legacy format ("tool_name") and namespaced format ("server:tool_name")
        if (pattern.includes(':')) {
          // Namespaced format: check server and tool pattern
          const [patternServer, toolPattern] = pattern.split(':', 2);

          if (patternServer !== targetServerId) {
            return false; // Server doesn't match
          }

          // Check tool pattern (supports wildcards)
          if (toolPattern === '*') {
            return true; // All tools from this server
          }

          if (toolPattern && toolPattern.includes('*')) {
            // Wildcard pattern matching
            const regex = new RegExp('^' + toolPattern.replace(/\*/g, '.*') + '$');
            return regex.test(toolName);
          }

          return toolPattern === toolName;
        } else {
          // Legacy format: exact tool name match (backward compatibility)
          return pattern === toolName;
        }
      });

      if (!hasPermission) {
        throw new Error(
          `Agent ${agent.name || agentId} not authorized for ${targetServerId}:${toolName}. ` +
          `Agent mcpTools: ${agent.mcpTools?.join(', ') || 'none'}`
        );
      }

      // 7. Get service credential from environment
      const token = this.mcpConfigLoader.getServerToken(targetServerId);
      if (!token && targetServerConfig.authentication.type !== 'none') {
        throw new Error(
          `No token found for MCP server ${targetServerId}. ` +
          `Set ${targetServerConfig.authentication.envVar} in environment.`
        );
      }

      // 8. Get or create MCP client (HTTP or SSE based on transport)
      const clientKey = targetServerId; // One client per server (service credential)
      let client = this.mcpClients.get(clientKey);

      if (!client) {
        // Create appropriate client based on transport type
        if (targetServerConfig.transport === 'sse') {
          console.log(`🔌 Creating SSE MCP client for ${targetServerId}`);
          client = new SSEMCPClient(
            targetServerConfig.baseUrl!,
            token,
            targetServerConfig.authentication.header,
            targetServerConfig.authentication.prefix,
            targetServerConfig.customHeaders || {}
          );
        } else {
          // Default to HTTP transport
          console.log(`🔌 Creating HTTP MCP client for ${targetServerId}`);
          client = new HttpMCPClient(
            targetServerConfig.baseUrl!,
            token,
            targetServerConfig.authentication.header,
            targetServerConfig.authentication.prefix
          );
        }
        this.mcpClients.set(clientKey, client);
      }

      // 9. Strip server prefix from tool name before sending to MCP server
      // Tool names come in as "github:get_commit" but MCP servers expect just "get_commit"
      const actualToolName = toolName.includes(':')
        ? toolName.split(':')[1]!
        : toolName;

      console.log(
        `🌐 MCP Routing: agent=${agent.name || agentId}, tool=${targetServerId}:${actualToolName}, realm=${realmId}`
      );

      const result = await client.callTool(actualToolName, params);

      console.log(`✅ MCP tool ${targetServerId}:${toolName} completed for agent ${agent.name || agentId}`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown';
      console.error(`❌ MCP routing failed for ${toolName}:`, errorMessage);

      // Return error in MCP format
      return {
        content: [{
          type: 'text',
          text: `Error: ${errorMessage}`
        }],
        isError: true
      };
    }
  }

  /**
   * Tool: Read content from a file
   */
  private async toolReadFile(agent: Agent, params: { file_url: string }): Promise<any> {
    const { ResourceAccessValidator } = await import('./ResourceAccessValidator');

    if (!params.file_url) {
      throw new Error('file_url parameter is required');
    }

    // Validate file URL format
    if (!ResourceAccessValidator.isValidFileUrl(params.file_url)) {
      throw new Error('Invalid file URL: must start with file:///');
    }

    // Debug logging for permission checking
    console.log(`🔍 Permission check for agent ${agent.id}:`);
    console.log(`   Requested: ${params.file_url}`);
    console.log(`   Agent resourceAccess:`, JSON.stringify(agent.resourceAccess, null, 2));

    // Check access permissions
    if (!ResourceAccessValidator.hasAccess(agent.resourceAccess, params.file_url)) {
      throw new Error(ResourceAccessValidator.getAccessDeniedMessage(params.file_url, agent.id));
    }

    try {
      const fs = await import('fs/promises');
      const filePath = ResourceAccessValidator.fileUrlToPath(params.file_url);
      const content = await fs.readFile(filePath, 'utf-8');

      console.log(`📖 Agent ${agent.id} read file: ${params.file_url}`);

      return {
        success: true,
        file_url: params.file_url,
        content,
        size: content.length
      };
    } catch (error: any) {
      console.error(`❌ Error reading file ${params.file_url}:`, error.message);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Tool: Write content to a file
   */
  private async toolWriteFile(agent: Agent, params: { file_url: string; content: string }): Promise<any> {
    const { ResourceAccessValidator } = await import('./ResourceAccessValidator');

    if (!params.file_url) {
      throw new Error('file_url parameter is required');
    }

    if (params.content === undefined) {
      throw new Error('content parameter is required');
    }

    // Validate file URL format
    if (!ResourceAccessValidator.isValidFileUrl(params.file_url)) {
      throw new Error('Invalid file URL: must start with file:///');
    }

    // Check access permissions
    if (!ResourceAccessValidator.hasAccess(agent.resourceAccess, params.file_url)) {
      throw new Error(ResourceAccessValidator.getAccessDeniedMessage(params.file_url, agent.id));
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = ResourceAccessValidator.fileUrlToPath(params.file_url);

      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });

      // Write file
      await fs.writeFile(filePath, params.content, 'utf-8');

      console.log(`✍️  Agent ${agent.id} wrote file: ${params.file_url} (${params.content.length} bytes)`);

      return {
        success: true,
        file_url: params.file_url,
        bytes_written: params.content.length
      };
    } catch (error: any) {
      console.error(`❌ Error writing file ${params.file_url}:`, error.message);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  /**
   * Tool: List files and directories in a directory
   */
  private async toolListFiles(agent: Agent, params: { directory_url: string }): Promise<any> {
    const { ResourceAccessValidator } = await import('./ResourceAccessValidator');

    if (!params.directory_url) {
      throw new Error('directory_url parameter is required');
    }

    // Validate directory URL format
    if (!ResourceAccessValidator.isValidFileUrl(params.directory_url)) {
      throw new Error('Invalid directory URL: must start with file:///');
    }

    // Check access permissions for the directory
    if (!ResourceAccessValidator.hasAccess(agent.resourceAccess, params.directory_url)) {
      throw new Error(ResourceAccessValidator.getAccessDeniedMessage(params.directory_url, agent.id));
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dirPath = ResourceAccessValidator.fileUrlToPath(params.directory_url);

      // Check if directory exists
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      // Read directory contents
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Build file list with metadata
      const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(dirPath, entry.name);
        const entryStat = await fs.stat(entryPath);

        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? entryStat.size : undefined,
          modified: entryStat.mtime.toISOString(),
          path: `file://${entryPath}`  // file:// + absolute path = file:///path (entryPath starts with /)
        };
      }));

      console.log(`📂 Agent ${agent.id} listed directory: ${params.directory_url} (${files.length} entries)`);

      return {
        success: true,
        directory_url: params.directory_url,
        files,
        count: files.length
      };
    } catch (error: any) {
      console.error(`❌ Error listing directory ${params.directory_url}:`, error.message);
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  /**
   * Tool: Process multiple files in batch with automatic iteration
   * This tool eliminates the need for manual looping - it processes ALL files automatically
   */
  private async toolProcessFilesBatch(
    agent: Agent,
    params: {
      input_directory: string;
      output_directory: string;
      file_pattern?: string;
      processing_instructions: string;
      output_filename_template?: string;
    },
    sessionId?: string
  ): Promise<any> {
    const { ResourceAccessValidator } = await import('./ResourceAccessValidator');

    // Validate required parameters
    if (!params.input_directory) {
      throw new Error('input_directory parameter is required');
    }
    if (!params.output_directory) {
      throw new Error('output_directory parameter is required');
    }
    if (!params.processing_instructions) {
      throw new Error('processing_instructions parameter is required');
    }

    console.log(`🔄 Starting batch file processing for agent ${agent.id}`);
    console.log(`   Input: ${params.input_directory}`);
    console.log(`   Output: ${params.output_directory}`);
    console.log(`   Instructions: ${params.processing_instructions}`);

    try {
      // List all files in the input directory
      const listResult = await this.toolListFiles(agent, { directory_url: params.input_directory });

      // Filter files by pattern if provided
      let filesToProcess = listResult.files.filter((f: any) => f.type === 'file');
      if (params.file_pattern) {
        const pattern = params.file_pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
        const regex = new RegExp(pattern);
        filesToProcess = filesToProcess.filter((f: any) => regex.test(f.name));
      }

      console.log(`📋 Found ${filesToProcess.length} files to process`);

      const results: any[] = [];
      let successCount = 0;
      let errorCount = 0;

      // Process each file
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const fileNum = i + 1;

        console.log(`📄 Processing file ${fileNum}/${filesToProcess.length}: ${file.name}`);

        try {
          // Read the input file
          const fileContent = await this.toolReadFile(agent, { file_url: file.path });

          // Construct processing prompt for this file
          // CRITICAL: Agent's system prompt defines output format, processing_instructions are SECONDARY guidance
          const processingPrompt = `IMPORTANT: Review your system prompt's "Output Format" or "Domain Expertise" section and apply that EXACT format.

INPUT FILE: ${file.name}
FILE CONTENT:
${fileContent.content}

ADDITIONAL CONTEXT: ${params.processing_instructions}

YOUR TASK:
Transform the file content above using the EXACT OUTPUT FORMAT defined in your system prompt.

- If your system prompt defines learning modules: create a learning module with metadata comments, assessment questions, and practical exercises
- If your system prompt defines a specific markdown structure: use that exact structure
- If your system prompt shows format examples: follow those examples precisely

DO NOT:
- Create generic summaries or cleaned-up markdown
- Say "I've processed..." or describe what you did
- Deviate from your system prompt's specified format

Your entire response will be written to a file. Start with the formatted content immediately:`;

          // Execute processing via agent's LLM (self-processing)
          const processed = await this.executeAgentPrompt(agent.id, {
            prompt: processingPrompt,
            sessionId
          });

          // Determine output filename
          const path = await import('path');
          const basename = path.basename(file.name, path.extname(file.name));
          const outputTemplate = params.output_filename_template || '{basename}_processed.md';

          // Support multiple template variable formats:
          // {basename}, {{basename}}, {filename}, {{filename}}, {filename_without_extension}, {{filename_without_extension}}
          let outputFilename = outputTemplate
            .replace(/\{\{?basename\}\}?/g, basename)
            .replace(/\{\{?filename_without_extension\}\}?/g, basename)
            .replace(/\{\{?filename\}\}?/g, basename);

          // Construct output path
          const outputPath = `${params.output_directory.replace(/\/$/, '')}/${outputFilename}`;

          // Write the processed content
          await this.toolWriteFile(agent, {
            file_url: outputPath,
            content: processed.response
          });

          console.log(`✅ Successfully processed: ${file.name} → ${outputFilename}`);

          results.push({
            input_file: file.name,
            input_path: file.path,
            output_file: outputFilename,
            output_path: outputPath,
            status: 'success',
            processed_at: new Date().toISOString()
          });

          successCount++;

        } catch (error: any) {
          console.error(`❌ Error processing file ${file.name}:`, error.message);

          results.push({
            input_file: file.name,
            input_path: file.path,
            status: 'error',
            error: error.message,
            processed_at: new Date().toISOString()
          });

          errorCount++;
        }
      }

      console.log(`🎉 Batch processing complete: ${successCount} succeeded, ${errorCount} failed`);

      return {
        success: true,
        total_files: filesToProcess.length,
        succeeded: successCount,
        failed: errorCount,
        results
      };

    } catch (error: any) {
      console.error(`❌ Batch processing failed:`, error.message);
      throw new Error(`Batch processing failed: ${error.message}`);
    }
  }

  /**
   * Tool: Fetch content from an HTTP/HTTPS URL
   */
  private async toolFetchUrl(agent: Agent, params: { url: string; method?: string; body?: any; headers?: Record<string, string> }): Promise<any> {
    const { ResourceAccessValidator } = await import('./ResourceAccessValidator');

    if (!params.url) {
      throw new Error('url parameter is required');
    }

    // Validate URL format
    if (!ResourceAccessValidator.isValidHttpUrl(params.url)) {
      throw new Error('Invalid URL: must start with http:// or https://');
    }

    // Check access permissions
    if (!ResourceAccessValidator.hasAccess(agent.resourceAccess, params.url)) {
      throw new Error(ResourceAccessValidator.getAccessDeniedMessage(params.url, agent.id));
    }

    try {
      const method = (params.method || 'GET').toUpperCase();
      const headers = params.headers || {};

      console.log(`🌐 Agent ${agent.id} fetching URL: ${method} ${params.url}`);

      const fetchOptions: RequestInit = {
        method,
        headers
      };

      if (params.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = typeof params.body === 'string' ? params.body : JSON.stringify(params.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(params.url, fetchOptions);
      const contentType = response.headers.get('content-type') || '';

      let responseData: any;
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      return {
        success: true,
        url: params.url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
      };
    } catch (error: any) {
      console.error(`❌ Error fetching URL ${params.url}:`, error.message);
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  /**
   * Generate a unique agent ID
   */
  private generateAgentId(): AgentId {
    // Generate a proper UUID for new agents to ensure database compatibility
    return generateUUID();
  }
}
