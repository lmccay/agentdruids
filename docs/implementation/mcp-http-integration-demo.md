# MCP HTTP Integration Demo: GitHub Code Review

## Overview

Simplified MCP integration for demo using:
- **HTTP-based GitHub MCP Server** (newer, simpler than stdio)
- **Config file backend** (JSON, fast iteration)
- **Service credentials** (single GitHub token, no user delegation yet)
- **Minimal infrastructure** (no complex registry)

## Simplified Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   Druids Platform                          │
│                                                            │
│  Coordinator → Druid → GitHub Elemental                    │
│                              │                             │
│                              ↓                             │
│                    AgentService.routeToolThroughMCPGateway │
│                              │                             │
│                              ↓                             │
│                    MCPConfigLoader                         │
│                    (reads mcp-servers.json)                │
│                              │                             │
│                              ↓                             │
│                    HttpMCPClient                           │
│                    (HTTP POST with JSON-RPC)               │
│                    Auth: Bearer <GITHUB_TOKEN from env>    │
└──────────────────────────────┬─────────────────────────────┘
                               │ HTTP POST
                               │ Authorization: Bearer <token>
┌──────────────────────────────▼─────────────────────────────┐
│          GitHub MCP Server (HTTP mode)                     │
│          http://localhost:3001/mcp                         │
│                                                            │
│  Receives: JSON-RPC requests                               │
│  Auth: Bearer token from Authorization header              │
└──────────────────────────────┬─────────────────────────────┘
                               │ GitHub REST API
                               ↓
┌────────────────────────────────────────────────────────────┐
│                     GitHub.com                             │
│              (Service account repositories)                │
└────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. MCP Server Config File

**Location:** `/Users/lmccay/Projects/druids/config/mcp-servers.json`

```json
{
  "servers": {
    "github": {
      "id": "github-mcp-server",
      "name": "GitHub MCP Server",
      "description": "Official GitHub MCP server for repository operations",
      "transport": "http",
      "baseUrl": "http://localhost:3001/mcp",
      "authentication": {
        "type": "bearer",
        "tokenSource": "env",
        "envVar": "GITHUB_TOKEN",
        "header": "Authorization",
        "prefix": "Bearer "
      },
      "tools": [
        "list_pull_requests",
        "get_pull_request",
        "create_review_comment",
        "get_file_contents",
        "search_repositories"
      ]
    }
  },
  "realmBindings": {
    "oss-realm": {
      "servers": ["github"],
      "elementals": {
        "github-elemental-1": {
          "serverId": "github",
          "allowedTools": [
            "list_pull_requests",
            "get_pull_request",
            "create_review_comment",
            "get_file_contents"
          ]
        }
      }
    }
  }
}
```

**Key simplification:** `tokenSource: "env"` means read from environment variable, no user delegation.

### 2. Environment Configuration

**File:** `.env` (for local development)

```bash
# GitHub service credential for MCP demo
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# MCP Server URLs
GITHUB_MCP_URL=http://localhost:3001/mcp
```

**How to get token:**
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo`, `read:user`
4. Copy token to `.env`

### 3. Config Loader Service

**File:** `/Users/lmccay/Projects/druids/src/services/mcp/MCPConfigLoader.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

export interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  transport: 'http' | 'stdio' | 'sse';
  baseUrl?: string;
  authentication: {
    type: 'bearer' | 'api_key' | 'none';
    tokenSource: 'env' | 'config';    // Simplified: just env for now
    envVar?: string;                   // e.g., "GITHUB_TOKEN"
    header?: string;                   // e.g., "Authorization"
    prefix?: string;                   // e.g., "Bearer "
  };
  tools: string[];
}

export interface ElementalBinding {
  serverId: string;
  allowedTools: string[];
}

export interface RealmBinding {
  servers: string[];
  elementals: {
    [elementalId: string]: ElementalBinding;
  };
}

export interface MCPConfig {
  servers: {
    [serverId: string]: MCPServerConfig;
  };
  realmBindings: {
    [realmId: string]: RealmBinding;
  };
}

