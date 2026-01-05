import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('POST /tools/access - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should request tool access and return access token', async () => {
    const accessRequest = {
      agentId: 'test-druid-001',
      toolId: 'file-system-access',
      requestedPermissions: ['read', 'write'],
      justification: 'Need file access for data processing task',
      duration: 3600 // 1 hour
    };

    const response = await request(app)
      .post('/tools/access')
      .send(accessRequest)
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      agentId: accessRequest.agentId,
      toolId: accessRequest.toolId,
      grantedPermissions: expect.arrayContaining(accessRequest.requestedPermissions),
      expiresAt: expect.any(String),
      status: 'granted'
    });
  });

  it('should request MCP tool access with protocol configuration', async () => {
    const mcpAccessRequest = {
      agentId: 'test-elemental-data',
      toolId: 'external-api-client',
      toolType: 'mcp',
      requestedPermissions: ['execute'],
      mcpConfiguration: {
        serverUrl: 'https://api.external-service.com',
        protocol: 'json-rpc',
        authentication: {
          type: 'bearer',
          tokenSource: 'environment'
        }
      },
      justification: 'External data retrieval for specialization tasks',
      duration: 7200 // 2 hours
    };

    const response = await request(app)
      .post('/tools/access')
      .send(mcpAccessRequest)
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      toolId: mcpAccessRequest.toolId,
      toolType: 'mcp',
      mcpConfiguration: mcpAccessRequest.mcpConfiguration,
      grantedPermissions: ['execute']
    });
  });

  it('should request temporary tool access with auto-revocation', async () => {
    const temporaryAccessRequest = {
      agentId: 'test-druid-coordinator',
      toolId: 'system-monitoring',
      requestedPermissions: ['read'],
      justification: 'Health check monitoring during scenario execution',
      duration: 1800, // 30 minutes
      autoRevoke: {
        onTaskCompletion: true,
        onError: true,
        maxUsageCount: 10
      }
    };

    const response = await request(app)
      .post('/tools/access')
      .send(temporaryAccessRequest)
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      autoRevoke: temporaryAccessRequest.autoRevoke,
      usageTracking: expect.objectContaining({
        maxUsageCount: 10,
        currentUsageCount: 0
      })
    });
  });

  it('should request delegated tool access for agent binding', async () => {
    const delegatedAccessRequest = {
      agentId: 'test-druid-lead',
      toolId: 'data-analytics',
      requestedPermissions: ['read', 'execute'],
      justification: 'Delegated access for coordinated data analysis',
      duration: 3600,
      delegation: {
        delegatedTo: 'test-elemental-analyst',
        allowSubDelegation: false,
        delegationScope: ['specific-dataset-access']
      }
    };

    const response = await request(app)
      .post('/tools/access')
      .send(delegatedAccessRequest)
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      delegation: expect.objectContaining({
        delegatedTo: 'test-elemental-analyst',
        allowSubDelegation: false,
        delegationScope: ['specific-dataset-access']
      }),
      isDelegated: true
    });
  });

  it('should request tool access with resource constraints', async () => {
    const constrainedAccessRequest = {
      agentId: 'test-elemental-compute',
      toolId: 'high-performance-compute',
      requestedPermissions: ['execute'],
      justification: 'Compute-intensive analysis task',
      duration: 5400, // 1.5 hours
      resourceConstraints: {
        maxMemoryMB: 2048,
        maxCpuPercent: 75,
        maxDiskUsageMB: 1024,
        maxNetworkMbps: 100
      }
    };

    const response = await request(app)
      .post('/tools/access')
      .send(constrainedAccessRequest)
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      resourceConstraints: constrainedAccessRequest.resourceConstraints,
      monitoring: expect.objectContaining({
        resourceTracking: true,
        alertThresholds: expect.any(Object)
      })
    });
  });

  it('should return 400 for missing required fields', async () => {
    const incompleteRequest = {
      toolId: 'test-tool',
      requestedPermissions: ['read']
      // Missing agentId and justification
    };

    const response = await request(app)
      .post('/tools/access')
      .send(incompleteRequest)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringMatching(/(agentId|justification)/),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 400 for invalid permission types', async () => {
    const invalidRequest = {
      agentId: 'test-agent',
      toolId: 'test-tool',
      requestedPermissions: ['invalid-permission'],
      justification: 'Test request',
      duration: 3600
    };

    const response = await request(app)
      .post('/tools/access')
      .send(invalidRequest)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('permission'),
      code: 'INVALID_PERMISSIONS'
    });
  });

  it('should return 404 for non-existent agent', async () => {
    const accessRequest = {
      agentId: 'non-existent-agent',
      toolId: 'test-tool',
      requestedPermissions: ['read'],
      justification: 'Test request',
      duration: 3600
    };

    const response = await request(app)
      .post('/tools/access')
      .send(accessRequest)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Agent not found',
      code: 'AGENT_NOT_FOUND'
    });
  });

  it('should return 404 for non-existent tool', async () => {
    const accessRequest = {
      agentId: 'test-druid-001',
      toolId: 'non-existent-tool',
      requestedPermissions: ['read'],
      justification: 'Test request',
      duration: 3600
    };

    const response = await request(app)
      .post('/tools/access')
      .send(accessRequest)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Tool not found',
      code: 'TOOL_NOT_FOUND'
    });
  });

  it('should return 403 for unauthorized tool access', async () => {
    const unauthorizedRequest = {
      agentId: 'test-druid-restricted',
      toolId: 'admin-only-tool',
      requestedPermissions: ['admin'],
      justification: 'Attempting admin access',
      duration: 3600
    };

    const response = await request(app)
      .post('/tools/access')
      .send(unauthorizedRequest)
      .expect(403);

    expect(response.body).toMatchObject({
      error: 'Access denied to tool',
      code: 'TOOL_ACCESS_DENIED'
    });
  });

  it('should return 403 for insufficient agent permissions', async () => {
    const insufficientRequest = {
      agentId: 'test-elemental-basic',
      toolId: 'privileged-system-tool',
      requestedPermissions: ['write', 'admin'],
      justification: 'Requesting elevated permissions',
      duration: 3600
    };

    const response = await request(app)
      .post('/tools/access')
      .send(insufficientRequest)
      .expect(403);

    expect(response.body).toMatchObject({
      error: 'Insufficient agent permissions',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  });

  it('should return 429 for rate limit exceeded', async () => {
    const rateLimitedRequest = {
      agentId: 'test-agent-high-frequency',
      toolId: 'rate-limited-tool',
      requestedPermissions: ['read'],
      justification: 'High frequency access request',
      duration: 300 // 5 minutes
    };

    const response = await request(app)
      .post('/tools/access')
      .send(rateLimitedRequest)
      .expect(429);

    expect(response.body).toMatchObject({
      error: 'Rate limit exceeded for tool access requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: expect.any(Number)
    });
  });

  it('should handle conditional tool access based on agent state', async () => {
    const conditionalRequest = {
      agentId: 'test-druid-conditional',
      toolId: 'state-dependent-tool',
      requestedPermissions: ['execute'],
      justification: 'Conditional access based on agent readiness',
      duration: 3600,
      conditions: {
        requireActiveStatus: true,
        requireMinimumVersion: '1.2.0',
        requireCapabilities: ['data-processing']
      }
    };

    const response = await request(app)
      .post('/tools/access')
      .send(conditionalRequest)
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      conditions: conditionalRequest.conditions,
      conditionsMet: true
    });
  });

  it('should request tool access with audit trail requirements', async () => {
    const auditedRequest = {
      agentId: 'test-druid-audited',
      toolId: 'audited-tool',
      requestedPermissions: ['read', 'write'],
      justification: 'Audited access for compliance requirements',
      duration: 3600,
      auditRequirements: {
        logAllActions: true,
        retentionDays: 90,
        complianceLevel: 'high',
        notifyOnUsage: true
      }
    };

    const response = await request(app)
      .post('/tools/access')
      .send(auditedRequest)
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      auditRequirements: auditedRequest.auditRequirements,
      auditTrail: expect.objectContaining({
        enabled: true,
        auditId: expect.any(String)
      })
    });
  });
});
