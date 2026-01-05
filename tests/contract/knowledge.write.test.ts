import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('PUT /knowledge/namespaces/{namespacePath} - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should create new knowledge entry and return 201', async () => {
    const namespacePath = 'global/test-knowledge';
    const newEntry = {
      key: 'agent-communication-protocol',
      value: {
        protocol: 'mcp-json-rpc',
        version: '1.0.0',
        features: ['streaming', 'batching', 'compression'],
        configuration: {
          timeout: 30000,
          retryAttempts: 3,
          batchSize: 100
        }
      },
      metadata: {
        type: 'configuration',
        tags: ['communication', 'protocol', 'mcp'],
        description: 'Standard communication protocol configuration for agents'
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(newEntry)
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      key: newEntry.key,
      value: newEntry.value,
      metadata: expect.objectContaining({
        type: newEntry.metadata.type,
        tags: newEntry.metadata.tags,
        description: newEntry.metadata.description,
        createdAt: expect.any(String),
        lastModified: expect.any(String),
        version: expect.any(String),
        createdBy: expect.any(String)
      })
    });
  });

  it('should update existing knowledge entry and return 200', async () => {
    const namespacePath = 'global/agent-configs';
    const existingKey = 'data-processing-config';
    const updateEntry = {
      key: existingKey,
      value: {
        capabilities: ['text-analysis', 'data-mining', 'pattern-recognition'],
        performance: {
          maxThroughput: 1000,
          averageLatency: 50,
          memoryUsage: '512MB'
        },
        updated: true
      },
      metadata: {
        type: 'configuration',
        description: 'Updated data processing configuration with enhanced capabilities'
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(updateEntry)
      .expect(200);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      key: existingKey,
      value: updateEntry.value,
      metadata: expect.objectContaining({
        description: updateEntry.metadata.description,
        lastModified: expect.any(String),
        version: expect.any(String),
        modifiedBy: expect.any(String)
      })
    });
  });

  it('should create versioned knowledge entry', async () => {
    const namespacePath = 'global/system-schemas';
    const versionedEntry = {
      key: 'agent-schema',
      value: {
        version: '2.0.0',
        properties: {
          id: { type: 'string', required: true },
          type: { type: 'string', enum: ['druid', 'elemental', 'gaia', 'worldtree'] },
          configuration: { type: 'object' }
        },
        additionalProperties: false
      },
      metadata: {
        type: 'schema',
        version: '2.0.0',
        changelog: 'Added support for new agent types and enhanced validation'
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(versionedEntry)
      .expect(201);

    expect(response.body.metadata.version).toBe('2.0.0');
    expect(response.body.value.version).toBe('2.0.0');
  });

  it('should create knowledge with access control inheritance', async () => {
    const namespacePath = 'private/team-knowledge';
    const accessControlledEntry = {
      key: 'team-strategy',
      value: {
        strategy: 'collaborative-learning',
        participants: ['druid-lead', 'elemental-specialist'],
        confidentialityLevel: 'internal'
      },
      metadata: {
        type: 'strategy',
        accessControl: {
          inheritFromNamespace: true,
          additionalRestrictions: {
            requireTeamMembership: true
          }
        }
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(accessControlledEntry)
      .expect(201);

    expect(response.body.metadata.accessControl).toMatchObject({
      owner: expect.any(String),
      permissions: expect.any(Object),
      inheritFromNamespace: true
    });
  });

  it('should create knowledge with validation schema', async () => {
    const namespacePath = 'global/validated-configs';
    const schemaValidatedEntry = {
      key: 'performance-config',
      value: {
        maxConcurrency: 10,
        timeoutMs: 5000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: 'exponential'
        }
      },
      metadata: {
        type: 'configuration',
        validation: {
          schemaRef: 'performance-config-schema-v1',
          enforceValidation: true
        }
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(schemaValidatedEntry)
      .expect(201);

    expect(response.body.metadata.validation).toMatchObject({
      schemaRef: 'performance-config-schema-v1',
      enforceValidation: true,
      validatedAt: expect.any(String)
    });
  });

  it('should return 400 for missing required fields', async () => {
    const namespacePath = 'global/test-knowledge';
    const incompleteEntry = {
      value: {
        someData: 'test'
      }
      // Missing required key field
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(incompleteEntry)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('key'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 400 for invalid value format', async () => {
    const namespacePath = 'global/test-knowledge';
    const invalidEntry = {
      key: 'test-key',
      value: 'string value instead of object', // Invalid - should be object
      metadata: {
        type: 'configuration'
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(invalidEntry)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('value'),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 404 for non-existent namespace', async () => {
    const nonExistentPath = 'non-existent/namespace';
    const entry = {
      key: 'test-key',
      value: { test: 'data' },
      metadata: { type: 'test' }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${nonExistentPath}`)
      .send(entry)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Namespace not found',
      code: 'NAMESPACE_NOT_FOUND'
    });
  });

  it('should return 403 for unauthorized namespace write access', async () => {
    const restrictedPath = 'private/admin-only';
    const entry = {
      key: 'unauthorized-entry',
      value: { data: 'test' },
      metadata: { type: 'test' }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${restrictedPath}`)
      .send(entry)
      .expect(403);

    expect(response.body).toMatchObject({
      error: 'Write access denied to namespace',
      code: 'NAMESPACE_WRITE_DENIED'
    });
  });

  it('should return 409 for conflicting key with different schema', async () => {
    const namespacePath = 'global/strict-schema';
    const conflictingEntry = {
      key: 'existing-key-different-schema',
      value: {
        differentStructure: 'conflicts with existing schema'
      },
      metadata: {
        type: 'configuration',
        validation: {
          schemaRef: 'different-schema-v1'
        }
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(conflictingEntry)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Key exists with incompatible schema',
      code: 'SCHEMA_CONFLICT'
    });
  });

  it('should validate namespace path format', async () => {
    const invalidPath = 'invalid/path with spaces';
    const entry = {
      key: 'test-key',
      value: { test: 'data' },
      metadata: { type: 'test' }
    };

    await request(app)
      .post(`/knowledge/namespaces/${encodeURIComponent(invalidPath)}`)
      .send(entry)
      .expect(400);
  });

  it('should handle knowledge entry with references', async () => {
    const namespacePath = 'global/linked-knowledge';
    const referencedEntry = {
      key: 'agent-binding-template',
      value: {
        templateType: 'collaboration',
        references: {
          baseSchema: 'global/schemas/binding-schema',
          exampleConfig: 'global/examples/collaboration-binding'
        },
        configuration: {
          permissions: ['read', 'write'],
          constraints: {}
        }
      },
      metadata: {
        type: 'template',
        tags: ['binding', 'collaboration', 'template'],
        references: ['global/schemas/binding-schema', 'global/examples/collaboration-binding']
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(referencedEntry)
      .expect(201);

    expect(response.body.metadata.references).toEqual(
      expect.arrayContaining(['global/schemas/binding-schema', 'global/examples/collaboration-binding'])
    );
  });

  it('should create knowledge with expiration policy', async () => {
    const namespacePath = 'global/temporary-knowledge';
    const temporaryEntry = {
      key: 'session-config',
      value: {
        sessionId: 'temp-session-001',
        configuration: {},
        temporary: true
      },
      metadata: {
        type: 'session',
        expiration: {
          ttl: 3600, // 1 hour
          autoCleanup: true
        }
      }
    };

    const response = await request(app)
      .post(`/knowledge/namespaces/${namespacePath}`)
      .send(temporaryEntry)
      .expect(201);

    expect(response.body.metadata.expiration).toMatchObject({
      ttl: 3600,
      autoCleanup: true,
      expiresAt: expect.any(String)
    });
  });
});
