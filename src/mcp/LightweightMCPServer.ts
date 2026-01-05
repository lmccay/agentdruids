import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

/**
 * Lightweight MCP-compliant server that communicates with main application via HTTP APIs
 * This avoids direct database dependencies and maintains proper service separation
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number | null;
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

export class LightweightMCPServer {
  private app: express.Application;
  private port: number;
  private sessions: Map<string, Session> = new Map();
  private mainAppUrl: string;

  constructor(port: number = 3003, mainAppUrl: string = 'http://druids-main:3000') {
    this.port = port;
    this.mainAppUrl = mainAppUrl;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS configuration for MCP compliance - match SimpleMCPServer exactly
    this.app.use(cors({
      origin: '*', // Allow all origins for now
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Origin']
    }));
    
    this.app.use(express.json({ 
      limit: '50mb',
      type: 'application/json'
    }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging middleware
    this.app.use((req, _res, next) => {
      console.log(`📥 Request: ${req.method} ${req.path}`);
      console.log(`📡 Host: ${req.get('host')}`);
      console.log(`🔍 User-Agent: ${req.get('user-agent') || 'none'}`);
      console.log(`🔍 Accept: ${req.get('accept') || 'none'}`);
      console.log(`🔍 Connection: ${req.get('connection') || 'none'}`);
      console.log(`🔍 Content-Length: ${req.get('content-length') || 'none'}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // MCP JSON-RPC endpoints - support both root and /mcp paths for compatibility
    this.app.post('/', this.handleJsonRpc.bind(this));
    this.app.post('/mcp', this.handleJsonRpc.bind(this));
    
    // GET endpoint for streamable HTTP transport (Goose Desktop 1.9+ compatibility)
    this.app.get('/mcp', this.handleMCPGetRequest.bind(this));
    
    // Handle DELETE for session cleanup (used by some MCP clients like Goose)
    this.app.delete('/mcp', this.handleSessionCleanup.bind(this));
  }

  private async handleJsonRpc(req: Request, res: Response): Promise<void> {
    try {
      const request: JsonRpcRequest = req.body;
      
      // Validate JSON-RPC format
      if (!request.jsonrpc || request.jsonrpc !== '2.0' || !request.method) {
        return this.sendError(res, -32600, 'Invalid Request', request?.id !== undefined ? request.id : null);
      }

      // Check MCP protocol version for initialize requests
      if (request.method === 'initialize') {
        const protocolVersion = req.get('MCP-Protocol-Version');
        if (protocolVersion && protocolVersion !== '2025-06-18') {
          console.log(`⚠️ Protocol version mismatch: ${protocolVersion}, allowing anyway`);
        }
      }

      // Get or create session (support both header formats like SimpleMCPServer)
      let sessionId = req.get('mcp-session-id') || req.get('Mcp-Session-Id');
      if (!sessionId && request.method !== 'initialize') {
        return this.sendError(res, -32001, 'Session required. Call initialize first.', request.id !== undefined ? request.id : null);
      }

      // Check for SSE request (streaming HTTP)
      const acceptHeader = req.get('Accept') || '';
      const isSSERequest = acceptHeader.includes('text/event-stream');
      
      console.log(`📥 ${request.method} - SSE: ${isSSERequest} (Accept: ${acceptHeader})`);

      // Handle session management (like SimpleMCPServer)
      if (request.method === 'initialize') {
        sessionId = this.createSession(request.params?.clientInfo);
        res.set('Mcp-Session-Id', sessionId);
        console.log(`✅ Created new session: ${sessionId}`);
      } else if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
          return this.sendError(res, -32001, 'Invalid session ID', request.id !== undefined ? request.id : null);
        }
        session.lastActivity = new Date();
      }

      // Handle SSE vs regular JSON response (like SimpleMCPServer)
      if (isSSERequest) {
        console.log('🌊 Handling as SSE request');
        return this.handleSSEResponse(req, res, request, sessionId);
      } else {
        console.log('📄 Handling as JSON request');
        // Route to method handlers for regular JSON
        const result = await this.handleMethod(request, sessionId);
        const response: JsonRpcResponse = {
          jsonrpc: '2.0',
          result,
          id: request.id !== undefined ? request.id : null
        };
        res.setHeader('Content-Type', 'application/json');
        res.json(response);
      }
    } catch (error) {
      console.error('❌ JSON-RPC error:', error);
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error'
        },
        id: req.body?.id !== undefined ? req.body.id : null
      };

      const acceptHeader = req.get('Accept') || '';
      const isSSERequest = acceptHeader.includes('text/event-stream');
      
      if (isSSERequest) {
        // Create a fake request for SSE error response
        const fakeRequest: JsonRpcRequest = {
          jsonrpc: '2.0',
          method: 'error',
          id: req.body?.id !== undefined ? req.body.id : null
        };
        await this.handleSSEResponse(req, res, fakeRequest);
      } else {
        res.status(500).json(errorResponse);
      }
    }
  }

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

  private handleSessionCleanup(req: Request, res: Response): void {
    const sessionId = req.get('mcp-session-id') || req.get('Mcp-Session-Id');
    console.log(`🗑️ Session cleanup request for session: ${sessionId || 'none'}`);
    
    if (sessionId && this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      console.log(`✅ Session ${sessionId} cleaned up`);
      res.status(200).json({ success: true, message: 'Session cleaned up' });
    } else {
      console.log(`⚠️ Session ${sessionId || 'none'} not found for cleanup`);
      res.status(404).json({ success: false, message: 'Session not found' });
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
    console.log(`✅ Initialized session: ${sessionId}`);
    return sessionId;
  }

  private async handleMethod(message: JsonRpcRequest, _sessionId?: string): Promise<any> {
    try {
      console.log(`🔧 Handling method: ${message.method}`);
      
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
          return { tools: await this.getToolsList() };

        case 'tools/call':
          return await this.handleToolCall(message.params);

        case 'initialized':
        case 'notifications/initialized':
          // MCP protocol notification - client confirms initialization
          console.log('🔔 Client initialization confirmed');
          return {}; // Empty response for notification

        default:
          throw new Error(`Method not found: ${message.method}`);
      }
    } catch (error) {
      console.error(`❌ Error in handleMethod for ${message.method}:`, error);
      throw error;
    }
  }

  private async getToolsList(): Promise<any[]> {
    return [
      {
        name: 'execute_agent_prompt',
        description: 'Execute a prompt with a specific agent',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'ID of the agent to execute' },
            message: { type: 'string', description: 'The prompt message to send' },
            temperature: { type: 'number', description: 'LLM temperature (0.0-1.0)', default: 0.7 }
          },
          required: ['agent_id', 'message']
        }
      },
      {
        name: 'list_agents',
        description: 'List all available agents',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by status (active/inactive)', enum: ['active', 'inactive'] }
          }
        }
      },
      {
        name: 'get_agent_details',
        description: 'Get detailed information about a specific agent',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'ID of the agent' }
          },
          required: ['agent_id']
        }
      },
      {
        name: 'coordinate_agents',
        description: 'Coordinate multiple agents to work together on a task',
        inputSchema: {
          type: 'object',
          properties: {
            coordinator_id: { type: 'string', description: 'ID of the coordinating agent' },
            participant_ids: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of participant agent IDs' 
            },
            scenario_prompt: { type: 'string', description: 'The task or scenario description' },
            max_iterations: { type: 'number', description: 'Maximum coordination iterations', default: 5 }
          },
          required: ['coordinator_id', 'participant_ids', 'scenario_prompt']
        }
      }
    ];
  }

  private async handleToolCall(params: any): Promise<any> {
    const { name, arguments: args } = params;

    switch (name) {
      case 'execute_agent_prompt':
        const result = await this.executeAgentPrompt(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };

      case 'list_agents':
        const agents = await this.listAgents(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(agents, null, 2)
            }
          ]
        };

      case 'get_agent_details':
        const agent = await this.getAgentDetails(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(agent, null, 2)
            }
          ]
        };

      case 'coordinate_agents':
        const coordination = await this.coordinateAgents(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(coordination, null, 2)
            }
          ]
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private sendError(res: Response, code: number, message: string, id: string | number | null): void {
    const errorResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      error: { code, message },
      id
    };

    const acceptHeader = res.req.get('Accept') || '';
    const isSSERequest = acceptHeader.includes('text/event-stream');
    
    if (isSSERequest) {
      // Create a fake request for SSE error response
      const fakeRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'error',
        id
      };
      this.handleSSEResponse(res.req, res, fakeRequest);
    } else {
      res.status(400).json(errorResponse);
    }
  }

  private async handleSSEResponse(_req: Request, res: Response, message: JsonRpcRequest, sessionId?: string): Promise<void> {
    try {
      console.log('🌊 Setting up SSE response');
      
      // Handle connection errors and client disconnects
      res.on('error', (error) => {
        console.error('❌ SSE Response error:', error);
      });
      
      res.on('close', () => {
        console.log('🔌 SSE connection closed by client');
      });
      
      // Set SSE headers (exactly like SimpleMCPServer)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Process the request (exactly like SimpleMCPServer)
      const result = await this.handleMethod(message, sessionId);
      
      // Add debug logging for tool calls
      if (message.method === 'tools/call') {
        console.log('🔧 Tool call result:', JSON.stringify(result, null, 2));
      }
      
      // Send JSON-RPC response as SSE event
      // For notifications (no ID in request), don't include ID in response
      const response: any = {
        jsonrpc: '2.0',
        result
      };
      
      // Only include ID if the request had one (not a notification)
      if (message.id !== undefined) {
        response.id = message.id;
      }
      
      console.log('📤 Sending SSE response:', JSON.stringify(response, null, 2));
      
      // Validate JSON serializability before sending (like SimpleMCPServer)
      try {
        const serializedResponse = JSON.stringify(response);
        const writeSuccess = res.write(`data: ${serializedResponse}\n\n`);
        if (!writeSuccess) {
          console.warn('⚠️ Write buffer full, data may be queued');
        }
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
        
        // Only include ID if the request had one
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
      
      // Only include ID if the request had one
      if (message.id !== undefined) {
        errorResponse.id = message.id;
      }
      
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }

  // Old methods removed - now using handleMethod approach like SimpleMCPServer

  // HTTP API delegation methods
  private async executeAgentPrompt(args: any): Promise<any> {
    const { agent_id, message, temperature = 0.7 } = args;
    
    if (!agent_id || !message) {
      throw new Error('agent_id and message are required');
    }

    try {
      const response = await axios.post(`${this.mainAppUrl}/api/agents/${agent_id}/execute`, {
        prompt: message,
        temperature
      });

      return {
        agent_id,
        response: response.data.data.response,
        usage: response.data.data.usage,
        execution_time: response.data.data.executionTime
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API call failed: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  private async listAgents(args: any = {}): Promise<any> {
    try {
      const queryParams = new URLSearchParams();
      if (args.status) {
        queryParams.append('status', args.status);
      }

      const url = `${this.mainAppUrl}/api/agents${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      const response = await axios.get(url);

      return {
        agents: response.data.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          description: agent.description,
          realmAccess: agent.realmAccess
        }))
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API call failed: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  private async getAgentDetails(args: any): Promise<any> {
    const { agent_id } = args;
    
    if (!agent_id) {
      throw new Error('agent_id is required');
    }

    try {
      const response = await axios.get(`${this.mainAppUrl}/api/agents/${agent_id}`);
      return { agent: response.data };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API call failed: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  private async coordinateAgents(args: any): Promise<any> {
    const { coordinator_id, participant_ids, scenario_prompt, max_iterations = 5 } = args;
    
    if (!coordinator_id) {
      throw new Error('coordinator_id is required');
    }
    
    if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
      throw new Error('participant_ids must be a non-empty array');
    }
    
    if (!scenario_prompt) {
      throw new Error('scenario_prompt is required');
    }

    try {
      const response = await axios.post(`${this.mainAppUrl}/api/coordination/coordinate`, {
        coordinator_id,
        participant_ids,
        scenario_prompt,
        max_iterations
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API call failed: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`🚀 Lightweight MCP Server running on port ${this.port}`);
        console.log(`📡 Delegating to main app at: ${this.mainAppUrl}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    // Cleanup sessions
    this.sessions.clear();
    console.log('📡 Lightweight MCP Server stopped');
  }
}