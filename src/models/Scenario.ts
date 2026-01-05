import {
  ScenarioId,
  ExecutionId,
  AgentId,
  RealmId,
  TaskId,
  TaskType,
  TaskStatus,
  ExecutionStatus,
  Timestamp,
  BaseEntity,
  PerformanceMetrics,
  AlertSeverity
} from './Types';

/**
 * Task definition within a scenario
 */
export interface ScenarioTask {
  id: TaskId;
  name: string;
  description?: string;
  type: TaskType;
  assignedAgentId?: AgentId;
  agentConstraints?: {
    requiredCapabilities: string[];
    requiredAgentType?: string;
    preferredAgents?: AgentId[];
    excludedAgents?: AgentId[];
  };
  
  // Task parameters and configuration
  parameters: Record<string, any>;
  timeout: number;
  expectedDuration?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  // Dependencies and ordering
  dependencies: TaskId[];
  parallelizable: boolean;
  maxRetries?: number;
  retryDelay?: number;
  
  // Validation and acceptance criteria
  acceptanceCriteria?: {
    condition: string;
    expectedValue: any;
    tolerance?: number;
  }[];
  
  // Output and artifacts
  expectedOutputs?: {
    name: string;
    type: string;
    required: boolean;
    validation?: string;
  }[];
  
  // Monitoring and alerting
  monitoring?: {
    metricsToCollect: string[];
    alertThresholds: Record<string, number>;
    progressReporting: boolean;
  };
  
  // Rollback and cleanup
  rollback?: {
    enabled: boolean;
    strategy: 'automatic' | 'manual' | 'conditional';
    cleanupSteps: string[];
  };
}

/**
 * Scenario phase containing related tasks
 */
export interface ScenarioPhase {
  id: string;
  name: string;
  description: string;
  
  // Phase configuration
  tasks: ScenarioTask[];
  dependencies: string[]; // IDs of phases that must complete first
  parallelExecution: boolean;
  continueOnTaskFailure: boolean;
  
  // Phase-level constraints
  timeout?: number;
  maxConcurrentTasks?: number;
  resourceLimits?: {
    maxMemoryMB: number;
    maxCpuPercent: number;
  };
  
  // Success criteria
  successCriteria: {
    minimumTasksSuccess: number | 'all';
    requiredTasks?: TaskId[];
    acceptableFailures?: TaskId[];
  };
  
  // Rollback configuration
  rollback?: {
    enabled: boolean;
    strategy: 'task-level' | 'phase-level' | 'custom';
    rollbackOrder: 'reverse' | 'parallel' | 'custom';
    customSteps?: string[];
  };
}

/**
 * Scenario configuration and policies
 */
export interface ScenarioConfiguration {
  maxExecutionTime: number;
  failureHandling: 'stop-on-first-failure' | 'continue-on-non-critical' | 'continue-on-all';
  
  // Monitoring and observability
  monitoring: {
    enabled: boolean;
    checkInterval: number;
    alertOnFailure: boolean;
    progressReporting: boolean;
    performanceTracking: boolean;
  };
  
  // Rollback and recovery
  rollback: {
    enabled: boolean;
    strategy: 'manual' | 'automatic' | 'conditional' | 'phase-level' | 'task-level';
    conditions?: string[];
    maxRollbackTime?: number;
  };
  
  // Resource management
  resources: {
    reserveResources: boolean;
    maxConcurrentTasks: number;
    priorityEscalation: boolean;
    resourceQuotas?: Record<string, number>;
  };
  
  // Notifications and alerting
  notifications: {
    onStart: boolean;
    onCompletion: boolean;
    onFailure: boolean;
    onMilestone: boolean;
    channels: string[];
    escalationPolicy?: {
      levels: {
        delay: number;
        recipients: string[];
        severity: AlertSeverity;
      }[];
    };
  };
  
  // Compliance and audit
  compliance: {
    auditLevel: 'none' | 'basic' | 'detailed' | 'comprehensive';
    dataRetention: string;
    approvalRequired: boolean;
    approvers?: string[];
  };
}

/**
 * Main Scenario interface
 */
export interface Scenario extends BaseEntity {
  id: ScenarioId;
  name: string;
  description: string;
  scenarioVersion: string;
  realmId: RealmId;
  
  // Scenario structure
  phases: ScenarioPhase[];
  configuration: ScenarioConfiguration;
  
  // Metadata and classification
  category: string;
  tags: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  estimatedDuration: number;
  
