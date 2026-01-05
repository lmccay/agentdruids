import {
  Permission,
  Role,
  ApprovalRequest
} from '../models/AccessControl';
import {
  Timestamp,
  AccessLevel,
  PermissionType,
  SecurityLevel,
  ApprovalId,
  ApprovalStatus
} from '../models/Types';

/**
 * Policy violation record
 */
interface PolicyViolation {
  id: string;
  type: 'access-denied' | 'permission-exceeded' | 'constraint-violated' | 'approval-required';
  severity: 'low' | 'medium' | 'high' | 'critical';
  subjectType: 'agent' | 'user' | 'role';
  subjectId: string;
  resourceType: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
  resourceId: string;
  operation: string;
  violation: string;
  timestamp: Timestamp;
  metadata: Record<string, any>;
}

/**
 * Access decision result
 */
interface AccessDecision {
  id: string;
  allowed: boolean;
  reason: string;
  subjectType: 'agent' | 'user' | 'role';
  subjectId: string;
  resourceType: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
  resourceId: string;
  operation: string;
  requestedAccess: AccessLevel;
  grantedAccess: AccessLevel | 'none';
  securityLevel: SecurityLevel;
  conditions: string[];
  requiredApprovals: ApprovalId[];
  evaluationTime: number;
  timestamp: Timestamp;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * Request to create a permission
 */
interface CreatePermissionRequest {
  name: string;
  description: string;
  type: PermissionType;
  scope: Permission['scope'];
  constraints?: Permission['constraints'];
  requiresApproval?: boolean;
  approvalPolicy?: Permission['approvalPolicy'];
  tags?: string[];
  securityLevel?: SecurityLevel;
}

/**
 * Request to create a role
 */
interface CreateRoleRequest {
  name: string;
  description: string;
  roleType?: 'system' | 'custom' | 'temporary';
  parentRoles?: string[];
  permissions?: string[];
  constraints?: Role['constraints'];
  autoAssignment?: Role['autoAssignment'];
  expiresAt?: Timestamp;
  tags?: string[];
  securityLevel?: SecurityLevel;
}

/**
 * Policy evaluation request
 */
interface PolicyEvaluationRequest {
  subjectType: 'agent' | 'user' | 'role';
  subjectId: string;
  resourceType: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
  resourceId: string;
  operation: string;
  requestedAccess: AccessLevel;
  securityContext?: string;
  metadata?: Record<string, any>;
}

/**
 * Policy evaluation result
 */
interface PolicyEvaluationResult {
  allowed: boolean;
  reason: string;
  requiredApprovals?: ApprovalId[];
  conditions?: string[];
  violations?: string[];
  securityLevel: SecurityLevel;
  metadata?: Record<string, any>;
}

/**
 * Access check context
 */
interface AccessContext {
  subjectId: string;
  subjectType: 'agent' | 'user' | 'role';
  resourceType: 'agent' | 'realm' | 'scenario' | 'workflow' | 'knowledge' | 'tool' | 'configuration';
  resourceId: string;
  operation: string;
  requestedAccess: AccessLevel;
  securityContext?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * Role assignment
 */
interface RoleAssignment {
  id: string;
  subjectType: 'agent' | 'user';
  subjectId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: Timestamp;
  expiresAt?: Timestamp;
  reason?: string;
  isActive: boolean;
}

/**
 * Policy Engine for access control and authorization
 * Handles permissions, roles, access decisions, and policy evaluation
 */
export class PolicyEngine {
  private permissions: Map<string, Permission> = new Map();
  private roles: Map<string, Role> = new Map();
  private approvalRequests: Map<ApprovalId, ApprovalRequest> = new Map();
  private roleAssignments: Map<string, RoleAssignment[]> = new Map();
  private policyViolations: PolicyViolation[] = [];

  constructor() {
    this.initializeDefaultRolesAndPermissions();
  }

  /**
   * Create a new permission
   */
  async createPermission(request: CreatePermissionRequest): Promise<Permission> {
    const permissionId = this.generatePermissionId();
    const now = Date.now().toString();

    const permission: Permission = {
      id: permissionId,
      name: request.name,
      description: request.description,
      type: request.type,
      scope: request.scope,
      ...(request.constraints && { constraints: request.constraints }),
      requiresApproval: request.requiresApproval || false,
      ...(request.approvalPolicy && { approvalPolicy: request.approvalPolicy }),
      tags: request.tags || [],
      securityLevel: request.securityLevel || 'development',
      createdBy: 'system',
      createdAt: now,
      lastModifiedBy: 'system',
      lastModifiedAt: now
    };

    this.permissions.set(permissionId, permission);
    return permission;
  }

