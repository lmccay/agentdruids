import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('GET /agents - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should return list of all agents', async () => {
    const response = await request(app)
      .get('/agents')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    if (response.body.length > 0) {
      const agent = response.body[0];
      expect(agent).toMatchObject({
        id: expect.any(String),
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
    }
  });

  it('should filter agents by realmId query parameter', async () => {
    const realmId = 'test-realm-filter';
    
    const response = await request(app)
      .get('/agents')
      .query({ realmId })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((agent: any) => {
      expect(agent.realmId).toBe(realmId);
    });
  });

  it('should filter agents by type query parameter', async () => {
    const agentType = 'druid';
    
    const response = await request(app)
      .get('/agents')
      .query({ type: agentType })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((agent: any) => {
      expect(agent.type).toBe(agentType);
    });
  });

  it('should filter agents by status query parameter', async () => {
    const status = 'active';
    
    const response = await request(app)
      .get('/agents')
      .query({ status })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((agent: any) => {
      expect(agent.status).toBe(status);
    });
  });

  it('should handle multiple query parameters', async () => {
    const response = await request(app)
      .get('/agents')
      .query({ 
        realmId: 'test-realm',
        type: 'druid',
        status: 'active'
      })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((agent: any) => {
      expect(agent.realmId).toBe('test-realm');
      expect(agent.type).toBe('druid');
      expect(agent.status).toBe('active');
    });
  });
});
