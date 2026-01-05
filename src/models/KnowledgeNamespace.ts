import {
  AgentId,
  RealmId,
  Timestamp,
  BaseEntity,
  AccessLevel,
  SecurityLevel,
  UsageStatistics
} from './Types';

/**
 * Knowledge source configuration and metadata
 */
export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'database' | 'file-system' | 'api' | 'vector-store' | 'graph' | 'external';
  description: string;
  
  // Connection configuration
  connection: {
    endpoint?: string;
    credentials?: Record<string, string>;
    timeout: number;
    maxConnections?: number;
    ssl?: boolean;
    authentication?: {
      type: 'none' | 'basic' | 'bearer' | 'oauth' | 'certificate';
      credentials?: Record<string, string>;
    };
  };
  
  // Data structure and schema
  schema: {
    format: 'json' | 'xml' | 'csv' | 'binary' | 'vector' | 'graph' | 'structured';
    structure?: Record<string, any>;
    indexing?: {
      enabled: boolean;
      fields: string[];
      type: 'btree' | 'hash' | 'vector' | 'fulltext';
    };
  };
  
  // Content metadata
  content: {
    domain: string;
    language: string;
    classification: 'public' | 'internal' | 'confidential' | 'restricted';
    tags: string[];
    lastUpdated: Timestamp;
    size: number;
    recordCount?: number;
  };
  
  // Quality and reliability
  quality: {
    accuracyScore: number;
    completenessScore: number;
    freshnessScore: number;
    consistencyScore: number;
    validationRules: string[];
  };
  
  // Performance characteristics
  performance: {
    averageQueryTime: number;
    throughputQPS: number;
    availability: number;
    cacheHitRate?: number;
    indexingStatus: 'complete' | 'partial' | 'in-progress' | 'failed';
  };
  
  status: 'active' | 'inactive' | 'maintenance' | 'error';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Access control entry for knowledge namespace permissions
 */
export interface KnowledgeAccessControl {
  principal: {
    type: 'agent' | 'agent-type' | 'realm' | 'role' | 'group';
    id: string;
  };
  permissions: {
    read: boolean;
    write: boolean;
    admin: boolean;
    query: boolean;
    index: boolean;
    export: boolean;
  };
  constraints: {
    timeRestrictions?: {
      allowedHours: string;
      timezone: string;
      blackoutPeriods: {
        start: Timestamp;
        end: Timestamp;
        reason: string;
      }[];
    };
    rateLimit?: {
      queriesPerMinute: number;
      queriesPerHour: number;
      queriesPerDay: number;
    };
    dataFilters?: {
      allowedFields: string[];
      forbiddenFields: string[];
      rowFilters: string[];
    };
  };
  conditions?: {
    requiredAttributes: Record<string, any>;
    ipRestrictions: string[];
    deviceRestrictions: string[];
  };
  grantedAt: Timestamp;
  grantedBy: string;
  expiresAt?: Timestamp;
  lastUsed?: Timestamp;
}

/**
 * Knowledge caching configuration and status
 */
export interface KnowledgeCache {
  enabled: boolean;
  strategy: 'lru' | 'lfu' | 'ttl' | 'adaptive';
  maxSize: string;
  ttlSeconds: number;
  
  // Cache performance
  hitRate: number;
  missRate: number;
  evictionRate: number;
  lastOptimization: Timestamp;
  
  // Cache policies
  policies: {
    preloadPopular: boolean;
    preloadFrequent: boolean;
    excludePatterns: string[];
    includePatterns: string[];
  };
  
  // Distributed caching
  distributed: {
    enabled: boolean;
    nodes: string[];
    consistencyLevel: 'eventual' | 'strong' | 'session';
    replicationFactor: number;
  };
}

/**
 * Knowledge indexing configuration and status
 */
export interface KnowledgeIndexing {
  enabled: boolean;
  strategy: 'real-time' | 'batch' | 'hybrid';
  
  // Index types
  indexes: {
    fullText: {
      enabled: boolean;
      analyzer: string;
      language: string;
      synonyms: boolean;
      stemming: boolean;
    };
    vector: {
      enabled: boolean;
      dimensions: number;
      algorithm: 'hnsw' | 'ivf' | 'flat';
      metric: 'cosine' | 'euclidean' | 'dot-product';
    };
    semantic: {
      enabled: boolean;
      model: string;
      embeddings: boolean;
      entityRecognition: boolean;
    };
  };
  