export class MCPConfigLoader {
  private config: MCPConfig | null = null;
  private configPath: string;
  private watchHandle: fs.FSWatcher | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(
      process.cwd(),
      'config/mcp-servers.json'
    );
  }

  /**
   * Load config from file
   */
  async load(): Promise<void> {
    try {
      const content = await fs.promises.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      console.log(`✅ Loaded MCP config from ${this.configPath}`);
      console.log(`   Servers: ${Object.keys(this.config.servers).join(', ')}`);
    } catch (error) {
      console.error(`❌ Failed to load MCP config:`, error);
      throw error;
    }
  }

  /**
   * Watch config file for changes (hot reload)
   */
  watch(): void {
    if (this.watchHandle) return;

    this.watchHandle = fs.watch(this.configPath, async (eventType) => {
      if (eventType === 'change') {
        console.log(`🔄 MCP config file changed, reloading...`);
        try {
          await this.load();
          console.log(`✅ MCP config reloaded`);
        } catch (error) {
          console.error(`❌ Failed to reload MCP config:`, error);
        }
      }
    });

    console.log(`👀 Watching MCP config: ${this.configPath}`);
  }

  /**
   * Get server configuration
   */
  getServer(serverId: string): MCPServerConfig | null {
    if (!this.config) {
      throw new Error('MCP config not loaded. Call load() first.');
    }
    return this.config.servers[serverId] || null;
  }

  /**
   * Get token for server (from environment)
   */
  getServerToken(serverId: string): string | null {
    const server = this.getServer(serverId);
    if (!server || !server.authentication.envVar) {
      return null;
    }

    const token = process.env[server.authentication.envVar];
    if (!token) {
      console.warn(
        `⚠️  Token not found in environment: ${server.authentication.envVar}`
      );
      return null;
    }

    return token;
  }

  /**
   * Get elemental's MCP server binding
   */
  getElementalBinding(
    realmId: string,
    elementalId: string
  ): ElementalBinding | null {
    if (!this.config) return null;

    const realmBinding = this.config.realmBindings[realmId];
    if (!realmBinding) return null;

    return realmBinding.elementals[elementalId] || null;
  }

  /**
   * Validate that elemental can use tool
   */
  canElementalUseTool(
    realmId: string,
    elementalId: string,
    toolName: string
  ): boolean {
    const binding = this.getElementalBinding(realmId, elementalId);
    if (!binding) return false;

    return binding.allowedTools.includes(toolName) ||
           binding.allowedTools.includes('*');
  }
}
```

### 4. HTTP MCP Client

**File:** `/Users/lmccay/Projects/druids/src/services/mcp/HttpMCPClient.ts`

```typescript
export class HttpMCPClient {
  private baseUrl: string;
  private token: string | null;
  private authHeader: string;
  private authPrefix: string;

