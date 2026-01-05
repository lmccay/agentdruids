/**
 * Core type definitions for the Druids multi-agent system
 */

// Base types
export type AgentType = 'druid' | 'elemental' | 'gaia' | 'worldtree';
export type AgentStatus = 'inactive' | 'deployed' | 'active' | 'paused' | 'error' | 'maintenance';
export type RealmType = 'development' | 'testing' | 'staging' | 'production' | 'monitoring';
export type SecurityLevel = 'development' | 'staging' | 'production';

// Communication and interaction types
export type MessageType = 'task' | 'query' | 'response' | 'notification' | 'status' | 'error';
export type CommunicationProtocol = 'http' | 'websocket' | 'mcp' | 'internal';
export type BindingType = 'dependency' | 'collaboration' | 'monitoring' | 'delegation';
export type RelationshipType = 'coordinates' | 'supervises' | 'delegates' | 'monitors' | 'assists';

// Task and workflow types
export type TaskType = 'validation' | 'transformation' | 'analysis' | 'monitoring-setup' | 'reporting' | 'coordination' | 'processing' | 'communication';
export type TaskStatus = 'pending' | 'queued' | 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'timeout';
export type ExecutionStatus = 'queued' | 'initializing' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial_success';

// Tool and MCP types
export type ToolOperation = 'read' | 'write' | 'execute' | 'delete' | 'get' | 'post' | 'put' | 'patch';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

// Knowledge and access control types
export type AccessLevel = 'none' | 'read' | 'write' | 'admin';
export type PermissionType = 'task-delegation' | 'status-monitoring' | 'knowledge-access' | 'tool-usage' | 'cross-realm-communication';

// Audit and monitoring types
export type AuditEventType = 'agent-created' | 'agent-updated' | 'agent-deleted' | 'task-executed' | 'knowledge-accessed' | 'tool-used' | 'message-sent' | 'approval-requested' | 'security-violation';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertType = 'performance' | 'security' | 'error' | 'capacity' | 'suspicious_activity' | 'task_timeout_warning';

// LLM and configuration types
export type LLMProvider = 'ollama' | 'openai' | 'anthropic' | 'local';

// Timestamp type for consistent date handling
export type Timestamp = string; // ISO 8601 format

// ID types for type safety
export type AgentId = string;
export type RealmId = string;
export type TaskId = string;
export type ScenarioId = string;
export type ExecutionId = string;
export type WorkflowId = string;
export type KnowledgeId = string;
export type NamespaceId = string;
export type LeyLineId = string;
export type BindingId = string;
export type ApprovalId = string;
export type AuditEntryId = string;
export type UserId = string;

// Error and result types
export interface DruidError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Timestamp;
  source?: string;
}

export interface DruidResult<T = any> {
  success: boolean;
  data?: T;
  error?: DruidError;
  metadata?: Record<string, any>;
}

// Base interface for all entities
export interface BaseEntity {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version?: number;
}

// Configuration interfaces
export interface ResourceLimits {
  maxMemoryMB?: number;
  maxCpuPercent?: number;
  maxConcurrentTasks?: number;
  maxExecutionTimeMs?: number;
}

export interface QuotaLimits {
  maxOperationsPerHour?: number;
  maxOperationsPerDay?: number;
  maxFileSize?: string;
  maxFilesPerHour?: number;
  maxRequestsPerMinute?: number;
  maxBandwidthMB?: number;
}

// Knowledge and namespace types
export interface KnowledgeQuery {
  query: string;
  namespaces: string[];
  context: {
    taskId?: TaskId;
    requestorId: AgentId;
    timestamp: Timestamp;
  };
  filters?: Record<string, any>;
  maxResults?: number;
}

export interface KnowledgeResult {
  results: any[];
  accessGranted: boolean;
  accessibleNamespaces?: string[];
  filteredNamespaces?: string[];
  unauthorizedNamespaces?: string[];
  metadata?: {
    totalResults: number;
    queryTime: number;
    sources: string[];
  };
}

// Performance and metrics types
export interface PerformanceMetrics {
  responseTimeMs: number;
  throughputPerSecond: number;
  errorRate: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
  activeConnections: number;
  queueLength: number;
}

export interface UsageStatistics {
  totalOperations: number;
  operationsByType: Record<string, number>;
  quotaStatus: {
    current: number;
    limit: number;
    resetTime?: Timestamp;
  };
  averageResponseTime: number;
  errorCount: number;
}
