# Concurrent Session Architecture Constitution

**CRITICAL**: This document establishes immutable architectural principles for the Druids multi-agent system's concurrent session support. These principles MUST NOT be violated in any future changes.

## 🛡️ **CONSTITUTIONAL PRINCIPLES**

### **1. SESSION ISOLATION MANDATE**
- **PRINCIPLE**: Every coordination session MUST operate in complete isolation from all other sessions
- **ENFORCEMENT**: No shared mutable state between sessions is permitted
- **VIOLATION**: Any code that allows one session to affect another session's state is FORBIDDEN

### **2. STATELESS SERVICE REQUIREMENT** 
- **PRINCIPLE**: All service classes MUST be designed for concurrent access without session-specific state
- **ENFORCEMENT**: Session-specific data MUST only exist in session-scoped managers
- **VIOLATION**: Storing session data in service instance variables is FORBIDDEN

### **3. SESSION-SCOPED MANAGER HIERARCHY**
- **PRINCIPLE**: The three-layer session isolation architecture is MANDATORY:
  1. **SessionAgentManager**: Agent state isolation
  2. **TaskQueueManager**: Task and concurrency management  
  3. **SessionContentManager**: Content storage isolation
- **ENFORCEMENT**: These managers MUST be used for ALL session-specific operations
- **VIOLATION**: Bypassing session managers for direct state access is FORBIDDEN

### **4. IMMUTABLE SESSION LIFECYCLE**
- **PRINCIPLE**: Session creation, tracking, and cleanup MUST follow the established pattern:
  1. Concurrency limit check → Session creation → Manager initialization → Execution → Cleanup
- **ENFORCEMENT**: CoordinatorConcurrencyManager MUST track ALL active sessions
- **VIOLATION**: Creating coordination sessions without concurrency tracking is FORBIDDEN

## 🚨 **FORBIDDEN PATTERNS**

### **❌ NEVER DO THESE:**

1. **Global Agent State Storage**
   ```typescript
   // FORBIDDEN - shared agent state
   class AgentService {
     private agentStates: Map<string, AgentState> = new Map(); // ❌ WRONG
   }
   ```

2. **Session Data in Service Classes**
   ```typescript
   // FORBIDDEN - session-specific data in service
   class CoordinationService {
     private currentSession: CoordinationSession; // ❌ WRONG
   }
   ```

3. **Direct WorldTree Content Access**
   ```typescript
   // FORBIDDEN - bypassing session content manager
   await fs.writeFile('./data/published_content/file.json', content); // ❌ WRONG
   ```

4. **Untracked Session Creation**
   ```typescript
   // FORBIDDEN - sessions without concurrency tracking
   const session = { id: uuidv4(), ... }; // ❌ WRONG - missing concurrency manager
   ```

## ✅ **REQUIRED PATTERNS**

### **✅ ALWAYS DO THESE:**

1. **Session-Scoped State Management**
   ```typescript
   // CORRECT - session-isolated state
   const sessionAgentManager = new SessionAgentManagerImpl(sessionId);
   const sessionContentManager = new SessionContentManagerImpl(config);
   ```

2. **Concurrency-Aware Session Creation**
   ```typescript
   // CORRECT - with concurrency enforcement
   if (!this.coordinatorConcurrencyManager.canStartSession(coordinatorId)) {
     throw new Error('Coordinator at maximum concurrent sessions');
   }
   this.coordinatorConcurrencyManager.startSession(sessionId, coordinatorId, ...);
   ```

3. **Session Activity Tracking**
   ```typescript
   // CORRECT - session activity updates
   this.coordinatorConcurrencyManager.updateSessionActivity(sessionId);
   ```

4. **Proper Session Cleanup**
   ```typescript
   // CORRECT - complete cleanup
   this.coordinatorConcurrencyManager.endSession(sessionId, status);
   session.sessionAgentManager.cleanup();
   session.sessionContentManager.shutdown();
   ```

## 🔒 **ARCHITECTURAL LOCKS**

### **Core Files Protected from Regression:**
- `src/models/SessionAgentState.ts` - Agent isolation interfaces
- `src/models/TaskQueueState.ts` - Task queue management interfaces  
- `src/models/SessionContentState.ts` - Content isolation interfaces
- `src/models/CoordinatorSessionState.ts` - Coordinator concurrency interfaces
- `src/services/SessionAgentManager.ts` - Agent state implementation
- `src/services/TaskQueueManager.ts` - Task queue implementation
- `src/services/SessionContentManager.ts` - Content storage implementation
- `src/services/CoordinatorConcurrencyManager.ts` - Concurrency tracking implementation

### **Integration Points Protected:**
- `CoordinationService.startOrchestatedCoordination()` - Session creation with all managers
- `CoordinationService.executeOrchestrationPlan()` - Activity tracking during execution
- Session cleanup in success/failure paths

## 🎯 **TESTING REQUIREMENTS**

### **Mandatory Concurrency Tests:**
1. **Session Isolation**: Multiple sessions MUST NOT interfere with each other
2. **Agent State Isolation**: Same agent in different sessions MUST have independent state
3. **Content Storage Isolation**: Session content MUST be stored in session-specific directories
4. **Concurrency Limits**: System MUST enforce coordinator session limits
5. **Resource Cleanup**: Sessions MUST clean up all resources on completion/failure

### **Regression Prevention:**
- All changes to coordination system MUST pass concurrent session tests
- Any modification to state management MUST verify session isolation
- Performance tests MUST validate concurrent session scalability

## 🔥 **EMERGENCY PROTOCOLS**

### **If Session Isolation is Compromised:**
1. **IMMEDIATE**: Revert changes that caused the regression
2. **ASSESS**: Run full concurrent session test suite
3. **VERIFY**: Manual testing of multiple simultaneous sessions
4. **DOCUMENT**: Root cause analysis and prevention measures

### **Code Review Requirements:**
- All PRs touching coordination code MUST be reviewed for session isolation
- Changes to any session manager MUST include concurrency tests
- Service class modifications MUST verify stateless design

---

## ⚖️ **CONSTITUTIONAL AUTHORITY**

This constitution has supreme authority over all future development decisions regarding:
- Session management architecture
- Agent state handling  
- Content storage patterns
- Concurrency control mechanisms

**NO EXCEPTIONS** - These principles are non-negotiable for system integrity.

---

*Established: November 5, 2025*  
*Status: **ACTIVE & BINDING***  
*Authority: **ARCHITECTURAL FOUNDATION***