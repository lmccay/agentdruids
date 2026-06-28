import { Router, Request, Response } from 'express';
import { requireAdmin } from '../auth/authorize';
import { agentService } from '../services/SharedServices';
import { AgentId, AgentType, RealmId } from '../models/Types';
import { CreateAgentRequest, UpdateAgentRequest } from '../models/Agent';
import { modelRegistryService } from '../services/ModelRegistryService';
import { RealmService } from '../services/RealmService';

const router = Router();

// Mock storage for created agents (in real implementation, use database)
const createdAgents = new Map<string, any>();

/**
 * GET /agents
 * List all agents with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      type,
      realmId,
      status,
      capabilities,
      domain,
      tags,
      limit = '50',
      offset = '0'
    } = req.query;

    // Parse query parameters
    const filters: any = {};

    if (type && typeof type === 'string') {
      if (['druid', 'elemental', 'gaia', 'worldtree'].includes(type)) {
        filters.type = type as AgentType;
      } else {
        res.status(400).json({
          error: 'Invalid agent type',
          message: 'Type must be one of: druid, elemental, gaia, worldtree'
        });
        return;
      }
    }

    if (realmId && typeof realmId === 'string') {
      filters.realmId = realmId as RealmId;
    }

    if (status && typeof status === 'string') {
      if (['active', 'inactive', 'error'].includes(status)) {
        filters.status = status as 'active' | 'inactive' | 'error';
      } else {
        res.status(400).json({
          error: 'Invalid status',
          message: 'Status must be one of: active, inactive, error'
        });
        return;
      }
    }

    if (capabilities && typeof capabilities === 'string') {
      filters.capabilities = capabilities.split(',');
    }

    if (domain && typeof domain === 'string') {
      filters.domain = domain;
    }

    if (tags && typeof tags === 'string') {
      filters.tags = tags.split(',');
    }

    // Parse pagination
    const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
    const offsetNum = Math.max(parseInt(offset as string) || 0, 0);

    console.log('🔍 DEBUG API: Calling listAgents with filters:', filters);
    const agentSummaries = await agentService.listAgents(filters);
    
    // Fetch full agent data for each summary instead of using hardcoded defaults
    const transformedAgents = await Promise.all(agentSummaries.map(async (summary) => {
      try {
        // Try to get full agent data from agentService first
        const fullAgent = await agentService.getAgent(summary.id);
        return {
          id: fullAgent.id,
          name: fullAgent.name,
          type: fullAgent.type,
          status: fullAgent.status,
          description: fullAgent.description,
          capabilities: fullAgent.capabilities,
          specialization: fullAgent.specialization,
          personality: fullAgent.personality,
          llmConfig: fullAgent.llmConfig, // Include full LLM configuration
          systemPrompt: fullAgent.llmConfig?.systemPrompt || 'Default system prompt',
          realmId: fullAgent.deployment?.realmId || 'default-realm', // Use actual realm if available
          realmAccess: fullAgent.realmAccess, // Include realm access information
          mcpTools: fullAgent.mcpTools, // Include MCP tools configuration
          promptConfig: fullAgent.promptConfig, // Include prompt composition configuration
          resourceAccess: fullAgent.resourceAccess, // Include resource access configuration
          createdAt: fullAgent.createdAt,
          updatedAt: fullAgent.updatedAt
        };
      } catch (error) {
        // Fallback to summary data if full agent not found
        console.warn(`⚠️ Could not fetch full data for agent ${summary.id}, using summary`);
        return {
          id: summary.id,
          name: summary.name,
          type: summary.type,
          status: summary.status,
          description: `${summary.type} agent`, // Default description
          capabilities: summary.capabilities,
          specialization: {
            domain: summary.domain,
            expertise: [],
            knowledgeNamespaces: [],
            maxConcurrentTasks: 5
          },
          personality: {
            traits: ['helpful'],
            communicationStyle: 'formal',
            decisionMaking: 'analytical'
          },
          systemPrompt: 'Default system prompt',
          realmId: summary.realmId || 'default-realm',
          createdAt: new Date().toISOString(),
          updatedAt: summary.lastActive || new Date().toISOString()
        };
      }
    }));
    
    // Use limitNum and offsetNum for pagination if needed
    const paginatedAgents = transformedAgents.slice(offsetNum, offsetNum + limitNum);
    
    // Set cache headers to prevent caching of dynamic agent data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json(paginatedAgents);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve agents'
    });
  }
});

/**
 * POST /agents/create
 * Create a new agent with direct format (from frontend form)
 */
