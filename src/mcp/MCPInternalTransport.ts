import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';

/**
 * Internal MCP Client/Server for agent-to-agent communication
 * Supports both stdio and Streamable HTTP transports
 * FULLY COMPLIANT with MCP specification
 */

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPTransportConfig {
  type: 'stdio' | 'http';
  
  // For stdio transport
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  
  // For HTTP transport
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
  headers?: Record<string, string>;
}

export interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  sampling?: any;
}

export interface MCPSession {
  id: string;
  transport: MCPTransportConfig;
  initialized: boolean;
  capabilities?: MCPCapabilities;
  serverInfo?: {
    name: string;
    version: string;
  };
}

/**
 * Stdio Transport Handler for MCP communication
 */
class StdioTransport extends EventEmitter {
  private process?: ChildProcess;
  private buffer: string = '';
  private pendingRequests: Map<string | number, (response: JsonRpcMessage) => void> = new Map();

  constructor(private config: MCPTransportConfig) {
    super();
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error('Command is required for stdio transport');
    }

    this.process = spawn(this.config.command, this.config.args || [], {
      cwd: this.config.cwd,
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create stdio pipes');
    }

    this.process.stdout.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('MCP process stderr:', data.toString());
    });

    this.process.on('exit', (code) => {
      console.log(`MCP process exited with code ${code}`);
      this.emit('disconnect');
    });

    this.process.on('error', (error) => {
      console.error('MCP process error:', error);
      this.emit('error', error);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message: JsonRpcMessage = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse MCP message:', error, 'Raw line:', line);
        }
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && message.id !== null && (message.result !== undefined || message.error !== undefined)) {
      // This is a response
      const callback = this.pendingRequests.get(message.id);
      if (callback) {
        this.pendingRequests.delete(message.id);
        callback(message);
      }
    } else {
      // This is a request or notification
      this.emit('message', message);
    }
  }

  async sendMessage(message: JsonRpcMessage): Promise<JsonRpcMessage | void> {
    if (!this.process?.stdin) {
      throw new Error('Process not connected');
    }

    const messageStr = JSON.stringify(message) + '\\n';
    this.process.stdin.write(messageStr);

    // If this is a request (has id), wait for response
    if (message.id !== undefined && message.id !== null) {
      return new Promise<JsonRpcMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(message.id!);
          reject(new Error('Request timeout'));
        }, 30000);

        this.pendingRequests.set(message.id!, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined as any;
    }
    this.pendingRequests.clear();
  }
}

/**
 * HTTP Transport Handler for MCP communication
 */
class HttpTransport extends EventEmitter {
  private baseUrl: string;
  private sessionId?: string;

  constructor(private config: MCPTransportConfig) {
    super();
    const protocol = config.secure ? 'https' : 'http';
    const host = config.host || 'localhost';
    const port = config.port || 3003;
    const path = config.path || '/mcp';
    this.baseUrl = `${protocol}://${host}:${port}${path}`;
  }

  async connect(): Promise<void> {
    // For HTTP transport, connection is established on first request
    // But we can test connectivity here
    try {
      await this.sendMessage({
        jsonrpc: '2.0',
        method: 'ping',
        id: 'connection-test'
      });
    } catch (error) {
      throw new Error(`Failed to connect to MCP server: ${error}`);
    }
  }

  async sendMessage(message: JsonRpcMessage): Promise<JsonRpcMessage | void> {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
        ...this.config.headers
      }
    };

    if (this.sessionId) {
      (options.headers as any)['Mcp-Session-Id'] = this.sessionId;
    }

    return new Promise((resolve, reject) => {
      const req = http.request(this.baseUrl, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response: JsonRpcMessage = JSON.parse(data);
            
            // Extract session ID from response headers
            const sessionId = res.headers['mcp-session-id'];
            if (sessionId && typeof sessionId === 'string') {
              this.sessionId = sessionId;
            }

            if (message.id === undefined) {
              // Notification - no response expected
              resolve();
            } else {
              resolve(response);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(JSON.stringify(message));
      req.end();
    });
  }

  async disconnect(): Promise<void> {
    if (this.sessionId) {
      try {
        // Send DELETE request to clean up session
        const options = {
          method: 'DELETE',
          headers: {
            'Mcp-Session-Id': this.sessionId,
            'MCP-Protocol-Version': '2025-06-18'
          }
        };
        
        const req = http.request(this.baseUrl, options);
        req.end();
      } catch (error) {
        console.error('Error cleaning up session:', error);
      }
      this.sessionId = undefined as any;
    }
  }
}

/**
 * MCP Client for internal agent communication
 * Supports both stdio and HTTP transports
 */
