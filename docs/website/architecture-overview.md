# Druids Architecture: A Federated Monolith for Multi-Agent Orchestration

## Overview

Druids is a **monolithic multi-agent orchestration platform** with **federation capabilities** and **external agent integration**. Unlike traditional distributed systems that deploy each agent as a separate microservice, Druids runs all agents within a single process while providing standard interfaces for external collaboration.

This architectural approach delivers significant advantages in identity management, operational simplicity, and performance while maintaining the flexibility to federate across organizational boundaries and integrate external agents.

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Druids Monolithic Service                  │
│                                                                │
│  ┌──────────────┐                            ┌───────────────┐ │
│  │   Web UI     │      External Interfaces   │  MCP Server   │ │
│  │  Interface   │                            │   Interface   │ │
│  └──────┬───────┘                            └───────┬───────┘ │
│         │                                            │         │
│         └────────────────┬───────────────────────────┘         │
│                          │                                     │
│  ┌───────────────────────▼──────────────────────────────────┐  │
│  │                    API Layer                             │  │
│  │  • REST endpoints  • WebSocket  • MCP handlers           │  │
│  └───────────────────────┬──────────────────────────────────┘  │
│                          │                                     │
│  ┌───────────────────────▼──────────────────────────────────┐  │
│  │              Coordination Layer                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │  │
│  │  │ Coordinator  │  │ Coordinator  │  │ External      │   │  │
│  │  │    (Built-in)│  │    (Custom)  │  │ Coordinator   │   │  │
│  │  └──────┬───────┘  └───────┬──────┘  └────────┬──────┘   │  │
│  │         └──────────────────┴──────────────────┘          │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │                    Druid Layer                           │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐        │  │
│  │  │ Engineering│  │ Marketing  │  │ External     │        │  │
│  │  │   Druid    │  │   Druid    │  │   Druid      │        │  │
│  │  │            │  │            │  │  (Bridge)    │        │  │
│  │  └─────┬──────┘  └──────┬─────┘  └───────┬──────┘        │  │
│  │        │                │                │               │  │
│  │  ┌─────▼────────────────▼────────────────▼──────────┐    │  │
│  │  │           Realm Travel Service                   │    │  │
│  │  └─────┬────────────────┬────────────────┬──────────┘    │  │
│  └────────┼────────────────┼────────────────┼───────────────┘  │
│           │                │                │                  │
│  ┌────────▼────────┐  ┌────▼─────────┐  ┌───▼──────────────┐   │
│  │  Engineering    │  │  Marketing   │  │   Legal          │   │
│  │     Realm       │  │    Realm     │  │   Realm          │   │
│  │                 │  │              │  │                  │   │
│  │ ┌─────────────┐ │  │ ┌──────────┐ │  │ ┌──────────────┐ │   │
│  │ │GitHub       │ │  │ │HubSpot   │ │  │ │DocuSign      │ │   │
│  │ │Elemental    │ │  │ │Elemental │ │  │ │Elemental     │ │   │
│  │ └─────────────┘ │  │ └──────────┘ │  │ └──────────────┘ │   │
│  │ ┌─────────────┐ │  │ ┌──────────┐ │  │ ┌─────────────┐  │   │
│  │ │Slack        │ │  │ │Slack     │ │  │ │Contract     │  │   │
│  │ │Elemental    │ │  │ │Elemental │ │  │ │Elemental    │  │   │
│  │ └─────────────┘ │  │ └──────────┘ │  │ └─────────────┘  │   │
│  │ ┌─────────────┐ │  │              │  │                  │   │
│  │ │AWS          │ │  │              │  │                  │   │
│  │ │Elemental    │ │  │              │  │                  │   │
│  │ └─────────────┘ │  │              │  │                  │   │
│  └─────────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Worldtree (Global Knowledge)            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   Patterns   │  │   Context    │  │   History    │   │   │
│  │  │   Learned    │  │   Preserved  │  │   Retained   │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Shared Services Layer                      │   │
│  │  • Token Management  • Policy Engine  • Audit Logging   │   │
│  │  • Session Manager   • Agent Registry • Realm Service   │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘

           │ Federation via MCP  │ Federation via MCP  │
           ▼                     ▼                     ▼
    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │   Druids     │      │   Druids     │      │   External   │
    │ Deployment 2 │      │ Deployment 3 │      │    Agent     │
    │  (Partner)   │      │ (Customer)   │      │   (Goose)    │
    └──────────────┘      └──────────────┘      └──────────────┘