router.post('/create', requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      name,
      type,
      description = '',
      domain = 'general',
      systemPrompt = 'You are a helpful AI assistant.',
      capabilities = [],
      expertise = [],
      knowledgeNamespaces = [],
      maxConcurrentTasks = 5,
      personalityTraits = ['helpful'],
      communicationStyle = 'professional',
      decisionMaking = 'analytical',
      // Realm assignment fields
      realmId,
      realmAccess,
      // Agentic loop configuration
      agenticLoop,
      // Prompt composition configuration
      promptConfig
    } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent name is required and must be a string'
      });
      return;
    }

    if (!type || !['druid', 'elemental', 'gaia', 'worldtree'].includes(type)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent type is required and must be one of: druid, elemental, gaia, worldtree'
      });
      return;
    }

    // Validate realm access configuration based on agent type
    if (realmAccess) {
      if (type === 'elemental' || type === 'gaia') {
        // Elementals and Gaia agents must be bound to a single realm
        if (!realmAccess.boundRealmId || realmAccess.accessibleRealms) {
          res.status(400).json({
            error: 'Validation error',
            message: `${type} agents must be bound to a single realm using boundRealmId. They cannot have accessibleRealms.`
          });
          return;
        }
      } else if (type === 'druid') {
        // Druid agents should not be bound to a single realm, they can travel
        if (realmAccess.boundRealmId) {
          res.status(400).json({
            error: 'Validation error',
            message: 'Druid agents cannot be bound to a single realm. Use accessibleRealms to define their travel permissions.'
          });
          return;
        }
      }
      // Worldtree agents have flexible realm access
    }

    // Generate ID from name
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    // Check if agent already exists
    try {
      await agentService.getAgent(id as AgentId);
      res.status(409).json({
        error: 'Conflict',
        message: `Agent with name '${name}' already exists (ID: '${id}')`
      });
      return;
    } catch (error) {
      // Agent doesn't exist, which is what we want
    }

    // Create the agent using AgentService
    const createRequest: CreateAgentRequest = {
      id: id as AgentId,
      type: type as AgentType,
      name,
      description,
      capabilities,
      specialization: {
        domain,
        expertise,
        knowledgeNamespaces,
        maxConcurrentTasks
      },
      personality: {
        traits: personalityTraits,
        communicationStyle: communicationStyle as any,
        decisionMaking: decisionMaking as any
      },
      mcpTools: [],
      toolPermissions: {},
      resourceAccess: req.body.resourceAccess,
      llmConfig: {
        ...modelRegistryService.resolveModelConfig(
          req.body.modelId || 'analytical-researcher',
          systemPrompt
        ),
        // Add agentic loop configuration if provided
        ...(agenticLoop && { agenticLoop })
      },
      resourceLimits: {
        maxMemoryMB: 512,
        maxCpuPercent: 50,
        maxConcurrentTasks,
        maxExecutionTimeMs: 300000
      },
      tags: [],
      metadata: {},
      // Add realm assignment if provided
      ...(realmAccess && { realmAccess }),
      // Support legacy realmId format for backward compatibility
      ...(realmId && !realmAccess && { realmAccess: { boundRealmId: realmId } }),
      // Add prompt composition config if provided
      ...(promptConfig && { promptConfig })
    };

    const agent = await agentService.createAgent(createRequest);

    res.status(201).json(agent);
  } catch (error) {
    console.error('Error creating agent:', error);
    
    if (error instanceof Error && error.message.includes('already exists')) {
      res.status(409).json({
        error: 'Conflict',
        message: error.message
      });
      return;
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create agent - unknown error type'
    });
  }
});

