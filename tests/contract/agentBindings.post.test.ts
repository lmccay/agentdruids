import request from "supertest";
import { DruidApp } from "../../src/app";

describe('POST /agents/{agentId}/bindings - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    // This will fail until the actual app is implemented
    const druidApp = new DruidApp(); app = druidApp.getApp();
  });

  it('should create new agent binding and return 201', async () => {
    const agentId = 'test-druid-001';
    const newBinding = {
      targetAgentId: 'test-elemental-001',
      type: 'collaboration',
      configuration: {
        permissions: {
          canDelegate: true,
          canModify: false,
          accessLevel: 'write'
        },
        constraints: {
          maxRequests: 100,
          timeWindow: '1h'
        }
      }
    };

    const response = await request(app)
      .post(`/agents/${agentId}/bindings`)
      .send(newBinding)
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      agentId: agentId,
      targetAgentId: newBinding.targetAgentId,
      type: newBinding.type,
      status: 'active',
      createdAt: expect.any(String),
      configuration: newBinding.configuration
    });
  });

  it('should create dependency binding with elemental agent', async () => {
    const druidId = 'test-druid-002';
    const dependencyBinding = {
      targetAgentId: 'test-elemental-data',
      type: 'dependency',
      configuration: {
        permissions: {
          canDelegate: false,
          canModify: false,
          accessLevel: 'read'
        },
        constraints: {
          requiredCapabilities: ['data-processing', 'analysis']
        }
      }
    };

    const response = await request(app)
      .post(`/agents/${druidId}/bindings`)
      .send(dependencyBinding)
      .expect(201);

    expect(response.body.type).toBe('dependency');
    expect(response.body.configuration.constraints.requiredCapabilities).toEqual(
      ['data-processing', 'analysis']
    );
  });

  it('should create communication binding between druids', async () => {
    const druidId = 'test-druid-lead';
    const communicationBinding = {
      targetAgentId: 'test-druid-follower',
      type: 'communication',
      configuration: {
        permissions: {
          canDelegate: true,
          canModify: true,
          accessLevel: 'admin'
        },
        constraints: {
          communicationProtocol: 'direct',
          encryptionRequired: true
        }
      }
    };

    const response = await request(app)
      .post(`/agents/${druidId}/bindings`)
      .send(communicationBinding)
      .expect(201);

    expect(response.body.type).toBe('communication');
    expect(response.body.configuration.constraints.communicationProtocol).toBe('direct');
  });

  it('should return 400 for missing required fields', async () => {
    const agentId = 'test-druid-001';
    const incompleteBinding = {
      type: 'collaboration'
      // Missing targetAgentId
    };

    const response = await request(app)
      .post(`/agents/${agentId}/bindings`)
      .send(incompleteBinding)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('targetAgentId'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 400 for invalid binding type', async () => {
    const agentId = 'test-druid-001';
    const invalidBinding = {
      targetAgentId: 'test-elemental-001',
      type: 'invalid-type',
      configuration: {}
    };

    const response = await request(app)
      .post(`/agents/${agentId}/bindings`)
      .send(invalidBinding)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('type'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 404 for non-existent source agent', async () => {
    const nonExistentId = 'non-existent-agent';
    const binding = {
      targetAgentId: 'test-elemental-001',
      type: 'collaboration',
      configuration: {}
    };

    const response = await request(app)
      .post(`/agents/${nonExistentId}/bindings`)
      .send(binding)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Agent not found',
      code: 'AGENT_NOT_FOUND'
    });
  });

  it('should return 404 for non-existent target agent', async () => {
    const agentId = 'test-druid-001';
    const binding = {
      targetAgentId: 'non-existent-target',
      type: 'collaboration',
      configuration: {}
    };

    const response = await request(app)
      .post(`/agents/${agentId}/bindings`)
      .send(binding)
      .expect(404);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('target agent'),
      code: 'TARGET_AGENT_NOT_FOUND'
    });
  });

  it('should return 409 if binding already exists', async () => {
    const agentId = 'test-druid-001';
    const duplicateBinding = {
      targetAgentId: 'test-elemental-001',
      type: 'collaboration',
      configuration: {}
    };

    // First creation should succeed
    await request(app)
      .post(`/agents/${agentId}/bindings`)
      .send(duplicateBinding)
      .expect(201);

    // Second creation should fail
    const response = await request(app)
      .post(`/agents/${agentId}/bindings`)
      .send(duplicateBinding)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Binding already exists',
      code: 'BINDING_ALREADY_EXISTS'
    });
  });

  it('should validate agent ID format', async () => {
    const invalidId = 'invalid id with spaces';
    const binding = {
      targetAgentId: 'test-elemental-001',
      type: 'collaboration',
      configuration: {}
    };

    await request(app)
      .post(`/agents/${invalidId}/bindings`)
      .send(binding)
      .expect(400);
  });
});