```

## Core Architectural Principles

### 1. Monolithic Design with In-Process Agents

**All agents run within a single Node.js process:**

- Coordinators are objects managed by `CoordinationService`
- Druids are objects managed by `AgentService`
- Elementals are objects managed by `AgentService`
- No network communication between internal agents
- Shared memory space for efficient context passing

**Why monolithic for AI agents?**

Unlike traditional distributed systems where microservices provide benefits (independent scaling, technology diversity, failure isolation, team boundaries), AI agents are:

- ✅ **Homogeneous** - All use LLM APIs (same technology stack)
- ✅ **Stateless** - No persistent state requiring independent scaling
- ✅ **Context-dependent** - Benefit from shared memory rather than network calls
- ✅ **Single platform** - Unified product, single team ownership

**Result:** All microservice overhead, none of the benefits. Monolithic design provides simplicity, performance, and identity advantages (see [Architectural Advantage](/docs/architectural-advantage)).

### 2. External Interfaces for Integration

Druids exposes two primary interfaces, both accessing the system through a unified API layer:

**API Layer:**
- Centralized request handling for all external interfaces
- REST endpoints for CRUD operations
- WebSocket connections for real-time updates
- MCP protocol handlers for external agent integration
- Authentication and authorization enforcement
- Request routing to appropriate services

**Web UI Interface:**
- User-facing interface for scenario creation, agent management, monitoring
- Real-time coordination session visibility
- Agent configuration and realm management
- WebSocket-based live updates
- Interacts via REST API and WebSocket

**MCP Server Interface:**
- Model Context Protocol server for external agent integration
- Standard tool exposure for Druids capabilities
- Enables external agents (Goose, AutoGPT, etc.) to participate in coordinations
- Bidirectional communication with external systems
- Interacts via MCP protocol handlers in API layer

### 3. Federation Capability

Multiple Druids deployments can federate:

```
Company A's Druids:
  ├─ Engineering Realm (internal)
  ├─ Legal Realm (internal)
  └─ Federation: Can delegate to Partner B's Druids

Partner B's Druids:
  ├─ Specialized Domain Realm (internal)
  └─ Federation: Accepts delegations from Company A

Cross-Deployment Coordination:
  Company A's coordinator delegates task to Partner B's specialized druid
  ↓
  MCP communication (authenticated, authorized)
  ↓
  Partner B's druid executes in their realm with their tools
  ↓
  Results returned to Company A's coordinator
```

**Benefits:**
- Organizations maintain sovereignty over their realms
- Cross-organizational collaboration without shared infrastructure
- Standards-based federation (MCP protocol)
- Audit trails preserved across boundaries

## The Hierarchy: Understanding Agent Types and Realms

### Realms: Domain Isolation Boundaries

**Realms are business or functional domains, not tool-level divisions.**

```
Good Realm Granularity:
  ✅ Engineering Realm
  ✅ Legal Realm
  ✅ Marketing Realm
  ✅ Finance Realm
  ✅ Security Realm

Bad Realm Granularity:
  ❌ GitHub Realm (tool-level, too granular)
  ❌ Slack Realm (tool-level)
  ❌ Backend Engineering Realm (too fine-grained)
```

**Characteristics:**
- Contain related tools and data
- Represent organizational boundaries
- Enforce access control (realm-specific permissions)
- Enable context isolation (Legal realm ≠ Engineering realm)

**Example: Engineering Realm**
```
Engineering Realm:
  Tools Available:
    ├─ GitHub (via GitHub Elemental)
    ├─ Slack (via Slack Elemental)
    ├─ AWS (via AWS Elemental)
    ├─ Datadog (via Datadog Elemental)
    └─ PagerDuty (via PagerDuty Elemental)

  Data Access:
    ├─ Source code repositories
    ├─ CI/CD pipelines
    └─ Engineering Slack channels

  Permissions:
    └─ Engineering druids can access this realm
