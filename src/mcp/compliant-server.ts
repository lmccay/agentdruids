import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

/**
 * MCP-compliant server implementation for the Druids system
 * Implements the official MCP specification with JSON-RPC 2.0 and SSE
 * Specification: https://modelcontextprotocol.io/specification/2025-06-18
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

interface MCPSession {
  id: string;
  initialized: boolean;
  clientInfo?: {
    name: string;
    version: string;
  };
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools?: { listChanged?: boolean };
    resources?: { subscribe?: boolean; listChanged?: boolean };
    prompts?: { listChanged?: boolean };
  };
}

export class MCPCompliantServer {
  private app: express.Application;
  private port: number;
  private sessions: Map<string, MCPSession> = new Map();
  private readonly PROTOCOL_VERSION = '2025-06-18';
  private readonly SERVER_INFO = {
    name: 'druids-mcp-server',
    version: '1.0.0'
  };

  constructor(port: number = 3003) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  // Helper method to ensure valid JSON-RPC ID
  private getValidId(id?: string | number | null): string | number | null {
    return id !== undefined ? id : null;
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type', 
        'Accept', 
        'MCP-Protocol-Version', 
        'Mcp-Session-Id',
        'Last-Event-ID',
        'Cache-Control'
      ]
    }));
    
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Single MCP endpoint as per specification
    this.app.post('/mcp', this.handleMCPPost.bind(this));
    this.app.get('/mcp', this.handleMCPGet.bind(this));
    this.app.delete('/mcp', this.handleMCPDelete.bind(this));
    
    // Health check (non-MCP)
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
  }

  private async handleMCPPost(req: Request, res: Response): Promise<void> {
    try {
      // Validate MCP protocol version
      const protocolVersion = req.get('MCP-Protocol-Version');
      if (protocolVersion && protocolVersion !== this.PROTOCOL_VERSION) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: `Unsupported protocol version: ${protocolVersion}`
          },
          id: null
        });
        return;
      }

      // Validate Accept header
      const accept = req.get('Accept');
      if (!accept || (!accept.includes('application/json') && !accept.includes('text/event-stream'))) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Accept header must include application/json and/or text/event-stream'
          },
          id: null
        });
        return;
      }

      const message = req.body as JsonRpcRequest;
      
      // Validate JSON-RPC format
      if (!message || message.jsonrpc !== '2.0' || !message.method) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC request'
          },
          id: message?.id || null
        });
        return;
      }

      // Handle based on whether this is a request or response/notification
      if (this.getValidId(message.id) !== undefined) {
        // This is a request - decide whether to use SSE or JSON response
        if (accept.includes('text/event-stream') && this.shouldUseSSE(message.method)) {
          this.handleSSERequest(req, res, message);
        } else {
          this.handleJSONRequest(req, res, message);
        }
      } else {
        // This is a notification or response
        this.handleNotification(req, res, message);
      }
    } catch (error) {
      console.error('Error handling MCP POST:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error'
        },
        id: null
      });
    }
  }

  private shouldUseSSE(method: string): boolean {
    // Use SSE for methods that might need streaming or server-initiated messages
    return ['tools/call', 'prompts/get'].includes(method);
  }

  private handleSSERequest(req: Request, res: Response, message: JsonRpcRequest): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial response
    const response = this.processRequest(message, req.get('Mcp-Session-Id'));
    this.sendSSEEvent(res, 'message', response);

    // Close the stream after sending response (as per spec)
    res.write('event: close\\ndata: {}\\n\\n');
    res.end();
  }

  private handleJSONRequest(req: Request, res: Response, message: JsonRpcRequest): void {
    const response = this.processRequest(message, req.get('Mcp-Session-Id'));
    
    // Add session ID header if this is initialization
    if (message.method === 'initialize' && response.result) {
      const sessionId = this.getOrCreateSession(message.params?.clientInfo).id;
      res.set('Mcp-Session-Id', sessionId);
    }
    
    res.json(response);
  }

  private handleNotification(_req: Request, res: Response, message: JsonRpcRequest | JsonRpcNotification): void {
    // Process notification (no response expected)
    console.log('Received notification:', message.method, message.params);
    res.status(202).send(); // 202 Accepted with no body
  }

  private async handleMCPGet(req: Request, res: Response): Promise<void> {
    try {
      const accept = req.get('Accept');
      if (!accept || !accept.includes('text/event-stream')) {
        res.status(405).json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not allowed - GET requires text/event-stream Accept header'
          },
          id: null
        });
        return;
      }

      // Open SSE stream for server-initiated messages
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(': keepalive\\n\\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });

      // Note: In a real implementation, this stream would be used for
      // server-initiated requests and notifications
    } catch (error) {
      console.error('Error handling MCP GET:', error);
      res.status(500).end();
    }
  }

  private async handleMCPDelete(req: Request, res: Response): Promise<void> {
    const sessionId = req.get('Mcp-Session-Id');
    if (sessionId && this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      res.status(204).send();
    } else {
      res.status(404).send();
    }
  }

  private processRequest(message: JsonRpcRequest, sessionId?: string): JsonRpcResponse {
    try {
      switch (message.method) {
        case 'initialize':
          return this.handleInitialize(message);
        case 'tools/list':
          return this.handleToolsList(message, sessionId);
        case 'tools/call':
          return this.handleToolsCall(message, sessionId);
        case 'resources/list':
          return this.handleResourcesList(message, sessionId);
        case 'resources/read':
          return this.handleResourcesRead(message, sessionId);
        case 'prompts/list':
          return this.handlePromptsList(message, sessionId);
        case 'prompts/get':
          return this.handlePromptsGet(message, sessionId);
        default:
          return {
            jsonrpc: '2.0',
            id: this.getValidId(this.getValidId(message.id)),
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: this.getValidId(this.getValidId(message.id)),
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  private handleInitialize(message: JsonRpcRequest): JsonRpcResponse {
    const session = this.getOrCreateSession(message.params?.clientInfo);
    
    return {
      jsonrpc: '2.0',
      id: this.getValidId(this.getValidId(message.id)),
      result: {
        protocolVersion: this.PROTOCOL_VERSION,
        capabilities: session.capabilities,
        serverInfo: session.serverInfo
      }
    };
  }

  private handleToolsList(message: JsonRpcRequest, sessionId?: string): JsonRpcResponse {
    if (!this.validateSession(sessionId)) {
      return this.sessionError(this.getValidId(this.getValidId(message.id)));
    }

    return {
      jsonrpc: '2.0',
      id: this.getValidId(this.getValidId(message.id)),
      result: {
        tools: [
          {
            name: 'agent_create',
            description: 'Create a new agent in the Druids system',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['druid', 'elemental', 'gaia', 'worldtree'] },
                description: { type: 'string' },
                realm: { type: 'string' }
              },
              required: ['name', 'type']
            }
          },
          {
            name: 'realm_create',
            description: 'Create a new realm in the Druids system',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                type: { type: 'string', enum: ['forest', 'mountain', 'ocean', 'urban'] }
              },
              required: ['name', 'type']
            }
          },
          {
            name: 'knowledge_query',
            description: 'Query knowledge namespaces',
            inputSchema: {
              type: 'object',
              properties: {
                namespace: { type: 'string' },
                query: { type: 'string' },
                limit: { type: 'number' }
              },
              required: ['namespace', 'query']
            }
          },
          {
            name: 'scenario_execute',
            description: 'Execute a multi-agent scenario',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                agents: { type: 'array', items: { type: 'string' } }
              },
              required: ['name', 'agents']
            }
          }
        ]
      }
    };
  }

  private handleToolsCall(message: JsonRpcRequest, sessionId?: string): JsonRpcResponse {
    if (!this.validateSession(sessionId)) {
      return this.sessionError(this.getValidId(this.getValidId(message.id)));
    }

    const { name, arguments: args } = message.params || {};
    
    // Simulate tool execution
    let result: any;
    switch (name) {
      case 'agent_create':
        result = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: `Created agent: ${args.name} of type ${args.type}`,
              success: true,
              id: `agent-${Date.now()}`
            })
          }]
        };
        break;
      case 'realm_create':
        result = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: `Created realm: ${args.name} of type ${args.type}`,
              success: true,
              id: `realm-${Date.now()}`
            })
          }]
        };
        break;
      case 'knowledge_query':
        result = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              results: [],
              metadata: {
                namespace: args.namespace,
                query: args.query,
                totalResults: 0
              }
            })
          }]
        };
        break;
      case 'scenario_execute':
        result = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: `Executing scenario: ${args.name}`,
              success: true,
              executionId: `exec-${Date.now()}`
            })
          }]
        };
        break;
      default:
        return {
          jsonrpc: '2.0',
          id: this.getValidId(this.getValidId(message.id)),
          error: {
            code: -32602,
            message: `Unknown tool: ${name}`
          }
        };
    }

    return {
      jsonrpc: '2.0',
      id: this.getValidId(this.getValidId(message.id)),
      result
    };
  }

  private handleResourcesList(message: JsonRpcRequest, sessionId?: string): JsonRpcResponse {
    if (!this.validateSession(sessionId)) {
      return this.sessionError(this.getValidId(this.getValidId(message.id)));
    }

    return {
      jsonrpc: '2.0',
      id: this.getValidId(message.id),
      result: {
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
          {
            uri: 'druids://knowledge',
            name: 'Knowledge Namespaces',
            description: 'List of all knowledge namespaces',
            mimeType: 'application/json'
          }
        ]
      }
    };
  }

  private handleResourcesRead(message: JsonRpcRequest, sessionId?: string): JsonRpcResponse {
    if (!this.validateSession(sessionId)) {
      return this.sessionError(this.getValidId(message.id));
    }

    const { uri } = message.params || {};
    let content: any;

    switch (uri) {
      case 'druids://agents':
        content = { agents: [], count: 0 };
        break;
      case 'druids://realms':
        content = { realms: [], count: 0 };
        break;
      case 'druids://knowledge':
        content = { namespaces: [], count: 0 };
        break;
      default:
        return {
          jsonrpc: '2.0',
          id: this.getValidId(message.id),
          error: {
            code: -32602,
            message: `Unknown resource: ${uri}`
          }
        };
    }

    return {
      jsonrpc: '2.0',
      id: this.getValidId(message.id),
      result: {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(content)
        }]
      }
    };
  }

  private handlePromptsList(message: JsonRpcRequest, sessionId?: string): JsonRpcResponse {
    if (!this.validateSession(sessionId)) {
      return this.sessionError(this.getValidId(message.id));
    }

    return {
      jsonrpc: '2.0',
      id: this.getValidId(message.id),
      result: {
        prompts: [
          {
            name: 'agent_instruction',
            description: 'Generate instructions for an agent based on its type and role',
            arguments: [
              {
                name: 'agent_type',
                description: 'Type of agent (druid, elemental, gaia, worldtree)',
                required: true
              },
              {
                name: 'role',
                description: 'Specific role or task for the agent',
                required: true
              }
            ]
          },
          {
            name: 'scenario_plan',
            description: 'Create a plan for executing a multi-agent scenario',
            arguments: [
              {
                name: 'objective',
                description: 'The main objective of the scenario',
                required: true
              },
              {
                name: 'agents',
                description: 'List of available agents',
                required: true
              }
            ]
          }
        ]
      }
    };
  }

  private handlePromptsGet(message: JsonRpcRequest, sessionId?: string): JsonRpcResponse {
    if (!this.validateSession(sessionId)) {
      return this.sessionError(this.getValidId(message.id));
    }

    const { name, arguments: args } = message.params || {};
    let result: string;

    switch (name) {
      case 'agent_instruction':
        result = `Instructions for ${args.agent_type} agent with role: ${args.role}:\\n\\n1. Initialize your ${args.agent_type} capabilities\\n2. Connect to your assigned realm\\n3. Execute your ${args.role} responsibilities\\n4. Report status to coordination layer`;
        break;
      case 'scenario_plan':
        result = `Scenario Plan for: ${args.objective}\\n\\nAgents: ${Array.isArray(args.agents) ? args.agents.join(', ') : args.agents}\\n\\n1. Initialize all agents\\n2. Coordinate agent interactions\\n3. Execute scenario steps\\n4. Monitor and adjust\\n5. Complete objective`;
        break;
      default:
        return {
          jsonrpc: '2.0',
          id: this.getValidId(message.id),
          error: {
            code: -32602,
            message: `Unknown prompt: ${name}`
          }
        };
    }

    return {
      jsonrpc: '2.0',
      id: this.getValidId(message.id),
      result: {
        description: `Generated ${name} prompt`,
        messages: [
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: result
            }
          }
        ]
      }
    };
  }

  private getOrCreateSession(clientInfo?: any): MCPSession {
    const sessionId = uuidv4();
    const session: MCPSession = {
      id: sessionId,
      initialized: true,
      clientInfo,
      serverInfo: this.SERVER_INFO,
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true }
      }
    };
    
    this.sessions.set(sessionId, session);
    return session;
  }

  private validateSession(sessionId?: string): boolean {
    if (!sessionId) return true; // Allow requests without session for backwards compatibility
    return this.sessions.has(sessionId);
  }

  private sessionError(id: string | number | null): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: 'Invalid session'
      }
    };
  }

  private sendSSEEvent(res: Response, event: string, data: any): void {
    res.write(`event: ${event}\\n`);
    res.write(`data: ${JSON.stringify(data)}\\n\\n`);
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, '127.0.0.1', () => {
        console.log(`MCP-compliant server listening on http://127.0.0.1:${this.port}/mcp`);
        console.log(`Protocol version: ${this.PROTOCOL_VERSION}`);
        resolve();
      });
    });
  }
}

export default MCPCompliantServer;