/**
 * Integration tests for the read-only WorldTree REST surface (Phase A).
 *
 * These run the real WorldTreeQueryService SQL against the live database (the
 * druids-app container reaches druids-postgres). The MCP server reaches these
 * same routes over HTTP, so proving the routes proves the discovery surface.
 *
 * The suite seeds two sessions with contributions and one publication, exercises
 * every endpoint against that known data, then removes it (ON DELETE CASCADE
 * cleans up contributions and publications).
 *
 * See docs/phase-a-worldtree-discovery.md.
 */
import request from 'supertest';
import type { Express } from 'express';
import { DruidApp } from '../../src/app';
import { DatabaseService } from '../../src/services/DatabaseService';

const PREFIX = `wt-it-${Date.now()}`;
const SESSION_A = `${PREFIX}-a`;
const SESSION_B = `${PREFIX}-b`;
const COORDINATOR = `${PREFIX}-coord`;
const REALM = `${PREFIX}-realm`;
const AGENT = `${PREFIX}-elem`;

describe('WorldTree REST surface (integration)', () => {
  let app: Express;
  let db: DatabaseService;

  beforeAll(async () => {
    app = new DruidApp().getApp();
    db = DatabaseService.getInstance();

    await db.query(
      `INSERT INTO druids_core.coordination_sessions
         (session_id, coordinator_agent_id, realm_id, prompt, status, participant_agent_ids, metadata)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6)
       ON CONFLICT (session_id) DO NOTHING`,
      [SESSION_A, COORDINATOR, REALM, 'Plan a marketing campaign for autumn', [AGENT], JSON.stringify({ synthesis: 'Autumn plan synthesis' })]
    );
    await db.query(
      `INSERT INTO druids_core.coordination_sessions
         (session_id, coordinator_agent_id, realm_id, prompt, status, participant_agent_ids, metadata)
       VALUES ($1, $2, $3, $4, 'completed', $5, '{}'::jsonb)
       ON CONFLICT (session_id) DO NOTHING`,
      [SESSION_B, COORDINATOR, REALM, 'Draft a legal brief on contracts', [AGENT]]
    );

    await db.query(
      `INSERT INTO druids_core.session_contributions
         (session_id, step_number, sub_step_number, agent_id, agent_role, agent_type, action_type, description, content)
       VALUES
         ($1, 1, 0, $2, 'coordinator', 'druid', 'plan', 'step 1', 'orchestration step content'),
         ($1, 1, 1, $3, 'elemental', 'elemental', 'respond', 'elemental reply', 'autumn campaign ideas about pumpkins'),
         ($4, 1, 0, $2, 'coordinator', 'druid', 'plan', 'step 1', 'brief outline content')
       ON CONFLICT (session_id, step_number, sub_step_number) DO NOTHING`,
      [SESSION_A, COORDINATOR, AGENT, SESSION_B]
    );

    // One publication for SESSION_A in 'report' mode (mode seeded by migration 006).
    await db.query(
      `INSERT INTO druids_core.session_publications (session_id, mode_id, status, content_uri, published_at)
       SELECT $1, m.id, 'published', $2, CURRENT_TIMESTAMP
         FROM druids_core.publishing_modes m
        WHERE m.name = 'report'
       ON CONFLICT (session_id, mode_id) DO NOTHING`,
      [SESSION_A, `worldtree://sessions/${SESSION_A}/report.md`]
    );
  });

  afterAll(async () => {
    await db.query(`DELETE FROM druids_core.coordination_sessions WHERE session_id = ANY($1::varchar[])`, [
      [SESSION_A, SESSION_B],
    ]);
  });

  it('lists sessions filtered by coordinator with a pagination envelope', async () => {
    const res = await request(app).get('/api/worldtree/sessions').query({ coordinatorId: COORDINATOR }).expect(200);
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('offset');
    expect(Array.isArray(res.body.sessions)).toBe(true);
    const ids = res.body.sessions.map((s: any) => s.sessionId);
    expect(ids).toEqual(expect.arrayContaining([SESSION_A, SESSION_B]));
  });

  it('gets a full session record with contributions, publications, and forward-compat outcomes:[]', async () => {
    const res = await request(app)
      .get(`/api/worldtree/sessions/${SESSION_A}`)
      .query({ includeContributions: 'true', includePublications: 'true' })
      .expect(200);
    expect(res.body.sessionId).toBe(SESSION_A);
    expect(res.body.synthesis).toBe('Autumn plan synthesis');
    expect(res.body.outcomes).toEqual([]); // Phase F forward-compat
    expect(res.body.contributions).toHaveLength(2);
    expect(res.body.publications.map((p: any) => p.modeName)).toContain('report');
  });

  it('404s an unknown session', async () => {
    await request(app).get(`/api/worldtree/sessions/${PREFIX}-nope`).expect(404);
  });

  it('finds sessions by prompt text', async () => {
    const res = await request(app).get('/api/worldtree/search/sessions').query({ text: 'autumn' }).expect(200);
    expect(res.body.sessions.map((s: any) => s.sessionId)).toContain(SESSION_A);
  });

  it('400s a prompt search with no text', async () => {
    await request(app).get('/api/worldtree/search/sessions').expect(400);
  });

  it('searches contributions with AND-combined filters', async () => {
    const res = await request(app)
      .get('/api/worldtree/search/contributions')
      .query({ sessionId: SESSION_A, agentRole: 'elemental', text: 'pumpkins' })
      .expect(200);
    expect(res.body.contributions).toHaveLength(1);
    expect(res.body.contributions[0].agentId).toBe(AGENT);
  });

  it('aggregates contributions by agent_role', async () => {
    const res = await request(app)
      .get('/api/worldtree/aggregate/contributions')
      .query({ groupBy: 'agent_role', sessionId: SESSION_A })
      .expect(200);
    expect(res.body.groupBy).toBe('agent_role');
    const roles = res.body.groups.map((g: any) => g.group);
    expect(roles).toEqual(expect.arrayContaining(['coordinator', 'elemental']));
  });

  it('400s an invalid aggregate groupBy', async () => {
    await request(app).get('/api/worldtree/aggregate/contributions').query({ groupBy: 'bogus' }).expect(400);
  });

  it('compares two sessions', async () => {
    const res = await request(app)
      .get('/api/worldtree/compare')
      .query({ sessionIdA: SESSION_A, sessionIdB: SESSION_B })
      .expect(200);
    expect(res.body.a.contributionCount).toBe(2);
    expect(res.body.b.contributionCount).toBe(1);
  });

  it('400s a compare missing an id', async () => {
    await request(app).get('/api/worldtree/compare').query({ sessionIdA: SESSION_A }).expect(400);
  });

  it('returns agent summary stats', async () => {
    const res = await request(app).get(`/api/worldtree/agents/${AGENT}/summary`).expect(200);
    expect(res.body.agentId).toBe(AGENT);
    expect(res.body.contributionCount).toBe(1);
    expect(res.body.distinctSessions).toBe(1);
  });

  it('returns an agent activity timeline with summary', async () => {
    const res = await request(app).get(`/api/worldtree/agents/${AGENT}/activity`).expect(200);
    expect(res.body.summary.contributionCount).toBe(1);
    expect(Array.isArray(res.body.timeline)).toBe(true);
  });

  it('lists sessions for a realm', async () => {
    const res = await request(app).get(`/api/worldtree/realms/${REALM}/sessions`).expect(200);
    expect(res.body.sessions.map((s: any) => s.sessionId)).toEqual(expect.arrayContaining([SESSION_A, SESSION_B]));
  });

  it('returns the publishing-mode catalog', async () => {
    const res = await request(app).get('/api/worldtree/modes').expect(200);
    expect(res.body.modes.map((m: any) => m.name)).toContain('report');
  });

  it('returns a single publication by mode', async () => {
    const res = await request(app).get(`/api/worldtree/sessions/${SESSION_A}/publications/report`).expect(200);
    expect(res.body.publication.modeName).toBe('report');
    expect(res.body.publication.status).toBe('published');
  });

  it('404s a publication for a mode that was not published', async () => {
    await request(app).get(`/api/worldtree/sessions/${SESSION_A}/publications/transcript`).expect(404);
  });

  it('reports WorldTree health with outcomesAttachedCount of 0 (Phase A)', async () => {
    const res = await request(app).get('/api/worldtree/health').expect(200);
    expect(typeof res.body.sessionCount).toBe('number');
    expect(res.body.outcomesAttachedCount).toBe(0);
  });
});
