# 🧙‍♂️ Druids Multi-Agent System

A sophisticated multi-agent system where different types of agents (Druids, Elementals, Gaia, and Worldtree) work together in a federated architecture with **FULLY COMPLIANT** Model Context Protocol (MCP) integration and comprehensive web-based management interface.

## 🛡️ **Concurrent Session Architecture**

This system features **production-ready concurrent session support** with complete isolation between coordination sessions. The architecture is protected by constitutional principles documented in `CONCURRENT_SESSION_CONSTITUTION.md` and enforced through automated testing.

### Key Features:
- **Session Isolation**: Multiple coordination sessions run independently without interference
- **Agent State Management**: Session-scoped agent states prevent cross-session conflicts  
- **Content Storage**: Session-isolated WorldTree content prevents content conflicts
- **Concurrency Limits**: Configurable coordinator limits prevent system overload
- **Resource Management**: Automatic cleanup and timeout handling

### Testing Protection:
```bash
npm run test:session-protection  # Verify architectural integrity
npm test                         # Includes session protection tests
```

## ✨ New: Management UI

### 🎛️ Web Interface
Access the comprehensive management interface at **http://localhost:3004** after starting the system:

- **📊 Dashboard**: Real-time system overview, agent status, and activity monitoring
- **🤖 Agent Management**: Full CRUD operations for agents with custom system prompts
- **🌍 Realm Management**: Configure local and federated realms with ley line connections  
- **🎭 Coordination Management**: Execute multi-agent scenarios and track results

### 🚀 Quick Start
```bash
./scripts/dev.sh start    # Start all services
# Open http://localhost:3004 in your browser
```

### 🌍 Remote Access
Access the UI from any device on your network:
```bash
./scripts/setup-remote-access.sh    # Automated setup
# Then access from any device: http://<your-server-ip>:3004
```
See [docs/REMOTE_ACCESS.md](docs/REMOTE_ACCESS.md) for configuration details and security best practices.

## 🚀 Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- Git
- 8GB+ RAM recommended (4GB+ for LLM model)
- 10GB+ free disk space (for qwen2.5:1.5b model)

### Development Environment

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd druids
   ```

2. **Start the development environment:**
   ```bash
   ./scripts/dev.sh start
   ```

3. **Check system health:**
   ```bash
   ./scripts/health.sh check
   ```

4. **Access the services:**
   - Main API: http://localhost:3000
   - MCP Server: http://localhost:3003/mcp *(FULLY COMPLIANT MCP server for external clients)*
   - Grafana Dashboard: http://localhost:3002 (admin:druids_admin)
   - Prometheus: http://localhost:9090

**Note:** The first startup will automatically download the qwen2.5:1.5b model (~1.5GB). This may take 5-15 minutes depending on your internet connection.

## 🔌 MCP Client Integration ✅ FULLY COMPLIANT

The Druids system provides a **FULLY COMPLIANT** Model Context Protocol (MCP) server that follows the official MCP specification exactly. This enables seamless integration with any MCP-compatible client including **Goose Desktop Agent**, **VS Code extensions**, and **Claude Desktop**.

### Quick MCP Client Setup

**For Goose Desktop Agent:**
```yaml
# Add to your goose_config.yaml
mcp_servers:
  druids:
    command: []
    transport:
      type: http
      url: http://localhost:3003/mcp
      headers:
        MCP-Protocol-Version: "2025-06-18"
```

**Available MCP Tools:**
- `agent_create` - Create new agents (druid, elemental, gaia, worldtree)
- `realm_list` - List all realms in the system

**Available MCP Resources:**
- `druids://agents` - List all agents and their status
- `druids://realms` - List all realms and capacity

**Test MCP Connection (JSON-RPC 2.0):**
```bash
# Check server health
curl http://localhost:3003/health

# Initialize MCP session
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
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

# List available tools  
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": "2"
  }'
```

📖 **Full MCP Configuration Guide:** [docs/MCP_CLIENT_CONFIGURATION.md](docs/MCP_CLIENT_CONFIGURATION.md)

## 🐳 Docker Services

### Core Services

