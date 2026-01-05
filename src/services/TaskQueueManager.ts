/**
 * Task Queue Manager Implementation
 * 
 * Manages agent task queues and concurrency limits to prevent
 * agents from being overloaded by multiple concurrent sessions.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentTask,
  AgentQueueState,
  TaskQueueManager,
  QueueConfiguration
} from '../models/TaskQueueState';

export class TaskQueueManagerImpl implements TaskQueueManager {
  private agentQueues: Map<string, AgentQueueState> = new Map();
  private config: QueueConfiguration;
  private maintenanceInterval: NodeJS.Timeout | null = null;
  private systemStats = {
    totalActiveTasks: 0,
    totalQueuedTasks: 0,
    lastMaintenanceAt: new Date()
  };

  constructor(config?: Partial<QueueConfiguration>) {
    this.config = {
      defaultMaxConcurrentTasks: 3,
      maxQueueSize: 50,
      taskTimeoutMs: 30000, // 30 seconds
      completedTaskRetentionMs: 300000, // 5 minutes
      maintenanceIntervalMs: 60000, // 1 minute
      enableRebalancing: true,
      maxSystemConcurrentTasks: 100,
      ...config
    };

    // Start maintenance interval
    this.startMaintenance();
  }

  async initializeAgentQueue(agentId: string, maxConcurrentTasks?: number): Promise<void> {
    const queueState: AgentQueueState = {
      agentId,
      maxConcurrentTasks: maxConcurrentTasks || this.config.defaultMaxConcurrentTasks,
      activeTasks: new Map(),
      pendingTasks: [],
      completedTasks: [],
      currentLoad: 0.0,
      lastActivityAt: new Date(),
      stats: {
        totalTasksProcessed: 0,
        averageExecutionTime: 0,
        currentWaitTime: 0,
        rejectedTasks: 0
      }
    };

    this.agentQueues.set(agentId, queueState);
  }

  async submitTask(agentId: string, taskData: Omit<AgentTask, 'taskId' | 'createdAt' | 'status'>): Promise<string> {
    const queue = this.agentQueues.get(agentId);
    if (!queue) {
      throw new Error(`Agent queue not initialized for agent: ${agentId}`);
    }

    // Check system-wide limits
    if (this.systemStats.totalActiveTasks >= this.config.maxSystemConcurrentTasks) {
      queue.stats.rejectedTasks++;
      throw new Error('System at maximum capacity');
    }

    // Check queue size limits
    if (queue.pendingTasks.length >= this.config.maxQueueSize) {
      queue.stats.rejectedTasks++;
      throw new Error(`Agent queue at maximum capacity: ${agentId}`);
    }

    const task: AgentTask = {
      taskId: uuidv4(),
      createdAt: new Date(),
      status: 'pending',
      ...taskData
    };

    // Insert task in priority order
    this.insertTaskByPriority(queue.pendingTasks, task);
    
    // Update metrics
    queue.lastActivityAt = new Date();
    this.updateQueueMetrics(queue);
    this.systemStats.totalQueuedTasks++;

    return task.taskId;
  }

  async getNextTask(agentId: string): Promise<AgentTask | null> {
    const queue = this.agentQueues.get(agentId);
    if (!queue) {
      return null;
    }

    // Check if agent can accept more tasks
    if (queue.activeTasks.size >= queue.maxConcurrentTasks) {
      return null;
    }

    // Get highest priority pending task
    const task = queue.pendingTasks.shift();
    if (!task) {
      return null;
    }

    // Mark as assigned
    task.status = 'assigned';
    task.assignedAt = new Date();
    queue.activeTasks.set(task.taskId, task);

    // Update metrics
    queue.lastActivityAt = new Date();
    this.updateQueueMetrics(queue);
    this.systemStats.totalActiveTasks++;
    this.systemStats.totalQueuedTasks--;

    return task;
  }

  async startTask(agentId: string, taskId: string): Promise<void> {
    const queue = this.agentQueues.get(agentId);
    const task = queue?.activeTasks.get(taskId);
    
    if (!queue || !task) {
      throw new Error(`Task not found: ${taskId} for agent: ${agentId}`);
    }

    task.status = 'executing';
    task.assignedAt = new Date();
    queue.lastActivityAt = new Date();
    this.updateQueueMetrics(queue);
  }

  async completeTask(agentId: string, taskId: string, _result?: any, error?: string): Promise<void> {
    const queue = this.agentQueues.get(agentId);
    const task = queue?.activeTasks.get(taskId);
    
    if (!queue || !task) {
      throw new Error(`Task not found: ${taskId} for agent: ${agentId}`);
    }

    // Calculate execution time
    const executionStart = task.assignedAt || task.createdAt;
    const executionTime = Date.now() - executionStart.getTime();
    task.actualDuration = executionTime;
    task.completedAt = new Date();
    task.status = error ? 'failed' : 'completed';

    // Move from active to completed
    queue.activeTasks.delete(taskId);
    queue.completedTasks.push(task);

    // Update stats
    queue.stats.totalTasksProcessed++;
    this.updateAverageExecutionTime(queue, executionTime);
    queue.lastActivityAt = new Date();
    this.updateQueueMetrics(queue);
    this.systemStats.totalActiveTasks--;

    // Trigger task rebalancing if enabled
    if (this.config.enableRebalancing) {
      setImmediate(() => this.rebalanceTasks());
    }
  }

  async canAcceptTask(agentId: string): Promise<boolean> {
    const queue = this.agentQueues.get(agentId);
    if (!queue) {
      return false;
    }

    return queue.activeTasks.size < queue.maxConcurrentTasks && 
           queue.pendingTasks.length < this.config.maxQueueSize &&
           this.systemStats.totalActiveTasks < this.config.maxSystemConcurrentTasks;
  }

  async getQueueState(agentId: string): Promise<AgentQueueState | null> {
    const queue = this.agentQueues.get(agentId);
    if (!queue) {
      return null;
    }

    // Return a deep copy to prevent external mutations
    return {
      ...queue,
      activeTasks: new Map(queue.activeTasks),
      pendingTasks: [...queue.pendingTasks],
      completedTasks: [...queue.completedTasks],
      stats: { ...queue.stats }
    };
  }

  async getSystemLoad(): Promise<number> {
    const totalAgents = this.agentQueues.size;
    if (totalAgents === 0) {
      return 0.0;
    }

    let totalLoad = 0;
    for (const queue of this.agentQueues.values()) {
      totalLoad += queue.currentLoad;
    }

    return totalLoad / totalAgents;
  }

  async cancelSessionTasks(sessionId: string): Promise<void> {
    for (const queue of this.agentQueues.values()) {
      // Cancel pending tasks
      queue.pendingTasks = queue.pendingTasks.filter(task => {
        if (task.sessionId === sessionId) {
          this.systemStats.totalQueuedTasks--;
          return false;
        }
        return true;
      });

      // Cancel active tasks
      for (const [taskId, task] of queue.activeTasks.entries()) {
        if (task.sessionId === sessionId) {
          task.status = 'failed';
          task.completedAt = new Date();
          queue.activeTasks.delete(taskId);
          queue.completedTasks.push(task);
          this.systemStats.totalActiveTasks--;
        }
      }

      this.updateQueueMetrics(queue);
    }
  }

  async performMaintenance(): Promise<void> {
    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - this.config.completedTaskRetentionMs);

    for (const queue of this.agentQueues.values()) {
      // Clean up old completed tasks
      queue.completedTasks = queue.completedTasks.filter(task => 
        (task.completedAt || task.createdAt) > retentionCutoff
      );

      // Check for timed out active tasks
      for (const [taskId, task] of queue.activeTasks.entries()) {
        const taskAge = now.getTime() - (task.assignedAt || task.createdAt).getTime();
        if (taskAge > this.config.taskTimeoutMs) {
          await this.completeTask(queue.agentId, taskId, undefined, 'Task timeout');
        }
      }

      this.updateQueueMetrics(queue);
    }

    this.systemStats.lastMaintenanceAt = now;
  }

  async getEstimatedWaitTime(agentId: string, priority: number): Promise<number> {
    const queue = this.agentQueues.get(agentId);
    if (!queue) {
      return 0;
    }

    // Count higher priority tasks ahead in queue
    const higherPriorityTasks = queue.pendingTasks.filter(task => task.priority > priority).length;
    
    // Estimate based on average execution time and queue position
    const avgExecutionTime = queue.stats.averageExecutionTime || 5000; // Default 5s
    const tasksInProgress = queue.activeTasks.size;
    const availableSlots = Math.max(0, queue.maxConcurrentTasks - tasksInProgress);
    
    if (availableSlots > higherPriorityTasks) {
      return 0; // Can start immediately
    }

    const queuePosition = higherPriorityTasks - availableSlots + 1;
    return queuePosition * avgExecutionTime;
  }

  async rebalanceTasks(): Promise<void> {
    if (!this.config.enableRebalancing) {
      return;
    }

    // Find overloaded and underloaded agents
    const agents = Array.from(this.agentQueues.entries());
    const overloaded = agents.filter(([_, queue]) => queue.currentLoad > 0.8);
    const underloaded = agents.filter(([_, queue]) => queue.currentLoad < 0.3);

    // Simple rebalancing: move low-priority pending tasks from overloaded to underloaded
    for (const [, overloadedQueue] of overloaded) {
      for (const [, underloadedQueue] of underloaded) {
        if (overloadedQueue.pendingTasks.length > 0 && 
            underloadedQueue.pendingTasks.length < this.config.maxQueueSize / 2) {
          
          // Move lowest priority task
          const taskToMove = overloadedQueue.pendingTasks.pop();
          if (taskToMove) {
            underloadedQueue.pendingTasks.push(taskToMove);
            this.insertTaskByPriority(underloadedQueue.pendingTasks, taskToMove);
            
            this.updateQueueMetrics(overloadedQueue);
            this.updateQueueMetrics(underloadedQueue);
            break;
          }
        }
      }
    }
  }

  private insertTaskByPriority(queue: AgentTask[], task: AgentTask): void {
    // Remove the task if it was already added (for rebalancing)
    const existingIndex = queue.findIndex(t => t.taskId === task.taskId);
    if (existingIndex >= 0) {
      queue.splice(existingIndex, 1);
    }

    // Insert in priority order (highest priority first)
    let insertIndex = 0;
    while (insertIndex < queue.length && (queue[insertIndex]?.priority ?? 0) >= task.priority) {
      insertIndex++;
    }
    queue.splice(insertIndex, 0, task);
  }

  private updateQueueMetrics(queue: AgentQueueState): void {
    const totalTasks = queue.activeTasks.size + queue.pendingTasks.length;
    const maxTasks = queue.maxConcurrentTasks + this.config.maxQueueSize;
    queue.currentLoad = totalTasks / maxTasks;

    // Update current wait time estimate
    if (queue.pendingTasks.length > 0) {
      const avgExecutionTime = queue.stats.averageExecutionTime || 5000;
      const availableSlots = Math.max(0, queue.maxConcurrentTasks - queue.activeTasks.size);
      queue.stats.currentWaitTime = availableSlots === 0 ? avgExecutionTime : 0;
    } else {
      queue.stats.currentWaitTime = 0;
    }
  }

  private updateAverageExecutionTime(queue: AgentQueueState, newExecutionTime: number): void {
    const currentAvg = queue.stats.averageExecutionTime;
    const totalProcessed = queue.stats.totalTasksProcessed;
    
    if (totalProcessed === 1) {
      queue.stats.averageExecutionTime = newExecutionTime;
    } else {
      // Weighted average with more weight on recent tasks
      const weight = Math.min(0.2, 1.0 / totalProcessed);
      queue.stats.averageExecutionTime = currentAvg * (1 - weight) + newExecutionTime * weight;
    }
  }

  private startMaintenance(): void {
    this.maintenanceInterval = setInterval(() => {
      this.performMaintenance().catch(error => {
        console.error('Task queue maintenance error:', error);
      });
    }, this.config.maintenanceIntervalMs);
  }

  /**
   * Clean shutdown
   */
  shutdown(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
  }
}