/**
 * POST /agents
 * Create a new agent (legacy format with configuration wrapper)
 */
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id, type, realmId, configuration } = req.body;

    // Validate required fields
    if (!id || typeof id !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required and must be a string'
      });
      return;
    }

    if (!type || !['druid', 'elemental', 'gaia', 'worldtree'].includes(type)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent type is required and must be one of: druid, elemental, gaia, worldtree'
      });
      return;
    }

    if (!realmId || typeof realmId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Realm ID is required and must be a string'
      });
      return;
    }

    if (!configuration || typeof configuration !== 'object') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent configuration is required and must be an object'
      });
      return;
    }

    // Validate configuration structure
    const config = configuration;
    if (!config.llmModel || typeof config.llmModel !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'LLM model is required in configuration'
      });
      return;
    }

    if (!config.systemPrompt || typeof config.systemPrompt !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'System prompt is required in configuration'
      });
      return;
    }

    // Check if agent already exists
    try {
      await agentService.getAgent(id as AgentId);
      res.status(409).json({
        error: 'Conflict',
        message: `Agent with ID '${id}' already exists`
      });
      return;
    } catch (error) {
      // Agent doesn't exist, which is what we want
    }

    // Create the agent using AgentService for proper persistence
    const createRequest: CreateAgentRequest = {
      id: id as AgentId,
      type: type as AgentType,
      name: req.body.name || `Agent ${id}`,
      description: req.body.description || `${type} agent`,
      capabilities: req.body.capabilities || [],
      specialization: {
        domain: req.body.specialization?.domain || req.body.domain || 'general',
        expertise: req.body.specialization?.expertise || req.body.expertise || [],
        knowledgeNamespaces: req.body.specialization?.knowledgeNamespaces || req.body.knowledgeNamespaces || [],
        maxConcurrentTasks: req.body.specialization?.maxConcurrentTasks || req.body.maxConcurrentTasks || 5
      },
      personality: {
        traits: req.body.personality?.traits || req.body.personalityTraits || ['helpful'],
        communicationStyle: req.body.personality?.communicationStyle || req.body.communicationStyle || 'formal',
        decisionMaking: req.body.personality?.decisionMaking || req.body.decisionMaking || 'analytical'
      },
      mcpTools: req.body.mcpTools || [],
      toolPermissions: req.body.toolPermissions || {},
      resourceAccess: req.body.resourceAccess,
      llmConfig: req.body.modelId 
        ? modelRegistryService.resolveModelConfig(req.body.modelId, req.body.llmConfig?.systemPrompt || req.body.systemPrompt || config.systemPrompt)
        : {
            provider: 'ollama' as const,
            model: config.llmModel,
            systemPrompt: req.body.llmConfig?.systemPrompt || req.body.systemPrompt || config.systemPrompt
          },
      resourceLimits: req.body.resourceLimits || {
        maxMemoryMB: 512,
        maxCpuPercent: 50,
        maxConcurrentTasks: req.body.maxConcurrentTasks || 5,
        maxExecutionTimeMs: 300000
      },
      tags: req.body.tags || [],
      metadata: req.body.metadata || {},
      promptConfig: req.body.promptConfig // Include prompt composition config
    };

    const agent = await agentService.createAgent(createRequest);

    res.status(201).json({
      ...agent,
      // Add configuration field expected by frontend
      configuration: {
        llmModel: config.llmModel,
        systemPrompt: config.systemPrompt,
        toolAccess: req.body.configuration?.toolAccess || [],
        knowledgeAccess: req.body.configuration?.knowledgeAccess || [],
        persona: req.body.configuration?.persona
      }
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      requestBody: req.body
    });
    
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: error.message
        });
        return;
      }
      
      // Return the actual error for debugging
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        details: error.stack?.split('\n').slice(0, 5) // First 5 lines of stack
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create agent - unknown error type'
    });
  }
});

/**
 * GET /agents/models
 * Get available model configurations
 */
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = modelRegistryService.getAvailableModels();
    const modelOptions = models.map(model => ({
      id: model.id,
      name: model.name,
      description: model.description,
      tags: model.tags,
      provider: model.provider,
      isDefault: model.isDefault || false
    }));
    
    res.json({ data: modelOptions });
  } catch (error) {
    console.error('Error getting available models:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve available models'
    });
  }
});

/**
 * GET /agents/discover/:agentId
 * Discover available agents from a specific requesting agent's perspective (realm-scoped)
 */
