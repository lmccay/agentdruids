"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const OllamaClient_1 = require("./OllamaClient");
const OpenAIClient_1 = require("./OpenAIClient");
const PolicyEngine_1 = require("./PolicyEngine");
const AgentStorage_1 = require("./AgentStorage");
/**
 * Agent Service for managing agent lifecycle, LLM integration, and policy enforcement
 */
class AgentService {
    constructor(ollamaClient, policyEngine, openaiClient, storage) {
        this.agents = new Map();
        this.openaiClient = null;
        this.ollamaClient = ollamaClient || new OllamaClient_1.OllamaClient((0, OllamaClient_1.createDefaultOllamaConfig)());
        this.policyEngine = policyEngine || new PolicyEngine_1.PolicyEngine();
        this.storage = storage || new AgentStorage_1.AgentStorage();
        // Initialize OpenAI client if API key is available
        try {
            this.openaiClient = openaiClient || new OpenAIClient_1.OpenAIClient((0, OpenAIClient_1.createDefaultOpenAIConfig)());
        }
        catch (error) {
            console.warn('OpenAI client not initialized (API key missing):', error instanceof Error ? error.message : 'Unknown error');
        }
        this.initializeSystemAgents();
        // Load agents from storage asynchronously 
        this.loadAgentsFromStorage().catch(error => {
            console.warn('Failed to load agents from storage during initialization:', error instanceof Error ? error.message : 'Unknown error');
            // No fallback to test agents - require real agents to be created
            if (this.agents.size === 0) {
                console.warn('⚠️ No agents found in storage. Real agents must be created via the API.');
            }
        });
    }
    /**
     * Create a new agent with LLM configuration and policy validation
     */
    async createAgent(request) {
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
        const now = Date.now().toString();
        const agent = {
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
            llmConfig: request.llmConfig,
            resourceLimits: request.resourceLimits || {
                maxMemoryMB: 512,
                maxCpuPercent: 50,
                maxConcurrentTasks: 10,
                maxExecutionTimeMs: 300000
            },
            bindings: [],
            tags: request.tags || [],
            metadata: request.metadata || {},
            createdAt: now,
            updatedAt: now
        };
        this.agents.set(agentId, agent);
        // Persist to storage
        try {
            await this.storage.setAgent(agentId, agent);
        }
        catch (error) {
            console.warn('Failed to persist agent to storage:', error instanceof Error ? error.message : 'Unknown error');
        }
        return agent;
    }
    /**
     * Get an agent by ID with policy enforcement
     */
    async getAgent(agentId, requesterId) {
        let agent = this.agents.get(agentId);
        // If not in memory, try loading from storage
        if (!agent) {
            try {
                const storageAgent = await this.storage.safeGetAgent(agentId);
                if (storageAgent) {
                    agent = storageAgent;
                    // Load into memory cache
                    this.agents.set(agentId, agent);
                    console.log(`📥 Loaded agent ${agentId} from storage into memory`);
                }
            }
            catch (error) {
                console.warn('Failed to load agent from storage:', error instanceof Error ? error.message : 'Unknown error');
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
     * List agents with filtering and policy enforcement
     */
    async listAgents(filters = {}, requesterId) {
        let agents = Array.from(this.agents.values());
        console.log(`🔍 DEBUG AgentService: Total agents in storage: ${agents.length}`);
        console.log(`🔍 DEBUG AgentService: Agent IDs:`, agents.map(a => `${a.id}(${a.status})`));
        // Apply filters
        if (filters.type) {
            const types = Array.isArray(filters.type) ? filters.type : [filters.type];
            agents = agents.filter(agent => types.includes(agent.type));
        }
        if (filters.status) {
            const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
            agents = agents.filter(agent => statuses.includes(agent.status));
        }
        if (filters.capabilities && filters.capabilities.length > 0) {
            agents = agents.filter(agent => filters.capabilities.some(cap => agent.capabilities.includes(cap)));
        }
        if (filters.domain) {
            agents = agents.filter(agent => agent.specialization.domain === filters.domain);
        }
        if (filters.tags) {
            agents = agents.filter(agent => filters.tags.some(tag => agent.tags?.includes(tag)));
        }
        // Convert to summaries and apply access control
        const summaries = [];
        for (const agent of agents) {
            if (requesterId) {
                const accessDecision = await this.policyEngine.checkAccess({
                    subjectId: requesterId,
                    subjectType: 'user',
                    resourceType: 'agent',
                    resourceId: agent.id,
                    operation: 'read',
                    requestedAccess: 'read'
                });
                if (!accessDecision.allowed) {
                    continue; // Skip agents user can't access
                }
            }
            const summary = {
                id: agent.id,
                type: agent.type,
                name: agent.name,
                status: agent.status,
                domain: agent.specialization.domain,
                capabilities: agent.capabilities
            };
            if (agent.deployment?.health && agent.deployment.health !== 'unknown') {
                summary.health = agent.deployment.health;
            }
            if (agent.deployment?.lastHeartbeat) {
                summary.lastActive = agent.deployment.lastHeartbeat;
            }
            if (agent.deployment?.performance.tasksCompleted !== undefined) {
                summary.tasksCompleted = agent.deployment.performance.tasksCompleted;
            }
            if (agent.deployment?.performance.successRate !== undefined) {
                summary.successRate = agent.deployment.performance.successRate;
            }
            summaries.push(summary);
        }
        return summaries;
    }
    /**
     * Update an agent with policy enforcement
     */
    async updateAgent(agentId, updateData, requesterId) {
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
        const updatedAgent = {
            ...agent,
            name: updateData.name || agent.name,
            description: updateData.description || agent.description,
            capabilities: updateData.capabilities || agent.capabilities,
            specialization: {
                ...agent.specialization,
                ...(updateData.specialization || {})
            },
            personality: {
                ...agent.personality,
                ...(updateData.personality || {})
            },
            mcpTools: updateData.mcpTools || agent.mcpTools,
            toolPermissions: updateData.toolPermissions || agent.toolPermissions,
            llmConfig: {
                ...agent.llmConfig,
                ...(updateData.llmConfig || {})
            },
            resourceLimits: updateData.resourceLimits || agent.resourceLimits,
            tags: updateData.tags !== undefined ? updateData.tags : (agent.tags || []),
            metadata: updateData.metadata !== undefined ? updateData.metadata : (agent.metadata || {}),
            updatedAt: Date.now().toString(),
            ...(requesterId && { lastModifiedBy: requesterId })
        };
        this.agents.set(agentId, updatedAgent);
        // Persist update to storage
        try {
            await this.storage.setAgent(agentId, updatedAgent);
        }
        catch (error) {
            console.warn('Failed to persist agent update to storage:', error instanceof Error ? error.message : 'Unknown error');
        }
        return updatedAgent;
    }
    /**
     * Start an agent with LLM initialization
     */
    async startAgent(agentId, requesterId) {
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
        const updatedAgent = {
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
            await this.storage.setAgent(agentId, updatedAgent);
        }
        catch (error) {
            console.warn('Failed to persist agent status change to storage:', error instanceof Error ? error.message : 'Unknown error');
        }
        return updatedAgent;
    }
    /**
     * Stop an agent
     */
    async stopAgent(agentId, requesterId) {
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
        const updatedAgent = {
            ...agent,
            status: 'inactive',
            updatedAt: Date.now().toString(),
            ...(requesterId && { lastModifiedBy: requesterId })
        };
        this.agents.set(agentId, updatedAgent);
        // Persist status change to storage
        try {
            await this.storage.setAgent(agentId, updatedAgent);
        }
        catch (error) {
            console.warn('Failed to persist agent stop to storage:', error instanceof Error ? error.message : 'Unknown error');
        }
        return updatedAgent;
    }
    /**
     * Execute a prompt through an agent's LLM
     */
    async executeAgentPrompt(agentId, request, requesterId) {
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
        // Generate system prompt - use persona-aware prompt if collaboration context provided
        let systemPrompt;
        if (request.systemPrompt) {
            // Use explicit system prompt override
            systemPrompt = request.systemPrompt;
        }
        else if (request.collaborationContext?.usePersonaPrompt && request.collaborationContext.scenarioName) {
            // Generate enhanced persona-aware system prompt for collaborations
            const collaborationContextStr = this.generateCollaborationContext(request.collaborationContext.scenarioName, request.collaborationContext.scenarioType, request.collaborationContext.agentRole);
            systemPrompt = this.generatePersonaSystemPrompt(agent, collaborationContextStr, request.collaborationContext.agentRole);
        }
        else {
            // Use agent's configured system prompt or fallback
            systemPrompt = agent.llmConfig.systemPrompt || `You are ${agent.name}. ${agent.description}`;
        }
        // Route to appropriate LLM provider based on agent configuration
        try {
            let response;
            let usage;
            if (agent.llmConfig.provider === 'openai') {
                if (!this.openaiClient) {
                    throw new Error('OpenAI client not available. Please configure OPENAI_API_KEY.');
                }
                // Prepare OpenAI chat request
                const openaiRequest = {
                    model: agent.llmConfig.model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: request.prompt
                        }
                    ],
                    temperature: request.temperature || agent.llmConfig.temperature || 0.7,
                    ...(agent.llmConfig.maxTokens && { max_tokens: agent.llmConfig.maxTokens }),
                    ...(agent.llmConfig.topP && { top_p: agent.llmConfig.topP }),
                    ...(agent.llmConfig.frequencyPenalty && { frequency_penalty: agent.llmConfig.frequencyPenalty }),
                    ...(agent.llmConfig.presencePenalty && { presence_penalty: agent.llmConfig.presencePenalty })
                };
                const openaiResponse = await this.openaiClient.chat(openaiRequest);
                response = openaiResponse.choices[0]?.message?.content || '';
                usage = {
                    promptTokens: openaiResponse.usage?.prompt_tokens || 0,
                    completionTokens: openaiResponse.usage?.completion_tokens || 0,
                    totalTokens: openaiResponse.usage?.total_tokens || 0
                };
            }
            else {
                // Default to Ollama for 'ollama' provider and fallback
                const chatRequest = {
                    model: agent.llmConfig.model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: request.prompt
                        }
                    ],
                    options: {
                        temperature: request.temperature || agent.llmConfig.temperature || 0.7,
                        ...(agent.llmConfig.topP && { top_p: agent.llmConfig.topP }),
                        ...(agent.llmConfig.maxTokens && { num_predict: agent.llmConfig.maxTokens })
                    }
                };
                const ollamaResponse = await this.ollamaClient.chat(chatRequest);
                response = ollamaResponse.message.content;
                usage = {
                    promptTokens: ollamaResponse.prompt_eval_count || 0,
                    completionTokens: ollamaResponse.eval_count || 0,
                    totalTokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
                };
            }
            return {
                response,
                usage,
                executionTime: Date.now() - startTime
            };
        }
        catch (error) {
            throw new Error(`LLM execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Generate a persona-aware system prompt that incorporates agent's personality,
     * specialization, and collaboration context
     */
    generatePersonaSystemPrompt(agent, collaborationContext, agentRole) {
        const personality = agent.personality;
        const specialization = agent.specialization;
        const agentTypeGuidance = this.getAgentTypePromptSuffix(agent.type);
        let prompt = `You are a ${agent.type} agent named "${agent.name}"`;
        if (collaborationContext) {
            prompt += ` ${collaborationContext}`;
        }
        prompt += `.\n\n`;
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
    generateBehaviorGuidelines(personality) {
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
        personality.traits.forEach((trait) => {
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
    getAgentTypePromptSuffix(agentType) {
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
    generateCollaborationContext(scenarioName, scenarioType, agentRole) {
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
    async deleteAgent(agentId, requesterId) {
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
        this.agents.delete(agentId);
        // Remove from storage
        try {
            await this.storage.deleteAgent(agentId);
        }
        catch (error) {
            console.warn('Failed to delete agent from storage:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    /**
     * Validate agent configuration
     */
    async validateAgentConfiguration(request) {
        const errors = [];
        const warnings = [];
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
    async initializeLLMForAgent(agent) {
        try {
            if (agent.llmConfig.provider === 'openai') {
                if (!this.openaiClient) {
                    throw new Error('OpenAI client not available. Please configure OPENAI_API_KEY.');
                }
                // Test OpenAI connectivity
                await this.openaiClient.listModels();
            }
            else {
                // Test Ollama connectivity (default)
                await this.ollamaClient.listModels();
            }
        }
        catch (error) {
            throw new Error(`Failed to initialize LLM for agent ${agent.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Initialize system agents
     */
    initializeSystemAgents() {
        // No automatic test agent creation - require real agents
        console.log('🚀 AgentService initialized. Use the API to create agents.');
        // This would be expanded to create default system agents if needed
        // For now, just ensuring the service is ready
    }
    /**
     * Load agents from persistent storage into memory cache
     */
    async loadAgentsFromStorage() {
        try {
            console.log('📥 Loading agents from storage...');
            const storedAgents = await this.storage.safeGetAllAgents();
            for (const [agentId, agent] of storedAgents) {
                this.agents.set(agentId, agent);
            }
            console.log(`✅ Loaded ${storedAgents.size} agents from storage`);
            // No automatic test agent creation - require real agents
            if (this.agents.size === 0) {
                console.warn('⚠️ No agents found in storage. Create agents via the API before attempting operations.');
            }
        }
        catch (error) {
            console.warn('Failed to load agents from storage, starting with empty state:', error instanceof Error ? error.message : 'Unknown error');
            // No fallback to test agents - require real agents to be created
            console.warn('⚠️ Storage failed and no agents exist. Create agents via the API before attempting operations.');
        }
    }
    /**
     * Generate a unique agent ID
     */
    generateAgentId() {
        return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.AgentService = AgentService;
