import request from "supertest";
import { DruidApp } from "../../src/app";

describe('POST /realms - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    // This will fail until the actual app is implemented
    const druidApp = new DruidApp(); app = druidApp.getApp();
  });

  it('should create new realm and return 201', async () => {
    const newRealm = {
      name: 'Test Development Realm',
      description: 'A realm for testing and development activities',
      configuration: {
        maxAgents: 50,
        defaultTtl: 86400, // 24 hours
        securityLevel: 'medium',
        allowedAgentTypes: ['druid', 'elemental'],
        policies: {
          requireAuthentication: true,
          allowCrossRealmCommunication: true,
          logLevel: 'info'
        }
      }
    };

    const response = await request(app)
      .post('/realms')
      .send(newRealm)
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: newRealm.name,
      description: newRealm.description,
      status: 'active',
      createdAt: expect.any(String),
      configuration: newRealm.configuration,
      health: expect.objectContaining({
        status: 'healthy',
        activeAgents: 0,
        leyLineConnections: 0
      })
    });
  });

  it('should create production realm with strict configuration', async () => {
    const productionRealm = {
      name: 'Production Realm',
      description: 'High-security realm for production workloads',
      configuration: {
        maxAgents: 20,
        defaultTtl: 3600, // 1 hour
        securityLevel: 'high',
        allowedAgentTypes: ['druid'],
        policies: {
          requireAuthentication: true,
          allowCrossRealmCommunication: false,
          logLevel: 'debug',
          encryptionRequired: true
        }
      }
    };

    const response = await request(app)
      .post('/realms')
      .send(productionRealm)
      .expect(201);

    expect(response.body.configuration.securityLevel).toBe('high');
    expect(response.body.configuration.policies.encryptionRequired).toBe(true);
  });

  it('should create realm with custom ley line configuration', async () => {
    const realmWithLeyLines = {
      name: 'Interconnected Realm',
      description: 'Realm with pre-configured ley line connections',
      configuration: {
        maxAgents: 30,
        defaultTtl: 43200, // 12 hours
        securityLevel: 'medium',
        allowedAgentTypes: ['druid', 'elemental'],
        leyLineConfig: {
          autoConnect: true,
          maxConnections: 5,
          connectionTimeout: 30
        }
      }
    };

    const response = await request(app)
      .post('/realms')
      .send(realmWithLeyLines)
      .expect(201);

    expect(response.body.configuration.leyLineConfig).toMatchObject({
      autoConnect: true,
      maxConnections: 5,
      connectionTimeout: 30
    });
  });

  it('should return 400 for missing required fields', async () => {
    const incompleteRealm = {
      description: 'Missing name field'
      // Missing required name field
    };

    const response = await request(app)
      .post('/realms')
      .send(incompleteRealm)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('name'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 400 for invalid security level', async () => {
    const invalidRealm = {
      name: 'Invalid Security Realm',
      description: 'Testing invalid security level',
      configuration: {
        maxAgents: 10,
        securityLevel: 'invalid-level'
      }
    };

    const response = await request(app)
      .post('/realms')
      .send(invalidRealm)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('securityLevel'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 400 for invalid agent types', async () => {
    const invalidRealm = {
      name: 'Invalid Agent Types Realm',
      description: 'Testing invalid agent types',
      configuration: {
        maxAgents: 10,
        allowedAgentTypes: ['druid', 'invalid-type']
      }
    };

    const response = await request(app)
      .post('/realms')
      .send(invalidRealm)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('allowedAgentTypes'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 409 if realm name already exists', async () => {
    const realmName = 'Unique Realm Name';
    const realm = {
      name: realmName,
      description: 'First realm with this name',
      configuration: {
        maxAgents: 10
      }
    };

    // First creation should succeed
    await request(app)
      .post('/realms')
      .send(realm)
      .expect(201);

    // Second creation with same name should fail
    const duplicateRealm = {
      name: realmName,
      description: 'Duplicate realm name',
      configuration: {
        maxAgents: 5
      }
    };

    const response = await request(app)
      .post('/realms')
      .send(duplicateRealm)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Realm name already exists',
      code: 'REALM_NAME_EXISTS'
    });
  });

  it('should validate maxAgents constraint', async () => {
    const invalidRealm = {
      name: 'Too Many Agents Realm',
      description: 'Testing maxAgents validation',
      configuration: {
        maxAgents: -1 // Invalid negative value
      }
    };

    const response = await request(app)
      .post('/realms')
      .send(invalidRealm)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('maxAgents'),
      code: 'VALIDATION_ERROR'
    });
  });
});
