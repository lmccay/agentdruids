import {
  RealmId,
  AgentId,
  LeyLineId,
  RealmType,
  SecurityLevel,
  AgentType,
  Timestamp,
  BaseEntity,
  PerformanceMetrics,
  ResourceLimits,
  QuotaLimits
} from './Types';

/**
 * Tool policy configuration for realm-level access control
 */
export interface ToolPolicy {
  toolName: string;
  allowedOperations: string[];
  restrictedPaths?: string[];
  restrictedDomains?: string[];
  restrictedTables?: string[];
  requiresApproval: boolean;
  approvalWorkflow?: {
    approvers: string[];
    timeout: number;
    escalationPath: string[];
  };
  quotaLimits?: QuotaLimits;
  auditLevel: 'none' | 'basic' | 'detailed' | 'comprehensive';
}

/**
 * Realm configuration defining policies and constraints
 */
export interface RealmConfiguration {
  maxAgents: number;
  allowedAgentTypes: AgentType[];
  knowledgeNamespaces: string[];
  securityLevel: SecurityLevel;
  
  // Access control and security
  accessControl: {
    requireAuthentication: boolean;
    requireAuthorization: boolean;
    allowCrossRealmAccess: boolean;
    allowedOrigins?: string[];
    sessionTimeout?: number;
  };
  
  // Tool policies
  toolPolicies: {
    [toolName: string]: ToolPolicy;
  };
  
  // Resource management
  resourceLimits: ResourceLimits;
  quotaLimits: QuotaLimits;
  
  // Monitoring and alerting
  monitoring: {
    enabled: boolean;
    metricsCollection: boolean;
    alerting: boolean;
    auditLogging: boolean;
    performanceTracking: boolean;
  };
  
  // Networking and communication
  networking: {
    allowInbound: boolean;
    allowOutbound: boolean;
    allowedProtocols: string[];
    firewallRules?: {
      action: 'allow' | 'deny';
      source?: string;
      destination?: string;
      protocol?: string;
      port?: number;
    }[];
  };
  
  // Data retention and backup
  dataManagement: {
    retentionPolicy: {
      auditLogs: string;
      performanceMetrics: string;
      agentData: string;
      temporaryData: string;
    };
    backupPolicy: {
      enabled: boolean;
      frequency: 'hourly' | 'daily' | 'weekly';
      retention: number;
      compression: boolean;
      encryption: boolean;
    };
  };
}

/**
 * Realm usage statistics and current state
 */
export interface RealmUsage {
  agentCount: number;
  agentsByType: Record<AgentType, number>;
  activeAgents: number;
  resourceUtilization: {
    memoryUsedMB: number;
    memoryLimitMB: number;
    cpuUsedPercent: number;
    cpuLimitPercent: number;
    activeTasks: number;
    maxConcurrentTasks: number;
  };
  knowledgeQueries: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  toolOperations: {
    total: number;
    byTool: Record<string, number>;
    successful: number;
    failed: number;
    pendingApproval: number;
  };
  communicationStats: {
    internalMessages: number;
    externalMessages: number;
    leyLineTraffic: number;
    averageLatency: number;
  };
}

/**
 * Ley Line connection configuration for cross-realm communication
 */
export interface LeyLineConnection {
  id: LeyLineId;
  targetRealmId: RealmId;
  connectionType: 'bidirectional' | 'outbound' | 'inbound';
  protocol: 'http' | 'websocket' | 'mcp' | 'custom';
  
  // Security and authentication
  security: {
    encryptionEnabled: boolean;
    authenticationRequired: boolean;
    certificateRequired: boolean;
    sharedSecret?: string;
  };
  
  // Connection parameters
  endpoint: {
    host: string;
    port: number;
    path?: string;
    ssl: boolean;
  };
  
  // Performance and reliability
  performance: {
    maxBandwidthMbps?: number;
    maxConcurrentConnections?: number;
    timeoutSeconds: number;
    retryAttempts: number;
    healthCheckInterval: number;
  };
  
  // Access control
  permissions: {
    allowedAgentTypes: AgentType[];
    allowedOperations: string[];
    knowledgeNamespaceAccess: string[];
    toolAccess: string[];
  };
  
  // Status and monitoring
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  lastConnected?: Timestamp;
  errorCount: number;
  performanceMetrics: PerformanceMetrics;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Main Realm interface representing isolated environments for agents
 */
export interface Realm extends BaseEntity {
  id: RealmId;
  name: string;
  description: string;
  type: RealmType;
  status: 'active' | 'inactive' | 'suspended' | 'maintenance' | 'error';
  
  // Configuration and policies
  configuration: RealmConfiguration;

  // MCP Server Access
  // Array of MCP server IDs that this realm has access to
  // Example: ["github", "jira", "slack"]
  mcpServers?: string[];

  // Agent management
  agents: AgentId[];
  agentLimits: {
    [agentType in AgentType]?: number;
  };
  
  // Cross-realm connections
  leyLineConnections: LeyLineConnection[];
  
  // Current usage and statistics
  usage: RealmUsage;
  
  // Health and monitoring
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    lastHealthCheck: Timestamp;
    issues: {
      severity: 'low' | 'medium' | 'high' | 'critical';
      type: string;
      description: string;
      detected: Timestamp;
      resolved?: Timestamp;
    }[];
    uptime: {
      current: number;
      availability: number;
      mtbf: number; // Mean Time Between Failures
      mttr: number; // Mean Time To Recovery
    };
  };
  
