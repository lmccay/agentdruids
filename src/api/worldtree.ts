import express from 'express';
import {
  getWorldTreeQueryService,
  type AggregateGroupBy,
} from '../services/WorldTreeQueryService';

/**
 * Read-only REST surface for conversational WorldTree discovery (Phase A).
 *
 * Every route delegates to WorldTreeQueryService — the single SQL owner. The
 * MCP server (druids-mcp), which has no direct database access, reaches these
 * routes via HTTP, exactly as it does for coordination and published content.
 *
 * See docs/phase-a-worldtree-discovery.md.
 */

const router = express.Router();

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asInt(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asBool(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function fail(res: express.Response, error: unknown, message: string): void {
  console.error(`WorldTree query error: ${message}`, error);
  res.status(500).json({
    error: message,
    details: error instanceof Error ? error.message : String(error),
  });
}

// Index of sessions with filters.
router.get('/sessions', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const result = await svc.listSessions({
      status: asString(req.query['status']),
      coordinatorId: asString(req.query['coordinatorId']),
      realmId: asString(req.query['realmId']),
      since: asString(req.query['since']),
      until: asString(req.query['until']),
      limit: asInt(req.query['limit']),
      offset: asInt(req.query['offset']),
      hasOutcomes: asBool(req.query['hasOutcomes']),
    });
    res.json(result);
  } catch (error) {
    fail(res, error, 'Failed to list sessions');
  }
});

// Text-match search over session prompts.
router.get('/search/sessions', async (req, res) => {
  try {
    const text = asString(req.query['text']);
    if (!text) return res.status(400).json({ error: 'text query parameter is required' });
    const svc = getWorldTreeQueryService();
    const sessions = await svc.findSessionsByPrompt(text, asInt(req.query['limit']));
    return res.json({ sessions });
  } catch (error) {
    return fail(res, error, 'Failed to search sessions');
  }
});

// Filtered contribution search.
router.get('/search/contributions', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const result = await svc.searchContributions({
      text: asString(req.query['text']),
      agentId: asString(req.query['agentId']),
      agentRole: asString(req.query['agentRole']),
      actionType: asString(req.query['actionType']),
      sessionId: asString(req.query['sessionId']),
      since: asString(req.query['since']),
      until: asString(req.query['until']),
      limit: asInt(req.query['limit']),
      offset: asInt(req.query['offset']),
    });
    res.json(result);
  } catch (error) {
    fail(res, error, 'Failed to search contributions');
  }
});

// Grouped contribution aggregates.
router.get('/aggregate/contributions', async (req, res) => {
  try {
    const groupBy = asString(req.query['groupBy']) as AggregateGroupBy | undefined;
    const allowed: AggregateGroupBy[] = ['agent_id', 'agent_role', 'action_type', 'day'];
    if (!groupBy || !allowed.includes(groupBy)) {
      return res.status(400).json({ error: `groupBy must be one of: ${allowed.join(', ')}` });
    }
    const svc = getWorldTreeQueryService();
    const groups = await svc.aggregateContributions(groupBy, {
      agentId: asString(req.query['agentId']),
      agentRole: asString(req.query['agentRole']),
      actionType: asString(req.query['actionType']),
      sessionId: asString(req.query['sessionId']),
    });
    return res.json({ groupBy, groups });
  } catch (error) {
    return fail(res, error, 'Failed to aggregate contributions');
  }
});

// Side-by-side comparison of two sessions.
router.get('/compare', async (req, res) => {
  try {
    const a = asString(req.query['sessionIdA']);
    const b = asString(req.query['sessionIdB']);
    if (!a || !b) return res.status(400).json({ error: 'sessionIdA and sessionIdB are required' });
    const svc = getWorldTreeQueryService();
    const comparison = await svc.compareSessions(a, b);
    return res.json(comparison);
  } catch (error) {
    return fail(res, error, 'Failed to compare sessions');
  }
});

// Publishing-mode catalog.
router.get('/modes', async (_req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const modes = await svc.listModes();
    res.json({ modes });
  } catch (error) {
    fail(res, error, 'Failed to list modes');
  }
});

