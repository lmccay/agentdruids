import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('POST /realms/{realmId}/ley-lines - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should create new ley line connection and return 201', async () => {
    const sourceRealmId = 'test-realm-001';
    const newLeyLine = {
      targetRealmId: 'test-realm-002',
      configuration: {
        bandwidth: 1000, // MB/s
        encryption: true,
        protocol: 'secure-mcp',
        bidirectional: true,
        priority: 'normal'
      }
    };

    const response = await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(newLeyLine)
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      sourceRealmId: sourceRealmId,
      targetRealmId: newLeyLine.targetRealmId,
      status: 'connecting',
      createdAt: expect.any(String),
      configuration: newLeyLine.configuration,
      health: expect.objectContaining({
        status: 'establishing',
        latency: 0,
        throughput: 0,
        errorRate: 0
      })
    });
  });

  it('should create high-priority ley line with advanced configuration', async () => {
    const sourceRealmId = 'test-realm-production';
    const priorityLeyLine = {
      targetRealmId: 'test-realm-backup',
      configuration: {
        bandwidth: 5000, // High bandwidth
        encryption: true,
        protocol: 'secure-mcp',
        bidirectional: false,
        priority: 'high',
        failoverConfig: {
          enabled: true,
          retryAttempts: 3,
          timeoutSeconds: 30
        },
        monitoring: {
          healthCheckInterval: 5000, // 5 seconds
          alertThresholds: {
            latency: 100, // ms
            errorRate: 0.01 // 1%
          }
        }
      }
    };

    const response = await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(priorityLeyLine)
      .expect(201);

    expect(response.body.configuration.priority).toBe('high');
    expect(response.body.configuration.failoverConfig.enabled).toBe(true);
    expect(response.body.configuration.monitoring.healthCheckInterval).toBe(5000);
  });

  it('should create bidirectional ley line with symmetric configuration', async () => {
    const sourceRealmId = 'test-realm-hub';
    const bidirectionalLeyLine = {
      targetRealmId: 'test-realm-spoke',
      configuration: {
        bandwidth: 2000,
        encryption: true,
        protocol: 'secure-mcp',
        bidirectional: true,
        priority: 'normal',
        symmetricConfiguration: true
      }
    };

    const response = await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(bidirectionalLeyLine)
      .expect(201);

    expect(response.body.configuration.bidirectional).toBe(true);
    expect(response.body.configuration.symmetricConfiguration).toBe(true);
    
    // Should include reverse connection reference
    if (response.body.configuration.bidirectional) {
      expect(response.body.configuration).toMatchObject({
        reverseConnectionId: expect.any(String)
      });
    }
  });

  it('should return 400 for missing required fields', async () => {
    const sourceRealmId = 'test-realm-001';
    const incompleteLeyLine = {
      configuration: {
        bandwidth: 1000
      }
      // Missing targetRealmId
    };

    const response = await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(incompleteLeyLine)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('targetRealmId'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 400 for invalid configuration values', async () => {
    const sourceRealmId = 'test-realm-001';
    const invalidLeyLine = {
      targetRealmId: 'test-realm-002',
      configuration: {
        bandwidth: -1, // Invalid negative bandwidth
        encryption: true,
        protocol: 'invalid-protocol',
        priority: 'invalid-priority'
      }
    };

    const response = await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(invalidLeyLine)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringMatching(/(bandwidth|protocol|priority)/),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 404 for non-existent source realm', async () => {
    const nonExistentId = 'non-existent-realm';
    const leyLine = {
      targetRealmId: 'test-realm-002',
      configuration: {
        bandwidth: 1000,
        encryption: true,
        protocol: 'secure-mcp'
      }
    };

    const response = await request(app)
      .post(`/realms/${nonExistentId}/ley-lines`)
      .send(leyLine)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Source realm not found',
      code: 'REALM_NOT_FOUND'
    });
  });

  it('should return 404 for non-existent target realm', async () => {
    const sourceRealmId = 'test-realm-001';
    const leyLine = {
      targetRealmId: 'non-existent-target',
      configuration: {
        bandwidth: 1000,
        encryption: true,
        protocol: 'secure-mcp'
      }
    };

    const response = await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(leyLine)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Target realm not found',
      code: 'TARGET_REALM_NOT_FOUND'
    });
  });

  it('should return 409 if ley line already exists', async () => {
    const sourceRealmId = 'test-realm-001';
    const leyLine = {
      targetRealmId: 'test-realm-002',
      configuration: {
        bandwidth: 1000,
        encryption: true,
        protocol: 'secure-mcp'
      }
    };

    // First creation should succeed
    await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(leyLine)
      .expect(201);

    // Second creation should fail
    const response = await request(app)
      .post(`/realms/${sourceRealmId}/ley-lines`)
      .send(leyLine)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Ley line already exists between these realms',
      code: 'LEY_LINE_ALREADY_EXISTS'
    });
  });

  it('should return 409 for self-referencing ley line', async () => {
    const realmId = 'test-realm-001';
    const selfLeyLine = {
      targetRealmId: realmId, // Same as source
      configuration: {
        bandwidth: 1000,
        encryption: true,
        protocol: 'secure-mcp'
      }
    };

    const response = await request(app)
      .post(`/realms/${realmId}/ley-lines`)
      .send(selfLeyLine)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Cannot create ley line to same realm',
      code: 'SELF_REFERENCING_LEY_LINE'
    });
  });

  it('should validate realm ID format', async () => {
    const invalidId = 'invalid realm id with spaces';
    const leyLine = {
      targetRealmId: 'test-realm-002',
      configuration: {
        bandwidth: 1000
      }
    };

    await request(app)
      .post(`/realms/${invalidId}/ley-lines`)
      .send(leyLine)
      .expect(400);
  });
});
