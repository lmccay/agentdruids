import {
  LeyLineId,
  RealmId,
  AgentId,
  Timestamp,
  BaseEntity,
  CommunicationProtocol,
  AgentType,
  AlertSeverity
} from './Types';

/**
 * Connection endpoint configuration
 */
export interface ConnectionEndpoint {
  host: string;
  port: number;
  path?: string;
  protocol: 'http' | 'https' | 'ws' | 'wss' | 'tcp' | 'udp';
  ssl: boolean;
  region?: string;
  datacenter?: string;
}

/**
 * Security configuration for ley line connections
 */
export interface LeyLineSecurity {
  encryptionEnabled: boolean;
  encryptionAlgorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305' | 'RSA-4096';
  authenticationRequired: boolean;
  authenticationMethod: 'shared-secret' | 'certificate' | 'oauth' | 'api-key';
  certificateRequired: boolean;
  certificatePath?: string;
  sharedSecret?: string;
  keyRotationPolicy: {
    enabled: boolean;
    intervalDays: number;
    automaticRotation: boolean;
    lastRotation?: Timestamp;
  };
  accessControl: {
    allowedOrigins: string[];
    blockedOrigins: string[];
    rateLimiting: {
      requestsPerSecond: number;
      burstLimit: number;
      windowSizeSeconds: number;
    };
  };
}

/**
 * Quality of Service (QoS) configuration
 */
export interface QualityOfService {
  priority: 'low' | 'medium' | 'high' | 'critical';
  bandwidth: {
    guaranteedMbps: number;
    maxMbps: number;
    burstable: boolean;
  };
  latency: {
    maxLatencyMs: number;
    jitterToleranceMs: number;
    priorityTraffic: string[];
  };
  reliability: {
    maxPacketLoss: number;
    retransmissionEnabled: boolean;
    acknowledgmentRequired: boolean;
  };
  resilience: {
    circuitBreakerEnabled: boolean;
    failureThreshold: number;
    recoveryTimeMs: number;
    fallbackBehavior: 'queue' | 'drop' | 'redirect';
  };
}

/**
 * Traffic routing and load balancing configuration
 */
export interface TrafficRouting {
  loadBalancing: {
    algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'hash-based';
    weights?: Record<string, number>;
    healthCheckEnabled: boolean;
    healthCheckPath?: string;
    healthCheckInterval: number;
  };
  routing: {
    rules: {
      condition: string;
      action: 'forward' | 'redirect' | 'block';
      target?: string;
      priority: number;
    }[];
    defaultRoute: string;
    stickySessionEnabled: boolean;
  };
  caching: {
    enabled: boolean;
    ttlSeconds: number;
    cacheSize: string;
    invalidationRules: string[];
  };
}

/**
 * Message routing and transformation configuration
 */
export interface MessageRouting {
  routingRules: {
    messageType: string;
    sourceAgentType?: AgentType;
    targetAgentType?: AgentType;
    condition?: string;
    transformation?: {
      enabled: boolean;
      transformationType: 'format' | 'protocol' | 'content' | 'security';
      transformationScript?: string;
    };
    priority: number;
    timeout: number;
  }[];
  messageQueue: {
    enabled: boolean;
    queueType: 'fifo' | 'lifo' | 'priority' | 'round-robin';
    maxQueueSize: number;
    persistenceEnabled: boolean;
    deadLetterQueue: boolean;
  };
  deliveryGuarantees: {
    deliveryMode: 'at-most-once' | 'at-least-once' | 'exactly-once';
    acknowledgmentRequired: boolean;
    retryPolicy: {
      maxRetries: number;
      retryDelayMs: number;
      exponentialBackoff: boolean;
    };
  };
}

/**
 * Ley line monitoring and alerting configuration
 */
