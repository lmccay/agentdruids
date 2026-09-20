/**
 * Carried Research Tests
 *
 * Realm-bound specialists are never granted corpus realms — that would be
 * O(specialists x realms) to administer and would grow with every new realm. So
 * the travelling agent carries its research into the activity realm, and the
 * session is how specialists read it. Session membership is the authorization;
 * nothing is granted, so nothing has to be revoked.
 *
 * Addressing is by producer or role, never by ordinal. A specialist knows the
 * ids of its fellow participants; it has no way to know whether the research
 * was step 2 or step 5, and that number changes per run.
 *
 * The property these tests exist to protect is the one whose absence produced
 * invented content: a miss must be reported as a miss, so the agent can declare
 * a gap rather than improvise.
 */

import {
  selectCarriedStep,
  mayReadCarriedResearch,
  CarriedStepOutput,
} from '../../src/services/CoordinationService';

const step = (
  stepNumber: number,
  agentId: string,
  description: string,
  output = `output of step ${stepNumber}`
): CarriedStepOutput => ({
  stepNumber,
  agentId,
  description,
  output,
  completedAt: `2026-09-20T16:0${stepNumber}:00.000Z`,
});

const SESSION: CarriedStepOutput[] = [
  step(1, 'campaign-coordinator-druid', 'Research the corpus', 'the vetted research brief'),
  step(2, 'positioner-elemental', 'Produce positioning', 'the positioning statement'),
  step(3, 'campaign-coordinator-druid', 'Assemble the campaign', 'the assembled plan'),
];

describe('selectCarriedStep', () => {
  describe('addressing by producer', () => {
    it('returns that agent\'s output', () => {
      expect(selectCarriedStep(SESSION, { from: 'positioner-elemental' })?.output)
        .toBe('the positioning statement');
    });

    it('returns the most recent when an agent produced several', () => {
      // The coordinator ran twice; "what did it produce" means the latest.
      expect(selectCarriedStep(SESSION, { from: 'campaign-coordinator-druid' })?.stepNumber).toBe(3);
    });

    it('reports a miss for an agent that has not produced anything', () => {
      expect(selectCarriedStep(SESSION, { from: 'reddit-elemental' })).toBeNull();
    });
  });

  describe('addressing by role', () => {
    it('matches a step label case-insensitively', () => {
      expect(selectCarriedStep(SESSION, { role: 'RESEARCH' })?.stepNumber).toBe(1);
    });

    it('matches a substring of the label', () => {
      expect(selectCarriedStep(SESSION, { role: 'positioning' })?.agentId)
        .toBe('positioner-elemental');
    });

    it('reports a miss for an unknown role', () => {
      expect(selectCarriedStep(SESSION, { role: 'legal review' })).toBeNull();
    });
  });

  describe('addressing by ordinal — the last resort', () => {
    it('works when the caller genuinely has a number', () => {
      expect(selectCarriedStep(SESSION, { step: 2 })?.agentId).toBe('positioner-elemental');
    });

    it('reports a miss for a step that does not exist in this run', () => {
      // Exactly why ordinals are discouraged: plans differ per run.
      expect(selectCarriedStep(SESSION, { step: 9 })).toBeNull();
    });
  });

  describe('precedence and defaults', () => {
    it('prefers producer over role and ordinal', () => {
      const chosen = selectCarriedStep(SESSION, {
        from: 'positioner-elemental',
        role: 'Research',
        step: 3,
      });
      expect(chosen?.agentId).toBe('positioner-elemental');
    });

    it('returns the most recent step when nothing is specified', () => {
      // "What did the agent before me produce" is the common case.
      expect(selectCarriedStep(SESSION)?.stepNumber).toBe(3);
    });
  });

  describe('a miss is a miss — never a silent empty', () => {
    it('returns null when no steps have completed', () => {
      expect(selectCarriedStep([])).toBeNull();
      expect(selectCarriedStep(undefined)).toBeNull();
    });

    it('ignores steps that completed with no output', () => {
      // An empty string would read as "there is no context" to the agent while
      // looking like a successful retrieval to the code.
      const empty = [step(1, 'campaign-coordinator-druid', 'Research the corpus', '')];
      expect(selectCarriedStep(empty, { from: 'campaign-coordinator-druid' })).toBeNull();
      expect(selectCarriedStep(empty)).toBeNull();
    });

    it('does not fall back to another agent when the named one is absent', () => {
      // Falling back would hand a specialist someone else's work and look like
      // success — the exact shape of the failure this design prevents.
      expect(selectCarriedStep(SESSION, { from: 'legal-elemental' })).toBeNull();
    });
  });

  describe('a legacy content_id must not resolve to the wrong step', () => {
    // buildStepContext used to hand agents content ids and an example call that
    // supplied no selector at all. Under the new interface that would fall
    // through to "most recent step" — answering a request for step 1 with step
    // 3 and looking successful. The tool translates the ordinal where the id
    // carries one and refuses where it does not; these pin the selector half.
    it('an ordinal parsed from a legacy id selects that step, not the latest', () => {
      const parsed = 'step-session-1789919978857-7d54b20b-step-1'.match(/step-(\d+)\s*$/);
      expect(parsed?.[1]).toBe('1');
      expect(selectCarriedStep(SESSION, { step: Number(parsed![1]) })?.stepNumber).toBe(1);
      expect(selectCarriedStep(SESSION)?.stepNumber).toBe(3); // what it would have returned
    });

    it('an unparseable ordinal must not silently become the latest step', () => {
      // The tool returns unaddressable_content_id for this rather than calling
      // the selector with an empty query.
      expect('coordination/some-opaque-key'.match(/step-(\d+)\s*$/)).toBeNull();
    });
  });

  describe('membership is the authorization', () => {
    // Holding a session id is not membership. sendToAgent admits any active,
    // realm co-located target and never consults participantIds, so a
    // participant can delegate outward and the delegate inherits the session
    // id. Without this check it would also inherit the research.
    const session = {
      coordinatorId: 'campaign-coordinator-druid',
      participantIds: ['positioner-elemental', 'reddit-elemental'],
    };

    it('admits a participant', () => {
      expect(mayReadCarriedResearch(session, 'reddit-elemental')).toBe(true);
    });

    it('admits the coordinator even when absent from participantIds', () => {
      // The coordinator drives the session without necessarily listing itself.
      expect(session.participantIds).not.toContain('campaign-coordinator-druid');
      expect(mayReadCarriedResearch(session, 'campaign-coordinator-druid')).toBe(true);
    });

    it('refuses an agent outside the session — the delegation escape', () => {
      expect(mayReadCarriedResearch(session, 'legal-elemental')).toBe(false);
    });

    it('refuses when the session is unknown', () => {
      expect(mayReadCarriedResearch(undefined, 'reddit-elemental')).toBe(false);
    });

    it('refuses an empty or missing caller rather than defaulting open', () => {
      expect(mayReadCarriedResearch(session, '')).toBe(false);
      expect(mayReadCarriedResearch(session, undefined)).toBe(false);
    });

    it('refuses when a session has no participants recorded', () => {
      expect(mayReadCarriedResearch({ coordinatorId: 'x' }, 'reddit-elemental')).toBe(false);
    });
  });

  describe('isolation', () => {
    it('only ever sees the outputs it is given', () => {
      // The caller cannot name a session; the runtime supplies the list. This
      // pins that the selector has no other source.
      const other = [step(1, 'other-session-agent', 'Something else', 'other content')];
      expect(selectCarriedStep(other, { from: 'campaign-coordinator-druid' })).toBeNull();
      expect(selectCarriedStep(other)?.output).toBe('other content');
    });
  });
});