  /**
   * Create a new role
   */
  async createRole(request: CreateRoleRequest): Promise<Role> {
    const roleId = this.generateRoleId();
    const now = Date.now().toString();

    const role: Role = {
      id: roleId,
      name: request.name,
      description: request.description,
      roleType: request.roleType || 'custom',
      parentRoles: request.parentRoles || [],
      childRoles: [],
      permissions: request.permissions || [],
      ...(request.constraints && { constraints: request.constraints }),
      ...(request.autoAssignment && { autoAssignment: request.autoAssignment }),
      status: 'active',
      ...(request.expiresAt && { expiresAt: request.expiresAt }),
      tags: request.tags || [],
      securityLevel: request.securityLevel || 'development',
      createdBy: 'system',
      lastModifiedBy: 'system',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    // Update parent roles to include this as a child
    for (const parentRoleId of role.parentRoles) {
      const parentRole = this.roles.get(parentRoleId);
      if (parentRole) {
        parentRole.childRoles.push(roleId);
        parentRole.lastModifiedBy = 'system';
        parentRole.updatedAt = now;
        parentRole.version = (parentRole.version || 1) + 1;
      }
    }

    this.roles.set(roleId, role);
    return role;
  }

  /**
   * Assign a role to a subject
   */
  async assignRole(
    subjectType: 'agent' | 'user',
    subjectId: string,
    roleId: string,
    options?: {
      expiresAt?: Timestamp;
      reason?: string;
      assignedBy?: string;
    }
  ): Promise<RoleAssignment> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role with ID ${roleId} not found`);
    }

    if (role.status !== 'active') {
      throw new Error(`Role ${roleId} is not active`);
    }

    const assignmentId = this.generateAssignmentId();
    const now = Date.now().toString();

    const assignment: RoleAssignment = {
      id: assignmentId,
      subjectType,
      subjectId,
      roleId,
      assignedBy: options?.assignedBy || 'system',
      assignedAt: now,
      ...(options?.expiresAt && { expiresAt: options.expiresAt }),
      ...(options?.reason && { reason: options.reason }),
      isActive: true
    };

    // Get or create assignments for this subject
    const subjectKey = `${subjectType}:${subjectId}`;
    const assignments = this.roleAssignments.get(subjectKey) || [];
    assignments.push(assignment);
    this.roleAssignments.set(subjectKey, assignments);

    return assignment;
  }

  /**
   * Revoke a role from a subject
   */
  async revokeRole(
    subjectType: 'agent' | 'user',
    subjectId: string,
    roleId: string
  ): Promise<void> {
    const subjectKey = `${subjectType}:${subjectId}`;
    const assignments = this.roleAssignments.get(subjectKey) || [];
    
    const assignment = assignments.find(a => a.roleId === roleId && a.isActive);
    if (!assignment) {
      throw new Error(`No active role assignment found for ${subjectType} ${subjectId} and role ${roleId}`);
    }

    assignment.isActive = false;
  }

  /**
   * Check if a subject has access to a resource
   */
  async checkAccess(context: AccessContext): Promise<AccessDecision> {
    const startTime = Date.now();
    
    console.log('🔐 PolicyEngine.checkAccess called with context:', JSON.stringify(context, null, 2));
    
    try {
      // Get all effective permissions for the subject
      const effectivePermissions = await this.getEffectivePermissions(
        context.subjectType,
        context.subjectId
      );

      console.log('🔐 Effective permissions found:', effectivePermissions.length, effectivePermissions.map(p => ({ id: p.id, name: p.name, type: p.type, scope: p.scope })));

      // Check if any permission grants the requested access
      const result = await this.evaluatePermissions(effectivePermissions, context);

      console.log('🔐 Permission evaluation result:', result);

      // Record the access decision
      const decision: AccessDecision = {
        id: this.generateDecisionId(),
        allowed: result.allowed,
        reason: result.reason,
        subjectType: context.subjectType,
        subjectId: context.subjectId,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
        operation: context.operation,
        requestedAccess: context.requestedAccess,
        grantedAccess: result.allowed ? context.requestedAccess : 'none',
        securityLevel: result.securityLevel,
        conditions: result.conditions || [],
        requiredApprovals: result.requiredApprovals || [],
        evaluationTime: Date.now() - startTime,
        timestamp: Date.now().toString(),
        ...(context.sessionId && { sessionId: context.sessionId }),
        metadata: {
          ...context.metadata,
          ...result.metadata
        }
      };

      // Log potential security violations
      if (!result.allowed && result.violations) {
        await this.recordPolicyViolations(result.violations, context);
      }

      return decision;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        id: this.generateDecisionId(),
        allowed: false,
        reason: `Access check failed: ${errorMessage}`,
        subjectType: context.subjectType,
        subjectId: context.subjectId,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
        operation: context.operation,
        requestedAccess: context.requestedAccess,
        grantedAccess: 'none',
        securityLevel: 'development',
        conditions: [],
        requiredApprovals: [],
        evaluationTime: Date.now() - startTime,
        timestamp: Date.now().toString(),
        ...(context.sessionId && { sessionId: context.sessionId }),
        metadata: { error: errorMessage }
      };
    }
  }

  /**
   * Evaluate a policy against a request
   */
  async evaluatePolicy(request: PolicyEvaluationRequest): Promise<PolicyEvaluationResult> {
    const context: AccessContext = {
      subjectId: request.subjectId,
      subjectType: request.subjectType,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      operation: request.operation,
      requestedAccess: request.requestedAccess,
      ...(request.securityContext && { securityContext: request.securityContext }),
      ...(request.metadata && { metadata: request.metadata })
    };

    const decision = await this.checkAccess(context);
    
    return {
      allowed: decision.allowed,
      reason: decision.reason,
      requiredApprovals: decision.requiredApprovals,
      conditions: decision.conditions,
      violations: decision.allowed ? [] : [decision.reason],
      securityLevel: decision.securityLevel,
      ...(decision.metadata && { metadata: decision.metadata })
    };
  }

  /**
   * Request approval for a privileged operation
   */
  async requestApproval(request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'version'>): Promise<ApprovalRequest> {
    const approvalId = this.generateApprovalId();
    const now = Date.now().toString();

    const approvalRequest: ApprovalRequest = {
      ...request,
      id: approvalId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    this.approvalRequests.set(approvalId, approvalRequest);
    return approvalRequest;
  }

  /**
   * Approve or deny an approval request
   */
  async processApproval(
    approvalId: ApprovalId,
    decision: 'approved' | 'rejected',
    approver: string,
    reason?: string
  ): Promise<ApprovalRequest> {
    const request = this.approvalRequests.get(approvalId);
    if (!request) {
      throw new Error(`Approval request with ID ${approvalId} not found`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Approval request ${approvalId} is not pending`);
    }

