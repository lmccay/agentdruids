import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('POST /agents - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should create a new agent and return 201', async () => {
    const newAgent = {
      id: 'test-druid-new-001',
      type: 'druid',
      realmId: 'test-realm',
      configuration: {
        llmModel: 'llama2',
        systemPrompt: 'You are a coordination specialist',
        toolAccess: [],
        knowledgeAccess: [
          {
            agentId: 'test-druid-new-001',
            namespacePath: '/agents/test-druid-new-001/private',
            permissions: ['read', 'write']
          }
        ],
        persona: {
          id: 'collaborative-coordinator',
          name: 'Collaborative Coordinator',
          description: 'Focuses on team collaboration',
          coordinationStyle: 'collaborative',
          decisionMakingApproach: 'consensus-driven',
          managementPrinciples: ['transparency', 'inclusion'],
          elementalBindings: []
        }
      }
    };

    const response = await request(app)
      .post('/agents')
      .send(newAgent)
      .expect(201);

    expect(response.body).toMatchObject({
      id: 'test-druid-new-001',
      type: 'druid',
      realmId: 'test-realm',
      status: 'active',
      configuration: expect.objectContaining({
        llmModel: 'llama2',
        systemPrompt: 'You are a coordination specialist'
      })
    });

    expect(response.body.createdAt).toBeDefined();
    expect(response.body.lastActive).toBeDefined();
  });

  it('should return 400 for invalid agent configuration', async () => {
    const invalidAgent = {
      id: 'invalid-agent',
      type: 'invalid-type',
      realmId: 'test-realm'
      // Missing required configuration
    };

    await request(app)
      .post('/agents')
      .send(invalidAgent)
      .expect(400);
  });

  it('should return 409 if agent ID already exists', async () => {
    const duplicateAgent = {
      id: 'duplicate-agent-unique-002',
      type: 'elemental',
      realmId: 'test-realm',
      configuration: {
        llmModel: 'llama2',
        systemPrompt: 'Test prompt',
        toolAccess: [],
        knowledgeAccess: []
      }
    };

    // First creation should succeed
    await request(app)
      .post('/agents')
      .send(duplicateAgent)
      .expect(201);

    // Second creation should fail
    await request(app)
      .post('/agents')
      .send(duplicateAgent)
      .expect(409);
  });
});
