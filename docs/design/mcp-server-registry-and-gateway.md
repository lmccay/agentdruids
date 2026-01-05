# MCP Server Registry and Gateway Design

## Executive Summary

This design establishes a comprehensive MCP (Model Context Protocol) server integration infrastructure for Druids, enabling:

1. **Global MCP Server Registry** - Centralized catalog of available MCP servers
2. **Realm-Specific Bindings** - Configure MCP servers per realm with overrides
3. **MCP Gateway** - Enforce access policy for elemental tool usage
4. **User-Delegated Authentication** - Pass user OAuth tokens to MCP servers

## Current State Analysis

### Existing Infrastructure

**What exists:**
- `routeToolThroughMCPGateway` in AgentService (lines 1800-1871)
  - Makes HTTP POST to MCP Gateway
  - Validates agent has permission to use tools
  - Routes MCP JSON-RPC requests
- Agent model has `mcpTools: string[]` field
- Realm model has `toolPolicies` for access control
- Agent model has `networkInfo` for external agents

**What's missing:**
- Global registry of MCP servers
- MCP server configuration (endpoint, transport, auth)
- Realm-specific MCP server bindings
- Elemental-to-MCP-server mapping
- MCP Gateway service implementation
- User token injection mechanism for MCP calls

### Gap Analysis

```
Current flow (partially implemented):
  Agent → routeToolThroughMCPGateway() → HTTP POST to gateway URL

  Problems:
  - No registry of MCP servers
  - Gateway URL is hardcoded
  - No realm-specific configuration
  - No tool discovery from MCP servers
  - No user token passing
```

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                        Druids Platform                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                 Coordination Layer                           │ │
│  │                                                              │ │
│  │  Coordinator → Druid → Elemental (realm-bound)               │ │
│  └────────────────────────────────┬─────────────────────────────┘ │
│                                   │                               │
│  ┌────────────────────────────────▼─────────────────────────────┐ │
│  │              MCP Gateway Service                             │ │
│  │                                                              │ │
│  │  • Validates elemental tool access (realm policies)          │ │
│  │  • Retrieves user OAuth token (user-delegated)               │ │
│  │  • Routes to appropriate MCP Server                          │ │
│  │  • Enforces rate limits, quotas, audit logging               │ │
│  └────────────────────────────────┬─────────────────────────────┘ │
│                                   │                               │
│  ┌────────────────────────────────▼─────────────────────────────┐ │
│  │           MCP Server Registry                                │ │
│  │                                                              │ │
│  │  Global catalog of MCP Servers:                              │ │
│  │    • github-mcp-server                                       │ │
│  │    • slack-mcp-server                                        │ │
│  │    • aws-mcp-server                                          │ │
│  │    • ...                                                     │ │
│  │                                                              │ │
│  │  Realm-specific bindings:                                    │ │
│  │    • oss-realm → github-mcp-server (config overrides)        │ │
│  │    • enterprise-realm → gitlab-mcp-server (config)           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
└────────────────────────────────┬──────────────────────────────────┘
                                 │ MCP Protocol (stdio/HTTP/SSE)
┌────────────────────────────────▼──────────────────────────────────┐
│                    External MCP Servers                           │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   GitHub     │  │    Slack     │  │     AWS      │             │
│  │  MCP Server  │  │  MCP Server  │  │  MCP Server  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                   │
│  Each server exposes MCP tools via standard protocol              │
│  Receives user OAuth tokens for authentication                    │
└───────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. MCP Server Registry

**Purpose:** Global catalog of available MCP servers with their configurations.

#### Data Model