    const now = Date.now().toString();

    const updatedRequest: ApprovalRequest = {
      ...request,
      status: decision as ApprovalStatus,
      updatedAt: now,
      version: (request.version || 1) + 1
    };

    // Add approval or rejection record
    if (decision === 'approved') {
      updatedRequest.approvals.push({
        approvedBy: approver,
        approvedAt: now,
        ...(reason && { comments: reason })
      });
      updatedRequest.approvedAt = now;
    } else {
      updatedRequest.rejections.push({
        rejectedBy: approver,
        rejectedAt: now,
        reason: reason || 'No reason provided',
        ...(reason && { comments: reason })
      });
      updatedRequest.rejectedAt = now;
    }

    this.approvalRequests.set(approvalId, updatedRequest);
    return updatedRequest;
  }

  /**
   * Get effective permissions for a subject
   */
  async getEffectivePermissions(
    subjectType: 'agent' | 'user' | 'role',
    subjectId: string
  ): Promise<Permission[]> {
    console.log(`🔐 Getting effective permissions for ${subjectType}:${subjectId}`);
    
    const permissions: Permission[] = [];
    const permissionIds = new Set<string>();

    if (subjectType === 'role') {
      // Get permissions directly from the role
      const role = this.roles.get(subjectId);
      if (role && role.status === 'active') {
        for (const permissionId of role.permissions) {
          if (!permissionIds.has(permissionId)) {
            const permission = this.permissions.get(permissionId);
            if (permission) {
              permissions.push(permission);
              permissionIds.add(permissionId);
            }
          }
        }
      }
    } else {
      // Get permissions from assigned roles
      const subjectKey = `${subjectType}:${subjectId}`;
      console.log(`🔐 Looking for role assignments with key: ${subjectKey}`);
      console.log(`🔐 Available role assignment keys:`, Array.from(this.roleAssignments.keys()));
      
      const assignments = this.roleAssignments.get(subjectKey) || [];
      console.log(`🔐 Found ${assignments.length} role assignments for ${subjectKey}`);
      
      for (const assignment of assignments) {
        console.log(`🔐 Processing assignment:`, assignment);
        if (!assignment.isActive) continue;
        
        // Check expiration
        if (assignment.expiresAt && parseInt(assignment.expiresAt) < Date.now()) {
          assignment.isActive = false;
          continue;
        }
        
        const role = this.roles.get(assignment.roleId);
        if (!role || role.status !== 'active') continue;
        
        // Add role permissions
        for (const permissionId of role.permissions) {
          if (!permissionIds.has(permissionId)) {
            const permission = this.permissions.get(permissionId);
            if (permission) {
              permissions.push(permission);
              permissionIds.add(permissionId);
            }
          }
        }
        
        // Add inherited permissions from parent roles
        const inheritedPermissions = await this.getInheritedPermissions(role);
        for (const permission of inheritedPermissions) {
          if (!permissionIds.has(permission.id)) {
            permissions.push(permission);
            permissionIds.add(permission.id);
          }
        }
      }
    }

    return permissions;
  }

