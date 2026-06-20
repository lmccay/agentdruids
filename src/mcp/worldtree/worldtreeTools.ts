/**
 * WorldTree conversational query tools for the MCP surface (Phase A).
 *
 * These are the callable, JSON-in/JSON-out tools an MCP client uses to answer
 * open-ended questions about past coordination work. Each handler is a thin
 * adapter: it builds a query string and calls the main app's read-only
 * /api/worldtree REST routes via the injected `apiCall`. No SQL here — that
 * lives in WorldTreeQueryService.
 *
 * See docs/phase-a-worldtree-discovery.md.
 */

export type ApiCall = (
  endpoint: string,
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
  data?: unknown
) => Promise<any>;

export type WorldTreeToolHandler = (args: Record<string, any>) => Promise<any>;

/** Tool definitions for `tools/list`. */
export const WORLDTREE_TOOL_DEFINITIONS = [
  {
    name: 'list_sessions',
    description: 'List past coordination sessions in the WorldTree, newest first, with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by session status (e.g. completed, failed, running)' },
        coordinatorId: { type: 'string', description: 'Filter by coordinator agent id' },
        realmId: { type: 'string', description: 'Filter by realm id' },
        since: { type: 'string', description: 'ISO-8601 lower bound on started_at' },
        until: { type: 'string', description: 'ISO-8601 upper bound on started_at' },
        limit: { type: 'number', description: 'Max sessions to return (default 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        hasOutcomes: { type: 'boolean', description: 'Phase F: filter to sessions with attached outcome metrics. Currently ignored.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_session',
    description: 'Get the full record for one coordination session, optionally including contributions and publications.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id' },
        includeContributions: { type: 'boolean', description: 'Include all contribution rows' },
        includePublications: { type: 'boolean', description: 'Include all publication rows' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_sessions_by_prompt',
    description: 'Find sessions whose prompt matches the given text (case-insensitive substring match).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to match against session prompts' },
        limit: { type: 'number', description: 'Max sessions to return (default 50)' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_contributions',
    description: 'Search agent contributions across sessions with AND-combined filters.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Case-insensitive substring match on contribution content' },
        agentId: { type: 'string', description: 'Filter by agent id' },
        agentRole: { type: 'string', description: 'Filter by agent role (druid, elemental, gaia, worldtree, coordinator, ...)' },
        actionType: { type: 'string', description: 'Filter by action type' },
        sessionId: { type: 'string', description: 'Filter to a single session' },
        since: { type: 'string', description: 'ISO-8601 lower bound on created_at' },
        until: { type: 'string', description: 'ISO-8601 upper bound on created_at' },
        limit: { type: 'number', description: 'Max rows to return (default 100)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'aggregate_contributions',
    description: 'Group contributions and report counts, total content length, average duration, and distinct sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        groupBy: {
          type: 'string',
          enum: ['agent_id', 'agent_role', 'action_type', 'day'],
          description: 'Dimension to group by',
        },
        agentId: { type: 'string', description: 'Optional filter by agent id' },
        agentRole: { type: 'string', description: 'Optional filter by agent role' },
        actionType: { type: 'string', description: 'Optional filter by action type' },
        sessionId: { type: 'string', description: 'Optional filter to a single session' },
      },
      required: ['groupBy'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_sessions',
    description: 'Compare two sessions side by side: prompts, per-role contribution counts, and totals.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionIdA: { type: 'string', description: 'First session id' },
        sessionIdB: { type: 'string', description: 'Second session id' },
      },
      required: ['sessionIdA', 'sessionIdB'],
      additionalProperties: false,
    },
  },
  {
    name: 'agent_activity',
    description: "Get an agent's contribution timeline with summary stats over an optional time window.",
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'The agent id' },
        since: { type: 'string', description: 'ISO-8601 lower bound on created_at' },
        until: { type: 'string', description: 'ISO-8601 upper bound on created_at' },
      },
      required: ['agentId'],
      additionalProperties: false,
    },
  },
];

export const WORLDTREE_TOOL_NAMES: ReadonlySet<string> = new Set(
  WORLDTREE_TOOL_DEFINITIONS.map((t) => t.name)
);

/** Build a query string from defined (non-undefined/null) params. */
function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.append(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

/** Factory that binds the tool handlers to an apiCall implementation. */
export function createWorldTreeToolHandlers(apiCall: ApiCall): Record<string, WorldTreeToolHandler> {
  return {
    list_sessions: async (args) => {
      const { status, coordinatorId, realmId, since, until, limit, offset, hasOutcomes } = args;
      return apiCall(
        `/worldtree/sessions${qs({ status, coordinatorId, realmId, since, until, limit, offset, hasOutcomes })}`
      );
    },

    get_session: async (args) => {
      const { sessionId, includeContributions, includePublications } = args;
      if (!sessionId) throw new Error('sessionId is required');
      return apiCall(
        `/worldtree/sessions/${encodeURIComponent(sessionId)}${qs({ includeContributions, includePublications })}`
      );
    },

    find_sessions_by_prompt: async (args) => {
      const { text, limit } = args;
      if (!text) throw new Error('text is required');
      return apiCall(`/worldtree/search/sessions${qs({ text, limit })}`);
    },

    search_contributions: async (args) => {
      const { text, agentId, agentRole, actionType, sessionId, since, until, limit, offset } = args;
      return apiCall(
        `/worldtree/search/contributions${qs({ text, agentId, agentRole, actionType, sessionId, since, until, limit, offset })}`
      );
    },

    aggregate_contributions: async (args) => {
      const { groupBy, agentId, agentRole, actionType, sessionId } = args;
      if (!groupBy) throw new Error('groupBy is required');
      return apiCall(
        `/worldtree/aggregate/contributions${qs({ groupBy, agentId, agentRole, actionType, sessionId })}`
      );
    },

    compare_sessions: async (args) => {
      const { sessionIdA, sessionIdB } = args;
      if (!sessionIdA || !sessionIdB) throw new Error('sessionIdA and sessionIdB are required');
      return apiCall(`/worldtree/compare${qs({ sessionIdA, sessionIdB })}`);
    },

    agent_activity: async (args) => {
      const { agentId, since, until } = args;
      if (!agentId) throw new Error('agentId is required');
      return apiCall(`/worldtree/agents/${encodeURIComponent(agentId)}/activity${qs({ since, until })}`);
    },
  };
}