  // Indexing status
  status: {
    lastIndexing: Timestamp;
    nextIndexing?: Timestamp;
    indexingProgress: number;
    failedItems: number;
    totalItems: number;
  };
  
  // Performance settings
  performance: {
    batchSize: number;
    maxConcurrency: number;
    resourceLimits: {
      maxMemoryMB: number;
      maxCpuPercent: number;
    };
  };
}

/**
 * Knowledge query analytics and insights
 */
export interface KnowledgeAnalytics {
  queryPatterns: {
    mostFrequent: {
      query: string;
      count: number;
      agents: AgentId[];
    }[];
    trending: {
      query: string;
      growthRate: number;
      timeframe: string;
    }[];
    performance: {
      query: string;
      averageTime: number;
      successRate: number;
    }[];
  };
  
  usageMetrics: {
    totalQueries: number;
    uniqueQueries: number;
    activeAgents: number;
    averageResponseTime: number;
    peakUsageHours: string[];
  };
  
  contentAnalytics: {
    popularTopics: string[];
    contentGaps: string[];
    qualityIssues: {
      type: string;
      count: number;
      examples: string[];
    }[];
    utilizationBySource: Record<string, number>;
  };
  
  recommendations: {
    optimization: {
      area: string;
      suggestion: string;
      impact: 'low' | 'medium' | 'high';
      effort: 'low' | 'medium' | 'high';
    }[];
    content: {
      action: 'add' | 'update' | 'remove' | 'improve';
      target: string;
      reasoning: string;
      priority: 'low' | 'medium' | 'high';
    }[];
  };
}

/**
 * Main KnowledgeNamespace interface
 */
export interface KnowledgeNamespace extends BaseEntity {
  id: string;
  name: string;
  description: string;
  namespace: string; // Hierarchical namespace path (e.g., "production.database.user-data")
  
  // Classification and metadata
  category: string;
  domain: string;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  securityLevel: SecurityLevel;
  
  // Data sources and content
  sources: KnowledgeSource[];
  totalSize: number;
  recordCount: number;
  lastUpdated: Timestamp;
  
  // Access control
  accessControl: KnowledgeAccessControl[];
  defaultAccess: AccessLevel;
  inheritanceEnabled: boolean;
  parentNamespace?: string;
  childNamespaces: string[];
  
  // Caching and performance
  cache: KnowledgeCache;
  indexing: KnowledgeIndexing;
  
  // Query capabilities
  queryFeatures: {
    fullTextSearch: boolean;
    vectorSearch: boolean;
    semanticSearch: boolean;
    facetedSearch: boolean;
    aggregations: boolean;
    joinQueries: boolean;
    graphTraversal: boolean;
  };
  
  // Content management
  versioning: {
    enabled: boolean;
    strategy: 'timestamp' | 'semantic' | 'manual';
    retentionPolicy: string;
    currentVersion: string;
    versionHistory: {
      version: string;
      timestamp: Timestamp;
      changes: string;
      changedBy: string;
    }[];
  };
  
  // Quality and governance
  governance: {
    dataOwner: string;
    stewards: string[];
    reviewSchedule: 'monthly' | 'quarterly' | 'annually';
    lastReview?: Timestamp;
    complianceStandards: string[];
    retentionPolicy: {
      retentionPeriod: string;
      archivalPolicy: string;
      deletionPolicy: string;
    };
  };
  
  // Monitoring and analytics
  monitoring: {
    enabled: boolean;
    alerting: boolean;
    performance: boolean;
    usage: boolean;
    quality: boolean;
  };
  analytics: KnowledgeAnalytics;
  
  // Usage statistics
  usage: UsageStatistics;
  