```

### Elementals: Realm-Bound Specialists

**Elementals are the most specific agents, bound to a single realm.**

```typescript
interface Elemental {
  type: "elemental";
  realmId: string;              // Bound to one realm
  toolAccess: string[];         // Specific tools (e.g., ["github"])
  systemPrompt: string;         // Specialized instructions
  capabilities: {
    canRead: string[];          // Read capabilities
    canWrite: string[];         // Write capabilities
    canExecute: string[];       // Execute capabilities
  };
}
```

**Characteristics:**
- Cannot travel between realms (realm-bound)
- Have access to realm-specific tools
- Highly specialized (GitHub elemental only does GitHub operations)
- Invoked by druids to perform specific tasks

**Examples:**
- **GitHub Elemental** - Code review, PR management, issue creation
- **Slack Elemental** - Message posting, channel management, notifications
- **AWS Elemental** - EC2 management, S3 operations, Lambda deployment
- **DocuSign Elemental** - Contract sending, signature tracking

### Druids: Traveling Multi-Realm Specialists

**Druids can travel between realms and coordinate elementals.**

```typescript
interface Druid {
  type: "druid";
  realmAccess: string[];        // Can access multiple realms
  travelHistory: string[];      // Realms visited
  persona: DruidPersona;        // Specialized role
  delegationPermissions: {      // Can work with elementals
    canWorkWith: string[];      // Elemental IDs
  };
}
```

**Characteristics:**
- Travel between authorized realms
- Coordinate multiple elementals within a realm
- Maintain context across realm boundaries
- Specialized by domain (engineering druid, security druid)

**Example: Engineering Druid**
```
Engineering Druid:
  Persona: "Software engineering specialist"
  Realm Access: [Engineering, Security]

  Workflow:
    1. Starts in Engineering realm
    2. Works with GitHub elemental (code review)
    3. Travels to Security realm (to check vulnerabilities)
    4. Works with Security elemental (scan code)
    5. Returns to Engineering realm (report findings)
    6. Works with Slack elemental (notify team)
```

**Why druids travel:**
- Complex tasks span multiple domains
- Need different tools in different contexts
- Maintain state/context across realm boundaries
- Enable cross-realm coordination

### Coordinators: Global Orchestrators

**Coordinators orchestrate druids but don't travel themselves.**

```typescript
interface Coordinator {
  type: "coordinator";
  position: "global";           // Don't travel
  coordinationStrategy: string; // "hierarchical" | "consensus" | "auction"
  delegationPermissions: {
    canDelegateTo: string[];    // Druid IDs only (never elementals)
  };
}
```

**Characteristics:**
- Globally positioned (don't need realm-specific tools)
- Delegate only to druids (never directly to elementals)
- Implement coordination strategies (hierarchical, consensus, auction-based)
- Can be external agents (e.g., Goose coordinator)

**Why coordinators don't travel:**
- Don't need realm-specific tools (druids do the work)
- Can coordinate across multiple realms simultaneously
- Simpler orchestration (no need to track coordinator position)
- Eliminates permission leakage (coordinators never access realm tools)

**Strict Delegation Hierarchy:**
```
✅ Coordinator → Druid → Elemental (Correct)
❌ Coordinator → Elemental (Blocked - violates hierarchy)

Why: Coordinators shouldn't access realm-specific tools.
      This maintains security isolation.
```

### Worldtree: Global Knowledge Store

**Worldtree is a centralized knowledge repository accessible to all agents.**

```
Worldtree (Global, Persistent):
  ├─ Patterns Learned
  │  └─ Successful coordination strategies
  │  └─ Common task decompositions
  │  └─ Effective tool usage patterns
  │
  ├─ Context Preserved
  │  └─ Previous coordination sessions
  │  └─ User preferences and patterns
  │  └─ Domain-specific knowledge
  │
  └─ History Retained
     └─ Coordination outcomes
     └─ Agent performance metrics
     └─ Evolution insights
```

**Characteristics:**
- Global scope (not realm-specific)
- Persistent across sessions
- Accessible to all agents (coordinators, druids, elementals)
- Enables learning and evolution

**Use Cases:**
- Agent learns successful code review pattern → stores in Worldtree
- Other agents query Worldtree for similar tasks
- Coordination strategies improve over time
- Organization-specific knowledge accumulates

**Future: Worldtree Evolution**
- Self-play scenario execution
- Automatic pattern discovery
- Strategy comparison and optimization
- Emergent coordination behaviors

## The Complete Hierarchy in Action

### Example: Cross-Realm Code Review with Security Audit

```
User: "Review PR #123 and run security audit"