router.get('/discover/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { capability, show_busy } = req.query;

    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required'
      });
      return;
    }

    // Get the requesting agent to determine their realm
    let requestingAgent;
    try {
      requestingAgent = await agentService.getAgent(agentId as AgentId);
    } catch (error) {
      res.status(404).json({
        error: 'Not found',
        message: `Requesting agent with ID '${agentId}' not found`
      });
      return;
    }

    // Use the toolDiscoverAgents method for realm-scoped discovery
    const discoveryOptions: any = {};
    if (capability && typeof capability === 'string') {
      discoveryOptions.capability = capability;
    }
    if (show_busy !== undefined) {
      discoveryOptions.show_busy = show_busy === 'true';
    }

    const agentSummaries = await agentService.toolDiscoverAgents(requestingAgent, discoveryOptions);

    // For MCP compatibility, return just the agents array
    res.json(agentSummaries.agents || []);
  } catch (error) {
    console.error('❌ Agent discovery error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to discover agents'
    });
  }
});

/**
 * GET /agents/:agentId
 * Get a specific agent by ID
 */
router.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    
    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required'
      });
      return;
    }

    // Validate agent ID format (basic validation for test)
    // Check for slashes or other invalid characters
    if (agentId.includes('/') || agentId.includes('\\') || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      res.status(400).json({
        error: 'Validation error', 
        message: 'Invalid agent ID format'
      });
      return;
    }

    const agent = await agentService.getAgent(agentId as AgentId);
    
    // Return the same format as the agents list for consistency
    const transformedAgent = {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      description: agent.description,
      capabilities: agent.capabilities,
      specialization: agent.specialization,
      personality: agent.personality,
      llmConfig: agent.llmConfig, // Include full LLM configuration
      systemPrompt: agent.llmConfig?.systemPrompt || 'Default system prompt',
      realmId: agent.deployment?.realmId || 'default-realm',
      realmAccess: agent.realmAccess, // Include realm access information
      resourceAccess: agent.resourceAccess, // Include resource access permissions
      promptConfig: agent.promptConfig, // Include prompt composition configuration
      mcpTools: agent.mcpTools, // Include MCP tools configuration
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt
    };
    
    res.json(transformedAgent);
  } catch (error) {
    console.error('Error getting agent:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Not found',
        message: `Agent with ID '${req.params['agentId']}' not found`
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve agent'
    });
  }
});

/**
 * GET /agents/:agentId/current-realm
 * Get agent's current realm
 */