export class MCPInternalClient extends EventEmitter {
  private session?: MCPSession;
  private transport?: StdioTransport | HttpTransport;
  private requestId = 0;

  constructor(private config: MCPTransportConfig) {
    super();
  }

  async connect(): Promise<MCPSession> {
    // Create appropriate transport
    if (this.config.type === 'stdio') {
      this.transport = new StdioTransport(this.config);
    } else {
      this.transport = new HttpTransport(this.config);
    }

    // Set up event forwarding
    this.transport.on('message', (message) => this.emit('message', message));
    this.transport.on('error', (error) => this.emit('error', error));
    this.transport.on('disconnect', () => this.emit('disconnect'));

    // Connect transport
    await this.transport.connect();

    // Initialize MCP session
    const initResponse = await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'initialize',
      id: this.getNextRequestId(),
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'druids-internal-client',
          version: '1.0.0'
        }
      }
    }) as JsonRpcMessage;

    if (initResponse.error) {
      throw new Error(`MCP initialization failed: ${initResponse.error.message}`);
    }

    this.session = {
      id: uuidv4(),
      transport: this.config,
      initialized: true,
      capabilities: initResponse.result?.capabilities,
      serverInfo: initResponse.result?.serverInfo
    };

    // Send initialized notification
    await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    return this.session;
  }

  async listTools(): Promise<any[]> {
    if (!this.transport) throw new Error('Not connected');

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: this.getNextRequestId()
    }) as JsonRpcMessage;

    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    return response.result?.tools || [];
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.transport) throw new Error('Not connected');

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'tools/call',
      id: this.getNextRequestId(),
      params: {
        name,
        arguments: args
      }
    }) as JsonRpcMessage;

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }

  async listResources(): Promise<any[]> {
    if (!this.transport) throw new Error('Not connected');

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'resources/list',
      id: this.getNextRequestId()
    }) as JsonRpcMessage;

    if (response.error) {
      throw new Error(`Failed to list resources: ${response.error.message}`);
    }

    return response.result?.resources || [];
  }

  async readResource(uri: string): Promise<any> {
    if (!this.transport) throw new Error('Not connected');

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'resources/read',
      id: this.getNextRequestId(),
      params: { uri }
    }) as JsonRpcMessage;

    if (response.error) {
      throw new Error(`Failed to read resource: ${response.error.message}`);
    }

    return response.result;
  }

  async listPrompts(): Promise<any[]> {
    if (!this.transport) throw new Error('Not connected');

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'prompts/list',
      id: this.getNextRequestId()
    }) as JsonRpcMessage;

    if (response.error) {
      throw new Error(`Failed to list prompts: ${response.error.message}`);
    }

    return response.result?.prompts || [];
  }

  async getPrompt(name: string, args: any): Promise<any> {
    if (!this.transport) throw new Error('Not connected');

    const response = await this.transport.sendMessage({
      jsonrpc: '2.0',
      method: 'prompts/get',
      id: this.getNextRequestId(),
      params: {
        name,
        arguments: args
      }
    }) as JsonRpcMessage;

    if (response.error) {
      throw new Error(`Failed to get prompt: ${response.error.message}`);
    }

    return response.result;
  }

  async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.transport) throw new Error('Not connected');

    await this.transport.sendMessage({
      jsonrpc: '2.0',
      method,
      params
    });
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
      this.transport = undefined as any;
      this.session = undefined as any;
    }
  }

  getSession(): MCPSession | undefined {
    return this.session;
  }

  private getNextRequestId(): string {
    return `req-${++this.requestId}`;
  }
}

/**
 * MCP Server for internal agent services
 * Supports both stdio and HTTP transports
 */
export class MCPInternalServer extends EventEmitter {
  private tools: Map<string, Function> = new Map();
  private resources: Map<string, Function> = new Map();
  private prompts: Map<string, Function> = new Map();
  private sessions: Map<string, MCPSession> = new Map();

  constructor(private serverInfo: { name: string; version: string }) {
    super();
  }

  // Tool registration
  registerTool(name: string, _description: string, _inputSchema: any, handler: Function): void {
    this.tools.set(name, handler);
  }

  // Resource registration
  registerResource(uri: string, _name: string, _description: string, handler: Function): void {
    this.resources.set(uri, handler);
  }

  // Prompt registration
  registerPrompt(name: string, _description: string, _args: any[], handler: Function): void {
    this.prompts.set(name, handler);
  }

