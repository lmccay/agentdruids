# Druids Multi-Agent System

A multi-agent orchestration platform where specialized AI agents collaborate in federated workspaces. Agents communicate through a fully spec-compliant [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server, and the system is managed through a web UI or any MCP-compatible client.

## What It Does

Druids lets you define, configure, and coordinate AI agents that work together on complex tasks. Each agent has a type, a persona, a set of capabilities, and access to tools. A coordination layer manages how they collaborate, with full session isolation so multiple workflows can run concurrently without interference.

Agents don't answer from the model alone — they are **grounded in a built-in knowledge corpus (the WorldTree)**. Every agent ships with retrieval-augmented generation (RAG) out of the box: it can search ingested documents for relevant, cited passages and use them to ground its answers. Because that corpus is **scoped per realm**, a coordination session can **compose knowledge across multiple domain realms** — a coordinator can gather grounded research from one realm and bring it to bear on work in another, giving each session a rich, task-specific knowledge context without co-locating everything in one place. See [Knowledge, Retrieval & Research](#knowledge-retrieval--research-rag).

The system exposes everything through MCP, which means it integrates out of the box with tools like Goose, Claude Desktop, VS Code extensions, and any other MCP-compatible client.

## Agent Types

| Type | Role |
|------|------|
| **Druid** | Coordination agents — orchestrate other agents, can move between realms |
| **Elemental** | Domain specialists — bound to a single realm, deep expertise in one area |
| **Gaia** | Meta-agents — monitor ecosystem health and optimize system behavior |
| **Worldtree** | Knowledge agents — maintain the shared, searchable knowledge corpus that grounds every agent's answers (namespace- and realm-scoped access) |

## Core Concepts

- **Realms** — isolated workspaces where agents operate; can be federated together
- **Coordination Sessions** — a supervised multi-agent workflow, fully isolated from other sessions
- **WorldTree** — a searchable, embedded knowledge corpus (ingested documents → chunks → vectors) that grounds agent answers via built-in RAG; every item is scoped (global / realm / agent / session)
- **Retrieval & Research** — `search_worldtree` is a built-in tool on *every* agent, so agents ground their work in the corpus without extra wiring; a coordinator can compose grounded knowledge across the realms it can reach
- **MCP Tools** — all agent and coordination operations are exposed as MCP tools
- **Resource Access** — agents can read/write files and fetch URLs with explicit permission grants

## Knowledge, Retrieval & Research (RAG)

Druids has retrieval-augmented generation built in — it is not an add-on you have to assemble.

**A built-in, searchable knowledge corpus (the WorldTree).** Documents are ingested (via the [docling](https://github.com/DS4SD/docling) pipeline — URLs or staged directories), converted to text, chunked, and embedded into vectors. That corpus is what agents search to ground their answers with real, cited source passages instead of relying on the model's parametric memory alone.

**RAG on by default, for every agent.** Every agent ships with a `search_worldtree` tool automatically — no per-agent opt-in. When the persona or task makes it relevant, the agent retrieves the most relevant passages (with their source and section headings) and grounds its response in them. In-container files and remote URLs are reachable too, via the built-in `read_file`, `list_files`, `process_files_batch`, and `fetch_url` tools, gated by explicit permission grants.

**Scoped knowledge, so retrieval respects boundaries.** Every corpus item carries a scope — `global`, `realm`, `agent`, or `session`. Retrieval is scoped to what the agent may see:

| Agent | Sees in retrieval |
|-------|-------------------|
| **Elemental** (bound to one realm) | `global` + its own realm |
| **Druid** (can travel between realms) | `global` + every realm it can reach |

An elemental can't read another realm's knowledge; a broadly-scoped coordinator druid can pull from all the realms it has access to. Access is controlled by scope, not by withholding the tool.

**Composable across realms for rich session context.** This scoping is what makes knowledge *composable*. Rather than pouring every domain's documents into one giant realm, you keep siloed **domain realms** (e.g. a specialized research domain) and separate **activity realms** (the doers). A coordination session brings them together: a coordinator druid with access to both can gather grounded, cited research from a domain realm and carry it into the activity realm to inform the work — so each session assembles exactly the knowledge context its task needs, and siloed research realms stay independently reusable.

**Learn more:**
- [docs/worldtree-vision.md](docs/worldtree-vision.md) — what the WorldTree is and where it's headed
- [docs/in-session-retrieval-rag.md](docs/in-session-retrieval-rag.md) — using the corpus inside a session
- [docs/research-clerk-pattern.md](docs/research-clerk-pattern.md) — retrieve once, share grounded findings
- [docs/cross-realm-research-composition.md](docs/cross-realm-research-composition.md) — composing knowledge across siloed realms
- [docs/operator-ingestion-flow.md](docs/operator-ingestion-flow.md) — how documents get into the corpus

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

For architectural changes affecting coordination or session isolation, read the "Concurrent Session Architecture (CONSTITUTIONAL)" section of `CLAUDE.md` first — those constraints are non-negotiable.

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