  constructor(
    baseUrl: string,
    token: string | null = null,
    authHeader: string = 'Authorization',
    authPrefix: string = 'Bearer '
  ) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.authHeader = authHeader;
    this.authPrefix = authPrefix;
  }

  /**
   * Call MCP tool via HTTP POST
   */
  async callTool(toolName: string, params: any): Promise<any> {
    const requestId = Date.now();

    const mcpRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers[this.authHeader] = `${this.authPrefix}${this.token}`;
    }

    console.log(`🌐 MCP HTTP Request:`);
    console.log(`   URL: ${this.baseUrl}`);
    console.log(`   Tool: ${toolName}`);
    console.log(`   Params:`, JSON.stringify(params, null, 2));

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(mcpRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const mcpResponse = await response.json();

      if (mcpResponse.error) {
        console.error(`❌ MCP error:`, mcpResponse.error);
        throw new Error(mcpResponse.error.message || 'MCP tool call failed');
      }

      console.log(`✅ MCP tool ${toolName} succeeded`);
      return mcpResponse.result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ MCP HTTP request failed:`, errorMessage);
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any[]> {
    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers[this.authHeader] = `${this.authPrefix}${this.token}`;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(mcpRequest)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const mcpResponse = await response.json();
    return mcpResponse.result?.tools || [];
  }
}
```

### 5. Update AgentService Integration

**File:** `/Users/lmccay/Projects/druids/src/services/AgentService.ts`

```typescript
import { MCPConfigLoader } from './mcp/MCPConfigLoader';
import { HttpMCPClient } from './mcp/HttpMCPClient';

export class AgentService {
  private mcpConfigLoader: MCPConfigLoader;
  private mcpClients: Map<string, HttpMCPClient>;

  constructor(/* ... */) {
    // ... existing initialization ...

    this.mcpConfigLoader = new MCPConfigLoader();
    this.mcpClients = new Map();

    this.initializeMCPConfig();
  }

  private async initializeMCPConfig() {
    try {
      await this.mcpConfigLoader.load();

      if (process.env.NODE_ENV !== 'test') {
        this.mcpConfigLoader.watch();
      }

      console.log('✅ MCP config initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MCP config:', error);
    }
  }

  /**
   * Route MCP tool calls (simplified - no user delegation)
   */
  private async routeToolThroughMCPGateway(
    agentId: string,
    toolName: string,
    params: any
  ): Promise<any> {
    try {
      // 1. Get agent
      const agent = await this.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // 2. Verify elemental type
      if (agent.type !== 'elemental') {
        throw new Error(
          `Only elementals can call MCP tools (agent ${agentId} is ${agent.type})`
        );
      }

      // 3. Get realm ID
      const realmId = (agent as any).realmId;
      if (!realmId) {
        throw new Error(`Elemental ${agentId} has no realmId`);
      }

      // 4. Get MCP binding
      const binding = this.mcpConfigLoader.getElementalBinding(realmId, agentId);
      if (!binding) {
        throw new Error(
          `No MCP binding for elemental ${agentId} in realm ${realmId}`
        );
      }

      // 5. Validate tool access
      if (!binding.allowedTools.includes(toolName) &&
          !binding.allowedTools.includes('*')) {
        throw new Error(
          `Elemental ${agentId} not authorized for tool ${toolName}`
        );
      }

      // 6. Get server config
      const serverConfig = this.mcpConfigLoader.getServer(binding.serverId);
      if (!serverConfig) {
        throw new Error(`MCP server ${binding.serverId} not found`);
      }

      // 7. Get service credential from environment
      const token = this.mcpConfigLoader.getServerToken(binding.serverId);
      if (!token && serverConfig.authentication.type !== 'none') {
        throw new Error(
          `No token found for MCP server ${binding.serverId}. ` +
          `Set ${serverConfig.authentication.envVar} in environment.`
        );
      }

      // 8. Get or create client
      const clientKey = binding.serverId; // One client per server (no per-user)
      let client = this.mcpClients.get(clientKey);

      if (!client) {
        client = new HttpMCPClient(
          serverConfig.baseUrl!,
          token,
          serverConfig.authentication.header,
          serverConfig.authentication.prefix
        );
        this.mcpClients.set(clientKey, client);
      }

      // 9. Call tool
      console.log(
        `🌐 Routing MCP: agent=${agentId}, tool=${toolName}, server=${binding.serverId}`
      );

      const result = await client.callTool(toolName, params);

      console.log(`✅ MCP tool ${toolName} completed`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown';
      console.error(`❌ MCP routing failed for ${toolName}:`, errorMessage);

      // Return error in MCP format
      return {
        content: [{
          type: 'text',
          text: `Error: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
}
```

## GitHub MCP Server Setup

### 1. Install GitHub MCP Server

```bash
npm install @modelcontextprotocol/server-github
```

### 2. Start GitHub MCP Server

**Add to `package.json`:**

```json
{
  "scripts": {
    "start": "node dist/src/app.js",
    "mcp:github": "npx -y @modelcontextprotocol/server-github"
  }
}
```

**Start the server:**

```bash
# Terminal 1: Start GitHub MCP Server
npm run mcp:github

# Terminal 2: Start Druids
npm start
```

### 3. Verify Server Running

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

## Setup Instructions

### Step 1: Get GitHub Token

```bash
# 1. Go to https://github.com/settings/tokens
# 2. Click "Generate new token (classic)"
# 3. Select scopes: repo, read:user
# 4. Generate token
# 5. Copy token
```

### Step 2: Configure Environment

**Create `.env` file:**

```bash
# Copy from example
cp .env.example .env

# Edit .env
GITHUB_TOKEN=ghp_your_token_here
```

### Step 3: Create Config File

**Create `config/mcp-servers.json`:**

```bash
mkdir -p config
cat > config/mcp-servers.json << 'EOF'
{
  "servers": {
    "github": {
      "id": "github-mcp-server",
      "name": "GitHub MCP Server",
      "description": "Official GitHub MCP server",
      "transport": "http",
      "baseUrl": "http://localhost:3001/mcp",
      "authentication": {
        "type": "bearer",
        "tokenSource": "env",
        "envVar": "GITHUB_TOKEN",
        "header": "Authorization",
        "prefix": "Bearer "
      },
      "tools": [
        "list_pull_requests",
        "get_pull_request",
        "create_review_comment",
        "get_file_contents"
      ]
    }
  },
  "realmBindings": {
    "oss-realm": {
      "servers": ["github"],
      "elementals": {
        "github-elemental-1": {
          "serverId": "github",
          "allowedTools": ["*"]
        }
      }
    }
  }
}
EOF
```

### Step 4: Create OSS Realm

```bash
curl -X POST http://localhost:3000/realms \
  -H "Content-Type: application/json" \
  -d '{
    "id": "oss-realm",
    "name": "Open Source Development",
    "description": "Realm for OSS projects",
    "type": "development"
  }'