```typescript
/**
 * MCP Server registration in global registry
 */
interface MCPServerRegistration {
  id: string;                          // e.g., "github-mcp-server"
  name: string;                        // e.g., "GitHub MCP Server"
  description: string;
  version: string;

  // Server location and transport
  connection: {
    transport: 'stdio' | 'http' | 'sse';

    // For stdio transport
    command?: string;                  // e.g., "npx @modelcontextprotocol/server-github"
    args?: string[];
    env?: Record<string, string>;

    // For HTTP transport
    baseUrl?: string;                  // e.g., "https://github-mcp.example.com"

    // For SSE transport
    sseUrl?: string;
  };

  // Authentication requirements
  authentication: {
    required: boolean;
    type: 'oauth' | 'api_key' | 'bearer' | 'none';
    scopes?: string[];                 // OAuth scopes needed
    tokenEnvVar?: string;              // Which env var to set (e.g., "GITHUB_TOKEN")
  };

  // Available tools (discovered or declared)
  tools: {
    name: string;
    description: string;
    inputSchema: any;                  // JSON Schema
    category?: string;                 // e.g., "repository", "issue", "pull_request"
  }[];

  // Metadata
  provider: string;                    // e.g., "GitHub", "Slack", "Anthropic"
  documentationUrl?: string;
  sourceUrl?: string;
  tags: string[];

  // Lifecycle
  status: 'active' | 'deprecated' | 'beta' | 'experimental';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Storage: MCPServerRegistry
 * Location: /Users/lmccay/Projects/druids/src/services/MCPServerRegistry.ts
 */
class MCPServerRegistry {
  private servers: Map<string, MCPServerRegistration>;

  async registerServer(registration: MCPServerRegistration): Promise<void>;
  async getServer(serverId: string): Promise<MCPServerRegistration | null>;
  async listServers(filters?: { tags?: string[], status?: string }): Promise<MCPServerRegistration[]>;
  async updateServer(serverId: string, updates: Partial<MCPServerRegistration>): Promise<void>;
  async unregisterServer(serverId: string): Promise<void>;
  async discoverTools(serverId: string): Promise<MCPToolDescriptor[]>;
}
```

#### Storage

```typescript
// File: /Users/lmccay/Projects/druids/data/mcp-servers/registry.json
{
  "servers": [
    {
      "id": "github-mcp-server",
      "name": "GitHub MCP Server",
      "description": "Official GitHub MCP server for repository operations",
      "version": "1.0.0",
      "connection": {
        "transport": "stdio",
        "command": "npx",
        "args": ["@modelcontextprotocol/server-github"],
        "env": {}
      },
      "authentication": {
        "required": true,
        "type": "oauth",
        "scopes": ["repo", "read:user"],
        "tokenEnvVar": "GITHUB_TOKEN"
      },
      "tools": [
        {
          "name": "list_pull_requests",
          "description": "List pull requests in a repository",
          "inputSchema": { /* JSON Schema */ }
        }
      ],
      "provider": "GitHub",
      "status": "active",
      "createdAt": "2025-01-03T00:00:00Z"
    }
  ]
}
```

### 2. Realm MCP Bindings

**Purpose:** Configure which MCP servers are available in each realm with realm-specific overrides.

#### Data Model

```typescript
/**
 * MCP Server binding for a specific realm
 */
interface RealmMCPBinding {
  bindingId: string;
  realmId: string;
  mcpServerId: string;                 // Reference to MCPServerRegistration.id

  // Binding configuration
  enabled: boolean;
  priority: number;                    // For tool name conflicts (higher = preferred)

  // Configuration overrides (override global MCPServerRegistration)
  configOverrides?: {
    connection?: {
      baseUrl?: string;                // Different URL for this realm
      env?: Record<string, string>;    // Realm-specific env vars
    };
    authentication?: {
      scopes?: string[];               // Narrower scopes for this realm
    };
  };

  // Access control for this binding
  accessControl: {
    allowedElementalIds?: string[];    // Specific elementals that can use this
    allowedAgentTypes?: AgentType[];   // Or by agent type
    allowedToolPatterns?: string[];    // Glob patterns like "list_*", "get_*"
    deniedToolPatterns?: string[];     // Explicit denials
  };

  // Tool-specific policies (overrides realm-level policies)
  toolPolicies?: {
    [toolName: string]: {
      enabled: boolean;
      rateLimit?: {
        requestsPerMinute: number;
        burstSize: number;
      };
      requiresApproval?: boolean;
      auditLevel?: 'none' | 'basic' | 'detailed' | 'comprehensive';
    };
  };

  // Lifecycle
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Add to Realm model
 */
interface Realm {
  // ... existing fields ...

  mcpBindings: RealmMCPBinding[];      // NEW: MCP server bindings for this realm
}
```

