import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('GET /executions/{executionId} - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should return execution details for valid execution ID', async () => {
    const executionId = 'test-execution-001';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      executionId: executionId,
      scenarioId: expect.any(String),
      status: expect.stringMatching(/^(starting|running|completed|failed|cancelled)$/),
      startedAt: expect.any(String),
      participants: expect.any(Array),
      configuration: expect.any(Object),
      metrics: expect.any(Object)
    });
  });

  it('should include detailed execution metrics', async () => {
    const executionId = 'test-execution-running';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .expect(200);

    expect(response.body.metrics).toMatchObject({
      executionTime: expect.any(Number),
      messagesExchanged: expect.any(Number),
      tasksCompleted: expect.any(Number),
      errors: expect.any(Number),
      warnings: expect.any(Number)
    });

    if (response.body.status === 'running') {
      expect(response.body).toMatchObject({
        progress: expect.objectContaining({
          percentage: expect.any(Number),
          currentPhase: expect.any(String),
          estimatedTimeRemaining: expect.any(Number)
        })
      });
    }
  });

  it('should include participant status and performance', async () => {
    const executionId = 'test-execution-collaboration';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .expect(200);

    expect(Array.isArray(response.body.participants)).toBe(true);
    
    if (response.body.participants.length > 0) {
      const participant = response.body.participants[0];
      expect(participant).toMatchObject({
        agentId: expect.any(String),
        role: expect.any(String),
        status: expect.stringMatching(/^(active|idle|error|disconnected)$/),
        performance: expect.objectContaining({
          responseTimes: expect.any(Array),
          successRate: expect.any(Number),
          errorCount: expect.any(Number)
        })
      });
    }
  });

  it('should include real-time execution logs when requested', async () => {
    const executionId = 'test-execution-001';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .query({ includeLogs: true, logLevel: 'info' })
      .expect(200);

    if (response.body.logs) {
      expect(Array.isArray(response.body.logs)).toBe(true);
      
      if (response.body.logs.length > 0) {
        const logEntry = response.body.logs[0];
        expect(logEntry).toMatchObject({
          timestamp: expect.any(String),
          level: expect.stringMatching(/^(debug|info|warn|error)$/),
          message: expect.any(String),
          source: expect.any(String)
        });
      }
    }
  });

  it('should include error details for failed executions', async () => {
    const executionId = 'test-execution-failed';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .expect(200);

    if (response.body.status === 'failed') {
      expect(response.body).toMatchObject({
        error: expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
          timestamp: expect.any(String),
          affectedAgents: expect.any(Array)
        }),
        failedAt: expect.any(String)
      });
    }
  });

  it('should include completion details for finished executions', async () => {
    const executionId = 'test-execution-completed';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .expect(200);

    if (response.body.status === 'completed') {
      expect(response.body).toMatchObject({
        completedAt: expect.any(String),
        results: expect.any(Object),
        summary: expect.objectContaining({
          totalDuration: expect.any(Number),
          successfulTasks: expect.any(Number),
          failedTasks: expect.any(Number)
        })
      });
    }
  });

  it('should include benchmark results for benchmark executions', async () => {
    const executionId = 'test-execution-benchmark';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .expect(200);

    if (response.body.configuration?.executionMode === 'benchmark') {
      expect(response.body).toMatchObject({
        benchmarkResults: expect.objectContaining({
          averageLatency: expect.any(Number),
          throughput: expect.any(Number),
          accuracy: expect.any(Number),
          iterations: expect.any(Number)
        })
      });
    }
  });

  it('should include learning progress for self-play executions', async () => {
    const executionId = 'test-execution-self-play';

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .expect(200);

    if (response.body.configuration?.executionMode === 'self-play') {
      expect(response.body).toMatchObject({
        learningProgress: expect.objectContaining({
          currentEpisode: expect.any(Number),
          totalEpisodes: expect.any(Number),
          averageReward: expect.any(Number),
          improvementRate: expect.any(Number)
        })
      });
    }
  });

  it('should return 404 for non-existent execution ID', async () => {
    const nonExistentId = 'non-existent-execution';

    const response = await request(app)
      .get(`/executions/${nonExistentId}`)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Execution not found',
      code: 'EXECUTION_NOT_FOUND'
    });
  });

  it('should validate execution ID format', async () => {
    const invalidId = 'invalid execution id with spaces';

    await request(app)
      .get(`/executions/${invalidId}`)
      .expect(400);
  });

  it('should handle pagination for large log files', async () => {
    const executionId = 'test-execution-many-logs';
    const limit = 50;
    const offset = 0;

    const response = await request(app)
      .get(`/executions/${executionId}`)
      .query({ includeLogs: true, logLimit: limit, logOffset: offset })
      .expect(200);

    if (response.body.logs) {
      expect(response.body.logs.length).toBeLessThanOrEqual(limit);
    }
  });

  it('should support real-time updates via Server-Sent Events when requested', async () => {
    const executionId = 'test-execution-streaming';

    // Note: This test verifies the header setup for SSE, actual streaming would need WebSocket testing
    const response = await request(app)
      .get(`/executions/${executionId}`)
      .query({ realTimeUpdates: true })
      .expect(200);

    // Verify that real-time update capability is indicated
    if (response.body.status === 'running') {
      expect(response.body).toMatchObject({
        realTimeUpdatesAvailable: true,
        updateStreamUrl: expect.stringContaining('/stream')
      });
    }
  });
});