┌────────────────────────────────────────────────────────────┐
│ 1. Coordinator Level (Global)                              │
│                                                            │
│  Built-in Coordinator:                                     │
│    ├─ Receives request from user                           │
│    ├─ Decomposes: code review + security audit             │
│    ├─ Delegates to: engineering-druid-1                    │
│    └─ Waits for results                                    │
└────────────────────────────────────────────────────────────┘
           │
           │ Delegation (Coordinator → Druid)
           ▼
┌────────────────────────────────────────────────────────────┐
│ 2. Druid Level (Engineering Druid)                         │
│                                                            │
│  engineering-druid-1:                                      │
│    ├─ Starts in Engineering realm                          │
│    ├─ Task: Review PR #123                                 │
│    ├─ Works with: github-elemental                         │
│    │   └─ Fetches PR, analyzes changes                     │
│    ├─ Task: Security audit                                 │
│    ├─ Travels to: Security realm                           │
│    ├─ Works with: security-elemental                       │
│    │   └─ Scans code for vulnerabilities                   │
│    ├─ Returns to: Engineering realm                        │
│    ├─ Works with: github-elemental                         │
│    │   └─ Posts review with security findings              │
│    └─ Returns results to coordinator                       │
└────────────────────────────────────────────────────────────┘
           │                              │
           │ (Engineering realm)          │ (Security realm)
           ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│ 3. Elemental Level       │    │ 3. Elemental Level       │
│    (Engineering Realm)   │    │    (Security Realm)      │
│                          │    │                          │
│  github-elemental:       │    │  security-elemental:     │
│    ├─ Fetch PR #123      │    │    ├─ Scan codebase      │
│    ├─ Analyze changes    │    │    ├─ Check vulns        │
│    └─ Post review        │    │    └─ Generate report    │
└──────────────────────────┘    └──────────────────────────┘
```

**Key Points:**
- Coordinator orchestrates at high level (never touches GitHub or security tools)
- Druid travels between realms (Engineering → Security → Engineering)
- Elementals execute specific operations (GitHub operations, security scans)
- Clear separation of concerns and security boundaries

## Monolith Benefits Over Distributed Microservices

### 1. Identity Management

**Microservices:**
- Each agent service needs infrastructure identity (TLS cert, K8s account, IAM role)
- 100 agent services = 100 infrastructure identities
- Plus service credentials for each agent

**Monolith:**
- Single Druids service needs 1 infrastructure identity
- Agents share user credentials (see [User-Delegated Identity](/docs/user-delegated-identity))
- 99% infrastructure identity reduction

### 2. Performance

**Microservices:**
- Inter-agent communication via network (HTTP/gRPC)
- Serialization/deserialization overhead
- Network latency for each coordination step
- Service mesh overhead (sidecar proxies)

**Monolith:**
- In-process communication (function calls)
- Shared memory (zero serialization)
- Nanosecond latency
- No service mesh needed

**Example:** Coordinator → Druid → Elemental delegation
- Microservices: 2 network calls (~10-50ms each)
- Monolith: 2 function calls (~0.001ms each)

### 3. Operational Complexity

**Microservices:**
- Deploy and manage 100+ services
- Container orchestration (Kubernetes)
- Service discovery configuration
- Load balancer management
- Inter-service network policies
- Distributed tracing setup
- 100 health checks to monitor

**Monolith:**
- Deploy and manage 1 service
- Simple container deployment
- No service discovery needed
- Single load balancer
- Simple egress policies
- Centralized logging/tracing
- 1 health check

### 4. Development Velocity

**Microservices:**
- Changes spanning multiple agents require coordinated deploys
- Versioning and compatibility management
- API contracts between services
- Integration testing across services

**Monolith:**
- Change agents and deploy once
- No API versioning between agents (in-process)
- Simple integration testing
- Faster iteration

### 5. Debugging and Observability

**Microservices:**
- Trace requests across multiple services
- Correlate logs from 100+ services
- Distributed state reconstruction
- Complex debugging workflows

**Monolith:**
- Single process to debug
- Centralized logging
- Unified stack traces
- Simple debugging

### 6. Cost Efficiency

**Microservices:**
- 100 containers running 24/7
- Kubernetes cluster overhead
- Load balancers for each service
- Network bandwidth between services

**Monolith:**
- 1 container running 24/7
- Minimal infrastructure
- Single load balancer
- No inter-service bandwidth

## External Agent Integration

Druids supports external agents through the **shadow identity pattern** using MCP:

### Integration Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Druids Monolith                        │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │          MCP Server (External Interface)             │ │
│  └────────────────────┬─────────────────────────────────┘ │
│                       │                                   │
│  ┌────────────────────▼─────────────────────────────────┐ │
│  │     External Agent Bridge Service                    │ │
│  │  • Agent registration                                │ │
│  │  • Health monitoring                                 │ │
│  │  • Message routing                                   │ │
│  └────────────────────┬─────────────────────────────────┘ │
│                       │                                   │
│  ┌────────────────────▼─────────────────────────────────┐ │
│  │     Shadow Agent Objects                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │ |
│  │  │ Goose Agent  │  │ AutoGPT      │  │ Custom     │  │ |
│  │  │   (Shadow)   │  │  (Shadow)    │  │   Agent    │  │ |
│  │  └──────────────┘  └──────────────┘  └────────────┘  │ |
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
                       │ MCP Protocol
                       ▼
┌────────────────────────────────────────────────────────────┐
│              External Agent (Separate Process)             │
│                                                            │
│  Goose, AutoGPT, Custom Agent, etc.                        │
│  • Runs independently                                      │
│  • Maintains own infrastructure identity                   │
│  • Communicates via MCP                                    │
└────────────────────────────────────────────────────────────┘
```