#### Storage

Realm MCP bindings stored as part of Realm document:

```json
{
  "id": "oss-realm",
  "name": "Open Source Development",
  "mcpBindings": [
    {
      "bindingId": "oss-github-binding",
      "realmId": "oss-realm",
      "mcpServerId": "github-mcp-server",
      "enabled": true,
      "priority": 10,
      "accessControl": {
        "allowedAgentTypes": ["elemental"],
        "allowedToolPatterns": ["list_*", "get_*", "create_review_comment"]
      },
      "toolPolicies": {
        "list_pull_requests": {
          "enabled": true,
          "rateLimit": {
            "requestsPerMinute": 60,
            "burstSize": 10
          },
          "auditLevel": "basic"
        }
      }
    }
  ]
}
```

### 3. Elemental MCP Tool Access

**Purpose:** Grant elementals explicit access to MCP tools from bound servers.

#### Data Model

```typescript
/**
 * Elemental agent with MCP tool access
 */
interface ElementalAgent extends Agent {
  type: 'elemental';
  realmId: string;                     // Elemental is bound to a realm

  // MCP tool access configuration
  mcpAccess: {
    serverId: string;                  // Which MCP server this elemental uses
    allowedTools: string[];            // Explicit tool names or "*" for all

    // Tool name mapping (optional)
    toolAliases?: {
      [internalName: string]: string;  // Map internal name → MCP tool name
    };
  };

  // Existing fields
  mcpTools: string[];                  // List of tool names elemental can call
  // ...
}
```

#### Example

```json
{
  "agentId": "github-elemental-1",
  "type": "elemental",
  "name": "GitHub Interface",
  "realmId": "oss-realm",

  "mcpAccess": {
    "serverId": "github-mcp-server",
    "allowedTools": [
      "list_pull_requests",
      "get_pull_request",
      "create_review_comment",
      "get_file_contents"
    ]
  },

  "mcpTools": [
    "list_pull_requests",
    "get_pull_request",
    "create_review_comment",
    "get_file_contents"
  ]
}
```

### 4. MCP Gateway Service

**Purpose:** Enforce access policy and route tool calls to MCP servers.

#### Service Implementation

