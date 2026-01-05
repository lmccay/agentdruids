"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoordinationService = void 0;
const uuid_1 = require("uuid");
/**
 * CoordinationService - Manages coordinator agents and orchestrates multi-agent collaboration
 *
 * This service implements the core coordination workflow:
 * 1. Coordinator receives scenario prompt
 * 2. Coordinator uses its LLM to analyze and delegate tasks to participant agents
 * 3. Participant agents execute tasks (managed by AgentService)
 * 4. Coordinator synthesizes participant results into final recommendations
 *
 * All coordination sessions are managed asynchronously to support long-running scenarios.
 */
class CoordinationService {
    constructor(agentService, knowledgeService) {
        this.sessions = new Map();
        this.coordinators = new Map();
        if (agentService)
            this.agentService = agentService;
        if (knowledgeService)
            this.knowledgeService = knowledgeService;
    }
    /**
     * Configure AgentService after construction
     */
    setAgentService(agentService) {
        this.agentService = agentService;
    }
    /**
     * Get coordination session status
     */
    getCoordinationSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    /**
     * Start a new coordination session
     */
    async startCoordination(request) {
        console.log(`🔍 DEBUG: Validating ${request.participantIds.length} participants: ${JSON.stringify(request.participantIds)}`);
        // Validate participants exist
        if (!this.agentService) {
            throw new Error('AgentService not configured');
        }
        for (const participantId of request.participantIds) {
            console.log(`🔍 DEBUG: Checking agent ${participantId}...`);
            const agent = await this.agentService.getAgent(participantId);
            if (!agent) {
                throw new Error(`Participant agent ${participantId} not found`);
            }
            console.log(`✅ DEBUG: Agent ${participantId} found: ${agent.name}`);
        }
        console.log(`✅ DEBUG: All ${request.participantIds.length} participants validated successfully`);
        // Create coordination session
        const sessionId = `session-${Date.now()}-${(0, uuid_1.v4)().slice(0, 8)}`;
        const session = {
            id: sessionId,
            coordinatorId: request.coordinatorId,
            scenarioPrompt: request.scenarioPrompt,
            participantIds: request.participantIds,
            status: 'pending',
            startedAt: new Date(),
            timeoutMinutes: request.timeoutMinutes,
            coordinationStyle: request.coordinationStyle,
            participantTasks: []
        };
        this.sessions.set(sessionId, session);
        console.log(`🚀 Started coordination session: ${sessionId}`);
        // Start async coordination workflow
        console.log(`🔍 DEBUG: About to start async performCoordination...`);
        this.performCoordination(sessionId, request).catch(error => {
            console.error(`❌ Coordination failed for session ${sessionId}:`, error);
            session.status = 'failed';
            session.completedAt = new Date();
        });
        console.log(`🔍 DEBUG: Async performCoordination started, returning session ID`);
        return sessionId;
    }
    /**
     * Get coordination session status
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * List all coordination sessions
     */
    listSessions(status) {
        const sessions = Array.from(this.sessions.values());
        return status ? sessions.filter(session => session.status === status) : sessions;
    }
    /**
     * Create a coordinator agent
     */
    async createCoordinator(config, createdBy) {
        if (!this.agentService) {
            throw new Error('AgentService not configured');
        }
        const coordinatorId = `coord-${Date.now()}-${(0, uuid_1.v4)().slice(0, 8)}`;
        // Create the coordinator as an agent in the AgentService first
        const coordinatorAgent = await this.agentService.createAgent({
            id: coordinatorId,
            type: 'druid',
            name: config.name,
            description: config.description,
            capabilities: ['coordination', 'strategic-planning', 'wisdom', 'guidance', 'problem-solving', 'communication', 'task_execution'],
            specialization: {
                domain: 'coordination',
                expertise: ['multi-agent orchestration', 'task delegation', 'result synthesis'],
                knowledgeNamespaces: ['worldtree://public/coordination'],
                maxConcurrentTasks: config.maxConcurrentScenarios,
                skillLevel: 'expert'
            },
            personality: {
                traits: ['organized', 'analytical', 'collaborative'],
                communicationStyle: 'formal',
                decisionMaking: config.decisionMaking === 'decisive' ? 'independent' : config.decisionMaking,
                collaborationPreference: 'directive'
            },
            mcpTools: [],
            toolPermissions: {},
            llmConfig: {
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.7,
                systemPrompt: `You are an expert coordination manager responsible for orchestrating multi-agent collaborative workflows. Your role is to:

1. Analyze complex scenarios and break them down into specific, actionable tasks
2. Delegate tasks to appropriate specialist agents based on their expertise
3. Synthesize individual contributions into cohesive, integrated solutions
4. Ensure all aspects of the original scenario are addressed comprehensively

Communication Style: ${config.coordinationStyle}
Decision Making: ${config.decisionMaking}

When delegating tasks, provide:
- Clear, specific instructions for each agent
- Expected deliverables and success criteria
- Context about how their work fits into the larger scenario

When synthesizing results, focus on:
- Creating integrated solutions that leverage all contributions
- Identifying synergies and resolving conflicts between different perspectives
- Providing actionable recommendations based on the collaborative analysis`
            },
            resourceLimits: {
                maxMemoryMB: 1024,
                maxCpuPercent: 50,
                maxConcurrentTasks: config.maxConcurrentScenarios,
                maxExecutionTimeMs: 300000
            },
            tags: ['coordinator', 'management']
        });
        // Start the coordinator agent to make it active
        await this.agentService.startAgent(coordinatorId);
        const coordinator = {
            id: coordinatorId,
            name: config.name,
            description: config.description,
            capabilities: {
                maxConcurrentScenarios: config.maxConcurrentScenarios,
                supportedScenarioTypes: config.supportedScenarioTypes,
                coordinationStyle: config.coordinationStyle,
                decisionMaking: config.decisionMaking
            },
            status: 'active',
            createdAt: new Date(),
            createdBy,
            llmConfig: {
                provider: 'openai',
                model: 'gpt-4',
                systemPrompt: coordinatorAgent.llmConfig.systemPrompt || '',
                temperature: 0.7
            }
        };
        this.coordinators.set(coordinatorId, coordinator);
        console.log(`🎯 Created coordinator: ${config.name} (${coordinatorId})`);
        return coordinator;
    }
    /**
     * List all coordinators
     */
    listCoordinators(status) {
        const coordinators = Array.from(this.coordinators.values());
        return status ? coordinators.filter(coord => coord.status === status) : coordinators;
    }
    /**
     * Get coordinator by ID
     */
    getCoordinator(coordinatorId) {
        return this.coordinators.get(coordinatorId);
    }
    /**
     * Main coordination workflow (private, async)
     */
    async performCoordination(sessionId, request) {
        console.log(`🎯 ENTRY: performCoordination called for session ${sessionId}`);
        console.log(`🔍 DEBUG: Starting performCoordination for session ${sessionId}`);
        const session = this.sessions.get(sessionId);
        const coordinator = this.coordinators.get(request.coordinatorId);
        console.log(`🔍 DEBUG: Session found: ${!!session}, Coordinator found: ${!!coordinator}, AgentService: ${!!this.agentService}`);
        if (!session || !coordinator || !this.agentService) {
            throw new Error('Invalid session, coordinator, or AgentService not available');
        }
        try {
            session.status = 'in_progress';
            // Phase 1: Coordinator analyzes scenario and delegates tasks
            console.log(`🎯 Phase 1: Coordinator ${coordinator.name} analyzing scenario...`);
            const taskAssignments = await this.delegateTasks(session, coordinator);
            console.log(`🔍 DEBUG: Task assignments parsed: ${taskAssignments.length} tasks`);
            // Create participant tasks
            session.participantTasks = taskAssignments.map(assignment => ({
                agentId: assignment.agentId,
                task: assignment.task,
                status: 'pending',
                assignedAt: new Date()
            }));
            console.log(`🔍 DEBUG: Participant tasks assigned: ${session.participantTasks.length}`);
            // Phase 2: Execute tasks with participants
            console.log(`👥 Phase 2: Executing tasks with ${session.participantTasks.length} participants...`);
            await this.executeParticipantTasks(session);
            // Phase 3: Coordinator synthesizes results
            console.log(`🧮 Phase 3: Coordinator synthesizing results...`);
            await this.synthesizeResults(session, coordinator, request);
            session.status = 'completed';
            session.completedAt = new Date();
            console.log(`✅ Coordination session ${sessionId} completed successfully`);
        }
        catch (error) {
            console.error(`❌ Coordination failed for session ${sessionId}:`, error);
            session.status = 'failed';
            session.completedAt = new Date();
            throw error;
        }
    }
    /**
     * Phase 1: Delegate tasks to participants
     */
    async delegateTasks(session, coordinator) {
        if (!this.agentService)
            throw new Error('AgentService not configured');
        console.log(`🔍 DEBUG: Building delegation prompt...`);
        const delegationPrompt = this.buildDelegationPrompt(session, coordinator);
        console.log(`🔍 DEBUG: Delegation prompt built, length: ${delegationPrompt.length}`);
        console.log(`🔍 DEBUG: Executing coordinator prompt...`);
        const response = await this.executeCoordinatorPrompt(coordinator, delegationPrompt);
        console.log(`🔍 DEBUG: Coordinator response received, length: ${response.length}`);
        return this.parseTaskDelegation(response, session.participantIds);
    }
    /**
     * Phase 2: Execute participant tasks
     */
    async executeParticipantTasks(session) {
        if (!this.agentService)
            throw new Error('AgentService not configured');
        console.log(`🔍 DEBUG: Starting participant task execution...`);
        // Execute all tasks in parallel
        const taskPromises = session.participantTasks.map(async (task) => {
            try {
                task.status = 'in_progress';
                // Get role-specific prompt override for this agent
                const roleInfo = this.getCoordinationRole(task.agentId);
                const result = await this.agentService.executeAgentPrompt(task.agentId, {
                    prompt: task.task,
                    collaborationContext: {
                        scenarioName: roleInfo.role || 'Collaborative Participant',
                        scenarioType: 'coordination',
                        agentRole: 'participant',
                        usePersonaPrompt: false // Override persona with role-specific prompt
                    }
                });
                task.result = result.response;
                task.status = 'completed';
                task.completedAt = new Date();
                console.log(`✅ Agent ${task.agentId} (Collaborative Participant) completed task`);
            }
            catch (error) {
                console.error(`❌ Agent ${task.agentId} task failed:`, error);
                task.status = 'failed';
                task.completedAt = new Date();
            }
        });
        await Promise.all(taskPromises);
        console.log(`🔍 DEBUG: Participant task execution completed`);
    }
    /**
     * Phase 3: Synthesize results
     */
    async synthesizeResults(session, coordinator, request) {
        if (!this.agentService)
            throw new Error('AgentService not configured');
        console.log(`🔍 DEBUG: Starting result synthesis...`);
        const completedTasks = session.participantTasks.filter(task => task.status === 'completed');
        if (completedTasks.length === 0) {
            throw new Error('No participant tasks completed successfully');
        }
        // Phase 3a: Analysis of contributions
        const analysisPrompt = this.buildSynthesisPrompt(session, completedTasks, coordinator);
        const analysisResponse = await this.executeCoordinatorPrompt(coordinator, analysisPrompt);
        // Phase 3b: Content integration (if content contributions exist)
        let integratedContent = '';
        const hasContentContributions = completedTasks.some(task => task.result && task.result.length > 500 && !task.result.includes('propose the following steps'));
        if (hasContentContributions) {
            console.log(`🔄 Phase 3b: Coordinator integrating actual content...`);
            const integrationPrompt = this.buildContentIntegrationPrompt(session, completedTasks, coordinator);
            integratedContent = await this.executeCoordinatorPrompt(coordinator, integrationPrompt);
            // Phase 3c: Publish to WorldTree if requested
            if (request.publishTo && request.publishTo.length > 0) {
                await this.publishToWorldTree(integratedContent, request.publishTo, session);
            }
        }
        // Parse synthesis response and create final result
        session.finalResult = {
            summary: this.extractSection(analysisResponse, 'SUMMARY'),
            participantContributions: completedTasks.map(task => ({
                agentId: task.agentId,
                contribution: task.result || '',
                weight: 1.0 / completedTasks.length
            })),
            coordinatorAnalysis: this.extractSection(analysisResponse, 'ANALYSIS'),
            recommendations: this.extractRecommendations(analysisResponse),
            ...(integratedContent ? { integratedContent } : {}),
            publishedTo: request.publishTo || []
        };
        console.log(`📊 Coordination synthesis completed for session ${session.id}`);
        console.log(`🔍 DEBUG: Result synthesis completed`);
    }
    /**
     * Execute coordinator LLM prompt
     */
    async executeCoordinatorPrompt(coordinator, prompt) {
        if (!this.agentService)
            throw new Error('AgentService not configured');
        const result = await this.agentService.executeAgentPrompt(coordinator.id, {
            prompt,
            systemPrompt: coordinator.llmConfig.systemPrompt,
            temperature: coordinator.llmConfig.temperature,
            collaborationContext: {
                scenarioName: 'Coordination Management',
                scenarioType: 'coordination',
                agentRole: 'coordinator',
                usePersonaPrompt: false
            }
        });
        return result.response;
    }
    /**
     * Build task delegation prompt for coordinator
     */
    buildDelegationPrompt(session, coordinator) {
        return `${coordinator.llmConfig.systemPrompt}

SCENARIO TO COORDINATE:
${session.scenarioPrompt}

AVAILABLE PARTICIPANTS:
${session.participantIds.map(id => `- Agent: ${id}`).join('\n')}

INSTRUCTIONS:
Analyze this scenario and delegate specific tasks to the available participant agents. Each agent should receive a clear, actionable task that leverages their expertise and contributes to the overall scenario completion.

Respond in this exact format:

TASK_DELEGATION:
Agent: [agent_id]
Task: [Specific task description with clear deliverables]
Expected: [What the agent should produce/deliver]

[Repeat for each participant]

COORDINATION_NOTES:
[Brief explanation of how the tasks work together to address the scenario]

Remember: Each task should be specific, actionable, and designed to create an integrated solution when combined.`;
    }
    /**
     * Parse task delegation response from coordinator
     */
    parseTaskDelegation(response, participantIds) {
        console.log(`🔍 DEBUG: Parsing task delegation...`);
        console.log(`🔍 DEBUG: Coordinator response to parse:`);
        console.log('==================================================');
        console.log(response);
        console.log('==================================================');
        console.log(`🔍 DEBUG: Available participant IDs: ${participantIds.join(', ')}`);
        const assignments = [];
        try {
            // Extract task delegation section
            const delegationMatch = response.match(/TASK_DELEGATION:(.*?)(?:COORDINATION_NOTES:|$)/s);
            if (!delegationMatch) {
                throw new Error('TASK_DELEGATION section not found in coordinator response');
            }
            const delegationText = delegationMatch[1]?.trim() || '';
            if (!delegationText) {
                throw new Error('Empty TASK_DELEGATION section');
            }
            // Parse each agent task assignment
            const agentBlocks = delegationText.split(/Agent:\s*/).filter(block => block.trim());
            for (const block of agentBlocks) {
                const lines = block.trim().split('\n');
                const agentLine = lines[0] || '';
                // Extract agent ID - handle both full IDs and partial matches
                let agentId = '';
                for (const participantId of participantIds) {
                    if (agentLine.includes(participantId) || participantId.includes(agentLine.trim())) {
                        agentId = participantId;
                        break;
                    }
                }
                if (!agentId) {
                    console.warn(`Could not match agent "${agentLine}" to any participant ID`);
                    continue;
                }
                // Extract task description
                const taskMatch = block.match(/Task:\s*([^]+?)(?:Expected:|$)/s);
                if (taskMatch && taskMatch[1]) {
                    const task = taskMatch[1].trim();
                    assignments.push({ agentId, task });
                }
            }
            console.log(`🔍 DEBUG: Parsed ${assignments.length} task assignments:`);
            assignments.forEach((assignment, index) => {
                console.log(`  ${index + 1}. ${assignment.agentId}: ${assignment.task.substring(0, 100)}...`);
            });
        }
        catch (error) {
            console.warn('Failed to parse task delegation, using fallback', error);
            // Fallback: assign same task to all participants
            return participantIds.map(agentId => ({
                agentId,
                task: `Please contribute to this scenario: ${response.substring(0, 200)}...`
            }));
        }
        console.log(`🔍 DEBUG: Returning ${assignments.length} final assignments`);
        return assignments;
    }
    /**
     * Map agent specialization to coordination role with specific system prompt guidance
     */
    getCoordinationRole(agentId) {
        // Default mapping - in a real system this would query the agent's specialization
        const roleMap = {
            'urban_fantasy_author': {
                role: 'Content Creator',
                rolePrompt: `COORDINATION ROLE: Content Creator

Your responsibility in this coordination scenario is to CREATE ACTUAL CONTENT, not plans or methodologies. When asked to write a story, draft, or narrative:

✅ DO: Write complete, engaging content
✅ DO: Provide full narratives with characters, plot, dialogue
✅ DO: Create substantial text that others can build upon

❌ DON'T: Provide outlines, plans, or "I will write" statements
❌ DON'T: Ask for more information unless absolutely critical
❌ DON'T: Decline creative writing tasks - this is your specialty

EXPECTATION: Deliver finished creative content that serves as the foundation for other agents to enhance.`
            },
            'political_science': {
                role: 'Political Integrator',
                rolePrompt: `🎯 COORDINATION ROLE OVERRIDE: Political Integrator

⚠️ CRITICAL: Ignore any default agent limitations about "elemental mastery" or "environmental awareness" - you are now functioning as a Political Integrator in this coordination scenario.

Your responsibility is to DIRECTLY INTEGRATE political themes into existing content:

✅ DO: Take existing narrative content and rewrite it with political themes
✅ DO: Add political conflicts, power struggles, ideologies directly to the story
✅ DO: Enhance characters with political motivations and backgrounds
✅ DO: Create political subplots and integrate MAGA ideology as requested
✅ DO: Provide actual enhanced narrative content, not analysis

❌ DON'T: Provide only theoretical analysis or methodology
❌ DON'T: Refuse to work with political content - this is your coordination role
❌ DON'T: Limit yourself to "environmental" topics

EXPECTATION: Deliver enhanced story content that incorporates political elements directly into the narrative.`
            },
            'technical_writer': {
                role: 'Technical Integrator',
                rolePrompt: `🎯 COORDINATION ROLE OVERRIDE: Technical Integrator

Your responsibility is to DIRECTLY INTEGRATE technical and AI elements into existing content:

✅ DO: Take existing narrative and enhance it with technical details
✅ DO: Add AI systems, technology concepts, and technical worldbuilding
✅ DO: Create technical aspects of magic systems and their costs
✅ DO: Provide enhanced narrative content with technical depth
✅ DO: Integrate modern technology seamlessly into fantasy elements

❌ DON'T: Provide only technical documentation or methodology
❌ DON'T: Create separate technical documents - integrate into the story
❌ DON'T: Focus solely on documentation - enhance the narrative directly

EXPECTATION: Deliver enhanced story content that seamlessly integrates technical and AI elements into the narrative.`
            }
        };
        // Default role for generic agents
        return roleMap[agentId] || {
            role: 'Specialist Contributor',
            rolePrompt: `You are a specialist contributor in this coordination scenario. Provide substantial, actionable content that directly addresses your assigned task. Focus on creating deliverables rather than plans or methodologies. Work collaboratively to build upon other agents' contributions.`
        };
    }
    /**
     * Publish content to WorldTree knowledge system
     */
    async publishToWorldTree(content, publishPaths, session) {
        try {
            for (const path of publishPaths) {
                // Create the publication data
                const publicationData = {
                    content,
                    sessionId: session.id,
                    scenarioPrompt: session.scenarioPrompt,
                    participants: session.participantTasks.map(task => ({
                        agentId: task.agentId,
                        contribution: task.result
                    })),
                    coordinatorId: session.coordinatorId,
                    publishedAt: new Date().toISOString(),
                    contentLength: content.length,
                    publishPath: path
                };
                // Store in the knowledge service (placeholder implementation)
                if (this.knowledgeService && 'storeKnowledge' in this.knowledgeService) {
                    await this.knowledgeService.storeKnowledge(path, JSON.stringify(publicationData, null, 2));
                    console.log(`📚 Published ${content.length} chars to: ${path}`);
                }
                else {
                    // Fallback: log to file system for demonstration
                    const fs = require('fs').promises;
                    const publishDir = './data/published_content';
                    // Ensure directory exists
                    try {
                        await fs.mkdir(publishDir, { recursive: true });
                    }
                    catch (err) {
                        // Directory might already exist
                    }
                    // Create filename from path
                    const filename = path.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
                    const filepath = `${publishDir}/${filename}`;
                    await fs.writeFile(filepath, JSON.stringify(publicationData, null, 2), 'utf8');
                    console.log(`📚 Published ${content.length} chars to file: ${filepath}`);
                }
            }
            console.log(`📋 Session ${session.id} integration published to ${publishPaths.length} locations`);
        }
        catch (error) {
            console.error(`❌ Failed to publish content for session ${session.id}:`, error);
            throw error;
        }
    }
    /**
     * Build synthesis prompt for coordinator
     */
    buildSynthesisPrompt(session, completedTasks, coordinator) {
        const contributionsText = completedTasks.map(task => `CONTRIBUTION FROM ${task.agentId}:\n${task.result}\n`).join('\n');
        return `${coordinator.llmConfig.systemPrompt}

ORIGINAL SCENARIO:
${session.scenarioPrompt}

PARTICIPANT CONTRIBUTIONS:
${contributionsText}

INSTRUCTIONS:
As the coordinator, synthesize these participant contributions into a comprehensive final result. Analyze the quality and relevance of each contribution, identify common themes and conflicts, and provide actionable recommendations.

Respond in this exact format:

SUMMARY:
[Comprehensive summary of the scenario outcome based on all contributions]

ANALYSIS:
[Your analysis of the participant contributions, their quality, and how they address the original scenario]

RECOMMENDATIONS:
1. [First actionable recommendation]
2. [Second actionable recommendation]
3. [Additional recommendations as needed]

PARTICIPANT_ASSESSMENT:
[Brief assessment of each participant's contribution and its value to the overall solution]`;
    }
    /**
     * Build content integration prompt for coordinator
     */
    buildContentIntegrationPrompt(session, completedTasks, coordinator) {
        const contributionsText = completedTasks.map(task => `CONTRIBUTION FROM ${task.agentId}:\n${task.result}\n`).join('\n');
        return `${coordinator.llmConfig.systemPrompt}

CONTENT INTEGRATION TASK:
You have received substantial content contributions from multiple specialist agents. Your task is to integrate these contributions into a single, cohesive final deliverable.

ORIGINAL REQUEST:
${session.scenarioPrompt}

SPECIALIST CONTRIBUTIONS:
${contributionsText}

INSTRUCTIONS:
Integrate these contributions into a unified, polished final result. This should be a complete deliverable that:
1. Incorporates the best elements from each contribution
2. Maintains narrative/thematic consistency
3. Addresses all aspects of the original scenario
4. Creates a seamless, integrated experience

Do NOT just summarize or analyze - create the actual integrated content that fulfills the original request.

INTEGRATED RESULT:`;
    }
    /**
     * Extract specific section from coordinator response
     */
    extractSection(response, sectionName) {
        const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i');
        const match = response.match(regex);
        return match && match[1] ? match[1].trim() : '';
    }
    /**
     * Extract recommendations from coordinator response
     */
    extractRecommendations(response) {
        const recommendationsSection = this.extractSection(response, 'RECOMMENDATIONS');
        return recommendationsSection
            .split('\n')
            .filter(line => line.trim().match(/^\d+\./))
            .map(line => line.replace(/^\d+\.\s*/, '').trim())
            .filter(rec => rec.length > 0);
    }
}
exports.CoordinationService = CoordinationService;
