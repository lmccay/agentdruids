"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleMCPServer = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const uuid_1 = require("uuid");
const AgentService_1 = require("../services/AgentService");
const RealmService_1 = require("../services/RealmService");
// import { KnowledgeService } from '../services/KnowledgeService'; // TODO: implement knowledge service integration
const ScenarioService_1 = require("../services/ScenarioService");
const AsyncResultManager_1 = require("../services/AsyncResultManager");
const CoordinationService_1 = require("../services/CoordinationService");
class SimpleMCPServer {
    // private _teamParsingService: TeamParsingService; // TODO: implement team parsing service
    constructor(port = 3003) {
        this.sessions = new Map();
        this.app = (0, express_1.default)();
        this.port = port;
        this._agentService = new AgentService_1.AgentService();
        this._realmService = new RealmService_1.RealmService();
        // this._knowledgeService = new KnowledgeService(); // TODO: implement knowledge service integration
        this._scenarioService = new ScenarioService_1.ScenarioService(this._agentService);
        this._asyncResultManager = new AsyncResultManager_1.AsyncResultManager();
        this._coordinationService = new CoordinationService_1.CoordinationService();
        // this._teamParsingService = new TeamParsingService(); // TODO: implement team parsing service
        // Wire up dependencies
        this._coordinationService.setAgentService(this._agentService);
        this.setupMiddleware();
        this.setupRoutes();
    }
    setupMiddleware() {
        // CORS configuration for MCP compliance - more permissive for testing
        this.app.use((0, cors_1.default)({
            origin: '*', // Allow all origins for now
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Accept', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Origin']
        }));
        // Custom JSON parser that handles mixed content types like "application/json, text/event-stream"
        this.app.use(express_1.default.json({
            limit: '10mb',
            type: (req) => {
                const contentType = req.get('Content-Type') || req.headers['content-type'] || '';
                return contentType.includes('application/json');
            }
        }));
        this.app.use(express_1.default.text());
        // Security headers for DNS rebinding protection - more permissive
        this.app.use((req, res, next) => {
            console.log(`📥 Request: ${req.method} ${req.path}`);
            const host = req.get('host');
            console.log(`📡 Host: ${host}`);
            if (host && !host.match(/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/)) {
                console.log(`❌ Invalid host: ${host}`);
                return res.status(403).json({ error: 'Invalid host header' });
            }
            return next();
        });
    }
    setupRoutes() {
        // Health check endpoint (non-MCP)
        this.app.get('/health', (_req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });
        // Root redirect 
        this.app.get('/', (_req, res) => {
            res.json({
                message: 'MCP Server',
                protocol: 'Model Context Protocol v2025-06-18',
                endpoint: '/mcp'
            });
        });
        // Main MCP endpoint - FULLY COMPLIANT
        this.app.post('/mcp', this.handleMCPRequest.bind(this));
    }
    async handleMCPRequest(req, res) {
        try {
            console.log('🔍 MCP Request Details:');
            console.log(`   Method: ${req.method}`);
            console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
            console.log(`   Content-Type: ${req.get('Content-Type')}`);
            console.log(`   Accept: ${req.get('Accept')}`);
            console.log(`   Body:`, JSON.stringify(req.body, null, 2));
            // Check for SSE request (text/event-stream) - only if client explicitly accepts SSE
            const acceptHeader = req.get('Accept') || '';
            const contentType = req.get('Content-Type') || '';
            // Only use SSE if the Accept header specifically requests it
            const isSSERequest = acceptHeader.includes('text/event-stream');
            console.log(`   Is SSE Request: ${isSSERequest} (Accept: ${acceptHeader})`);
            // More flexible Content-Type validation for MCP clients
            if (!req.is('application/json') && !contentType.includes('application/json')) {
                console.log('❌ Invalid Content-Type');
                return this.sendError(res, -32600, 'Invalid Content-Type. Must be application/json', null);
            }
            // More flexible MCP header validation
            const protocolVersion = req.get('MCP-Protocol-Version');
            if (!protocolVersion) {
                console.log('⚠️ Missing MCP-Protocol-Version header, allowing anyway');
            }
            else if (protocolVersion !== '2025-06-18') {
                console.log(`⚠️ Protocol version mismatch: ${protocolVersion}, allowing anyway`);
            }
            // Parse JSON-RPC request
            let message;
            try {
                message = req.body;
                console.log(`   Parsed Message:`, JSON.stringify(message, null, 2));
                if (!message || message.jsonrpc !== '2.0' || !message.method) {
                    console.log('❌ Invalid JSON-RPC 2.0 request structure');
                    return this.sendError(res, -32600, 'Invalid JSON-RPC 2.0 request', message?.id || null);
                }
            }
            catch (error) {
                console.log('❌ JSON parse error:', error);
                return this.sendError(res, -32700, 'Parse error', null);
            }
            // Handle session management
            let sessionId = req.get('mcp-session-id') || req.get('Mcp-Session-Id');
            console.log(`   Session ID: ${sessionId || 'none'}`);
            if (!sessionId && message.method !== 'initialize') {
                console.log('❌ Session not initialized');
                return this.sendError(res, -32001, 'Session not initialized. Call initialize first.', message.id || null);
            }
            if (message.method === 'initialize') {
                sessionId = this.createSession(message.params?.clientInfo);
                res.set('Mcp-Session-Id', sessionId);
                console.log(`✅ Created new session: ${sessionId}`);
            }
            else if (sessionId) {
                const session = this.sessions.get(sessionId);
                if (!session) {
                    console.log('❌ Invalid session ID');
                    return this.sendError(res, -32001, 'Invalid session ID', message.id || null);
                }
                session.lastActivity = new Date();
            }
            // Handle SSE vs regular JSON response
            if (isSSERequest) {
                console.log('🌊 Handling as SSE request');
                return this.handleSSEResponse(req, res, message, sessionId);
            }
            else {
                console.log('📄 Handling as JSON request');
                // Route to method handlers
                const result = await this.handleMethod(message, sessionId);
                this.sendSuccess(res, result, message.id || null);
            }
        }
        catch (error) {
            console.error('MCP Request Error:', error);
            this.sendError(res, -32603, 'Internal error', null);
        }
    }
    async handleSSEResponse(_req, res, message, sessionId) {
        try {
            console.log('🌊 Setting up SSE response');
            // Set SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control',
            });
            // Process the request
            const result = await this.handleMethod(message, sessionId);
            // Add debug logging for tool calls
            if (message.method === 'tools/call') {
                console.log('🔧 Tool call result:', JSON.stringify(result, null, 2));
            }
            // Send JSON-RPC response as SSE event
            const response = {
                jsonrpc: '2.0',
                result,
                id: message.id || null
            };
            console.log('📤 Sending SSE response:', JSON.stringify(response, null, 2));
            // Validate JSON serializability before sending
            try {
                const serializedResponse = JSON.stringify(response);
                res.write(`data: ${serializedResponse}\n\n`);
            }
            catch (serializationError) {
                console.error('❌ JSON Serialization Error:', serializationError);
                console.error('❌ Failed to serialize object:', response);
                // Send a safe error response
                const safeErrorResponse = {
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Serialization error in response',
                        data: { originalError: String(serializationError) }
                    },
                    id: message.id || null
                };
                res.write(`data: ${JSON.stringify(safeErrorResponse)}\n\n`);
            }
            res.end();
            console.log('✅ SSE response sent');
        }
        catch (error) {
            console.error('❌ SSE response error:', error);
            const errorResponse = {
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal error' },
                id: message.id || null
            };
            res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
            res.end();
        }
    }
    createSession(clientInfo) {
        const sessionId = (0, uuid_1.v4)();
        const session = {
            id: sessionId,
            clientInfo,
            initialized: true,
            createdAt: new Date(),
            lastActivity: new Date()
        };
        this.sessions.set(sessionId, session);
        // Clean up old sessions periodically
        this.cleanupSessions();
        return sessionId;
    }
    cleanupSessions() {
        const now = new Date();
        const maxAge = 60 * 60 * 1000; // 1 hour
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now.getTime() - session.lastActivity.getTime() > maxAge) {
                this.sessions.delete(sessionId);
            }
        }
    }
    async handleMethod(message, _sessionId) {
        switch (message.method) {
            case 'initialize':
                return {
                    protocolVersion: '2025-06-18',
                    capabilities: {
                        tools: { listChanged: false },
                        resources: { subscribe: false, listChanged: false }
                    },
                    serverInfo: {
                        name: 'druids-mcp-server',
                        version: '1.0.0'
                    }
                };
            case 'tools/list':
                return {
                    tools: [
                        {
                            name: 'agent_create',
                            description: 'Create a new agent in the Druids system',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: 'Agent name' },
                                    type: {
                                        type: 'string',
                                        enum: ['druid', 'elemental', 'gaia', 'worldtree'],
                                        description: 'Agent type (druid, elemental, gaia, worldtree)'
                                    },
                                    description: { type: 'string', description: 'Agent description (optional)' },
                                    domain: {
                                        type: 'string',
                                        description: 'Specialization domain (e.g., forest, water, earth, air)'
                                    },
                                    realm: {
                                        type: 'string',
                                        description: 'Realm ID or name to assign the agent to (optional)'
                                    }
                                },
                                required: ['name', 'type']
                            }
                        },
                        {
                            name: 'agent_list',
                            description: 'List all agents in the system',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    type: {
                                        type: 'string',
                                        enum: ['druid', 'elemental', 'gaia', 'worldtree'],
                                        description: 'Filter by agent type (optional)'
                                    },
                                    status: {
                                        type: 'string',
                                        enum: ['inactive', 'deployed', 'active', 'paused', 'error'],
                                        description: 'Filter by agent status (optional)'
                                    },
                                    realm: {
                                        type: 'string',
                                        description: 'Filter by realm ID or name (optional)'
                                    }
                                },
                                additionalProperties: false
                            }
                        },
                        {
                            name: 'realm_create',
                            description: 'Create a new realm in the Druids system',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: 'Realm name' },
                                    type: {
                                        type: 'string',
                                        enum: ['forest', 'mountain', 'ocean', 'desert', 'sky', 'underground'],
                                        description: 'Realm type/environment'
                                    },
                                    description: { type: 'string', description: 'Realm description (optional)' },
                                    capacity: {
                                        type: 'number',
                                        minimum: 1,
                                        maximum: 100,
                                        description: 'Maximum number of agents (default: 10)'
                                    }
                                },
                                required: ['name', 'type']
                            }
                        },
                        {
                            name: 'realm_list',
                            description: 'List all realms in the system',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    type: {
                                        type: 'string',
                                        enum: ['forest', 'mountain', 'ocean', 'desert', 'sky', 'underground'],
                                        description: 'Filter by realm type (optional)'
                                    },
                                    status: {
                                        type: 'string',
                                        enum: ['active', 'inactive', 'suspended', 'maintenance'],
                                        description: 'Filter by realm status (optional)'
                                    }
                                },
                                additionalProperties: false
                            }
                        },
                        {
                            name: 'scenario_create',
                            description: 'Create a new scenario for agent coordination',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: 'Scenario name' },
                                    objective: { type: 'string', description: 'Main objective of the scenario' },
                                    agents: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'List of agent types or names to include'
                                    },
                                    description: { type: 'string', description: 'Scenario description (optional)' }
                                },
                                required: ['name', 'objective', 'agents']
                            }
                        },
                        {
                            name: 'agent_reassign',
                            description: 'Reassign an existing agent to a different realm',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    agentId: { type: 'string', description: 'ID of the agent to reassign' },
                                    realm: { type: 'string', description: 'Realm ID or name to assign the agent to' }
                                },
                                required: ['agentId', 'realm']
                            }
                        },
                        {
                            name: 'scenario_list',
                            description: 'List all scenarios in the system',
                            inputSchema: {
                                type: 'object',
                                properties: {},
                                additionalProperties: false
                            }
                        },
                        {
                            name: 'scenario_status',
                            description: 'Get detailed status of a specific scenario',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    scenarioId: { type: 'string', description: 'ID of the scenario to check' }
                                },
                                required: ['scenarioId']
                            }
                        },
                        {
                            name: 'scenario_execute',
                            description: 'Execute a scenario with its assigned agents',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    scenarioId: { type: 'string', description: 'ID of the scenario to execute' },
                                    parameters: { type: 'object', description: 'Optional execution parameters' }
                                },
                                required: ['scenarioId']
                            }
                        },
                        {
                            name: 'execution_status',
                            description: 'Get the status of a running scenario execution',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    executionId: { type: 'string', description: 'ID of the execution to check' }
                                },
                                required: ['executionId']
                            }
                        },
                        {
                            name: 'agent_execute',
                            description: 'Execute a task or prompt with a specific agent using its bound LLM',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    agentId: { type: 'string', description: 'ID of the agent to execute with' },
                                    prompt: { type: 'string', description: 'The task or prompt to execute' },
                                    systemPrompt: { type: 'string', description: 'Optional system prompt override' },
                                    temperature: { type: 'number', minimum: 0, maximum: 2, description: 'Temperature for generation (0.0-2.0)' }
                                },
                                required: ['agentId', 'prompt']
                            }
                        },
                        {
                            name: 'agent_start',
                            description: 'Start/activate an agent to make it ready for execution',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    agentId: { type: 'string', description: 'ID of the agent to start' }
                                },
                                required: ['agentId']
                            }
                        },
                        // Natural Language Interface Tools for Desktop Agents
                        {
                            name: 'create_collaboration',
                            description: 'Create and start a collaboration between multiple agents to work on a task. This tool handles everything automatically - no JSON configuration needed.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    task_description: {
                                        type: 'string',
                                        description: 'Natural language description of what you want the agents to accomplish together'
                                    },
                                    agent_types: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Types of agents needed (e.g., "analyst", "writer", "researcher"). Optional - will auto-select if not provided.'
                                    },
                                    urgency: {
                                        type: 'string',
                                        enum: ['low', 'medium', 'high'],
                                        description: 'How urgent this collaboration is (affects timeout and priority)'
                                    }
                                },
                                required: ['task_description']
                            }
                        },
                        {
                            name: 'assign_task',
                            description: 'Assign a specific task to available agents and get the result. Simple, direct task assignment.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    task: {
                                        type: 'string',
                                        description: 'What you want the agent(s) to do'
                                    },
                                    preferred_agent: {
                                        type: 'string',
                                        description: 'Specific agent ID if you have a preference, otherwise will auto-select best agent'
                                    },
                                    context: {
                                        type: 'string',
                                        description: 'Additional context or information the agent should know'
                                    }
                                },
                                required: ['task']
                            }
                        },
                        {
                            name: 'get_collaboration_status',
                            description: 'Check on the progress of ongoing collaborations and get results when ready',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    show_details: {
                                        type: 'boolean',
                                        description: 'Whether to show detailed progress or just summary'
                                    }
                                },
                                additionalProperties: false
                            }
                        },
                        {
                            name: 'list_available_agents',
                            description: 'See what agents are available and what they can do. Simple agent discovery.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    capability: {
                                        type: 'string',
                                        description: 'Find agents with specific capability (e.g., "writing", "analysis", "research")'
                                    },
                                    show_busy: {
                                        type: 'boolean',
                                        description: 'Whether to include agents that are currently busy'
                                    }
                                },
                                additionalProperties: false
                            }
                        },
                        {
                            name: 'create_agent_team',
                            description: 'Automatically create a team of agents optimized for a specific type of work',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    team_purpose: {
                                        type: 'string',
                                        description: 'What this team will be working on (e.g., "content creation", "data analysis", "customer support")'
                                    },
                                    team_size: {
                                        type: 'number',
                                        minimum: 2,
                                        maximum: 10,
                                        description: 'How many agents in the team (2-10). Will optimize if not specified.'
                                    }
                                },
                                required: ['team_purpose']
                            }
                        },
                        {
                            name: 'ask_agent',
                            description: 'Have a conversation with a specific agent - ask questions, get advice, or work through problems together. ⚡ SMART ASYNC: Automatically switches to async mode for complex tasks to prevent timeouts.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    agent_id: {
                                        type: 'string',
                                        description: 'ID of the agent to talk to. Use list_available_agents if you need to find one.'
                                    },
                                    message: {
                                        type: 'string',
                                        description: 'What you want to say or ask the agent'
                                    },
                                    conversation_context: {
                                        type: 'string',
                                        description: 'Previous conversation context if this is part of an ongoing discussion'
                                    },
                                    force_async: {
                                        type: 'boolean',
                                        description: 'Force async mode even for simple tasks (optional, defaults to auto-detection)'
                                    }
                                },
                                required: ['agent_id', 'message']
                            }
                        },
                        {
                            name: 'activate_collaboration',
                            description: 'Activate a collaboration scenario so it can be executed. Use this if a collaboration was created but shows as "draft" status.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    collaboration_id: {
                                        type: 'string',
                                        description: 'The ID of the collaboration/scenario to activate (e.g., scenario_123456789_abc123)'
                                    }
                                },
                                required: ['collaboration_id']
                            }
                        },
                        {
                            name: 'ask_agent_async',
                            description: 'Start an asynchronous conversation with an agent (for long-running tasks to avoid timeouts)',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    agent_id: {
                                        type: 'string',
                                        description: 'ID of the agent to talk to'
                                    },
                                    message: {
                                        type: 'string',
                                        description: 'What you want to say or ask the agent'
                                    }
                                },
                                required: ['agent_id', 'message']
                            }
                        },
                        {
                            name: 'get_async_result',
                            description: 'Get the result of an asynchronous agent request',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    request_id: {
                                        type: 'string',
                                        description: 'The request ID returned by ask_agent_async'
                                    }
                                },
                                required: ['request_id']
                            }
                        },
                        {
                            name: 'list_async_results',
                            description: 'List all async results for an agent',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    agent_id: {
                                        type: 'string',
                                        description: 'ID of the agent to list results for'
                                    }
                                },
                                required: ['agent_id']
                            }
                        },
                        {
                            name: 'check_async_ready',
                            description: 'Auto-check if async results are ready and return them if completed (helper for desktop agents)',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    request_id: {
                                        type: 'string',
                                        description: 'The request ID to check'
                                    },
                                    wait_time: {
                                        type: 'number',
                                        description: 'Max time to wait in milliseconds (optional, default 0 for immediate check)'
                                    }
                                },
                                required: ['request_id']
                            }
                        },
                        {
                            name: 'start_coordination',
                            description: 'Start a coordinated multi-agent collaboration session with a coordinator agent managing participant agents',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    coordinator_id: {
                                        type: 'string',
                                        description: 'ID of the coordinator agent to manage the collaboration'
                                    },
                                    scenario_prompt: {
                                        type: 'string',
                                        description: 'The scenario or task description for the collaboration'
                                    },
                                    participant_ids: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Array of participant agent IDs to involve in the collaboration'
                                    },
                                    timeout_minutes: {
                                        type: 'number',
                                        minimum: 1,
                                        maximum: 120,
                                        description: 'Timeout for the coordination session in minutes (default: 30)'
                                    },
                                    coordination_style: {
                                        type: 'string',
                                        enum: ['directive', 'consultative', 'collaborative'],
                                        description: 'Style of coordination (default: collaborative)'
                                    }
                                },
                                required: ['coordinator_id', 'scenario_prompt', 'participant_ids']
                            }
                        },
                        {
                            name: 'get_coordination_session',
                            description: 'Get the status and progress of a coordination session',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    session_id: {
                                        type: 'string',
                                        description: 'ID of the coordination session to check'
                                    }
                                },
                                required: ['session_id']
                            }
                        },
                        {
                            name: 'coordinate_project',
                            description: 'Start a natural language coordination project. Automatically analyzes your request, creates appropriate agents with relevant specializations, and manages the coordination workflow.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    request: {
                                        type: 'string',
                                        description: 'Natural language description of what you want to accomplish through agent coordination (e.g., "Create a marketing campaign", "Analyze this dataset from multiple perspectives", "Design a software architecture")'
                                    },
                                    collaboration_style: {
                                        type: 'string',
                                        enum: ['directive', 'consultative', 'collaborative'],
                                        description: 'How agents should work together (default: collaborative)'
                                    },
                                    max_agents: {
                                        type: 'number',
                                        minimum: 2,
                                        maximum: 8,
                                        description: 'Maximum number of agents to create (default: auto-determined from request)'
                                    },
                                    timeout_minutes: {
                                        type: 'number',
                                        minimum: 5,
                                        maximum: 60,
                                        description: 'How long to wait for completion (default: 20 minutes)'
                                    }
                                },
                                required: ['request']
                            }
                        },
                        {
                            name: 'get_published_content',
                            description: 'Retrieve published content from a coordination session or scenario execution',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    session_id: {
                                        type: 'string',
                                        description: 'ID of the coordination session or scenario execution'
                                    },
                                    content_type: {
                                        type: 'string',
                                        enum: ['coordination', 'scenario_execution'],
                                        description: 'Type of content to retrieve (default: coordination)'
                                    }
                                },
                                required: ['session_id']
                            }
                        },
                        {
                            name: 'list_published_content',
                            description: 'List all available published content from coordination sessions and scenario executions',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    content_type: {
                                        type: 'string',
                                        enum: ['coordination', 'scenario_execution', 'all'],
                                        description: 'Filter by content type (default: all)'
                                    },
                                    limit: {
                                        type: 'number',
                                        minimum: 1,
                                        maximum: 100,
                                        description: 'Maximum number of items to return (default: 20)'
                                    }
                                },
                                required: []
                            }
                        },
                        {
                            name: 'get_scenario_execution_result',
                            description: 'Get detailed results from a scenario execution including agent outputs and final synthesis',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    execution_id: {
                                        type: 'string',
                                        description: 'ID of the scenario execution'
                                    }
                                },
                                required: ['execution_id']
                            }
                        },
                        {
                            name: 'list_coordinators',
                            description: 'List all available coordinator agents in the system',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    status: {
                                        type: 'string',
                                        enum: ['active', 'inactive'],
                                        description: 'Filter by coordinator status (optional)'
                                    }
                                },
                                additionalProperties: false
                            }
                        },
                        {
                            name: 'get_coordinator',
                            description: 'Get detailed information about a specific coordinator agent',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    coordinator_id: {
                                        type: 'string',
                                        description: 'ID of the coordinator to get details for'
                                    }
                                },
                                required: ['coordinator_id']
                            }
                        },
                        {
                            name: 'create_coordinator',
                            description: 'Create a new coordinator agent for managing multi-agent collaborations',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string',
                                        description: 'Name of the coordinator'
                                    },
                                    description: {
                                        type: 'string',
                                        description: 'Description of the coordinator\'s role and capabilities'
                                    },
                                    coordination_style: {
                                        type: 'string',
                                        enum: ['directive', 'consultative', 'collaborative'],
                                        description: 'Default coordination style (default: collaborative)'
                                    },
                                    max_participants: {
                                        type: 'number',
                                        minimum: 2,
                                        maximum: 20,
                                        description: 'Maximum number of participant agents (default: 10)'
                                    }
                                },
                                required: ['name', 'description']
                            }
                        }
                    ]
                };
            case 'tools/call':
                try {
                    const toolResult = await this.handleToolCall(message.params);
                    // MCP tools/call should return content array format
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(toolResult, null, 2)
                            }
                        ]
                    };
                }
                catch (error) {
                    console.error('Tool call error:', error);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                            }
                        ],
                        isError: true
                    };
                }
            case 'resources/list':
                return {
                    resources: [
                        {
                            uri: 'druids://agents',
                            name: 'System Agents',
                            description: 'List of all agents in the system',
                            mimeType: 'application/json'
                        },
                        {
                            uri: 'druids://realms',
                            name: 'System Realms',
                            description: 'List of all realms in the system',
                            mimeType: 'application/json'
                        }
                    ]
                };
            case 'resources/read':
                return await this.handleResourceRead(message.params);
            case 'notifications/initialized':
                // MCP protocol notification - client confirms initialization
                console.log('🔔 Client initialization confirmed');
                return {}; // Empty response for notification
            default:
                throw new Error(`Method not found: ${message.method}`);
        }
    }
    async handleToolCall(params) {
        const { name, arguments: args } = params;
        console.log(`🔧 Handling tool call: ${name}`, JSON.stringify(args, null, 2));
        switch (name) {
            case 'agent_create':
                try {
                    const agent = await this._agentService.createAgent({
                        name: args.name,
                        type: args.type,
                        description: args.description || '',
                        capabilities: ['communication', 'task_execution'], // Default capabilities
                        specialization: {
                            domain: args.domain || 'general',
                            expertise: [`${args.type}_mastery`, 'environmental_awareness'],
                            knowledgeNamespaces: [`${args.domain || 'general'}_knowledge`],
                            maxConcurrentTasks: 10
                        },
                        personality: {
                            traits: ['wise', 'protective', 'nature_connected'],
                            communicationStyle: 'formal',
                            decisionMaking: 'intuitive'
                        },
                        mcpTools: ['environment_sense', 'nature_communicate'],
                        toolPermissions: {
                            'environment_sense': { operations: ['read', 'monitor'], restrictions: [] },
                            'nature_communicate': { operations: ['read', 'write'], restrictions: [] }
                        },
                        llmConfig: {
                            provider: 'openai',
                            model: 'gpt-4',
                            temperature: 0.7,
                            maxTokens: 2000
                        }
                    });
                    // If realm is specified, assign the agent to that realm
                    if (args.realm) {
                        try {
                            await this.assignAgentToRealm(agent.id, args.realm);
                        }
                        catch (realmError) {
                            console.warn(`⚠️ Agent created but realm assignment failed:`, realmError);
                            // Don't fail the agent creation, just warn
                        }
                    }
                    return {
                        success: true,
                        agent: {
                            id: agent.id,
                            name: agent.name,
                            type: agent.type,
                            status: agent.status
                        }
                    };
                }
                catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to create agent'
                    };
                }
            case 'realm_list':
                try {
                    // Safely extract and validate filters
                    const filters = {
                        type: args.type || undefined,
                        status: args.status || undefined
                    };
                    // Clean up undefined values to avoid serialization issues
                    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);
                    console.log('🔧 Realm list filters:', JSON.stringify(filters));
                    const realms = await this._realmService.getRealms();
                    const filteredRealms = realms.map((realm) => ({
                        id: realm.id,
                        name: realm.name,
                        type: realm.type || realm.environment?.type,
                        agentCount: realm.agentBindings?.length || 0,
                        capacity: realm.capacity,
                        status: realm.status,
                        description: realm.description
                    })).filter((realm) => {
                        return (!filters['type'] || realm.type === filters['type']) &&
                            (!filters['status'] || realm.status === filters['status']);
                    });
                    // Return just the realms array - MCP tools should return simple data
                    const result = filteredRealms;
                    // Validate result is serializable
                    console.log('🔧 Realm list result:', JSON.stringify(result, null, 2));
                    return result;
                }
                catch (error) {
                    console.error('❌ Realm service error:', error);
                    throw new Error(error instanceof Error ? error.message : 'Failed to list realms');
                }
            case 'agent_list':
                try {
                    console.log('🔍 DEBUG: agent_list called, checking AgentService state...');
                    console.log('🔍 DEBUG: AgentService instance:', !!this._agentService);
                    const filters = {
                        type: args.type,
                        status: args.status
                    };
                    let agents = await this._agentService.listAgents(filters);
                    console.log('🔍 DEBUG: AgentService returned', agents.length, 'agents');
                    console.log('🔍 DEBUG: First 3 agent names:', agents.slice(0, 3).map(a => a.name));
                    // If realm filter is specified, filter agents by realm assignment
                    if (args.realm) {
                        console.log(`🔍 Filtering agents by realm: ${args.realm}`);
                        // Get all realms to find agent bindings
                        const allRealms = await this._realmService.getRealms();
                        // Find the target realm by ID or name
                        let targetRealm = await this._realmService.getRealm(args.realm);
                        if (!targetRealm) {
                            targetRealm = allRealms.find(r => r.name.toLowerCase() === args.realm.toLowerCase());
                        }
                        if (!targetRealm) {
                            throw new Error(`Realm not found: ${args.realm}`);
                        }
                        // Get agent IDs assigned to this realm
                        const realmAgentIds = targetRealm.agentBindings?.map((binding) => binding.agentId) || [];
                        console.log(`🔍 Found ${realmAgentIds.length} agents in realm ${targetRealm.name}:`, realmAgentIds);
                        // Filter agents to only include those assigned to the realm
                        agents = agents.filter((agent) => realmAgentIds.includes(agent.id));
                    }
                    const formattedAgents = agents.map((agent) => ({
                        id: agent.id,
                        name: agent.name,
                        type: agent.type,
                        status: agent.status,
                        specialization: agent.domain,
                        description: agent.description
                    }));
                    // Return just the agents array - MCP tools should return simple data
                    return formattedAgents;
                }
                catch (error) {
                    console.error('❌ Agent service error:', error);
                    throw new Error(error instanceof Error ? error.message : 'Failed to list agents');
                }
            case 'realm_create':
                try {
                    const realm = await this._realmService.createRealm({
                        name: args.name,
                        type: args.type,
                        description: args.description || `A ${args.type} realm for agent activities`,
                        capacity: args.capacity || 10,
                        environment: {
                            type: args.type,
                            resources: [],
                            connections: []
                        },
                        policies: [],
                        agentBindings: []
                    });
                    return {
                        success: true,
                        realm: {
                            id: realm.id,
                            name: realm.name,
                            type: realm.type,
                            status: realm.status,
                            capacity: realm.capacity
                        }
                    };
                }
                catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to create realm'
                    };
                }
            case 'scenario_create':
                try {
                    const scenario = await this._scenarioService.createScenario({
                        name: args.name,
                        description: args.description || `Scenario: ${args.objective}`,
                        type: 'collaboration',
                        tags: args.agents || []
                    });
                    return {
                        success: true,
                        scenario: {
                            id: scenario.id,
                            name: scenario.name,
                            description: scenario.description,
                            status: scenario.status,
                            type: scenario.type,
                            tags: scenario.tags
                        }
                    };
                }
                catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to create scenario'
                    };
                }
            case 'scenario_list':
                try {
                    const scenarios = await this._scenarioService.listScenarios();
                    const formattedScenarios = scenarios.map((scenario) => ({
                        id: scenario.id,
                        name: scenario.name,
                        description: scenario.description,
                        status: scenario.status,
                        type: scenario.type,
                        executionCount: scenario.usage?.executionCount || 0,
                        successCount: scenario.usage?.successCount || 0,
                        failureCount: scenario.usage?.failureCount || 0,
                        lastExecuted: scenario.usage?.lastExecuted || null,
                        tags: scenario.tags || [],
                        createdAt: scenario.createdAt
                    }));
                    return formattedScenarios;
                }
                catch (error) {
                    console.error('❌ Scenario service error:', error);
                    throw new Error(error instanceof Error ? error.message : 'Failed to list scenarios');
                }
            case 'scenario_status':
                try {
                    const scenario = await this._scenarioService.getScenario(args.scenarioId);
                    if (!scenario) {
                        throw new Error(`Scenario not found: ${args.scenarioId}`);
                    }
                    return {
                        id: scenario.id,
                        name: scenario.name,
                        description: scenario.description,
                        status: scenario.status,
                        type: scenario.type,
                        usage: scenario.usage,
                        tags: scenario.tags,
                        version: scenario.version,
                        createdAt: scenario.createdAt,
                        updatedAt: scenario.updatedAt,
                        createdBy: scenario.createdBy,
                        lastModifiedBy: scenario.lastModifiedBy
                    };
                }
                catch (error) {
                    console.error('❌ Scenario service error:', error);
                    throw new Error(error instanceof Error ? error.message : 'Failed to get scenario status');
                }
            case 'scenario_execute':
                try {
                    const executionId = await this._scenarioService.executeScenario({
                        scenarioId: args.scenarioId,
                        overrides: args.parameters
                    }, 'system');
                    return {
                        success: true,
                        executionId: executionId,
                        message: `Scenario ${args.scenarioId} execution started`,
                        status: 'running'
                    };
                }
                catch (error) {
                    console.error('❌ Scenario execution error:', error);
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to execute scenario'
                    };
                }
            case 'execution_status':
                try {
                    const execution = await this._scenarioService.getExecutionStatus(args.executionId);
                    if (!execution) {
                        throw new Error(`Execution not found: ${args.executionId}`);
                    }
                    return {
                        success: true,
                        execution: {
                            id: execution.id,
                            scenarioId: execution.scenarioId,
                            status: execution.status,
                            progress: execution.progress,
                            startTime: execution.startTime,
                            endTime: execution.endTime,
                            tasks: execution.tasks,
                            results: execution.results
                        }
                    };
                }
                catch (error) {
                    console.error('❌ Execution status error:', error);
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to get execution status'
                    };
                }
            case 'agent_start':
                try {
                    const agent = await this._agentService.startAgent(args.agentId, 'system');
                    return {
                        success: true,
                        agent: {
                            id: agent.id,
                            name: agent.name,
                            type: agent.type,
                            status: agent.status
                        }
                    };
                }
                catch (error) {
                    console.error('❌ Agent start error:', error);
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to start agent'
                    };
                }
            case 'agent_execute':
                try {
                    const executionRequest = {
                        prompt: args.prompt,
                        systemPrompt: args.systemPrompt,
                        temperature: args.temperature
                    };
                    const result = await this._agentService.executeAgentPrompt(args.agentId, executionRequest, 'system' // Using system as the requester for now
                    );
                    return {
                        success: true,
                        agentId: args.agentId,
                        response: result.response,
                        usage: result.usage,
                        executionTime: result.executionTime
                    };
                }
                catch (error) {
                    console.error('❌ Agent execution error:', error);
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to execute agent prompt'
                    };
                }
            case 'agent_reassign':
                try {
                    // Reassign the agent to the new realm
                    await this.assignAgentToRealm(args.agentId, args.realm);
                    return {
                        success: true,
                        message: `Agent ${args.agentId} successfully reassigned to realm ${args.realm}`
                    };
                }
                catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to reassign agent'
                    };
                }
            // Natural Language Interface Handlers
            case 'create_collaboration':
                try {
                    // Convert natural language request to scenario
                    const scenario = await this._scenarioService.createScenario({
                        name: `Collaboration: ${args.task_description.substring(0, 50)}...`,
                        description: args.task_description,
                        type: 'collaboration',
                        requiredAgents: args.agent_types ? args.agent_types.map((type) => ({
                            type,
                            count: 1,
                            capabilities: []
                        })) : [
                            // Default: require at least one agent of any type if none specified
                            {
                                type: 'any',
                                count: 2, // Default to 2 agents for collaboration
                                capabilities: []
                            }
                        ],
                        phases: [{
                                name: 'main_phase',
                                description: args.task_description,
                                dependencies: [],
                                parallelExecution: true,
                                continueOnTaskFailure: false,
                                successCriteria: {
                                    minimumTasksSuccess: 1
                                },
                                tasks: [{
                                        id: 'main_task',
                                        name: 'Main Collaboration Task',
                                        description: args.task_description,
                                        type: 'coordination',
                                        parameters: {},
                                        timeout: args.urgency === 'high' ? 300000 : args.urgency === 'medium' ? 600000 : 1200000,
                                        expectedDuration: 600000,
                                        priority: args.urgency === 'high' ? 'high' : args.urgency === 'medium' ? 'medium' : 'low',
                                        dependencies: [],
                                        parallelizable: true,
                                        agentConstraints: {
                                            requiredCapabilities: args.agent_types || []
                                        }
                                    }]
                            }]
                    });
                    // Activate the scenario for execution
                    await this._scenarioService.activateScenario(scenario.id);
                    // Start execution immediately
                    const executionId = await this._scenarioService.executeScenario({
                        scenarioId: scenario.id
                    });
                    return {
                        message: `✅ Collaboration started successfully!\n\n**Task:** ${args.task_description}\n**Collaboration ID:** ${scenario.id}\n**Execution ID:** ${executionId}\n\nUse 'get_collaboration_status' to check progress and get results.`
                    };
                }
                catch (error) {
                    console.error('❌ Create collaboration error:', error);
                    return {
                        error: `❌ Failed to create collaboration: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'assign_task':
                try {
                    let selectedAgent;
                    if (args.preferred_agent) {
                        // Use specific agent if requested
                        try {
                            selectedAgent = await this._agentService.getAgent(args.preferred_agent);
                        }
                        catch {
                            // Fall back to auto-selection if preferred agent not found
                            selectedAgent = null;
                        }
                    }
                    if (!selectedAgent) {
                        // Auto-select best agent
                        const agents = await this._agentService.listAgents();
                        const availableAgents = agents.filter(a => a.status === 'active' || a.status === 'deployed');
                        if (availableAgents.length === 0) {
                            return {
                                content: [{
                                        type: "text",
                                        text: "❌ No agents available right now. Try again in a moment or create a new agent."
                                    }]
                            };
                        }
                        selectedAgent = availableAgents[0]; // Simple selection - could be enhanced with capability matching
                    }
                    if (!selectedAgent) {
                        return {
                            message: "❌ Could not select an agent for this task. No agents available."
                        };
                    }
                    // Execute the task
                    const fullPrompt = args.context ? `${args.task}\n\nContext: ${args.context}` : args.task;
                    const result = await this._agentService.executeAgentPrompt(selectedAgent.id, fullPrompt);
                    return {
                        message: `✅ Task completed by agent **${selectedAgent.name}**\n\n**Task:** ${args.task}\n\n**Result:**\n${result.response}`
                    };
                }
                catch (error) {
                    console.error('❌ Assign task error:', error);
                    return {
                        error: `❌ Failed to assign task: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'get_collaboration_status':
                try {
                    // Get recent scenarios as proxy for collaborations
                    const scenarios = await this._scenarioService.listScenarios();
                    if (scenarios.length === 0) {
                        return {
                            message: "ℹ️ No collaborations found. Use 'create_collaboration' to start one."
                        };
                    }
                    let statusText = "📊 **Collaboration Status**\n\n";
                    for (const scenario of scenarios) {
                        statusText += `**${scenario.name}**\n`;
                        statusText += `- Status: ${scenario.status}\n`;
                        statusText += `- Type: ${scenario.type}\n`;
                        statusText += `- Created: ${scenario.createdAt}\n`;
                        if (args.show_details) {
                            statusText += `- Description: ${scenario.description}\n`;
                            statusText += `- Execution Count: ${scenario.usage.executionCount}\n`;
                            statusText += `- Success Rate: ${scenario.usage.executionCount > 0 ? Math.round((scenario.usage.successCount / scenario.usage.executionCount) * 100) : 0}%\n`;
                        }
                        statusText += "\n";
                    }
                    return {
                        message: statusText
                    };
                }
                catch (error) {
                    console.error('❌ Get collaboration status error:', error);
                    return {
                        error: `❌ Failed to get collaboration status: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'list_available_agents':
                try {
                    const agents = await this._agentService.listAgents();
                    const params = args || {};
                    let filteredAgents = agents;
                    if (params.capability) {
                        filteredAgents = agents.filter(agent => agent.capabilities?.some(cap => cap.toLowerCase().includes(params.capability.toLowerCase())) ||
                            agent.type.toLowerCase().includes(params.capability.toLowerCase()));
                    }
                    if (!params.show_busy) {
                        filteredAgents = filteredAgents.filter(agent => agent.status === 'active' || agent.status === 'deployed');
                    }
                    if (filteredAgents.length === 0) {
                        return {
                            message: params.capability
                                ? `❌ No agents found with capability: ${params.capability}`
                                : "❌ No available agents found."
                        };
                    }
                    let agentList = "🤖 **Available Agents**\n\n";
                    for (const agent of filteredAgents) {
                        agentList += `**${agent.name}** (${agent.id})\n`;
                        agentList += `- Type: ${agent.type}\n`;
                        agentList += `- Status: ${agent.status}\n`;
                        if (agent.capabilities && agent.capabilities.length > 0) {
                            agentList += `- Capabilities: ${agent.capabilities.join(', ')}\n`;
                        }
                        agentList += "\n";
                    }
                    return {
                        message: agentList
                    };
                }
                catch (error) {
                    console.error('❌ List agents error:', error);
                    return {
                        content: [{
                                type: "text",
                                text: `❌ Failed to list agents: ${error instanceof Error ? error.message : 'Unknown error'}`
                            }]
                    };
                }
            case 'create_agent_team':
                try {
                    console.log('🔨 create_agent_team called with args:', args);
                    // Determine optimal team composition based on purpose
                    const teamSize = args.team_size || this.getOptimalTeamSize(args.team_purpose);
                    const agentTypes = this.getAgentTypesForPurpose(args.team_purpose);
                    console.log(`🔨 Creating team of ${teamSize} agents`);
                    const createdAgents = [];
                    for (let i = 0; i < teamSize; i++) {
                        const agentType = agentTypes[i % agentTypes.length];
                        const capabilities = this.getCapabilitiesForType(agentType);
                        console.log(`🔨 Creating agent ${i + 1} of type ${agentType}`);
                        const agent = await this._agentService.createAgent({
                            name: `${args.team_purpose} Team Member ${i + 1}`,
                            type: agentType,
                            description: `Specialized ${agentType} for ${args.team_purpose}`,
                            capabilities: capabilities,
                            specialization: {
                                domain: args.team_purpose,
                                expertise: capabilities,
                                knowledgeNamespaces: [],
                                maxConcurrentTasks: 3
                            },
                            personality: {
                                traits: ['collaborative', 'focused', 'reliable'],
                                communicationStyle: 'formal',
                                decisionMaking: 'analytical'
                            },
                            mcpTools: [],
                            toolPermissions: {},
                            llmConfig: {
                                provider: 'openai',
                                model: 'gpt-4',
                                temperature: 0.7,
                                maxTokens: 2000,
                                systemPrompt: `You are a ${agentType} agent specialized in ${args.team_purpose}.`
                            }
                        });
                        console.log(`🔨 Created agent:`, { id: agent.id, name: agent.name, type: agent.type });
                        // Activate the agent so it can participate in coordination
                        try {
                            console.log(`🔨 Activating agent ${agent.id}...`);
                            const activatedAgent = await this._agentService.startAgent(agent.id, 'system');
                            console.log(`🔨 Agent ${agent.id} activated with status: ${activatedAgent.status}`);
                            createdAgents.push(activatedAgent);
                        }
                        catch (activationError) {
                            console.error(`❌ Failed to activate agent ${agent.id}:`, activationError);
                            // Still add the agent even if activation fails, but note the failure
                            agent.status = 'inactive'; // Ensure status is set correctly
                            createdAgents.push(agent);
                        }
                    }
                    console.log(`🔨 All agents created successfully. Count: ${createdAgents.length}`);
                    console.log('🔨 Agent IDs:', createdAgents.map(a => a.id));
                    // Return both human-readable message and agent IDs
                    const agentIds = createdAgents.map(a => a.id);
                    const result = {
                        message: `✅ Created team of ${teamSize} agents for **${args.team_purpose}**\n\n${createdAgents.map(a => `- **${a.name}** (${a.type}) - ID: \`${a.id}\``).join('\n')}\n\n**Agent IDs for coordination:**\n${agentIds.map(id => `\`${id}\``).join(', ')}\n\nUse 'create_coordinator' and 'start_coordination' with these agent IDs!`,
                        agent_ids: agentIds,
                        agents: createdAgents.map(a => ({
                            id: a.id,
                            name: a.name,
                            type: a.type
                        }))
                    };
                    console.log('🔨 Returning result:', result);
                    return result;
                }
                catch (error) {
                    console.error('❌ Create agent team error:', error);
                    return {
                        error: `❌ Failed to create agent team: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'ask_agent':
                try {
                    // 🧠 INTELLIGENT ASYNC DETECTION
                    // Auto-detect if this should be async based on several factors
                    // Do this FIRST before checking agent status
                    const shouldUseAsync = this.shouldUseAsyncMode(args.message, null, args);
                    if (shouldUseAsync) {
                        console.log(`🔄 Auto-switching to async mode for agent ${args.agent_id}`);
                        // Start async request
                        const asyncRequest = {
                            agentId: args.agent_id,
                            message: args.message,
                            conversationContext: args.conversation_context
                        };
                        const response = await this._asyncResultManager.createAsyncRequest(asyncRequest);
                        // Start background processing
                        this.processAsyncRequest(response.requestId, args.agent_id, args.message);
                        // Return immediate response with instructions for desktop agent
                        return {
                            message: `🔄 **Processing your request asynchronously...**\n\n` +
                                `Agent **${args.agent_id}** is working on: "${args.message.substring(0, 60)}${args.message.length > 60 ? '...' : ''}"\n\n` +
                                `⏱️ Estimated completion: ${Math.round(response.estimatedDuration / 1000)}s\n\n` +
                                `📋 **How to get your response:**\n` +
                                `1. Use tool: \`get_async_result\` with request_id: \`${response.requestId}\`\n` +
                                `2. Or wait a moment and I'll check automatically\n\n` +
                                `💡 *This was automatically switched to async mode to prevent timeouts*`,
                            async_info: {
                                request_id: response.requestId,
                                estimated_duration: response.estimatedDuration,
                                auto_check_in: 5000, // Desktop agent can auto-check in 5 seconds
                                status: 'processing'
                            }
                        };
                    }
                    else {
                        // Use synchronous mode for simple/quick requests
                        console.log(`⚡ Using sync mode for agent ${args.agent_id}`);
                        // Now fetch the agent for sync execution
                        const agent = await this._agentService.getAgent(args.agent_id);
                        // Add conversation context if provided
                        let fullPrompt = args.message;
                        if (args.conversation_context) {
                            fullPrompt = `Previous conversation context: ${args.conversation_context}\n\nCurrent message: ${args.message}`;
                        }
                        // Use proper AgentExecutionRequest structure for enhanced executeAgentPrompt
                        const result = await this._agentService.executeAgentPrompt(args.agent_id, {
                            prompt: fullPrompt,
                            temperature: 0.7
                        });
                        return {
                            message: `🤖 **${agent.name}** responds:\n\n${result.response}`
                        };
                    }
                }
                catch (error) {
                    console.error('❌ Ask agent error:', error);
                    return {
                        error: `❌ Failed to communicate with agent: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'activate_collaboration':
                try {
                    const activatedScenario = await this._scenarioService.activateScenario(args.collaboration_id);
                    return {
                        message: `✅ Collaboration activated successfully!\n\n**Collaboration:** ${activatedScenario.name}\n**ID:** ${activatedScenario.id}\n**Status:** ${activatedScenario.status}\n\nYou can now execute this collaboration using 'scenario_execute' or start a new execution.`
                    };
                }
                catch (error) {
                    console.error('❌ Activate collaboration error:', error);
                    return {
                        error: `❌ Failed to activate collaboration: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'ask_agent_async':
                try {
                    const asyncRequest = {
                        agentId: args.agent_id,
                        message: args.message,
                        conversationContext: args.conversation_context
                    };
                    const response = await this._asyncResultManager.createAsyncRequest(asyncRequest);
                    // Start async processing in background
                    this.processAsyncRequest(response.requestId, args.agent_id, args.message);
                    return {
                        request_id: response.requestId,
                        status: 'pending',
                        estimated_duration: response.estimatedDuration,
                        expires_at: response.expiresAt,
                        message: `Async request started. Use get_async_result with request_id: ${response.requestId} to check status.`
                    };
                }
                catch (error) {
                    console.error('❌ Async agent request error:', error);
                    return {
                        error: `❌ Failed to start async request: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'get_async_result':
                try {
                    const result = await this._asyncResultManager.getResult(args.request_id);
                    return result;
                }
                catch (error) {
                    console.error('❌ Get async result error:', error);
                    return {
                        error: `❌ Failed to get async result: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'list_async_results':
                try {
                    const results = await this._asyncResultManager.getResultsByAgent(args.agent_id);
                    return {
                        results,
                        count: results.length
                    };
                }
                catch (error) {
                    console.error('❌ List async results error:', error);
                    return {
                        error: `❌ Failed to list async results: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'check_async_ready':
                try {
                    const result = await this._asyncResultManager.getResult(args.request_id);
                    if (!result) {
                        return {
                            ready: false,
                            status: 'not_found',
                            message: `Request ID ${args.request_id} not found`
                        };
                    }
                    if (result.status === 'completed') {
                        return {
                            ready: true,
                            status: 'completed',
                            result: result.result,
                            duration: result.metadata.actualDuration,
                            message: `✅ Your request completed successfully!`
                        };
                    }
                    else if (result.status === 'failed') {
                        return {
                            ready: true,
                            status: 'failed',
                            error: result.error,
                            message: `❌ Your request failed: ${result.error}`
                        };
                    }
                    else {
                        // Still processing
                        const waitTime = args.wait_time || 0;
                        if (waitTime > 0) {
                            // Wait a bit and check again
                            await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 5000)));
                            const updatedResult = await this._asyncResultManager.getResult(args.request_id);
                            if (updatedResult?.status === 'completed') {
                                return {
                                    ready: true,
                                    status: 'completed',
                                    result: updatedResult.result,
                                    duration: updatedResult.metadata.actualDuration,
                                    message: `✅ Your request completed while waiting!`
                                };
                            }
                        }
                        return {
                            ready: false,
                            status: result.status,
                            progress: result.progress,
                            message: `🔄 Still ${result.status}... please wait`
                        };
                    }
                }
                catch (error) {
                    console.error('❌ Check async ready error:', error);
                    return {
                        ready: false,
                        status: 'error',
                        error: `❌ Failed to check async status: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'start_coordination':
                try {
                    console.log('🔧 MCP DEBUG: start_coordination called with:', {
                        coordinator_id: args.coordinator_id,
                        participant_ids: args.participant_ids,
                        participant_count: args.participant_ids ? args.participant_ids.length : 0
                    });
                    const sessionId = await this._coordinationService.startCoordination({
                        coordinatorId: args.coordinator_id,
                        scenarioPrompt: args.scenario_prompt,
                        participantIds: args.participant_ids,
                        timeoutMinutes: args.timeout_minutes || 30,
                        coordinationStyle: args.coordination_style || 'collaborative'
                    });
                    console.log('🔧 MCP DEBUG: Coordination started successfully, session:', sessionId);
                    return {
                        session_id: sessionId,
                        status: 'coordination_started',
                        message: `🎯 Coordination session ${sessionId} started successfully`,
                        coordinator_id: args.coordinator_id,
                        participant_count: args.participant_ids.length,
                        timeout_minutes: args.timeout_minutes || 30,
                        coordination_style: args.coordination_style || 'collaborative'
                    };
                }
                catch (error) {
                    console.error('❌ Start coordination error:', error);
                    return {
                        error: `❌ Failed to start coordination: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'get_coordination_session':
                try {
                    const session = await this._coordinationService.getCoordinationSession(args.session_id);
                    if (!session) {
                        return {
                            error: `❌ Coordination session not found: ${args.session_id}`
                        };
                    }
                    return {
                        session_id: session.id,
                        status: session.status,
                        coordinator_id: session.coordinatorId,
                        scenario_prompt: session.scenarioPrompt,
                        participant_count: session.participantTasks?.length || 0,
                        tasks_completed: session.participantTasks?.filter(task => task.status === 'completed').length || 0,
                        tasks_in_progress: session.participantTasks?.filter(task => task.status === 'in_progress').length || 0,
                        tasks_failed: session.participantTasks?.filter(task => task.status === 'failed').length || 0,
                        started_at: session.startedAt,
                        final_result: session.finalResult,
                        participant_tasks: session.participantTasks?.map(task => ({
                            agent_id: task.agentId,
                            task: task.task,
                            status: task.status,
                            assigned_at: task.assignedAt,
                            completed_at: task.completedAt,
                            result: task.result
                        }))
                    };
                }
                catch (error) {
                    console.error('❌ Get coordination session error:', error);
                    return {
                        error: `❌ Failed to get coordination session: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'get_published_content':
                try {
                    const contentType = args.content_type || 'coordination';
                    const sessionId = args.session_id;
                    console.log(`📖 Getting published content for session: ${sessionId}, type: ${contentType}`);
                    // Try to get from coordination first
                    if (contentType === 'coordination' || contentType === 'all') {
                        const session = await this._coordinationService.getCoordinationSession(sessionId);
                        if (session && session.finalResult) {
                            return {
                                session_id: sessionId,
                                content_type: 'coordination',
                                published_at: session.finalResult.publishedAt,
                                published_to: session.finalResult.publishedTo,
                                content: session.finalResult.integratedContent,
                                coordinator_summary: session.finalResult.summary, // Use summary instead
                                participant_contributions: session.finalResult.participantContributions,
                                metadata: {
                                    coordinator_id: session.coordinatorId,
                                    participant_count: session.participantTasks?.length || 0,
                                    started_at: session.startedAt,
                                    status: session.status
                                }
                            };
                        }
                    }
                    // If coordination not found, try scenario execution
                    if (contentType === 'scenario_execution' || contentType === 'all') {
                        // Check if this might be a scenario execution ID
                        try {
                            const execution = await this._scenarioService.getExecutionStatus(sessionId);
                            if (execution) {
                                return {
                                    session_id: sessionId,
                                    content_type: 'scenario_execution',
                                    execution_id: execution.id,
                                    scenario_id: execution.scenarioId,
                                    status: execution.status,
                                    results: execution.results,
                                    task_results: execution.taskResults,
                                    metadata: {
                                        started_at: execution.startTime,
                                        completed_at: execution.endTime,
                                        progress: execution.progress,
                                        assigned_agents: execution.assignedAgents
                                    }
                                };
                            }
                        }
                        catch (scenarioError) {
                            console.log('No scenario execution found for session:', sessionId);
                        }
                    }
                    return {
                        error: `❌ No published content found for session: ${sessionId}`
                    };
                }
                catch (error) {
                    console.error('❌ Get published content error:', error);
                    return {
                        error: `❌ Failed to get published content: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'list_published_content':
                try {
                    const contentType = args.content_type || 'all';
                    const limit = args.limit || 20;
                    const results = [];
                    console.log(`📚 Listing published content, type: ${contentType}, limit: ${limit}`);
                    // Get coordination sessions with published content
                    if (contentType === 'coordination' || contentType === 'all') {
                        try {
                            const coordinationSessions = this._coordinationService.listSessions();
                            const publishedCoordination = coordinationSessions
                                .filter((session) => session.finalResult && session.finalResult.integratedContent)
                                .map((session) => ({
                                session_id: session.id,
                                content_type: 'coordination',
                                title: `Coordination: ${session.scenarioPrompt?.substring(0, 50)}...`,
                                published_at: session.finalResult.publishedAt,
                                published_to: session.finalResult.publishedTo,
                                coordinator_id: session.coordinatorId,
                                participant_count: session.participantTasks?.length || 0,
                                status: session.status
                            }));
                            results.push(...publishedCoordination);
                        }
                        catch (coordError) {
                            console.log('No coordination sessions found');
                        }
                    }
                    // Get scenario executions with results
                    if (contentType === 'scenario_execution' || contentType === 'all') {
                        try {
                            const scenarios = await this._scenarioService.listScenarios();
                            // For now, we'll list scenarios but note that we need execution details
                            // from the ScenarioService which doesn't currently expose a method to get all executions
                            for (const scenario of scenarios) {
                                // Add placeholder entry showing scenario is available for execution
                                results.push({
                                    session_id: `scenario-${scenario.id}`,
                                    content_type: 'scenario_execution',
                                    title: `Scenario: ${scenario.name}`,
                                    scenario_id: scenario.id,
                                    scenario_name: scenario.name,
                                    execution_count: scenario.usage.executionCount,
                                    success_count: scenario.usage.successCount,
                                    last_executed: scenario.usage.lastExecuted,
                                    status: scenario.status
                                });
                            }
                        }
                        catch (scenarioError) {
                            console.log('No scenario executions found');
                        }
                    }
                    // Sort by date (most recent first) and limit
                    const sortedResults = results
                        .sort((a, b) => {
                        const dateA = new Date(a.published_at || a.executed_at || 0);
                        const dateB = new Date(b.published_at || b.executed_at || 0);
                        return dateB.getTime() - dateA.getTime();
                    })
                        .slice(0, limit);
                    return {
                        content_type: contentType,
                        total_found: results.length,
                        returned_count: sortedResults.length,
                        published_content: sortedResults
                    };
                }
                catch (error) {
                    console.error('❌ List published content error:', error);
                    return {
                        error: `❌ Failed to list published content: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'get_scenario_execution_result':
                try {
                    const executionId = args.execution_id;
                    console.log(`🎭 Getting scenario execution result: ${executionId}`);
                    const execution = await this._scenarioService.getExecutionStatus(executionId);
                    if (!execution) {
                        return {
                            error: `❌ Scenario execution not found: ${executionId}`
                        };
                    }
                    return {
                        execution_id: execution.id,
                        scenario_id: execution.scenarioId,
                        status: execution.status,
                        started_at: execution.startTime,
                        completed_at: execution.endTime,
                        progress: execution.progress,
                        results: execution.results,
                        task_results: execution.taskResults,
                        assigned_agents: execution.assignedAgents,
                        metadata: {
                            duration_minutes: execution.endTime && execution.startTime
                                ? Math.round((new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()) / 60000)
                                : null,
                            success: execution.status === 'completed',
                            agent_count: execution.assignedAgents?.length || 0,
                            task_count: execution.taskResults?.length || 0
                        }
                    };
                }
                catch (error) {
                    console.error('❌ Get scenario execution result error:', error);
                    return {
                        error: `❌ Failed to get scenario execution result: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'coordinate_project':
                try {
                    console.log('� Natural language coordination request:', args.request);
                    // Use LLM to analyze the request and determine coordination structure
                    const analysisPrompt = `Analyze this coordination request and provide a structured response:

REQUEST: "${args.request}"

Based on this request, determine:
1. What type of coordination is needed
2. What specialist roles/agents would be required
3. What the final deliverable should be
4. What collaboration approach would work best

Respond in this JSON format:
{
  "coordination_type": "creative|analytical|technical|strategic|research|other",
  "agent_roles": [
    {
      "name": "Role Name",
      "specialization": "specific_domain", 
      "expertise": ["skill1", "skill2"],
      "responsibility": "what this agent contributes"
    }
  ],
  "collaboration_flow": "sequential|parallel|iterative",
  "final_deliverable": "description of end result",
  "estimated_complexity": "simple|moderate|complex"
}

Keep agent roles generic and applicable to any domain. Focus on functional responsibilities rather than specific topics.`;
                    // Get coordination analysis from LLM
                    let coordinationPlan;
                    try {
                        const response = await this._agentService.executeAgentPrompt('system', {
                            prompt: analysisPrompt,
                            temperature: 0.3,
                            collaborationContext: {
                                scenarioName: 'Coordination Analysis',
                                scenarioType: 'analysis',
                                agentRole: 'system_analyzer',
                                usePersonaPrompt: false
                            }
                        });
                        coordinationPlan = JSON.parse(response.response);
                    }
                    catch (error) {
                        // Fallback to basic coordination structure
                        coordinationPlan = {
                            coordination_type: "general",
                            agent_roles: [
                                { name: "Analyst", specialization: "analysis", expertise: ["research", "synthesis"], responsibility: "analyze and structure information" },
                                { name: "Creator", specialization: "creation", expertise: ["content", "development"], responsibility: "create deliverables" },
                                { name: "Reviewer", specialization: "review", expertise: ["evaluation", "improvement"], responsibility: "refine and enhance output" }
                            ],
                            collaboration_flow: "sequential",
                            final_deliverable: "integrated solution based on request",
                            estimated_complexity: "moderate"
                        };
                    }
                    // Create coordinator
                    const coordinator = await this._coordinationService.createCoordinator({
                        name: 'Coordination Manager',
                        description: `Managing coordination for: ${args.request}`,
                        llmConfig: {
                            provider: 'openai',
                            model: 'gpt-4',
                            systemPrompt: `You are coordinating agents to accomplish: ${args.request}. Focus on ${coordinationPlan.final_deliverable}.`,
                            temperature: 0.7
                        },
                        mcpTools: [],
                        toolPermissions: {},
                        coordination: {
                            maxParticipants: Math.min(coordinationPlan.agent_roles.length, args.max_agents || 6),
                            maxConcurrentScenarios: 3,
                            supportedScenarioTypes: [coordinationPlan.coordination_type],
                            coordinationStyle: args.collaboration_style || 'collaborative',
                            decisionMaking: 'consensus-seeking'
                        }
                    }, 'system');
                    // Create agents based on analysis
                    const agentIds = [];
                    const maxAgents = args.max_agents || coordinationPlan.agent_roles.length;
                    const rolesToCreate = coordinationPlan.agent_roles.slice(0, maxAgents);
                    for (const role of rolesToCreate) {
                        const agent = await this._agentService.createAgent({
                            name: role.name,
                            type: 'elemental',
                            description: `${role.responsibility} for project: ${args.request}`,
                            capabilities: ['collaboration', 'analysis', 'creation'],
                            specialization: {
                                domain: role.specialization,
                                expertise: role.expertise,
                                knowledgeNamespaces: ['coordination://public'],
                                maxConcurrentTasks: 3
                            },
                            personality: {
                                traits: ['analytical', 'collaborative', 'thorough'],
                                communicationStyle: 'formal',
                                decisionMaking: 'analytical',
                                collaborationPreference: 'collaborative'
                            },
                            mcpTools: [],
                            toolPermissions: {},
                            llmConfig: {
                                provider: 'openai',
                                model: 'gpt-4',
                                systemPrompt: `You are a ${role.name} with expertise in ${role.expertise.join(', ')}. Your responsibility: ${role.responsibility}. When given coordination tasks, provide actual deliverables and build upon other agents' work to create integrated results.`,
                                temperature: 0.7
                            }
                        });
                        await this._agentService.startAgent(agent.id);
                        agentIds.push(agent.id);
                        console.log(`✅ Created ${role.name}:`, agent.id);
                    }
                    // Start coordination with publishing paths
                    const publishPaths = [
                        `worldtree://public/coordination_results/${coordinationPlan.coordination_type}`,
                        `worldtree://public/projects/${Date.now()}_${coordinationPlan.coordination_type}`
                    ];
                    const sessionId = await this._coordinationService.startCoordination({
                        coordinatorId: coordinator.id,
                        scenarioPrompt: `${args.request}\n\nCoordination Structure:\n- Type: ${coordinationPlan.coordination_type}\n- Flow: ${coordinationPlan.collaboration_flow}\n- Goal: ${coordinationPlan.final_deliverable}\n\nEach agent should contribute according to their expertise and build upon others' work.`,
                        participantIds: agentIds,
                        timeoutMinutes: args.timeout_minutes || 20,
                        coordinationStyle: args.collaboration_style || 'collaborative',
                        publishTo: publishPaths
                    });
                    return {
                        session_id: sessionId,
                        coordinator_id: coordinator.id,
                        agent_ids: agentIds,
                        coordination_plan: coordinationPlan,
                        status: 'coordination_started',
                        message: `� **Natural Language Coordination Started**

**Request:** ${args.request}

**Coordination Type:** ${coordinationPlan.coordination_type}

**Team Structure:**
${rolesToCreate.map((role, i) => `- **${role.name}** (\`${agentIds[i]}\`) - ${role.responsibility}`).join('\n')}

**Collaboration Flow:** ${coordinationPlan.collaboration_flow}

**Expected Deliverable:** ${coordinationPlan.final_deliverable}

**Session:** \`${sessionId}\`

Use \`get_coordination_session\` to monitor progress.`,
                        timeout_minutes: args.timeout_minutes || 20
                    };
                }
                catch (error) {
                    console.error('❌ Natural language coordination error:', error);
                    return {
                        error: `❌ Failed to start coordination project: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'list_coordinators':
                try {
                    const coordinators = await this._coordinationService.listCoordinators();
                    const filteredCoordinators = args.status
                        ? coordinators.filter(coordinator => coordinator.status === args.status)
                        : coordinators;
                    return {
                        coordinators: filteredCoordinators.map(coordinator => ({
                            id: coordinator.id,
                            name: coordinator.name,
                            description: coordinator.description,
                            status: coordinator.status,
                            coordination_style: coordinator.coordination.coordinationStyle,
                            max_participants: coordinator.coordination.maxParticipants,
                            active_scenarios: coordinator.activeScenarios?.length || 0,
                            current_participants: coordinator.currentParticipants?.length || 0
                        })),
                        total_count: filteredCoordinators.length
                    };
                }
                catch (error) {
                    console.error('❌ List coordinators error:', error);
                    return {
                        error: `❌ Failed to list coordinators: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'get_coordinator':
                try {
                    const coordinator = await this._coordinationService.getCoordinator(args.coordinator_id);
                    if (!coordinator) {
                        return {
                            error: `❌ Coordinator not found: ${args.coordinator_id}`
                        };
                    }
                    return {
                        id: coordinator.id,
                        name: coordinator.name,
                        description: coordinator.description,
                        status: coordinator.status,
                        llm_config: {
                            provider: coordinator.llmConfig.provider,
                            model: coordinator.llmConfig.model,
                            temperature: coordinator.llmConfig.temperature
                        },
                        coordination: {
                            style: coordinator.coordination.coordinationStyle,
                            max_participants: coordinator.coordination.maxParticipants,
                            max_concurrent_scenarios: coordinator.coordination.maxConcurrentScenarios,
                            supported_scenario_types: coordinator.coordination.supportedScenarioTypes,
                            decision_making: coordinator.coordination.decisionMaking
                        },
                        active_scenarios: coordinator.activeScenarios,
                        current_participants: coordinator.currentParticipants,
                        mcp_tools: coordinator.mcpTools,
                        created_at: coordinator.createdAt,
                        updated_at: coordinator.updatedAt
                    };
                }
                catch (error) {
                    console.error('❌ Get coordinator error:', error);
                    return {
                        error: `❌ Failed to get coordinator: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            case 'create_coordinator':
                try {
                    const coordinator = await this._coordinationService.createCoordinator({
                        name: args.name,
                        description: args.description,
                        llmConfig: {
                            provider: 'openai',
                            model: 'gpt-4',
                            systemPrompt: 'You are a coordination specialist responsible for managing multi-agent collaborations. Your role is to analyze scenarios, delegate tasks effectively to participant agents, and synthesize their contributions into comprehensive solutions.',
                            temperature: 0.7
                        },
                        mcpTools: ['coordination-tools', 'result-publisher'],
                        toolPermissions: {
                            'coordination-tools': {
                                operations: ['read', 'write', 'execute'],
                                quotas: { maxRequestsPerMinute: 100 }
                            },
                            'result-publisher': {
                                operations: ['write', 'execute'],
                                quotas: { maxRequestsPerMinute: 20 }
                            }
                        },
                        coordination: {
                            maxParticipants: args.max_participants || 10,
                            maxConcurrentScenarios: 3,
                            supportedScenarioTypes: ['collaboration', 'analysis', 'problem-solving'],
                            coordinationStyle: args.coordination_style || 'collaborative',
                            decisionMaking: 'consensus-seeking'
                        }
                    }, 'mcp-client');
                    return {
                        id: coordinator.id,
                        name: coordinator.name,
                        description: coordinator.description,
                        status: coordinator.status,
                        coordination_style: coordinator.coordination.coordinationStyle,
                        max_participants: coordinator.coordination.maxParticipants,
                        message: `✅ Coordinator '${coordinator.name}' created successfully`
                    };
                }
                catch (error) {
                    console.error('❌ Create coordinator error:', error);
                    return {
                        error: `❌ Failed to create coordinator: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            default:
                throw new Error(`Tool not found: ${name}`);
        }
    }
    /**
     * Process async agent request in background
     */
    async processAsyncRequest(requestId, agentId, message) {
        try {
            // Update status to processing
            await this._asyncResultManager.updateResultStatus(requestId, 'processing');
            // Execute agent prompt using existing agent service
            const agent = await this._agentService.getAgent(agentId);
            if (!agent) {
                await this._asyncResultManager.failAsyncRequest(requestId, `Agent not found: ${agentId}`);
                return;
            }
            // Create execution request structure
            const executionRequest = {
                prompt: message,
                conversationContext: undefined
            };
            // Execute the agent prompt
            const result = await this._agentService.executeAgentPrompt(agentId, executionRequest);
            // Complete the async request with the result
            await this._asyncResultManager.completeAsyncRequest(requestId, result);
            console.log(`✅ Completed async processing for request ${requestId}`);
        }
        catch (error) {
            console.error(`❌ Error in async processing for request ${requestId}:`, error);
            await this._asyncResultManager.failAsyncRequest(requestId, error instanceof Error ? error.message : 'Unknown error');
        }
    }
    /**
     * Intelligent detection of when to use async mode
     * Based on message complexity, expected processing time, and agent capabilities
     */
    shouldUseAsyncMode(message, agent, args) {
        // 🧠 SMART ASYNC DETECTION LOGIC
        // 1. Message length heuristics
        if (message.length > 500) {
            console.log(`📏 Long message detected (${message.length} chars) - using async`);
            return true;
        }
        // 2. Complex task keywords that typically take longer
        const complexKeywords = [
            'write', 'create', 'generate', 'develop', 'design', 'analyze', 'research',
            'story', 'article', 'essay', 'report', 'plan', 'strategy', 'proposal',
            'code', 'program', 'script', 'algorithm', 'documentation',
            'explain in detail', 'comprehensive', 'thorough', 'step by step'
        ];
        const messageWords = message.toLowerCase();
        const hasComplexKeywords = complexKeywords.some(keyword => messageWords.includes(keyword));
        if (hasComplexKeywords) {
            console.log(`🔍 Complex task detected - using async`);
            return true;
        }
        // 3. Agent type considerations (some agents are naturally slower)
        // Only check if agent is available
        if (agent && (agent.type === 'gaia' || agent.type === 'worldtree')) {
            console.log(`🌍 High-capacity agent type (${agent.type}) - using async`);
            return true;
        }
        // 4. Multiple context or collaboration scenarios
        if (args.conversation_context && args.conversation_context.length > 200) {
            console.log(`💬 Large conversation context - using async`);
            return true;
        }
        // 5. Force async for desktop agents (based on user agent or session info)
        // This can be enhanced with actual client detection
        if (args.force_async === true) {
            console.log(`🖥️ Force async requested - using async`);
            return true;
        }
        // Default to sync for simple, short messages
        console.log(`⚡ Simple task detected - using sync`);
        return false;
    }
    async handleResourceRead(params) {
        const { uri } = params;
        switch (uri) {
            case 'druids://agents':
                try {
                    // For now, return mock data since listAgents might have issues
                    const agents = [
                        { id: 'agent-1', name: 'Forest Guardian', type: 'druid', status: 'active' }
                    ];
                    return {
                        contents: [
                            {
                                uri: 'druids://agents',
                                mimeType: 'application/json',
                                text: JSON.stringify({
                                    agents: agents.map((r) => ({
                                        id: r.id,
                                        name: r.name,
                                        type: r.type,
                                        status: r.status
                                    }))
                                }, null, 2)
                            }
                        ]
                    };
                }
                catch (error) {
                    throw new Error(`Failed to read agents: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            case 'druids://realms':
                try {
                    const realms = [
                        { id: 'forest-realm', name: 'Ancient Forest', type: 'forest', agents: 0, capacity: 10 }
                    ];
                    return {
                        contents: [
                            {
                                uri: 'druids://realms',
                                mimeType: 'application/json',
                                text: JSON.stringify({
                                    realms: realms.map((r) => ({
                                        id: r.id,
                                        name: r.name,
                                        type: r.type,
                                        agentCount: r.agents,
                                        capacity: r.capacity
                                    }))
                                }, null, 2)
                            }
                        ]
                    };
                }
                catch (error) {
                    throw new Error(`Failed to read realms: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            default:
                throw new Error(`Resource not found: ${uri}`);
        }
    }
    sendSuccess(res, result, id) {
        const response = {
            jsonrpc: '2.0',
            result,
            id
        };
        res.json(response);
    }
    sendError(res, code, message, id) {
        const response = {
            jsonrpc: '2.0',
            error: { code, message },
            id
        };
        res.status(200).json(response); // MCP uses 200 for JSON-RPC errors
    }
    /**
     * Assign an agent to a realm
     */
    async assignAgentToRealm(agentId, realmIdOrName) {
        console.log(`🔗 Assigning agent ${agentId} to realm ${realmIdOrName}`);
        // First, find any existing realm assignments for this agent
        const allRealms = await this._realmService.getRealms();
        const currentRealm = allRealms.find(realm => realm.agentBindings?.some((binding) => binding.agentId === agentId));
        // Find the target realm by ID or name
        let targetRealm;
        console.log(`🔍 Looking for realm: ${realmIdOrName}`);
        // First try by ID
        console.log(`🔍 Trying to get realm by ID: ${realmIdOrName}`);
        targetRealm = await this._realmService.getRealm(realmIdOrName);
        console.log(`🔍 getRealm result:`, targetRealm ? { id: targetRealm.id, name: targetRealm.name } : 'null');
        // If not found by ID, try to find by name
        if (!targetRealm) {
            console.log(`🔍 Realm not found by ID, searching by name: ${realmIdOrName}`);
            console.log(`🔍 Found ${allRealms.length} realms:`, allRealms.map(r => ({ id: r.id, name: r.name })));
            targetRealm = allRealms.find(r => r.name.toLowerCase() === realmIdOrName.toLowerCase());
            console.log(`🔍 Target realm found:`, targetRealm ? { id: targetRealm.id, name: targetRealm.name } : 'null');
            if (!targetRealm) {
                throw new Error(`Realm not found: ${realmIdOrName}`);
            }
        }
        // Check if agent is already in the target realm
        if (currentRealm && currentRealm.id === targetRealm.id) {
            console.log(`ℹ️ Agent ${agentId} already assigned to realm ${targetRealm.name}`);
            return;
        }
        // Remove agent from current realm if it exists
        if (currentRealm) {
            console.log(`🔄 Moving agent ${agentId} from realm ${currentRealm.name} to ${targetRealm.name}`);
            // Remove the agent binding from the current realm
            const updatedBindings = currentRealm.agentBindings?.filter((binding) => binding.agentId !== agentId) || [];
            await this._realmService.updateRealm(currentRealm.id, {
                agentBindings: updatedBindings
            });
            console.log(`✅ Agent ${agentId} removed from realm ${currentRealm.name}`);
        }
        // Add agent to the target realm
        if (!targetRealm.agentBindings) {
            targetRealm.agentBindings = [];
        }
        // Add the agent binding
        targetRealm.agentBindings.push({
            agentId: agentId,
            permissions: ['basic_access'],
            status: 'active',
            assignedAt: Date.now().toString()
        });
        // Update the target realm
        await this._realmService.updateRealm(targetRealm.id, {
            agentBindings: targetRealm.agentBindings
        });
        console.log(`✅ Agent ${agentId} successfully assigned to realm ${targetRealm.name}`);
    }
    start() {
        return new Promise((resolve) => {
            this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`✅ MCP Server running on http://0.0.0.0:${this.port}/mcp`);
                resolve();
            });
        });
    }
    stop() {
        // Cleanup sessions
        this.sessions.clear();
        console.log('🛑 MCP Server stopped');
    }
    // Helper methods for natural language interface
    getOptimalTeamSize(purpose) {
        const purposeLower = purpose.toLowerCase();
        if (purposeLower.includes('content') || purposeLower.includes('writing')) {
            return 3; // writer, editor, reviewer
        }
        else if (purposeLower.includes('analysis') || purposeLower.includes('research')) {
            return 2; // researcher, analyst
        }
        else if (purposeLower.includes('development') || purposeLower.includes('coding')) {
            return 4; // developer, tester, reviewer, documentation
        }
        else if (purposeLower.includes('support') || purposeLower.includes('customer')) {
            return 2; // primary, escalation
        }
        else {
            return 3; // default balanced team
        }
    }
    getAgentTypesForPurpose(purpose) {
        const purposeLower = purpose.toLowerCase();
        if (purposeLower.includes('content') || purposeLower.includes('writing')) {
            return ['druid', 'elemental', 'gaia']; // creative, structured, natural
        }
        else if (purposeLower.includes('analysis') || purposeLower.includes('research')) {
            return ['worldtree', 'druid']; // analytical, investigative
        }
        else if (purposeLower.includes('development') || purposeLower.includes('coding')) {
            return ['worldtree', 'elemental']; // systematic, precise
        }
        else if (purposeLower.includes('support') || purposeLower.includes('customer')) {
            return ['gaia', 'druid']; // empathetic, wise
        }
        else {
            return ['druid', 'elemental', 'gaia']; // balanced mix
        }
    }
    getCapabilitiesForType(agentType) {
        switch (agentType) {
            case 'druid':
                return ['wisdom', 'guidance', 'problem-solving', 'communication', 'coordination', 'strategic-planning'];
            case 'elemental':
                return ['precision', 'structure', 'analysis', 'execution', 'task-execution', 'data-processing'];
            case 'gaia':
                return ['empathy', 'nurturing', 'collaboration', 'harmony', 'coordination'];
            case 'worldtree':
                return ['knowledge', 'connection', 'synthesis', 'insight', 'coordination', 'communication'];
            default:
                return ['general', 'assistance', 'communication', 'coordination'];
        }
    }
}
exports.SimpleMCPServer = SimpleMCPServer;
exports.default = SimpleMCPServer;
