# Druids Development Guidelines

Sophisticated multi-agent system with federated architecture and comprehensive management UI. Last updated: 2025-11-05

## 🛡️ **CRITICAL: CONCURRENT SESSION ARCHITECTURE**
**CONSTITUTIONAL REQUIREMENT**: This system has production-ready concurrent session support that MUST NOT be regressed. See the "Concurrent Session Architecture (CONSTITUTIONAL)" section of `CLAUDE.md` for mandatory architectural principles. All changes MUST preserve:
- **Session Isolation**: Complete separation between coordination sessions
- **Session-Scoped Managers**: Three-layer isolation (Agent/Task/Content)  
- **Concurrency Tracking**: Coordinator limits and session lifecycle management
- **Stateless Services**: No session-specific state in service classes

## Active Technologies
- **Backend**: TypeScript (Node.js) + Ollama/OpenAI (LLM integration) + MCP Server specification (JSON-RPC 2.0 + SSE) + Docker + Redis + PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Axios

## Architecture Overview
Four agent types in federated realms connected via Ley Lines:
- **Druids**: Coordination agents with persona-driven decision making
- **Elementals**: Domain specialists with configurable expertise profiles  
- **Gaia**: Meta-agents for ecosystem health monitoring
- **Worldtree**: Collective knowledge repository with namespace-based access control

**Triple-Server Architecture:**
- **Main API Server** (port 3000): Internal system management REST APIs
- **MCP Server** (port 3003): External client integration via JSON-RPC 2.0
- **Frontend UI** (port 3004): React-based management interface

## Project Structure
```
src/
├── app.ts                # Main Express app with dual-server architecture
├── index.ts              # Entry point with graceful shutdown
├── models/               # Agent, Realm, Knowledge data models
│   ├── SessionAgentState.ts    # 🛡️ PROTECTED: Agent session isolation interfaces
│   ├── TaskQueueState.ts       # 🛡️ PROTECTED: Task queue management interfaces
│   ├── SessionContentState.ts  # 🛡️ PROTECTED: Content isolation interfaces
│   └── CoordinatorSessionState.ts # 🛡️ PROTECTED: Coordinator concurrency interfaces
├── services/             # Core business logic and integrations
│   ├── AgentService.ts   # Agent lifecycle, LLM integration, policy
│   ├── AsyncResultManager.ts # Long-running task management
│   ├── ScenarioService.ts # Multi-agent workflow coordination
│   ├── RealmService.ts   # Federated realm management
│   ├── SessionAgentManager.ts     # 🛡️ PROTECTED: Agent state isolation implementation
│   ├── TaskQueueManager.ts       # 🛡️ PROTECTED: Task queue implementation
│   ├── SessionContentManager.ts  # 🛡️ PROTECTED: Content storage isolation implementation
│   └── CoordinatorConcurrencyManager.ts # 🛡️ PROTECTED: Concurrency tracking implementation
├── mcp/                  # MCP-compliant servers and transport
│   ├── SimpleMCPServer.ts # External client integration (JSON-RPC 2.0)
│   └── start-mcp-server.ts # Standalone MCP server launcher
└── api/                  # REST API routes for internal system management

frontend/
├── src/
│   ├── pages/            # React page components (Agent, Realm, Coordination management)
│   ├── services/api.ts   # Axios client with REST + MCP integration
│   └── App.tsx          # Main React app with routing
├── Dockerfile           # Production nginx container
└── package.json         # React 18 + Vite + Tailwind dependencies

tests/
├── contract/             # MCP protocol compliance validation
├── integration/          # Multi-agent scenario testing
├── unit/                # Component isolation tests
└── concurrent_session/   # 🛡️ PROTECTED: Concurrent session validation tests
```

## Development Commands
```bash
# Environment Management  
./scripts/dev.sh start   # Docker dev environment (auto-downloads Ollama model)
./scripts/health.sh check # System health validation
npm run dev              # Local development server
npm run mcp:server       # Standalone MCP server for external clients

# Testing Strategy
npm test                 # All test suites
npm run test:contract    # MCP protocol compliance (5s timeout)
npm run test:integration # Multi-agent workflows (15s timeout)
npm run test:unit        # Component isolation (10s timeout)

# Frontend Development
cd frontend && npm run dev  # React dev server (http://localhost:3004)
cd frontend && npm run build # Production build

```