  // Security and compliance
  security: {
    lastSecurityScan?: Timestamp;
    securityScore: number;
    vulnerabilities: {
      severity: 'low' | 'medium' | 'high' | 'critical';
      type: string;
      description: string;
      mitigation?: string;
      discovered: Timestamp;
    }[];
    complianceStatus: {
      [standard: string]: 'compliant' | 'non-compliant' | 'unknown';
    };
  };
  
  // Metadata and lifecycle
  tags: string[];
  metadata: Record<string, any>;
  parentRealmId?: RealmId;
  childRealmIds: RealmId[];
  
  // Audit and history
  lifecycle: {
    created: Timestamp;
    activated?: Timestamp;
    lastModified: Timestamp;
    lastSuspended?: Timestamp;
    lastMaintenance?: Timestamp;
  };
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Request to create a new realm
 */
export interface CreateRealmRequest {
  id?: RealmId;
  name: string;
  description: string;
  type: RealmType;
  configuration: RealmConfiguration;
  agentLimits?: { [agentType in AgentType]?: number };
  leyLineConnections?: Partial<LeyLineConnection>[];
  tags?: string[];
  metadata?: Record<string, any>;
  parentRealmId?: RealmId;
}

/**
 * Request to update realm configuration
 */
export interface UpdateRealmRequest {
  name?: string;
  description?: string;
  configuration?: Partial<RealmConfiguration>;
  agentLimits?: { [agentType in AgentType]?: number };
  tags?: string[];
  metadata?: Record<string, any>;
  status?: 'active' | 'inactive' | 'suspended' | 'maintenance';
}

/**
 * Realm query filters for searching and listing
 */
export interface RealmQueryFilters {
  type?: RealmType | RealmType[];
  status?: string | string[];
  securityLevel?: SecurityLevel | SecurityLevel[];
  agentTypes?: AgentType[];
  tags?: string[];
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
  parentRealmId?: RealmId;
  hasLeyLines?: boolean;
  createdAfter?: Timestamp;
  createdBefore?: Timestamp;
}

/**
 * Realm summary for list views
 */
export interface RealmSummary {
  id: RealmId;
  name: string;
  type: RealmType;
  status: string;
  agentCount: number;
  maxAgents: number;
  health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  securityLevel: SecurityLevel;
  leyLineCount: number;
  lastActivity?: Timestamp;
  utilizationPercent: number;
}

/**
 * Realm statistics for monitoring and analytics
 */
export interface RealmStatistics {
  realmId: RealmId;
  timeRange: {
    start: Timestamp;
    end: Timestamp;
  };
  
  // Agent statistics
  agents: {
    totalCount: number;
    activeCount: number;
    averageUtilization: number;
    taskThroughput: number;
    errorRate: number;
  };
  
  // Resource utilization
  resources: {
    averageMemoryUsage: number;
    peakMemoryUsage: number;
    averageCpuUsage: number;
    peakCpuUsage: number;
    utilizationTrend: 'increasing' | 'stable' | 'decreasing';
  };
  
  // Communication and connectivity
  communication: {
    internalMessages: number;
    externalMessages: number;
    leyLineTraffic: number;
    averageLatency: number;
    errorRate: number;
  };
  
  // Security and compliance
  security: {
    securityEvents: number;
    approvalRequests: number;
    accessViolations: number;
    auditEvents: number;
  };
  
  // Performance metrics
  performance: {
    availability: number;
    responseTime: number;
    throughput: number;
    errorRate: number;
    scalabilityMetrics: Record<string, number>;
  };
}

/**
 * Realm capacity planning information
 */
export interface RealmCapacityPlan {
  realmId: RealmId;
  currentCapacity: {
    agents: number;
    memory: number;
    cpu: number;
    storage: number;
    network: number;
  };
  projectedGrowth: {
    timeframe: string;
    expectedAgents: number;
    expectedMemory: number;
    expectedCpu: number;
    growthRate: number;
  };
  recommendations: {
    scaling: {
      component: string;
      action: 'increase' | 'optimize' | 'redistribute';
      timeline: string;
      cost: number;
      benefit: string;
    }[];
    optimization: {
      area: string;
      opportunity: string;
      impact: 'low' | 'medium' | 'high';
      implementation: string;
    }[];
  };
  constraints: {
    technical: string[];
    budgetary: string[];
    regulatory: string[];
    operational: string[];
  };
}

/**
 * Realm disaster recovery configuration
 */
export interface RealmDisasterRecovery {
  realmId: RealmId;
  backupStrategy: {
    frequency: string;
    retention: string;
    locations: string[];
    encryption: boolean;
    compression: boolean;
  };
  recoveryPlan: {
    rto: number; // Recovery Time Objective
    rpo: number; // Recovery Point Objective
    steps: {
      order: number;
      action: string;
      estimatedTime: number;
      dependencies: string[];
    }[];
    testSchedule: string;
    lastTested?: Timestamp;
  };
  redundancy: {
    enabled: boolean;
    strategy: 'active-passive' | 'active-active' | 'multi-master';
    failoverTime: number;
    dataReplication: boolean;
  };
}
