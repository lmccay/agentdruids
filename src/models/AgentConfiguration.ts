import {
  AgentId,
  RealmId,
  AgentType,
  Timestamp,
  BaseEntity,
  ResourceLimits,
  QuotaLimits
} from './Types';
import { SpecializationProfile, DruidPersona, LLMConfiguration, ToolPermissions } from './Agent';

/**
 * Security configuration for agent operations
 */
export interface SecurityConfiguration {
  encryptionRequired: boolean;
  allowedOrigins?: string[];
  requireApproval: boolean;
  auditLevel: 'none' | 'basic' | 'detailed' | 'comprehensive';
  accessControlEnabled: boolean;
  sessionTimeoutMs?: number;
  maxFailedAttempts?: number;
  lockoutDurationMs?: number;
}

/**
 * Monitoring and alerting configuration for agents
 */
export interface MonitoringConfiguration {
  enabled: boolean;
  checkIntervalMs: number;
  healthCheckEndpoint?: string;
  metrics: {
    collectPerformance: boolean;
    collectResources: boolean;
    collectInteractions: boolean;
    retentionDays: number;
  };
  alerts: {
    enabled: boolean;
    thresholds: {
      responseTimeMs?: number;
      errorRate?: number;
      memoryUsagePercent?: number;
      cpuUsagePercent?: number;
      queueLength?: number;
    };
    notificationChannels: string[];
  };
}

/**
 * Network and communication configuration
 */
export interface NetworkConfiguration {
  protocols: string[];
  endpoints: {
    [protocol: string]: {
      host?: string;
      port?: number;
      path?: string;
      secured?: boolean;
    };
  };
  timeouts: {
    connectionMs: number;
    requestMs: number;
    idleMs: number;
  };
  retry: {
    maxAttempts: number;
    backoffMs: number;
    exponentialBackoff: boolean;
  };
  rateLimiting?: {
    requestsPerSecond: number;
    burstSize: number;
  };
}

/**
 * Backup and recovery configuration
 */
export interface BackupConfiguration {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly';
  retentionCount: number;
  includeState: boolean;
  includeHistory: boolean;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  remoteStorage?: {
    provider: string;
    bucket: string;
    region?: string;
    credentials?: Record<string, string>;
  };
}

/**
 * Agent configuration template for standardized deployments
 */
export interface AgentConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  agentType: AgentType;
  category: string;
  
  // Default configuration values
  defaultSpecialization: Partial<SpecializationProfile>;
  defaultPersonality: Partial<DruidPersona>;
  defaultLLMConfig: Partial<LLMConfiguration>;
  defaultResourceLimits: ResourceLimits;
  defaultToolPermissions: ToolPermissions;
  
  // Template-specific configurations
  security: SecurityConfiguration;
  monitoring: MonitoringConfiguration;
  network: NetworkConfiguration;
  backup: BackupConfiguration;
  
  // Customization options
  parameterization: {
    configurable: {
      parameter: string;
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
      description: string;
      required: boolean;
      default?: any;
      options?: any[];
      validation?: {
        min?: number;
        max?: number;
        pattern?: string;
        enum?: any[];
      };
    }[];
  };
  
  // Usage and compatibility
  supportedRealms: RealmId[];
  requiredCapabilities: string[];
  compatibleAgentTypes: AgentType[];
  
  // Metadata
  tags: string[];
  documentation?: string;
  examples?: Record<string, any>[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Complete agent configuration combining all aspects
 */
export interface AgentConfiguration extends BaseEntity {
  id: string;
  agentId: AgentId;
  realmId?: RealmId;
  
  // Core agent settings
  specialization: SpecializationProfile;
  personality: DruidPersona;
  llmConfig: LLMConfiguration;
  toolPermissions: ToolPermissions;
  resourceLimits: ResourceLimits;
  quotaLimits: QuotaLimits;
  
  // Operational configurations
  security: SecurityConfiguration;
  monitoring: MonitoringConfiguration;
  network: NetworkConfiguration;
  backup: BackupConfiguration;
  
  // Environment-specific overrides
  environmentOverrides?: {
    [environment: string]: Partial<AgentConfiguration>;
  };
  
  // Template reference
  templateId?: string;
  templateVersion?: string;
  
  // Status and metadata
  active: boolean;
  frozen: boolean;
  lastApplied?: Timestamp;
  appliedBy?: string;
  validationErrors?: string[];
  
  // Configuration history
  changeHistory: {
    timestamp: Timestamp;
    changedBy: string;
    changes: Record<string, { from: any; to: any }>;
    reason?: string;
  }[];
}

/**
 * Configuration validation result
 */
export interface ConfigurationValidation {
  valid: boolean;
  errors: {
    field: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }[];
  warnings: {
    field: string;
    message: string;
    recommendation?: string;
  }[];
  performance: {
    estimatedMemoryMB: number;
    estimatedCpuPercent: number;
    compatibilityScore: number;
  };
}

/**
 * Configuration deployment request
 */
export interface DeployConfigurationRequest {
  agentId: AgentId;
  configurationId: string;
  realmId?: RealmId;
  dryRun?: boolean;
  force?: boolean;
  rollbackOnFailure?: boolean;
  notificationChannels?: string[];
  metadata?: Record<string, any>;
}

/**
 * Configuration deployment result
 */
export interface ConfigurationDeploymentResult {
  deploymentId: string;
  agentId: AgentId;
  configurationId: string;
  status: 'success' | 'failure' | 'partial' | 'rolled_back';
  deployedAt: Timestamp;
  duration: number;
  changes: {
    applied: Record<string, any>;
    failed: Record<string, { error: string; originalValue: any }>;
  };
  rollbackPlan?: {
    steps: string[];
    estimatedDuration: number;
  };
  validationResult: ConfigurationValidation;
}

/**
 * Configuration comparison for diff analysis
 */
export interface ConfigurationComparison {
  sourceId: string;
  targetId: string;
  differences: {
    field: string;
    sourceValue: any;
    targetValue: any;
    type: 'added' | 'removed' | 'modified';
    impact: 'low' | 'medium' | 'high' | 'critical';
  }[];
  compatibility: {
    compatible: boolean;
    issues: string[];
    recommendations: string[];
  };
  migrationPath?: {
    steps: string[];
    estimatedDuration: number;
    risks: string[];
  };
}
