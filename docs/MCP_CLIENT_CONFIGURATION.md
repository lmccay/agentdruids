# MCP Client Configuration for Druids System

## ✅ FULLY COMPLIANT MCP SERVER

The Druids system now features a **FULLY COMPLIANT** Model Context Protocol (MCP) server that follows the official MCP specification exactly. This enables seamless integration with any MCP-compatible client.

## Server Information

- **Protocol**: Model Context Protocol (MCP) v2025-06-18
- **Transport**: Streamable HTTP with Server-Sent Events (SSE)
- **Message Format**: JSON-RPC 2.0
- **Endpoint**: Single `/mcp` endpoint
- **Host**: localhost
- **Port**: 3003
- **Full URL**: `http://localhost:3003/mcp`

## Required Headers

### For All Requests
```http
Content-Type: application/json
Accept: application/json
MCP-Protocol-Version: 2025-06-18
```

### For Session Management (Automatic)
```http
Mcp-Session-Id: <session-id>
```

## Message Format (JSON-RPC 2.0)

All communication uses standard JSON-RPC 2.0 format:

### Request Format
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "method_name",
  "params": {}
}
```

### Response Format
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "result": {}
}
```

## Core MCP Methods

### 1. Initialize Session
```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "id": "1",
  "params": {
    "protocolVersion": "2025-06-18",
    "clientInfo": {
      "name": "your-client",
      "version": "1.0.0"
    }
  }
}
```

### 2. List Available Tools
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": "2"
}
```

### 3. Execute Tool
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": "3",
  "params": {
    "name": "agent_create",
    "arguments": {
      "name": "forest-guardian",
      "type": "druid",
      "description": "Environmental monitoring agent"
    }
  }
}
```

### 4. List Resources
```json
{
  "jsonrpc": "2.0",
  "method": "resources/list",
  "id": "4"
}
```

### 5. Read Resource
```json
{
  "jsonrpc": "2.0",
  "method": "resources/read",
  "id": "5",
  "params": {
    "uri": "druids://agents"
  }
}
```

## Available Tools

### agent_create
Create a new agent in the Druids system.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string", "description": "Agent name"},
    "type": {"type": "string", "enum": ["druid", "elemental", "gaia", "worldtree"]},
    "description": {"type": "string", "description": "Agent description (optional)"}
  },
  "required": ["name", "type"]
}
```

### realm_list
List all realms in the system.

**Input Schema:** None (empty parameters object)

## Available Resources

### druids://agents
Lists all agents in the system with their current status and configuration.

### druids://realms  
Lists all realms in the system with capacity and agent information.

## Configuration for MCP Clients

### Goose Desktop Agent

Add to your Goose configuration (`goose_config.yaml`):

```yaml
mcp_servers:
  druids:
    command: []
    transport:
      type: http
      url: http://localhost:3003/mcp
      headers:
        MCP-Protocol-Version: "2025-06-18"
```

### VS Code MCP Extensions

Configure VS Code MCP extensions:
```json
{
  "mcp.servers": {
    "druids": {
      "type": "http",
      "url": "http://localhost:3003/mcp",
      "protocol": "2025-06-18"
    }
  }
}
```

### Claude Desktop

Add to Claude Desktop configuration:
```json
{
  "mcpServers": {
    "druids": {
      "command": ["node", "-e", "/* MCP client for http://localhost:3003/mcp */"],
      "transport": {
        "type": "http",
        "url": "http://localhost:3003/mcp"
      }
    }
  }
}
```

### Generic MCP Client Configuration

For any MCP-compatible client:
```json
{
  "server": {
    "name": "druids-mcp-server",
    "type": "http",
    "url": "http://localhost:3003/mcp",
    "protocol": "2025-06-18",
    "transport": "streamable-http"
  }
}
```

## Testing the Connection

### 1. Test Server Health
```bash
curl http://localhost:3003/health
# Expected: {"status":"healthy"}
```

### 2. Initialize MCP Session
```bash
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": "1",
    "params": {
      "protocolVersion": "2025-06-18",
      "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }
  }'
```

### 3. List Available Tools
```bash
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": "2"
  }'
```

### 4. Create an Agent
```bash
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": "3",
    "params": {
      "name": "agent_create",
      "arguments": {
        "name": "test-druid",
        "type": "druid",
        "description": "Test agent"
      }
    }
  }'
```

## Protocol Compliance

The Druids MCP server is **FULLY COMPLIANT** with the official MCP specification:

✅ **JSON-RPC 2.0**: All messages use standard JSON-RPC 2.0 format
✅ **Single Endpoint**: Uses `/mcp` endpoint as specified
✅ **Protocol Headers**: Implements MCP-Protocol-Version and Mcp-Session-Id
✅ **Session Management**: Proper session initialization and cleanup
✅ **Transport Layer**: Streamable HTTP with SSE support
✅ **Content Types**: Proper Content-Type and Accept header validation
✅ **Error Handling**: Standard JSON-RPC error codes and messages

## Network Configuration

### Docker Environment
The MCP server is exposed on port 3003:
```yaml
# docker-compose.yml
ports:
  - "3003:3003"  # MCP server port
```

### Firewall Configuration
Ensure port 3003 is accessible from your MCP client environment.

## Security Features

- **Localhost Binding**: Server only accepts connections from localhost/127.0.0.1
- **Origin Validation**: Validates Origin headers to prevent DNS rebinding attacks
- **Session Management**: Secure session handling with automatic cleanup
- **Protocol Validation**: Strict validation of all MCP protocol requirements

## Troubleshooting

### Common Issues

1. **Connection Refused**
   ```bash
   # Check if server is running
   curl http://localhost:3003/health
   ```

2. **Protocol Version Mismatch**
   - Ensure `MCP-Protocol-Version: 2025-06-18` header is included

3. **Invalid JSON-RPC**
   - Verify message format includes `jsonrpc: "2.0"`, `id`, and `method`

4. **Session Issues**
   - Session is managed automatically; no manual session handling needed

### Debug Commands

```bash
# Check server status
./scripts/health.sh

# View MCP server logs  
docker logs druids-mcp-server

# Test MCP compliance
npm test tests/integration/mcp-compliance.test.ts
```

## Advanced Features

### Server-Sent Events (SSE)
The server supports SSE for streaming responses when using `Accept: text/event-stream`.

### Session Persistence
Sessions are automatically managed with secure session IDs and proper cleanup.

### Error Handling
All errors follow JSON-RPC 2.0 error format:
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

---

This configuration enables any MCP-compatible client to seamlessly integrate with the Druids multi-agent system using the official Model Context Protocol specification.