  /**
   * List roles assigned to a subject
   */
  async getSubjectRoles(subjectType: 'agent' | 'user', subjectId: string): Promise<Role[]> {
    const subjectKey = `${subjectType}:${subjectId}`;
    const assignments = this.roleAssignments.get(subjectKey) || [];
    const roles: Role[] = [];

    for (const assignment of assignments) {
      if (!assignment.isActive) continue;
      
      // Check expiration
      if (assignment.expiresAt && parseInt(assignment.expiresAt) < Date.now()) {
        assignment.isActive = false;
        continue;
      }
      
      const role = this.roles.get(assignment.roleId);
      if (role && role.status === 'active') {
        roles.push(role);
      }
    }

    return roles;
  }

  /**
   * Get all permissions
   */
  async listPermissions(filters?: {
    type?: PermissionType;
    securityLevel?: SecurityLevel;
    requiresApproval?: boolean;
  }): Promise<Permission[]> {
    let permissions = Array.from(this.permissions.values());

    if (filters) {
      if (filters.type) {
        permissions = permissions.filter(p => p.type === filters.type);
      }
      if (filters.securityLevel !== undefined) {
        permissions = permissions.filter(p => this.compareSecurityLevels(p.securityLevel, filters.securityLevel!));
      }
      if (filters.requiresApproval !== undefined) {
        permissions = permissions.filter(p => p.requiresApproval === filters.requiresApproval);
      }
    }

    return permissions;
  }

  /**
   * Get all roles
   */
  async listRoles(filters?: {
    roleType?: string;
    status?: string;
    securityLevel?: SecurityLevel;
  }): Promise<Role[]> {
    let roles = Array.from(this.roles.values());

    if (filters) {
      if (filters.roleType) {
        roles = roles.filter(r => r.roleType === filters.roleType);
      }
      if (filters.status) {
        roles = roles.filter(r => r.status === filters.status);
      }
      if (filters.securityLevel !== undefined) {
        roles = roles.filter(r => this.compareSecurityLevels(r.securityLevel, filters.securityLevel!));
      }
    }

    return roles;
  }

