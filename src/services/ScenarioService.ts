import { ScenarioId, AgentId, UserId } from '../models/Types';
import { ScenarioPhase, ScenarioConfiguration } from '../models/Scenario';
import { AgentService } from './AgentService';
import { AgentQueryFilters, AgentSummary } from '../models/Agent';

/**
 * Enhanced Scenario interface for service operations with real phases and tasks
 */
interface SimpleScenario {
  id: ScenarioId;
  name: string;
  description: string;
  type: 'collaboration' | 'competition' | 'self-play' | 'benchmark' | 'evaluation';
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  
  // Enhanced structure with phases and tasks
  phases: ScenarioPhase[];
  configuration: ScenarioConfiguration;
  
  // Agent requirements and assignments
  requiredAgents: {
    type: string;
    count: number;
    capabilities: string[];
  }[];
  
  usage: {
    executionCount: number;
    successCount: number;
    failureCount: number;
    averageExecutionTime: number;
    lastExecuted?: string;
    popularityScore: number;
  };
  tags: string[];
  createdBy: string;
  lastModifiedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface CreateSimpleScenarioRequest {
  name: string;
  description: string;
  type?: 'collaboration' | 'competition' | 'self-play' | 'benchmark' | 'evaluation';
  phases?: (ScenarioPhase | Omit<ScenarioPhase, 'id'>)[];
  configuration?: Partial<ScenarioConfiguration>;
  requiredAgents?: {
    type: string;
    count: number;
    capabilities: string[];
  }[];
  tags?: string[];
}

interface ExecuteScenarioRequest {
  scenarioId: ScenarioId;
  overrides?: any;
}

// Enhanced execution tracking with agent assignments
interface ScenarioExecution {
  id: string;
  scenarioId: ScenarioId;
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  progress: number;
  tasks: string[];
  assignedAgents: {
    agentId: AgentId;
    role: string;
    assignedAt: string;
    status: 'assigned' | 'active' | 'completed' | 'failed';
  }[];
  taskResults: TaskExecutionResult[];
  results?: any;
}

// Agent assignment result
interface AgentAssignmentResult {
  success: boolean;
  assignedAgents: {
    agentId: AgentId;
    role: string;
    capabilities: string[];
  }[];
  unassignedRequirements: {
    type: string;
    count: number;
    capabilities: string[];
    reason: string;
  }[];
}

// Task execution result
interface TaskExecutionResult {
  taskId: string;
  phaseId: string;
  agentId: AgentId;
  status: 'completed' | 'failed' | 'skipped';
  startTime: string;
  endTime: string;
  response?: string;
  error?: string;
  executionTime: number;
}

/**
 * ScenarioService handles scenario lifecycle, execution, and coordination
 */
export class ScenarioService {
  private scenarios: Map<ScenarioId, SimpleScenario> = new Map();
  private executions: Map<string, ScenarioExecution> = new Map();
  private agentService: AgentService;

  constructor(agentService?: AgentService) {
    this.agentService = agentService || new AgentService();
    this.initializeTestScenarios();
  }

  /**
   * Initialize test scenarios for contract testing
   */
  private initializeTestScenarios(): void {
    if (process.env['NODE_ENV'] !== 'production') {
      console.log('🎬 Adding test scenarios for development/testing...');
      this.addTestScenarios();
    }
  }

