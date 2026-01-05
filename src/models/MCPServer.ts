import {
  AgentId,
  RealmId,
  Timestamp,
  BaseEntity,
  ToolOperation,
  SecurityLevel,
  ApprovalId
} from './Types';

/**
 * MCP tool definition and configuration
 */
export interface MCPTool {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: any[];
      default?: any;
      required?: boolean;
    }>;
    required?: string[];
  };
  
  // Tool metadata
  category: string;
  tags: string[];
  version: string;
  
  // Security and access control
  permissions: {
    operations: ToolOperation[];
    securityLevel: SecurityLevel;
    requiresApproval: boolean;
    approvalPolicy?: {
      requiredApprovers: number;
      timeoutMinutes: number;
      escalationPolicy?: {
        timeoutMinutes: number;
        escalateTo: string[];
      };
    };
  };
  
  // Usage constraints
  constraints?: {
    rateLimit?: {
      maxRequests: number;
      windowSeconds: number;
      burstLimit?: number;
    };
    
    resourceLimits?: {
      maxMemoryMB: number;
      maxCpuPercent: number;
      maxExecutionSeconds: number;
    };
    
    dataLimits?: {
      maxInputSize: number;
      maxOutputSize: number;
      allowedMimeTypes?: string[];
    };
    
    networkAccess?: {
      allowed: boolean;
      allowedHosts?: string[];
      deniedHosts?: string[];
      allowedPorts?: number[];
    };
  };
  
  // Monitoring and observability
  monitoring: {
    enabled: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    metricsCollection: boolean;
    performanceTracking: boolean;
  };
  
  // Error handling
  errorHandling?: {
    retryPolicy?: {
      maxRetries: number;
      retryDelay: number;
      backoffMultiplier?: number;
      retryableErrors?: string[];
    };
    
    fallbackBehavior?: 'fail' | 'return-default' | 'return-error' | 'delegate';
    fallbackValue?: any;
  };
  
  // Implementation details
  implementation?: {
    endpoint?: string;
    method?: string;
    headers?: Record<string, string>;
    authentication?: {
      type: 'none' | 'api-key' | 'oauth' | 'basic' | 'bearer';
      credentials?: Record<string, string>;
    };
  };
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  
  // Resource metadata
  size?: number;
  checksum?: string;
  lastModified?: Timestamp;
  version?: string;
  
  // Access control
  permissions: {
    read: boolean;
    write: boolean;
    delete: boolean;
    execute: boolean;
  };
  
  // Caching and optimization
  caching?: {
    enabled: boolean;
    ttlSeconds: number;
    maxSize?: number;
    compression?: boolean;
  };
  
  // Validation
  validation?: {
    schema?: any;
    checksumValidation: boolean;
    sizeValidation: boolean;
  };
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  // Server identity
  name: string;
  version: string;
  description?: string;
  
  // Connection settings
  transport: {
    type: 'stdio' | 'sse' | 'websocket' | 'http';
    
    // HTTP/WebSocket specific
    host?: string;
    port?: number;
    path?: string;
    
    // Security
    tls?: {
      enabled: boolean;
      certificatePath?: string;
      keyPath?: string;
      caCertificatePath?: string;
      selfSigned?: boolean;
    };
    
    // Authentication
    authentication?: {
      type: 'none' | 'api-key' | 'oauth' | 'basic' | 'bearer' | 'mutual-tls';
      credentials?: Record<string, string>;
      tokenRefresh?: {
        enabled: boolean;
        refreshEndpoint: string;
        refreshInterval: number;
      };
    };
  };
  
  // Protocol settings
  protocol: {
    version: string;
    compression?: 'gzip' | 'deflate' | 'brotli';
    keepAlive: boolean;
    heartbeatInterval?: number;
    maxMessageSize?: number;
    timeout: number;
  };
  
  // Capability declarations
  capabilities: {
    tools?: {
      listChanged?: boolean;
    };
    resources?: {
      subscribe?: boolean;
      listChanged?: boolean;
    };
    prompts?: {
      listChanged?: boolean;
    };
    logging?: {
      level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    };
  };
  
  // Server limits and quotas
  limits: {
    maxConcurrentConnections: number;
    maxRequestsPerMinute: number;
    maxRequestSize: number;
    maxResponseSize: number;
    maxSessionDuration: number;
  };
  
  // Monitoring and observability
  monitoring: {
    enabled: boolean;
    metricsEndpoint?: string;
    healthCheckEndpoint?: string;
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    structuredLogging: boolean;
  };
  
  // Error handling
  errorHandling: {
    includeStackTrace: boolean;
    maxErrorDetails: number;
    errorCodes: Record<string, {
      code: number;
      message: string;
      retryable: boolean;
    }>;
  };
  
  // Security settings
  security: {
    securityLevel: SecurityLevel;
    allowedOrigins?: string[];
    corsEnabled: boolean;
    rateLimiting: {
      enabled: boolean;
      requestsPerMinute: number;
      burstLimit: number;
      whitelistedIPs?: string[];
    };
    
    inputValidation: {
      enabled: boolean;
      maxDepth: number;
      allowedTypes: string[];
      sanitization: boolean;
    };
  };
}

