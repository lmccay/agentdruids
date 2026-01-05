import {
  ExecutionId,
  WorkflowId,
  RealmId,
  AgentId,
  TaskStatus,
  ExecutionStatus,
  Timestamp,
  BaseEntity,
  PerformanceMetrics,
  AlertSeverity
} from './Types';

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: 'task' | 'decision' | 'parallel' | 'loop' | 'wait' | 'approval' | 'notification';
  
  // Step configuration
  configuration: Record<string, any>;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier?: number;
    retryableErrors?: string[];
  };
  
  // Control flow
  conditions?: {
    type: 'expression' | 'script' | 'agent-decision';
    condition: string;
    successPath?: string;
    failurePath?: string;
    branches?: {
      condition: string;
      target: string;
    }[];
  };
  
  // Input/Output mapping
  inputs?: {
    name: string;
    source: string; // Reference to previous step output or workflow input
    transformation?: string;
    required: boolean;
  }[];
  
  outputs?: {
    name: string;
    type: string;
    description?: string;
    validation?: string;
  }[];
  
  // Dependencies and ordering
  dependencies: string[];
  successors: string[];
  
  // Agent assignment
  agentConstraints?: {
    requiredCapabilities: string[];
    agentType?: string;
    preferredAgents?: AgentId[];
    excludedAgents?: AgentId[];
    loadBalancing?: 'round-robin' | 'least-loaded' | 'capability-based';
  };
  
  // Monitoring and alerting
  monitoring?: {
    enabled: boolean;
    metrics: string[];
    thresholds: Record<string, number>;
    alerts: {
      condition: string;
      severity: AlertSeverity;
      message: string;
    }[];
  };
  
  // Error handling
  errorHandling?: {
    strategy: 'fail-fast' | 'continue' | 'retry' | 'skip' | 'compensate';
    compensationSteps?: string[];
    fallbackValue?: any;
  };
}

/**
 * Workflow definition
 */
export interface Workflow extends BaseEntity {
  id: WorkflowId;
  name: string;
  description: string;
  workflowVersion: string;
  realmId: RealmId;
  
  // Workflow structure
  steps: WorkflowStep[];
  startStep: string;
  endSteps: string[];
  
  // Input/Output schema
  inputSchema?: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      required?: boolean;
      default?: any;
      validation?: any;
    }>;
    required?: string[];
  };
  
  outputSchema?: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
    }>;
  };
  
  // Workflow configuration
  configuration: {
    maxExecutionTime: number;
    maxSteps?: number;
    allowConcurrentExecutions: boolean;
    maxConcurrentExecutions?: number;
    
    // Error handling
    defaultErrorHandling: 'fail-fast' | 'continue-on-error' | 'skip-failed-steps';
    globalRetryPolicy?: {
      enabled: boolean;
      maxRetries: number;
      retryDelay: number;
    };
    
    // Persistence and state
    persistState: boolean;
    stateCheckpoints: boolean;
    stateRetention: string; // Duration to keep execution state
    
    // Security and isolation
    isolation: 'none' | 'process' | 'container' | 'vm';
    securityContext?: {
      runAsUser?: string;
      runAsGroup?: string;
      capabilities?: string[];
      seLinuxOptions?: Record<string, string>;
    };
    
    // Resource limits
    resourceLimits?: {
      maxMemoryMB: number;
      maxCpuPercent: number;
      maxDiskMB?: number;
      maxNetworkMbps?: number;
    };
    
    // Monitoring and observability
    monitoring: {
      enabled: boolean;
      stepTracking: boolean;
      performanceMetrics: boolean;
      customMetrics?: string[];
    };
    
    // Notifications
    notifications: {
      onStart: boolean;
      onCompletion: boolean;
      onFailure: boolean;
      onLongRunning: boolean;
      channels: string[];
    };
  };
  
  // Metadata and classification
  category: string;
  tags: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  estimatedDuration: number;
  
  // Requirements
  requirements: {
    requiredAgents: {
      type: string;
      count: number;
      capabilities: string[];
    }[];
    requiredResources: {
      memoryMB: number;
      cpuCores: number;
      storage?: string;
      network?: string;
    };
    requiredPermissions: string[];
  };
  
  // Lifecycle and status
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  isTemplate: boolean;
  
  // Versioning and relationships
  parentWorkflowId?: WorkflowId;
  derivedWorkflows: WorkflowId[];
  
  // Usage statistics
  usage: {
    executionCount: number;
    successCount: number;
    failureCount: number;
    averageExecutionTime: number;
    lastExecuted?: Timestamp;
  };
  
  // Validation
  validation: {
    isValidated: boolean;
    validatedBy?: string;
    validationDate?: Timestamp;
    validationResults?: {
      passed: boolean;
      issues: string[];
      warnings: string[];
    };
  };
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Workflow step execution state
 */
