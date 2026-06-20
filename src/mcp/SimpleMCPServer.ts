import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { CoordinationService } from '../services/CoordinationService';
import ServiceContainer from '../services/ServiceContainer';
import {
  WORLDTREE_TOOL_DEFINITIONS,
  WORLDTREE_TOOL_NAMES,
  createWorldTreeToolHandlers,
  type WorldTreeToolHandler,
} from './worldtree/worldtreeTools';
import {
  WORLDTREE_RESOURCE_DEFINITIONS,
  readWorldTreeResource,
} from './worldtree/worldtreeResources';
import {
  WORLDTREE_PROMPT_DEFINITIONS,
  getWorldTreePrompt,
} from './worldtree/worldtreePrompts';

/**
 * Simplified MCP-compliant server for external clients
 * FULLY COMPLIANT with MCP specification using JSON-RPC 2.0 and SSE
 * Uses HTTP API calls instead of direct database access
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number | null;
}

interface Session {
  id: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  initialized: boolean;
  createdAt: Date;
  lastActivity: Date;
}

export class SimpleMCPServer {
  private app: express.Application;
  private port: number;
  private sessions: Map<string, Session> = new Map();
  private mainAppUrl: string;
  private coordinationService: CoordinationService | null = null;
  private worldTreeToolHandlers: Record<string, WorldTreeToolHandler> | null = null;

  constructor(
    port: number = 3003,
    mainAppUrl: string = 'http://druids-main:3000'
  ) {
    this.app = express();
    this.port = port;
    this.mainAppUrl = mainAppUrl;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  // HTTP API client methods
  private async apiCall(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: any): Promise<any> {
    try {
      // Handle endpoints that already start with /api to avoid double prefix
      const cleanEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
      const url = `${this.mainAppUrl}${cleanEndpoint}`;
      
      const response = await axios({
        method,
        url,
        data,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error: any) {
      console.error(`API call failed: ${method} ${endpoint}`, error.message);
      throw error;
    }
  }

  private getCoordinationService(): CoordinationService {
    if (!this.coordinationService) {
      const serviceContainer = ServiceContainer.getInstance();
      this.coordinationService = serviceContainer.getCoordinationService();
    }
    return this.coordinationService;
  }

  // WorldTree discovery tool handlers, bound to this server's HTTP apiCall.
  private getWorldTreeToolHandlers(): Record<string, WorldTreeToolHandler> {
    if (!this.worldTreeToolHandlers) {
      this.worldTreeToolHandlers = createWorldTreeToolHandlers(this.apiCall.bind(this));
    }
    return this.worldTreeToolHandlers;
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Origin'],
      exposedHeaders: ['Mcp-Session-Id']
    }));

    // Custom JSON parser that handles mixed content types like "application/json, text/event-stream"
    this.app.use(express.json({
      limit: '10mb',
      type: (req: any) => {
        const contentType = req.get('Content-Type') || req.headers['content-type'] || '';
        return contentType.includes('application/json');
      }
    }));

    this.app.use(express.text());

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`📥 Request: ${req.method} ${req.path}`);
      console.log(`📡 Host: ${req.get('host')}`);
      return next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint (non-MCP)
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Root redirect 
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({ 
        message: 'MCP Server',
        protocol: 'Model Context Protocol v2025-06-18',
        endpoint: '/mcp'
      });
    });

    // Main MCP endpoint - FULLY COMPLIANT with streamable HTTP
    this.app.post('/mcp', this.handleMCPRequest.bind(this));
    this.app.get('/mcp', this.handleMCPGetRequest.bind(this));
  }

  /**
   * Handle MCP GET requests for streamable HTTP transport
   * According to MCP 2025-06-18 spec: "The client MAY issue an HTTP GET to the MCP endpoint"
   */
  private async handleMCPGetRequest(req: Request, res: Response): Promise<void> {
    try {
      console.log('[MCP] GET request received');
      
      // Check Accept header for SSE support
      const acceptHeader = req.headers.accept || '';
      if (acceptHeader.includes('text/event-stream')) {
        // Return SSE stream for bidirectional communication
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id'
        });
        
        // Send initial connection event
        res.write('data: {"jsonrpc":"2.0","method":"connection","params":{"status":"connected"}}\n\n');
        
        // Keep connection alive
        const keepAlive = setInterval(() => {
          res.write('data: {"jsonrpc":"2.0","method":"ping","params":{}}\n\n');
        }, 30000);
        
        // Handle client disconnect
        req.on('close', () => {
          clearInterval(keepAlive);
          console.log('[MCP] SSE connection closed');
        });
        
      } else {
        // Return basic endpoint information
        res.json({
          mcp: {
            version: '2025-06-18',
            transport: 'streamable-http',
            endpoints: {
              post: '/mcp',
              get: '/mcp'
            }
          }
        });
      }
    } catch (error) {
      console.error('[MCP] GET request error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async handleMCPRequest(req: Request, res: Response): Promise<void> {
    try {
      console.log('🔍 MCP Request Details:');
      console.log(`   Method: ${req.method}`);
      console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
      console.log(`   Content-Type: ${req.get('Content-Type')}`);
      console.log(`   Accept: ${req.get('Accept')}`);
      console.log(`   Body:`, JSON.stringify(req.body, null, 2));

      // Streamable HTTP spec validation: Accept header must include both application/json and text/event-stream
      const acceptHeader = req.get('Accept') || '';
      const contentType = req.get('Content-Type') || '';
      
      // Check if client supports both required content types for streamable HTTP
      const supportsJson = acceptHeader.includes('application/json');
      const supportsSSE = acceptHeader.includes('text/event-stream');
      
      if (!supportsJson && !supportsSSE) {
        console.log('❌ Invalid Accept header - must support application/json and/or text/event-stream');
        return this.sendError(res, -32600, 'Invalid Accept header. Must support application/json and/or text/event-stream', null);
      }
      
      // Prefer SSE if client supports it (streamable HTTP spec)
      const isSSERequest = supportsSSE;
      
      console.log(`   Accept Header: ${acceptHeader}`);
      console.log(`   Supports JSON: ${supportsJson}, Supports SSE: ${supportsSSE}`);
      console.log(`   Using SSE: ${isSSERequest}`);

      // More flexible Content-Type validation for MCP clients
      if (!req.is('application/json') && !contentType.includes('application/json')) {
        console.log('❌ Invalid Content-Type');
        return this.sendError(res, -32600, 'Invalid Content-Type. Must be application/json', null);
      }

      // More flexible MCP header validation
      const protocolVersion = req.get('MCP-Protocol-Version');
      if (!protocolVersion) {
        console.log('⚠️ Missing MCP-Protocol-Version header, allowing anyway');
      } else if (protocolVersion !== '2025-06-18') {
        console.log(`⚠️ Protocol version mismatch: ${protocolVersion}, allowing anyway`);
      }

      // Parse JSON-RPC request
      let message: JsonRpcRequest;
      try {
        message = req.body;
        console.log(`   Parsed Message:`, JSON.stringify(message, null, 2));
        if (!message || message.jsonrpc !== '2.0' || !message.method) {
          console.log('❌ Invalid JSON-RPC 2.0 request structure');
          return this.sendError(res, -32600, 'Invalid JSON-RPC 2.0 request', message?.id !== undefined ? message.id : null);
        }
      } catch (error) {
        console.log('❌ JSON parse error:', error);
        return this.sendError(res, -32700, 'Parse error', null);
      }

      // Handle session management
      let sessionId = req.get('mcp-session-id') || req.get('Mcp-Session-Id');
      console.log(`   Session ID: ${sessionId || 'none'}`);
      if (!sessionId && message.method !== 'initialize') {
        console.log('❌ Session not initialized');
        return this.sendError(res, -32001, 'Session not initialized. Call initialize first.', message.id !== undefined ? message.id : null);
      }

      if (message.method === 'initialize') {
        sessionId = this.createSession(message.params?.clientInfo);
        res.set('Mcp-Session-Id', sessionId);
        console.log(`✅ Created new session: ${sessionId}`);
      } else if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
          console.log('❌ Invalid session ID');
          return this.sendError(res, -32001, 'Invalid session ID', message.id !== undefined ? message.id : null);
        }
        session.lastActivity = new Date();
      }

      // Handle notifications vs requests according to streamable HTTP spec
      const isNotification = message.id === undefined;
      
      if (isNotification) {
        console.log('🔔 Handling as notification');
        // For notifications: process and return 202 Accepted with no body
        await this.handleMethod(message, sessionId);
        res.status(202).end(); // 202 Accepted for notifications
        return;
      }

      // For requests: Handle SSE vs regular JSON response
      if (isSSERequest) {
        console.log('🌊 Handling as SSE request');
        return this.handleSSEResponse(req, res, message, sessionId);
      } else {
        console.log('📄 Handling as JSON request');
        // Route to method handlers
        const result = await this.handleMethod(message, sessionId);
        this.sendSuccess(res, result, message.id!);
      }

    } catch (error) {
      console.error('MCP Request Error:', error);
      this.sendError(res, -32603, 'Internal error', null);
    }
  }

  private async handleSSEResponse(_req: Request, res: Response, message: JsonRpcRequest, sessionId?: string): Promise<void> {
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
      const response: any = {
        jsonrpc: '2.0',
        result
      };
      
      // Only include ID if the request had one (not a notification)
      if (message.id !== undefined) {
        response.id = message.id;
      }
      
      console.log('📤 Sending SSE response:', JSON.stringify(response, null, 2));
      
      // Validate JSON serializability before sending
      try {
        const serializedResponse = JSON.stringify(response);
        res.write(`data: ${serializedResponse}\n\n`);
      } catch (serializationError) {
        console.error('❌ JSON Serialization Error:', serializationError);
        console.error('❌ Failed to serialize object:', response);
        
        // Send a safe error response
        const safeErrorResponse: any = {
          jsonrpc: '2.0',
          error: { 
            code: -32603, 
            message: 'Serialization error in response',
            data: { originalError: String(serializationError) }
          }
        };
        
        // Only include ID if the request had one (not a notification)
        if (message.id !== undefined) {
          safeErrorResponse.id = message.id;
        }
        res.write(`data: ${JSON.stringify(safeErrorResponse)}\n\n`);
      }
      
      res.end();
      
      console.log('✅ SSE response sent');
    } catch (error) {
      console.error('❌ SSE response error:', error);
      
      const errorResponse: any = {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' }
      };
      
      // Only include ID if the request had one (not a notification)
      if (message.id !== undefined) {
        errorResponse.id = message.id;
      }
      
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }

  private createSession(clientInfo?: any): string {
    const sessionId = uuidv4();
    const session: Session = {
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

  private cleanupSessions(): void {
    const now = new Date();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > maxAge) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private async handleMethod(message: JsonRpcRequest, _sessionId?: string): Promise<any> {
    switch (message.method) {
      case 'initialize':
        return {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false }
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
              name: 'start_orchestrated_coordination',
              description: 'Start orchestrated coordination that breaks complex scenarios into atomic steps with content sharing between steps',
              inputSchema: {
                type: 'object',
                properties: {
                  coordinator_id: {
                    type: 'string',
                    description: 'ID of the coordinator agent to manage the collaboration (optional, will use built-in coordinator if not specified)'
                  },
                  scenario_prompt: {
                    type: 'string',
                    description: 'The complex scenario to break down into atomic steps'
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
                required: ['scenario_prompt']
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
            },
            {
              name: 'travel_to_realm',
              description: 'Travel to a specific realm (requires realm access permissions in agent profile)',
              inputSchema: {
                type: 'object',
                properties: {
                  agent_id: {
                    type: 'string',
                    description: 'ID of the agent requesting to travel'
                  },
                  target_realm_id: {
                    type: 'string',
                    description: 'ID of the realm to travel to'
                  }
                },
                required: ['agent_id', 'target_realm_id']
              }
            },
            {
              name: 'get_current_realm',
              description: 'Get the current realm location of an agent',
              inputSchema: {
                type: 'object',
                properties: {
                  agent_id: {
                    type: 'string',
                    description: 'ID of the agent to check location for'
                  }
                },
                required: ['agent_id']
              }
            },
            {
              name: 'get_elementals_in_realm',
              description: 'Get all elemental agents bound to a specific realm',
              inputSchema: {
                type: 'object',
                properties: {
                  realm_id: {
                    type: 'string',
                    description: 'ID of the realm to check for elementals'
                  }
                },
                required: ['realm_id']
              }
            },
            {
              name: 'interact_with_agent',
              description: 'Send a message/task to another agent for collaboration (realm-aware)',
              inputSchema: {
                type: 'object',
                properties: {
                  from_agent_id: {
                    type: 'string',
                    description: 'ID of the agent sending the message'
                  },
                  to_agent_id: {
                    type: 'string',
                    description: 'ID of the target agent (usually an elemental)'
                  },
                  message: {
                    type: 'string',
                    description: 'The message or task to send to the target agent'
                  },
                  task_type: {
                    type: 'string',
                    description: 'Type of collaboration task (optional)'
                  }
                },
                required: ['from_agent_id', 'to_agent_id', 'message']
              }
            },
            {
              name: 'get_coordination_status',
              description: 'Get the current status and details of a coordination session',
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
              name: 'list_active_sessions',
              description: 'List all currently active coordination sessions',
              inputSchema: {
                type: 'object',
                properties: {
                  coordinator_id: {
                    type: 'string',
                    description: 'Filter by specific coordinator (optional)'
                  }
                },
                required: []
              }
            },
            {
              name: 'get_coordinator_metrics',
              description: 'Get concurrency metrics and active session information for coordinators',
              inputSchema: {
                type: 'object',
                properties: {
                  coordinator_id: {
                    type: 'string',
                    description: 'ID of the coordinator to get metrics for'
                  }
                },
                required: ['coordinator_id']
              }
            },
            {
              name: 'get_session_content',
              description: 'Get published content from a coordination session',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: {
                    type: 'string',
                    description: 'ID of the coordination session'
                  }
                },
                required: ['session_id']
              }
            },
            {
              name: 'get_content_details',
              description: 'Get detailed information about a specific piece of content',
              inputSchema: {
                type: 'object',
                properties: {
                  content_id: {
                    type: 'string',
                    description: 'ID of the content to retrieve'
                  }
                },
                required: ['content_id']
              }
            },
            // Read-only WorldTree discovery tools (Phase A)
            ...WORLDTREE_TOOL_DEFINITIONS
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
        } catch (error) {
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
            },
            // Read-only WorldTree discovery resources (Phase A)
            ...WORLDTREE_RESOURCE_DEFINITIONS
          ]
        };

      case 'resources/read':
        return await this.handleResourceRead(message.params);

      case 'prompts/list':
        return { prompts: WORLDTREE_PROMPT_DEFINITIONS };

      case 'prompts/get': {
        const { name, arguments: promptArgs } = message.params ?? {};
        const prompt = getWorldTreePrompt(name, promptArgs ?? {});
        if (!prompt) {
          throw new Error(`Prompt not found: ${name}`);
        }
        return prompt;
      }

      case 'notifications/initialized':
        // MCP protocol notification - client confirms initialization
        console.log('🔔 Client initialization confirmed');
        return {}; // Empty response for notification

      default:
        throw new Error(`Method not found: ${message.method}`);
    }
  }

  private async handleToolCall(params: any): Promise<any> {
    const { name, arguments: args } = params;
    
    console.log(`🔧 Handling tool call: ${name}`, JSON.stringify(args, null, 2));

    switch (name) {
      case 'agent_create':
        try {
          const agent = await this.apiCall('/api/agents/create', 'POST', {
            name: args.name,
            type: args.type,
            description: args.description || '',
            domain: args.domain || 'general',
            systemPrompt: 'You are a helpful AI assistant.',
            capabilities: ['communication', 'task_execution'],
            expertise: [`${args.type}_mastery`, 'environmental_awareness'],
            knowledgeNamespaces: [`${args.domain || 'general'}_knowledge`],
            maxConcurrentTasks: 10,
            personalityTraits: ['wise', 'protective', 'nature_connected'],
            communicationStyle: 'formal',
            decisionMaking: 'intuitive'
          });

          // If realm is specified, assign the agent to that realm
          if (args.realm) {
            try {
              await this.assignAgentToRealm(agent.id, args.realm);
            } catch (realmError) {
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
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create agent'
          };
        }

      case 'realm_list':
        try {
          // Safely extract and validate filters
          const filters: { [key: string]: any } = {
            type: args.type || undefined,
            status: args.status || undefined
          };
          
          // Clean up undefined values to avoid serialization issues
          Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);
          
          console.log('🔧 Realm list filters:', JSON.stringify(filters));
          
          const realmsResponse = await this.apiCall('/api/realms', 'GET');
          const realms = realmsResponse.data || realmsResponse; // Handle both {data: []} and [] formats
          
          const filteredRealms = realms.map((realm: any) => ({
            id: realm.id,
            name: realm.name,
            type: realm.type || realm.environment?.type,
            agentCount: realm.agentBindings?.length || 0,
            capacity: realm.capacity,
            status: realm.status,
            description: realm.description
          })).filter((realm: any) => {
            return (!filters['type'] || realm.type === filters['type']) &&
                   (!filters['status'] || realm.status === filters['status']);
          });

          // Return just the realms array - MCP tools should return simple data
          const result = filteredRealms;
          
          // Validate result is serializable
          console.log('🔧 Realm list result:', JSON.stringify(result, null, 2));
          
          return result;
        } catch (error) {
          console.error('❌ Realm service error:', error);
          throw new Error(error instanceof Error ? error.message : 'Failed to list realms');
        }

      case 'agent_list':
        try {
          console.log('🔍 DEBUG: agent_list called, using HTTP API...');
          
          const filters = {
            type: args.type,
            status: args.status
          };
          
          // Build query string for filters
          const queryParams = new URLSearchParams();
          if (filters.type) queryParams.append('type', filters.type);
          if (filters.status) queryParams.append('status', filters.status);
          const queryString = queryParams.toString();
          const endpoint = queryString ? `/api/agents?${queryString}` : '/api/agents';
          
          let agents = await this.apiCall(endpoint);
          
          console.log('🔍 DEBUG: API returned', agents.length, 'agents');
          console.log('🔍 DEBUG: First 3 agent names:', agents.slice(0, 3).map((a: any) => a.name));
          
          // If realm filter is specified, filter agents by realm assignment
          if (args.realm) {
            console.log(`🔍 Filtering agents by realm: ${args.realm}`);
            
            // Get all realms to match by name if needed
            const realmsResponse = await this.apiCall('/api/realms');
            const allRealms = realmsResponse.data || realmsResponse;
            
            let targetRealm;
            try {
              targetRealm = await this.apiCall(`/api/realms/${args.realm}`);
            } catch {
              targetRealm = allRealms.find((r: any) => r.name.toLowerCase() === args.realm.toLowerCase());
            }
            
            if (targetRealm) {
              const realmId = targetRealm.id;
              agents = agents.filter((agent: any) => 
                agent.realmAccess?.boundRealmId === realmId ||
                agent.realmAccess?.accessibleRealms?.includes(realmId)
              );
              console.log(`🔍 Found ${agents.length} agents in realm ${args.realm}`);
            } else {
              console.log(`⚠️ Realm ${args.realm} not found`);
              agents = [];
            }
          }
          
          const formattedAgents = agents.map((agent: any) => ({
            id: agent.id,
            name: agent.name,
            type: agent.type,
            status: agent.status,
            specialization: agent.domain,
            description: agent.description
          }));

          // Return just the agents array - MCP tools should return simple data
          return formattedAgents;
        } catch (error) {
          console.error('❌ Agent service error:', error);
          throw new Error(error instanceof Error ? error.message : 'Failed to list agents');
        }

      case 'realm_create':
        try {
          const realm = await this.apiCall('/api/realms', 'POST', {
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
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create realm'
          };
        }

      case 'scenario_create':
        try {
          const scenario = await this.apiCall('/api/scenarios', 'POST', {
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
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create scenario'
          };
        }

      case 'scenario_list':
        try {
          const scenarios = await this.apiCall('/api/scenarios', 'GET');
          const formattedScenarios = scenarios.map((scenario: any) => ({
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
        } catch (error) {
          console.error('❌ Scenario service error:', error);
          throw new Error(error instanceof Error ? error.message : 'Failed to list scenarios');
        }

      case 'scenario_status':
        try {
          const scenario = await this.apiCall(`/api/scenarios/${args.scenarioId}`, 'GET');
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
        } catch (error) {
          console.error('❌ Scenario service error:', error);
          throw new Error(error instanceof Error ? error.message : 'Failed to get scenario status');
        }

      case 'scenario_execute':
        try {
          const executionResult = await this.apiCall(`/api/scenarios/${args.scenarioId}/execute`, 'POST', args.parameters || {});
          
          return {
            success: true,
            executionId: executionResult.executionId || executionResult.id,
            message: `Scenario ${args.scenarioId} execution started`,
            status: 'running'
          };
        } catch (error) {
          console.error('❌ Scenario execution error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to execute scenario'
          };
        }

      case 'execution_status':
        try {
          const execution = await this.apiCall(`/scenarios/executions/${args.executionId}`);
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
        } catch (error) {
          console.error('❌ Execution status error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get execution status'
          };
        }

      case 'agent_start':
        try {
          const agent = await this.apiCall(`/api/agents/${args.agentId}`);
          
          return {
            success: true,
            agent: {
              id: agent.id,
              name: agent.name,
              type: agent.type,
              status: agent.status
            }
          };
        } catch (error) {
          console.error('❌ Agent start error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start agent'
          };
        }

      case 'agent_execute':
        try {
          const result = await this.apiCall(`/api/agents/${args.agentId}/execute`, 'POST', {
            prompt: args.prompt,
            systemPrompt: args.systemPrompt,
            temperature: args.temperature
          });
          
          // Handle wrapped response structure
          const responseData = result.data || result;
          
          return {
            success: true,
            agentId: args.agentId,
            response: responseData.response,
            usage: responseData.usage,
            executionTime: responseData.executionTime
          };
        } catch (error) {
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
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to reassign agent'
          };
        }

      // Natural Language Interface Handlers
      case 'create_collaboration':
        try {
          // Ensure we have the required parameters
          const taskDescription = args.task_description || args.prompt || 'Untitled collaboration';
          const title = args.title || `Collaboration: ${taskDescription.substring(0, 50)}...`;
          
          // Check for specific agent names in the task description
          let requiredAgents: any[] = [];
          
          // Get all available agents to check for name matches
          const allAgents = await this.apiCall('/api/agents');
          const activeAgents = allAgents.filter((agent: any) => agent.status === 'active');
          
          // Parse task description for specific agent names
          const agentNameMatches = activeAgents.filter((agent: any) => {
            const agentName = agent.name.toLowerCase();
            const taskLower = taskDescription.toLowerCase();
            
            // Check for exact name matches (handle multi-word names like "Pierre Robert", "De Lint")
            return taskLower.includes(agentName) || 
                   agentName.split(' ').some((namePart: string) => 
                     namePart.length > 2 && taskLower.includes(namePart.toLowerCase())
                   );
          });
          
          if (agentNameMatches.length > 0) {
            // Use specific agents mentioned in the prompt
            console.log(`🎯 Found specific agents mentioned: ${agentNameMatches.map((a: any) => a.name).join(', ')}`);
            
            // Create agent requirements based on specific agents found
            requiredAgents = agentNameMatches.map((agent: any) => ({
              type: agent.type || 'any',
              count: 1,
              capabilities: [],
              specificAgentId: agent.id, // Add this field for direct assignment
              agentName: agent.name
            }));
          } else if (args.agent_types) {
            // Use agent types if specified
            requiredAgents = args.agent_types.map((type: string) => ({
              type,
              count: 1,
              capabilities: []
            }));
          } else {
            // Default: require at least one agent of any type if none specified
            requiredAgents = [{
              type: 'any',
              count: 2, // Default to 2 agents for collaboration
              capabilities: []
            }];
          }
          
          // Convert natural language request to scenario
          const scenario = await this.apiCall('/api/scenarios', 'POST', {
            name: title,
            description: taskDescription,
            type: 'collaboration',
            requiredAgents,
            phases: [{
              name: 'main_phase',
              description: taskDescription,
              dependencies: [],
              parallelExecution: true,
              continueOnTaskFailure: false,
              successCriteria: {
                minimumTasksSuccess: 1
              },
              tasks: [{
                id: 'main_task',
                name: 'Main Collaboration Task',
                description: taskDescription,
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

          // Scenarios are created as 'active' by default, no need to activate
          
          // Start execution immediately
          const executionResult = await this.apiCall(`/api/scenarios/${scenario.id}/execute`, 'POST', {});
          
          return {
            message: `✅ Collaboration started successfully!\n\n**Task:** ${args.task_description}\n**Collaboration ID:** ${scenario.id}\n**Execution ID:** ${executionResult.executionId || executionResult.id}\n\nUse 'get_collaboration_status' to check progress and get results.`
          };
        } catch (error) {
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
              selectedAgent = await this.apiCall(`/api/agents/${args.preferred_agent}`);
            } catch {
              // Fall back to auto-selection if preferred agent not found
              selectedAgent = null;
            }
          }
          
          if (!selectedAgent) {
            // Auto-select best agent
            const agents = await this.apiCall('/api/agents');
            const availableAgents = agents.filter((a: any) => a.status === 'active' || a.status === 'deployed');
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
          const result = await this.apiCall(`/api/agents/${selectedAgent.id}/execute`, 'POST', {
            prompt: fullPrompt
          });
          
          return {
            message: `✅ Task completed by agent **${selectedAgent.name}**\n\n**Task:** ${args.task}\n\n**Result:**\n${result.response}`
          };
        } catch (error) {
          console.error('❌ Assign task error:', error);
          return {
            error: `❌ Failed to assign task: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_collaboration_status':
        try {
          // Get recent scenarios and executions
          const [scenarios, executions] = await Promise.all([
            this.apiCall('/api/scenarios'),
            this.apiCall('/api/executions')
          ]);
          
          if (scenarios.length === 0 && executions.length === 0) {
            return {
              message: "ℹ️ No collaborations found. Use 'create_collaboration' to start one."
            };
          }

          let statusText = "📊 **Collaboration Status**\n\n";
          
          // Show running executions first
          const runningExecutions = executions.filter((exec: any) => 
            exec.status === 'running' || exec.status === 'starting'
          );
          
          if (runningExecutions.length > 0) {
            statusText += "🔄 **Active Executions:**\n";
            for (const execution of runningExecutions) {
              const executionId = execution.executionId || execution.id;
              const startedAt = execution.startedAt || execution.startTime;
              
              statusText += `\n**Execution ${executionId}**\n`;
              statusText += `- Scenario: ${execution.scenarioId}\n`;
              statusText += `- Status: ${execution.status}\n`;
              statusText += `- Started: ${startedAt}\n`;
              statusText += `- Participants: ${execution.participants?.length || execution.assignedAgents?.length || 0} agents\n`;
              
              if (execution.progress) {
                if (typeof execution.progress === 'number') {
                  statusText += `- Progress: ${execution.progress}%\n`;
                } else {
                  statusText += `- Progress: ${execution.progress.percentage}%\n`;
                  statusText += `- Current Phase: ${execution.progress.currentPhase}\n`;
                  if (execution.progress.estimatedTimeRemaining > 0) {
                    statusText += `- Est. Time Remaining: ${Math.round(execution.progress.estimatedTimeRemaining)} min\n`;
                  }
                }
              }
              
              if (args.show_details && execution.metrics) {
                statusText += `- Messages Exchanged: ${execution.metrics.messagesExchanged}\n`;
                statusText += `- Tasks Completed: ${execution.metrics.tasksCompleted}\n`;
                statusText += `- Errors: ${execution.metrics.errors}\n`;
              }
            }
            statusText += "\n";
          }
          
          // Show recent completed/failed executions
          const completedExecutions = executions.filter((exec: any) => 
            exec.status !== 'running' && exec.status !== 'starting'
          ).slice(-3); // Show last 3 completed (most recent)
          
          if (completedExecutions.length > 0) {
            statusText += "📋 **Recent Completed Executions:**\n";
            for (const execution of completedExecutions) {
              const executionId = execution.executionId || execution.id;
              const completedAt = execution.completedAt || execution.failedAt || execution.endTime;
              
              statusText += `\n**${executionId}** - ${execution.status.toUpperCase()}\n`;
              statusText += `- Scenario: ${execution.scenarioId}\n`;
              statusText += `- Completed: ${completedAt}\n`;
              
              if (execution.summary) {
                statusText += `- Duration: ${Math.round(execution.summary.totalDuration / 60)} min\n`;
                statusText += `- Success Rate: ${execution.summary.successfulTasks}/${execution.summary.successfulTasks + execution.summary.failedTasks}\n`;
              }
              
              // Show error if failed
              if (execution.status === 'failed' && execution.results?.error) {
                statusText += `- Error: ${execution.results.error}\n`;
              }
            }
            statusText += "\n";
          }
          
          // Show scenarios without showing too much detail unless requested
          if (args.show_details) {
            statusText += "📚 **Available Scenarios:**\n";
            for (const scenario of scenarios.slice(0, 5)) { // Limit to 5 most recent
              statusText += `\n**${scenario.name}**\n`;
              statusText += `- ID: ${scenario.id}\n`;
              statusText += `- Status: ${scenario.status}\n`;
              statusText += `- Type: ${scenario.type}\n`;
              statusText += `- Execution Count: ${scenario.usage?.executionCount || 0}\n`;
              statusText += `- Success Rate: ${scenario.usage?.executionCount > 0 ? Math.round((scenario.usage.successCount / scenario.usage.executionCount) * 100) : 0}%\n`;
            }
          }
          
          return {
            message: statusText
          };
        } catch (error) {
          console.error('❌ Get collaboration status error:', error);
          return {
            error: `❌ Failed to get collaboration status: ${error instanceof Error ? error.message : 'Unknown error'}`
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
            const agentType = agentTypes[i % agentTypes.length] as 'druid' | 'elemental' | 'gaia' | 'worldtree';
            const capabilities = this.getCapabilitiesForType(agentType);
            
            console.log(`🔨 Creating agent ${i + 1} of type ${agentType}`);
            
            const agent = await this.apiCall('/api/agents/create', 'POST', {
              name: `${args.team_purpose} Team Member ${i + 1}`,
              type: agentType,
              description: `Specialized ${agentType} for ${args.team_purpose}`,
              domain: args.team_purpose,
              systemPrompt: `You are a ${agentType} agent specialized in ${args.team_purpose}.`,
              capabilities: capabilities,
              expertise: capabilities,
              knowledgeNamespaces: [],
              maxConcurrentTasks: 3,
              personalityTraits: ['collaborative', 'focused', 'reliable'],
              communicationStyle: 'formal',
              decisionMaking: 'analytical'
            });
            console.log(`🔨 Created agent:`, { id: agent.id, name: agent.name, type: agent.type });
            
            // Activate the agent so it can participate in coordination
            try {
              console.log(`🔨 Activating agent ${agent.id}...`);
              const activatedAgent = await this.apiCall(`/api/agents/${agent.id}`);
              console.log(`🔨 Agent ${agent.id} activated with status: ${activatedAgent.status}`);
              createdAgents.push(activatedAgent);
            } catch (activationError) {
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
        } catch (error) {
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
            
            // Create async request via API
            const asyncRequestData = {
              agentId: args.agent_id,
              message: args.message,
              conversationContext: args.conversation_context
            };
            
            // Call async endpoint via main API
            const response = await this.apiCall('/api/async-requests', 'POST', asyncRequestData);
            
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
          } else {
            // Use synchronous mode for simple/quick requests
            console.log(`⚡ Using sync mode for agent ${args.agent_id}`);
            
            // Now fetch the agent for sync execution via API
            const agent = await this.apiCall(`/api/agents/${args.agent_id}`);
            
            // Add conversation context if provided
            let fullPrompt = args.message;
            if (args.conversation_context) {
              fullPrompt = `Previous conversation context: ${args.conversation_context}\n\nCurrent message: ${args.message}`;
            }
            
            // Execute agent prompt via API
            const executionData = {
              prompt: fullPrompt,
              temperature: 0.7
            };
            
            const result = await this.apiCall(`/api/agents/${args.agent_id}/execute`, 'POST', executionData);
            
            return {
              message: `🤖 **${agent.name}** responds:\n\n${result.data?.response || result.response || 'No response received'}`
            };
          }
        } catch (error) {
          console.error('❌ Ask agent error:', error);
          return {
            error: `❌ Failed to communicate with agent: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'activate_collaboration':
        try {
          // Just update the scenario status to active via PUT
          const activatedScenario = await this.apiCall(`/api/scenarios/${args.collaboration_id}`, 'PUT', {
            status: 'active'
          });
          
          return {
            message: `✅ Collaboration activated successfully!\n\n**Collaboration:** ${activatedScenario.name}\n**ID:** ${activatedScenario.id}\n**Status:** ${activatedScenario.status}\n\nYou can now execute this collaboration using 'scenario_execute' or start a new execution.`
          };
        } catch (error) {
          console.error('❌ Activate collaboration error:', error);
          return {
            error: `❌ Failed to activate collaboration: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'ask_agent_async':
        try {
          const asyncRequest = {
            agent_id: args.agent_id,
            message: args.message,
            conversation_context: args.conversation_context,
            force_async: true
          };
          
          const response = await this.apiCall('/api/async-requests', 'POST', asyncRequest);
          
          // Start background processing
          this.processAsyncRequest(response.requestId, args.agent_id, args.message);
          
          return {
            request_id: response.requestId,
            status: 'pending',
            estimated_duration: response.estimatedDuration,
            expires_at: response.expiresAt,
            message: `Async request started. Use get_async_result with request_id: ${response.requestId} to check status.`
          };
        } catch (error) {
          console.error('❌ Async agent request error:', error);
          return {
            error: `❌ Failed to start async request: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_async_result':
        try {
          const result = await this.apiCall(`/api/async-results/${args.request_id}`, 'GET');
          return result;
        } catch (error) {
          console.error('❌ Get async result error:', error);
          return {
            error: `❌ Failed to get async result: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'list_async_results':
        try {
          const agentId = args.agent_id || '';
          const results = await this.apiCall(`/api/async-results/agent/${agentId}`, 'GET');
          return {
            results: results.results || [],
            count: results.count || 0
          };
        } catch (error) {
          console.error('❌ List async results error:', error);
          return {
            error: `❌ Failed to list async results: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'check_async_ready':
        try {
          const result = await this.apiCall(`/api/async-results/${args.request_id}`, 'GET');
          
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
              duration: result.metadata?.actualDuration,
              message: `✅ Your request completed successfully!`
            };
          } else if (result.status === 'failed') {
            return {
              ready: true,
              status: 'failed',
              error: result.error,
              message: `❌ Your request failed: ${result.error}`
            };
          } else {
            // Still processing
            const waitTime = args.wait_time || 0;
            if (waitTime > 0) {
              // Wait a bit and check again
              await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 5000)));
              const updatedResult = await this.apiCall(`/api/async-results/${args.request_id}`, 'GET');
              
              if (updatedResult?.status === 'completed') {
                return {
                  ready: true,
                  status: 'completed',
                  result: updatedResult.result,
                  duration: updatedResult.metadata?.actualDuration,
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
        } catch (error) {
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
          
          const response = await this.apiCall(`/coordinators/${args.coordinator_id}/coordinate`, 'POST', {
            scenarioPrompt: args.scenario_prompt,
            participantIds: args.participant_ids,
            timeoutMinutes: args.timeout_minutes || 30,
            coordinationStyle: args.coordination_style || 'collaborative'
          });

          console.log('🔧 MCP DEBUG: Coordination started successfully, session:', response.sessionId);

          return {
            session_id: response.sessionId,
            status: 'coordination_started',
            message: `🎯 Coordination session ${response.sessionId} started successfully`,
            coordinator_id: args.coordinator_id,
            participant_count: args.participant_ids.length,
            timeout_minutes: args.timeout_minutes || 30,
            coordination_style: args.coordination_style || 'collaborative'
          };
        } catch (error) {
          console.error('❌ Start coordination error:', error);
          return {
            error: `❌ Failed to start coordination: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'start_orchestrated_coordination':
        try {
          console.log('🔧 MCP DEBUG: start_orchestrated_coordination called with:', {
            coordinator_id: args.coordinator_id,
            participant_ids: args.participant_ids,
            participant_count: args.participant_ids ? args.participant_ids.length : 0
          });
          
          // Use built-in coordinator if none specified
          const coordinatorId = args.coordinator_id || 'built-in-coordinator';
          
          // Auto-detect participants if none provided
          let participantIds = args.participant_ids;
          if (!participantIds || participantIds.length === 0) {
            try {
              const agentsResponse = await this.apiCall('/agents', 'GET');
              participantIds = agentsResponse.agents.map((agent: any) => agent.id);
              console.log(`🔧 Auto-detected ${participantIds.length} participant agents`);
            } catch (error) {
              console.error('Failed to auto-detect participants:', error);
              participantIds = [];
            }
          }
          
          const response = await this.apiCall(`/coordinators/${coordinatorId}/orchestrate`, 'POST', {
            scenarioPrompt: args.scenario_prompt,
            participantIds: participantIds,
            timeoutMinutes: args.timeout_minutes || 30,
            coordinationStyle: args.coordination_style || 'collaborative'
          });

          console.log('🔧 MCP DEBUG: Orchestrated coordination started successfully, session:', response.sessionId);

          return {
            session_id: response.sessionId,
            status: 'orchestration_started',
            message: `🎯 Orchestrated coordination session ${response.sessionId} started successfully`,
            coordinator_id: coordinatorId,
            participant_count: participantIds ? participantIds.length : 0,
            timeout_minutes: args.timeout_minutes || 30,
            coordination_style: args.coordination_style || 'collaborative'
          };
        } catch (error) {
          console.error('❌ Start orchestrated coordination error:', error);
          return {
            error: `❌ Failed to start orchestrated coordination: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_coordination_session':
        try {
          const session = await this.apiCall(`/coordinators/sessions/${args.session_id}`, 'GET');
          
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
            tasks_completed: session.participantTasks?.filter((task: any) => task.status === 'completed').length || 0,
            tasks_in_progress: session.participantTasks?.filter((task: any) => task.status === 'in_progress').length || 0,
            tasks_failed: session.participantTasks?.filter((task: any) => task.status === 'failed').length || 0,
            started_at: session.startedAt,
            final_result: session.finalResult,
            participant_tasks: session.participantTasks?.map((task: any) => ({
              agent_id: task.agentId,
              task: task.task,
              status: task.status,
              assigned_at: task.assignedAt,
              completed_at: task.completedAt,
              result: task.result
            }))
          };
        } catch (error) {
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
            try {
              const session = await this.apiCall(`/coordinators/sessions/${sessionId}`, 'GET');
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
            } catch (coordError) {
              console.log('No coordination session found for this ID');
            }
          }
          
          // If coordination not found, try scenario execution
          if (contentType === 'scenario_execution' || contentType === 'all') {
            // Check if this might be a scenario execution ID
            try {
              const execution = await this.apiCall(`/scenarios/executions/${sessionId}`);
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
            } catch (scenarioError) {
              console.log('No scenario execution found for session:', sessionId);
            }
          }
          
          return {
            error: `❌ No published content found for session: ${sessionId}`
          };
        } catch (error) {
          console.error('❌ Get published content error:', error);
          return {
            error: `❌ Failed to get published content: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'list_published_content':
        try {
          const contentType = args.content_type || 'all';
          const limit = args.limit || 20;
          const results: any[] = [];
          
          console.log(`📚 Listing published content, type: ${contentType}, limit: ${limit}`);
          
          // Get coordination sessions with published content
          if (contentType === 'coordination' || contentType === 'all') {
            try {
              // For now, we'll return an empty array since we don't have a list sessions endpoint
              // TODO: Add a list sessions endpoint to the coordinators API
              console.log('Coordination sessions listing not yet implemented via HTTP API');
            } catch (coordError) {
              console.log('No coordination sessions found');
            }
          }
          
          // Get scenario executions with results
          if (contentType === 'scenario_execution' || contentType === 'all') {
            try {
              const scenarios = await this.apiCall('/api/scenarios');
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
            } catch (scenarioError) {
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
        } catch (error) {
          console.error('❌ List published content error:', error);
          return {
            error: `❌ Failed to list published content: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_scenario_execution_result':
        try {
          const executionId = args.execution_id;
          console.log(`🎭 Getting scenario execution result: ${executionId}`);
          
          const execution = await this.apiCall(`/executions/${executionId}`);
          if (!execution) {
            return {
              error: `❌ Scenario execution not found: ${executionId}`
            };
          }
          
          return {
            execution_id: execution.id || execution.executionId,
            scenario_id: execution.scenarioId,
            status: execution.status,
            started_at: execution.startTime || execution.startedAt,
            completed_at: execution.endTime || execution.completedAt,
            progress: execution.progress,
            results: execution.results,
            task_results: execution.taskResults,
            assigned_agents: execution.assignedAgents || execution.participants,
            metadata: {
              duration_minutes: (execution.endTime || execution.completedAt) && (execution.startTime || execution.startedAt)
                ? Math.round((new Date(execution.endTime || execution.completedAt).getTime() - new Date(execution.startTime || execution.startedAt).getTime()) / 60000)
                : null,
              success: execution.status === 'completed',
              agent_count: (execution.assignedAgents || execution.participants)?.length || 0,
              task_count: execution.taskResults?.length || execution.tasks?.length || 0
            }
          };
        } catch (error) {
          console.error('❌ Get scenario execution result error:', error);
          return {
            error: `❌ Failed to get scenario execution result: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'coordinate_project':
        try {
          // Fix parameter name mismatch - support multiple parameter names
          const projectDescription = args.request || args.project_description || args.project_prompt;
          console.log('🎯 Natural language coordination request:', projectDescription);

          // First, get all available agents for semantic resolution
          const availableAgents = await this.apiCall('/api/agents', 'GET');
          const agentContext = availableAgents.map((agent: any) => 
            `${agent.name} (${agent.specialization?.domain || 'general'}) - ${agent.description || 'No description'}`
          ).join('\n');

          // Enhanced LLM prompt with semantic name resolution capabilities
          const analysisPrompt = `Analyze this coordination request and identify specific agents by name:

REQUEST: "${projectDescription}"

AVAILABLE AGENTS:
${agentContext}

Your task:
1. Identify any SPECIFIC AGENT NAMES mentioned in the request (like "Pierre Robert", "De Lint", "Tolkien", etc.)
2. Map these names to the available agents listed above
3. If specific agents are mentioned, use them; otherwise suggest appropriate roles
4. Determine coordination structure

Respond in this JSON format:
{
  "coordination_type": "creative|analytical|technical|strategic|research|other",
  "identified_agents": [
    {
      "mentioned_name": "name as mentioned in request",
      "agent_name": "exact name from available agents",
      "agent_id": "if you can determine it",
      "specialization": "agent specialization",
      "responsibility": "what this agent contributes"
    }
  ],
  "additional_roles_needed": [
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

IMPORTANT: If you see names like "Pierre Robert", "De Lint", "Tolkien" in the request, look for exact or similar matches in the available agents list.`;

          // Get coordination analysis from LLM using an existing agent
          let coordinationPlan;
          try {
            // Use the Analyst agent for semantic analysis
            const analystAgent = availableAgents.find((agent: any) => 
              agent.name.toLowerCase() === 'analyst' || 
              agent.specialization?.domain === 'analysis'
            );

            if (!analystAgent) {
              throw new Error('No analyst agent available for semantic analysis');
            }

            const response = await this.apiCall(`/api/agents/${analystAgent.id}/execute`, 'POST', {
              prompt: analysisPrompt,
              temperature: 0.3
            });
            
            coordinationPlan = JSON.parse(response.response);
            console.log('🧠 Semantic analysis result:', JSON.stringify(coordinationPlan, null, 2));
          } catch (error) {
            console.error('LLM analysis failed, using fallback detection:', error);
            // Fallback using manual name detection
            coordinationPlan = this.detectAgentsFromRequest(projectDescription, availableAgents);
            console.log('🔍 Fallback detection result:', JSON.stringify(coordinationPlan, null, 2));
          }

          // Use the built-in coordinator from the API
          let coordinator;
          try {
            // Get the built-in coordinator via the API
            const coordinators = await this.apiCall('/coordinators', 'GET');
            coordinator = coordinators.find((coord: any) => coord.id === 'built-in-coordinator') || coordinators[0];
            
            if (!coordinator) {
              throw new Error('No coordinator available');
            }
            
            console.log(`🔄 Using coordination engine: ${coordinator.name} (${coordinator.id})`);
          } catch (coordinatorError) {
            console.error('Error accessing coordination engine:', coordinatorError);
            throw coordinatorError;
          }

          // Process agents based on semantic analysis
          const agentIds: string[] = [];
          
          // First, handle specifically identified agents
          if (coordinationPlan.identified_agents && coordinationPlan.identified_agents.length > 0) {
            for (const identifiedAgent of coordinationPlan.identified_agents) {
              // Find the exact agent by name
              const matchedAgent = availableAgents.find((agent: any) => 
                agent.name.toLowerCase() === identifiedAgent.agent_name?.toLowerCase() ||
                agent.name.toLowerCase().includes(identifiedAgent.mentioned_name.toLowerCase()) ||
                identifiedAgent.mentioned_name.toLowerCase().includes(agent.name.toLowerCase())
              );

              if (matchedAgent) {
                agentIds.push(matchedAgent.id);
                console.log(`🎯 Found specific agent: ${matchedAgent.name} (${matchedAgent.id}) for "${identifiedAgent.mentioned_name}"`);
              } else {
                console.warn(`⚠️  Could not find agent for "${identifiedAgent.mentioned_name}", will create generic role`);
              }
            }
          }

          // Then handle additional roles if needed
          const maxAgents = args.max_agents || 5;
          const additionalRoles = coordinationPlan.additional_roles_needed || [];
          
          for (const role of additionalRoles.slice(0, maxAgents - agentIds.length)) {
            let agentId: string | null = null;
            
            // Try to find existing agent that matches this role
            const existingAgent = availableAgents.find((agent: any) => 
              agent.specialization?.domain === role.specialization ||
              agent.specialization?.expertise?.some((exp: string) => 
                role.expertise?.includes(exp.toLowerCase()) || role.expertise?.includes(exp)
              ) ||
              role.expertise?.some((exp: string) => 
                agent.specialization?.expertise?.includes(exp) || 
                agent.name.toLowerCase().includes(exp.toLowerCase())
              )
            );

            if (existingAgent && !agentIds.includes(existingAgent.id)) {
              agentId = existingAgent.id;
              console.log(`🔄 Reusing existing agent ${existingAgent.name} (${agentId}) for role ${role.name}`);
            } else {
              // Create new agent with unique name
              const uniqueName = `${role.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const agent = await this.apiCall('/api/agents/create', 'POST', {
                name: uniqueName,
                type: 'elemental',
                description: `${role.responsibility} for project: ${projectDescription}`,
                domain: role.specialization,
                systemPrompt: `You are a ${role.name} with expertise in ${role.expertise?.join(', ') || 'general'}. Your responsibility: ${role.responsibility}. When given coordination tasks, provide actual deliverables and build upon other agents' work to create integrated results.`,
                capabilities: ['collaboration', 'analysis', 'creation'],
                expertise: role.expertise || [],
                knowledgeNamespaces: ['coordination://public'],
                maxConcurrentTasks: 3,
                personalityTraits: ['analytical', 'collaborative', 'thorough'],
                communicationStyle: 'formal',
                decisionMaking: 'analytical'
              });

              agentId = agent.id;
              console.log(`✅ Created new agent ${role.name} (${uniqueName}): ${agentId}`);
            }

            if (agentId && !agentIds.includes(agentId)) {
              agentIds.push(agentId);
            }
          }

          // Fallback: if no agents identified, use generic roles
          if (agentIds.length === 0) {
            console.warn('⚠️  No specific agents identified, falling back to generic coordination agents');
            const fallbackAgents = ['Analyst', 'Creator', 'Reviewer'];
            for (const roleName of fallbackAgents) {
              const existingAgent = availableAgents.find((agent: any) => 
                agent.name.toLowerCase() === roleName.toLowerCase()
              );
              if (existingAgent) {
                agentIds.push(existingAgent.id);
                console.log(`🔄 Using fallback agent: ${existingAgent.name} (${existingAgent.id})`);
              }
            }
          }

          // Auto-activate agents if they're inactive before starting coordination
          console.log(`🔨 Auto-activating agents for coordination...`);
          const activationResults = [];
          for (const agentId of agentIds) {
            try {
              const agentStatus = await this.apiCall(`/api/agents/${agentId}`, 'GET');
              if (agentStatus.status !== 'active') {
                console.log(`🔨 Auto-activating agent ${agentStatus.name} (${agentId}) - was ${agentStatus.status}`);
                await this.apiCall(`/api/agents/${agentId}/start`, 'POST');
                activationResults.push(`✅ Activated ${agentStatus.name}`);
                console.log(`🔨 Agent ${agentStatus.name} (${agentId}) activated successfully`);
              } else {
                activationResults.push(`✅ ${agentStatus.name} already active`);
                console.log(`🔨 Agent ${agentStatus.name} (${agentId}) already active`);
              }
            } catch (activationError) {
              console.error(`❌ Failed to activate agent ${agentId}:`, activationError);
              activationResults.push(`⚠️ Failed to activate agent ${agentId}`);
            }
          }

          // Start coordination with publishing paths
          const publishPaths = [
            `worldtree://public/coordination_results/${coordinationPlan.coordination_type}`,
            `worldtree://public/projects/${Date.now()}_${coordinationPlan.coordination_type}`
          ];

          const coordinationResponse = await this.apiCall(`/coordinators/${coordinator.id}/coordinate`, 'POST', {
            scenarioPrompt: `${projectDescription}\n\nCoordination Structure:\n- Type: ${coordinationPlan.coordination_type}\n- Flow: ${coordinationPlan.collaboration_flow}\n- Goal: ${coordinationPlan.final_deliverable}\n\nEach agent should contribute according to their expertise and build upon others' work.`,
            participantIds: agentIds,
            timeoutMinutes: args.timeout_minutes || 20,
            coordinationStyle: args.collaboration_style || 'collaborative',
            publishTo: publishPaths
          });

          const sessionId = coordinationResponse.sessionId || coordinationResponse.id;

          return {
            session_id: sessionId,
            coordinator_id: coordinator.id,
            agent_ids: agentIds,
            coordination_plan: coordinationPlan,
            status: 'coordination_started',
            message: `🎯 **Natural Language Coordination Started**

**Request:** ${projectDescription}

**Coordination Type:** ${coordinationPlan.coordination_type}

**Team Structure:**
${agentIds.map((agentId: string, i: number) => {
  const agent = availableAgents.find((a: any) => a.id === agentId);
  const identifiedAgent = coordinationPlan.identified_agents?.find((ia: any) => 
    availableAgents.find((a: any) => a.id === agentId)?.name.toLowerCase().includes(ia.mentioned_name?.toLowerCase())
  );
  const additionalRole = coordinationPlan.additional_roles_needed?.[i - (coordinationPlan.identified_agents?.length || 0)];
  
  if (identifiedAgent) {
    return `- **${agent?.name || 'Unknown'}** (\`${agentId}\`) - ${identifiedAgent.responsibility} [SPECIFICALLY REQUESTED]`;
  } else if (additionalRole) {
    return `- **${agent?.name || additionalRole.name}** (\`${agentId}\`) - ${additionalRole.responsibility}`;
  } else {
    return `- **${agent?.name || 'Unknown'}** (\`${agentId}\`) - Supporting role`;
  }
}).join('\n')}

**Collaboration Flow:** ${coordinationPlan.collaboration_flow}

**Expected Deliverable:** ${coordinationPlan.final_deliverable}

**Agent Activation:**
${activationResults.join('\n')}

**Session:** \`${sessionId}\`

Use \`get_coordination_session\` to monitor progress.`,
            timeout_minutes: args.timeout_minutes || 20
          };
        } catch (error) {
          console.error('❌ Natural language coordination error:', error);
          return {
            error: `❌ Failed to start coordination project: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'list_coordinators':
        try {
          const coordinators = await this.apiCall('/coordinators', 'GET');
          
          const filteredCoordinators = args.status 
            ? coordinators.filter((coordinator: any) => coordinator.status === args.status)
            : coordinators;

          return {
            coordinators: filteredCoordinators.map((coordinator: any) => ({
              id: coordinator.id,
              name: coordinator.name,
              description: coordinator.description,
              status: coordinator.status,
              coordination_style: coordinator.capabilities?.coordinationStyle || 'collaborative',
              max_participants: coordinator.capabilities?.maxConcurrentScenarios || 10,
              active_scenarios: 0, // Simplified for now
              current_participants: 0 // Simplified for now
            })),
            total_count: filteredCoordinators.length
          };
        } catch (error) {
          console.error('❌ List coordinators error:', error);
          return {
            error: `❌ Failed to list coordinators: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_coordinator':
        try {
          const coordinator = await this.apiCall(`/coordinators/${args.coordinator_id}`, 'GET');
          
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
              provider: coordinator.llmConfig?.provider || 'openai',
              model: coordinator.llmConfig?.model || 'gpt-4',
              temperature: coordinator.llmConfig?.temperature || 0.7
            },
            coordination: {
              style: coordinator.capabilities?.coordinationStyle || 'collaborative',
              max_participants: coordinator.capabilities?.maxConcurrentScenarios || 10,
              max_concurrent_scenarios: coordinator.capabilities?.maxConcurrentScenarios || 5,
              supported_scenario_types: coordinator.capabilities?.supportedScenarioTypes || [],
              decision_making: coordinator.capabilities?.decisionMaking || 'analytical'
            },
            active_scenarios: [], // Simplified for now
            current_participants: [], // Simplified for now
            mcp_tools: [], // Simplified for now
            created_at: coordinator.createdAt,
            updated_at: coordinator.createdAt // Use createdAt since updatedAt doesn't exist
          };
        } catch (error) {
          console.error('❌ Get coordinator error:', error);
          return {
            error: `❌ Failed to get coordinator: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'create_coordinator':
        try {
          const coordinator = await this.apiCall('/coordinators', 'POST', {
            name: args.name,
            description: args.description,
            coordination: {
              maxConcurrentScenarios: args.max_participants || 10,
              supportedScenarioTypes: ['collaboration', 'analysis', 'problem-solving'],
              coordinationStyle: args.coordination_style || 'collaborative',
              decisionMaking: 'analytical'
            }
          });

          return {
            id: coordinator.id,
            name: coordinator.name,
            description: coordinator.description,
            status: coordinator.status,
            coordination_style: coordinator.capabilities?.coordinationStyle || 'collaborative',
            max_participants: coordinator.capabilities?.maxConcurrentScenarios || 10,
            message: `✅ Coordinator '${coordinator.name}' created successfully`
          };
        } catch (error) {
          console.error('❌ Create coordinator error:', error);
          return {
            error: `❌ Failed to create coordinator: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'travel_to_realm':
        try {
          const response = await this.apiCall(`/api/agents/${args.agent_id}/travel`, 'POST', {
            targetRealmId: args.target_realm_id
          });

          return {
            success: response.success,
            agent_id: args.agent_id,
            previous_realm: response.previousRealmId,
            current_realm: response.currentRealmId,
            available_elementals: response.availableElementals,
            message: response.success 
              ? `🌍 Agent ${args.agent_id} successfully traveled to realm ${response.currentRealmId}`
              : `❌ Travel failed: ${response.error}`,
            timestamp: response.timestamp
          };
        } catch (error) {
          console.error('❌ Travel to realm error:', error);
          return {
            error: `❌ Failed to travel to realm: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_current_realm':
        try {
          const response = await this.apiCall(`/api/agents/${args.agent_id}/current-realm`, 'GET');
          
          return {
            agent_id: args.agent_id,
            current_realm_id: response.currentRealmId,
            realm_name: response.realmName,
            message: response.currentRealmId 
              ? `Agent ${args.agent_id} is currently in realm: ${response.realmName}`
              : `Agent ${args.agent_id} is not currently in any realm`
          };
        } catch (error) {
          console.error('❌ Get current realm error:', error);
          return {
            error: `❌ Failed to get current realm: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_elementals_in_realm':
        try {
          const response = await this.apiCall(`/api/realms/${args.realm_id}/elementals`, 'GET');
          
          return {
            realm_id: args.realm_id,
            elementals: response.elementals,
            count: response.elementals.length,
            message: `Found ${response.elementals.length} elemental(s) in realm ${args.realm_id}`
          };
        } catch (error) {
          console.error('❌ Get elementals in realm error:', error);
          return {
            error: `❌ Failed to get elementals in realm: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'interact_with_agent':
        try {
          const response = await this.apiCall(`/api/agents/interact`, 'POST', {
            fromAgentId: args.from_agent_id,
            toAgentId: args.to_agent_id,
            message: args.message,
            taskType: args.task_type
          });

          return {
            success: response.success,
            from_agent_id: args.from_agent_id,
            to_agent_id: args.to_agent_id,
            response: response.response,
            metadata: response.metadata,
            message: response.success 
              ? `✅ Successful interaction between agents`
              : `❌ Interaction failed: ${response.error}`
          };
        } catch (error) {
          console.error('❌ Agent interaction error:', error);
          return {
            error: `❌ Failed to interact with agent: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_coordination_status':
        try {
          const response = await this.apiCall(`/api/coordinators/sessions/${args.session_id}`, 'GET');
          return response;
        } catch (error) {
          console.error('❌ Get coordination status error:', error);
          return {
            error: `❌ Failed to get coordination status: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'list_active_sessions':
        try {
          const coordinationService = this.getCoordinationService();
          const activeSessions = coordinationService.listSessions('active');
          
          let filteredSessions = activeSessions;
          if (args.coordinator_id) {
            filteredSessions = activeSessions.filter((session: any) => 
              session.coordinatorId === args.coordinator_id
            );
          }

          return {
            success: true,
            sessions: filteredSessions,
            total: filteredSessions.length
          };
        } catch (error) {
          console.error('❌ List active sessions error:', error);
          return {
            error: `❌ Failed to list active sessions: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_coordinator_metrics':
        try {
          const coordinationService = this.getCoordinationService();
          const metrics = coordinationService.getConcurrencyMetrics();
          return metrics;
        } catch (error) {
          console.error('❌ Get coordinator metrics error:', error);
          return {
            error: `❌ Failed to get coordinator metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_session_content':
        try {
          const fs = require('fs');
          const path = require('path');
          
          // Look for published content files
          const contentDir = './data/published_content';
          const contentItems = [];
          
          if (fs.existsSync(contentDir)) {
            const files = fs.readdirSync(contentDir);
            const jsonFiles = files.filter((file: string) => file.endsWith('.json'));
            
            for (const file of jsonFiles) {
              try {
                const filePath = path.join(contentDir, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                
                contentItems.push({
                  id: file.replace('.json', ''),
                  sessionId: data.sessionId || 'unknown',
                  title: data.title || file.replace('.json', '').replace(/___/g, ' '),
                  content: data.content ? data.content.substring(0, 500) + '...' : 'No content preview',
                  contentType: 'text',
                  createdAt: data.createdAt || fs.statSync(filePath).mtime.toISOString(),
                  fullContent: data.content
                });
              } catch (parseError) {
                console.error(`Failed to parse ${file}:`, parseError);
              }
            }
            
            // Sort by creation date, newest first
            contentItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }

          return {
            success: true,
            content: contentItems,
            total: contentItems.length
          };
        } catch (error) {
          console.error('❌ Get session content error:', error);
          return {
            error: `❌ Failed to get session content: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_content_details':
        try {
          const fs = require('fs');
          const path = require('path');
          
          const contentDir = './data/published_content';
          const fileName = `${args.content_id}.json`;
          const filePath = path.join(contentDir, fileName);
          
          if (!fs.existsSync(filePath)) {
            return {
              error: `Content not found: ${args.content_id}`
            };
          }
          
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(fileContent);
          
          const content = {
            id: args.content_id,
            title: data.title || args.content_id.replace(/___/g, ' '),
            content: data.content || 'No content available',
            contentType: 'text',
            createdAt: data.createdAt || fs.statSync(filePath).mtime.toISOString(),
            sessionId: data.sessionId,
            scenarioPrompt: data.scenarioPrompt,
            participants: data.participants || [],
            tags: ['coordination', 'published']
          };

          return {
            success: true,
            content
          };
        } catch (error) {
          console.error('❌ Get content details error:', error);
          return {
            error: `❌ Failed to get content details: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      default:
        // Read-only WorldTree discovery tools (Phase A)
        if (WORLDTREE_TOOL_NAMES.has(name)) {
          const handler = this.getWorldTreeToolHandlers()[name];
          if (handler) {
            return await handler(args ?? {});
          }
        }
        throw new Error(`Tool not found: ${name}`);
    }
  }

  /**
   * Process async agent request in background
   */
  private async processAsyncRequest(requestId: string, agentId: string, message: string): Promise<void> {
    try {
      // Update status to processing
      await this.apiCall(`/api/async-results/${requestId}/status`, 'PUT', { status: 'processing' });
      
      // Execute agent prompt using existing agent service
      const agent = await this.apiCall(`/api/agents/${agentId}`);
      if (!agent) {
        await this.apiCall(`/api/async-results/${requestId}/fail`, 'PUT', { error: `Agent not found: ${agentId}` });
        return;
      }

      // Create execution request structure
      const executionRequest = {
        prompt: message,
        temperature: 0.7
      };

      // Execute the agent prompt
      const result = await this.apiCall(`/api/agents/${agentId}/execute`, 'POST', executionRequest);
      
      // Complete the async request with the result
      await this.apiCall(`/api/async-results/${requestId}/complete`, 'PUT', result);
      
      console.log(`✅ Completed async processing for request ${requestId}`);
    } catch (error) {
      console.error(`❌ Error in async processing for request ${requestId}:`, error);
      await this.apiCall(`/api/async-results/${requestId}/fail`, 'PUT', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Intelligent detection of when to use async mode
   * Based on message complexity, expected processing time, and agent capabilities
   */
  private shouldUseAsyncMode(message: string, agent: any | null, args: any): boolean {
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

  private async handleResourceRead(params: any): Promise<any> {
    const { uri } = params;

    // Read-only WorldTree discovery resources (Phase A). Returns null when the
    // URI is not a discovery resource, so we fall through to existing handling.
    const worldTreeResult = await readWorldTreeResource(uri, this.apiCall.bind(this));
    if (worldTreeResult) {
      return worldTreeResult;
    }

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
                  agents: agents.map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    type: r.type,
                    status: r.status
                  }))
                }, null, 2)
              }
            ]
          };
        } catch (error) {
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
                  realms: realms.map((r: any) => ({
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
        } catch (error) {
          throw new Error(`Failed to read realms: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

      default:
        throw new Error(`Resource not found: ${uri}`);
    }
  }

  private sendSuccess(res: Response, result: any, id: string | number | null): void {
    const response: any = {
      jsonrpc: '2.0',
      result
    };
    
    // Only include ID if it's not null (for notifications, id should be omitted entirely)
    if (id !== null) {
      response.id = id;
    }
    
    res.json(response);
  }

  private sendError(res: Response, code: number, message: string, id: string | number | null): void {
    const response: any = {
      jsonrpc: '2.0',
      error: { code, message }
    };
    
    // Only include ID if it's not null (for notifications, id should be omitted entirely)
    if (id !== null) {
      response.id = id;
    }
    
    res.status(200).json(response); // MCP uses 200 for JSON-RPC errors
  }

  /**
   * Assign an agent to a realm
   */
  private async assignAgentToRealm(agentId: string, realmIdOrName: string): Promise<void> {
    console.log(`🔗 Assigning agent ${agentId} to realm ${realmIdOrName}`);
    
    // First, find any existing realm assignments for this agent
    const allRealms = await this.apiCall('/api/realms');
    const currentRealm = allRealms.find((realm: any) => 
      realm.agentBindings?.some((binding: any) => binding.agentId === agentId)
    );
    
    // Find the target realm by ID or name
    let targetRealm;
    console.log(`🔍 Looking for realm: ${realmIdOrName}`);
    
    // First try by ID
    console.log(`🔍 Trying to get realm by ID: ${realmIdOrName}`);
    try {
      targetRealm = await this.apiCall(`/api/realms/${realmIdOrName}`);
    } catch {
      targetRealm = null;
    }
    console.log(`🔍 getRealm result:`, targetRealm ? { id: targetRealm.id, name: targetRealm.name } : 'null');
    
    // If not found by ID, try to find by name
    if (!targetRealm) {
      console.log(`🔍 Realm not found by ID, searching by name: ${realmIdOrName}`);
      console.log(`🔍 Found ${allRealms.length} realms:`, allRealms.map((r: any) => ({ id: r.id, name: r.name })));
      targetRealm = allRealms.find((r: any) => r.name.toLowerCase() === realmIdOrName.toLowerCase());
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
      const updatedBindings = currentRealm.agentBindings?.filter(
        (binding: any) => binding.agentId !== agentId
      ) || [];
      
      await this.apiCall(`/api/realms/${currentRealm.id}`, 'PUT', {
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
    await this.apiCall(`/api/realms/${targetRealm.id}`, 'PUT', {
      agentBindings: targetRealm.agentBindings
    });

    console.log(`✅ Agent ${agentId} successfully assigned to realm ${targetRealm.name}`);
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, '0.0.0.0', async () => {
        console.log(`✅ MCP Server running on http://0.0.0.0:${this.port}/mcp`);
        
        // Load agents from storage on startup via API
        console.log('🔄 Loading agents from storage...');
        try {
          const agents = await this.apiCall('/api/agents', 'GET');
          console.log(`✅ Loaded ${agents.length} agents from storage for MCP server`);
        } catch (error) {
          console.error('❌ Failed to load agents from storage:', error);
        }
        
        resolve();
      });
    });
  }

  public stop(): void {
    // Cleanup sessions
    this.sessions.clear();
    console.log('🛑 MCP Server stopped');
  }

  // Helper method to detect specific agent names from natural language
  private detectAgentsFromRequest(description: string, availableAgents: any[]): any {
    if (!description || typeof description !== 'string') {
      console.warn('⚠️  No valid description provided to detectAgentsFromRequest');
      return {
        coordination_type: 'general',
        identified_agents: [],
        additional_roles_needed: [
          { name: "Creator", specialization: "creation", expertise: ["content", "development"], responsibility: "create deliverables" },
          { name: "Reviewer", specialization: "review", expertise: ["evaluation", "improvement"], responsibility: "refine and enhance output" }
        ],
        collaboration_flow: "sequential",
        final_deliverable: "integrated solution based on request",
        estimated_complexity: "moderate"
      };
    }
    
    const descriptionLower = description.toLowerCase();
    const identifiedAgents: any[] = [];
    
    // Common name patterns to look for
    const namePatterns = [
      { pattern: /pierre robert/i, names: ['pierre robert', 'pierre', 'robert'] },
      { pattern: /de lint/i, names: ['de lint', 'delint', 'charles de lint'] },
      { pattern: /tolkien/i, names: ['tolkien', 'j.r.r. tolkien', 'jrr tolkien'] },
      { pattern: /asimov/i, names: ['asimov', 'isaac asimov'] },
      { pattern: /lucas/i, names: ['lucas', 'george lucas'] },
      { pattern: /colleen/i, names: ['colleen'] }
    ];

    // Check for specific agent name patterns
    for (const pattern of namePatterns) {
      if (pattern.pattern.test(description)) {
        // Find matching agent from available agents
        const matchingAgent = availableAgents.find(agent => 
          agent && agent.name && pattern.names.some(name => 
            agent.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(agent.name.toLowerCase())
          )
        );
        
        if (matchingAgent) {
          identifiedAgents.push({
            mentioned_name: pattern.pattern.source.replace(/[^a-zA-Z\s]/g, ''),
            agent_name: matchingAgent.name,
            agent_id: matchingAgent.id,
            specialization: matchingAgent.specialization?.domain || 'general',
            responsibility: `Contribute expertise in ${matchingAgent.specialization?.domain || 'general'} based on their unique perspective`
          });
        }
      }
    }

    // Determine coordination type based on content
    let coordinationType = 'general';
    if (descriptionLower.includes('story') || descriptionLower.includes('creative') || descriptionLower.includes('writing')) {
      coordinationType = 'creative';
    } else if (descriptionLower.includes('analysis') || descriptionLower.includes('research')) {
      coordinationType = 'analytical';
    }

    return {
      coordination_type: coordinationType,
      identified_agents: identifiedAgents,
      additional_roles_needed: identifiedAgents.length === 0 ? [
        { name: "Creator", specialization: "creation", expertise: ["content", "development"], responsibility: "create deliverables" },
        { name: "Reviewer", specialization: "review", expertise: ["evaluation", "improvement"], responsibility: "refine and enhance output" }
      ] : [],
      collaboration_flow: "sequential",
      final_deliverable: "integrated solution based on request",
      estimated_complexity: "moderate"
    };
  }

  // Helper methods for natural language interface
  private getOptimalTeamSize(purpose: string): number {
    const purposeLower = purpose.toLowerCase();
    
    if (purposeLower.includes('content') || purposeLower.includes('writing')) {
      return 3; // writer, editor, reviewer
    } else if (purposeLower.includes('analysis') || purposeLower.includes('research')) {
      return 2; // researcher, analyst
    } else if (purposeLower.includes('development') || purposeLower.includes('coding')) {
      return 4; // developer, tester, reviewer, documentation
    } else if (purposeLower.includes('support') || purposeLower.includes('customer')) {
      return 2; // primary, escalation
    } else {
      return 3; // default balanced team
    }
  }

  private getAgentTypesForPurpose(purpose: string): string[] {
    const purposeLower = purpose.toLowerCase();
    
    if (purposeLower.includes('content') || purposeLower.includes('writing')) {
      return ['druid', 'elemental', 'gaia']; // creative, structured, natural
    } else if (purposeLower.includes('analysis') || purposeLower.includes('research')) {
      return ['worldtree', 'druid']; // analytical, investigative
    } else if (purposeLower.includes('development') || purposeLower.includes('coding')) {
      return ['worldtree', 'elemental']; // systematic, precise
    } else if (purposeLower.includes('support') || purposeLower.includes('customer')) {
      return ['gaia', 'druid']; // empathetic, wise
    } else {
      return ['druid', 'elemental', 'gaia']; // balanced mix
    }
  }

  private getCapabilitiesForType(agentType: string): string[] {
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

export default SimpleMCPServer;