```typescript
/**
 * File: /Users/lmccay/Projects/druids/src/services/MCPGatewayService.ts
 */
class MCPGatewayService {
  private registry: MCPServerRegistry;
  private realmService: RealmService;
  private tokenManager: TokenManager;      // User OAuth token management
  private mcpClientPool: MCPClientPool;    // Connection pool for MCP servers

  /**
   * Route tool call from elemental to appropriate MCP server
   */
  async routeToolCall(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    // 1. Validate request
    const { agentId, toolName, params, userContext } = request;

    // 2. Get agent and verify it's an elemental
    const agent = await this.getAgent(agentId);
    if (agent.type !== 'elemental') {
      throw new Error(`Only elementals can call MCP tools. Agent ${agentId} is type ${agent.type}`);
    }

    // 3. Get agent's realm
    const realm = await this.realmService.getRealm(agent.realmId);
    if (!realm) {
      throw new Error(`Realm ${agent.realmId} not found`);
    }

    // 4. Find which MCP server provides this tool
    const binding = this.findMCPBinding(realm, toolName, agent);
    if (!binding) {
      throw new Error(`Tool ${toolName} not available in realm ${realm.name}`);
    }

    // 5. Validate agent has permission to use this tool
    await this.validateToolAccess(agent, binding, toolName);

    // 6. Check tool-specific policies (rate limits, quotas)
    await this.enforceToolPolicies(agent, binding, toolName);

    // 7. Get user's OAuth token for the service
    const userToken = await this.getUserToken(userContext, binding.mcpServerId);

    // 8. Get MCP server registration
    const serverReg = await this.registry.getServer(binding.mcpServerId);
    if (!serverReg) {
      throw new Error(`MCP server ${binding.mcpServerId} not registered`);
    }

    // 9. Get or create MCP client connection
    const mcpClient = await this.mcpClientPool.getClient(
      serverReg,
      binding.configOverrides,
      userToken
    );

    // 10. Call MCP server tool
    const result = await mcpClient.callTool(toolName, params);

    // 11. Audit log the call
    await this.auditLog({
      agentId,
      toolName,
      realmId: realm.id,
      mcpServerId: serverReg.id,
      userId: userContext.userId,
      timestamp: Date.now(),
      success: true,
      result: result
    });

    return result;
  }

  /**
   * Find MCP binding that provides the requested tool
   */
  private findMCPBinding(
    realm: Realm,
    toolName: string,
    agent: Agent
  ): RealmMCPBinding | null {
    // Check all bindings in priority order
    const sortedBindings = realm.mcpBindings
      .filter(b => b.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const binding of sortedBindings) {
      // Check if agent is allowed to use this binding
      if (!this.isAgentAllowed(binding, agent)) {
        continue;
      }

      // Check if tool is allowed by patterns
      if (!this.isToolAllowed(binding, toolName)) {
        continue;
      }

      // Check if MCP server provides this tool
      const server = await this.registry.getServer(binding.mcpServerId);
      if (server && server.tools.some(t => t.name === toolName)) {
        return binding;
      }
    }

    return null;
  }

  /**
   * Validate agent has permission to use tool
   */
  private async validateToolAccess(
    agent: Agent,
    binding: RealmMCPBinding,
    toolName: string
  ): Promise<void> {
    // Check agent's mcpTools list
    if (!agent.mcpTools.includes(toolName)) {
      throw new Error(
        `Agent ${agent.id} not authorized to use tool ${toolName}`
      );
    }

    // Check binding's access control
    const { accessControl } = binding;

    if (accessControl.allowedElementalIds) {
      if (!accessControl.allowedElementalIds.includes(agent.id)) {
        throw new Error(
          `Agent ${agent.id} not in allowed elemental list for this binding`
        );
      }
    }

    if (accessControl.deniedToolPatterns) {
      for (const pattern of accessControl.deniedToolPatterns) {
        if (minimatch(toolName, pattern)) {
          throw new Error(
            `Tool ${toolName} explicitly denied by binding policy`
          );
        }
      }
    }
  }

  /**
   * Enforce tool-specific policies (rate limits, quotas)
   */
  private async enforceToolPolicies(
    agent: Agent,
    binding: RealmMCPBinding,
    toolName: string
  ): Promise<void> {
    const toolPolicy = binding.toolPolicies?.[toolName];
    if (!toolPolicy) return;

    if (!toolPolicy.enabled) {
      throw new Error(`Tool ${toolName} is disabled in this realm`);
    }

    // Check rate limit
    if (toolPolicy.rateLimit) {
      const allowed = await this.checkRateLimit(
        agent.id,
        toolName,
        toolPolicy.rateLimit
      );
      if (!allowed) {
        throw new Error(
          `Rate limit exceeded for tool ${toolName}`
        );
      }
    }

    // Check if approval required
    if (toolPolicy.requiresApproval) {
      // TODO: Implement approval workflow
      throw new Error(
        `Tool ${toolName} requires approval (not yet implemented)`
      );
    }
  }

  /**
   * Get user's OAuth token for MCP server service
   */
  private async getUserToken(
    userContext: UserContext,
    mcpServerId: string
  ): Promise<string | null> {
    const serverReg = await this.registry.getServer(mcpServerId);
    if (!serverReg || !serverReg.authentication.required) {
      return null;
    }

    // Map MCP server to service name for token lookup
    const serviceMap: Record<string, string> = {
      'github-mcp-server': 'github',
      'slack-mcp-server': 'slack',
      'gitlab-mcp-server': 'gitlab'
    };

    const serviceName = serviceMap[mcpServerId];
    if (!serviceName) {
      throw new Error(`Unknown service for MCP server ${mcpServerId}`);
    }

    // Retrieve user's OAuth token
    const token = await this.tokenManager.getAccessToken(
      userContext.userId,
      serviceName
    );

    if (!token) {
      throw new Error(
        `User ${userContext.userId} has not authorized ${serviceName}`
      );
    }

    return token;
  }
}

/**
 * Request/Response types
 */
interface MCPToolCallRequest {
  agentId: string;
  toolName: string;
  params: any;
  userContext: {
    userId: string;
    sessionId: string;
  };
}

interface MCPToolCallResponse {
  content: any[];
  isError?: boolean;
}
```

