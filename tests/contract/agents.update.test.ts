import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('PUT /agents/{agentId} - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should update agent configuration and return updated agent', async () => {
    const agentId = 'test-agent-update';
    const updateData = {
      configuration: {
        llmModel: 'llama2-updated',
        systemPrompt: 'Updated system prompt for testing',
        toolAccess: [
          {
            agentId: 'test-agent-update',
            mcpServerId: 'test-mcp-server',
            toolName: 'analysis-tool',
            permissions: ['invoke']
          }
        ],
        knowledgeAccess: [
          {
            agentId: 'test-agent-update',
            namespacePath: '/agents/test-agent-update/private',
            permissions: ['read', 'write']
          }
        ]
      },
      status: 'active'
    };

    const response = await request(app)
      .put(`/agents/${agentId}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toMatchObject({
      id: agentId,
      configuration: expect.objectContaining({
        llmModel: 'llama2-updated',
        systemPrompt: 'Updated system prompt for testing'
      }),
      status: 'active'
    });

    expect(response.body.lastActive).toBeDefined();
  });

  it('should update druid persona', async () => {
    const druidId = 'test-druid-update';
    const updateData = {
      configuration: {
        llmModel: 'llama2',
        systemPrompt: 'Druid coordinator prompt',
        toolAccess: [],
        knowledgeAccess: [],
        persona: {
          id: 'updated-coordinator',
          name: 'Updated Coordinator',
          description: 'Updated coordination style',
          coordinationStyle: 'directive',
          decisionMakingApproach: 'hierarchical',
          managementPrinciples: ['efficiency', 'clarity'],
          elementalBindings: ['elemental-001', 'elemental-002']
        }
      }
    };

    const response = await request(app)
      .put(`/agents/${druidId}`)
      .send(updateData)
      .expect(200);

    expect(response.body.configuration.persona).toMatchObject({
      id: 'updated-coordinator',
      coordinationStyle: 'directive',
      elementalBindings: ['elemental-001', 'elemental-002']
    });
  });

  it('should return 404 for non-existent agent', async () => {
    const nonExistentId = 'non-existent-agent';
    const updateData = {
      configuration: {
        llmModel: 'llama2',
        systemPrompt: 'Test prompt',
        toolAccess: [],
        knowledgeAccess: []
      }
    };

    await request(app)
      .put(`/agents/${nonExistentId}`)
      .send(updateData)
      .expect(404);
  });

  it('should return 400 for invalid configuration', async () => {
    const agentId = 'test-agent-invalid';
    const invalidUpdate = {
      configuration: {
        llmModel: '', // Invalid empty model
        systemPrompt: 'Test prompt',
        toolAccess: 'invalid-format', // Should be array
        knowledgeAccess: []
      }
    };

    await request(app)
      .put(`/agents/${agentId}`)
      .send(invalidUpdate)
      .expect(400);
  });
});