## Core Patterns & Conventions

### 🛡️ Concurrent Session Architecture (MANDATORY)
**CRITICAL**: All coordination operations MUST follow the session isolation pattern:
```typescript
// REQUIRED: Session creation with concurrency tracking
if (!this.coordinatorConcurrencyManager.canStartSession(coordinatorId)) {
  throw new Error('Coordinator at maximum concurrent sessions');
}
this.coordinatorConcurrencyManager.startSession(sessionId, coordinatorId, ...);

// REQUIRED: Session-scoped managers for isolation
const sessionAgentManager = new SessionAgentManagerImpl(sessionId);
const sessionContentManager = new SessionContentManagerImpl(config);

// REQUIRED: Activity tracking during execution
this.coordinatorConcurrencyManager.updateSessionActivity(sessionId);

// REQUIRED: Complete cleanup on completion/failure
this.coordinatorConcurrencyManager.endSession(sessionId, status);
session.sessionAgentManager.cleanup();
session.sessionContentManager.shutdown();
```

### Dual-Server Architecture
- **Main API Server** (`src/app.ts`): Internal system management, REST endpoints
- **MCP Server** (`src/mcp/SimpleMCPServer.ts`): External client integration via JSON-RPC 2.0
- Both servers share services but serve different client types (internal tools vs. external MCP clients)

### Frontend Component Pattern
React components follow container/presentation pattern:
```typescript
// Page components handle state and API calls
export default function AgentManagement() {
  const [agents, setAgents] = useState<Agent[]>([]);
  // fetchAgents(), handleCreate(), etc.
  return <AgentCard onEdit={handleEdit} />;
}

// UI components focus on presentation
function AgentCard({ agent, onEdit }: { agent: Agent; onEdit: (agent: Agent) => void }) {
  // Pure presentation logic
}
```

### API Integration Pattern
Frontend uses dual API approach - REST for CRUD, MCP for agent interactions:
```typescript
// REST API for system management (CRUD operations)
await agentApi.createAgent(formData);
await realmApi.getRealms();

// MCP protocol for agent coordination
await mcpApi.callTool('coordinate_agents', { coordinator_id, participants });
```

### Data Mapping Pattern
Frontend and backend use different data structures - always map correctly:
```typescript
// Frontend form data (flat structure)
const formData = { name, description, domain, systemPrompt };

// Backend expects nested structure
const updatePayload: UpdateAgentRequest = {
  name,
  description,
  specialization: { domain },  // Nested!
  llmConfig: { systemPrompt }   // Nested!
};
```

### Async Result Management  
Critical pattern for long-running agent tasks to prevent timeouts:
```typescript
// Smart async detection in MCP server
private shouldUseAsyncMode(message: string, agent: any, args: any): boolean {
  // Auto-detects based on complexity, length, force_async flag
}

// WorldTree namespace for result storage
const NAMESPACE_PREFIX = 'worldtree://public/async_results';
// Pattern: {agentId}/{requestId}/status.json
```

### Agent Service Integration
Always use `AgentService.executeAgentPrompt()` for LLM interactions:
```typescript
// Standard execution path used by both sync and async workflows
const result = await agentService.executeAgentPrompt(agentId, {
  prompt: message,
  conversationContext?: string
});
```

### Agent Configuration Models
- **SpecializationProfile**: Domain expertise, knowledge namespaces, max concurrent tasks
- **DruidPersona**: Communication style, decision making patterns, collaboration preferences  
- **ToolPermissions**: Granular access control with quotas and restrictions
- **AgentBinding**: Inter-agent relationships (coordination, delegation, monitoring)

### Knowledge Namespace Security
Hierarchical access control system:
```
agent://{agentId}/private/     # Agent-only access
agent://{agentId}/public/      # Read-only for others
worldtree://public/           # Shared knowledge base
worldtree://private/{agentId}/ # Private agent storage in shared system
```

### Test Structure Patterns
- **Contract Tests** (`tests/contract/`): MCP protocol compliance validation with 5s timeout
- **Integration Tests** (`tests/integration/`): Multi-agent scenario testing with 15s timeout  
- **Unit Tests** (`tests/unit/`): Component isolation with 10s timeout
- All tests use `tests/setup.ts` for environment configuration and mocked console methods

