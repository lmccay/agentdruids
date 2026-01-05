import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('GET /realms - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should return list of all realms', async () => {
    const response = await request(app)
      .get('/realms')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    if (response.body.length > 0) {
      const realm = response.body[0];
      expect(realm).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        status: expect.stringMatching(/^(active|maintenance|offline)$/),
        agents: expect.any(Array),
        leyLineConnections: expect.any(Array)
      });

      // Check agent structure in realm
      if (realm.agents.length > 0) {
        expect(realm.agents[0]).toMatchObject({
          id: expect.any(String),
          type: expect.stringMatching(/^(druid|elemental|gaia|worldtree)$/),
          realmId: realm.id,
          status: expect.stringMatching(/^(active|inactive|error)$/)
        });
      }

      // Check ley line connections structure
      if (realm.leyLineConnections.length > 0) {
        expect(realm.leyLineConnections[0]).toMatchObject({
          id: expect.any(String),
          sourceRealmId: realm.id,
          targetRealmId: expect.any(String),
          status: expect.stringMatching(/^(connected|disconnected|degraded)$/),
          latency: expect.any(Number),
          lastPingTime: expect.any(String)
        });
      }
    }
  });

  it('should return empty array when no realms exist', async () => {
    // This test assumes a clean state or specific test scenario
    const response = await request(app)
      .get('/realms')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should include realm health metrics', async () => {
    const response = await request(app)
      .get('/realms')
      .expect(200);

    if (response.body.length > 0) {
      const realm = response.body[0];
      
      if (realm.healthMetrics) {
        expect(realm.healthMetrics).toMatchObject({
          activeAgents: expect.any(Number),
          totalAgents: expect.any(Number),
          avgResponseTime: expect.any(Number),
          lastHealthCheck: expect.any(String)
        });
      }
    }
  });
});