  // Requirements and constraints
  requirements: {
    requiredAgents: {
      type: string;
      count: number;
      capabilities: string[];
      specificAgentId?: string; // Optional: use specific agent if provided
      agentName?: string; // Optional: agent name for reference
    }[];
    requiredResources: {
      memoryMB: number;
      cpuCores: number;
      storage?: string;
      network?: string;
    };
    requiredPermissions: string[];
  };
  
  // Validation and testing
  validation: {
    isValidated: boolean;
    validatedBy?: string;
    validationDate?: Timestamp;
    validationResults?: {
      passed: boolean;
      issues: string[];
      recommendations: string[];
    };
  };
  
  // Usage and statistics
  usage: {
    executionCount: number;
    successCount: number;
    failureCount: number;
    averageExecutionTime: number;
    lastExecuted?: Timestamp;
    popularityScore: number;
  };
  
  // Lifecycle and versioning
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  parentScenarioId?: ScenarioId;
  derivedScenarios: ScenarioId[];
  
  // Template and parameterization
  isTemplate: boolean;
  parameterization?: {
    configurable: {
      parameter: string;
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description: string;
      required: boolean;
      default?: any;
      validation?: any;
    }[];
  };
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Task execution state and results
 */
export interface TaskExecution {
  taskId: TaskId;
  executionId: string;
  assignedAgentId?: AgentId;
  
  // Execution status
  status: TaskStatus;
  startTime?: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  
  // Progress and performance
  progress: number;
  performanceMetrics?: PerformanceMetrics;
  resourceUsage?: {
    memoryMB: number;
    cpuPercent: number;
    networkBytes: number;
  };
  
  // Results and outputs
  result?: any;
  outputs?: Record<string, any>;
  artifacts?: {
    name: string;
    path: string;
    size: number;
    checksum: string;
  }[];
  
  // Error handling
  errors?: {
    timestamp: Timestamp;
    type: string;
    message: string;
    stack?: string;
    retryable: boolean;
  }[];
  retryCount: number;
  
  // Audit trail
  auditTrail: {
    timestamp: Timestamp;
    event: string;
    details: Record<string, any>;
    agentId?: AgentId;
  }[];
}

/**
 * Phase execution state and results
 */
export interface PhaseExecution {
  phaseId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  
  // Task executions within this phase
  tasks: TaskExecution[];
  
  // Phase-level metrics
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    tasksSkipped: number;
    averageTaskTime: number;
    parallelismUtilization: number;
  };
  
  // Resource utilization
  resourceUsage: {
    peakMemoryMB: number;
    averageCpuPercent: number;
    totalNetworkBytes: number;
  };
}

/**
 * Complete scenario execution state and history
 */
export interface ScenarioExecution extends BaseEntity {
  id: ExecutionId;
  scenarioId: ScenarioId;
  realmId: RealmId;
  
  // Execution metadata
  name: string;
  description?: string;
  triggeredBy: string;
  triggerType: 'manual' | 'scheduled' | 'event' | 'api';
  
  // Execution status and timing
  status: ExecutionStatus;
  startTime?: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  estimatedCompletion?: Timestamp;
  
  // Progress tracking
  overallProgress: number;
  currentPhase?: string;
  currentTasks: string[];
  
  // Phase and task executions
  phases: PhaseExecution[];
  
  // Resource allocation and usage
  allocatedResources: {
    agents: AgentId[];
    memoryMB: number;
    cpuCores: number;
  };
  
  resourceUsage: {
    peakMemoryMB: number;
    averageCpuPercent: number;
    totalNetworkBytes: number;
    agentUtilization: Record<AgentId, number>;
  };
  
  // Results and artifacts
  result?: any;
  artifacts: {
    name: string;
    path: string;
    size: number;
    type: string;
    checksum: string;
    metadata?: Record<string, any>;
  }[];
  
  // Performance metrics
  performance: {
    executionTime: number;
    taskCount: number;
    successfulTasks: number;
    failedTasks: number;
    averageTaskTime: number;
    throughput: number;
    efficiency: number;
  };
  
  // Error tracking
  errors: {
    timestamp: Timestamp;
    phase?: string;
    task?: TaskId;
    agent?: AgentId;
    type: string;
    message: string;
    severity: AlertSeverity;
    resolved: boolean;
  }[];
  
  // Configuration used for this execution
  configuration: ScenarioConfiguration;
  parameters?: Record<string, any>;
  
  // Rollback information
  rollback?: {
    initiated: Timestamp;
    reason: string;
    status: 'in-progress' | 'completed' | 'failed';
    steps: {
      step: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      timestamp?: Timestamp;
      duration?: number;
    }[];
  };
  
