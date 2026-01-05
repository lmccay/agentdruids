import express from 'express';
import request from 'supertest';

describe('Tool Access Policy Integration Test', () => {
  let app: express.Application;

  beforeAll(() => {
    // This will fail until the actual app is implemented
    app = express();
  });

  describe('Tool Access Policy Enforcement', () => {
    it('should enforce tool access policies based on agent capabilities', async () => {
      // Create realm with specific tool policies
      const realmConfig = {
        id: 'tool-policy-realm-001',
        name: 'Tool Policy Test Realm',
        type: 'testing',
        configuration: {
          maxAgents: 5,
          allowedAgentTypes: ['druid', 'elemental'],
          knowledgeNamespaces: ['testing.*', 'shared.common'],
          securityLevel: 'development',
          toolPolicies: {
            'file-system': {
              allowedOperations: ['read', 'write'],
              restrictedPaths: ['/etc', '/root', '/usr/bin'],
              requiresApproval: false
            },
            'network-access': {
              allowedOperations: ['get', 'post'],
              restrictedDomains: ['internal.company.com', 'production.api'],
              requiresApproval: true
            },
            'database-access': {
              allowedOperations: ['read'],
              restrictedTables: ['users', 'payments'],
              requiresApproval: true
            }
          }
        }
      };

      await request(app)
        .post('/api/realms')
        .send(realmConfig)
        .expect(201);

      // Deploy agents with different tool access requirements
      const fileAgentConfig = {
        id: 'file-agent-001',
        type: 'elemental',
        name: 'File Processing Agent',
        capabilities: ['file-processing', 'data-validation'],
        specialization: {
          domain: 'file-management',
          expertise: ['csv-processing', 'log-analysis'],
          knowledgeNamespaces: ['testing.files', 'shared.common'],
          maxConcurrentTasks: 3
        },
        mcpTools: ['file-system'], // Only file system access
        toolPermissions: {
          'file-system': {
            operations: ['read', 'write'],
            paths: ['/tmp', '/var/log', '/home/user/data'],
            quotas: {
              maxFileSize: '100MB',
              maxFilesPerHour: 1000
            }
          }
        }
      };

      const networkAgentConfig = {
        id: 'network-agent-001',
        type: 'elemental',
        name: 'API Integration Agent',
        capabilities: ['api-integration', 'data-fetching'],
        specialization: {
          domain: 'integration',
          expertise: ['rest-apis', 'webhook-handling'],
          knowledgeNamespaces: ['testing.integration', 'shared.common'],
          maxConcurrentTasks: 2
        },
        mcpTools: ['network-access'], // Only network access
        toolPermissions: {
          'network-access': {
            operations: ['get', 'post'],
            domains: ['public-api.example.com', 'test-webhook.service'],
            quotas: {
              maxRequestsPerMinute: 60,
              maxBandwidthMB: 10
            }
          }
        }
      };

      // Deploy both agents successfully
      const fileAgentResponse = await request(app)
        .post('/api/realms/tool-policy-realm-001/agents')
        .send(fileAgentConfig)
        .expect(201);

      const networkAgentResponse = await request(app)
        .post('/api/realms/tool-policy-realm-001/agents')
        .send(networkAgentConfig)
        .expect(201);

      expect(fileAgentResponse.body.mcpTools).toEqual(['file-system']);
      expect(networkAgentResponse.body.mcpTools).toEqual(['network-access']);
    });

    it('should reject agents requesting unauthorized tools', async () => {
      const realmId = 'tool-policy-realm-001';

      // Try to deploy agent with restricted database access
      const unauthorizedAgentConfig = {
        id: 'unauthorized-db-agent-001',
        type: 'elemental',
        name: 'Unauthorized Database Agent',
        capabilities: ['data-analysis'],
        specialization: {
          domain: 'analytics',
          expertise: ['sql-queries'],
          knowledgeNamespaces: ['testing.analytics'],
          maxConcurrentTasks: 1
        },
        mcpTools: ['database-access'], // Requires approval in realm policy
        toolPermissions: {
          'database-access': {
            operations: ['read', 'write'], // Write not allowed in realm policy
            tables: ['users'], // Restricted table
            quotas: {
              maxQueriesPerHour: 100
            }
          }
        }
      };

      // Should fail due to unauthorized tool configuration
      const response = await request(app)
        .post(`/api/realms/${realmId}/agents`)
        .send(unauthorizedAgentConfig)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/tool.*access.*not.*authorized/i);
      expect(response.body).toHaveProperty('violations');
      expect(response.body.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: 'database-access',
            issue: expect.stringMatching(/write.*not.*allowed|restricted.*table/i)
          })
        ])
      );
    });

    it('should validate tool operation requests against policies', async () => {
      const agentId = 'file-agent-001';
      const realmId = 'tool-policy-realm-001';

      // Valid file operation within allowed paths
      const validFileOperation = {
        tool: 'file-system',
        operation: 'read',
        parameters: {
          path: '/tmp/test-data.csv',
          encoding: 'utf8'
        },
        context: {
          taskId: 'file-task-001',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const validOpResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/tools/execute`)
        .send(validFileOperation)
        .expect(200);

      expect(validOpResponse.body).toHaveProperty('result');
      expect(validOpResponse.body).toHaveProperty('authorized', true);

      // Invalid file operation on restricted path
      const invalidFileOperation = {
        tool: 'file-system',
        operation: 'write',
        parameters: {
          path: '/etc/passwd', // Restricted path
          content: 'malicious content'
        },
        context: {
          taskId: 'file-task-002',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const invalidOpResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/tools/execute`)
        .send(invalidFileOperation)
        .expect(403);

      expect(invalidOpResponse.body).toHaveProperty('error');
      expect(invalidOpResponse.body).toHaveProperty('authorized', false);
      expect(invalidOpResponse.body.error).toMatch(/path.*restricted/i);
    });
  });

  describe('Tool Approval Workflows', () => {
    it('should handle tool operations requiring approval', async () => {
      const agentId = 'network-agent-001';
      const realmId = 'tool-policy-realm-001';

      // Network operation requiring approval
      const networkOperation = {
        tool: 'network-access',
        operation: 'post',
        parameters: {
          url: 'https://public-api.example.com/webhook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            event: 'test-event',
            data: { message: 'integration test' }
          }
        },
        context: {
          taskId: 'network-task-001',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      // Should create pending approval request
      const operationResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/tools/execute`)
        .send(networkOperation)
        .expect(202); // Accepted for approval

      expect(operationResponse.body).toHaveProperty('status', 'pending_approval');
      expect(operationResponse.body).toHaveProperty('approvalId');
      expect(operationResponse.body).toHaveProperty('requiresApproval', true);

      const approvalId = operationResponse.body.approvalId;

      // Check pending approvals
      const pendingResponse = await request(app)
        .get(`/api/realms/${realmId}/approvals/pending`)
        .expect(200);

      expect(pendingResponse.body.approvals).toHaveLength(1);
      expect(pendingResponse.body.approvals[0]).toHaveProperty('id', approvalId);
      expect(pendingResponse.body.approvals[0]).toHaveProperty('agentId', agentId);
      expect(pendingResponse.body.approvals[0]).toHaveProperty('tool', 'network-access');

      // Approve the operation
      const approvalResponse = await request(app)
        .patch(`/api/realms/${realmId}/approvals/${approvalId}`)
        .send({
          status: 'approved',
          approvedBy: 'test-admin',
          reason: 'Integration test approval'
        })
        .expect(200);

      expect(approvalResponse.body).toHaveProperty('status', 'approved');

      // Verify operation proceeds after approval
      const executionResponse = await request(app)
        .get(`/api/realms/${realmId}/agents/${agentId}/tools/executions/${approvalId}`)
        .expect(200);

      expect(executionResponse.body).toHaveProperty('status', 'completed');
      expect(executionResponse.body).toHaveProperty('result');
    });

    it('should handle tool operation rejection', async () => {
      const agentId = 'network-agent-001';
      const realmId = 'tool-policy-realm-001';

      // Another network operation for rejection testing
      const networkOperation = {
        tool: 'network-access',
        operation: 'get',
        parameters: {
          url: 'https://suspicious-domain.example.com/api',
          headers: {
            'User-Agent': 'Test Agent'
          }
        },
        context: {
          taskId: 'network-task-002',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const operationResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/tools/execute`)
        .send(networkOperation)
        .expect(202);

      const approvalId = operationResponse.body.approvalId;

      // Reject the operation
      const rejectionResponse = await request(app)
        .patch(`/api/realms/${realmId}/approvals/${approvalId}`)
        .send({
          status: 'rejected',
          rejectedBy: 'test-admin',
          reason: 'Suspicious domain not allowed'
        })
        .expect(200);

      expect(rejectionResponse.body).toHaveProperty('status', 'rejected');

      // Verify operation is marked as rejected
      const executionResponse = await request(app)
        .get(`/api/realms/${realmId}/agents/${agentId}/tools/executions/${approvalId}`)
        .expect(200);

      expect(executionResponse.body).toHaveProperty('status', 'rejected');
      expect(executionResponse.body).toHaveProperty('error');
      expect(executionResponse.body.error).toMatch(/rejected.*admin/i);
    });
  });

  describe('Tool Usage Quotas and Monitoring', () => {
    it('should enforce tool usage quotas', async () => {
      const agentId = 'file-agent-001';
      const realmId = 'tool-policy-realm-001';

      // First, update agent with strict quotas for testing
      const quotaUpdate = {
        toolPermissions: {
          'file-system': {
            operations: ['read'],
            paths: ['/tmp'],
            quotas: {
              maxFileSize: '1KB', // Very small for testing
              maxFilesPerHour: 2 // Very low for testing
            }
          }
        }
      };

      await request(app)
        .patch(`/api/realms/${realmId}/agents/${agentId}`)
        .send(quotaUpdate)
        .expect(200);

      // Perform operations within quota
      for (let i = 1; i <= 2; i++) {
        const fileOperation = {
          tool: 'file-system',
          operation: 'read',
          parameters: {
            path: `/tmp/small-file-${i}.txt`
          },
          context: {
            taskId: `quota-task-${i}`,
            requestorId: agentId,
            timestamp: new Date().toISOString()
          }
        };

        await request(app)
          .post(`/api/realms/${realmId}/agents/${agentId}/tools/execute`)
          .send(fileOperation)
          .expect(200);
      }

      // Try to exceed quota
      const excessOperation = {
        tool: 'file-system',
        operation: 'read',
        parameters: {
          path: '/tmp/excess-file.txt'
        },
        context: {
          taskId: 'quota-task-excess',
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      };

      const quotaResponse = await request(app)
        .post(`/api/realms/${realmId}/agents/${agentId}/tools/execute`)
        .send(excessOperation)
        .expect(429); // Too Many Requests

      expect(quotaResponse.body).toHaveProperty('error');
      expect(quotaResponse.body.error).toMatch(/quota.*exceeded/i);
      expect(quotaResponse.body).toHaveProperty('quotaType', 'maxFilesPerHour');
      expect(quotaResponse.body).toHaveProperty('limit', 2);
      expect(quotaResponse.body).toHaveProperty('current', 2);
    });

    it('should track and report tool usage statistics', async () => {
      const agentId = 'file-agent-001';
      const realmId = 'tool-policy-realm-001';

      // Get tool usage statistics
      const usageResponse = await request(app)
        .get(`/api/realms/${realmId}/agents/${agentId}/tools/usage`)
        .expect(200);

      expect(usageResponse.body).toHaveProperty('usage');
      expect(usageResponse.body.usage).toHaveProperty('file-system');

      const fileSystemUsage = usageResponse.body.usage['file-system'];
      expect(fileSystemUsage).toHaveProperty('totalOperations');
      expect(fileSystemUsage).toHaveProperty('operationsByType');
      expect(fileSystemUsage).toHaveProperty('quotaStatus');
      expect(fileSystemUsage.totalOperations).toBeGreaterThan(0);

      // Get realm-wide tool usage
      const realmUsageResponse = await request(app)
        .get(`/api/realms/${realmId}/tools/usage`)
        .expect(200);

      expect(realmUsageResponse.body).toHaveProperty('totalOperations');
      expect(realmUsageResponse.body).toHaveProperty('operationsByTool');
      expect(realmUsageResponse.body).toHaveProperty('operationsByAgent');
      expect(realmUsageResponse.body.operationsByTool).toHaveProperty('file-system');
    });
  });

  describe('Tool Security and Audit', () => {
    it('should audit all tool operations', async () => {
      const agentId = 'file-agent-001';
      const realmId = 'tool-policy-realm-001';

      // Get audit log for tool operations
      const auditResponse = await request(app)
        .get(`/api/realms/${realmId}/agents/${agentId}/audit/tools`)
        .expect(200);

      expect(auditResponse.body).toHaveProperty('entries');
      expect(auditResponse.body.entries.length).toBeGreaterThan(0);

      // Verify audit entry structure
      const auditEntry = auditResponse.body.entries[0];
      expect(auditEntry).toHaveProperty('timestamp');
      expect(auditEntry).toHaveProperty('agentId', agentId);
      expect(auditEntry).toHaveProperty('tool');
      expect(auditEntry).toHaveProperty('operation');
      expect(auditEntry).toHaveProperty('parameters');
      expect(auditEntry).toHaveProperty('result');
      expect(auditEntry).toHaveProperty('authorized');

      // Check for both successful and failed operations
      const authorizedEntries = auditResponse.body.entries.filter((entry: any) => entry.authorized);
      const unauthorizedEntries = auditResponse.body.entries.filter((entry: any) => !entry.authorized);

      expect(authorizedEntries.length).toBeGreaterThan(0);
      expect(unauthorizedEntries.length).toBeGreaterThan(0);
    });

    it('should detect and flag suspicious tool usage patterns', async () => {
      const agentId = 'network-agent-001';
      const realmId = 'tool-policy-realm-001';

      // Simulate rapid-fire requests (suspicious pattern)
      const suspiciousOperations = Array.from({ length: 10 }, (_, i) => ({
        tool: 'network-access',
        operation: 'get',
        parameters: {
          url: `https://different-endpoint-${i}.example.com/api`
        },
        context: {
          taskId: `suspicious-task-${i}`,
          requestorId: agentId,
          timestamp: new Date().toISOString()
        }
      }));

      // Submit operations rapidly
      const operationPromises = suspiciousOperations.map(operation =>
        request(app)
          .post(`/api/realms/${realmId}/agents/${agentId}/tools/execute`)
          .send(operation)
      );

      await Promise.all(operationPromises);

      // Check for security alerts
      const alertsResponse = await request(app)
        .get(`/api/realms/${realmId}/security/alerts`)
        .expect(200);

      expect(alertsResponse.body).toHaveProperty('alerts');
      
      // Should have suspicious activity alert
      const suspiciousAlert = alertsResponse.body.alerts.find((alert: any) => 
        alert.type === 'suspicious_tool_usage' && alert.agentId === agentId
      );

      expect(suspiciousAlert).toBeDefined();
      expect(suspiciousAlert).toHaveProperty('severity');
      expect(suspiciousAlert).toHaveProperty('description');
      expect(suspiciousAlert.description).toMatch(/rapid.*requests|suspicious.*pattern/i);
    });
  });
});