## MCP Protocol Compliance Rules
**CRITICAL**: MCP servers must follow exact protocol specifications to work with external clients (e.g., Goose).

### 🚨 MANDATORY: MCP Endpoint Usage
- **ALWAYS USE `/mcp` ENDPOINT**: All MCP requests MUST go to `http://localhost:3003/mcp` 
- **NEVER USE** root endpoint `/` - it will return HTML error pages
- **CACHE THIS KNOWLEDGE**: This is a recurring issue that wastes time and tokens
- **Example**: `curl -X POST "http://localhost:3003/mcp"` ✅ CORRECT
- **NOT**: `curl -X POST "http://localhost:3003/"` ❌ WRONG

### Response Format Standards
- `tools/call` responses MUST return `{ content: [{ type: "text", text: "..." }] }`
- Tool handlers should return simple data structures, not wrapper objects with metadata
- Never return `{ success: true, data: [...] }` - return just the data array directly
- Error handling: throw errors instead of returning error objects for tools/call

### Docker Container Management
- Always use `docker-compose build --no-cache` when code changes don't appear
- Service names in docker-compose.yml may differ from container names
- Use `docker-compose ps` to verify actual service names before restart commands
- Force container rebuilds: `docker-compose stop <service> && docker-compose build <service> --no-cache && docker-compose up -d <service>`

### MCP Session Management
- **SESSION ID EXTRACTION**: Session IDs are returned in the `Mcp-Session-Id` response header, NOT in JSON response body
- **Session Initialization**: Must call `initialize` method first, capture session ID from header: `curl -i` then `grep -i "mcp-session-id:"`
- **Session Usage**: Include session ID in subsequent requests: `-H "Mcp-Session-Id: $SESSION_ID"`
- SSE detection based on Accept header: `application/json, text/event-stream, application/json`
- Both SSE and JSON responses must follow same protocol format

### MCP Testing Best Practices
- **Use Test Scripts**: Created `test_mcp_session.sh` and `test_enhanced_coordination.sh` for repeatable testing
- **Session ID Pattern**: `SESSION_ID=$(curl -i ... | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')`
- **Tool Call Pattern**: Always include session header and proper JSON-RPC 2.0 format
- **Parameter Names**: Use snake_case in MCP tools (e.g., `coordinator_id`, `participant_ids`, `scenario_prompt`)

### Enhanced Coordination System
- **Content Integration**: System now performs actual content synthesis, not just planning
- **Three-Phase Process**: 1) Task delegation, 2) Participant execution, 3) Content integration & publishing
- **Integration Detection**: Auto-detects when agents provide actual content vs. just methodology
- **Final Result**: `finalResult.integratedContent` contains the synthesized output

### Debugging Protocol Issues
- Monitor logs with `docker logs <container> -f` during client testing
- Test protocol compliance with direct curl commands before client integration
- Validate JSON serialization explicitly in error handlers

## Recent Changes
- 001-druids-build-a: Added TypeScript multi-agent system with Ollama LLM integration, MCP Server HTTP interfaces, declarative agent configuration, namespace-based knowledge access control
- 2025-09-24: Fixed MCP protocol compliance for external client integration (Goose), implemented proper `tools/call` content format, resolved Docker container rebuild issues
- 2025-10-02: Enhanced async result system with WorldTree namespaces, intelligent async detection, and coordinated multi-agent workflows
- 2025-10-16: Added comprehensive React-based management UI (port 3004) with full CRUD for agents/realms, Tailwind CSS styling, and responsive design

## Known Issues & Solutions
### MCP Client Integration Issues
- **Symptom**: "Serialization error" from external MCP clients
- **Root Cause**: Incorrect `tools/call` response format
- **Solution**: Return `{ content: [{ type: "text", text: JSON.stringify(data) }] }` not raw data
- **Prevention**: Always test with curl before external client integration

### Docker Development Issues  
- **Symptom**: Code changes not reflected in running containers
- **Root Cause**: Docker cache preventing rebuild of changed files
- **Solution**: Use `--no-cache` flag and verify service names with `docker-compose ps`
- **Prevention**: Force rebuilds when iterating on server code

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->