// Ingested documents (Docling) — list.
router.get('/documents', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const result = await svc.listDocuments({
      sourceUri: asString(req.query['sourceUri']),
      namespace: asString(req.query['namespace']),
      since: asString(req.query['since']),
      limit: asInt(req.query['limit']),
      offset: asInt(req.query['offset']),
    });
    res.json(result);
  } catch (error) {
    fail(res, error, 'Failed to list documents');
  }
});

// Lexical search over ingested document text.
router.get('/documents/search', async (req, res) => {
  try {
    const text = asString(req.query['text']);
    if (!text) return res.status(400).json({ error: 'text query parameter is required' });
    const svc = getWorldTreeQueryService();
    const result = await svc.searchDocuments(text, { limit: asInt(req.query['limit']), offset: asInt(req.query['offset']) });
    return res.json(result);
  } catch (error) {
    return fail(res, error, 'Failed to search documents');
  }
});

// Readable text of a document (for an agent to reason over).
router.get('/documents/:id/content', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const doc = await svc.readDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    return res.json(doc);
  } catch (error) {
    return fail(res, error, 'Failed to read document');
  }
});

// Full catalog record for one document + its renderings.
router.get('/documents/:id', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const document = await svc.getDocument(req.params.id);
    if (!document) return res.status(404).json({ error: 'Document not found' });
    return res.json({ document });
  } catch (error) {
    return fail(res, error, 'Failed to get document');
  }
});

// Health rollup.
router.get('/health', async (_req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const health = await svc.worldtreeHealth();
    res.json(health);
  } catch (error) {
    fail(res, error, 'Failed to compute WorldTree health');
  }
});

// Agent contributions across sessions.
router.get('/agents/:agentId/contributions', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const result = await svc.agentContributions(req.params.agentId, {
      limit: asInt(req.query['limit']),
      offset: asInt(req.query['offset']),
    });
    res.json(result);
  } catch (error) {
    fail(res, error, 'Failed to get agent contributions');
  }
});

// Aggregate stats for one agent.
router.get('/agents/:agentId/summary', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const summary = await svc.agentSummary(req.params.agentId);
    res.json(summary);
  } catch (error) {
    fail(res, error, 'Failed to get agent summary');
  }
});

// Agent activity timeline.
router.get('/agents/:agentId/activity', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const activity = await svc.agentActivity(req.params.agentId, {
      since: asString(req.query['since']),
      until: asString(req.query['until']),
    });
    res.json(activity);
  } catch (error) {
    fail(res, error, 'Failed to get agent activity');
  }
});

// All sessions that ran in a realm.
router.get('/realms/:realmId/sessions', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const result = await svc.realmSessions(req.params.realmId, {
      limit: asInt(req.query['limit']),
      offset: asInt(req.query['offset']),
    });
    res.json(result);
  } catch (error) {
    fail(res, error, 'Failed to get realm sessions');
  }
});

// Contributions for one session.
router.get('/sessions/:sessionId/contributions', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const contributions = await svc.getSessionContributions(req.params.sessionId);
    res.json({ contributions });
  } catch (error) {
    fail(res, error, 'Failed to get session contributions');
  }
});

// A single publication for a session by mode.
router.get('/sessions/:sessionId/publications/:mode', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const publication = await svc.getSessionPublicationByMode(req.params.sessionId, req.params.mode);
    if (!publication) return res.status(404).json({ error: 'Publication not found for session/mode' });
    return res.json({ publication });
  } catch (error) {
    return fail(res, error, 'Failed to get session publication');
  }
});

// All publications for a session.
router.get('/sessions/:sessionId/publications', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const publications = await svc.getSessionPublications(req.params.sessionId);
    res.json({ publications });
  } catch (error) {
    fail(res, error, 'Failed to get session publications');
  }
});

// Full session record.
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const svc = getWorldTreeQueryService();
    const session = await svc.getSession(req.params.sessionId, {
      includeContributions: asBool(req.query['includeContributions']) ?? false,
      includePublications: asBool(req.query['includePublications']) ?? false,
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json(session);
  } catch (error) {
    return fail(res, error, 'Failed to get session');
  }
});

export default router;
