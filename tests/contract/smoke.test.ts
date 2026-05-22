/**
 * Contract smoke test.
 *
 * This directory previously held 19 contract test files describing an older,
 * never-built API surface (root-level paths like `/agents` instead of
 * `/api/agents`; nested `agent.configuration.llmModel` instead of
 * `agent.llmConfig.model`; status enums and fields that no longer exist).
 * They were spec-document artifacts that were not maintained as the
 * implementation evolved, and they no longer described the system's
 * behavior. They were removed in the same change that added this file.
 *
 * This smoke test is the deliberate minimum: it proves the app boots and
 * serves its health endpoint. Endpoint-specific contract tests will be
 * added back inline with the feature work that stabilizes each surface
 * (Worldtree MCP exposure, runtime session events, etc.).
 */
import request from 'supertest';
import type { Express } from 'express';
import { DruidApp } from '../../src/app';

describe('Contract smoke', () => {
  let app: Express;

  beforeAll(() => {
    const druidApp = new DruidApp();
    app = druidApp.getApp();
  });

  it('boots and serves the health endpoint with a healthy status', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
    });
  });
});