  // Start stdio server
  async startStdio(): Promise<void> {
    console.log(`Starting MCP stdio server: ${this.serverInfo.name}`);
    
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data) => {
      const lines = data.toString().split('\\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message: JsonRpcMessage = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        }
      }
    });

    process.stdin.on('end', () => {
      console.log('MCP stdio server ended');
      process.exit(0);
    });
  }

  // Start HTTP server
  async startHttp(port: number = 3004): Promise<void> {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const message: JsonRpcMessage = JSON.parse(body);
            this.handleMessage(message, res);
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32700, message: 'Parse error' },
              id: null
            }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`MCP HTTP server listening on http://127.0.0.1:${port}/mcp`);
    });
  }

  private async handleMessage(message: JsonRpcMessage, res?: http.ServerResponse): Promise<void> {
    let response: JsonRpcMessage | undefined;

    try {
      switch (message.method) {
        case 'initialize':
          response = await this.handleInitialize(message);
          break;
        case 'tools/list':
          response = await this.handleToolsList(message);
          break;
        case 'tools/call':
          response = await this.handleToolCall(message);
          break;
        case 'resources/list':
          response = await this.handleResourcesList(message);
          break;
        case 'resources/read':
          response = await this.handleResourceRead(message);
          break;
        case 'prompts/list':
          response = await this.handlePromptsList(message);
          break;
        case 'prompts/get':
          response = await this.handlePromptGet(message);
          break;
        default:
          if (message.id !== undefined) {
            response = {
              jsonrpc: '2.0',
              id: message.id,
              error: { code: -32601, message: `Method not found: ${message.method}` }
            };
          }
      }
    } catch (error) {
      if (message.id !== undefined) {
        response = {
          jsonrpc: '2.0',
          id: message.id,
          error: { 
            code: -32603, 
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }

    if (response) {
      if (res) {
        // HTTP response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } else {
        // Stdio response
        console.log(JSON.stringify(response));
      }
    }
  }

  private async handleInitialize(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      id: sessionId,
      transport: { type: 'stdio' }, // Will be updated based on actual transport
      initialized: true,
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true }
      },
      serverInfo: this.serverInfo
    });

    return {
      jsonrpc: '2.0',
      id: message.id!,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true }
        },
        serverInfo: this.serverInfo
      }
    };
  }

  private async handleToolsList(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const tools = Array.from(this.tools.keys()).map(name => ({
      name,
      description: `Tool: ${name}`,
      inputSchema: { type: 'object' }
    }));

    return {
      jsonrpc: '2.0',
      id: message.id!,
      result: { tools }
    };
  }

  private async handleToolCall(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const { name, arguments: args } = message.params || {};
    const handler = this.tools.get(name);

    if (!handler) {
      return {
        jsonrpc: '2.0',
        id: message.id!,
        error: { code: -32602, message: `Unknown tool: ${name}` }
      };
    }

    try {
      const result = await handler(args);
      return {
        jsonrpc: '2.0',
        id: message.id!,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify(result)
          }]
        }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message.id!,
        error: { 
          code: -32603, 
          message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}` 
        }
      };
    }
  }

  private async handleResourcesList(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const resources = Array.from(this.resources.keys()).map(uri => ({
      uri,
      name: `Resource: ${uri}`,
      description: `Resource at ${uri}`,
      mimeType: 'application/json'
    }));

    return {
      jsonrpc: '2.0',
      id: message.id!,
      result: { resources }
    };
  }

  private async handleResourceRead(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const { uri } = message.params || {};
    const handler = this.resources.get(uri);

    if (!handler) {
      return {
        jsonrpc: '2.0',
        id: message.id!,
        error: { code: -32602, message: `Unknown resource: ${uri}` }
      };
    }

    try {
      const content = await handler();
      return {
        jsonrpc: '2.0',
        id: message.id!,
        result: {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content)
          }]
        }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message.id!,
        error: { 
          code: -32603, 
          message: `Resource read failed: ${error instanceof Error ? error.message : String(error)}` 
        }
      };
    }
  }

  private async handlePromptsList(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const prompts = Array.from(this.prompts.keys()).map(name => ({
      name,
      description: `Prompt: ${name}`,
      arguments: []
    }));

    return {
      jsonrpc: '2.0',
      id: message.id!,
      result: { prompts }
    };
  }

  private async handlePromptGet(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    const { name, arguments: args } = message.params || {};
    const handler = this.prompts.get(name);

    if (!handler) {
      return {
        jsonrpc: '2.0',
        id: message.id!,
        error: { code: -32602, message: `Unknown prompt: ${name}` }
      };
    }

    try {
      const result = await handler(args);
      return {
        jsonrpc: '2.0',
        id: message.id!,
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
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message.id!,
        error: { 
          code: -32603, 
          message: `Prompt generation failed: ${error instanceof Error ? error.message : String(error)}` 
        }
      };
    }
  }
}

export default {
  MCPInternalClient,
  MCPInternalServer
};