### Shadow Identity Pattern

External agents are represented by **shadow objects** inside Druids:

```typescript
interface ExternalAgentShadow {
  agentId: string;              // Unique identifier
  type: "coordinator" | "druid" | "elemental";
  displayName: string;          // "Goose Main Coordinator"

  // External communication
  networkInfo: {
    endpoint: string;           // "https://goose.company.com/mcp"
    protocol: "mcp-http";       // MCP protocol variant
    healthCheckInterval: number;
  };

  // Permissions (like internal agents)
  delegationPermissions?: {...};
  realmAccess?: string[];

  // Status tracking
  status: "active" | "unreachable" | "degraded";
  lastHealthCheck: Timestamp;
}
```

**How it works:**
1. External agent registers with Druids via MCP
2. Druids creates shadow object representing the external agent
3. Shadow object participates in coordinations like internal agents
4. When shadow is invoked, Druids forwards via MCP to real external agent
5. Results returned via MCP and passed back through coordination

### Integration Types

**1. External Coordinator:**
```typescript
// Goose registers as coordinator
{
  "type": "coordinator",
  "agentId": "goose-coordinator-main",
  "endpoint": "https://goose.company.com/mcp",
  "delegationPermissions": {
    "canDelegateTo": [
      "engineering-druid-1",
      "marketing-druid-2"
    ]
  }
}

// Goose can now orchestrate Druids' internal agents
```

**2. External Druid:**
```typescript
// Custom security agent registers as druid
{
  "type": "druid",
  "agentId": "external-security-druid",
  "endpoint": "https://security-agent.company.com/mcp",
  "realmAccess": ["security"],
  "persona": "Security vulnerability specialist"
}

// Druids coordinators can delegate to this external security agent
```

**3. External Elemental:**
```typescript
// Specialized tool agent registers as elemental
{
  "type": "elemental",
  "agentId": "external-custom-tool",
  "endpoint": "https://custom-tool.company.com/mcp",
  "realmId": "engineering",
  "toolAccess": ["custom-proprietary-system"]
}

// Engineering druids can work with this external elemental
```

### Integration Steps for External Agents

**For Agent Developers:**

1. **Implement MCP Server Interface**
   ```typescript
   // Your agent exposes MCP server
   class MyAgentMCPServer {
     async handleToolCall(call: MCPToolCall) {
       // Execute agent's capabilities
     }

     async healthCheck() {
       // Report agent health
     }
   }
   ```

2. **Register with Druids**
   ```typescript
   POST /api/agents/external/register
   {
     "agentId": "my-custom-agent",
     "type": "druid",
     "endpoint": "https://my-agent.com/mcp",
     "capabilities": {
       "canRead": ["github:repos"],
       "canWrite": ["github:issues"],
       "canExecute": ["custom:analysis"]
     }
   }
   ```

