/**
 * Contract tests for the read-only WorldTree MCP surface (Phase A).
 *
 * These exercise the pure, deterministic building blocks of the MCP surface —
 * tool/resource/prompt definitions, prompt expansion, resource URI routing, and
 * the tool handlers' REST endpoint construction (via a mock apiCall). No DB and
 * no live server: this proves the JSON-RPC-facing shapes and the REST contract
 * the handlers depend on. The REST routes themselves are covered by the
 * integration test.
 *
 * See docs/phase-a-worldtree-discovery.md.
 */
import {
  WORLDTREE_TOOL_DEFINITIONS,
  WORLDTREE_TOOL_NAMES,
  createWorldTreeToolHandlers,
} from '../../src/mcp/worldtree/worldtreeTools';
import {
  WORLDTREE_RESOURCE_DEFINITIONS,
  readWorldTreeResource,
  isWorldTreeResource,
} from '../../src/mcp/worldtree/worldtreeResources';
import {
  WORLDTREE_PROMPT_DEFINITIONS,
  getWorldTreePrompt,
} from '../../src/mcp/worldtree/worldtreePrompts';

describe('WorldTree MCP contract — tool definitions', () => {
  it('every tool has a name, description, and object input schema', () => {
    expect(WORLDTREE_TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    for (const tool of WORLDTREE_TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('exposes the seven Phase A tools', () => {
    expect([...WORLDTREE_TOOL_NAMES].sort()).toEqual(
      [
        'aggregate_contributions',
        'agent_activity',
        'compare_sessions',
        'find_sessions_by_prompt',
        'get_session',
        'list_sessions',
        'search_contributions',
      ].sort()
    );
  });
});

describe('WorldTree MCP contract — tool handlers build the right REST endpoints', () => {
  function captureEndpoints() {
    const calls: string[] = [];
    const apiCall = jest.fn(async (endpoint: string) => {
      calls.push(endpoint);
      return { ok: true };
    });
    return { handlers: createWorldTreeToolHandlers(apiCall), calls, apiCall };
  }

  it('list_sessions forwards filters as query params', async () => {
    const { handlers, calls } = captureEndpoints();
    await handlers['list_sessions']!({ status: 'completed', limit: 5, hasOutcomes: true });
    expect(calls[0]).toBe('/worldtree/sessions?status=completed&limit=5&hasOutcomes=true');
  });

  it('list_sessions omits undefined params', async () => {
    const { handlers, calls } = captureEndpoints();
    await handlers['list_sessions']!({});
    expect(calls[0]).toBe('/worldtree/sessions');
  });

  it('get_session encodes the id and forwards include flags', async () => {
    const { handlers, calls } = captureEndpoints();
    await handlers['get_session']!({ sessionId: 'sess/1', includeContributions: true });
    expect(calls[0]).toBe('/worldtree/sessions/sess%2F1?includeContributions=true');
  });

  it('get_session rejects a missing sessionId', async () => {
    const { handlers } = captureEndpoints();
    await expect(handlers['get_session']!({})).rejects.toThrow('sessionId is required');
  });

  it('find_sessions_by_prompt requires text', async () => {
    const { handlers } = captureEndpoints();
    await expect(handlers['find_sessions_by_prompt']!({})).rejects.toThrow('text is required');
  });

  it('aggregate_contributions requires groupBy', async () => {
    const { handlers } = captureEndpoints();
    await expect(handlers['aggregate_contributions']!({})).rejects.toThrow('groupBy is required');
  });

  it('compare_sessions requires both ids', async () => {
    const { handlers } = captureEndpoints();
    await expect(handlers['compare_sessions']!({ sessionIdA: 'a' })).rejects.toThrow('sessionIdA and sessionIdB are required');
  });

  it('agent_activity targets the agent activity endpoint', async () => {
    const { handlers, calls } = captureEndpoints();
    await handlers['agent_activity']!({ agentId: 'agent-1', since: '2026-01-01T00:00:00Z' });
    expect(calls[0]).toBe('/worldtree/agents/agent-1/activity?since=2026-01-01T00%3A00%3A00Z');
  });
});

describe('WorldTree MCP contract — resources', () => {
  it('advertises enumerable roots', () => {
    const uris = WORLDTREE_RESOURCE_DEFINITIONS.map((r) => r.uri);
    expect(uris).toContain('worldtree://sessions');
    expect(uris).toContain('worldtree://modes');
  });

  it.each([
    ['worldtree://sessions', '/worldtree/sessions'],
    ['worldtree://sessions/abc', '/worldtree/sessions/abc?includeContributions=true&includePublications=true'],
    ['worldtree://sessions/abc/contributions', '/worldtree/sessions/abc/contributions'],
    ['worldtree://sessions/abc/publications', '/worldtree/sessions/abc/publications'],
    ['worldtree://sessions/abc/publications/report', '/worldtree/sessions/abc/publications/report'],
    ['worldtree://agents/agent-1/contributions', '/worldtree/agents/agent-1/contributions'],
    ['worldtree://agents/agent-1/summary', '/worldtree/agents/agent-1/summary'],
    ['worldtree://realms/realm-1/sessions', '/worldtree/realms/realm-1/sessions'],
    ['worldtree://modes', '/worldtree/modes'],
  ])('routes %s to %s and returns an MCP resource payload', async (uri, expectedEndpoint) => {
    expect(isWorldTreeResource(uri)).toBe(true);
    const apiCall = jest.fn(async () => ({ value: 42 }));
    const result = await readWorldTreeResource(uri, apiCall);
    expect(apiCall).toHaveBeenCalledWith(expectedEndpoint);
    expect(result).not.toBeNull();
    expect(result!.contents[0]).toMatchObject({ uri, mimeType: 'application/json' });
    expect(JSON.parse(result!.contents[0]!.text)).toEqual({ value: 42 });
  });

  it('returns null for non-discovery URIs (falls through to existing handling)', async () => {
    const apiCall = jest.fn();
    expect(await readWorldTreeResource('worldtree://public/async_results/x', apiCall)).toBeNull();
    expect(await readWorldTreeResource('druids://agents', apiCall)).toBeNull();
    expect(isWorldTreeResource('worldtree://sessions/abc/unknown')).toBe(false);
    expect(apiCall).not.toHaveBeenCalled();
  });
});

describe('WorldTree MCP contract — prompts', () => {
  it('lists the four Phase A prompts with argument metadata', () => {
    const names = WORLDTREE_PROMPT_DEFINITIONS.map((p) => p.name).sort();
    expect(names).toEqual(['compare_two_sessions', 'find_similar_work', 'recap_agent', 'worldtree_health']);
  });

  it('expands recap_agent into a user message referencing the agent', () => {
    const prompt = getWorldTreePrompt('recap_agent', { agentId: 'agent-7', days: '14' });
    expect(prompt).not.toBeNull();
    expect(prompt!.messages[0]!.role).toBe('user');
    expect(prompt!.messages[0]!.content.text).toContain('agent-7');
    expect(prompt!.messages[0]!.content.text).toContain('14 days');
  });

  it('throws when a required prompt argument is missing', () => {
    expect(() => getWorldTreePrompt('compare_two_sessions', { sessionIdA: 'a' })).toThrow('Missing required argument: sessionIdB');
  });

  it('returns null for an unknown prompt', () => {
    expect(getWorldTreePrompt('does_not_exist')).toBeNull();
  });

  it('worldtree_health needs no arguments', () => {
    const prompt = getWorldTreePrompt('worldtree_health');
    expect(prompt).not.toBeNull();
    expect(prompt!.messages[0]!.content.text.toLowerCase()).toContain('health');
  });
});
