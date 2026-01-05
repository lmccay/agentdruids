export interface CoordinatorSessionInfo {
  sessionId: string;
  coordinatorId: string;
  startTime: Date;
  lastActivity: Date;
  status: 'active' | 'completed' | 'failed' | 'timeout';
  participantCount: number;
  scenarioPrompt?: string;
}

export interface CoordinatorConcurrencyState {
  activeSessions: Map<string, CoordinatorSessionInfo>;
  sessionsByCoordinator: Map<string, Set<string>>; // coordinatorId -> sessionIds
  maxConcurrentScenarios: number;
  sessionTimeoutMs: number;
}

export interface CoordinatorConcurrencyManager {
  /**
   * Check if a coordinator can start a new session
   */
  canStartSession(coordinatorId: string): boolean;

  /**
   * Start tracking a new session for a coordinator
   */
  startSession(sessionId: string, coordinatorId: string, participantCount: number, scenarioPrompt?: string): void;

  /**
   * Update session activity timestamp
   */
  updateSessionActivity(sessionId: string): void;

  /**
   * End a session (success, failure, or timeout)
   */
  endSession(sessionId: string, status: 'completed' | 'failed' | 'timeout'): void;

  /**
   * Get active session count for a coordinator
   */
  getActiveSessionCount(coordinatorId: string): number;

  /**
   * Get all active sessions
   */
  getActiveSessions(): CoordinatorSessionInfo[];

  /**
   * Cleanup timed out sessions
   */
  cleanupTimeoutSessions(): void;

  /**
   * Get concurrency metrics
   */
  getMetrics(): {
    totalActiveSessions: number;
    sessionsByCoordinator: { [coordinatorId: string]: number };
    maxConcurrentScenarios: number;
  };
}