  /**
   * Get policy violations
   */
  async getPolicyViolations(filters?: {
    subjectId?: string;
    resourceType?: string;
    since?: Timestamp;
  }): Promise<PolicyViolation[]> {
    let violations = [...this.policyViolations];

    if (filters) {
      if (filters.subjectId) {
        violations = violations.filter(v => v.subjectId === filters.subjectId);
      }
      if (filters.resourceType) {
        violations = violations.filter(v => v.resourceType === filters.resourceType);
      }
      if (filters.since) {
        violations = violations.filter(v => parseInt(v.timestamp) >= parseInt(filters.since!));
      }
    }

    return violations.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));
  }

  /**
   * Shutdown the policy engine
   */
  async shutdown(): Promise<void> {
    console.log('Policy Engine shutdown complete');
  }

  // Private helper methods

  private async evaluatePermissions(
    permissions: Permission[],
    context: AccessContext
  ): Promise<PolicyEvaluationResult> {
    let bestMatch: PolicyEvaluationResult | null = null;
    const violations: string[] = [];

    for (const permission of permissions) {
      const result = await this.evaluatePermission(permission, context);
      
      if (result.allowed) {
        // Found a permission that grants access
        if (!bestMatch || this.compareSecurityLevels(result.securityLevel, bestMatch.securityLevel)) {
          bestMatch = result;
        }
      } else {
        violations.push(`Permission ${permission.name}: ${result.reason}`);
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    return {
      allowed: false,
      reason: 'No matching permissions found',
      securityLevel: 'development',
      violations
    };
  }

  private async evaluatePermission(
    permission: Permission,
    context: AccessContext
  ): Promise<PolicyEvaluationResult> {
    // Check if permission applies to the resource type
    if (permission.scope.resources) {
      const resourceMatch = permission.scope.resources.some(resource => 
        resource.type === context.resourceType && 
        (resource.ids.includes('*') || resource.ids.includes(context.resourceId))
      );
      
      if (!resourceMatch) {
        return {
          allowed: false,
          reason: 'Permission does not apply to this resource',
          securityLevel: permission.securityLevel
        };
      }
    }

    // Check constraints
    if (permission.constraints) {
      const constraintResult = await this.evaluateConstraints(permission.constraints, context);
      if (!constraintResult.allowed) {
        return constraintResult;
      }
    }

    // If we get here, the permission grants access
    const result: PolicyEvaluationResult = {
      allowed: true,
      reason: `Granted by permission: ${permission.name}`,
      securityLevel: permission.securityLevel
    };

    // Check if approval is required
    if (permission.requiresApproval) {
      result.requiredApprovals = [this.generateApprovalId()];
    }

    return result;
  }

  private async evaluateConstraints(
    constraints: Permission['constraints'],
    context: AccessContext
  ): Promise<PolicyEvaluationResult> {
    if (!constraints) {
      return { allowed: true, reason: 'No constraints', securityLevel: 'development' };
    }

    // Check time windows
    if (constraints.timeWindows) {
      const now = new Date();
      const isWithinTimeWindow = constraints.timeWindows.some(window => {
        const currentDay = now.getDay();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        return window.days.includes(currentDay) && 
               currentTime >= window.start && 
               currentTime <= window.end;
      });

      if (!isWithinTimeWindow) {
        return {
          allowed: false,
          reason: 'Access denied: Outside allowed time window',
          securityLevel: 'development'
        };
      }
    }

    // Check conditions
    if (constraints.conditions) {
      for (const condition of constraints.conditions) {
        // Simplified condition evaluation (in real implementation, use a proper expression evaluator)
        if (!this.evaluateCondition(condition.expression, context)) {
          return {
            allowed: false,
            reason: `Access denied: Condition failed - ${condition.description}`,
            securityLevel: 'development'
          };
        }
      }
    }

    return { allowed: true, reason: 'All constraints satisfied', securityLevel: 'development' };
  }

  private evaluateCondition(expression: string, context: AccessContext): boolean {
    // Simplified condition evaluation
    // In a real implementation, you'd use a proper expression parser/evaluator
    if (expression.includes('securityLevel >= 2')) {
      return context.metadata?.['securityLevel'] >= 2;
    }
    
    // Default to true for unrecognized expressions
    return true;
  }

  private async getInheritedPermissions(role: Role): Promise<Permission[]> {
    const permissions: Permission[] = [];
    const visited = new Set<string>();

    const collectPermissions = async (roleId: string) => {
      if (visited.has(roleId)) return;
      visited.add(roleId);

      const parentRole = this.roles.get(roleId);
      if (!parentRole || parentRole.status !== 'active') return;

      // Add parent role permissions
      for (const permissionId of parentRole.permissions) {
        const permission = this.permissions.get(permissionId);
        if (permission) {
          permissions.push(permission);
        }
      }

      // Recursively collect from parent roles
      for (const parentRoleId of parentRole.parentRoles) {
        await collectPermissions(parentRoleId);
      }
    };

    for (const parentRoleId of role.parentRoles) {
      await collectPermissions(parentRoleId);
    }

    return permissions;
  }

  private async recordPolicyViolations(violations: string[], context: AccessContext): Promise<void> {
    const now = Date.now().toString();
    
    for (const violation of violations) {
      const policyViolation: PolicyViolation = {
        id: this.generateViolationId(),
        type: 'access-denied',
        severity: 'medium',
        subjectType: context.subjectType,
        subjectId: context.subjectId,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
        operation: context.operation,
        violation,
        timestamp: now,
        metadata: context.metadata || {}
      };
      
      this.policyViolations.push(policyViolation);
    }

    // Keep only the most recent 1000 violations
    if (this.policyViolations.length > 1000) {
      this.policyViolations = this.policyViolations
        .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
        .slice(0, 1000);
    }
  }

  private compareSecurityLevels(level1: SecurityLevel, level2: SecurityLevel): boolean {
    const levels = ['development', 'staging', 'production'];
    return levels.indexOf(level1) >= levels.indexOf(level2);
  }

  private initializeDefaultRolesAndPermissions(): void {
    // Create default permissions
    const readPermission: Permission = {
      id: 'perm-read',
      name: 'Read Access',
      description: 'Allows reading resources',
      type: 'knowledge-access',
      scope: { global: true },
      requiresApproval: false,
      tags: ['default'],
      securityLevel: 'development',
      createdBy: 'system',
      createdAt: Date.now().toString(),
      lastModifiedBy: 'system',
      lastModifiedAt: Date.now().toString()
    };

    const writePermission: Permission = {
      id: 'perm-write',
      name: 'Write Access',
      description: 'Allows modifying resources',
      type: 'knowledge-access',
      scope: { 
        global: true,
        resources: [
          { type: 'agent', ids: ['*'] },
          { type: 'realm', ids: ['*'] },
          { type: 'scenario', ids: ['*'] },
          { type: 'workflow', ids: ['*'] },
          { type: 'knowledge', ids: ['*'] },
          { type: 'tool', ids: ['*'] },
          { type: 'configuration', ids: ['*'] }
        ]
      },
      requiresApproval: false,
      tags: ['default'],
      securityLevel: 'staging',
      createdBy: 'system',
      createdAt: Date.now().toString(),
      lastModifiedBy: 'system',
      lastModifiedAt: Date.now().toString()
    };

    const adminPermission: Permission = {
      id: 'perm-admin',
      name: 'Admin Access',
      description: 'Allows full administrative access',
      type: 'knowledge-access',
      scope: { global: true },
      requiresApproval: true,
      tags: ['default', 'admin'],
      securityLevel: 'production',
      createdBy: 'system',
      createdAt: Date.now().toString(),
      lastModifiedBy: 'system',
      lastModifiedAt: Date.now().toString()
    };

    this.permissions.set('perm-read', readPermission);
    this.permissions.set('perm-write', writePermission);
    this.permissions.set('perm-admin', adminPermission);

    // Create default roles
    const now = Date.now().toString();

    const readerRole: Role = {
      id: 'role-reader',
      name: 'Reader',
      description: 'Read-only access to resources',
      roleType: 'system',
      parentRoles: [],
      childRoles: [],
      permissions: ['perm-read'],
      status: 'active',
      tags: ['default'],
      securityLevel: 'development',
      createdBy: 'system',
      lastModifiedBy: 'system',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    const writerRole: Role = {
      id: 'role-writer',
      name: 'Writer',
      description: 'Read and write access to resources',
      roleType: 'system',
      parentRoles: ['role-reader'],
      childRoles: [],
      permissions: ['perm-write'],
      status: 'active',
      tags: ['default'],
      securityLevel: 'staging',
      createdBy: 'system',
      lastModifiedBy: 'system',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    const adminRole: Role = {
      id: 'role-admin',
      name: 'Administrator',
      description: 'Full administrative access',
      roleType: 'system',
      parentRoles: ['role-writer'],
      childRoles: [],
      permissions: ['perm-admin'],
      status: 'active',
      tags: ['default', 'admin'],
      securityLevel: 'production',
      createdBy: 'system',
      lastModifiedBy: 'system',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    // Update child role references
    readerRole.childRoles = ['role-writer'];
    writerRole.childRoles = ['role-admin'];

    this.roles.set('role-reader', readerRole);
    this.roles.set('role-writer', writerRole);
    this.roles.set('role-admin', adminRole);

    // Assign admin role to 'system' user for agent operations
    const systemAdminAssignment: RoleAssignment = {
      id: this.generateAssignmentId(),
      subjectId: 'system',
      subjectType: 'user',
      roleId: 'role-admin',
      assignedBy: 'system',
      assignedAt: now,
      reason: 'Default system permissions for agent operations',
      isActive: true
    };

    const systemAssignments = this.roleAssignments.get('user:system') || [];
    systemAssignments.push(systemAdminAssignment);
    this.roleAssignments.set('user:system', systemAssignments);
  }

  private generatePermissionId(): string {
    return `perm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRoleId(): string {
    return `role-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAssignmentId(): string {
    return `assign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDecisionId(): string {
    return `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateApprovalId(): ApprovalId {
    return `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` as ApprovalId;
  }

  private generateViolationId(): string {
    return `violation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default PolicyEngine;