export interface LeyLineMonitoring {
  metricsCollection: {
    enabled: boolean;
    interval: number;
    metrics: string[];
    retention: string;
  };
  healthChecks: {
    enabled: boolean;
    interval: number;
    timeout: number;
    endpoints: string[];
    failureThreshold: number;
    successThreshold: number;
  };
  alerting: {
    enabled: boolean;
    rules: {
      metric: string;
      threshold: number;
      operator: 'gt' | 'lt' | 'eq' | 'ne';
      severity: AlertSeverity;
      duration: number;
      actions: string[];
    }[];
    notificationChannels: string[];
    escalationPolicy: {
      levels: {
        level: number;
        delay: number;
        recipients: string[];
      }[];
    };
  };
  tracing: {
    enabled: boolean;
    samplingRate: number;
    traceRetention: string;
    distributedTracing: boolean;
  };
}

/**
 * Ley line performance statistics
 */
export interface LeyLinePerformance {
  connectionMetrics: {
    totalConnections: number;
    activeConnections: number;
    failedConnections: number;
    connectionRate: number;
    averageConnectionTime: number;
  };
  throughputMetrics: {
    messagesPerSecond: number;
    bytesPerSecond: number;
    peakThroughput: number;
    averageThroughput: number;
  };
  latencyMetrics: {
    averageLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    maxLatency: number;
  };
  reliabilityMetrics: {
    uptime: number;
    availability: number;
    errorRate: number;
    packetLoss: number;
    retransmissionRate: number;
  };
  resourceMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    networkUtilization: number;
    queueDepth: number;
  };
}

/**
 * Main LeyLineConnection interface for cross-realm communication
 */
export interface LeyLineConnection extends BaseEntity {
  id: LeyLineId;
  name: string;
  description: string;
  
  // Connection configuration
  sourceRealmId: RealmId;
  targetRealmId: RealmId;
  connectionType: 'bidirectional' | 'outbound' | 'inbound';
  protocol: CommunicationProtocol;
  
  // Network configuration
  endpoints: {
    primary: ConnectionEndpoint;
    secondary?: ConnectionEndpoint;
    failover?: ConnectionEndpoint[];
  };
  
  // Security and authentication
  security: LeyLineSecurity;
  
  // Quality of Service
  qos: QualityOfService;
  
  // Traffic management
  routing: TrafficRouting;
  messageRouting: MessageRouting;
  
  // Monitoring and observability
  monitoring: LeyLineMonitoring;
  
  // Access control and permissions
  permissions: {
    allowedAgentTypes: AgentType[];
    allowedOperations: string[];
    knowledgeNamespaceAccess: string[];
    toolAccess: string[];
    timeRestrictions?: {
      allowedHours: string;
      timezone: string;
      blackoutPeriods: {
        start: Timestamp;
        end: Timestamp;
        reason: string;
      }[];
    };
  };
  
  // Current status and state
  status: 'active' | 'inactive' | 'error' | 'maintenance' | 'suspended';
  connectionState: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'failed';
  lastConnected?: Timestamp;
  lastDisconnected?: Timestamp;
  errorCount: number;
  lastError?: {
    timestamp: Timestamp;
    message: string;
    code: string;
    severity: AlertSeverity;
  };
  
  // Performance and statistics
  performance: LeyLinePerformance;
  
  // Traffic statistics
  trafficStats: {
    totalMessages: number;
    totalBytes: number;
    messagesPerHour: number;
    bytesPerHour: number;
    lastActivity: Timestamp;
    peakTrafficTime?: Timestamp;
    trafficPatterns: {
      hourly: number[];
      daily: number[];
      weekly: number[];
    };
  };
  
  // Capacity and scaling
  capacity: {
    maxConcurrentConnections: number;
    currentConnections: number;
    maxThroughputMbps: number;
    currentUtilization: number;
    scalingPolicy: {
      enabled: boolean;
      minConnections: number;
      maxConnections: number;
      scaleUpThreshold: number;
      scaleDownThreshold: number;
      cooldownPeriod: number;
    };
  };
  
  // Compliance and audit
  compliance: {
    dataResidency: string[];
    complianceStandards: string[];
    auditLogEnabled: boolean;
    dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
    retentionPolicy: string;
  };
  
  // Metadata and lifecycle
  tags: string[];
  metadata: Record<string, any>;
  
