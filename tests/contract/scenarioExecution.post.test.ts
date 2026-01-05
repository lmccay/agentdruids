import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('POST /scenarios/{scenarioId}/executions - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should execute scenario and return execution details', async () => {
    const scenarioId = 'test-scenario-001';
    const executionConfig = {
      executionMode: 'normal',
      timeoutMinutes: 30,
      monitoring: {
        logLevel: 'info',
        metricsCollection: true,
        realTimeUpdates: true
      }
    };

    const response = await request(app)
      .post(`/scenarios/${scenarioId}/execute`)
      .send(executionConfig)
      .expect(201);

    expect(response.body).toMatchObject({
      executionId: expect.any(String),
      scenarioId: scenarioId,
      status: 'starting',
      startedAt: expect.any(String),
      configuration: executionConfig,
      participants: expect.any(Array),
      estimatedDuration: expect.any(Number)
    });
  });

  it('should execute collaboration scenario with druid coordination', async () => {
    const collaborationScenarioId = 'test-collaboration-001';
    const executionConfig = {
      executionMode: 'coordinated',
      timeoutMinutes: 60,
      coordination: {
        leadAgent: 'test-druid-lead',
        syncInterval: 5, // seconds
        consensusRequired: true
      },
      monitoring: {
        logLevel: 'debug',
        metricsCollection: true,
        realTimeUpdates: true
      }
    };

    const response = await request(app)
      .post(`/scenarios/${collaborationScenarioId}/execute`)
      .send(executionConfig)
      .expect(201);

    expect(response.body.configuration.coordination.leadAgent).toBe('test-druid-lead');
    expect(response.body.configuration.coordination.consensusRequired).toBe(true);
  });

  it('should execute benchmark scenario with performance monitoring', async () => {
    const benchmarkScenarioId = 'test-benchmark-001';
    const executionConfig = {
      executionMode: 'benchmark',
      timeoutMinutes: 15,
      benchmarking: {
        performanceMetrics: ['latency', 'throughput', 'accuracy'],
        baselineComparison: true,
        iterations: 100
      },
      monitoring: {
        logLevel: 'warn',
        metricsCollection: true,
        realTimeUpdates: false,
        performanceProfile: true
      }
    };

    const response = await request(app)
      .post(`/scenarios/${benchmarkScenarioId}/execute`)
      .send(executionConfig)
      .expect(201);

    expect(response.body.configuration.benchmarking.performanceMetrics).toEqual(
      ['latency', 'throughput', 'accuracy']
    );
    expect(response.body.configuration.benchmarking.iterations).toBe(100);
  });

  it('should execute self-play scenario with dynamic parameters', async () => {
    const selfPlayScenarioId = 'test-self-play-001';
    const executionConfig = {
      executionMode: 'self-play',
      timeoutMinutes: 45,
      selfPlay: {
        episodeCount: 50,
        adaptiveParameters: true,
        learningRate: 0.01,
        explorationFactor: 0.1
      },
      monitoring: {
        logLevel: 'info',
        metricsCollection: true,
        realTimeUpdates: true,
        learningProgress: true
      }
    };

    const response = await request(app)
      .post(`/scenarios/${selfPlayScenarioId}/execute`)
      .send(executionConfig)
      .expect(201);

    expect(response.body.configuration.selfPlay.episodeCount).toBe(50);
    expect(response.body.configuration.selfPlay.adaptiveParameters).toBe(true);
  });

  it('should return 400 for invalid execution configuration', async () => {
    const scenarioId = 'test-scenario-001';
    const invalidConfig = {
      executionMode: 'invalid-mode',
      timeoutMinutes: -1 // Invalid negative timeout
    };

    const response = await request(app)
      .post(`/scenarios/${scenarioId}/execute`)
      .send(invalidConfig)
      .expect(400);

    expect(response.body).toMatchObject({
      error: expect.stringMatching(/(executionMode|timeoutMinutes)/),
      code: 'VALIDATION_ERROR'
    });
  });

  it('should return 404 for non-existent scenario', async () => {
    const nonExistentId = 'non-existent-scenario';
    const executionConfig = {
      executionMode: 'normal',
      timeoutMinutes: 30
    };

    const response = await request(app)
      .post(`/scenarios/${nonExistentId}/execute`)
      .send(executionConfig)
      .expect(404);

    expect(response.body).toMatchObject({
      error: 'Scenario not found',
      code: 'SCENARIO_NOT_FOUND'
    });
  });

  it('should return 409 if scenario is already running', async () => {
    const scenarioId = 'test-scenario-running';
    const executionConfig = {
      executionMode: 'normal',
      timeoutMinutes: 30
    };

    const response = await request(app)
      .post(`/scenarios/${scenarioId}/execute`)
      .send(executionConfig)
      .expect(409);

    expect(response.body).toMatchObject({
      error: 'Scenario is already running',
      code: 'SCENARIO_ALREADY_RUNNING'
    });
  });

  it('should return 422 if scenario is not ready for execution', async () => {
    const scenarioId = 'test-scenario-draft';
    const executionConfig = {
      executionMode: 'normal',
      timeoutMinutes: 30
    };

    const response = await request(app)
      .post(`/scenarios/${scenarioId}/execute`)
      .send(executionConfig)
      .expect(422);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('not ready'),
      code: 'SCENARIO_NOT_READY'
    });
  });

  it('should return 422 if required agents are not available', async () => {
    const scenarioId = 'test-scenario-unavailable-agents';
    const executionConfig = {
      executionMode: 'normal',
      timeoutMinutes: 30
    };

    const response = await request(app)
      .post(`/scenarios/${scenarioId}/execute`)
      .send(executionConfig)
      .expect(422);

    expect(response.body).toMatchObject({
      error: expect.stringContaining('agents not available'),
      code: 'AGENTS_NOT_AVAILABLE'
    });
  });

  it('should validate scenario ID format', async () => {
    const invalidId = 'invalid scenario id with spaces';
    const executionConfig = {
      executionMode: 'normal',
      timeoutMinutes: 30
    };

    await request(app)
      .post(`/scenarios/${invalidId}/execute`)
      .send(executionConfig)
      .expect(400);
  });

  it('should handle execution with custom environment variables', async () => {
    const scenarioId = 'test-scenario-custom-env';
    const executionConfig = {
      executionMode: 'normal',
      timeoutMinutes: 30,
      environment: {
        variables: {
          'SCENARIO_MODE': 'testing',
          'DEBUG_LEVEL': 'verbose'
        },
        resources: {
          maxMemoryMB: 512,
          maxCpuPercent: 50
        }
      }
    };

    const response = await request(app)
      .post(`/scenarios/${scenarioId}/execute`)
      .send(executionConfig)
      .expect(201);

    expect(response.body.configuration.environment.variables).toMatchObject({
      'SCENARIO_MODE': 'testing',
      'DEBUG_LEVEL': 'verbose'
    });
  });
});