```

### Step 5: Create GitHub Elemental

```bash
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "elemental",
    "name": "GitHub Interface",
    "description": "GitHub operations elemental",
    "realmId": "oss-realm",
    "capabilities": ["github", "code_review"],
    "mcpTools": [
      "list_pull_requests",
      "get_pull_request",
      "create_review_comment",
      "get_file_contents"
    ],
    "llmConfig": {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.3
    }
  }'
```

## Testing

### Test 1: Verify Config Loads

```bash
# Start Druids - should see:
# ✅ Loaded MCP config from .../config/mcp-servers.json
#    Servers: github
# 👀 Watching MCP config: .../config/mcp-servers.json
```

### Test 2: Test Tool Call

Create test script `scripts/test-mcp.js`:

```javascript
const fetch = require('node-fetch');

async function testMCP() {
  // List PRs in druids repo
  const response = await fetch('http://localhost:3000/agents/github-elemental-1/execute-tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolName: 'list_pull_requests',
      params: {
        owner: 'lmccay',
        repo: 'druids',
        state: 'open'
      }
    })
  });

  const result = await response.json();
  console.log('Result:', JSON.stringify(result, null, 2));
}

testMCP().catch(console.error);
```

Run:
```bash
node scripts/test-mcp.js
```

### Test 3: End-to-End PR Review

```bash
curl -X POST http://localhost:3000/coordinators/coordinate \
  -H "Content-Type: application/json" \
  -d '{
    "coordinatorId": "built-in-coordinator",
    "participantIds": ["github-elemental-1"],
    "scenarioPrompt": "List open pull requests in the druids repository"
  }'
```

## Implementation Tasks

### Day 1: Config Infrastructure
- [ ] Create `config/mcp-servers.json` format
- [ ] Implement `MCPConfigLoader.ts`
- [ ] Add hot-reload support
- [ ] Test config loading

### Day 2: HTTP Client
- [ ] Implement `HttpMCPClient.ts`
- [ ] Test JSON-RPC communication
- [ ] Test with GitHub MCP Server
- [ ] Handle errors

### Day 3: AgentService Integration
- [ ] Update `routeToolThroughMCPGateway`
- [ ] Add client caching
- [ ] Add validation logic
- [ ] Test tool routing

### Day 4: GitHub Setup
- [ ] Install GitHub MCP Server
- [ ] Create startup script
- [ ] Create OSS realm
- [ ] Create GitHub elemental

### Day 5: Testing & Demo
- [ ] Test individual tool calls
- [ ] Test full coordination flow
- [ ] Polish error messages
- [ ] Document setup

## Migration Path to User Delegation

Later, when adding authentication:

```typescript
// Current (service credential)
const token = this.mcpConfigLoader.getServerToken(serverId);

// Future (user-delegated)
const token = await this.tokenManager.getAccessToken(userId, 'github');
```

Config file changes to support both:

```json
{
  "authentication": {
    "type": "bearer",
    "tokenSource": "user-delegated",  // Changed from "env"
    "service": "github",              // Added service mapping
    "header": "Authorization",
    "prefix": "Bearer "
  }
}
```

Client pool becomes per-user:
```typescript
// Current (one client per server)
const clientKey = serverId;

// Future (one client per user+server)
const clientKey = `${serverId}:${userId}`;
```

## Advantages

### Simple for Demo
- Single GitHub token (service credential)
- No OAuth flow needed
- No user management
- Fast to implement

### Easy Migration
- Config structure supports future user delegation
- Client code minimal changes needed
- Can add `TokenManager` layer later
- Backwards compatible

### Production-Ready Foundation
- HTTP transport is production-ready
- Config file → Database later
- Error handling in place
- Monitoring hooks ready

## Success Criteria

- [ ] Config file loads and hot-reloads
- [ ] GitHub MCP Server responds to HTTP requests
- [ ] GitHub Elemental can list PRs
- [ ] Service credential (GITHUB_TOKEN) passed correctly
- [ ] GitHub API returns real data
- [ ] Full coordination flow works
- [ ] Error handling works
- [ ] Documentation complete

---

**Timeline: 3-4 days for working demo**

---

*Last updated: January 3, 2025*
