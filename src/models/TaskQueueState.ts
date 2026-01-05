/**
 * Task Queue State Management for Concurrent Session Support
 * 
 * Manages agent task queues and concurrency limits to prevent
 * agents from being overloaded by multiple concurrent sessions.
 */

export interface AgentTask {
  /** Unique task identifier */
  taskId: string;
  /** ID of the coordination session that owns this task */
  sessionId: string;
  /** Type of task (coordinate, execute, travel, etc.) */
  taskType: 'coordinate' | 'execute' | 'travel' | 'delegate' | 'respond';
  /** Task priority (higher numbers = higher priority) */
  priority: number;
  /** Task creation timestamp */
  createdAt: Date;
  /** Task assignment timestamp */
  assignedAt?: Date;
  /** Task completion timestamp */
  completedAt?: Date;
  /** Current task status */
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed';
  /** Task prompt/description */
  prompt: string;
  /** Additional task context */
  context?: Record<string, any>;
  /** Estimated execution time in milliseconds */
  estimatedDuration?: number;
  /** Actual execution time in milliseconds */
  actualDuration?: number;
}

export interface AgentQueueState {
  /** Agent ID this queue belongs to */
  agentId: string;
  /** Maximum concurrent tasks this agent can handle */
  maxConcurrentTasks: number;
  /** Currently executing tasks */
  activeTasks: Map<string, AgentTask>;
  /** Pending tasks waiting for execution */
  pendingTasks: AgentTask[];
  /** Recently completed tasks (for metrics) */
  completedTasks: AgentTask[];
  /** Current queue load (0.0 - 1.0) */
  currentLoad: number;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Queue statistics */
  stats: {
    totalTasksProcessed: number;
    averageExecutionTime: number;
    currentWaitTime: number;
    rejectedTasks: number;
  };
}

export interface TaskQueueManager {
  /**
   * Initialize task queue for an agent
   */
  initializeAgentQueue(agentId: string, maxConcurrentTasks: number): Promise<void>;

  /**
   * Submit a task to an agent's queue
   */
  submitTask(agentId: string, task: Omit<AgentTask, 'taskId' | 'createdAt' | 'status'>): Promise<string>;

  /**
   * Get next available task for an agent
   */
  getNextTask(agentId: string): Promise<AgentTask | null>;

  /**
   * Mark a task as started
   */
  startTask(agentId: string, taskId: string): Promise<void>;

  /**
   * Mark a task as completed
   */
  completeTask(agentId: string, taskId: string, result?: any, error?: string): Promise<void>;

  /**
   * Check if an agent can accept new tasks
   */
  canAcceptTask(agentId: string): Promise<boolean>;

  /**
   * Get current queue state for an agent
   */
  getQueueState(agentId: string): Promise<AgentQueueState | null>;

  /**
   * Get queue load across all agents
   */
  getSystemLoad(): Promise<number>;

  /**
   * Cancel all tasks for a specific session
   */
  cancelSessionTasks(sessionId: string): Promise<void>;

  /**
   * Clean up completed tasks and update metrics
   */
  performMaintenance(): Promise<void>;

  /**
   * Get estimated wait time for a new task
   */
  getEstimatedWaitTime(agentId: string, priority: number): Promise<number>;

  /**
   * Rebalance tasks across agents if possible
   */
  rebalanceTasks(): Promise<void>;
}

export interface TaskExecutionContext {
  /** Task being executed */
  task: AgentTask;
  /** Agent queue state */
  queueState: AgentQueueState;
  /** Session context */
  sessionId: string;
  /** Start time */
  startTime: Date;
  /** Execution timeout */
  timeoutMs: number;
  /** Cancellation token */
  cancelled: boolean;
}

export interface QueueConfiguration {
  /** Default maximum concurrent tasks per agent */
  defaultMaxConcurrentTasks: number;
  /** Maximum queue size per agent */
  maxQueueSize: number;
  /** Task timeout in milliseconds */
  taskTimeoutMs: number;
  /** How long to keep completed tasks for metrics */
  completedTaskRetentionMs: number;
  /** Queue maintenance interval */
  maintenanceIntervalMs: number;
  /** Enable task rebalancing */
  enableRebalancing: boolean;
  /** Maximum system-wide concurrent tasks */
  maxSystemConcurrentTasks: number;
}