| Service | Port | Description | External Access |
|---------|------|-------------|-----------------|
| **druids-app** | 3000 | Main API server | ✅ MCP clients |
| **druids-mcp** | 3003 | **COMPLIANT** MCP server | ✅ External MCP clients |
| druids-redis | 6379 | Cache & sessions | Internal |
| druids-postgres | 5432 | Persistent storage | Internal |
| druids-ollama | 11434 | LLM (qwen2.5:1.5b) | Internal |

### Monitoring Services

| Service | Port | Description |
|---------|------|-------------|
| druids-prometheus | 9090 | Metrics collection |
| druids-grafana | 3002 | Monitoring dashboards |

## 🛠️ Management Scripts

### Development Script (`./scripts/dev.sh`)

```bash
# Start all services
./scripts/dev.sh start

# Stop all services  
./scripts/dev.sh stop

# Restart services
./scripts/dev.sh restart

# Show service status
./scripts/dev.sh status

# View logs (all services or specific)
./scripts/dev.sh logs
./scripts/dev.sh logs druids-app

# Execute commands in containers
./scripts/dev.sh exec druids-app npm test

# LLM model management
./scripts/dev.sh pull-model    # Manually pull qwen2.5:1.5b
./scripts/dev.sh test-llm      # Test LLM functionality

# Clean up everything
./scripts/dev.sh cleanup
```

### Testing Script (`./scripts/test.sh`)

```bash
# Run all tests
./scripts/test.sh all

# Run specific test types
./scripts/test.sh unit
./scripts/test.sh integration
./scripts/test.sh contract

# Run tests with coverage
./scripts/test.sh coverage

# Validate environment
./scripts/test.sh validate

# Clean test artifacts
./scripts/test.sh clean
```

### Health Check Script (`./scripts/health.sh`)

```bash
# Quick health check
./scripts/health.sh check

# Detailed health information
./scripts/health.sh detailed

# Check MCP integration
./scripts/health.sh mcp

# Performance testing
./scripts/health.sh performance

# Continuous monitoring
./scripts/health.sh monitor 30

# Export metrics to JSON
./scripts/health.sh export metrics.json
```

## 🤖 Local LLM Integration

### Model: qwen2.5:1.5b

The system uses Qwen2.5:1.5b, a lightweight but capable language model:

- **Size:** ~1.5GB download
- **Parameters:** 1.5 billion
- **Capabilities:** Text generation, instruction following, basic tool calling
- **Memory:** ~2-4GB RAM usage
- **Performance:** Fast inference on CPU/GPU

### Model Features

- **Multilingual support:** English, Chinese, and other languages
- **Tool calling:** JSON-based function calling for MCP integration
- **Context length:** 32K tokens
- **Fine-tuning friendly:** Can be adapted for specific agent behaviors

### Model Management

```bash
# Check model status
./scripts/health.sh detailed

# Test LLM functionality
./scripts/dev.sh test-llm

# Manually pull model if needed
./scripts/dev.sh pull-model

# View Ollama logs
./scripts/dev.sh logs druids-ollama
```

### Agent-LLM Integration

Each agent type uses the model differently:

- **Druids:** Coordination and high-level reasoning
- **Elementals:** Specialized domain tasks
- **Gaia:** System-wide monitoring and optimization
- **Worldtree:** Knowledge synthesis and long-term memory

## 🔌 MCP Integration for External Clients

The Druids system exposes MCP-compatible endpoints for integration with external MCP clients like Goose Desktop Agent.

### MCP Server Configuration

**Connection Details:**
- **URL:** `http://localhost:3001`
- **Protocol:** HTTP/WebSocket
- **Port:** 3001 (mapped from container)

### Available MCP Endpoints

```
GET  /mcp/tools         # Available tools
GET  /mcp/resources     # Available resources  
GET  /mcp/prompts       # Available prompts
POST /mcp/tools/execute # Execute tool
```

### Example MCP Client Configuration