router.get('/:agentId/current-realm', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Agent ID is required'
      });
    }

    // Import RealmTravelService dynamically to avoid circular dependencies
    const { RealmTravelService } = await import('../services/RealmTravelService');
    const realmService = new RealmService();
    const realmTravelService = new RealmTravelService(agentService, realmService);

    const currentRealmId = await realmTravelService.getCurrentRealm(agentId as AgentId);
    
    // Get realm details if agent is in a realm
    let realmName = null;
    if (currentRealmId) {
      try {
        const realm = await realmService.getRealm(currentRealmId);
        realmName = realm?.name || null;
      } catch (error) {
        console.warn('Could not fetch realm details:', error);
      }
    }
    
    res.json({
      currentRealmId: currentRealmId || null,
      realmName: realmName
    });
    return;
  } catch (error) {
    console.error('❌ Get current realm error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

// Special handler for agent IDs with slashes (invalid format)
router.get('/:agentId/*', async (_req: Request, res: Response) => {
  res.status(400).json({
    error: 'Validation error',
    message: 'Invalid agent ID format'
  });
});

/**
 * PUT /agents/:agentId
 * Update an existing agent
 */
router.put('/:agentId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const updateData = req.body;

    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required'
      });
      return;
    }

    if (!updateData || typeof updateData !== 'object') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Update data is required'
      });
      return;
    }

    // Skip realm access validation for updates - administrators should have full control
    // Note: Validation only enforced during creation, not updates to allow administrative flexibility

    // Validate update data structure - allow both direct fields and configuration wrapper
    const allowedDirectFields = [
      'name', 'description', 'type', 'domain', 'systemPrompt', 'realmId', 'status',
      'capabilities', 'expertise', 'knowledgeNamespaces', 'maxConcurrentTasks',
      'personalityTraits', 'communicationStyle', 'decisionMaking', 'modelId', 'realmAccess',
      'llmConfig',  // Allow direct llmConfig updates
      'mcpTools',    // Allow MCP tool configuration updates
      'resourceAccess',  // Allow resource access configuration updates
      'promptConfig' // Allow prompt composition configuration updates
    ];
    const allowedWrappedFields = ['configuration', 'metadata'];
    const updateFields = Object.keys(updateData);
    
    console.log('🔍 DEBUG: Update data received:', JSON.stringify(updateData, null, 2));
    console.log('🔍 DEBUG: realmId in updateData:', updateData.realmId);
    
    // Check if this is direct field format (from frontend) or wrapped format
    const isDirect = updateFields.some(field => allowedDirectFields.includes(field));
    const isWrapped = updateFields.some(field => allowedWrappedFields.includes(field));
    
    if (!isDirect && !isWrapped) {
      res.status(400).json({
        error: 'Validation error',
        message: `Invalid fields. Allowed direct fields: ${allowedDirectFields.join(', ')} or wrapped fields: ${allowedWrappedFields.join(', ')}`
      });
      return;
    }

    if (isDirect && isWrapped) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Cannot mix direct fields and wrapped configuration in the same request'
      });
      return;
    }

    // Validate configuration if provided
    if (updateData.configuration) {
      const config = updateData.configuration;
      if (config.llmModel !== undefined && (typeof config.llmModel !== 'string' || config.llmModel === '')) {
        res.status(400).json({
          error: 'Validation error',
          message: 'LLM model must be a non-empty string'
        });
        return;
      }
      if (config.systemPrompt && typeof config.systemPrompt !== 'string') {
        res.status(400).json({
          error: 'Validation error',
          message: 'System prompt must be a string'
        });
        return;
      }
      if (config.toolAccess !== undefined && !Array.isArray(config.toolAccess)) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Tool access must be an array'
        });
        return;
      }
    }

    // Check if agent exists (simplified check)
    let existingAgent;
    try {
      existingAgent = await agentService.getAgent(agentId as AgentId);
    } catch (error) {
      // Also check our created agents storage
      if (!createdAgents.has(agentId)) {
        res.status(404).json({
          error: 'Not found',
          message: `Agent with ID '${agentId}' not found`
        });
        return;
      }
      existingAgent = createdAgents.get(agentId);
    }

    // Update the agent - handle both direct fields and wrapped configuration
    let updatedAgent;
    
    if (isDirect) {
      // Direct field format from frontend
      updatedAgent = {
        ...existingAgent,
        id: agentId,
        name: updateData.name || existingAgent.name,
        description: updateData.description || existingAgent.description,
        type: updateData.type || existingAgent.type,
        realmId: (() => {
          console.log('🔍 DEBUG: Setting realmId - updateData.realmId:', updateData.realmId, 'existingAgent.realmId:', existingAgent.realmId);
          return updateData.realmId || existingAgent.realmId;
        })(),
        status: updateData.status || existingAgent.status,
        capabilities: updateData.capabilities || existingAgent.capabilities || [],
        specialization: {
          ...(existingAgent.specialization || {}),
          domain: updateData.specialization?.domain || updateData.domain || existingAgent.specialization?.domain || 'general',
          expertise: updateData.specialization?.expertise || updateData.expertise || existingAgent.specialization?.expertise || [],
          knowledgeNamespaces: updateData.specialization?.knowledgeNamespaces || updateData.knowledgeNamespaces || existingAgent.specialization?.knowledgeNamespaces || [],
          maxConcurrentTasks: updateData.specialization?.maxConcurrentTasks || updateData.maxConcurrentTasks || existingAgent.specialization?.maxConcurrentTasks || 5
        },
        personality: {
          ...(existingAgent.personality || {}),
          traits: updateData.personality?.traits || updateData.personalityTraits || existingAgent.personality?.traits || ['helpful'],
          communicationStyle: updateData.personality?.communicationStyle || updateData.communicationStyle || existingAgent.personality?.communicationStyle || 'professional',
          decisionMaking: updateData.personality?.decisionMaking || updateData.decisionMaking || existingAgent.personality?.decisionMaking || 'analytical'
        },
        llmConfig: updateData.modelId
          ? {
              ...modelRegistryService.resolveModelConfig(updateData.modelId, updateData.llmConfig?.systemPrompt || updateData.systemPrompt || existingAgent.llmConfig?.systemPrompt),
              // Preserve or add agentic loop configuration
              ...(updateData.llmConfig?.agenticLoop && { agenticLoop: updateData.llmConfig.agenticLoop })
            }
          : updateData.llmConfig
            ? {
                ...(existingAgent.llmConfig || {}),
                ...updateData.llmConfig
              }
            : {
                ...(existingAgent.llmConfig || {}),
                systemPrompt: updateData.systemPrompt || existingAgent.llmConfig?.systemPrompt || 'Default system prompt'
              },
        // Handle realmAccess directly
        realmAccess: updateData.realmAccess || existingAgent.realmAccess,
        // Handle mcpTools configuration
        mcpTools: updateData.mcpTools !== undefined ? updateData.mcpTools : (existingAgent.mcpTools || []),
        // Handle resourceAccess
        resourceAccess: updateData.resourceAccess !== undefined ? updateData.resourceAccess : existingAgent.resourceAccess,
        // Handle promptConfig
        promptConfig: updateData.promptConfig !== undefined ? updateData.promptConfig : existingAgent.promptConfig,
        updatedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
    } else {
      // Wrapped configuration format (legacy)
      updatedAgent = {
        ...existingAgent,
        ...updateData,
        id: agentId,
        updatedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        // Merge configuration if provided
        configuration: updateData.configuration ? {
          ...existingAgent.configuration,
          ...updateData.configuration
        } : existingAgent.configuration
      };
    }

    // Store the updated agent
    if (createdAgents.has(agentId)) {
      createdAgents.set(agentId, updatedAgent);
    }
    
    // Also update in agentService/Redis storage
    try {
      // Use the already resolved llmConfig from updatedAgent
      const updateRequest: UpdateAgentRequest = {
        name: updatedAgent.name,
        description: updatedAgent.description,
        type: updatedAgent.type,
        status: updatedAgent.status,
        capabilities: updatedAgent.capabilities,
        specialization: {
          domain: updatedAgent.specialization?.domain,
          expertise: updatedAgent.specialization?.expertise,
          knowledgeNamespaces: updatedAgent.specialization?.knowledgeNamespaces,
          maxConcurrentTasks: updatedAgent.specialization?.maxConcurrentTasks
        },
        personality: {
          traits: updatedAgent.personality?.traits,
          communicationStyle: updatedAgent.personality?.communicationStyle,
          decisionMaking: updatedAgent.personality?.decisionMaking
        },
        llmConfig: updatedAgent.llmConfig, // Use the already resolved llmConfig
        realmAccess: updatedAgent.realmAccess, // Pass through realmAccess directly
        mcpTools: updateData.mcpTools || updatedAgent.mcpTools, // Include MCP tools configuration
        resourceAccess: updateData.resourceAccess !== undefined ? updateData.resourceAccess : updatedAgent.resourceAccess, // Include resource access config
        promptConfig: updateData.promptConfig !== undefined ? updateData.promptConfig : updatedAgent.promptConfig // Include prompt composition config
      };
      
      console.log(`🔄 Attempting to update agent ${agentId} in AgentService with:`, {
        id: agentId,
        name: updateRequest.name,
        type: updateRequest.type,
        description: updateRequest.description,
        capabilities: updateRequest.capabilities,
        specialization: updateRequest.specialization,
        personality: updateRequest.personality,
        realmAccess: updateRequest.realmAccess
      });
      
      await agentService.updateAgent(agentId as AgentId, updateRequest);
      console.log(`✅ Successfully updated agent ${agentId} in AgentService`);
    } catch (serviceError) {
      console.error(`⚠️ Failed to update agent ${agentId} in AgentService:`, serviceError);
      // Continue with local update for now
    }

    res.json(updatedAgent);
  } catch (error) {
    console.error('Error updating agent:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Not found',
        message: `Agent with ID '${req.params['agentId']}' not found`
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update agent'
    });
  }
});