  /**
   * Add test scenarios for contract testing
   */
  private addTestScenarios(): void {
    const testScenarios: SimpleScenario[] = [
      {
        id: 'test-scenario-001' as ScenarioId,
        name: 'Basic Test Scenario',
        description: 'A simple test scenario for contract testing',
        type: 'collaboration',
        status: 'active',
        phases: [], // Simplified empty phases for now
        configuration: {
          maxExecutionTime: 1800,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 10,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 5,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'druid',
            count: 1,
            capabilities: ['coordination', 'strategic-planning']
          }
        ],
        usage: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.8
        },
        tags: ['test', 'basic'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      },
      {
        id: 'test-collaboration-001' as ScenarioId,
        name: 'Collaboration Test Scenario',
        description: 'Multi-agent collaboration scenario with druid coordination',
        type: 'collaboration',
        status: 'active',
        phases: [],
        configuration: {
          maxExecutionTime: 3600,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 10,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 5,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'druid',
            count: 1,
            capabilities: ['coordination', 'strategic-planning']
          },
          {
            type: 'elemental',
            count: 2,
            capabilities: ['task-execution', 'data-processing']
          }
        ],
        usage: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.9
        },
        tags: ['test', 'collaboration', 'druid'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      },
      {
        id: 'test-benchmark-001' as ScenarioId,
        name: 'Benchmark Test Scenario',
        description: 'Performance benchmarking scenario with metrics collection',
        type: 'benchmark',
        status: 'active',
        phases: [],
        configuration: {
          maxExecutionTime: 900,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 5,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 10,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'elemental',
            count: 2,
            capabilities: ['performance-testing', 'metrics-collection']
          }
        ],
        usage: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.7
        },
        tags: ['test', 'benchmark', 'performance'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      },
      {
        id: 'test-self-play-001' as ScenarioId,
        name: 'Self-Play Test Scenario',
        description: 'Self-play learning scenario with adaptive parameters',
        type: 'self-play',
        status: 'active',
        phases: [],
        configuration: {
          maxExecutionTime: 2700,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 10,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 5,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'elemental',
            count: 2,
            capabilities: ['self-play', 'adaptive-learning']
          }
        ],
        usage: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.6
        },
        tags: ['test', 'self-play', 'learning'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      },
      {
        id: 'test-scenario-running' as ScenarioId,
        name: 'Running Test Scenario',
        description: 'Scenario that simulates already running state',
        type: 'collaboration',
        status: 'active',
        phases: [],
        configuration: {
          maxExecutionTime: 1800,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 10,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 5,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'druid',
            count: 1,
            capabilities: ['coordination']
          }
        ],
        usage: {
          executionCount: 1,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.5
        },
        tags: ['test', 'running', 'conflict'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      },
      {
        id: 'test-scenario-draft' as ScenarioId,
        name: 'Draft Test Scenario',
        description: 'Scenario in draft status (not ready)',
        type: 'collaboration',
        status: 'draft',
        phases: [],
        configuration: {
          maxExecutionTime: 1800,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 10,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 5,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'druid',
            count: 1,
            capabilities: ['coordination']
          }
        ],
        usage: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.3
        },
        tags: ['test', 'draft', 'not-ready'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      },
      {
        id: 'test-scenario-unavailable-agents' as ScenarioId,
        name: 'Unavailable Agents Test Scenario',
        description: 'Scenario requiring unavailable agents',
        type: 'collaboration',
        status: 'active',
        phases: [],
        configuration: {
          maxExecutionTime: 1800,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 10,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 5,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'unavailable-agent',
            count: 1,
            capabilities: ['non-existent']
          }
        ],
        usage: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.2
        },
        tags: ['test', 'unavailable', 'agents'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      },
      {
        id: 'test-scenario-custom-env' as ScenarioId,
        name: 'Custom Environment Test Scenario',
        description: 'Scenario for testing custom environment variables',
        type: 'collaboration',
        status: 'active',
        phases: [],
        configuration: {
          maxExecutionTime: 1800,
          failureHandling: 'stop-on-first-failure',
          monitoring: {
            enabled: true,
            checkInterval: 10,
            alertOnFailure: true,
            progressReporting: true,
            performanceTracking: true
          },
          rollback: {
            enabled: false,
            strategy: 'manual'
          },
          resources: {
            reserveResources: true,
            maxConcurrentTasks: 5,
            priorityEscalation: false
          },
          notifications: {
            onStart: false,
            onCompletion: true,
            onFailure: true,
            onMilestone: false,
            channels: ['log']
          },
          compliance: {
            auditLevel: 'basic',
            dataRetention: '30d',
            approvalRequired: false
          }
        },
        requiredAgents: [
          {
            type: 'druid',
            count: 1,
            capabilities: ['coordination']
          }
        ],
        usage: {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageExecutionTime: 0,
          popularityScore: 0.4
        },
        tags: ['test', 'environment', 'custom'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system' as UserId,
        lastModifiedBy: 'system' as UserId,
        version: 1
      }
    ];

    // Add scenarios to storage
    for (const scenario of testScenarios) {
      this.scenarios.set(scenario.id, scenario);
    }
    
    console.log(`✅ Added ${testScenarios.length} test scenarios for contract testing`);
  }

  /**
   * Create a new scenario
   */
  async createScenario(request: CreateSimpleScenarioRequest, requesterId?: string): Promise<SimpleScenario> {
    const scenarioId = this.generateId();
    const now = Date.now().toString();

    // Generate IDs for phases that don't have them
    const phasesWithIds: ScenarioPhase[] = (request.phases || []).map((phase, index) => {
      if ('id' in phase && phase.id) {
        return phase as ScenarioPhase;
      }
      // Generate ID for phase without one
      const phaseWithId = {
        ...phase,
        id: `phase-${index + 1}-${Date.now()}`
      } as ScenarioPhase;
      
      // Ensure tasks have IDs too
      if (phaseWithId.tasks) {
        phaseWithId.tasks = phaseWithId.tasks.map((task, taskIndex) => {
          if ('id' in task && task.id) {
            return task;
          }
          return {
            ...task,
            id: `task-${taskIndex + 1}-${Date.now()}`
          };
        });
      }
      
      return phaseWithId;
    });

    const scenario: SimpleScenario = {
      id: scenarioId,
      name: request.name,
      description: request.description,
      type: request.type || 'collaboration',
      status: 'active',
      
      // Use provided phases or default
      phases: phasesWithIds.length > 0 ? phasesWithIds : [{
        id: 'default-phase',
        name: 'Collaboration Phase',
        description: 'Default collaboration phase',
        tasks: [{
          id: 'default-task',
          name: 'Collaboration Task',
          description: 'Default collaboration task',
          type: 'communication',
          parameters: {},
          timeout: 300000, // 5 minutes
          expectedDuration: 60000, // 1 minute
          priority: 'medium',
          dependencies: [],
          parallelizable: true
        }],
        dependencies: [],
        parallelExecution: false,
        continueOnTaskFailure: false,
        successCriteria: {
          minimumTasksSuccess: 'all'
        }
      }],
      
      configuration: {
        maxExecutionTime: 1800000, // 30 minutes
        failureHandling: 'stop-on-first-failure',
        monitoring: {
          enabled: true,
          checkInterval: 5000,
          alertOnFailure: true,
          progressReporting: true,
          performanceTracking: true
        },
        rollback: {
          enabled: false,
          strategy: 'manual'
        },
        resources: {
          reserveResources: false,
          maxConcurrentTasks: 5,
          priorityEscalation: false
        },
        notifications: {
          onStart: false,
          onCompletion: true,
          onFailure: true,
          onMilestone: false,
          channels: ['console']
        },
        compliance: {
          auditLevel: 'basic',
          dataRetention: '30d',
          approvalRequired: false
        },
        ...request.configuration
      },
      
      requiredAgents: request.requiredAgents || [{
        type: 'any',
        count: 1,
        capabilities: ['communication']
      }],
      
      usage: {
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        averageExecutionTime: 0,
        popularityScore: 0
      },
      tags: request.tags || [],
      createdBy: requesterId || 'system',
      lastModifiedBy: requesterId || 'system',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    this.scenarios.set(scenarioId, scenario);
    return scenario;
  }

  /**
   * Get a scenario by ID
   */
  async getScenario(scenarioId: ScenarioId, _requesterId?: string): Promise<SimpleScenario | null> {
    return this.scenarios.get(scenarioId) || null;
  }

  /**
   * List all scenarios
   */
  async listScenarios(): Promise<SimpleScenario[]> {
    return Array.from(this.scenarios.values());
  }

  /**
   * Update scenario
   */
  async updateScenario(scenarioId: ScenarioId, request: Partial<CreateSimpleScenarioRequest>, requesterId?: string): Promise<SimpleScenario> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    // Handle phases with ID generation if needed
    let updatedPhases = scenario.phases;
    if (request.phases) {
      updatedPhases = request.phases.map((phase, index) => {
        if ('id' in phase && phase.id) {
          return phase as ScenarioPhase;
        }
        // Generate ID for phase without one
        const phaseWithId = {
          ...phase,
          id: `phase-${index + 1}-${Date.now()}`
        } as ScenarioPhase;
        
        // Ensure tasks have IDs too
        if (phaseWithId.tasks) {
          phaseWithId.tasks = phaseWithId.tasks.map((task, taskIndex) => {
            if ('id' in task && task.id) {
              return task;
            }
            return {
              ...task,
              id: `task-${taskIndex + 1}-${Date.now()}`
            };
          });
        }
        
        return phaseWithId;
      });
    }

    const updatedScenario: SimpleScenario = {
      ...scenario,
      name: request.name || scenario.name,
      description: request.description || scenario.description,
      type: request.type || scenario.type,
      phases: updatedPhases,
      configuration: {
        ...scenario.configuration,
        ...request.configuration
      },
      requiredAgents: request.requiredAgents || scenario.requiredAgents,
      tags: request.tags || scenario.tags,
      lastModifiedBy: requesterId || 'system',
      updatedAt: Date.now().toString(),
      version: (scenario.version || 1) + 1
    };

    this.scenarios.set(scenarioId, updatedScenario);
    return updatedScenario;
  }

  /**
   * Delete scenario
   */
  async deleteScenario(scenarioId: ScenarioId, _requesterId?: string): Promise<void> {
    if (!this.scenarios.has(scenarioId)) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }
    this.scenarios.delete(scenarioId);
  }

  /**
   * Activate a scenario for execution
   */
  async activateScenario(scenarioId: ScenarioId, requesterId?: string): Promise<SimpleScenario> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    const activatedScenario: SimpleScenario = {
      ...scenario,
      status: 'active',
      lastModifiedBy: requesterId || 'system',
      updatedAt: Date.now().toString(),
      version: (scenario.version || 1) + 1
    };

    this.scenarios.set(scenarioId, activatedScenario);
    console.log(`📋 Scenario ${scenarioId} activated for execution`);
    return activatedScenario;
  }

  /**
   * Execute a scenario
   */
  async executeScenario(request: ExecuteScenarioRequest, requesterId?: string): Promise<string> {
    const scenario = this.scenarios.get(request.scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${request.scenarioId} not found`);
    }

    if (scenario.status !== 'active') {
      throw new Error(`Scenario ${request.scenarioId} is not active for execution`);
    }

    const executionId = this.generateExecutionId();

    // Create execution tracking
    const execution: ScenarioExecution = {
      id: executionId,
      scenarioId: request.scenarioId,
      status: 'running',
      startTime: new Date().toISOString(),
      progress: 0,
      tasks: ['Initialize scenario', 'Discover and assign agents', 'Execute scenario phases', 'Generate results'],
      assignedAgents: [],
      taskResults: []
    };

    this.executions.set(executionId, execution);

    // Update scenario usage
    scenario.usage.executionCount += 1;
    scenario.usage.lastExecuted = Date.now().toString();
    scenario.lastModifiedBy = requesterId || 'system';
    scenario.updatedAt = Date.now().toString();
    scenario.version = (scenario.version || 1) + 1;

    // Start async execution (simplified for now)
    this.performAsyncExecution(executionId, scenario).catch((error: any) => {
      console.error(`❌ Execution ${executionId} failed:`, error);
      const exec = this.executions.get(executionId);
      if (exec) {
        exec.status = 'failed';
        exec.endTime = new Date().toISOString();
        exec.results = { error: error.message };
      }
    });

    return executionId;
  }

  /**
   * Get scenario statistics
   */
  async getScenarioStatistics(_requesterId?: string): Promise<{ totalScenarios: number; executionStats: any; }> {
    const totalScenarios = this.scenarios.size;
    
    const executionStats = {
      totalExecutions: Array.from(this.scenarios.values()).reduce((sum, scenario) => sum + scenario.usage.executionCount, 0),
      scenarioBreakdown: Array.from(this.scenarios.values()).map(scenario => ({
        id: scenario.id,
        name: scenario.name,
        executionCount: scenario.usage.executionCount,
        status: scenario.status
      }))
    };

    return { totalScenarios, executionStats };
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<ScenarioExecution | null> {
    return this.executions.get(executionId) || null;
  }

  /**
   * Get all executions
   */
  async getAllExecutions(): Promise<ScenarioExecution[]> {
    return Array.from(this.executions.values());
  }

  /**
   * Discover and assign agents for a scenario based on requirements
   */
  private async discoverAndAssignAgents(scenario: SimpleScenario, executionId: string): Promise<AgentAssignmentResult> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (!this.agentService) {
      throw new Error('❌ Cannot execute collaboration: AgentService is not configured. Please ensure the ScenarioService is initialized with an AgentService instance.');
    }

    const assignmentResult: AgentAssignmentResult = {
      success: true,
      assignedAgents: [],
      unassignedRequirements: []
    };

    // Process each agent requirement
    for (const requirement of scenario.requiredAgents) {
      try {
        const agents = await this.findAgentsForRequirement(requirement);
        
        if (agents.length >= requirement.count) {
          // Assign the required number of agents
          const selectedAgents = agents.slice(0, requirement.count);
          
          for (const agent of selectedAgents) {
            const assignment = {
              agentId: agent.id,
              role: requirement.type,
              assignedAt: new Date().toISOString(),
              status: 'assigned' as const
            };
            
            execution.assignedAgents.push(assignment);
            assignmentResult.assignedAgents.push({
              agentId: agent.id,
              role: requirement.type,
              capabilities: agent.capabilities
            });
          }
        } else {
          // Not enough agents available
          assignmentResult.success = false;
          assignmentResult.unassignedRequirements.push({
            type: requirement.type,
            count: requirement.count - agents.length,
            capabilities: requirement.capabilities,
            reason: `Only ${agents.length} agents available, need ${requirement.count}`
          });
        }
      } catch (error) {
        console.error(`❌ Failed to find agents for requirement ${requirement.type}:`, error);
        assignmentResult.success = false;
        assignmentResult.unassignedRequirements.push({
          type: requirement.type,
          count: requirement.count,
          capabilities: requirement.capabilities,
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return assignmentResult;
  }

  /**
   * Find agents that match a specific requirement
   */
  private async findAgentsForRequirement(requirement: {
    type: string;
    count: number;
    capabilities: string[];
    specificAgentId?: string;
    agentName?: string;
  }): Promise<AgentSummary[]> {
    if (!this.agentService) {
      return [];
    }

    // If a specific agent is requested, try to use it directly
    if (requirement.specificAgentId) {
      try {
        // Resolve agent name to ID if needed
        const resolvedAgentId = await this.resolveAgentId(requirement.specificAgentId);
        const specificAgent = await this.agentService.getAgent(resolvedAgentId as AgentId);
        if (specificAgent) {
          // Auto-activate the agent if it's inactive but referenced in a scenario
          if (specificAgent.status !== 'active') {
            console.log(`🔨 Auto-activating specific agent: ${specificAgent.name} (${resolvedAgentId}) - was ${specificAgent.status}`);
            try {
              await this.agentService.startAgent(resolvedAgentId as AgentId);
              console.log(`✅ Auto-activated agent: ${specificAgent.name} (${resolvedAgentId})`);
              // Update the agent status for return
              specificAgent.status = 'active';
            } catch (activationError) {
              console.error(`❌ Failed to auto-activate agent ${resolvedAgentId}:`, activationError);
              console.warn(`⚠️ Specific agent ${resolvedAgentId} (${requirement.agentName}) could not be activated`);
              return [];
            }
          }
          
          console.log(`🎯 Using specific agent: ${specificAgent.name} (${resolvedAgentId})`);
          return [{
            id: resolvedAgentId as AgentId,
            name: specificAgent.name,
            type: specificAgent.type,
            status: specificAgent.status,
            capabilities: specificAgent.capabilities,
            domain: specificAgent.specialization?.domain || 'general',
            health: 'healthy', // Default health status for active agents
            successRate: 1.0 // Default success rate for specific agent requests
          }];
        } else {
          console.warn(`⚠️ Specific agent ${resolvedAgentId} (${requirement.agentName}) not found`);
        }
      } catch (error) {
        console.error(`❌ Error retrieving specific agent ${requirement.specificAgentId}:`, error);
      }
    }

    // Fall back to capability-based search if specific agent not available
    const filters: AgentQueryFilters = {
      status: 'active',
      capabilities: requirement.capabilities
    };

    // If type is specific, add it to filters
    if (requirement.type !== 'any') {
      // Map requirement type to AgentType if needed
      // For now, we'll search by capabilities primarily
    }

    try {
      console.log(`🔍 DEBUG: ScenarioService AgentService instance:`, !!this.agentService);
      console.log(`🔍 DEBUG: Searching for agents with filters:`, filters);
      const agents = await this.agentService.listAgents(filters);
      console.log(`🔍 DEBUG: Found ${agents.length} agents:`, agents.map(a => `${a.id}(${a.name})`));
      
      if (agents.length === 0) {
        throw new Error(`❌ No active agents found with required capabilities: ${requirement.capabilities.join(', ')}. Please create and activate agents with these capabilities before running scenarios.`);
      }
      
      // Filter and sort agents by capability match
      return agents
        .filter(agent => {
          // If no specific capabilities required, return all active agents
          if (requirement.capabilities.length === 0) {
            return true;
          }
          // Check if agent has all required capabilities
          return requirement.capabilities.every(cap => 
            agent.capabilities.includes(cap)
          );
        })
        .sort((a, b) => {
          // Sort by health and success rate if available
          if (a.health === 'healthy' && b.health !== 'healthy') return -1;
          if (b.health === 'healthy' && a.health !== 'healthy') return 1;
          return (b.successRate || 0) - (a.successRate || 0);
        });
    } catch (error) {
      console.error('❌ Error querying agents:', error);
      return [];
    }
  }

  /**
   * Perform asynchronous scenario execution with agent discovery and assignment
   */
  private async performAsyncExecution(executionId: string, scenario: SimpleScenario): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    try {
      console.log(`🚀 Starting execution of scenario: ${scenario.name}`);
      
      // Phase 1: Initialization
      execution.progress = 15;
      await this.delay(500);
      
      // Phase 2: Agent Discovery and Assignment
      execution.progress = 30;
      console.log(`� Discovering and assigning agents for scenario: ${scenario.name}`);
      
      const assignmentResult = await this.discoverAndAssignAgents(scenario, executionId);
      
      if (!assignmentResult.success) {
        console.warn('⚠️ Agent assignment partially failed:', assignmentResult.unassignedRequirements);
        // Continue with available agents or fail based on scenario configuration
        if (scenario.configuration.failureHandling === 'stop-on-first-failure') {
          throw new Error(`Agent assignment failed: ${assignmentResult.unassignedRequirements.map(ur => ur.reason).join(', ')}`);
        }
      }
      
      console.log(`✅ Assigned ${assignmentResult.assignedAgents.length} agents:`, 
        assignmentResult.assignedAgents.map(a => `${a.agentId} (${a.role})`).join(', '));
      
      await this.delay(500);
      
      // Phase 3: Execute Scenario Phases with Real Task Delegation
      execution.progress = 30;
      console.log(`⚙️ Executing phases for scenario: ${scenario.name}`);
      
      if (this.agentService && assignmentResult.assignedAgents.length > 0) {
        await this.executeScenarioPhases(scenario, execution, assignmentResult.assignedAgents);
      } else {
        const errorDetails = [];
        if (!this.agentService) {
          errorDetails.push('AgentService is not available');
        }
        if (assignmentResult.assignedAgents.length === 0) {
          errorDetails.push('No agents were successfully assigned to this collaboration');
          if (assignmentResult.unassignedRequirements.length > 0) {
            errorDetails.push(`Missing: ${assignmentResult.unassignedRequirements.map(req => `${req.count} ${req.type} agent(s) - ${req.reason}`).join(', ')}`);
          }
        }
        
        const errorMessage = `❌ Cannot execute collaboration: ${errorDetails.join('; ')}. Please create and start the required agents first.`;
        console.error(errorMessage);
        
        execution.status = 'failed';
        execution.endTime = new Date().toISOString();
        throw new Error(errorMessage);
      }
      
      // Phase 4: Results collection and analysis
      execution.progress = 90;
      console.log(`📊 Collecting results for scenario: ${scenario.name}`);
      await this.delay(1000);
      
      // Completion
      execution.status = 'completed';
      execution.progress = 100;
      execution.endTime = new Date().toISOString();
      
      const successfulTasks = execution.taskResults.filter(tr => tr.status === 'completed').length;
      const failedTasks = execution.taskResults.filter(tr => tr.status === 'failed').length;
      
      execution.results = {
        message: `Scenario ${scenario.name} completed successfully`,
        phasesExecuted: scenario.phases.length,
        tasksExecuted: execution.taskResults.length,
        tasksSuccessful: successfulTasks,
        tasksFailed: failedTasks,
        agentsAssigned: assignmentResult.assignedAgents.length,
        assignmentDetails: assignmentResult,
        taskResults: execution.taskResults,
        duration: Date.now() - new Date(execution.startTime).getTime()
      };
      
      // Update scenario success count
      scenario.usage.successCount += 1;
      
      console.log(`✅ Scenario execution completed: ${executionId} (${successfulTasks}/${execution.taskResults.length} tasks successful)`);
    } catch (error: any) {
      console.error(`❌ Execution failed: ${executionId}`, error);
      execution.status = 'failed';
      execution.endTime = new Date().toISOString();
      execution.results = { error: error.message, taskResults: execution.taskResults };
      
      // Update scenario failure count
      scenario.usage.failureCount += 1;
    }
  }

  /**
   * Execute scenario phases with real agent task delegation
   */
  private async executeScenarioPhases(
    scenario: SimpleScenario,
    execution: ScenarioExecution,
    assignedAgents: { agentId: AgentId; role: string; capabilities: string[]; }[]
  ): Promise<void> {
    const totalPhases = scenario.phases.length;
    let completedPhases = 0;
    
    for (const phase of scenario.phases) {
      console.log(`📋 Executing phase: ${phase.name}`);
      
      try {
        const phaseTasks = phase.tasks || [];
        const totalTasks = phaseTasks.length;
        
        if (totalTasks === 0) {
          console.log(`⏭️ Skipping empty phase: ${phase.name}`);
          continue;
        }
        
        // Execute tasks in phase (sequential or parallel based on phase config)
        if (phase.parallelExecution) {
          // Execute tasks in parallel
          const taskPromises = phaseTasks.map(task => 
            this.executeTask(task, phase.id, scenario, assignedAgents)
          );
          
          const taskResults = await Promise.allSettled(taskPromises);
          
          // Process results
          taskResults.forEach((result, index) => {
            const task = phaseTasks[index];
            if (!task) return; // Skip if task doesn't exist
            
            if (result.status === 'fulfilled') {
              execution.taskResults.push(result.value);
            } else {
              execution.taskResults.push({
                taskId: task.id,
                phaseId: phase.id,
                agentId: 'unknown' as AgentId,
                status: 'failed',
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                error: result.reason?.message || 'Unknown error',
                executionTime: 0
              });
            }
          });
        } else {
          // Execute tasks sequentially
          for (const task of phaseTasks) {
            const taskResult = await this.executeTask(task, phase.id, scenario, assignedAgents);
            execution.taskResults.push(taskResult);
            
            // Check if we should continue after task failure
            if (taskResult.status === 'failed' && !phase.continueOnTaskFailure) {
              console.warn(`⚠️ Task ${task.name} failed, stopping phase ${phase.name}`);
              break;
            }
          }
        }
        
        completedPhases++;
        
        // Update progress based on completed phases
        const phaseProgress = 30 + (completedPhases / totalPhases) * 50; // 30-80% range
        execution.progress = Math.min(80, phaseProgress);
        
      } catch (error) {
        console.error(`❌ Phase ${phase.name} execution failed:`, error);
        
        // Add failed phase record
        execution.taskResults.push({
          taskId: `phase-${phase.id}-error`,
          phaseId: phase.id,
          agentId: 'system' as AgentId,
          status: 'failed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown phase error',
          executionTime: 0
        });
        
        if (scenario.configuration.failureHandling === 'stop-on-first-failure') {
          throw error;
        }
      }
    }
  }

  /**
   * Execute a single task using assigned agents
   */
  private async executeTask(
    task: any,
    phaseId: string,
    scenario: SimpleScenario,
    assignedAgents: { agentId: AgentId; role: string; capabilities: string[]; }[]
  ): Promise<TaskExecutionResult> {
    const startTime = new Date().toISOString();
    const executionStart = Date.now();
    
    try {
      // Find suitable agent for this task
      const suitableAgent = this.findSuitableAgent(task, assignedAgents);
      
      if (!suitableAgent) {
        return {
          taskId: task.id,
          phaseId,
          agentId: 'none' as AgentId,
          status: 'failed',
          startTime,
          endTime: new Date().toISOString(),
          error: 'No suitable agent found for task',
          executionTime: Date.now() - executionStart
        };
      }
      
      console.log(`🎯 Executing task "${task.name}" with agent ${suitableAgent.agentId}`);
      
      // Resolve agent name to ID if needed
      const resolvedAgentId = await this.resolveAgentId(suitableAgent.agentId);
      
      // Prepare prompt for the agent
      const taskPrompt = this.generateTaskPrompt(task, scenario, phaseId);
      
      // Execute via AgentService with enhanced persona context
      const response = await this.agentService!.executeAgentPrompt(resolvedAgentId as AgentId, {
        prompt: taskPrompt,
        temperature: 0.7,
        collaborationContext: {
          scenarioName: scenario.name,
          scenarioType: scenario.type,
          agentRole: suitableAgent.role,
          usePersonaPrompt: true
        }
      });
      
      console.log(`✅ Task "${task.name}" completed by ${resolvedAgentId}`);
      
      return {
        taskId: task.id,
        phaseId,
        agentId: resolvedAgentId as AgentId,
        status: 'completed',
        startTime,
        endTime: new Date().toISOString(),
        response: response.response,
        executionTime: Date.now() - executionStart
      };
      
    } catch (error) {
      console.error(`❌ Task "${task.name}" execution failed:`, error);
      
      return {
        taskId: task.id,
        phaseId,
        agentId: 'error' as AgentId,
        status: 'failed',
        startTime,
        endTime: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown task error',
        executionTime: Date.now() - executionStart
      };
    }
  }

  /**
   * Execute mock phases when AgentService is not available
   */
  /**
   * Resolve agent name to agent ID if needed
   */
  private async resolveAgentId(agentIdOrName: string): Promise<string> {
    if (!this.agentService) {
      throw new Error('AgentService not available');
    }

    // First, try to get agent by ID directly
    try {
      const agent = await this.agentService.getAgent(agentIdOrName as AgentId);
      if (agent) {
        return agentIdOrName; // It's already an ID
      }
    } catch (error) {
      // Not found by ID, try name resolution
    }

    // Name patterns for common agents (matching MCP server patterns)
    const namePatterns = [
      { pattern: /pierre robert/i, id: 'pierre-robert' },
      { pattern: /de lint/i, id: 'de-lint' },
      { pattern: /tolkien/i, id: 'tolkien' },
      { pattern: /asimov/i, id: 'asimov' },
      { pattern: /lucas/i, id: 'lucas' },
      { pattern: /colleen/i, id: 'colleen' }
    ];

    // Check for specific agent name patterns
    for (const pattern of namePatterns) {
      if (pattern.pattern.test(agentIdOrName)) {
        try {
          const agent = await this.agentService.getAgent(pattern.id as AgentId);
          if (agent) {
            console.log(`🔄 Resolved agent name "${agentIdOrName}" to ID "${pattern.id}"`);
            return pattern.id;
          }
        } catch (error) {
          // Continue to next pattern
        }
      }
    }

    // If no pattern matches, try to find by name from all agents
    try {
      const agents = await this.agentService.listAgents({});
      const matchingAgent = agents.find(agent => 
        agent.name.toLowerCase() === agentIdOrName.toLowerCase() ||
        agent.name.toLowerCase().includes(agentIdOrName.toLowerCase()) ||
        agentIdOrName.toLowerCase().includes(agent.name.toLowerCase())
      );
      
      if (matchingAgent) {
        console.log(`🔄 Resolved agent name "${agentIdOrName}" to ID "${matchingAgent.id}"`);
        return matchingAgent.id;
      }
    } catch (error) {
      console.error('❌ Error searching agents by name:', error);
    }

    // If all else fails, return original value
    console.warn(`⚠️ Could not resolve agent identifier "${agentIdOrName}"`);
    return agentIdOrName;
  }

  /**
   * Find suitable agent for a task based on capabilities and type
   */
  private findSuitableAgent(
    task: any,
    assignedAgents: { agentId: AgentId; role: string; capabilities: string[]; }[]
  ): { agentId: AgentId; role: string; capabilities: string[]; } | null {
    // Simple algorithm: find first agent that has matching capabilities for task type
    for (const agent of assignedAgents) {
      // Check if agent has capabilities that match the task type
      if (task.type === 'communication' && agent.capabilities.includes('communication')) {
        return agent;
      }
      if (task.type === 'analysis' && agent.capabilities.includes('analysis')) {
        return agent;
      }
      if (task.type === 'execution' && agent.capabilities.includes('task_execution')) {
        return agent;
      }
      // Default: use any available agent
      if (agent.capabilities.length > 0) {
        return agent;
      }
    }
    
    // Fallback: return first available agent
    return assignedAgents.length > 0 ? assignedAgents[0] || null : null;
  }

  /**
   * Generate task prompt for agent execution
   */
  private generateTaskPrompt(task: any, scenario: SimpleScenario, phaseId: string): string {
    const prompt = `
Task: ${task.name}
Description: ${task.description}
Type: ${task.type}

Scenario Context:
- Scenario: ${scenario.name}
- Phase: ${phaseId}
- Expected Duration: ${task.expectedDuration || 'Not specified'} ms

Task Parameters:
${JSON.stringify(task.parameters || {}, null, 2)}

Please execute this task and provide your response. Focus on the task requirements and collaborate effectively within the scenario context.`;
    
    return prompt;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

}
