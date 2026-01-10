import { Router, Request, Response } from 'express';
import { ScenarioId, AgentId } from '../models/Types';
import ServiceContainer from '../services/ServiceContainer';

const router = Router();
const serviceContainer = ServiceContainer.getInstance();
const scenarioService = serviceContainer.getScenarioService();

// Execution interfaces
interface Execution {
  executionId: string;
  scenarioId: ScenarioId;
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  participants: {
    agentId: AgentId;
    role: string;
    status: 'active' | 'idle' | 'error' | 'disconnected';
    performance: {
      responseTimes: number[];
      successRate: number;
      errorCount: number;
    };
  }[];
  configuration: {
    executionMode: 'normal' | 'coordinated' | 'benchmark' | 'self-play';
    timeoutMinutes: number;
    monitoring: {
      logLevel: 'debug' | 'info' | 'warn' | 'error';
      metricsCollection: boolean;
      realTimeUpdates: boolean;
    };
    coordination?: {
      leadAgent?: string;
      syncInterval?: number;
      consensusRequired?: boolean;
    };
  };
  metrics: {
    executionTime: number;
    messagesExchanged: number;
    tasksCompleted: number;
    errors: number;
    warnings: number;
  };
  progress?: {
    percentage: number;
    currentPhase: string;
    estimatedTimeRemaining: number;
  };
  logs?: {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    source: string;
  }[];
  error?: {
    code: string;
    message: string;
    timestamp: string;
    affectedAgents: AgentId[];
  };
  results?: any;
  summary?: {
    totalDuration: number;
    successfulTasks: number;
    failedTasks: number;
  };
  benchmarkResults?: {
    averageLatency: number;
    throughput: number;
    accuracy: number;
    iterations: number;
  };
  learningProgress?: {
    currentEpisode: number;
    totalEpisodes: number;
    averageReward: number;
    improvementRate: number;
  };
  estimatedDuration?: number;
}

interface ExecutionConfig {
  executionMode?: 'normal' | 'coordinated' | 'benchmark' | 'self-play';
  timeoutMinutes?: number;
  monitoring?: {
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    metricsCollection?: boolean;
    realTimeUpdates?: boolean;
  };
  coordination?: {
    leadAgent?: string;
    syncInterval?: number;
    consensusRequired?: boolean;
  };
}

// In-memory storage for executions
const executions: Map<string, Execution> = new Map();

// Initialize with default executions
function initializeDefaultExecutions() {
  const now = Date.now().toString();
  const currentTime = Date.now();
  
  const defaultExecution: Execution = {
    executionId: 'test-execution-001',
    scenarioId: 'scenario-demo-001' as ScenarioId,
    status: 'running',
    startedAt: now,
    participants: [
      {
        agentId: 'druid-demo-001' as AgentId,
        role: 'Coordinator',
        status: 'active',
        performance: {
          responseTimes: [120, 95, 180, 110],
          successRate: 0.95,
          errorCount: 1
        }
      },
      {
        agentId: 'elemental-demo-001' as AgentId,
        role: 'Analyst',
        status: 'active',
        performance: {
          responseTimes: [200, 150, 240, 180],
          successRate: 0.92,
          errorCount: 2
        }
      }
    ],
    configuration: {
      executionMode: 'normal',
      timeoutMinutes: 60,
      monitoring: {
        logLevel: 'info',
        metricsCollection: true,
        realTimeUpdates: true
      }
    },
    metrics: {
      executionTime: currentTime - parseInt(now),
      messagesExchanged: 24,
      tasksCompleted: 8,
      errors: 3,
      warnings: 1
    },
    progress: {
      percentage: 65,
      currentPhase: 'Analysis',
      estimatedTimeRemaining: 1200
    },
    logs: [
      {
        timestamp: now,
        level: 'info',
        message: 'Execution started successfully',
        source: 'execution-manager'
      },
      {
        timestamp: (parseInt(now) + 1000).toString(),
        level: 'info',
        message: 'Agent coordination established',
        source: 'druid-demo-001'
      }
    ],
    estimatedDuration: 3600
  };

  const completedExecution: Execution = {
    executionId: 'test-execution-completed',
    scenarioId: 'scenario-demo-001' as ScenarioId,
    status: 'completed',
    startedAt: (parseInt(now) - 7200000).toString(),
    completedAt: (parseInt(now) - 600000).toString(),
    participants: [
      {
        agentId: 'druid-demo-002' as AgentId,
        role: 'Coordinator',
        status: 'idle',
        performance: {
          responseTimes: [100, 85, 120, 95],
          successRate: 1.0,
          errorCount: 0
        }
      }
    ],
    configuration: {
      executionMode: 'normal',
      timeoutMinutes: 120,
      monitoring: {
        logLevel: 'info',
        metricsCollection: true,
        realTimeUpdates: false
      }
    },
    metrics: {
      executionTime: 6600000,
      messagesExchanged: 156,
      tasksCompleted: 45,
      errors: 0,
      warnings: 3
    },
    results: {
      outcome: 'success',
      dataProcessed: 1000000,
      insightsGenerated: 15
    },
    summary: {
      totalDuration: 6600000,
      successfulTasks: 45,
      failedTasks: 0
    }
  };

  executions.set('test-execution-001', defaultExecution);
  executions.set('test-execution-completed', completedExecution);
}