### 5. MCP Client Pool

**Purpose:** Manage connections to MCP servers (stdio processes, HTTP clients).

```typescript
/**
 * File: /Users/lmccay/Projects/druids/src/services/MCPClientPool.ts
 */
class MCPClientPool {
  private clients: Map<string, MCPClient>;

  /**
   * Get or create MCP client for server
   */
  async getClient(
    serverReg: MCPServerRegistration,
    configOverrides?: any,
    userToken?: string
  ): Promise<MCPClient> {
    const clientKey = `${serverReg.id}:${userToken || 'default'}`;

    if (this.clients.has(clientKey)) {
      return this.clients.get(clientKey)!;
    }

    // Create new client based on transport
    const client = await this.createClient(
      serverReg,
      configOverrides,
      userToken
    );

    this.clients.set(clientKey, client);
    return client;
  }

  private async createClient(
    serverReg: MCPServerRegistration,
    configOverrides?: any,
    userToken?: string
  ): Promise<MCPClient> {
    const { connection } = serverReg;

    switch (connection.transport) {
      case 'stdio':
        return new StdioMCPClient(
          connection.command!,
          connection.args || [],
          this.buildEnv(serverReg, configOverrides, userToken)
        );

      case 'http':
        return new HttpMCPClient(
          connection.baseUrl!,
          userToken
        );

      case 'sse':
        return new SSEMCPClient(
          connection.sseUrl!,
          userToken
        );

      default:
        throw new Error(`Unsupported transport: ${connection.transport}`);
    }
  }

  private buildEnv(
    serverReg: MCPServerRegistration,
    configOverrides?: any,
    userToken?: string
  ): Record<string, string> {
    const env = { ...connection.env };

    // Apply config overrides
    if (configOverrides?.connection?.env) {
      Object.assign(env, configOverrides.connection.env);
    }

    // Inject user token
    if (userToken && serverReg.authentication.tokenEnvVar) {
      env[serverReg.authentication.tokenEnvVar] = userToken;
    }

    return env;
  }
}

/**
 * Base MCP Client interface
 */
interface MCPClient {
  callTool(toolName: string, params: any): Promise<any>;
  listTools(): Promise<MCPToolDescriptor[]>;
  close(): Promise<void>;
}

/**
 * Stdio transport implementation
 */
class StdioMCPClient implements MCPClient {
  private process: ChildProcess;

  constructor(command: string, args: string[], env: Record<string, string>) {
    this.process = spawn(command, args, { env });
    // Setup stdio communication using MCP JSON-RPC protocol
  }

  async callTool(toolName: string, params: any): Promise<any> {
    // Send tools/call request via stdin
    // Read response from stdout
    // Return result
  }

  async listTools(): Promise<MCPToolDescriptor[]> {
    // Send tools/list request
    // Parse response
  }

  async close(): Promise<void> {
    this.process.kill();
  }
}
```

## User Flow Example

### Scenario: Alice Reviews PRs via GitHub Elemental

