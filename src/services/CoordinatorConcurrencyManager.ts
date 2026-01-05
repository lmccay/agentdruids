import { CoordinatorConcurrencyManager, CoordinatorConcurrencyState, CoordinatorSessionInfo } from '../models/CoordinatorSessionState';

export class CoordinatorConcurrencyManagerImpl implements CoordinatorConcurrencyManager {
  private state: CoordinatorConcurrencyState;

  constructor(maxConcurrentScenarios: number = 10, sessionTimeoutMs: number = 30 * 60 * 1000) { // 30 minutes default
    this.state = {
      activeSessions: new Map(),
      sessionsByCoordinator: new Map(),
      maxConcurrentScenarios,
      sessionTimeoutMs
    };

    // Cleanup timeout sessions every 5 minutes
    setInterval(() => {
      this.cleanupTimeoutSessions();
    }, 5 * 60 * 1000);
  }

  canStartSession(coordinatorId: string): boolean {
    this.cleanupTimeoutSessions();
    
    const coordinatorSessions = this.state.sessionsByCoordinator.get(coordinatorId);
    const activeCount = coordinatorSessions ? coordinatorSessions.size : 0;
    
    return activeCount < this.state.maxConcurrentScenarios;
  }

  startSession(sessionId: string, coordinatorId: string, participantCount: number, scenarioPrompt?: string): void {
    const now = new Date();
    
    const sessionInfo: CoordinatorSessionInfo = {
      sessionId,
      coordinatorId,
      startTime: now,
      lastActivity: now,
      status: 'active',
      participantCount,
      ...(scenarioPrompt && { scenarioPrompt })
    };

    // Add to active sessions
    this.state.activeSessions.set(sessionId, sessionInfo);

    // Add to coordinator sessions
    if (!this.state.sessionsByCoordinator.has(coordinatorId)) {
      this.state.sessionsByCoordinator.set(coordinatorId, new Set());
    }
    this.state.sessionsByCoordinator.get(coordinatorId)!.add(sessionId);

    console.log(`🎯 Started session ${sessionId} for coordinator ${coordinatorId} (${participantCount} participants)`);
  }

  updateSessionActivity(sessionId: string): void {
    const session = this.state.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  endSession(sessionId: string, status: 'completed' | 'failed' | 'timeout'): void {
    const session = this.state.activeSessions.get(sessionId);
    if (!session) return;

    // Update status
    session.status = status;

    // Remove from active sessions
    this.state.activeSessions.delete(sessionId);

    // Remove from coordinator sessions
    const coordinatorSessions = this.state.sessionsByCoordinator.get(session.coordinatorId);
    if (coordinatorSessions) {
      coordinatorSessions.delete(sessionId);
      if (coordinatorSessions.size === 0) {
        this.state.sessionsByCoordinator.delete(session.coordinatorId);
      }
    }

    const duration = (new Date().getTime() - session.startTime.getTime()) / 1000;
    console.log(`🏁 Ended session ${sessionId} (${status}) after ${duration.toFixed(1)}s`);
  }

  getActiveSessionCount(coordinatorId: string): number {
    const coordinatorSessions = this.state.sessionsByCoordinator.get(coordinatorId);
    return coordinatorSessions ? coordinatorSessions.size : 0;
  }

  getActiveSessions(): CoordinatorSessionInfo[] {
    return Array.from(this.state.activeSessions.values());
  }

  cleanupTimeoutSessions(): void {
    const now = new Date();
    const timeoutMs = this.state.sessionTimeoutMs;
    
    const timedOutSessions: string[] = [];
    
    for (const [sessionId, session] of this.state.activeSessions) {
      const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
      if (timeSinceActivity > timeoutMs) {
        timedOutSessions.push(sessionId);
      }
    }

    // End timed out sessions
    for (const sessionId of timedOutSessions) {
      this.endSession(sessionId, 'timeout');
    }

    if (timedOutSessions.length > 0) {
      console.log(`🕐 Cleaned up ${timedOutSessions.length} timed out sessions`);
    }
  }

  getMetrics(): {
    totalActiveSessions: number;
    sessionsByCoordinator: { [coordinatorId: string]: number };
    maxConcurrentScenarios: number;
  } {
    const sessionsByCoordinator: { [coordinatorId: string]: number } = {};
    
    for (const [coordinatorId, sessions] of this.state.sessionsByCoordinator) {
      sessionsByCoordinator[coordinatorId] = sessions.size;
    }

    return {
      totalActiveSessions: this.state.activeSessions.size,
      sessionsByCoordinator,
      maxConcurrentScenarios: this.state.maxConcurrentScenarios
    };
  }
}