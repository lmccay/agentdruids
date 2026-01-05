# Data Model: Druids Multi-Agent System

## Core Entities

### Agent
```typescript
interface Agent {
  id: string
  type: 'druid' | 'elemental' | 'gaia' | 'worldtree'
  realmId: string
  status: 'active' | 'inactive' | 'error'
  createdAt: Date
  lastActive: Date
  configuration: AgentConfiguration
}
```

### AgentConfiguration
```typescript
interface AgentConfiguration {
  llmModel: string
  systemPrompt: string
  toolAccess: ToolAccessPolicy[]
  knowledgeAccess: KnowledgeAccessPolicy[]
  specialization?: SpecializationProfile
  persona?: DruidPersona
}
```

### DruidPersona
```typescript
interface DruidPersona {
  id: string
  name: string
  description: string
  coordinationStyle: 'collaborative' | 'directive' | 'consultative' | 'delegative'
  decisionMakingApproach: string
  managementPrinciples: string[]
  elementalBindings: string[] // Elemental agent IDs
}
```

### SpecializationProfile
```typescript
interface SpecializationProfile {
  id: string
  domain: string
  expertise: string[]
  capabilities: string[]
  constraints: string[]
  defaultPrompts: string[]
}
```

### Realm
```typescript
interface Realm {
  id: string
  name: string
  description: string
  status: 'active' | 'maintenance' | 'offline'
  agents: Agent[]
  leyLineConnections: LeyLineConnection[]
  healthMetrics: RealmHealthMetrics
}
```

### LeyLineConnection
```typescript
interface LeyLineConnection {
  id: string
  sourceRealmId: string
  targetRealmId: string
  status: 'connected' | 'disconnected' | 'degraded'
  latency: number
  lastPingTime: Date
  configuration: LeyLineConfiguration
}
```

### LeyLineConfiguration
```typescript
interface LeyLineConfiguration {
  maxLatency: number
  retryPolicy: RetryPolicy
  authentication: AuthenticationConfig
  encryption: EncryptionConfig
}
```

### KnowledgeNamespace
```typescript
interface KnowledgeNamespace {
  path: string // e.g., "/agents/agent-123/private" or "/agents/agent-123/public"
  ownerId: string
  type: 'private' | 'public' | 'shared'
  accessPolicies: KnowledgeAccessPolicy[]
  metadata: NamespaceMetadata
}
```

### KnowledgeAccessPolicy
```typescript
interface KnowledgeAccessPolicy {
  agentId: string
  namespacePath: string
  permissions: ('read' | 'write' | 'execute')[]
  conditions?: AccessCondition[]
  expiresAt?: Date
}
```

### ToolAccessPolicy
```typescript
interface ToolAccessPolicy {
  agentId: string
  mcpServerId: string
  toolName: string
  permissions: ('invoke' | 'configure')[]
  rateLimits?: RateLimit[]
  conditions?: AccessCondition[]
}
```

### MCPServer
```typescript
interface MCPServer {
  id: string
  name: string
  endpoint: string
  protocol: 'http' | 'https'
  authentication: AuthenticationConfig
  capabilities: MCPCapability[]
  status: 'online' | 'offline' | 'error'
}
```

### MCPCapability
```typescript
interface MCPCapability {
  name: string
  description: string
  inputSchema: JSONSchema
  outputSchema: JSONSchema
  requiresAuth: boolean
}
```

### Scenario
```typescript
interface Scenario {
  id: string
  name: string
  description: string
  type: 'self-play' | 'evaluation' | 'training'
  initialConditions: ScenarioCondition[]
  successCriteria: SuccessCriterion[]
  participants: ScenarioParticipant[]
  timeLimit?: number
  configuration: ScenarioConfiguration
}
```

### ScenarioParticipant
```typescript
interface ScenarioParticipant {
  agentId: string
  role: string
  objectives: string[]
  constraints: string[]
  resources: ResourceGrant[]
}
```

### WorkflowExecution
```typescript
interface WorkflowExecution {
  id: string
  scenarioId: string
  startTime: Date
  endTime?: Date
  status: 'running' | 'completed' | 'failed' | 'timeout'
  participants: Agent[]
  interactions: AgentInteraction[]
  outcomes: ExecutionOutcome[]
  metrics: PerformanceMetrics
}
```

### AgentInteraction
```typescript
interface AgentInteraction {
  id: string
  sourceAgentId: string
  targetAgentId?: string // null for tool/knowledge interactions
  type: 'communication' | 'tool-invocation' | 'knowledge-access'
  timestamp: Date
  content: InteractionContent
  result: InteractionResult
}
```

## State Transitions

### Agent Status Flow
```
[inactive] -> [active] -> [error]
    ^                        |
    |                        v
    +-------- [maintenance] <-+
```

### Realm Status Flow
```
[offline] -> [maintenance] -> [active]
    ^                            |
    |                            v
    +------------- [maintenance] <-+
```

### Scenario Execution Flow
```
[created] -> [running] -> [completed]
                |              ^
                v              |
            [timeout]    [failed]
```

## Validation Rules

### Agent Configuration
- LLM model must be available in connected Ollama instance
- System prompt must be non-empty string
- Tool access policies must reference existing MCP servers
- Knowledge access policies must reference valid namespace paths

### Realm Management
- Each realm must have at least one active agent
- Ley Line connections require mutual authentication
- Health metrics must be updated every 30 seconds

### Knowledge Namespaces
- Private namespaces are exclusive to owner agent
- Public namespaces allow read access to all agents in realm
- Shared namespaces require explicit access policies
- Namespace paths must follow hierarchical structure: /agents/{agentId}/{type}/...

### Scenario Execution
- All participant agents must be active and in same realm cluster
- Success criteria must be measurable and time-bounded
- Resource grants must not conflict with existing access policies