// Initialize default executions
initializeDefaultExecutions();

// Helper function to generate execution ID
function generateExecutionId(): string {
  return `execution-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * GET /executions/:executionId
 * Get execution details by ID
 */
router.get('/:executionId', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const { includeLogs, logLevel } = req.query;

    if (!executionId || typeof executionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Execution ID is required'
      });
      return;
    }

    // Check mock executions first
    let execution = executions.get(executionId);
    
    // If not found in mock executions, check real executions from scenario service
    if (!execution) {
      const realExecutions = await scenarioService.getAllExecutions() || [];
      const realExecution = realExecutions.find(exec => exec.id === executionId);
      if (realExecution) {
        // Convert ScenarioExecution to Execution format for compatibility
        execution = {
          executionId: realExecution.id,
          scenarioId: realExecution.scenarioId,
          status: realExecution.status as any,
          startedAt: realExecution.startTime || '',
          completedAt: realExecution.endTime,
          participants: realExecution.assignedAgents?.map(agent => ({
            agentId: agent.agentId,
            role: agent.role || 'participant',
            status: 'active' as const,
            performance: {
              responseTimes: [],
              successRate: 1.0,
              errorCount: 0
            }
          })) || [],
          configuration: {
            executionMode: 'normal' as const,
            timeoutMinutes: 60,
            monitoring: {
              logLevel: 'info' as const,
              metricsCollection: true,
              realTimeUpdates: true
            }
          },
          metrics: {
            executionTime: 0,
            messagesExchanged: 0,
            tasksCompleted: realExecution.taskResults?.length || 0,
            errors: 0,
            warnings: 0
          },
          progress: realExecution.progress ? {
            percentage: typeof realExecution.progress === 'number' ? realExecution.progress : 100,
            currentPhase: 'Completed'
          } : undefined,
          // Additional fields from ScenarioExecution
          ...(realExecution.results && { results: realExecution.results }),
          ...(realExecution.taskResults && { taskResults: realExecution.taskResults }),
          ...(realExecution.assignedAgents && { assignedAgents: realExecution.assignedAgents }),
          ...(realExecution.tasks && { tasks: realExecution.tasks })
        };
      }
    }

    if (!execution) {
      res.status(404).json({
        error: 'Not found',
        message: `Execution with ID '${executionId}' not found`
      });
      return;
    }

    // Create response object
    const response: any = { ...execution };

    // Include logs if requested
    if (includeLogs === 'true' && execution.logs) {
      let logs = execution.logs;
      
      // Filter by log level if specified
      if (logLevel && typeof logLevel === 'string') {
        const levelPriority: { [key: string]: number } = {
          debug: 0, info: 1, warn: 2, error: 3
        };
        const requestedLevel = levelPriority[logLevel];
        if (requestedLevel !== undefined) {
          logs = logs.filter(log => {
            const logLevelPriority = levelPriority[log.level];
            return logLevelPriority !== undefined && logLevelPriority >= requestedLevel;
          });
        }
      }
      
      response.logs = logs;
    } else {
      // Remove logs if not requested
      delete response.logs;
    }

    res.json(response);
  } catch (error) {
    console.error('Error getting execution:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve execution'
    });
  }
});

/**
 * GET /executions
 * List all executions with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, scenarioId, limit } = req.query;
    
    // Get executions from ScenarioService and mock data
    const mockExecutions = Array.from(executions.values());
    const realExecutions = await scenarioService.getAllExecutions() || [];
    
    console.log(`📊 Executions debug: mock=${mockExecutions.length}, real=${realExecutions.length}`);
    if (realExecutions.length > 0) {
      console.log(`📊 Real execution IDs:`, realExecutions.map(e => e.id));
    }
    
    // Combine both sources for now
    let executionList = [...mockExecutions, ...realExecutions];

    // Filter by status if specified
    if (status && typeof status === 'string') {
      executionList = executionList.filter(execution => execution.status === status);
    }

    // Filter by scenario ID if specified
    if (scenarioId && typeof scenarioId === 'string') {
      executionList = executionList.filter(execution => execution.scenarioId === scenarioId);
    }

    // Limit results if specified
    if (limit && typeof limit === 'string') {
      const limitNumber = parseInt(limit, 10);
      if (!isNaN(limitNumber) && limitNumber > 0) {
        executionList = executionList.slice(0, limitNumber);
      }
    }

    // Sort by startedAt descending (most recent first)
    executionList.sort((a, b) => {
      const aStarted = 'startedAt' in a ? parseInt(a.startedAt as string) : 0;
      const bStarted = 'startedAt' in b ? parseInt(b.startedAt as string) : 0;
      return bStarted - aStarted;
    });

    // Remove logs from list view for performance
    const responseList = executionList.map(execution => {
      if ('logs' in execution) {
        const { logs, ...executionWithoutLogs } = execution;
        return executionWithoutLogs;
      }
      return execution;
    });

    res.json(responseList);
  } catch (error) {
    console.error('Error listing executions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve executions'
    });
  }
});

/**
 * POST /scenarios/:scenarioId/execute
 * Execute a scenario
 */
router.post('/scenarios/:scenarioId/execute', async (req: Request, res: Response) => {
  try {
    const { scenarioId } = req.params;
    const config = req.body as ExecutionConfig;

    if (!scenarioId || typeof scenarioId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Scenario ID is required'
      });
      return;
    }

    // In a real implementation, we would validate the scenario exists
    // For now, we'll create a mock execution

    const executionId = generateExecutionId();
    const now = Date.now().toString();

    const execution: Execution = {
      executionId,
      scenarioId: scenarioId as ScenarioId,
      status: 'starting',
      startedAt: now,
      participants: [],  // No hardcoded test agents - require real agents
      configuration: {
        executionMode: config.executionMode || 'normal',
        timeoutMinutes: config.timeoutMinutes || 30,
        monitoring: {
          logLevel: config.monitoring?.logLevel || 'info',
          metricsCollection: config.monitoring?.metricsCollection ?? true,
          realTimeUpdates: config.monitoring?.realTimeUpdates ?? true
        },
        ...(config.coordination && { coordination: config.coordination })
      },
      metrics: {
        executionTime: 0,
        messagesExchanged: 0,
        tasksCompleted: 0,
        errors: 0,
        warnings: 0
      },
      progress: {
        percentage: 0,
        currentPhase: 'Initialization',
        estimatedTimeRemaining: (config.timeoutMinutes || 30) * 60
      },
      estimatedDuration: (config.timeoutMinutes || 30) * 60
    };

    // Add benchmark or self-play specific fields
    if (config.executionMode === 'benchmark') {
      execution.benchmarkResults = {
        averageLatency: 0,
        throughput: 0,
        accuracy: 0,
        iterations: 0
      };
    }

    if (config.executionMode === 'self-play') {
      execution.learningProgress = {
        currentEpisode: 0,
        totalEpisodes: 100,
        averageReward: 0,
        improvementRate: 0
      };
    }

    executions.set(executionId, execution);

    // Simulate execution start by updating status after a brief delay
    setTimeout(() => {
      const updatedExecution = executions.get(executionId);
      if (updatedExecution && updatedExecution.status === 'starting') {
        updatedExecution.status = 'running';
        updatedExecution.progress = {
          percentage: 5,
          currentPhase: 'Agent Initialization',
          estimatedTimeRemaining: (config.timeoutMinutes || 30) * 60 - 30
        };
        executions.set(executionId, updatedExecution);
      }
    }, 100);

    res.status(201).json(execution);
  } catch (error) {
    console.error('Error executing scenario:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to execute scenario'
    });
  }
});

/**
 * PUT /executions/:executionId/status
 * Update execution status (cancel, pause, resume)
 */
router.put('/:executionId/status', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const { status, reason } = req.body;

    if (!executionId || typeof executionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Execution ID is required'
      });
      return;
    }

    if (!status || !['cancelled', 'completed', 'failed'].includes(status)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Status must be one of: cancelled, completed, failed'
      });
      return;
    }

    const execution = executions.get(executionId);
    if (!execution) {
      res.status(404).json({
        error: 'Not found',
        message: `Execution with ID '${executionId}' not found`
      });
      return;
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Cannot modify status of completed or failed execution'
      });
      return;
    }

    const now = Date.now().toString();
    execution.status = status;

    if (status === 'completed') {
      execution.completedAt = now;
      execution.progress = {
        percentage: 100,
        currentPhase: 'Completed',
        estimatedTimeRemaining: 0
      };
    } else if (status === 'failed') {
      execution.failedAt = now;
      execution.error = {
        code: 'EXECUTION_FAILED',
        message: reason || 'Execution failed',
        timestamp: now,
        affectedAgents: execution.participants.map(p => p.agentId)
      };
    }

    executions.set(executionId, execution);
    res.json(execution);
  } catch (error) {
    console.error('Error updating execution status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update execution status'
    });
  }
});

/**
 * DELETE /executions/:executionId
 * Delete execution record
 */
router.delete('/:executionId', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;

    if (!executionId || typeof executionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Execution ID is required'
      });
      return;
    }

    const execution = executions.get(executionId);
    if (!execution) {
      res.status(404).json({
        error: 'Not found',
        message: `Execution with ID '${executionId}' not found`
      });
      return;
    }

    // Don't allow deletion of running executions
    if (execution.status === 'running' || execution.status === 'starting') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Cannot delete running execution. Please stop it first.'
      });
      return;
    }

    executions.delete(executionId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting execution:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete execution'
    });
  }
});

/**
 * POST /executions/:executionId/rerun
 * Rerun a completed execution with the same configuration
 */
router.post('/:executionId/rerun', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;

    if (!executionId || typeof executionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Execution ID is required'
      });
      return;
    }

    const originalExecution = executions.get(executionId);
    if (!originalExecution) {
      res.status(404).json({
        error: 'Not found',
        message: `Execution with ID '${executionId}' not found`
      });
      return;
    }

    // Only allow rerun of completed or failed executions
    if (originalExecution.status !== 'completed' && originalExecution.status !== 'failed') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Can only rerun completed or failed executions'
      });
      return;
    }

    // Create a new execution with the same configuration
    const newExecutionId = generateExecutionId();
    const now = Date.now().toString();

    const newExecution: Execution = {
      executionId: newExecutionId,
      scenarioId: originalExecution.scenarioId,
      status: 'starting',
      startedAt: now,
      participants: originalExecution.participants.map(p => ({
        ...p,
        status: 'active',
        performance: {
          responseTimes: [],
          successRate: 0,
          errorCount: 0
        }
      })),
      configuration: { ...originalExecution.configuration },
      metrics: {
        executionTime: 0,
        messagesExchanged: 0,
        tasksCompleted: 0,
        errors: 0,
        warnings: 0
      },
      progress: {
        percentage: 0,
        currentPhase: 'Initialization',
        estimatedTimeRemaining: originalExecution.estimatedDuration || 1800
      },
      ...(originalExecution.estimatedDuration && { estimatedDuration: originalExecution.estimatedDuration })
    };

    // Copy benchmark or self-play specific fields
    if (originalExecution.benchmarkResults) {
      newExecution.benchmarkResults = {
        averageLatency: 0,
        throughput: 0,
        accuracy: 0,
        iterations: 0
      };
    }

    if (originalExecution.learningProgress) {
      newExecution.learningProgress = {
        currentEpisode: 0,
        totalEpisodes: originalExecution.learningProgress.totalEpisodes,
        averageReward: 0,
        improvementRate: 0
      };
    }

    executions.set(newExecutionId, newExecution);

    // Simulate execution start
    setTimeout(() => {
      const updatedExecution = executions.get(newExecutionId);
      if (updatedExecution && updatedExecution.status === 'starting') {
        updatedExecution.status = 'running';
        updatedExecution.progress = {
          percentage: 5,
          currentPhase: 'Agent Initialization',
          estimatedTimeRemaining: (newExecution.estimatedDuration || 1800) - 30
        };
        executions.set(newExecutionId, updatedExecution);
      }
    }, 100);

    res.status(201).json({
      message: 'Execution restarted successfully',
      originalExecutionId: executionId,
      newExecutionId: newExecutionId,
      execution: newExecution
    });
  } catch (error) {
    console.error('Error rerunning execution:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to rerun execution'
    });
  }
});

/**
 * DELETE /executions/:executionId/results
 * Purge execution results while keeping the execution record
 */
router.delete('/:executionId/results', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;

    if (!executionId || typeof executionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Execution ID is required'
      });
      return;
    }

    const execution = executions.get(executionId);
    if (!execution) {
      res.status(404).json({
        error: 'Not found',
        message: `Execution with ID '${executionId}' not found`
      });
      return;
    }

    // Only allow purging results of completed or failed executions
    if (execution.status !== 'completed' && execution.status !== 'failed') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Can only purge results of completed or failed executions'
      });
      return;
    }

    // Clear results and logs while keeping execution metadata
    delete execution.results;
    delete execution.logs;
    delete execution.summary;
    delete execution.benchmarkResults;
    delete execution.learningProgress;

    // Keep basic metadata and metrics for historical tracking
    executions.set(executionId, execution);

    res.json({
      message: 'Execution results purged successfully',
      executionId: executionId,
      execution: execution
    });
  } catch (error) {
    console.error('Error purging execution results:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to purge execution results'
    });
  }
});

export default router;