3. **Implement Required Callbacks**
   - `execute(task, context)` - Main execution endpoint
   - `healthCheck()` - Health status reporting
   - `getCapabilities()` - Capability discovery

4. **Handle Delegation**
   ```typescript
   // When Druids delegates to your agent:
   async execute(task, context) {
     // context includes:
     // - userId: Who initiated coordination
     // - sessionId: Current coordination session
     // - delegationChain: Path to your agent

     // Perform your agent's work
     const result = await performTask(task);

     // Return results to Druids
     return result;
   }
   ```

5. **Maintain Health**
   ```typescript
   // Druids periodically health-checks external agents
   async healthCheck() {
     return {
       status: "healthy",
       capabilities: [...],
       load: 0.3,
       availableCapacity: 100
     };
   }
   ```

### Benefits of External Integration

**For External Agent Developers:**
- ✅ Participate in Druids orchestrations
- ✅ Access Druids' realm structure and tools
- ✅ Leverage Druids' user identity management
- ✅ Benefit from Druids' coordination strategies
- ✅ Maintain independence (own infrastructure, own process)

**For Druids Users:**
- ✅ Integrate specialized external agents
- ✅ Extend capabilities without modifying Druids
- ✅ Leverage existing agent ecosystems (Goose, AutoGPT, etc.)
- ✅ Maintain unified orchestration and audit trails

## Federation Across Druids Deployments

Multiple Druids deployments can federate to enable cross-organizational collaboration:

### Federation Architecture

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   Company A's Druids    │         │   Partner B's Druids    │
│                         │         │                         │
│  ┌──────────────────┐   │  MCP    │   ┌──────────────────┐  │
│  │  Coordinator     │───┼─────────┼──►│  Specialized     │  │
│  │                  │   │  Auth   │   │  Druid           │  │
│  └──────────────────┘   │         │   └──────────────────┘  │
│                         │         │                         │
│  Realms:                │         │  Realms:                │
│  • Engineering          │         │  • Domain Expertise     │
│  • Legal                │         │  • Specialized Tools    │
└─────────────────────────┘         └─────────────────────────┘
```

### Federation Use Cases

**1. Partner Collaboration:**
- Company A's coordinator delegates specialized task to Partner B's druid
- Partner B executes in their realm with their specialized tools
- Results returned to Company A with full audit trail

**2. Customer Deployments:**
- SaaS provider runs central Druids
- Enterprise customers run their own Druids (behind firewall)
- Federated coordination across boundary

**3. Domain Specialization:**
- Core Druids provides general capabilities
- Specialized Druids provides domain expertise (medical, legal, financial)
- Federated to combine general + specialized

### Federation Security

- Authentication required for cross-deployment communication
- Authorization enforced (which deployments can delegate to which)
- Audit trails preserved across federation boundaries
- Each deployment maintains sovereignty over its realms

## Summary

Druids' architecture delivers unique advantages:

**Monolithic Design:**
- 99% infrastructure identity reduction (see [Architectural Advantage](/docs/architectural-advantage))
- In-process performance (nanosecond latency)
- Operational simplicity (single deployment)
- Cost efficiency (minimal infrastructure)

**Hierarchical Structure:**
- Clear separation of concerns (Coordinators → Druids → Elementals)
- Realm-based isolation (security boundaries)
- Flexible coordination strategies
- Global knowledge store (Worldtree)

**External Integration:**
- Standard MCP interfaces (UI and server)
- Shadow identity pattern for external agents
- Federation across deployments
- Ecosystem compatibility (Goose, AutoGPT, etc.)

**Identity Management:**
- User-delegated credentials (see [User-Delegated Identity](/docs/user-delegated-identity))
- 50% service credential reduction
- Zero shadow identities
- Full audit trails

This architecture positions Druids as a **federated monolith**: all the benefits of a unified platform, with the flexibility to integrate external agents and federate across organizational boundaries.

---

**Related:**
- [Architectural Advantage: Infrastructure Identity Reduction](/docs/architectural-advantage)
- [User-Delegated Identity: Service Credential Reduction](/docs/user-delegated-identity)
- [MCP Integration Guide](/docs/mcp-integration)
- [Getting Started with Druids](/docs/getting-started)

---

*Last updated: January 2, 2025*
