import {
  AgentId,
  AccessLevel,
  Timestamp
} from '../models/Types';
import { PolicyEngine } from './PolicyEngine';

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  id: string;
  name: string;
  endpoint: string;
  version: string;
  capabilities: MCPCapabilities;
  authentication?: {
    type: 'bearer' | 'api-key' | 'basic' | 'none';
    credentials?: Record<string, string>;
  };
  timeout?: number;
  retries?: number;
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit: number;
  };
}

/**
 * MCP protocol capabilities
 */
export interface MCPCapabilities {
  tools: ToolCapability[];
  resources: ResourceCapability[];
  prompts: PromptCapability[];
  sampling?: SamplingCapability;
}

/**
 * Tool capability definition
 */
export interface ToolCapability {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  permissions: AccessLevel[];
  rateLimits?: {
    callsPerMinute: number;
    maxConcurrent: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Resource capability definition
 */
export interface ResourceCapability {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
  permissions: AccessLevel[];
}

/**
 * Prompt capability definition
 */
export interface PromptCapability {
  name: string;
  description: string;
  arguments?: JSONSchemaProperty[];
}

/**
 * Sampling capability definition
 */
export interface SamplingCapability {
  supported: boolean;
  models?: string[];
}

/**
 * JSON Schema definition
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: any[];
  default?: any;
  format?: string;
}

/**
 * Tool execution request
 */
export interface ToolExecutionRequest {
  toolName: string;
  parameters: Record<string, any>;
  agentId: AgentId;
  context?: {
    sessionId?: string;
    conversationId?: string;
    metadata?: Record<string, any>;
  };
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    executionTime: number;
    resourcesUsed: any;
    cost?: number;
  };
}

/**
 * MCP Server registration status
 */
export interface MCPServerStatus {
  serverId: string;
  status: 'online' | 'offline' | 'error' | 'initializing';
  lastHealthCheck: Timestamp;
  responseTime: number;
  errorCount: number;
  totalRequests: number;
  successRate: number;
}

/**
 * Tool access control entry
 */
export interface ToolAccessControl {
  toolName: string;
  serverId: string;
  allowedAgents: AgentId[];
  deniedAgents: AgentId[];
  requiredPermissions: AccessLevel[];
  usageQuota?: {
    callsPerHour: number;
    callsPerDay: number;
  };
}

/**
 * Resource access request
 */
export interface ResourceAccessRequest {
  uri: string;
  agentId: AgentId;
  operation: 'read' | 'write' | 'list';
  parameters?: Record<string, any>;
}

/**
 * Manager for MCP (Model Context Protocol) servers and tool integration
 */
export class MCPServerManager {
  private servers: Map<string, MCPServerConfig> = new Map();
  private serverStatus: Map<string, MCPServerStatus> = new Map();
  private toolAccessControls: Map<string, ToolAccessControl> = new Map();
  private activeConnections: Map<string, any> = new Map(); // WebSocket or HTTP clients
  private policyEngine: PolicyEngine;

  constructor(policyEngine?: PolicyEngine) {
    this.policyEngine = policyEngine || new PolicyEngine();
  }

  /**
   * Register a new MCP server
   */
  async registerServer(config: MCPServerConfig, requesterId?: string): Promise<void> {
    // Check policy permissions for server registration
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'configuration',
        resourceId: config.id,
        operation: 'create',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    // Validate server configuration
    await this.validateServerConfig(config);

    // Register server
    this.servers.set(config.id, config);

    // Initialize server status
    this.serverStatus.set(config.id, {
      serverId: config.id,
      status: 'initializing',
      lastHealthCheck: Date.now().toString(),
      responseTime: 0,
      errorCount: 0,
      totalRequests: 0,
      successRate: 0
    });

    // Initialize tool access controls for server tools
    for (const tool of config.capabilities.tools) {
      const toolKey = `${config.id}:${tool.name}`;
      this.toolAccessControls.set(toolKey, {
        toolName: tool.name,
        serverId: config.id,
        allowedAgents: [],
        deniedAgents: [],
        requiredPermissions: tool.permissions
      });
    }

    // Establish connection to server
    await this.connectToServer(config.id);
  }

