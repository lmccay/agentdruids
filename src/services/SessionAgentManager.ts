import { AgentSessionState, SessionAgentManager } from '../models/SessionAgentState';
import { isRealmSentinel, REALM_SENTINEL_SLUG } from '../utils/uuidUtils';
import { AgentTask } from '../models/TaskQueueState';
import { TaskQueueManagerImpl } from './TaskQueueManager';

/**
 * Manages session-scoped agent state with task queue integration
 * Each coordination session gets its own isolated view of agent states
 * and integrates with task queue for proper concurrency control
 */
/**
 * Where an agent starts a session.
 *
 * Uses the same precedence as AgentService.resolveCurrentRealm — currentRealmId,
 * then boundRealmId, then the sentinel.
 *
 * The order matters and was previously reversed here (boundRealmId first) while
 * a comment claimed it matched. The consequence was not cosmetic: an agent that
 * had explicitly left its realm — currentRealmId set to the sentinel with
 * boundRealmId still set — was placed back inside its bound realm for the whole
 * session. And because resolveCurrentRealm consults session state *first*, that
 * session value then won over the agent's own record, silently relocating it.
 * Migration 021 guards the same mistake at the database level.
 *
 * So an elemental with no travel history starts in its bound realm, an agent
 * that has left starts in none, and a druid with neither is global-only until it
 * travels.
 *
 * 'default' is the sentinel for "no realm / global-only", never a realm id. It
 * is canonicalised to lower case so downstream comparisons that test the literal
 * rather than calling isRealmSentinel still behave.
 */
export function resolveInitialSessionRealm(
  ra: { currentRealmId?: string; boundRealmId?: string } | undefined | null
): string {
  const resolved = ra?.currentRealmId || ra?.boundRealmId || REALM_SENTINEL_SLUG;
  return isRealmSentinel(resolved) ? REALM_SENTINEL_SLUG : resolved;
}

export class SessionAgentManagerImpl implements SessionAgentManager {
  sessionId: string;
  agentStates: Map<string, AgentSessionState> = new Map();
  private taskQueueManager: TaskQueueManagerImpl;

  constructor(sessionId: string, taskQueueManager?: TaskQueueManagerImpl) {
    this.sessionId = sessionId;
    this.taskQueueManager = taskQueueManager || new TaskQueueManagerImpl({
      defaultMaxConcurrentTasks: 2, // Conservative per-agent limit for coordination sessions
      maxQueueSize: 10,
      taskTimeoutMs: 45000, // 45 seconds for coordination tasks
      enableRebalancing: false // Disable for session isolation
    });
  }

  getAgentSessionState(agentId: string): AgentSessionState | null {
    return this.agentStates.get(agentId) || null;
  }

  createAgentSessionState(agentId: string, baseAgent: any): AgentSessionState {
    const ra = baseAgent.realmAccess;

    const initialRealm = resolveInitialSessionRealm(ra);

    // Realms this agent may reach in-session: bound realm ∪ accessibleRealms.
    // accessibleRealms entries may be plain id strings or { realmId } objects.
    const accessible = new Set<string>();
    if (ra?.boundRealmId) accessible.add(ra.boundRealmId);
    for (const entry of ra?.accessibleRealms ?? []) {
      const id = typeof entry === 'string' ? entry : entry?.realmId;
      if (id) accessible.add(id);
    }

    const sessionState: AgentSessionState = {
      agentId,
      sessionId: this.sessionId,
      currentRealm: initialRealm,
      sessionRealmAccess: Array.from(accessible),
      sessionTasks: [],
      isActive: true,
      activeTasks: 0,
      maxConcurrentTasks: baseAgent.maxConcurrentTasks || 2,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      sessionMetrics: {
        tasksCompleted: 0,
        averageResponseTime: 0,
        errorCount: 0,
        realmsVisited: isRealmSentinel(initialRealm) ? [] : [initialRealm]
      }
    };

    this.agentStates.set(agentId, sessionState);
    
    // Initialize task queue for this agent
    this.taskQueueManager.initializeAgentQueue(agentId, sessionState.maxConcurrentTasks);
    
    return sessionState;
  }

