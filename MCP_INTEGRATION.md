# MCP Integration Guide for Druids System

## ✅ FULLY COMPLIANT MCP SERVER

The Druids system now includes a **FULLY COMPLIANT** Model Context Protocol (MCP) server that adheres to the official MCP specification. This server enables seamless integration with external MCP clients like Goose Desktop Agent, VS Code extensions, and other MCP-compatible tools.

## 🔧 Server Configuration

### Automatic Startup
When you start the Druids system, both the main API server and the MCP-compliant server start automatically:

```bash
npm start
# or
./scripts/dev.sh start
```

The system will start:
- **Main API Server**: `http://localhost:3000` (REST API for internal use)
- **MCP Server**: `http://localhost:3003/mcp` (MCP-compliant for external clients)

### Server Information
- **Protocol**: Model Context Protocol (MCP) v2025-06-18
- **Transport**: Streamable HTTP with Server-Sent Events (SSE)
- **Message Format**: JSON-RPC 2.0
- **Compliance**: FULLY COMPLIANT with official MCP specification
- **Security**: Localhost-only binding with origin validation

## 🚀 Client Integration

### Goose Desktop Agent
Add the following to your Goose configuration to connect to the Druids MCP server:

```yaml
# goose_config.yaml
mcp_servers:
  druids:
    command: []
    transport:
      type: http
      url: http://localhost:3003/mcp
      headers:
        MCP-Protocol-Version: "2025-06-18"
```

### VS Code Extensions
Configure VS Code MCP extensions to connect to:
```
URL: http://localhost:3003/mcp
Protocol: MCP v2025-06-18
Transport: Streamable HTTP
```

### Manual HTTP Client
You can test the MCP server manually using curl or any HTTP client:

```bash
# Initialize MCP session
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
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'

# List available tools
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": "2"
  }'
```

## 🛠️ Available Tools

The MCP server exposes the following tools for external clients:

### agent_create
Create a new agent in the Druids system.

**Parameters:**
- `name` (string, required): Name of the agent
- `type` (string, required): Agent type (druid, elemental, gaia, worldtree)
- `description` (string, optional): Description of the agent

### realm_list
List all realms in the system.

**Parameters:** None

## 📊 Available Resources

### druids://agents
Lists all agents in the system with their current status.

### druids://realms
Lists all realms in the system with capacity and agent information.

## 🔐 Security Features

- **Localhost Binding**: Server only accepts connections from localhost/127.0.0.1
- **Origin Validation**: Validates Origin headers to prevent DNS rebinding attacks
- **Session Management**: Proper session lifecycle with cleanup
- **Protocol Validation**: Strict JSON-RPC 2.0 format validation

## 📋 Protocol Compliance

Our MCP server implementation is **FULLY COMPLIANT** with the official MCP specification:

✅ **JSON-RPC 2.0 Message Format**: All messages use proper JSON-RPC 2.0 format
✅ **Streamable HTTP Transport**: Single `/mcp` endpoint with SSE support
✅ **Session Management**: Proper session initialization and cleanup
✅ **Protocol Headers**: Correct MCP-Protocol-Version and Mcp-Session-Id handling
✅ **Content Type Validation**: Proper Content-Type and Accept header validation
✅ **Error Handling**: Standard JSON-RPC error codes and messages

## 🧪 Testing Compliance

Run the MCP compliance tests to verify the server meets all protocol requirements:

```bash
npm test tests/integration/mcp-compliance.test.ts
```

This test suite verifies:
- Transport layer compliance
- JSON-RPC 2.0 message format
- Protocol header handling
- Session management
- Error handling
- Content type validation

## 🚫 What Changed

**Previous Implementation (NON-COMPLIANT):**
- Used REST endpoints (`/mcp/tools`, `/mcp/resources`)
- Plain JSON responses (not JSON-RPC 2.0)
- Custom header schemes
- No session management

**Current Implementation (FULLY COMPLIANT):**
- Single `/mcp` endpoint as per specification
- JSON-RPC 2.0 message format for all communication
- Proper MCP protocol headers
- Session management with `Mcp-Session-Id`
- Server-Sent Events support for streaming
- Strict protocol validation

## 🔗 External Client Support

The MCP server has been tested with and supports:
- **Goose Desktop Agent**: Full compatibility
- **VS Code MCP Extensions**: Full compatibility
- **Claude Desktop**: Compatible (via MCP configuration)
- **Custom MCP Clients**: Any client following MCP specification

## 📖 Additional Resources

- [Official MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP Client Configuration Guide](./docs/MCP_CLIENT_CONFIGURATION.md)
- [MCP Compliance Constitution](./docs/MCP_COMPLIANCE_CONSTITUTION.md)

---

**Note**: This implementation is governed by our [MCP Compliance Constitution](./docs/MCP_COMPLIANCE_CONSTITUTION.md), which ensures all MCP-related code remains strictly compliant with the official specification.