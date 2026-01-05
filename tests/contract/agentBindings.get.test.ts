import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('GET /agents/{agentId}/bindings - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should return list of agent bindings', async () => {
    const agentId = 'test-druid-001';

    const response = await request(app)
      .get(`/agents/${agentId}/bindings`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    // If bindings exist, check structure
    if (response.body.length > 0) {
      const binding = response.body[0];
      expect(binding).toMatchObject({
        id: expect.any(String),
        agentId: agentId,
        targetAgentId: expect.any(String),
        type: expect.stringMatching(/^(collaboration|dependency|communication)$/),
        status: expect.stringMatching(/^(active|inactive|pending)$/),
        createdAt: expect.any(String),
        configuration: expect.any(Object)
      });
    }
  });

  it('should return empty array when no bindings exist', async () => {
    const agentId = 'test-druid-no-bindings';

    const response = await request(app)
      .get(`/agents/${agentId}/bindings`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(0);
  });

  it('should include binding metadata and permissions', async () => {
    const druidId = 'test-druid-with-bindings';

    const response = await request(app)
      .get(`/agents/${druidId}/bindings`)
      .expect(200);

    if (response.body.length > 0) {
      const binding = response.body[0];
      expect(binding.configuration).toMatchObject({
        permissions: expect.any(Object),
        constraints: expect.any(Object)
      });
      
      if (binding.configuration.permissions) {
        expect(binding.configuration.permissions).toMatchObject({
          canDelegate: expect.any(Boolean),
          canModify: expect.any(Boolean),
          accessLevel: expect.stringMatching(/^(read|write|admin)$/)
        });
      }
    }
  });

  it('should filter bindings by type query parameter', async () => {
    const agentId = 'test-druid-001';
    const bindingType = 'collaboration';

    const response = await request(app)
      .get(`/agents/${agentId}/bindings`)
      .query({ type: bindingType })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((binding: any) => {
      expect(binding.type).toBe(bindingType);
    });
  });

  it('should filter bindings by status query parameter', async () => {
    const agentId = 'test-druid-001';
    const status = 'active';

    const response = await request(app)
      .get(`/agents/${agentId}/bindings`)
      .query({ status })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((binding: any) => {
      expect(binding.status).toBe(status);
    });
  });

  it('should return 404 for non-existent agent', async () => {
    const nonExistentId = 'non-existent-agent';

    const response = await request(app)
      .get(`/agents/${nonExistentId}/bindings`)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Agent not found',
      code: 'AGENT_NOT_FOUND'
    });
  });

  it('should validate agent ID format', async () => {
    const invalidId = 'invalid id with spaces';

    await request(app)
      .get(`/agents/${invalidId}/bindings`)
      .expect(400);
  });
});