  // Backup and recovery
  backup: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly';
    retention: number;
    compression: boolean;
    encryption: boolean;
    lastBackup?: Timestamp;
    backupSize?: number;
  };
  
  // Integration and sync
  synchronization: {
    enabled: boolean;
    schedule: string;
    sources: string[];
    conflicts: 'overwrite' | 'merge' | 'manual' | 'skip';
    lastSync?: Timestamp;
    syncStatus: 'success' | 'partial' | 'failed' | 'in-progress';
  };
  
  // Status and health
  status: 'active' | 'inactive' | 'maintenance' | 'error' | 'deprecated';
  health: {
    score: number;
    issues: {
      severity: 'low' | 'medium' | 'high' | 'critical';
      type: string;
      description: string;
      detected: Timestamp;
      resolved?: Timestamp;
    }[];
    lastHealthCheck: Timestamp;
  };
  
  // Metadata and lifecycle
  tags: string[];
  metadata: Record<string, any>;
  
  // Lifecycle information
  lifecycle: {
    created: Timestamp;
    activated?: Timestamp;
    lastAccessed?: Timestamp;
    deprecationScheduled?: Timestamp;
    archivalScheduled?: Timestamp;
  };
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Request to create a knowledge namespace
 */
export interface CreateKnowledgeNamespaceRequest {
  name: string;
  description: string;
  namespace: string;
  category: string;
  domain: string;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  securityLevel: SecurityLevel;
  sources: Partial<KnowledgeSource>[];
  accessControl?: KnowledgeAccessControl[];
  defaultAccess?: AccessLevel;
  parentNamespace?: string;
  cache?: Partial<KnowledgeCache>;
  indexing?: Partial<KnowledgeIndexing>;
  queryFeatures?: Partial<{
    fullTextSearch: boolean;
    vectorSearch: boolean;
    semanticSearch: boolean;
    facetedSearch: boolean;
    aggregations: boolean;
    joinQueries: boolean;
    graphTraversal: boolean;
  }>;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Request to update a knowledge namespace
 */
export interface UpdateKnowledgeNamespaceRequest {
  name?: string;
  description?: string;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  securityLevel?: SecurityLevel;
  accessControl?: KnowledgeAccessControl[];
  defaultAccess?: AccessLevel;
  cache?: Partial<KnowledgeCache>;
  indexing?: Partial<KnowledgeIndexing>;
  queryFeatures?: Partial<{
    fullTextSearch: boolean;
    vectorSearch: boolean;
    semanticSearch: boolean;
    facetedSearch: boolean;
    aggregations: boolean;
    joinQueries: boolean;
    graphTraversal: boolean;
  }>;
  status?: 'active' | 'inactive' | 'maintenance' | 'deprecated';
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Knowledge query request
 */
export interface KnowledgeQueryRequest {
  namespace: string;
  query: string;
  queryType: 'text' | 'vector' | 'semantic' | 'sql' | 'graph';
  filters?: Record<string, any>;
  pagination?: {
    offset: number;
    limit: number;
  };
  sorting?: {
    field: string;
    direction: 'asc' | 'desc';
  }[];
  facets?: string[];
  aggregations?: Record<string, any>;
  context: {
    agentId: AgentId;
    realmId?: RealmId;
    taskId?: string;
    sessionId?: string;
  };
  options?: {
    includeMetadata: boolean;
    includeScore: boolean;
    includeExplanation: boolean;
    useCache: boolean;
    timeout: number;
  };
}

/**
 * Knowledge query response
 */
export interface KnowledgeQueryResponse {
  queryId: string;
  namespace: string;
  results: {
    items: any[];
    totalCount: number;
    hasMore: boolean;
    facets?: Record<string, any>;
    aggregations?: Record<string, any>;
  };
  performance: {
    queryTime: number;
    cacheHit: boolean;
    sourceQueries: number;
    indexesUsed: string[];
  };
  metadata: {
    timestamp: Timestamp;
    sources: string[];
    quality: {
      accuracy: number;
      freshness: number;
      completeness: number;
    };
  };
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
  warnings?: string[];
}

/**
 * Knowledge namespace statistics
 */
export interface KnowledgeNamespaceStatistics {
  namespaceId: string;
  timeRange: {
    start: Timestamp;
    end: Timestamp;
  };
  
  usage: {
    totalQueries: number;
    uniqueAgents: number;
    averageResponseTime: number;
    successRate: number;
    cacheHitRate: number;
  };
  
  content: {
    totalRecords: number;
    sourceCount: number;
    averageRecordSize: number;
    indexCoverage: number;
    qualityScore: number;
  };
  
  performance: {
    averageQueryTime: number;
    p95QueryTime: number;
    throughputQPS: number;
    errorRate: number;
    availability: number;
  };
  
  growth: {
    recordGrowthRate: number;
    queryGrowthRate: number;
    sizeGrowthRate: number;
    projectedSize: number;
  };
}
