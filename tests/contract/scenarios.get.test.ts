import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('GET /scenarios - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should return list of all scenarios', async () => {
    const response = await request(app)
      .get('/scenarios')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    // If scenarios exist, check structure
    if (response.body.length > 0) {
      const scenario = response.body[0];
      expect(scenario).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        type: expect.stringMatching(/^(collaboration|competition|self-play|benchmark)$/),
        status: expect.stringMatching(/^(draft|ready|running|completed|failed)$/),
        createdAt: expect.any(String),
        participants: expect.any(Array),
        configuration: expect.any(Object)
      });
    }
  });

  it('should filter scenarios by type query parameter', async () => {
    const scenarioType = 'collaboration';

    const response = await request(app)
      .get('/scenarios')
      .query({ type: scenarioType })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((scenario: any) => {
      expect(scenario.type).toBe(scenarioType);
    });
  });

  it('should filter scenarios by status query parameter', async () => {
    const status = 'running';

    const response = await request(app)
      .get('/scenarios')
      .query({ status })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((scenario: any) => {
      expect(scenario.status).toBe(status);
    });
  });

  it('should filter scenarios by participant agent ID', async () => {
    const participantId = 'test-druid-001';

    const response = await request(app)
      .get('/scenarios')
      .query({ participantId })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((scenario: any) => {
      const participantIds = scenario.participants.map((p: any) => p.agentId);
      expect(participantIds).toContain(participantId);
    });
  });

  it('should include scenario metrics and progress', async () => {
    const response = await request(app)
      .get('/scenarios')
      .expect(200);

    if (response.body.length > 0) {
      const scenario = response.body[0];
      if (scenario.status === 'running' || scenario.status === 'completed') {
        expect(scenario).toMatchObject({
          metrics: expect.objectContaining({
            executionTime: expect.any(Number),
            messagesExchanged: expect.any(Number),
            tasksCompleted: expect.any(Number)
          }),
          progress: expect.objectContaining({
            percentage: expect.any(Number),
            currentPhase: expect.any(String)
          })
        });
      }
    }
  });

  it('should handle pagination with limit and offset', async () => {
    const limit = 5;
    const offset = 0;

    const response = await request(app)
      .get('/scenarios')
      .query({ limit, offset })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeLessThanOrEqual(limit);
  });

  it('should sort scenarios by creation date descending by default', async () => {
    const response = await request(app)
      .get('/scenarios')
      .expect(200);

    if (response.body.length > 1) {
      for (let i = 1; i < response.body.length; i++) {
        const prev = new Date(response.body[i - 1].createdAt);
        const curr = new Date(response.body[i].createdAt);
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    }
  });

  it('should support custom sorting', async () => {
    const response = await request(app)
      .get('/scenarios')
      .query({ sortBy: 'name', sortOrder: 'asc' })
      .expect(200);

    if (response.body.length > 1) {
      for (let i = 1; i < response.body.length; i++) {
        expect(response.body[i - 1].name.localeCompare(response.body[i].name)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('should return empty array when no scenarios exist', async () => {
    // This test assumes a fresh/empty state
    const response = await request(app)
      .get('/scenarios')
      .query({ type: 'non-existent-type' })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
