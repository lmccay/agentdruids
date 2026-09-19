/**
 * Coordinator Resolution Tests
 *
 * A coordination session can be driven by three kinds of coordinator: the
 * built-in engine, a stored coordinator, or an agent acting as one (a druid the
 * caller nominated).
 *
 * `getCoordinator` used to resolve only the first:
 *
 *     return coordinatorId === 'built-in-coordinator' ? this.builtInCoordinator : undefined;
 *
 * while `performCoordination` resolved all three inline. So a druid-coordinated
 * session started successfully and then threw "Coordinator <id> not found"
 * inside createOrchestrationPlan — which is caught and silently downgraded to
 * executeSimpleCoordination. The symptom was not an error but a thinner report:
 * no delegation to participants, one corpus search instead of several, and no
 * persisted contributions.
 *
 * The tests that matter are the agreement ones: whatever the session accepts as
 * a coordinator, planning must be able to resolve. Two resolutions of the same
 * thing is what caused this, so the guard is that there is only one.
 */

import { resolveCoordinator, coordinatorFromAgent, Coordinator } from '../../src/services/CoordinationService';

const DRUID = {
  id: 'campaign-coordinator-druid',
  name: 'Campaign Coordinator',
  type: 'druid',
  description: 'Coordinates launch campaigns',
  llmConfig: { model: 'gpt-5', systemPrompt: 'You are a launch campaign coordinator.', temperature: 0.4 },
};

const BUILT_IN = { id: 'built-in-coordinator', name: 'System Coordination Engine' } as Coordinator;

/**
 * Deps rather than a constructed CoordinationService: the constructor starts LLM
 * clients and leaves open handles, so a test that builds one hangs the suite
 * without --forceExit (see #116).
 *
 * getAgent throws on a miss, as AgentService.getAgent does.
 */
function depsWith(agents: Record<string, unknown>) {
  const calls: string[] = [];
  const stored = new Map<string, Coordinator>();
  return {
    calls,
    stored,
    deps: {
      builtIn: BUILT_IN,
      stored,
      getAgent: async (id: string) => {
        calls.push(id);
        const agent = agents[id];
        if (!agent) throw new Error(`Agent not found: ${id}`);
        return agent;
      },
    },
  };
}

describe('coordinatorFromAgent', () => {
  it('adapts an agent into a coordinator without losing its identity', () => {
    const c = coordinatorFromAgent(DRUID);
    expect(c.id).toBe('campaign-coordinator-druid');
    expect(c.name).toBe('Campaign Coordinator');
    expect(c.description).toBe('Coordinates launch campaigns');
  });

  it('carries the agent\'s own model and prompt through', () => {
    const c = coordinatorFromAgent(DRUID);
    expect(c.llmConfig.model).toBe('gpt-5');
    expect(c.llmConfig.systemPrompt).toBe('You are a launch campaign coordinator.');
    expect(c.llmConfig.temperature).toBe(0.4);
  });

  it('supplies a description when the agent has none', () => {
    const c = coordinatorFromAgent({ id: 'a', name: 'Anon' });
    expect(c.description).toContain('Anon');
  });

  it('does not throw on an agent with no llmConfig', () => {
    // The wrapper's own llmConfig is vestigial for this path —
    // executeCoordinatorPrompt routes a wrapped agent through
    // executeAgentPrompt, which uses the agent's real provider — but it must
    // still be well-formed.
    const c = coordinatorFromAgent({ id: 'a', name: 'Anon' });
    expect(typeof c.llmConfig.model).toBe('string');
    expect(c.llmConfig.model.length).toBeGreaterThan(0);
  });
});

describe('resolveCoordinator', () => {
  it('resolves the built-in engine', async () => {
    const { deps } = depsWith({});
    expect((await resolveCoordinator('built-in-coordinator', deps))?.id).toBe('built-in-coordinator');
  });

  it('resolves a stored coordinator without consulting agents', async () => {
    const { deps, stored, calls } = depsWith({});
    const c = { id: 'stored-1', name: 'Stored' } as Coordinator;
    stored.set('stored-1', c);

    expect(await resolveCoordinator('stored-1', deps)).toBe(c);
    expect(calls).toEqual([]);
  });

  it('resolves a druid agent as coordinator — the case that returned undefined', async () => {
    const { deps } = depsWith({ 'campaign-coordinator-druid': DRUID });
    const c = await resolveCoordinator('campaign-coordinator-druid', deps);
    expect(c).toBeDefined();
    expect(c?.id).toBe('campaign-coordinator-druid');
    expect(c?.llmConfig.systemPrompt).toBe('You are a launch campaign coordinator.');
  });

  it('returns undefined rather than throwing when the agent lookup misses', async () => {
    // getAgent throws on a miss; a miss is "no such coordinator", not an error
    // that should escape and fail the session.
    const { deps } = depsWith({});
    await expect(resolveCoordinator('no-such-agent', deps)).resolves.toBeUndefined();
  });

  it('returns undefined for an empty id without hitting the agent service', async () => {
    const { deps, calls } = depsWith({});
    expect(await resolveCoordinator('', deps)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('still resolves the built-in engine with no agent lookup wired', async () => {
    const deps = { builtIn: BUILT_IN, stored: new Map<string, Coordinator>() };
    expect((await resolveCoordinator('built-in-coordinator', deps))?.id).toBe('built-in-coordinator');
    expect(await resolveCoordinator('campaign-coordinator-druid', deps)).toBeUndefined();
  });
});

describe('the agreement that was broken', () => {
  // performCoordination resolved all three kinds inline while
  // createOrchestrationPlan used the narrow getCoordinator. Both now call this
  // function, so the guard is that every kind a session accepts is resolvable
  // for planning.
  it.each([
    ['built-in engine', 'built-in-coordinator'],
    ['druid acting as coordinator', 'campaign-coordinator-druid'],
  ])('planning can resolve the %s', async (_label, id) => {
    const { deps } = depsWith({ 'campaign-coordinator-druid': DRUID });
    const resolved = await resolveCoordinator(id, deps);
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe(id);
  });

  it('resolves consistently across the two points that ask', async () => {
    // Session start and plan creation resolve separately; they must agree.
    const { deps } = depsWith({ 'campaign-coordinator-druid': DRUID });
    const atStart = await resolveCoordinator('campaign-coordinator-druid', deps);
    const atPlanning = await resolveCoordinator('campaign-coordinator-druid', deps);
    expect(atPlanning?.id).toBe(atStart?.id);
    expect(atPlanning?.llmConfig.systemPrompt).toBe(atStart?.llmConfig.systemPrompt);
  });
});