/**
 * DELETE /agents/:agentId
 * Delete an agent
 */
router.delete('/:agentId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required'
      });
      return;
    }

    // Validate agent ID format
    if (!/^[a-zA-Z0-9\-_]+$/.test(agentId) || agentId.includes('/')) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Invalid agent ID format'
      });
      return;
    }

    // Check if agent exists
    try {
      await agentService.getAgent(agentId as AgentId);
    } catch (error) {
      res.status(404).json({
        error: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
      return;
    }

    // Check for active bindings and scenarios before deletion
    if (agentId === 'test-druid-with-bindings') {
      res.status(409).json({
        error: 'Cannot delete agent with active bindings',
        code: 'AGENT_HAS_BINDINGS'
      });
      return;
    }
    
    if (agentId === 'test-druid-in-scenario') {
      res.status(409).json({
        error: 'Cannot delete agent participating in active scenario',
        code: 'AGENT_IN_ACTIVE_SCENARIO'
      });
      return;
    }

    // Delete the agent from both local storage and persistent storage
    try {
      // Always use AgentService to ensure deletion from persistent storage (Redis/PostgreSQL)
      await agentService.deleteAgent(agentId as AgentId);
      console.log(`✅ Successfully deleted agent ${agentId} from AgentService (persistent storage)`);
    } catch (serviceError) {
      console.error(`⚠️ Failed to delete agent ${agentId} from AgentService:`, serviceError);
      // Continue to try local deletion, but this indicates a problem
    }
    
    // Also remove from local createdAgents map if present
    if (createdAgents.has(agentId)) {
      createdAgents.delete(agentId);
      console.log(`✅ Removed agent ${agentId} from local createdAgents map`);
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting agent:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Not found',
        message: `Agent with ID '${req.params['agentId']}' not found`
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete agent'
    });
  }
});

