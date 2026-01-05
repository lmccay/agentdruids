import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('GET /agents/{agentId} - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should return agent details for valid agent ID', async () => {
    const agentId = 'test-agent-001';
    
    const response = await request(app)
      .get(`/agents/${agentId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: agentId,
      type: expect.stringMatching(/^(druid|elemental|gaia|worldtree)$/),
      realmId: expect.any(String),
      status: expect.stringMatching(/^(active|inactive|error)$/),
      createdAt: expect.any(String),
      lastActive: expect.any(String),
      configuration: expect.objectContaining({
        llmModel: expect.any(String),
        systemPrompt: expect.any(String),
        toolAccess: expect.any(Array),
        knowledgeAccess: expect.any(Array)
      })
    });
  });

  it('should include persona for druid agents', async () => {
    const druidId = 'test-druid-001';
    
    const response = await request(app)
      .get(`/agents/${druidId}`)
      .expect(200);

    if (response.body.type === 'druid') {
      expect(response.body.configuration.persona).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        coordinationStyle: expect.stringMatching(/^(collaborative|directive|consultative|delegative)$/),
        decisionMakingApproach: expect.any(String),
        managementPrinciples: expect.any(Array),
        elementalBindings: expect.any(Array)
      });
    }
  });

  it('should include specialization for elemental agents', async () => {
    const elementalId = 'test-elemental-001';
    
    const response = await request(app)
      .get(`/agents/${elementalId}`)
      .expect(200);

    if (response.body.type === 'elemental') {
      expect(response.body.configuration.specialization).toMatchObject({
        id: expect.any(String),
        domain: expect.any(String),
        expertise: expect.any(Array),
        capabilities: expect.any(Array),
        constraints: expect.any(Array),
        defaultPrompts: expect.any(Array)
      });
    }
  });

  it('should return 404 for non-existent agent ID', async () => {
    const nonExistentId = 'non-existent-agent-999';
    
    await request(app)
      .get(`/agents/${nonExistentId}`)
      .expect(404);
  });

  it('should validate agent ID format', async () => {
    const invalidId = 'invalid/agent/id';
    
    await request(app)
      .get(`/agents/${invalidId}`)
      .expect(400);
  });
});