  updateAgentRealmState(agentId: string, currentRealmId: string, _previousRealmId?: string): void {
    const state = this.agentStates.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found in session ${this.sessionId}`);
    }

    // Update current realm
    const previousRealm = state.currentRealm;
    state.currentRealm = currentRealmId;
    
    // Add to realm access list if not already present
    if (!state.sessionRealmAccess.includes(currentRealmId)) {
      state.sessionRealmAccess.push(currentRealmId);
    }

    // Track realm visits
    if (!state.sessionMetrics.realmsVisited.includes(currentRealmId)) {
      state.sessionMetrics.realmsVisited.push(currentRealmId);
    }

    state.lastActivityAt = new Date();
    
    console.log(`🌍 Agent ${agentId} traveled from ${previousRealm} to ${currentRealmId} in session ${this.sessionId}`);
  }

  canAcceptTask(agentId: string): boolean {
    const state = this.agentStates.get(agentId);
    if (!state || !state.isActive) {
      return false;
    }

    return state.activeTasks < state.maxConcurrentTasks;
  }

  assignTask(agentId: string, task: AgentTask, delegatedFrom?: string): boolean {
    const state = this.agentStates.get(agentId);
    if (!state || !state.isActive) {
      return false;
    }

    if (!this.canAcceptTask(agentId)) {
      console.log(`❌ Agent ${agentId} cannot accept task - at capacity`);
      return false;
    }

    // Submit task to queue
    try {
      this.taskQueueManager.submitTask(agentId, {
        sessionId: this.sessionId,
        taskType: task.taskType,
        priority: task.priority,
        prompt: task.prompt,
        context: task.context || {},
        ...(task.estimatedDuration && { estimatedDuration: task.estimatedDuration })
      });
      
      state.sessionTasks.push(task);
      state.activeTasks++;
      state.lastActivityAt = new Date();

      console.log(`✅ Assigned task ${task.taskId} to agent ${agentId} (${state.activeTasks}/${state.maxConcurrentTasks})`);
      if (delegatedFrom) {
        console.log(`   Delegated from: ${delegatedFrom}`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to assign task to ${agentId}:`, error);
      return false;
    }
  }

  completeTask(agentId: string, taskId: string, content?: string): void {
    const state = this.agentStates.get(agentId);
    if (!state) {
      console.warn(`❌ No session state found for agent ${agentId}`);
      return;
    }

    // Find and update the task
    const task = state.sessionTasks.find(t => t.taskId === taskId);
    if (!task) {
      console.warn(`❌ Task ${taskId} not found for agent ${agentId}`);
      return;
    }

    task.status = 'completed';
    task.completedAt = new Date();
    if (content) {
      task.context = { ...task.context, result: content };
    }

    state.activeTasks = Math.max(0, state.activeTasks - 1);
    state.lastActivityAt = new Date();

    console.log(`🎉 Completed task ${taskId} for agent ${agentId} (${state.activeTasks}/${state.maxConcurrentTasks})`);
  }

  getSessionLoad(): number {
    if (this.agentStates.size === 0) return 0.0;
    
    let totalLoad = 0;
    for (const state of this.agentStates.values()) {
      const agentLoad = state.activeTasks / state.maxConcurrentTasks;
      totalLoad += agentLoad;
    }
    
    return totalLoad / this.agentStates.size;
  }

  getAgentLoad(agentId: string): number {
    const state = this.agentStates.get(agentId);
    if (!state) return 0.0;
    
    return state.activeTasks / state.maxConcurrentTasks;
  }

  joinSession(agentId: string, baseAgent: any): void {
    if (this.agentStates.has(agentId)) {
      console.log(`⚠️ Agent ${agentId} already in session ${this.sessionId}`);
      return;
    }

    this.createAgentSessionState(agentId, baseAgent);
  }

  leaveSession(agentId: string): void {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.isActive = false;
      console.log(`👋 Agent ${agentId} left session ${this.sessionId}`);
    }
  }

  cleanup(): void {
    console.log(`🧹 Cleaning up session ${this.sessionId} with ${this.agentStates.size} agents`);
    this.agentStates.clear();
  }

  // Utility methods for debugging and monitoring
  getSessionStats() {
    const totalAgents = this.agentStates.size;
    const activeAgents = Array.from(this.agentStates.values()).filter(s => s.isActive).length;
    const totalTasks = Array.from(this.agentStates.values()).reduce((sum, s) => sum + s.sessionTasks.length, 0);
    const activeTasks = Array.from(this.agentStates.values()).reduce((sum, s) => sum + s.activeTasks, 0);

    return {
      sessionId: this.sessionId,
      totalAgents,
      activeAgents,
      totalTasks,
      activeTasks
    };
  }
}