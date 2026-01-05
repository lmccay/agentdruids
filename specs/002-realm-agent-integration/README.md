# Enhancement Specification: Realm-Agent Integration

**Feature ID**: 002-realm-agent-integration  
**Date**: September 19, 2025  
**Status**: Draft  
**Priority**: High  
**Depends On**: 001-druids-build-a  

## Overview

Enhance the RealmService to actively manage and track all agents within realms, providing real-time agent registration, discovery, capability aggregation, and resource management at the realm level.

## Current State

- Realm model has `agents: AgentId[]` field but is not actively used
- RealmService imports `Agent` model but doesn't use it
- Agent management is handled separately in AgentService
- No integration between realm operations and active agents
- Agent assignment to realms is static, not dynamic

## Proposed Enhancement

### Core Features

1. **Dynamic Agent Registration**
   - Agents automatically register with their assigned realm on startup
   - Agent deregistration on shutdown or failure
   - Cross-realm agent migration support

2. **Real-time Agent Tracking**
   - Live agent status monitoring within realms
   - Agent health checks and heartbeat monitoring
   - Automatic cleanup of disconnected agents

3. **Capability Aggregation**
   - Realm-level view of all available agent capabilities
   - Tool and skill inventory across agents in realm
   - Dynamic capability discovery and updates

4. **Resource Management**
   - Load balancing and agent utilization tracking
   - Resource allocation across agents in realm
   - Performance metrics aggregation

5. **Agent Discovery Services**
   - Find agents by capability within realm
   - Agent recommendation for specific tasks
   - Optimal agent selection algorithms

## Technical Design

### RealmService Enhancements

```typescript
// New methods to add to RealmService
class RealmService {
  // Agent Registration Management
  async registerAgent(realmId: RealmId, agentId: AgentId): Promise<void>
  async deregisterAgent(realmId: RealmId, agentId: AgentId): Promise<void>
  async migrateAgent(fromRealmId: RealmId, toRealmId: RealmId, agentId: AgentId): Promise<void>
  
  // Agent Discovery and Querying  
  async getActiveAgents(realmId: RealmId): Promise<Agent[]>
  async findAgentsByCapability(realmId: RealmId, capabilities: string[]): Promise<Agent[]>
  async getRealmCapabilities(realmId: RealmId): Promise<string[]>
  async recommendAgent(realmId: RealmId, taskRequirements: TaskRequirements): Promise<Agent | null>
  
  // Agent Health and Monitoring
  async checkAgentHealth(realmId: RealmId): Promise<AgentHealthStatus[]>
  async getAgentUtilization(realmId: RealmId): Promise<AgentUtilizationMetrics>
  async balanceLoad(realmId: RealmId): Promise<LoadBalancingResult>
  
  // Bulk Agent Operations
  async broadcastToAgents(realmId: RealmId, message: any): Promise<BroadcastResult>
  async coordinateAgents(realmId: RealmId, scenario: CoordinationScenario): Promise<CoordinationResult>
}
```

### New Data Structures

```typescript
interface AgentHealthStatus {
  agentId: AgentId;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disconnected';
  lastHeartbeat: Timestamp;
  responseTime: number;
  errorRate: number;
}

interface AgentUtilizationMetrics {
  realmId: RealmId;
  agentMetrics: {
    agentId: AgentId;
    cpuUtilization: number;
    memoryUtilization: number;
    activeJobs: number;
    queuedJobs: number;
    throughput: number;
  }[];
  overallUtilization: number;
  bottlenecks: string[];
}

interface TaskRequirements {
  requiredCapabilities: string[];
  preferredAgentType?: AgentType;
  resourceRequirements?: {
    memoryMB: number;
    cpuCores: number;
  };
  constraints?: {
    excludeAgents?: AgentId[];
    maxResponseTime?: number;
  };
}
```

### Integration Points

1. **AgentService Integration**
   - Agent lifecycle events trigger realm registration/deregistration
   - Agent status changes update realm tracking
   - Shared agent state management

2. **ScenarioService Integration**
   - Use realm agent discovery for task assignment
   - Leverage realm capability aggregation for optimization
   - Coordinate agents through realm management

3. **PolicyEngine Integration**
   - Agent access control within realms
   - Cross-realm agent migration policies
   - Resource allocation policies

## Implementation Plan

### Phase 1: Basic Agent Registration (1-2 days)
- Implement `registerAgent()` and `deregisterAgent()` methods
- Update AgentService to call realm registration on agent lifecycle events
- Add agent tracking to realm state management
- Remove unused Agent import and replace with active usage

### Phase 2: Agent Discovery (1-2 days)  
- Implement `getActiveAgents()` and capability querying methods
- Add real-time capability aggregation
- Update realm statistics to reflect actual agent data

### Phase 3: Health Monitoring (2-3 days)
- Implement agent health checking and heartbeat monitoring
- Add automatic cleanup of disconnected agents
- Create agent utilization tracking and metrics

### Phase 4: Advanced Features (2-3 days)
- Implement agent recommendation algorithms
- Add load balancing and coordination features
- Create cross-realm agent migration capabilities

### Phase 5: Integration Testing (1-2 days)
- Update all service integration tests
- Add realm-agent integration scenarios
- Performance testing for agent operations at scale

## Testing Strategy

### Contract Tests
- New RealmService methods should have comprehensive contract tests
- Agent registration/deregistration workflows
- Discovery and capability querying accuracy

### Integration Tests  
- End-to-end agent lifecycle within realms
- Cross-service integration with AgentService and ScenarioService
- Performance tests for large numbers of agents per realm

### Unit Tests
- Agent state management within realms
- Capability aggregation algorithms
- Health monitoring and cleanup logic

## Benefits

1. **Improved Resource Management**: Better visibility and control over agent resources
2. **Enhanced Task Assignment**: Intelligent agent selection based on real-time capabilities
3. **Better Monitoring**: Comprehensive agent health and performance tracking
4. **Scalability**: Efficient agent discovery and load balancing
5. **Reliability**: Automatic cleanup and failure detection

## Migration Strategy

1. **Backward Compatibility**: Existing realm operations continue to work
2. **Gradual Rollout**: Agent registration can be enabled incrementally
3. **Data Migration**: Populate existing realm agent lists from current agent assignments
4. **Monitoring**: Track integration success and performance impact

## Risk Assessment

- **Low Risk**: Builds on existing data model foundation
- **Moderate Complexity**: Requires coordination between multiple services
- **Performance Impact**: Minimal - mostly enhances existing tracking
- **Breaking Changes**: None - purely additive enhancements

## Acceptance Criteria

1. ✅ RealmService actively tracks all agents within each realm
2. ✅ Agents automatically register/deregister with realms on lifecycle events  
3. ✅ Real-time agent discovery and capability querying works correctly
4. ✅ Agent health monitoring detects and cleans up disconnected agents
5. ✅ Integration with AgentService and ScenarioService is seamless
6. ✅ Performance metrics show no degradation in existing operations
7. ✅ All contract and integration tests pass

---

**Next Steps**: 
1. Review and approve this enhancement specification
2. Create implementation tasks for each phase
3. Begin Phase 1 implementation with basic agent registration