```
1. Alice issues command:
   "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
    to review open PRs in druids repository"

2. Coordinator validates and executes orchestration

3. Code-Reviewer Druid travels to oss-realm

4. Druid → GitHub Elemental: "List open PRs for druids repo"

5. GitHub Elemental → MCP Gateway:
   routeToolCall({
     agentId: "github-elemental-1",
     toolName: "list_pull_requests",
     params: { owner: "alice", repo: "druids", state: "open" },
     userContext: { userId: "alice", sessionId: "..." }
   })

6. MCP Gateway validates:
   ✓ github-elemental-1 is type 'elemental'
   ✓ elemental bound to oss-realm
   ✓ oss-realm has binding for github-mcp-server
   ✓ binding allows list_pull_requests tool
   ✓ elemental's mcpTools includes list_pull_requests
   ✓ Rate limits not exceeded
   ✓ Alice has authorized GitHub (OAuth token exists)

7. MCP Gateway retrieves:
   - Alice's GitHub OAuth token from TokenManager
   - GitHub MCP server registration from registry
   - Realm-specific config overrides (if any)

8. MCP Gateway → MCP Client Pool:
   getClient("github-mcp-server", config, alice_token)

9. MCP Client Pool:
   - Spawns stdio process: npx @modelcontextprotocol/server-github
   - Sets GITHUB_TOKEN=alice_token in environment
   - Returns connected client

10. MCP Client → GitHub MCP Server:
    JSON-RPC: tools/call
    {
      "method": "tools/call",
      "params": {
        "name": "list_pull_requests",
        "arguments": { "owner": "alice", "repo": "druids", "state": "open" }
      }
    }

11. GitHub MCP Server → GitHub API:
    GET /repos/alice/druids/pulls?state=open
    Authorization: token alice_token

12. GitHub API → MCP Server → Client → Gateway → Elemental → Druid
    [ { number: 123, title: "Add feature X", ... } ]

13. Druid analyzes and posts review comments (same flow)
```

## Data Flow Diagram

```
┌───────────┐
│   User    │
│  (Alice)  │
└─────┬─────┘
      │
      │ OAuth authorizes Druids → GitHub (once)
      ↓
┌─────────────────────────────────┐
│      TokenManager               │
│  Stores: alice → github → token │
└─────────────────────────────────┘
      ↑
      │ getAccessToken(alice, github)
      │
┌─────┴────────────────────────────────────────┐
│           MCP Gateway Service                │
│                                              │
│  1. Validates elemental tool access          │
│  2. Retrieves user OAuth token               │
│  3. Routes to MCP server                     │
└─────┬────────────────────────────────────────┘
      │
      │ Consults
      ↓
┌─────────────────────────────────┐
│    MCP Server Registry          │
│                                 │
│  github-mcp-server:             │
│    • transport: stdio           │
│    • tokenEnvVar: GITHUB_TOKEN  │
│    • tools: [...]               │
└─────────────────────────────────┘
      │
      │ Consults
      ↓
┌─────────────────────────────────┐
│        Realm (oss-realm)        │
│                                 │
│  mcpBindings:                   │
│    - mcpServerId: github-...    │
│      accessControl: {...}       │
│      toolPolicies: {...}        │
└─────────────────────────────────┘
      │
      │ Creates client with token
      ↓
┌─────────────────────────────────┐
│      MCP Client Pool            │
│                                 │
│  Manages stdio/HTTP connections │
│  Injects user tokens            │
└─────┬───────────────────────────┘
      │
      │ MCP JSON-RPC
      ↓
┌─────────────────────────────────┐
│   GitHub MCP Server (external)  │
│   Env: GITHUB_TOKEN=alice_token │
└─────┬───────────────────────────┘
      │
      │ GitHub REST API
      ↓
┌─────────────────────────────────┐
│        GitHub.com               │
│   (Alice's repositories)        │
└─────────────────────────────────┘
```

## Implementation Plan

### Phase 1: MCP Server Registry

**Goal:** Build global registry of MCP servers

**Tasks:**
1. Create `MCPServerRegistration` interface in `/src/models/MCPServer.ts`
2. Implement `MCPServerRegistry` service in `/src/services/MCPServerRegistry.ts`
3. Create storage layer (`/data/mcp-servers/registry.json`)
4. Implement API endpoints:
   - `POST /mcp-servers` - Register new server
   - `GET /mcp-servers` - List registered servers
   - `GET /mcp-servers/:id` - Get server details
   - `PUT /mcp-servers/:id` - Update server
   - `DELETE /mcp-servers/:id` - Unregister server
   - `POST /mcp-servers/:id/discover` - Discover tools from server

**Deliverables:**
- [ ] MCPServerRegistration data model
- [ ] MCPServerRegistry service implementation
- [ ] API endpoints
- [ ] Tests

### Phase 2: Realm MCP Bindings

**Goal:** Configure MCP servers per realm