  // Lifecycle information
  lifecycle: {
    provisioned: Timestamp;
    activated?: Timestamp;
    lastMaintenance?: Timestamp;
    scheduledMaintenance?: Timestamp;
    decommissionScheduled?: Timestamp;
  };
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Request to create a new ley line connection
 */
export interface CreateLeyLineRequest {
  id?: LeyLineId;
  name: string;
  description: string;
  sourceRealmId: RealmId;
  targetRealmId: RealmId;
  connectionType: 'bidirectional' | 'outbound' | 'inbound';
  protocol: CommunicationProtocol;
  endpoints: {
    primary: ConnectionEndpoint;
    secondary?: ConnectionEndpoint;
  };
  security: LeyLineSecurity;
  qos?: Partial<QualityOfService>;
  permissions: {
    allowedAgentTypes: AgentType[];
    allowedOperations: string[];
    knowledgeNamespaceAccess: string[];
    toolAccess: string[];
  };
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Request to update ley line configuration
 */
export interface UpdateLeyLineRequest {
  name?: string;
  description?: string;
  endpoints?: {
    primary?: Partial<ConnectionEndpoint>;
    secondary?: Partial<ConnectionEndpoint>;
  };
  security?: Partial<LeyLineSecurity>;
  qos?: Partial<QualityOfService>;
  permissions?: Partial<{
    allowedAgentTypes: AgentType[];
    allowedOperations: string[];
    knowledgeNamespaceAccess: string[];
    toolAccess: string[];
  }>;
  status?: 'active' | 'inactive' | 'maintenance' | 'suspended';
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Ley line connection test result
 */
export interface LeyLineTestResult {
  leyLineId: LeyLineId;
  testType: 'connectivity' | 'performance' | 'security' | 'failover' | 'load';
  testTimestamp: Timestamp;
  success: boolean;
  duration: number;
  
  results: {
    connectivity: {
      canConnect: boolean;
      connectionTime: number;
      dnsResolution: boolean;
      sslHandshake?: boolean;
    };
    performance: {
      latency: number;
      throughput: number;
      packetLoss: number;
      jitter: number;
    };
    security: {
      encryptionWorking: boolean;
      authenticationSuccessful: boolean;
      certificateValid?: boolean;
      accessControlEnforced: boolean;
    };
  };
  
  issues: {
    severity: AlertSeverity;
    component: string;
    description: string;
    recommendation: string;
  }[];
  
  recommendations: string[];
}

/**
 * Ley line capacity planning information
 */
export interface LeyLineCapacityPlan {
  leyLineId: LeyLineId;
  currentCapacity: {
    bandwidth: number;
    connections: number;
    throughput: number;
    utilization: number;
  };
  projectedUsage: {
    timeframe: string;
    expectedBandwidth: number;
    expectedConnections: number;
    expectedThroughput: number;
    growthRate: number;
  };
  bottlenecks: {
    component: string;
    currentLimit: number;
    projectedLimit: number;
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string;
  }[];
  recommendations: {
    upgrade: {
      component: string;
      action: string;
      cost: number;
      benefit: string;
      timeline: string;
    }[];
    optimization: {
      area: string;
      opportunity: string;
      implementation: string;
      impact: 'low' | 'medium' | 'high';
    }[];
  };
}

/**
 * Cross-realm message for ley line communication
 */
export interface CrossRealmMessage {
  id: string;
  leyLineId: LeyLineId;
  sourceRealmId: RealmId;
  targetRealmId: RealmId;
  sourceAgentId?: AgentId;
  targetAgentId?: AgentId;
  
  // Message content
  messageType: string;
  payload: any;
  headers: Record<string, string>;
  
  // Routing and delivery
  priority: 'low' | 'medium' | 'high' | 'critical';
  deliveryMode: 'fire-and-forget' | 'acknowledged' | 'transactional';
  timeout: number;
  retryCount: number;
  
  // Security and compliance
  encrypted: boolean;
  signed: boolean;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  
  // Tracking and audit
  traceId: string;
  spanId: string;
  correlationId?: string;
  
  // Timestamps
  createdAt: Timestamp;
  sentAt?: Timestamp;
  receivedAt?: Timestamp;
  processedAt?: Timestamp;
  
  // Status and errors
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'timeout';
  errorMessage?: string;
  deliveryAttempts: number;
}
