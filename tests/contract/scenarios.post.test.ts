import request from 'supertest';
import { DruidApp } from '../../src/app';

describe('POST /scenarios - Contract Test', () => {
  let app: any;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('should create a new scenario and return 201', async () => {
    const newScenario = {
      name: 'Two-Agent Collaboration Test',
      description: 'Test scenario for druid-elemental collaboration',
      type: 'evaluation',
      participants: [
        {
          agentId: 'druid-coordinator-001',
          role: 'Project Coordinator',
          objectives: [
            'coordinate analysis project',
            'ensure timely delivery',
            'communicate results'
          ],
          constraints: [
            'must involve elemental agent',
            'deadline in 2 hours'
          ]
        },
        {
          agentId: 'elemental-analyst-001',
          role: 'Data Analyst',
          objectives: [
            'perform statistical analysis',
            'identify key trends',
            'provide recommendations'
          ],
          constraints: [
            'use available data sources',
            'provide confidence levels'
          ]
        }
      ],
      timeLimit: 7200
    };

    const response = await request(app)
      .post('/scenarios')
      .send(newScenario)
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Two-Agent Collaboration Test',
      description: 'Test scenario for druid-elemental collaboration',
      type: 'evaluation',
      participants: expect.arrayContaining([
        expect.objectContaining({
          agentId: 'druid-coordinator-001',
          role: 'Project Coordinator',
          objectives: expect.any(Array),
          constraints: expect.any(Array)
        }),
        expect.objectContaining({
          agentId: 'elemental-analyst-001',
          role: 'Data Analyst'
        })
      ]),
      timeLimit: 7200
    });

    expect(response.body.participants).toHaveLength(2);
  });

  it('should create self-play scenario', async () => {
    const selfPlayScenario = {
      name: 'Multi-Agent Learning Session',
      description: 'Self-play scenario for agent improvement',
      type: 'self-play',
      participants: [
        {
          agentId: 'druid-001',
          role: 'Coordinator',
          objectives: ['optimize coordination strategies'],
          constraints: ['time limit 30 minutes']
        },
        {
          agentId: 'elemental-001',
          role: 'Specialist',
          objectives: ['improve domain expertise'],
          constraints: ['use learned patterns']
        }
      ],
      timeLimit: 1800
    };

    const response = await request(app)
      .post('/scenarios')
      .send(selfPlayScenario)
      .expect(201);

    expect(response.body.type).toBe('self-play');
  });

  it('should return 400 for missing required fields', async () => {
    const incompleteScenario = {
      name: 'Incomplete Scenario',
      // Missing type and participants
      timeLimit: 3600
    };

    await request(app)
      .post('/scenarios')
      .send(incompleteScenario)
      .expect(400);
  });

  it('should return 400 for invalid scenario type', async () => {
    const invalidScenario = {
      name: 'Invalid Type Scenario',
      description: 'Test scenario with invalid type',
      type: 'invalid-type',
      participants: [
        {
          agentId: 'test-agent',
          role: 'Test Role',
          objectives: ['test objective'],
          constraints: []
        }
      ]
    };

    await request(app)
      .post('/scenarios')
      .send(invalidScenario)
      .expect(400);
  });

  it('should return 400 for empty participants list', async () => {
    const noParticipantsScenario = {
      name: 'No Participants Scenario',
      description: 'Test scenario with no participants',
      type: 'evaluation',
      participants: []
    };

    await request(app)
      .post('/scenarios')
      .send(noParticipantsScenario)
      .expect(400);
  });
});