  /**
   * Unregister an MCP server
   */
  async unregisterServer(serverId: string, requesterId?: string): Promise<void> {
    // Check policy permissions
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'configuration',
        resourceId: serverId,
        operation: 'delete',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    // Disconnect from server
    await this.disconnectFromServer(serverId);

    // Remove server and related data
    this.servers.delete(serverId);
    this.serverStatus.delete(serverId);
    this.activeConnections.delete(serverId);

    // Remove tool access controls
    Array.from(this.toolAccessControls.entries()).forEach(([key, control]) => {
      if (control.serverId === serverId) {
        this.toolAccessControls.delete(key);
      }
    });
  }

  /**
   * Execute a tool through an MCP server
   */
  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const toolKey = this.findToolServer(request.toolName);
    if (!toolKey) {
      throw new Error(`Tool ${request.toolName} not found in any registered server`);
    }

    const parts = toolKey.split(':');
    if (parts.length < 2 || !parts[0]) {
      throw new Error(`Invalid tool key format: ${toolKey}`);
    }

    const serverId = parts[0];
    const server = this.servers.get(serverId);
    const accessControl = this.toolAccessControls.get(toolKey);

    if (!server || !accessControl) {
      throw new Error(`Server or access control not found for tool ${request.toolName}`);
    }

    // Check tool access permissions
    await this.checkToolAccess(request.agentId, toolKey);

    // Check server health
    const status = this.serverStatus.get(serverId);
    if (!status || status.status !== 'online') {
      throw new Error(`Server ${serverId} is not available (status: ${status?.status})`);
    }

    const startTime = Date.now();