export interface StepExecution {
  stepId: string;
  executionId: string;
  attemptNumber: number;
  
  // Execution status and timing
  status: TaskStatus;
  startTime?: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  
  // Agent assignment
  assignedAgentId?: AgentId;
  agentSelection: {
    selectionTime: Timestamp;
    selectionReason: string;
    alternativeAgents?: AgentId[];
  };
  
  // Input/Output data
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  intermediateResults?: {
    timestamp: Timestamp;
    data: Record<string, any>;
  }[];
  
  // Progress and performance
  progress: number;
  performanceMetrics?: PerformanceMetrics;
  resourceUsage?: {
    memoryMB: number;
    cpuPercent: number;
    diskMB: number;
    networkBytes: number;
  };
  
  // Error handling
  errors?: {
    timestamp: Timestamp;
    type: string;
    message: string;
    stack?: string;
    retryable: boolean;
    handled: boolean;
  }[];
  
  // Retry information
  retryCount: number;
  nextRetryAt?: Timestamp;
  retryHistory: {
    attempt: number;
    timestamp: Timestamp;
    duration: number;
    status: TaskStatus;
    error?: string;
  }[];
  
  // Decision path (for decision steps)
  decisionPath?: {
    condition: string;
    result: boolean;
    nextStep: string;
    evaluationTime: Timestamp;
  };
  
  // Approval information (for approval steps)
  approval?: {
    requestedAt: Timestamp;
    requestedBy: string;
    approvers: string[];
    approvedBy?: string;
    approvedAt?: Timestamp;
    rejectedBy?: string;
    rejectedAt?: Timestamp;
    rejectionReason?: string;
    comments?: string;
  };
  
  // Audit trail
  auditTrail: {
    timestamp: Timestamp;
    event: string;
    details: Record<string, any>;
    actor: string;
    actorType: 'user' | 'agent' | 'system';
  }[];
}

/**
 * Complete workflow execution state
 */
export interface WorkflowExecution extends BaseEntity {
  id: ExecutionId;
  workflowId: WorkflowId;
  realmId: RealmId;
  
  // Execution metadata
  name: string;
  description?: string;
  triggeredBy: string;
  triggerType: 'manual' | 'scheduled' | 'event' | 'api' | 'webhook';
  triggerData?: Record<string, any>;
  
  // Execution status and timing
  status: ExecutionStatus;
  startTime?: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  estimatedCompletion?: Timestamp;
  
  // Progress tracking
  overallProgress: number;
  currentStep?: string;
  completedSteps: string[];
  pendingSteps: string[];
  
  // Step executions
  steps: StepExecution[];
  executionPath: {
    stepId: string;
    timestamp: Timestamp;
    pathReason?: string;
  }[];
  
  // Input/Output data
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  context: Record<string, any>; // Shared context across steps
  
  // Resource allocation and usage
  allocatedResources: {
    agents: AgentId[];
    memoryMB: number;
    cpuCores: number;
  };
  
  resourceUsage: {
    peakMemoryMB: number;
    averageCpuPercent: number;
    totalDiskMB: number;
    totalNetworkBytes: number;
    agentUtilization: Record<AgentId, number>;
  };
  
  // Performance metrics
  performance: {
    executionTime: number;
    stepCount: number;
    successfulSteps: number;
    failedSteps: number;
    skippedSteps: number;
    retriedSteps: number;
    averageStepTime: number;
    efficiency: number;
  };
  
  // Error tracking and handling
  errors: {
    timestamp: Timestamp;
    step: string;
    agent?: AgentId;
    type: string;
    message: string;
    severity: AlertSeverity;
    handled: boolean;
    resolution?: string;
  }[];
  
  // Compensation and rollback
  compensation?: {
    initiated: Timestamp;
    reason: string;
    status: 'in-progress' | 'completed' | 'failed';
    compensationSteps: {
      stepId: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      startTime?: Timestamp;
      endTime?: Timestamp;
      error?: string;
    }[];
  };
  
  // State management
  state: {
    checkpoints: {
      stepId: string;
      timestamp: Timestamp;
      state: Record<string, any>;
      size: number;
    }[];
    lastCheckpoint?: Timestamp;
    stateSize: number;
  };
  
  // Monitoring and alerts
  alerts: {
    id: string;
    type: 'performance' | 'error' | 'timeout' | 'resource' | 'security';
    severity: AlertSeverity;
    message: string;
    timestamp: Timestamp;
    step?: string;
    resolved?: Timestamp;
    acknowledgements: {
      by: string;
      timestamp: Timestamp;
    }[];
  }[];
  
