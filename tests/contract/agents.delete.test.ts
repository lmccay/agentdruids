import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('DELETE /agents/{agentId} - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should delete agent and return 204', async () => {
    const agentId = 'test-druid-001';

    await request(app)
      .delete(`/agents/${agentId}`)
      .expect(204);
  });

  it('should delete elemental agent with dependencies', async () => {
    const elementalId = 'test-elemental-001';

    await request(app)
      .delete(`/agents/${elementalId}`)
      .expect(204);
  });

  it('should return 404 for non-existent agent', async () => {
    const nonExistentId = 'non-existent-agent';

    const response = await request(app)
      .delete(`/agents/${nonExistentId}`)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Agent not found',
      code: 'AGENT_NOT_FOUND'
    });
  });

  it('should return 409 when agent has active bindings', async () => {
    const agentId = 'test-druid-with-bindings';

    const response = await request(app)
      .delete(`/agents/${agentId}`)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Cannot delete agent with active bindings',
      code: 'AGENT_HAS_BINDINGS'
    });
  });

  it('should return 409 when agent is participating in active scenario', async () => {
    const agentId = 'test-druid-in-scenario';

    const response = await request(app)
      .delete(`/agents/${agentId}`)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Cannot delete agent participating in active scenario',
      code: 'AGENT_IN_ACTIVE_SCENARIO'
    });
  });

  it('should validate agent ID format', async () => {
    const invalidId = 'invalid id with spaces';

    await request(app)
      .delete(`/agents/${invalidId}`)
      .expect(400);
  });
});
