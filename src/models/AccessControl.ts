import {
  AgentId,
  RealmId,
  Timestamp,
  BaseEntity,
  AccessLevel,
  PermissionType,
  SecurityLevel,
  AuditEventType,
  AuditEntryId,
  ApprovalId,
  ApprovalStatus
} from './Types';

/**
 * Permission definition for specific operations
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  type: PermissionType;
  
  // Permission scope
  scope: {
    global: boolean;
    realms?: RealmId[];
    agents?: AgentId[];
    resources?: {
      type: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
      ids: string[];
    }[];
  };
  
  // Permission constraints
  constraints?: {
    timeWindows?: {
      start: string; // Time of day in HH:MM format
      end: string;
      days: number[]; // 0-6, Sunday to Saturday
      timezone?: string;
    }[];
    
    ipRestrictions?: {
      allowedCidrs: string[];
      deniedCidrs: string[];
    };
    
    rateLimit?: {
      maxRequests: number;
      windowSeconds: number;
      burstLimit?: number;
    };
    
    conditions?: {
      expression: string;
      description: string;
    }[];
  };
  
  // Approval requirements
  requiresApproval: boolean;
  approvalPolicy?: {
    requiredApprovers: number;
    approverRoles: string[];
    approverAgents?: AgentId[];
    timeoutMinutes: number;
    escalationPolicy?: {
      timeoutMinutes: number;
      escalateTo: string[];
    };
  };
  
  // Metadata
  tags: string[];
  securityLevel: SecurityLevel;
  
  createdBy: string;
  createdAt: Timestamp;
  lastModifiedBy: string;
  lastModifiedAt: Timestamp;
}

/**
 * Role definition containing multiple permissions
 */
export interface Role extends BaseEntity {
  id: string;
  name: string;
  description: string;
  roleType: 'system' | 'custom' | 'temporary';
  
  // Role hierarchy
  parentRoles: string[];
  childRoles: string[];
  
  // Permissions
  permissions: string[]; // Permission IDs
  
  // Role constraints
  constraints?: {
    maxConcurrentSessions?: number;
    sessionTimeoutMinutes?: number;
    maxDailyActions?: number;
    ipRestrictions?: {
      allowedCidrs: string[];
      deniedCidrs: string[];
    };
  };
  
  // Automatic assignment rules
  autoAssignment?: {
    enabled: boolean;
    rules: {
      condition: string;
      priority: number;
      description: string;
    }[];
  };
  
  // Lifecycle management
  status: 'active' | 'inactive' | 'deprecated';
  expiresAt?: Timestamp;
  
  // Metadata
  tags: string[];
  securityLevel: SecurityLevel;
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Access control entry for specific resource access
 */
export interface AccessControlEntry {
  id: string;
  resourceType: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
  resourceId: string;
  
  // Subject (who has access)
  subjectType: 'agent' | 'role' | 'user' | 'group';
  subjectId: string;
  
  // Access permissions
  accessLevel: AccessLevel;
  specificPermissions?: string[]; // Permission IDs for granular control
  
  // Access conditions
  conditions?: {
    expression: string;
    description: string;
  }[];
  
  // Time-based access
  validFrom?: Timestamp;
  validUntil?: Timestamp;
  schedule?: {
    timeWindows: {
      start: string;
      end: string;
      days: number[];
      timezone?: string;
    }[];
  };
  
  // Delegation
  isDelegated: boolean;
  delegatedBy?: string;
  delegationChain?: {
    from: string;
    to: string;
    timestamp: Timestamp;
    reason?: string;
  }[];
  
  // Approval and audit
  requiresApproval: boolean;
  approvalId?: ApprovalId;
  
  // Metadata
  reason?: string;
  tags: string[];
  
  createdBy: string;
  createdAt: Timestamp;
  lastModifiedBy: string;
  lastModifiedAt: Timestamp;
}

/**
 * Security context for execution environments
 */
export interface SecurityContext {
  id: string;
  name: string;
  description: string;
  
  // Security level and classification
  securityLevel: SecurityLevel;
  classification: 'public' | 'internal' | 'confidential' | 'restricted' | 'secret';
  
  // Isolation configuration
  isolation: {
    level: 'none' | 'process' | 'container' | 'vm' | 'physical';
    networkIsolation: boolean;
    storageIsolation: boolean;
    resourceLimits: {
      maxMemoryMB: number;
      maxCpuPercent: number;
      maxDiskMB: number;
      maxNetworkMbps: number;
    };
  };
  
  // Access controls
  allowedAgents: AgentId[];
  deniedAgents: AgentId[];
  allowedRoles: string[];
  deniedRoles: string[];
  