```json
{
  "name": "druids-mcp-server",
  "url": "http://localhost:3001",
  "type": "http",
  "capabilities": [
    "tools",
    "resources", 
    "prompts"
  ]
}
```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Clients   │    │  External APIs  │    │   Web Clients   │
│  (Goose, etc.)  │    │                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ :3001               │ :3000               │ :3000
          │                      │                      │
    ┌─────▼──────────────────────▼──────────────────────▼─────┐
    │                 Nginx Reverse Proxy                     │
    └─────┬─────────────────────────────────────────────────┬─┘
          │                                                 │
    ┌─────▼─────┐                                     ┌─────▼─────┐
    │MCP Gateway│                                     │ Main API  │
    │   :3001   │                                     │   :3000   │
    └─────┬─────┘                                     └─────┬─────┘
          │                                                 │
          └─────────────────┬───────────────────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │         Service Layer            │
          │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
          │ │Agent│ │Realm│ │Know-│ │Scen-│ │
          │ │Svc  │ │Svc  │ │edge │ │ario │ │
          │ └─────┘ └─────┘ └─────┘ └─────┘ │
          └─────┬─────────────────┬─────────┘
                │                 │
          ┌─────▼─────┐     ┌─────▼─────┐
          │ Redis     │     │PostgreSQL │
          │ Cache     │     │   DB      │
          └───────────┘     └───────────┘
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `PORT` | 3000 | Main API port |
| `ALLOWED_ORIGINS` | localhost:3000,3001 | CORS origins |
| `DATABASE_URL` | postgresql://... | Database connection |
| `REDIS_URL` | redis://... | Redis connection |
| `OLLAMA_BASE_URL` | http://ollama:11434 | Ollama service URL |
| `OLLAMA_MODEL` | qwen2.5:1.5b | Default LLM model |
| `OLLAMA_TIMEOUT` | 300000 | LLM request timeout (ms) |

### Development vs Production

**Development:**
- Hot reload enabled
- Debug logging
- All ports exposed
- Development dependencies included

**Production:**
- Optimized builds
- Production logging
- Nginx proxy
- Resource limits applied

## 📊 Monitoring and Observability

### Prometheus Metrics

- HTTP request metrics
- Database connection pools
- Redis cache hit rates  
- Agent activity metrics
- MCP client connections

### Grafana Dashboards

Access at http://localhost:3002 with admin:druids_admin

- **System Overview:** Service health, response times
- **Agent Activity:** Agent interactions, scenarios executed
- **MCP Integration:** Client connections, tool executions
- **Performance:** Database queries, cache performance

### Health Endpoints

```bash
# Main API health
curl http://localhost:3000/health

# MCP Gateway health  
curl http://localhost:3001/health

# Prometheus metrics
curl http://localhost:3000/metrics
```

## 🧪 Testing

### Test Environment

The testing script creates an isolated environment with:
- Separate test database
- Clean Redis instance
- Mocked external services
- Test-specific configuration

### Running Tests

```bash
# Full test suite
npm run test

# Docker-based testing
./scripts/test.sh all

# Coverage report
./scripts/test.sh coverage

# Performance tests
./scripts/test.sh performance
```

## 🚨 Troubleshooting

### Common Issues

1. **Services not starting:**
   ```bash
   ./scripts/health.sh detailed
   docker-compose logs druids-app
   ```

2. **LLM model not loading:**
   ```bash
   # Check model status
   ./scripts/health.sh detailed
   
   # View Ollama logs
   ./scripts/dev.sh logs druids-ollama
   
   # Manually pull model
   ./scripts/dev.sh pull-model
   ```

3. **Port conflicts:**
   ```bash
   # Check port usage
   lsof -i :3000
   lsof -i :3001
   lsof -i :11434
   ```

3. **Memory issues:**
   ```bash
   # Check Docker resources
   docker system df
   docker system prune
   ```

4. **Database connection issues:**
   ```bash
   ./scripts/dev.sh exec druids-postgres psql -U druids_user -d druids
   ```

### Performance Tuning

1. **Memory allocation:**
   - Adjust Docker memory limits in docker-compose.yml
   - Monitor with `./scripts/health.sh performance`

2. **Database optimization:**
   - Check query performance in logs
   - Monitor connection pools

3. **Redis tuning:**
   - Adjust maxmemory policy in redis.conf
   - Monitor cache hit rates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `./scripts/test.sh all`
4. Check health: `./scripts/health.sh check`  
5. Submit pull request

## 📝 License

MIT License - see LICENSE file for details.

---

For more information, see the [API Documentation](http://localhost:3000/api/v1) when the system is running.