/**
 * MCP server implementation
 */
export interface MCPServer extends BaseEntity {
  id: string;
  name: string;
  description: string;
  serverVersion: string;
  realmId: RealmId;
  
  // Server configuration
  config: MCPServerConfig;
  
  // Available tools and resources
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: {
    name: string;
    description?: string;
    arguments?: {
      name: string;
      description?: string;
      required?: boolean;
    }[];
  }[];
  
  // Server status and health
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'maintenance';
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: Timestamp;
    checks: {
      name: string;
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      duration?: number;
    }[];
  };
  
  // Connection management
  connections: {
    active: number;
    total: number;
    maxConcurrent: number;
    clients: {
      id: string;
      connectedAt: Timestamp;
      lastActivity: Timestamp;
      requestCount: number;
      userAgent?: string;
      ipAddress?: string;
    }[];
  };
  
  // Performance metrics
  performance: {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    uptime: number;
    lastRestart?: Timestamp;
    
    // Resource usage
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    
    cpuUsage: {
      percentage: number;
      loadAverage: number[];
    };
    
    // Request statistics
    requestStats: {
      method: string;
      count: number;
      averageTime: number;
      errorCount: number;
    }[];
  };
  
  // Access control and security
  accessControl: {
    allowedAgents: AgentId[];
    deniedAgents: AgentId[];
    allowedRoles: string[];
    deniedRoles: string[];
    
    // IP-based access control
    ipWhitelist?: string[];
    ipBlacklist?: string[];
    
    // API key management
    apiKeys: {
      id: string;
      name: string;
      keyHash: string; // Hashed version of the key
      permissions: string[];
      expiresAt?: Timestamp;
      lastUsed?: Timestamp;
      isActive: boolean;
    }[];
  };
  
  // Deployment and infrastructure
  deployment: {
    type: 'standalone' | 'container' | 'serverless' | 'distributed';
    environment: 'development' | 'testing' | 'staging' | 'production';
    
    // Container/serverless specific
    image?: string;
    tag?: string;
    resources?: {
      memoryMB: number;
      cpuCores: number;
      storage?: string;
    };
    
    // Scaling configuration
    scaling?: {
      enabled: boolean;
      minInstances: number;
      maxInstances: number;
      scaleUpThreshold: number;
      scaleDownThreshold: number;
    };
  };
  
  // Configuration management
  configuration: {
    configVersion: string;
    lastUpdated: Timestamp;
    updateHistory: {
      version: string;
      updatedAt: Timestamp;
      updatedBy: string;
      changes: string[];
    }[];
    
    // Environment variables and secrets
    environment?: Record<string, string>;
    secrets?: {
      name: string;
      keyPath: string;
      lastRotated?: Timestamp;
    }[];
  };
  
  // Integration and dependencies
  integrations: {
    dependsOn: {
      type: 'service' | 'database' | 'api' | 'file-system';
      name: string;
      endpoint?: string;
      required: boolean;
      healthCheck?: string;
    }[];
    
    provides: {
      service: string;
      endpoint: string;
      protocol: string;
    }[];
  };
  
  // Backup and recovery
  backup: {
    enabled: boolean;
    schedule?: string; // Cron expression
    retention: string; // Duration
    lastBackup?: Timestamp;
    backupLocation?: string;
  };
  
  // Compliance and audit
  compliance: {
    frameworks: string[];
    auditLog: {
      enabled: boolean;
      retention: string;
      location?: string;
    };
    
    dataHandling: {
      piiProcessing: boolean;
      dataRetention: string;
      encryptionRequired: boolean;
    };
  };
  
  // Metadata and tags
  tags: string[];
  metadata: Record<string, any>;
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * MCP client connection information
 */
