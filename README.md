# Druids Multi-Agent System

A multi-agent orchestration platform where specialized AI agents collaborate in federated workspaces. Agents communicate through a fully spec-compliant [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server, and the system is managed through a web UI or any MCP-compatible client.

## What It Does

Druids lets you define, configure, and coordinate AI agents that work together on complex tasks. Each agent has a type, a persona, a set of capabilities, and access to tools. A coordination layer manages how they collaborate, with full session isolation so multiple workflows can run concurrently without interference.

The system exposes everything through MCP, which means it integrates out of the box with tools like Goose, Claude Desktop, VS Code extensions, and any other MCP-compatible client.

## Agent Types

| Type | Role |
|------|------|
| **Druid** | Coordination agents — orchestrate other agents, can move between realms |
| **Elemental** | Domain specialists — bound to a single realm, deep expertise in one area |
| **Gaia** | Meta-agents — monitor ecosystem health and optimize system behavior |
| **Worldtree** | Knowledge agents — maintain shared knowledge with namespace-based access control |

## Core Concepts

- **Realms** — isolated workspaces where agents operate; can be federated together
- **Coordination Sessions** — a supervised multi-agent workflow, fully isolated from other sessions
- **MCP Tools** — all agent and coordination operations are exposed as MCP tools
- **Resource Access** — agents can read/write files and fetch URLs with explicit permission grants

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git
- An OpenAI API key

### 1. Clone the repository

```bash
git clone <repo-url>
cd agentdruids
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set the following required values:

```bash
# LLM provider — OpenAI recommended
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...your-key-here...

# Docker service URLs — use these exactly as written
OLLAMA_BASE_URL=http://druids-ollama:11434
DATABASE_URL=postgresql://druids_user:druids_pass_dev@druids-postgres:5432/druids
REDIS_URL=redis://:druids_redis_dev@druids-redis:6379

# Optional: GitHub MCP integration
GITHUB_TOKEN=ghp_...your-token-here...
```

> `DATABASE_URL` and `REDIS_URL` must use the Docker service hostnames above, not `localhost`.

### 3. Build Docker images

```bash
docker compose build --no-cache
```

### 4. Start all services

```bash
docker compose --env-file .env up -d
```

### 5. Verify

```bash
./scripts/health.sh check
```

All core services should show healthy. If you're using OpenAI, the Ollama model warning can be ignored.

### Access points

| Service | URL |
|---------|-----|
| Frontend UI | http://localhost:3004 |
| Main API | http://localhost:3000 |
| MCP Server | http://localhost:3003/mcp |
| Grafana | http://localhost:3002 (admin / druids_admin) |
| Prometheus | http://localhost:9090 |

## Common Operations

```bash
# Stop services (data is preserved)
docker compose down

# Full reset — wipes all data and reinitializes the database
docker compose down -v && docker compose --env-file .env up -d

# Rebuild a single service after code changes
docker compose build --no-cache <service-name>
docker compose --env-file .env up -d <service-name>

# View logs
docker logs druids-main -f
docker logs druids-mcp-server -f

# Run tests
docker compose exec druids-main npm test
docker compose exec druids-main npm run test:unit
docker compose exec druids-main npm run test:integration
```

## MCP Client Integration

Connect any MCP-compatible client to `http://localhost:3003/mcp`.

**Goose example (`goose_config.yaml`):**
```yaml
mcp_servers:
  druids:
    transport:
      type: http
      url: http://localhost:3003/mcp
      headers:
        MCP-Protocol-Version: "2025-06-18"
```

See [docs/MCP_CLIENT_CONFIGURATION.md](docs/MCP_CLIENT_CONFIGURATION.md) for configuration guides for other clients.

## Project Structure

```
src/          Backend — API server, MCP server, agent services
frontend/     React management UI
tests/        Contract, integration, unit, and performance tests
docker/       Database init, Nginx config, Prometheus config
scripts/      Dev, test, and health check scripts
docs/         Extended documentation
```

## Contributing

1. Fork and create a feature branch
2. Make changes and run `docker compose exec druids-main npm run type-check`
3. Run the test suite: `docker compose exec druids-main npm test`
4. Open a pull request

For architectural changes affecting coordination or session isolation, read `CONCURRENT_SESSION_CONSTITUTION.md` first — those constraints are non-negotiable.

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
