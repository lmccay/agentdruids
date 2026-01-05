import express from 'express';
import request from 'supertest';

describe('Knowledge Namespace Access Control Integration Test', () => {
  let app: express.Application;

  beforeAll(() => {
    // This will fail until the actual app is implemented
    app = express();
  });

  describe('Knowledge Namespace Permissions', () => {
    it('should enforce namespace-based knowledge access for agents', async () => {
      // Create realms with different knowledge namespace policies
      const developmentRealmConfig = {
        id: 'dev-realm-001',
        name: 'Development Realm',
        type: 'development',
        configuration: {
          maxAgents: 5,
          allowedAgentTypes: ['druid', 'elemental'],
          knowledgeNamespaces: ['dev.*', 'shared.common', 'testing.*'],
          securityLevel: 'development'
        }
      };

      const productionRealmConfig = {
        id: 'prod-realm-001',
        name: 'Production Realm',
        type: 'production',
        configuration: {
          maxAgents: 10,
          allowedAgentTypes: ['druid', 'elemental', 'gaia'],
          knowledgeNamespaces: ['prod.*', 'shared.common'],
          securityLevel: 'production'
        }
      };

      await request(app)
        .post('/api/realms')
        .send(developmentRealmConfig)
        .expect(201);

      await request(app)
        .post('/api/realms')
        .send(productionRealmConfig)
        .expect(201);

      // Deploy agents with specific knowledge namespace requirements
      const devAgentConfig = {
        id: 'dev-druid-001',
        type: 'druid',
        name: 'Development Coordinator',
        specialization: {
          domain: 'development',
          expertise: ['code-review', 'testing'],
          knowledgeNamespaces: ['dev.codebase', 'dev.tests', 'shared.common'],
          maxConcurrentTasks: 3
        }
      };

      const prodAgentConfig = {
        id: 'prod-druid-001',
        type: 'druid',
        name: 'Production Coordinator',
        specialization: {
          domain: 'production',
          expertise: ['deployment', 'monitoring'],
          knowledgeNamespaces: ['prod.deployment', 'prod.monitoring', 'shared.common'],
          maxConcurrentTasks: 5
        }
      };

      // Deploy development agent successfully
      const devAgentResponse = await request(app)
        .post('/api/realms/dev-realm-001/agents')
        .send(devAgentConfig)
        .expect(201);

      expect(devAgentResponse.body.specialization.knowledgeNamespaces).toEqual(
        expect.arrayContaining(['dev.codebase', 'dev.tests', 'shared.common'])
      );

      // Deploy production agent successfully
      const prodAgentResponse = await request(app)
        .post('/api/realms/prod-realm-001/agents')
        .send(prodAgentConfig)
        .expect(201);

      expect(prodAgentResponse.body.specialization.knowledgeNamespaces).toEqual(
        expect.arrayContaining(['prod.deployment', 'prod.monitoring', 'shared.common'])
      );
    });

    it('should reject agents trying to access unauthorized namespaces', async () => {
      // Try to deploy an agent in dev realm with prod namespaces
      const unauthorizedAgentConfig = {
        id: 'unauthorized-agent-001',
        type: 'elemental',
        name: 'Unauthorized Agent',
        specialization: {
          domain: 'security',
          expertise: ['penetration-testing'],
          knowledgeNamespaces: ['prod.secrets', 'prod.database', 'admin.config'], // Not allowed in dev realm
          maxConcurrentTasks: 1
        }
      };

      // Should fail with 403 Forbidden
      const response = await request(app)
        .post('/api/realms/dev-realm-001/agents')
        .send(unauthorizedAgentConfig)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/namespace.*not.*allowed/i);
    });

    it('should allow namespace intersection for shared knowledge', async () => {
      // Create agents in different realms that can access shared namespaces
      const sharedNamespaceAgent1 = {
        id: 'shared-agent-001',
        type: 'elemental',
        name: 'Shared Knowledge Agent 1',
        specialization: {
          domain: 'utilities',
          expertise: ['common-functions'],
          knowledgeNamespaces: ['dev.utilities', 'shared.common', 'shared.utilities'],
          maxConcurrentTasks: 2
        }
      };

      const sharedNamespaceAgent2 = {
        id: 'shared-agent-002',
        type: 'elemental',
        name: 'Shared Knowledge Agent 2',
        specialization: {
          domain: 'utilities',
          expertise: ['common-functions'],
          knowledgeNamespaces: ['prod.utilities', 'shared.common', 'shared.utilities'],
          maxConcurrentTasks: 2
        }
      };

      // Deploy both agents successfully
      await request(app)
        .post('/api/realms/dev-realm-001/agents')
        .send(sharedNamespaceAgent1)
        .expect(201);

      await request(app)
        .post('/api/realms/prod-realm-001/agents')
        .send(sharedNamespaceAgent2)
        .expect(201);

      // Verify both agents can access shared namespaces
      const devAgentResponse = await request(app)
        .get('/api/realms/dev-realm-001/agents/shared-agent-001')
        .expect(200);

      const prodAgentResponse = await request(app)
        .get('/api/realms/prod-realm-001/agents/shared-agent-002')
        .expect(200);

      // Both should have access to shared namespaces
      expect(devAgentResponse.body.specialization.knowledgeNamespaces).toContain('shared.common');
      expect(prodAgentResponse.body.specialization.knowledgeNamespaces).toContain('shared.common');
    });
  });

  describe('Knowledge Query and Access Validation', () => {
    it('should validate knowledge queries against agent permissions', async () => {
      const agentId = 'dev-druid-001';
      const realmId = 'dev-realm-001';

      // Valid knowledge query within allowed namespaces
      const validKnowledgeQuery = {
        query: 'How to run unit tests?',
        namespaces: ['dev.tests', 'shared.common'],
        context: {
          taskId: 'task-001',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const validQueryResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/knowledge/query`)
        .send(validKnowledgeQuery)
        .expect(200);

      expect(validQueryResponse.body).toHaveProperty('results');
      expect(validQueryResponse.body).toHaveProperty('accessGranted', true);

      // Invalid knowledge query for unauthorized namespace
      const invalidKnowledgeQuery = {
        query: 'What are the production database credentials?',
        namespaces: ['prod.secrets', 'prod.database'], // Not allowed for dev agent
        context: {
          taskId: 'task-002',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const invalidQueryResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/knowledge/query`)
        .send(invalidKnowledgeQuery)
        .expect(403);

      expect(invalidQueryResponse.body).toHaveProperty('error');
      expect(invalidQueryResponse.body).toHaveProperty('accessGranted', false);
      expect(invalidQueryResponse.body.unauthorizedNamespaces).toEqual(['prod.secrets', 'prod.database']);
    });

    it('should filter knowledge results based on namespace permissions', async () => {
      const agentId = 'dev-druid-001';
      const realmId = 'dev-realm-001';

      // Mixed namespace query - some allowed, some not
      const mixedKnowledgeQuery = {
        query: 'deployment procedures',
        namespaces: ['dev.deployment', 'prod.deployment', 'shared.common'], // Only dev and shared allowed
        context: {
          taskId: 'task-003',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const mixedQueryResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/knowledge/query`)
        .send(mixedKnowledgeQuery)
        .expect(200);

      expect(mixedQueryResponse.body).toHaveProperty('results');
      expect(mixedQueryResponse.body).toHaveProperty('accessGranted', true);
      expect(mixedQueryResponse.body).toHaveProperty('filteredNamespaces');
      expect(mixedQueryResponse.body.filteredNamespaces).toEqual(['prod.deployment']);
      expect(mixedQueryResponse.body.accessibleNamespaces).toEqual(['dev.deployment', 'shared.common']);
    });

    it('should audit knowledge access attempts', async () => {
      const agentId = 'dev-druid-001';
      const realmId = 'dev-realm-001';

      // Make several knowledge queries
      const queries = [
        {
          query: 'testing best practices',
          namespaces: ['dev.tests']
        },
        {
          query: 'unauthorized access attempt',
          namespaces: ['prod.secrets']
        },
        {
          query: 'shared utilities',
          namespaces: ['shared.common']
        }
      ];

      for (const queryData of queries) {
        await request(app)
          .post(`/api/realms/${realmId}/agents/${agentId}/knowledge/query`)
          .send({
            ...queryData,
            context: {
              taskId: `task-${Date.now()}`,
              requestorId: agentId,
              timestamp: new Date().toISOString()
            }
          });
      }

      // Check audit logs for knowledge access
      const auditResponse = await request(app)
        .get(`/api/realms/${realmId}/agents/${agentId}/audit/knowledge`)
        .expect(200);

      expect(auditResponse.body).toHaveProperty('entries');
      expect(auditResponse.body.entries).toHaveLength(3);

      // Verify audit entries contain proper information
      const auditEntries = auditResponse.body.entries;
      expect(auditEntries[0]).toHaveProperty('query');
      expect(auditEntries[0]).toHaveProperty('namespaces');
      expect(auditEntries[0]).toHaveProperty('accessGranted');
      expect(auditEntries[0]).toHaveProperty('timestamp');

      // Verify unauthorized access was logged
      const unauthorizedEntry = auditEntries.find((entry: any) => 
        entry.namespaces.includes('prod.secrets')
      );
      expect(unauthorizedEntry).toBeDefined();
      expect(unauthorizedEntry.accessGranted).toBe(false);
    });
  });

  describe('Cross-Realm Knowledge Isolation', () => {
    it('should prevent knowledge leakage between realms', async () => {
      // Try to access knowledge from another realm
      const devAgentId = 'dev-druid-001';
      const prodRealmId = 'prod-realm-001';

      // Development agent trying to access production realm knowledge
      const crossRealmQuery = {
        query: 'production deployment status',
        namespaces: ['prod.deployment'],
        context: {
          taskId: 'cross-realm-task-001',
          requestorId: devAgentId,
          timestamp: new Date().toISOString()
        }
      };

      // Should fail - agent is not in the production realm
      const response = await request(app)
        .post(`/api/realms/${prodRealmId}/agents/${devAgentId}/knowledge/query`)
        .send(crossRealmQuery)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/agent.*not.*found.*realm/i);
    });

    it('should enforce namespace boundaries within realm policies', async () => {
      // Create an agent with minimal permissions
      const restrictedAgentConfig = {
        id: 'restricted-agent-001',
        type: 'elemental',
        name: 'Restricted Agent',
        specialization: {
          domain: 'limited',
          expertise: ['basic-tasks'],
          knowledgeNamespaces: ['dev.public'], // Very limited access
          maxConcurrentTasks: 1
        }
      };

      await request(app)
        .post('/api/realms/dev-realm-001/agents')
        .send(restrictedAgentConfig)
        .expect(201);

      // Try to expand access beyond granted namespaces
      const expandedQuery = {
        query: 'sensitive development information',
        namespaces: ['dev.public', 'dev.private', 'dev.secrets'], // Only dev.public allowed
        context: {
          taskId: 'expansion-task-001',
          requestorId: 'restricted-agent-001',
          timestamp: new Date().toISOString()
        }
      };

      const response = await request(app)
        .post('/api/realms/dev-realm-001/agents/restricted-agent-001/knowledge/query')
        .send(expandedQuery)
        .expect(403);

      expect(response.body).toHaveProperty('unauthorizedNamespaces');
      expect(response.body.unauthorizedNamespaces).toEqual(['dev.private', 'dev.secrets']);
    });
  });

  describe('Dynamic Knowledge Namespace Management', () => {
    it('should handle namespace permission updates', async () => {
      const agentId = 'restricted-agent-001';
      const realmId = 'dev-realm-001';

      // Update agent permissions to grant additional namespace access
      const permissionUpdate = {
        specialization: {
          domain: 'expanded',
          expertise: ['intermediate-tasks'],
          knowledgeNamespaces: ['dev.public', 'dev.intermediate'], // Add dev.intermediate
          maxConcurrentTasks: 2
        }
      };

      await request(app)
        .patch(`/api/realms/${realmId}/agents/${agentId}`)
        .send(permissionUpdate)
        .expect(200);

      // Verify new permissions work
      const updatedQuery = {
        query: 'intermediate development information',
        namespaces: ['dev.intermediate'],
        context: {
          taskId: 'updated-task-001',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const response = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/knowledge/query`)
        .send(updatedQuery)
        .expect(200);

      expect(response.body).toHaveProperty('accessGranted', true);
    });

    it('should revoke access when namespaces are removed', async () => {
      const agentId = 'restricted-agent-001';
      const realmId = 'dev-realm-001';

      // Remove intermediate access
      const restrictPermissions = {
        specialization: {
          domain: 'basic',
          expertise: ['basic-tasks'],
          knowledgeNamespaces: ['dev.public'], // Remove dev.intermediate
          maxConcurrentTasks: 1
        }
      };

      await request(app)
        .patch(`/api/realms/${realmId}/agents/${agentId}`)
        .send(restrictPermissions)
        .expect(200);

      // Verify access is revoked
      const restrictedQuery = {
        query: 'intermediate development information',
        namespaces: ['dev.intermediate'], // No longer allowed
        context: {
          taskId: 'restricted-task-001',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const response = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/knowledge/query`)
        .send(restrictedQuery)
        .expect(403);

      expect(response.body).toHaveProperty('accessGranted', false);
      expect(response.body.unauthorizedNamespaces).toContain('dev.intermediate');
    });
  });
});