  // Network security
  networkPolicy: {
    allowedEndpoints: string[];
    deniedEndpoints: string[];
    allowedPorts: number[];
    deniedPorts: number[];
    requireTLS: boolean;
    certificateValidation: boolean;
  };
  
  // Data protection
  dataProtection: {
    encryptionRequired: boolean;
    encryptionAlgorithm?: string;
    keyRotationDays?: number;
    dataRetentionDays: number;
    piiHandling: 'allowed' | 'restricted' | 'prohibited';
    auditLevel: 'none' | 'basic' | 'detailed' | 'comprehensive';
  };
  
  // Compliance requirements
  compliance: {
    frameworks: string[]; // e.g., 'SOC2', 'PCI-DSS', 'HIPAA'
    requirements: {
      framework: string;
      control: string;
      implementation: string;
    }[];
  };
  
  // Monitoring and alerting
  monitoring: {
    enabled: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    alertOnViolations: boolean;
    alertThresholds: {
      failedAttempts: number;
      suspiciousActivity: number;
    };
  };
  
  createdBy: string;
  createdAt: Timestamp;
  lastModifiedBy: string;
  lastModifiedAt: Timestamp;
}

/**
 * Approval request for privileged operations
 */
export interface ApprovalRequest extends BaseEntity {
  id: ApprovalId;
  requestType: 'permission-grant' | 'role-assignment' | 'resource-access' | 'privileged-operation' | 'emergency-access';
  
  // Request details
  requestedBy: string;
  requestedFor?: string; // If requesting for someone else
  reason: string;
  description?: string;
  
  // What is being requested
  subject: {
    type: 'agent' | 'user' | 'role';
    id: string;
  };
  
  resource: {
    type: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
    id: string;
  };
  
  requestedAccess: {
    accessLevel?: AccessLevel;
    permissions?: string[];
    duration?: number; // Duration in minutes
    temporaryElevation?: boolean;
  };
  
  // Approval workflow
  status: ApprovalStatus;
  approvalPolicy: {
    requiredApprovers: number;
    approverRoles: string[];
    approverAgents?: AgentId[];
    timeoutMinutes: number;
    escalationPolicy?: {
      timeoutMinutes: number;
      escalateTo: string[];
    };
  };
  
  // Approval responses
  approvals: {
    approvedBy: string;
    approvedAt: Timestamp;
    comments?: string;
    conditions?: string[];
  }[];
  
  rejections: {
    rejectedBy: string;
    rejectedAt: Timestamp;
    reason: string;
    comments?: string;
  }[];
  
  // Timing
  requestedAt: Timestamp;
  expiresAt: Timestamp;
  approvedAt?: Timestamp;
  rejectedAt?: Timestamp;
  
  // Emergency handling
  isEmergency: boolean;
  emergencyContact?: string;
  emergencyOverride?: {
    overriddenBy: string;
    overriddenAt: Timestamp;
    reason: string;
    approverNotified: boolean;
  };
  
  // Audit trail
  auditTrail: {
    timestamp: Timestamp;
    event: string;
    actor: string;
    details: Record<string, any>;
  }[];
  
  // Metadata
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * Audit log entry for security and compliance tracking
 */
export interface AuditEntry extends BaseEntity {
  id: AuditEntryId;
  eventType: AuditEventType;
  
  // Event details
  timestamp: Timestamp;
  actor: {
    type: 'agent' | 'user' | 'system';
    id: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  
  // Resource affected
  resource?: {
    type: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
    id: string;
    name?: string;
  };
  
  // Action performed
  action: {
    operation: string;
    parameters?: Record<string, any>;
    result: 'success' | 'failure' | 'partial';
    errorMessage?: string;
    duration?: number;
  };
  
  // Security context
  securityContext: {
    securityLevel: SecurityLevel;
    permissions: string[];
    roles: string[];
    accessLevel: AccessLevel;
    approvalId?: ApprovalId;
  };
  
  // Request details
  request?: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: any;
    queryParameters?: Record<string, string>;
  };
  
  // Response details
  response?: {
    statusCode: number;
    headers: Record<string, string>;
    body?: any;
    size?: number;
  };
  
  // Risk assessment
  riskAssessment?: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    mitigations: string[];
    requiresReview: boolean;
  };
  
  // Compliance mapping
  compliance?: {
    frameworks: string[];
    controls: {
      framework: string;
      control: string;
      satisfied: boolean;
    }[];
  };
  
  // Correlation and context
  correlationId?: string;
  parentEventId?: AuditEntryId;
  childEventIds: AuditEntryId[];
  sessionContext?: {
    sessionId: string;
    sessionStart: Timestamp;
    previousEvents: number;
  };
  