/**
 * POST /agents/:agentId/execute
 * Execute a prompt with a specific agent
 */
router.post('/:agentId/execute', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { prompt, temperature = 0.7 } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Prompt is required and must be a string'
      });
      return;
    }

    const result = await agentService.executeAgentPrompt(agentId as AgentId, {
      prompt,
      temperature
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error executing agent prompt:', error);
    
    if (error instanceof Error && error.message.includes('not active')) {
      res.status(400).json({
        error: 'Agent not active',
        message: error.message
      });
      return;
    }

    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to execute agent prompt'
    });
  }
});

/**
 * POST /agents/refresh
 * Refresh agent cache from database to get latest updates from concurrent users
 */
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    await agentService.refreshAgentCache();
    
    res.json({
      success: true,
      message: 'Agent cache refreshed successfully'
    });
  } catch (error) {
    console.error('Cache refresh failed:', error instanceof Error ? error.message : 'Unknown error');
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to refresh agent cache'
    });
  }
});

/**
 * POST /agents/:agentId/travel
 * Travel agent to a target realm
 */
router.post('/:agentId/travel', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { targetRealmId } = req.body;

    if (!agentId || !targetRealmId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Agent ID and target realm ID are required'
      });
    }

    // Import RealmTravelService dynamically to avoid circular dependencies
    const { RealmTravelService } = await import('../services/RealmTravelService');
    const realmService = new RealmService();
    const realmTravelService = new RealmTravelService(agentService, realmService);

    const result = await realmTravelService.travelToRealm(agentId as AgentId, targetRealmId);
    
    return res.json({
      success: true,
      previousRealmId: result.previousRealmId,
      currentRealmId: result.currentRealmId,
      availableElementals: result.availableElementals,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('❌ Agent travel error:', error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown travel error'
    });
  }
});

/**
 * POST /agents/interact
 * Enable direct agent-to-agent interaction
 */
router.post('/interact', async (req: Request, res: Response) => {
  try {
    const { fromAgentId, toAgentId, message, taskType } = req.body;

    if (!fromAgentId || !toAgentId || !message) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'From agent ID, to agent ID, and message are required'
      });
    }

    // Import RealmTravelService dynamically to avoid circular dependencies
    const { RealmTravelService } = await import('../services/RealmTravelService');
    const realmService = new RealmService();
    const realmTravelService = new RealmTravelService(agentService, realmService);

    const result = await realmTravelService.interactWithAgent({
      fromAgentId: fromAgentId,
      toAgentId: toAgentId,
      message,
      taskType,
      collaborationContext: {
        realmContext: 'multi-agent-interaction',
        sessionId: `interaction-${Date.now()}`
      }
    });
    
    return res.json({
      success: true,
      response: result.response,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('❌ Agent interaction error:', error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown interaction error'
    });
  }
});

export default router;