  // Monitoring and alerts
  alerts: {
    id: string;
    type: 'performance' | 'error' | 'timeout' | 'resource' | 'security' | 'compliance';
    severity: AlertSeverity;
    message: string;
    timestamp: Timestamp;
    resolved?: Timestamp;
    acknowledgements: {
      by: string;
      timestamp: Timestamp;
    }[];
  }[];
  
  // Audit and compliance
  auditTrail: {
    timestamp: Timestamp;
    event: string;
    details: Record<string, any>;
    actor: string;
    actorType: 'user' | 'agent' | 'system';
  }[];
  
  // Metadata
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * Request to create a scenario
 */
export interface CreateScenarioRequest {
  name: string;
  description: string;
  realmId: RealmId;
  phases: Omit<ScenarioPhase, 'id'>[];
  configuration: ScenarioConfiguration;
  category: string;
  tags?: string[];
  complexity?: 'simple' | 'moderate' | 'complex' | 'expert';
  isTemplate?: boolean;
  parameterization?: {
    configurable: {
      parameter: string;
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description: string;
      required: boolean;
      default?: any;
      validation?: any;
    }[];
  };
  metadata?: Record<string, any>;
}

/**
 * Request to execute a scenario
 */
export interface ExecuteScenarioRequest {
  scenarioId: ScenarioId;
  realmId?: RealmId;
  name?: string;
  description?: string;
  parameters?: Record<string, any>;
  overrides?: {
    configuration?: Partial<ScenarioConfiguration>;
    agentAssignments?: Record<TaskId, AgentId>;
    resourceLimits?: Record<string, number>;
  };
  scheduling?: {
    startAt?: Timestamp;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    preemptible?: boolean;
  };
  notifications?: {
    channels: string[];
    events: string[];
  };
  metadata?: Record<string, any>;
}

/**
 * Scenario template for reusable scenario patterns
 */
export interface ScenarioTemplate extends BaseEntity {
  id: string;
  name: string;
  description: string;
  category: string;
  templateVersion: string;
  
  // Template structure
  baseScenario: Omit<Scenario, 'id' | 'realmId' | 'createdAt' | 'updatedAt' | 'version'>;
  
  // Parameterization
  parameters: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'agent' | 'realm';
    description: string;
    required: boolean;
    default?: any;
    validation?: {
      pattern?: string;
      min?: number;
      max?: number;
      enum?: any[];
    };
    displayName: string;
    helpText?: string;
  }[];
  
  // Usage and examples
  examples: {
    name: string;
    description: string;
    parameters: Record<string, any>;
    expectedResults: string;
  }[];
  
  // Compatibility and requirements
  compatibility: {
    agentTypes: string[];
    realmTypes: string[];
    minimumAgents: number;
    requiredCapabilities: string[];
  };
  
  // Metadata
  tags: string[];
  popularity: number;
  usageCount: number;
  rating?: number;
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Scenario execution progress update
 */
export interface ExecutionProgress {
  executionId: ExecutionId;
  timestamp: Timestamp;
  overallProgress: number;
  
  phaseProgress: {
    phaseId: string;
    progress: number;
    status: string;
    startTime?: Timestamp;
    estimatedCompletion?: Timestamp;
  }[];
  
  taskProgress: {
    taskId: TaskId;
    progress: number;
    status: TaskStatus;
    agentId?: AgentId;
    startTime?: Timestamp;
    estimatedCompletion?: Timestamp;
  }[];
  
  currentActivity: {
    phase: string;
    tasks: string[];
    agents: AgentId[];
  };
  
  metrics: {
    tasksCompleted: number;
    tasksRemaining: number;
    averageTaskTime: number;
    estimatedTimeRemaining: number;
  };
}

/**
 * Scenario optimization recommendations
 */
export interface ScenarioOptimization {
  scenarioId: ScenarioId;
  analysisDate: Timestamp;
  
  recommendations: {
    type: 'task-parallelization' | 'resource-allocation' | 'timeout-optimization' | 'agent-assignment' | 'phase-restructuring';
    priority: 'low' | 'medium' | 'high';
    description: string;
    estimatedImprovement: {
      executionTime?: number;
      resourceEfficiency?: number;
      successRate?: number;
      cost?: number;
    };
    implementation: {
      difficulty: 'easy' | 'moderate' | 'hard';
      estimatedEffort: string;
      risks: string[];
      prerequisites: string[];
    };
  }[];
  
  performance: {
    currentMetrics: Record<string, number>;
    potentialMetrics: Record<string, number>;
    bottlenecks: {
      component: string;
      impact: 'low' | 'medium' | 'high';
      solution: string;
    }[];
  };
  
  costAnalysis: {
    currentCost: number;
    optimizedCost: number;
    savings: number;
    paybackPeriod?: string;
  };
}
