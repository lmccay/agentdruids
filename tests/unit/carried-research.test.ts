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

import { selectCarriedStep, CarriedStepOutput } from '../../src/services/CoordinationService';

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
