# Asynchronous Agent Result System Design

## Problem Statement

Desktop MCP clients expect synchronous responses, but agent LLM interactions can take 10-30+ seconds, causing:
- ❌ Request timeouts
- ❌ Poor user experience 
- ❌ Client disconnections
- ❌ Lost agent responses

## Solution: Async Result Publishing to WorldTree

### Core Concept
1. **Immediate Response**: Return a `requestId` immediately to the client
2. **Async Processing**: Agent processes request in background
3. **Result Publishing**: Agent publishes result to WorldTree public namespace
4. **Result Retrieval**: Client polls or queries for results using `requestId`

### Namespace Structure
```
worldtree://public/async_results/{agentId}/{requestId}
├── status.json          # "pending" | "completed" | "failed" 
├── result.json          # Agent's response content
├── metadata.json        # Timestamps, execution info
└── error.json           # Error details if failed
```

### API Flow
```
1. Client → ask_agent_async(agentId, message) 
   Response: { requestId: "req_123", estimatedTime: 30000 }

2. Agent processes in background, publishes to:
   worldtree://public/async_results/{agentId}/req_123/

3. Client → get_async_result(requestId)
   Response: { status: "completed", result: "..." }
```

## Implementation Plan

### Phase 1: Async Result Infrastructure
- AsyncResultManager service
- WorldTree namespace integration
- Request ID generation system

### Phase 2: Agent Integration
- Modify ask_agent to support async mode
- Background task processing
- Result publishing pipeline

### Phase 3: Client Interface
- New async tools (ask_agent_async, get_async_result)
- Status polling mechanisms
- Result streaming options

### Phase 4: Enhanced Features
- WebSocket notifications
- Result expiration/cleanup
- Progress updates during processing

## Benefits
- ✅ No timeout issues
- ✅ Better user experience
- ✅ Support for long-running tasks
- ✅ Multiple concurrent requests
- ✅ Persistent results across sessions
- ✅ Client can do other work while waiting