**Tasks:**
1. Add `RealmMCPBinding` interface to `/src/models/Realm.ts`
2. Add `mcpBindings: RealmMCPBinding[]` field to Realm model
3. Update `RealmService` to manage bindings
4. Implement API endpoints:
   - `POST /realms/:id/mcp-bindings` - Add binding
   - `GET /realms/:id/mcp-bindings` - List bindings
   - `PUT /realms/:id/mcp-bindings/:bindingId` - Update binding
   - `DELETE /realms/:id/mcp-bindings/:bindingId` - Remove binding

**Deliverables:**
- [ ] RealmMCPBinding data model
- [ ] Updated Realm model
- [ ] RealmService binding management
- [ ] API endpoints
- [ ] Tests

### Phase 3: MCP Client Pool

**Goal:** Manage connections to MCP servers

**Tasks:**
1. Create `MCPClient` interface in `/src/services/mcp/MCPClient.ts`
2. Implement `StdioMCPClient` for stdio transport
3. Implement `HttpMCPClient` for HTTP transport
4. Implement `MCPClientPool` for connection management
5. Implement MCP JSON-RPC protocol handling

**Deliverables:**
- [ ] MCPClient interface
- [ ] StdioMCPClient implementation
- [ ] HttpMCPClient implementation
- [ ] MCPClientPool service
- [ ] Tests

### Phase 4: MCP Gateway Service

**Goal:** Route and enforce access policy

**Tasks:**
1. Create `MCPGatewayService` in `/src/services/MCPGatewayService.ts`
2. Implement `routeToolCall` method
3. Implement access validation logic
4. Implement rate limiting
5. Implement audit logging
6. Integrate with TokenManager for user tokens
7. Update `AgentService.routeToolThroughMCPGateway` to use new gateway

**Deliverables:**
- [ ] MCPGatewayService implementation
- [ ] Access validation
- [ ] Rate limiting
- [ ] Audit logging
- [ ] Integration with existing AgentService
- [ ] Tests

### Phase 5: Elemental MCP Access

**Goal:** Grant elementals explicit tool access

**Tasks:**
1. Add `mcpAccess` field to Elemental agent model
2. Update elemental creation to configure MCP access
3. Update tool discovery to use MCP bindings
4. Create GitHub elemental example with github-mcp-server binding

**Deliverables:**
- [ ] Updated Elemental model
- [ ] Elemental creation with MCP access
- [ ] Tool discovery integration
- [ ] GitHub elemental example
- [ ] Tests

### Phase 6: Integration Testing

**Goal:** End-to-end validation

**Tasks:**
1. Register github-mcp-server in registry
2. Create oss-realm with GitHub binding
3. Create github-elemental-1 with tool access
4. Test full flow: Coordinator → Druid → Elemental → Gateway → MCP Server → GitHub
5. Test user token passing
6. Test rate limiting
7. Test audit logging

**Deliverables:**
- [ ] End-to-end integration tests
- [ ] GitHub PR review scenario working
- [ ] Documentation
- [ ] Performance benchmarks

## Security Considerations

### 1. User Token Protection

**Risk:** User OAuth tokens exposed to MCP servers

**Mitigation:**
- Tokens passed via environment variables (stdio) or headers (HTTP)
- Never logged in plain text
- Encrypted at rest in TokenManager
- Per-user, per-service isolation
- Token refresh handled automatically

### 2. MCP Server Trust

**Risk:** Malicious or compromised MCP servers

**Mitigation:**
- MCP servers run in isolated processes (stdio)
- Resource limits on MCP server processes
- Audit all MCP server registrations
- Verify MCP server sources (npm packages, URLs)
- Allowlist of trusted MCP server providers

### 3. Tool Access Control

**Risk:** Elementals gain unauthorized tool access

**Mitigation:**
- Multi-layer access control:
  1. Agent.mcpTools list (explicit tool names)
  2. RealmMCPBinding.accessControl (binding-level)
  3. Realm.toolPolicies (realm-level)
  4. MCPGateway validation (runtime)
- Least privilege by default
- Explicit tool allowlists (no wildcards by default)
- Audit logging of all tool calls

