# Implementation Tasks: Realm-Agent Integration

**Enhancement**: 002-realm-agent-integration  
**Target**: RealmService and AgentService integration  

## Task Breakdown

### Phase 1: Basic Agent Registration (Priority: High)
- [ ] **T101** Remove unused Agent import from RealmService and implement actual agent tracking
- [ ] **T102** Add `registerAgent(realmId, agentId)` method to RealmService
- [ ] **T103** Add `deregisterAgent(realmId, agentId)` method to RealmService  
- [ ] **T104** Update AgentService to call realm registration on agent creation
- [ ] **T105** Update AgentService to call realm deregistration on agent deletion
- [ ] **T106** Update realm usage statistics to reflect actual agent counts

### Phase 2: Agent Discovery (Priority: High)
- [ ] **T107** Implement `getActiveAgents(realmId)` method
- [ ] **T108** Implement `findAgentsByCapability(realmId, capabilities)` method
- [ ] **T109** Implement `getRealmCapabilities(realmId)` method  
- [ ] **T110** Add real-time capability aggregation across realm agents
- [ ] **T111** Update realm summary to include actual agent capabilities

### Phase 3: Health Monitoring (Priority: Medium)
- [ ] **T112** Implement `checkAgentHealth(realmId)` method with heartbeat checking
- [ ] **T113** Add automatic cleanup of disconnected agents
- [ ] **T114** Implement `getAgentUtilization(realmId)` method
- [ ] **T115** Add agent performance metrics aggregation at realm level

### Phase 4: Advanced Features (Priority: Medium)  
- [ ] **T116** Implement `recommendAgent(realmId, taskRequirements)` with selection algorithms
- [ ] **T117** Add `balanceLoad(realmId)` method for resource optimization
- [ ] **T118** Implement `migrateAgent(fromRealmId, toRealmId, agentId)` for cross-realm moves
- [ ] **T119** Add `broadcastToAgents(realmId, message)` for realm-wide communication

### Phase 5: Integration & Testing (Priority: High)
- [ ] **T120** Create contract tests for all new RealmService agent methods
- [ ] **T121** Create integration tests for AgentService-RealmService coordination
- [ ] **T122** Update ScenarioService to use realm agent discovery for task assignment
- [ ] **T123** Performance testing for agent operations at scale
- [ ] **T124** Update API endpoints to expose new realm agent capabilities

## Dependencies
- All Phase 1 tasks must complete before Phase 2
- Phase 2 must complete before Phase 3 and 4 can begin
- Phase 5 runs in parallel with other phases for continuous testing

## Quick Start: Remove Unused Import (T101)

The immediate action is to fix the unused `Agent` import in RealmService and start implementing basic agent tracking. This is a small change that sets up the foundation for the larger enhancement.

```typescript
// Current (unused import):
import { Agent } from '../models/Agent.js';

// Solution: Remove import and add agent tracking field
// Then implement registerAgent() method that actually uses agents
```

## Estimated Timeline
- **Phase 1**: 1-2 days
- **Phase 2**: 1-2 days  
- **Phase 3**: 2-3 days
- **Phase 4**: 2-3 days
- **Phase 5**: 1-2 days (ongoing)

**Total**: 7-12 days for complete implementation

## Integration Points
- **AgentService**: Add realm registration calls to agent lifecycle methods
- **ScenarioService**: Update task assignment to use realm agent discovery
- **PolicyEngine**: Ensure agent-realm operations respect access controls
- **API Layer**: Expose new agent discovery endpoints through realm API