  // Configuration used for this execution
  configuration: {
    workflowConfiguration: any;
    overrides?: Record<string, any>;
    parameters?: Record<string, any>;
  };
  
  // Approval and governance
  approvals: {
    stepId: string;
    type: 'pre-execution' | 'post-execution' | 'on-error';
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    requestedAt: Timestamp;
    requestedBy: string;
    approvers: string[];
    approvedBy?: string;
    approvedAt?: Timestamp;
    rejectedBy?: string;
    rejectedAt?: Timestamp;
    expiresAt?: Timestamp;
    comments?: string;
  }[];
  
  // Audit and compliance
  auditTrail: {
    timestamp: Timestamp;
    event: string;
    details: Record<string, any>;
    actor: string;
    actorType: 'user' | 'agent' | 'system';
    ipAddress?: string;
    userAgent?: string;
  }[];
  
  // Metadata
  tags: string[];
  metadata: Record<string, any>;
  
  // Parent/child executions
  parentExecutionId?: ExecutionId;
  childExecutions: ExecutionId[];
}

/**
 * Request to create a workflow
 */
export interface CreateWorkflowRequest {
  name: string;
  description: string;
  realmId: RealmId;
  steps: Omit<WorkflowStep, 'id'>[];
  startStep: string;
  endSteps: string[];
  inputSchema?: any;
  outputSchema?: any;
  configuration: Workflow['configuration'];
  category: string;
  tags?: string[];
  complexity?: 'simple' | 'moderate' | 'complex' | 'expert';
  isTemplate?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Request to execute a workflow
 */
export interface ExecuteWorkflowRequest {
  workflowId: WorkflowId;
  realmId?: RealmId;
  name?: string;
  description?: string;
  inputs?: Record<string, any>;
  context?: Record<string, any>;
  overrides?: {
    configuration?: Record<string, any>;
    stepConfiguration?: Record<string, Record<string, any>>;
    agentAssignments?: Record<string, AgentId>;
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
 * Workflow execution progress update
 */
export interface WorkflowProgress {
  executionId: ExecutionId;
  timestamp: Timestamp;
  overallProgress: number;
  
  currentStep: {
    stepId: string;
    name: string;
    progress: number;
    status: TaskStatus;
    startTime?: Timestamp;
    estimatedCompletion?: Timestamp;
  };
  
  stepProgress: {
    stepId: string;
    progress: number;
    status: TaskStatus;
    agentId?: AgentId;
    startTime?: Timestamp;
    duration?: number;
  }[];
  
  pathHistory: {
    stepId: string;
    timestamp: Timestamp;
    pathReason?: string;
  }[];
  
  metrics: {
    stepsCompleted: number;
    stepsRemaining: number;
    averageStepTime: number;
    estimatedTimeRemaining: number;
    efficiency: number;
  };
  
  resourceUsage: {
    currentMemoryMB: number;
    currentCpuPercent: number;
    peakMemoryMB: number;
    averageCpuPercent: number;
  };
}

/**
 * Workflow template for reusable patterns
 */
export interface WorkflowTemplate extends BaseEntity {
  id: string;
  name: string;
  description: string;
  category: string;
  templateVersion: string;
  
  // Template structure
  baseWorkflow: Omit<Workflow, 'id' | 'realmId' | 'createdAt' | 'updatedAt' | 'version'>;
  
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
  
  // Usage examples
  examples: {
    name: string;
    description: string;
    parameters: Record<string, any>;
    expectedResults: string;
  }[];
  
  // Compatibility
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
 * Workflow optimization analysis
 */
export interface WorkflowOptimization {
  workflowId: WorkflowId;
  analysisDate: Timestamp;
  
  recommendations: {
    type: 'step-parallelization' | 'resource-optimization' | 'timeout-tuning' | 'path-optimization' | 'error-handling';
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
    benchmarkMetrics: Record<string, number>;
    bottlenecks: {
      step: string;
      impact: 'low' | 'medium' | 'high';
      solution: string;
    }[];
  };
  
  pathAnalysis: {
    commonPaths: {
      path: string[];
      frequency: number;
      averageTime: number;
    }[];
    unusedSteps: string[];
    deadEnds: string[];
    loops: {
      steps: string[];
      averageIterations: number;
      maxIterations: number;
    }[];
  };
  
  resourceAnalysis: {
    utilizationByStep: Record<string, {
      memoryMB: number;
      cpuPercent: number;
      duration: number;
    }>;
    resourceWaste: {
      step: string;
      waste: number;
      recommendation: string;
    }[];
    scalabilityLimits: {
      component: string;
      limit: number;
      impact: string;
    }[];
  };
}