### 4. Rate Limiting and DoS

**Risk:** Runaway agent causing API abuse

**Mitigation:**
- Per-agent, per-tool rate limits
- Realm-level quotas
- MCP server process timeouts
- Circuit breakers for failing MCP servers
- Monitoring and alerting

## Performance Considerations

### 1. MCP Client Connection Pooling

**Challenge:** Creating new stdio processes is expensive

**Solution:**
- Connection pool with max size
- Reuse clients for same user+server
- Lazy initialization (create on first use)
- Connection timeouts for idle clients
- Health checks

### 2. Tool Discovery Caching

**Challenge:** Discovering tools from MCP servers on every call

**Solution:**
- Cache tool lists per MCP server
- TTL-based cache invalidation
- Invalidate on server registration update
- Background refresh

### 3. Token Retrieval Optimization

**Challenge:** Database lookup for every tool call

**Solution:**
- In-memory token cache (encrypted)
- TTL matching OAuth token expiry
- Automatic refresh before expiry
- Cache invalidation on logout

## Monitoring and Observability

### Metrics to Track

```typescript
interface MCPGatewayMetrics {
  // Tool call volume
  toolCallsTotal: number;
  toolCallsByServer: Record<string, number>;
  toolCallsByRealm: Record<string, number>;
  toolCallsByAgent: Record<string, number>;

  // Performance
  averageLatency: number;
  latencyP95: number;
  latencyP99: number;

  // Errors
  errorRate: number;
  errorsByType: Record<string, number>;
  timeouts: number;

  // Rate limiting
  rateLimitHits: number;
  rateLimitHitsByAgent: Record<string, number>;

  // MCP server health
  mcpServerStatus: Record<string, 'healthy' | 'degraded' | 'down'>;
  mcpServerResponseTime: Record<string, number>;
}
```

### Audit Logging

```typescript
interface MCPToolCallAudit {
  timestamp: Timestamp;
  agentId: string;
  agentName: string;
  agentType: AgentType;
  realmId: string;
  realmName: string;
  mcpServerId: string;
  toolName: string;
  params: any;
  userId: string;
  sessionId: string;
  success: boolean;
  error?: string;
  latencyMs: number;
  rateLimitHit: boolean;
}
```

## Future Enhancements

### 1. Dynamic MCP Server Discovery

Auto-discover MCP servers from:
- npm registry (@modelcontextprotocol/* packages)
- Docker registry (MCP server images)
- Service mesh (running MCP servers in cluster)

### 2. MCP Server Versioning

Support multiple versions of same MCP server:
- Pin realm bindings to specific versions
- Blue/green deployment for server updates
- Backwards compatibility checks

### 3. Approval Workflows

For sensitive tool operations:
- Human-in-the-loop approval
- Approval delegation
- Timeout and escalation
- Audit trail of approvals

### 4. Cost Attribution

Track API costs by:
- User
- Agent
- Realm
- Tool
- Session

Generate cost reports and enforce budgets.

### 5. Federation

Federate MCP Gateway across Druids deployments:
- Cross-deployment MCP server sharing
- Centralized registry with local overrides
- Distributed rate limiting
- Cross-deployment audit logging

## Success Criteria

- [ ] GitHub PR review scenario works end-to-end
- [ ] User OAuth tokens properly passed to MCP servers
- [ ] GitHub audit shows "alice@company.com (via Druids App)"
- [ ] Rate limiting prevents abuse
- [ ] Audit logs capture all tool calls
- [ ] Multiple realms can bind same MCP server with different configs
- [ ] Elementals only access explicitly granted tools
- [ ] MCP server failures don't crash gateway
- [ ] Tool call latency <500ms (P95)
- [ ] Documentation complete for:
  - Registering new MCP servers
  - Creating realm bindings
  - Configuring elementals

---

**Related:**
- [GitHub PR Review Scenario](/docs/implementation/github-pr-review-scenario)
- [Coordination MCP Tools](/docs/implementation/coordination-mcp-tools)
- [User-Delegated Identity](/docs/user-delegated-identity)

---

*Last updated: January 3, 2025*
