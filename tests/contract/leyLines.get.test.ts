import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('GET /realms/{realmId}/ley-lines - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should return list of ley line connections for realm', async () => {
    const realmId = 'test-realm-001';

    const response = await request(app)
      .get(`/realms/${realmId}/ley-lines`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    // If ley lines exist, check structure
    if (response.body.length > 0) {
      const leyLine = response.body[0];
      expect(leyLine).toMatchObject({
        id: expect.any(String),
        sourceRealmId: realmId,
        targetRealmId: expect.any(String),
        status: expect.stringMatching(/^(active|inactive|connecting|disconnected)$/),
        createdAt: expect.any(String),
        configuration: expect.any(Object),
        health: expect.any(Object)
      });
    }
  });

  it('should return empty array when no ley lines exist', async () => {
    const realmId = 'test-realm-isolated';

    const response = await request(app)
      .get(`/realms/${realmId}/ley-lines`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(0);
  });

  it('should include ley line health and performance metrics', async () => {
    const realmId = 'test-realm-connected';

    const response = await request(app)
      .get(`/realms/${realmId}/ley-lines`)
      .expect(200);

    if (response.body.length > 0) {
      const leyLine = response.body[0];
      expect(leyLine.health).toMatchObject({
        status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
        latency: expect.any(Number),
        throughput: expect.any(Number),
        errorRate: expect.any(Number),
        lastHealthCheck: expect.any(String)
      });

      expect(leyLine.configuration).toMatchObject({
        bandwidth: expect.any(Number),
        encryption: expect.any(Boolean),
        protocol: expect.any(String)
      });
    }
  });

  it('should filter ley lines by status query parameter', async () => {
    const realmId = 'test-realm-001';
    const status = 'active';

    const response = await request(app)
      .get(`/realms/${realmId}/ley-lines`)
      .query({ status })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((leyLine: any) => {
      expect(leyLine.status).toBe(status);
    });
  });

  it('should filter ley lines by target realm', async () => {
    const realmId = 'test-realm-001';
    const targetRealmId = 'test-realm-002';

    const response = await request(app)
      .get(`/realms/${realmId}/ley-lines`)
      .query({ targetRealmId })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    
    response.body.forEach((leyLine: any) => {
      expect(leyLine.targetRealmId).toBe(targetRealmId);
    });
  });

  it('should include bidirectional ley line information', async () => {
    const realmId = 'test-realm-hub';

    const response = await request(app)
      .get(`/realms/${realmId}/ley-lines`)
      .expect(200);

    if (response.body.length > 0) {
      const leyLine = response.body[0];
      expect(leyLine.configuration).toMatchObject({
        bidirectional: expect.any(Boolean),
        initiatedBy: expect.any(String)
      });
      
      if (leyLine.configuration.bidirectional) {
        expect(leyLine.configuration).toMatchObject({
          reverseConnectionId: expect.any(String)
        });
      }
    }
  });

  it('should return 404 for non-existent realm', async () => {
    const nonExistentId = 'non-existent-realm';

    const response = await request(app)
      .get(`/realms/${nonExistentId}/ley-lines`)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Realm not found',
      code: 'REALM_NOT_FOUND'
    });
  });

  it('should validate realm ID format', async () => {
    const invalidId = 'invalid realm id with spaces';

    await request(app)
      .get(`/realms/${invalidId}/ley-lines`)
      .expect(400);
  });

  it('should handle pagination for large numbers of ley lines', async () => {
    const realmId = 'test-realm-many-connections';
    const limit = 10;
    const offset = 0;

    const response = await request(app)
      .get(`/realms/${realmId}/ley-lines`)
      .query({ limit, offset })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeLessThanOrEqual(limit);
  });
});