  // Data classification and retention
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  retentionPolicy: {
    retainUntil: Timestamp;
    archiveAt?: Timestamp;
    purgeAt?: Timestamp;
  };
  
  // Metadata
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * Access control policy for automated decision making
 */
export interface AccessPolicy extends BaseEntity {
  id: string;
  name: string;
  description: string;
  policyType: 'allow' | 'deny' | 'conditional';
  
  // Policy conditions
  conditions: {
    type: 'attribute' | 'time' | 'location' | 'resource' | 'risk' | 'custom';
    operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'contains' | 'matches';
    attribute: string;
    value: any;
    description: string;
  }[];
  
  // Policy actions
  actions: {
    type: 'grant' | 'deny' | 'require_approval' | 'log' | 'alert' | 'escalate';
    parameters?: Record<string, any>;
  }[];
  
  // Policy scope
  scope: {
    subjects: {
      type: 'agent' | 'role' | 'user' | 'group' | 'all';
      ids?: string[];
    }[];
    
    resources: {
      type: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration' | 'all';
      ids?: string[];
    }[];
    
    operations: string[];
  };
  
  // Policy evaluation
  evaluation: {
    priority: number;
    combiningAlgorithm: 'first-applicable' | 'permit-overrides' | 'deny-overrides' | 'only-one-applicable';
    fallbackAction: 'permit' | 'deny' | 'indeterminate';
  };
  
  // Policy lifecycle
  status: 'draft' | 'active' | 'inactive' | 'deprecated';
  effectiveFrom: Timestamp;
  effectiveUntil?: Timestamp;
  
  // Testing and validation
  testCases?: {
    name: string;
    input: Record<string, any>;
    expectedResult: 'permit' | 'deny' | 'indeterminate';
    description: string;
  }[];
  
  lastValidation?: {
    validatedAt: Timestamp;
    validatedBy: string;
    result: 'passed' | 'failed' | 'warnings';
    issues?: string[];
  };
  
  // Usage statistics
  usage: {
    evaluationCount: number;
    permitCount: number;
    denyCount: number;
    indeterminateCount: number;
    lastEvaluated?: Timestamp;
    averageEvaluationTime: number;
  };
  
  // Metadata
  tags: string[];
  securityLevel: SecurityLevel;
  
  createdBy: string;
  lastModifiedBy: string;
}

/**
 * Request to create an access control entry
 */
export interface CreateAccessControlRequest {
  resourceType: string;
  resourceId: string;
  subjectType: string;
  subjectId: string;
  accessLevel: AccessLevel;
  specificPermissions?: string[];
  conditions?: any[];
  validFrom?: Timestamp;
  validUntil?: Timestamp;
  schedule?: any;
  reason?: string;
  tags?: string[];
}

/**
 * Request for access approval
 */
export interface CreateApprovalRequest {
  requestType: string;
  reason: string;
  description?: string;
  requestedFor?: string;
  subject: {
    type: string;
    id: string;
  };
  resource: {
    type: string;
    id: string;
  };
  requestedAccess: {
    accessLevel?: AccessLevel;
    permissions?: string[];
    duration?: number;
    temporaryElevation?: boolean;
  };
  isEmergency?: boolean;
  emergencyContact?: string;
  metadata?: Record<string, any>;
}

/**
 * Access control evaluation result
 */
export interface AccessEvaluationResult {
  permitted: boolean;
  decision: 'permit' | 'deny' | 'indeterminate';
  
  // Decision details
  matchedPolicies: {
    policyId: string;
    policyName: string;
    decision: string;
    priority: number;
  }[];
  
  appliedPermissions: string[];
  missingPermissions: string[];
  
  // Conditions and constraints
  conditions: {
    type: string;
    satisfied: boolean;
    details: string;
  }[];
  
  constraints: {
    type: string;
    applied: boolean;
    parameters: Record<string, any>;
  }[];
  
  // Approval requirements
  requiresApproval: boolean;
  approvalPolicies?: {
    policyId: string;
    requiredApprovers: number;
    timeoutMinutes: number;
  }[];
  
  // Risk assessment
  riskAssessment?: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    recommendations: string[];
  };
  
  // Evaluation metadata
  evaluationTime: number;
  evaluatedAt: Timestamp;
  evaluatedBy: string;
  correlationId?: string;
  
  // Audit and logging
  auditRequired: boolean;
  logLevel: 'none' | 'basic' | 'detailed' | 'comprehensive';
  
  // Additional context
  context: Record<string, any>;
  recommendations?: string[];
  warnings?: string[];
}
