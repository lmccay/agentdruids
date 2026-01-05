/**
 * Session-Scoped Agent State Management for Concurrent Session Support
 * 
 * Manages agent state isolation between concurrent coordination sessions
 * to prevent interference and ensure proper task tracking.
 */

import { AgentTask } from './TaskQueueState';

export interface AgentSessionState {
  /** Agent ID this state belongs to */
  agentId: string;
  /** Session ID that owns this state */
  sessionId: string;
  /** Current realm the agent is in for this session */
  currentRealm: string;
  /** Realms this agent has access to in this session */
  sessionRealmAccess: string[];
  /** Tasks currently assigned to this agent in this session */
  sessionTasks: AgentTask[];
  /** Session-specific agent configuration overrides */
  sessionConfig?: {
    maxConcurrentTasks?: number;
    priority?: number;
    specialPermissions?: string[];
  };
  /** Whether agent is active in this session */
  isActive: boolean;
  /** Current number of active tasks */
  activeTasks: number;
  /** Maximum concurrent tasks for this agent */
  maxConcurrentTasks: number;
  /** When this session state was created */
  createdAt: Date;
  /** Last activity in this session */
  lastActivityAt: Date;
  /** Session-specific metrics */
  sessionMetrics: {
    tasksCompleted: number;
    averageResponseTime: number;
    errorCount: number;
    realmsVisited: string[];
  };
}

export interface SessionAgentManager {
  sessionId: string;
  agentStates: Map<string, AgentSessionState>;
  
  // Agent state management
  getAgentSessionState(agentId: string): AgentSessionState | null;
  createAgentSessionState(agentId: string, baseAgent: any): AgentSessionState;
  updateAgentRealmState(agentId: string, currentRealmId: string, previousRealmId?: string): void;
  
  // Task management with queue integration
  canAcceptTask(agentId: string): boolean;
  assignTask(agentId: string, task: AgentTask, delegatedFrom?: string): boolean;
  completeTask(agentId: string, taskId: string, content?: string): void;
  
  // Queue load management
  getSessionLoad(): number;
  getAgentLoad(agentId: string): number;
  
  // Session lifecycle
  joinSession(agentId: string, baseAgent: any): void;
  leaveSession(agentId: string): void;
  cleanup(): void;
}