export interface MCPClientConnection {
  id: string;
  serverId: string;
  clientId: string;
  
  // Connection details
  connectedAt: Timestamp;
  lastActivity: Timestamp;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  // Client information
  clientInfo: {
    name: string;
    version: string;
    userAgent?: string;
    capabilities: string[];
  };
  
  // Network information
  network: {
    protocol: string;
    localAddress: string;
    remoteAddress: string;
    bytesReceived: number;
    bytesSent: number;
  };
  
  // Session information
  session: {
    sessionId: string;
    startTime: Timestamp;
    requestCount: number;
    errorCount: number;
    lastError?: {
      timestamp: Timestamp;
      error: string;
      code?: number;
    };
  };
  
  // Security context
  security: {
    authenticated: boolean;
    authMethod?: string;
    permissions: string[];
    roles: string[];
  };
  
  // Performance metrics
  performance: {
    averageResponseTime: number;
    requestsPerMinute: number;
    errors: {
      timestamp: Timestamp;
      type: string;
      message: string;
      retryCount: number;
    }[];
  };
}

/**
 * MCP tool execution request
 */
export interface MCPToolExecutionRequest {
  toolName: string;
  parameters: Record<string, any>;
  
  // Execution context
  executionContext: {
    agentId: AgentId;
    realmId: RealmId;
    sessionId?: string;
    correlationId?: string;
  };
  
  // Execution options
  options?: {
    timeout?: number;
    retryCount?: number;
    async?: boolean;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
  
  // Security context
  security?: {
    permissions: string[];
    approvalId?: ApprovalId;
    overrides?: Record<string, any>;
  };
  
  // Monitoring and debugging
  monitoring?: {
    trackPerformance: boolean;
    logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    includeStackTrace?: boolean;
  };
  
  // Metadata
  metadata?: Record<string, any>;
}

/**
 * MCP tool execution result
 */
export interface MCPToolExecutionResult {
  success: boolean;
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
    stack?: string;
    retryable: boolean;
  };
  
  // Execution metadata
  execution: {
    startTime: Timestamp;
    endTime: Timestamp;
    duration: number;
    retryCount: number;
    finalAttempt: boolean;
  };
  
  // Performance data
  performance?: {
    memoryUsed: number;
    cpuTime: number;
    networkRequests: number;
    diskOperations: number;
  };
  
  // Security and audit
  security: {
    permissionsUsed: string[];
    approvalId?: ApprovalId;
    securityEvents: {
      type: string;
      details: any;
      timestamp: Timestamp;
    }[];
  };
  
  // Output artifacts
  artifacts?: {
    name: string;
    type: string;
    size: number;
    location: string;
    checksum?: string;
  }[];
  
  // Monitoring data
  monitoring?: {
    logs: {
      level: string;
      message: string;
      timestamp: Timestamp;
    }[];
    
    metrics: Record<string, number>;
    
    alerts?: {
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
      timestamp: Timestamp;
    }[];
  };
  
  // Context for follow-up
  continuationToken?: string;
  correlationId?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

/**
 * Request to create an MCP server
 */
export interface CreateMCPServerRequest {
  name: string;
  description: string;
  realmId: RealmId;
  config: MCPServerConfig;
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: any[];
  deployment: {
    type: string;
    environment: string;
    resources?: any;
  };
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * MCP server health check result
 */
export interface MCPServerHealthCheck {
  serverId: string;
  timestamp: Timestamp;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration: number;
    metadata?: Record<string, any>;
  }[];
  
  performance: {
    responseTime: number;
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
  };
  
  dependencies: {
    name: string;
    status: 'available' | 'unavailable' | 'degraded';
    responseTime?: number;
    lastCheck: Timestamp;
  }[];
}