    try {
      // Execute tool via MCP protocol
      const result = await this.executeToolOnServer(serverId, request);
      
      // Update server statistics
      this.updateServerStats(serverId, true, Date.now() - startTime);
      
      return result;

    } catch (error) {
      // Update server statistics for failure
      this.updateServerStats(serverId, false, Date.now() - startTime);
      
      return {
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown execution error',
          details: error
        },
        metadata: {
          executionTime: Date.now() - startTime,
          resourcesUsed: {},
        }
      };
    }
  }

  /**
   * Access a resource through an MCP server
   */
  async accessResource(request: ResourceAccessRequest): Promise<any> {
    const serverId = this.findResourceServer(request.uri);
    if (!serverId) {
      throw new Error(`No server found that can handle resource ${request.uri}`);
    }

    // Check resource access permissions
    const accessDecision = await this.policyEngine.checkAccess({
      subjectId: request.agentId,
      subjectType: 'agent',
      resourceType: 'tool',
      resourceId: request.uri,
      operation: request.operation,
      requestedAccess: request.operation === 'read' ? 'read' : 'write'
    });

    if (!accessDecision.allowed) {
      throw new Error(`Access denied to resource ${request.uri}: ${accessDecision.reason}`);
    }

    return this.accessResourceOnServer(serverId, request);
  }

  /**
   * Get available tools from all registered servers
   */
  async getAvailableTools(agentId?: AgentId): Promise<ToolCapability[]> {
    const tools: ToolCapability[] = [];

    Array.from(this.servers.entries()).forEach(([serverId, server]) => {
      const status = this.serverStatus.get(serverId);
      if (status?.status !== 'online') {
        return; // Skip offline servers
      }

      server.capabilities.tools.forEach(async (tool) => {
        // Check if agent has access to this tool
        if (agentId) {
          const toolKey = `${serverId}:${tool.name}`;
          try {
            await this.checkToolAccess(agentId, toolKey);
            tools.push(tool);
          } catch {
            // Agent doesn't have access, skip this tool
          }
        } else {
          tools.push(tool);
        }
      });
    });

    return tools;
  }

  /**
   * Get server status for all registered servers
   */
  async getServerStatuses(): Promise<MCPServerStatus[]> {
    return Array.from(this.serverStatus.values());
  }

  /**
   * Perform health check on a specific server
   */
  async healthCheckServer(serverId: string): Promise<MCPServerStatus> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const startTime = Date.now();
    let status: MCPServerStatus['status'] = 'error';
    let responseTime = 0;

    try {
      // Attempt to ping the server
      await this.pingServer(serverId);
      status = 'online';
      responseTime = Date.now() - startTime;
    } catch (error) {
      status = 'error';
      responseTime = Date.now() - startTime;
    }

    const serverStatus: MCPServerStatus = {
      serverId,
      status,
      lastHealthCheck: Date.now().toString(),
      responseTime,
      errorCount: this.serverStatus.get(serverId)?.errorCount || 0,
      totalRequests: this.serverStatus.get(serverId)?.totalRequests || 0,
      successRate: this.calculateSuccessRate(serverId)
    };

    this.serverStatus.set(serverId, serverStatus);
    return serverStatus;
  }

  /**
   * Grant tool access to an agent
   */
  async grantToolAccess(
    toolName: string,
    agentId: AgentId,
    requesterId?: string
  ): Promise<void> {
    // Check policy permissions for access management
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'tool',
        resourceId: toolName,
        operation: 'update',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    const toolKey = this.findToolServer(toolName);
    if (!toolKey) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const accessControl = this.toolAccessControls.get(toolKey);
    if (!accessControl) {
      throw new Error(`Access control not found for tool ${toolName}`);
    }

    // Add agent to allowed list and remove from denied list
    if (!accessControl.allowedAgents.includes(agentId)) {
      accessControl.allowedAgents.push(agentId);
    }
    accessControl.deniedAgents = accessControl.deniedAgents.filter(id => id !== agentId);

    this.toolAccessControls.set(toolKey, accessControl);
  }

  /**
   * Revoke tool access from an agent
   */
  async revokeToolAccess(toolName: string, agentId: AgentId, requesterId?: string): Promise<void> {
    // Check policy permissions
    if (requesterId) {
      const accessDecision = await this.policyEngine.checkAccess({
        subjectId: requesterId,
        subjectType: 'user',
        resourceType: 'tool',
        resourceId: toolName,
        operation: 'update',
        requestedAccess: 'admin'
      });

      if (!accessDecision.allowed) {
        throw new Error(`Access denied: ${accessDecision.reason}`);
      }
    }

    const toolKey = this.findToolServer(toolName);
    if (!toolKey) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const accessControl = this.toolAccessControls.get(toolKey);
    if (!accessControl) {
      throw new Error(`Access control not found for tool ${toolName}`);
    }

    // Remove agent from allowed list and add to denied list
    accessControl.allowedAgents = accessControl.allowedAgents.filter(id => id !== agentId);
    if (!accessControl.deniedAgents.includes(agentId)) {
      accessControl.deniedAgents.push(agentId);
    }

    this.toolAccessControls.set(toolKey, accessControl);
  }

  // Private helper methods

  private async validateServerConfig(config: MCPServerConfig): Promise<void> {
    if (!config.id?.trim()) {
      throw new Error('Server ID is required');
    }

    if (!config.endpoint?.trim()) {
      throw new Error('Server endpoint is required');
    }

    if (this.servers.has(config.id)) {
      throw new Error(`Server with ID ${config.id} already exists`);
    }

    // Validate endpoint URL
    try {
      new URL(config.endpoint);
    } catch {
      throw new Error('Invalid server endpoint URL');
    }
  }

  private async connectToServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // For now, we'll use a simple HTTP client approach
    // In a full implementation, this would establish WebSocket connections
    // or configure appropriate HTTP clients based on server capabilities
    this.activeConnections.set(serverId, {
      endpoint: server.endpoint,
      connected: true,
      lastActivity: Date.now()
    });

    // Update server status to online
    const status = this.serverStatus.get(serverId);
    if (status) {
      status.status = 'online';
      this.serverStatus.set(serverId, status);
    }
  }

  private async disconnectFromServer(serverId: string): Promise<void> {
    const connection = this.activeConnections.get(serverId);
    if (connection) {
      // Close connection (implementation depends on connection type)
      connection.connected = false;
    }

    // Update server status
    const status = this.serverStatus.get(serverId);
    if (status) {
      status.status = 'offline';
      this.serverStatus.set(serverId, status);
    }
  }

  private findToolServer(toolName: string): string | null {
    const entries = Array.from(this.toolAccessControls.entries());
    for (const [key, control] of entries) {
      if (control.toolName === toolName) {
        return key;
      }
    }
    return null;
  }

  private findResourceServer(uri: string): string | null {
    const servers = Array.from(this.servers.entries());
    for (const [serverId, server] of servers) {
      for (const resource of server.capabilities.resources) {
        if (resource.uri === uri || uri.startsWith(resource.uri)) {
          return serverId;
        }
      }
    }
    return null;
  }

  private async checkToolAccess(agentId: AgentId, toolKey: string): Promise<void> {
    const accessControl = this.toolAccessControls.get(toolKey);
    if (!accessControl) {
      throw new Error('Tool access control not found');
    }

    // Check if agent is explicitly denied
    if (accessControl.deniedAgents.includes(agentId)) {
      throw new Error('Agent access explicitly denied for this tool');
    }

    // Check if agent is explicitly allowed
    if (accessControl.allowedAgents.includes(agentId)) {
      return; // Access granted
    }

    // If no explicit allow/deny, check policy engine
    const accessDecision = await this.policyEngine.checkAccess({
      subjectId: agentId,
      subjectType: 'agent',
      resourceType: 'tool',
      resourceId: accessControl.toolName,
      operation: 'execute',
      requestedAccess: 'write'
    });

    if (!accessDecision.allowed) {
      throw new Error(`Tool access denied: ${accessDecision.reason}`);
    }
  }

  private async executeToolOnServer(
    serverId: string,
    request: ToolExecutionRequest
  ): Promise<ToolExecutionResult> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Simulated tool execution - in a real implementation, this would
    // make HTTP requests or send messages via WebSocket to the MCP server
    const response = await this.makeRequest(server.endpoint, {
      method: 'tools/call',
      params: {
        name: request.toolName,
        arguments: request.parameters
      }
    });

    return {
      success: true,
      data: response,
      metadata: {
        executionTime: 100, // Placeholder
        resourcesUsed: {}
      }
    };
  }

  private async accessResourceOnServer(
    serverId: string,
    request: ResourceAccessRequest
  ): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Simulated resource access
    const response = await this.makeRequest(server.endpoint, {
      method: 'resources/read',
      params: {
        uri: request.uri,
        operation: request.operation,
        ...request.parameters
      }
    });

    return response;
  }

  private async pingServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Simple health check ping
    await this.makeRequest(server.endpoint, {
      method: 'ping'
    });
  }

  private async makeRequest(_endpoint: string, _data: any): Promise<any> {
    // Simulated HTTP request - in a real implementation, this would use fetch or axios
    // with proper error handling, timeouts, and authentication
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, data: 'simulated response' });
      }, 50);
    });
  }

  private updateServerStats(serverId: string, success: boolean, responseTime: number): void {
    const status = this.serverStatus.get(serverId);
    if (!status) return;

    status.totalRequests++;
    status.responseTime = responseTime;
    
    if (!success) {
      status.errorCount++;
    }

    status.successRate = this.calculateSuccessRate(serverId);
    this.serverStatus.set(serverId, status);
  }

  private calculateSuccessRate(serverId: string): number {
    const status = this.serverStatus.get(serverId);
    if (!status || status.totalRequests === 0) return 0;

    const successCount = status.totalRequests - status.errorCount;
    return (successCount / status.totalRequests) * 100;
  }
}

export default MCPServerManager;
