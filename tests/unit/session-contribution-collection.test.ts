/**
 * Session Contribution Collection Tests
 *
 * A finished session's per-contributor output can live in three places, because
 * the paths that produce it evolved separately:
 *
 *   1. plan.steps                                  — orchestration path
 *   2. session.participantTasks                    — direct task assignment
 *   3. session.finalResult.participantContributions — executeSimpleCoordination,
 *                                                    the fallback taken when
 *                                                    orchestration throws
 *
 * Only the first two were ever read. A session that fell back persisted zero
 * contributions while reporting success: seven agents produced ~40,000
 * characters, none of it was recorded, and the published report kept only the
 * token-truncated synthesis.
 *
 * The invariant these tests exist to hold is at the bottom: a completed session
 * that produced contributions never persists zero rows, whatever path produced
 * them. That is the assertion that catches the *next* collection someone adds,
 * which is the way this failed the first time.
 */

import {
  collectSessionContributions,
  CoordinationSession,
  OrchestrationPlan,
} from '../../src/services/CoordinationService';

const AT = new Date('2026-09-19T18:13:17.000Z');
const DONE = new Date('2026-09-19T18:29:00.000Z');

function baseSession(overrides: Partial<CoordinationSession> = {}): CoordinationSession {
  return {
    id: 'session-test-1',
    coordinatorId: 'campaign-coordinator-druid',
    scenarioPrompt: 'launch campaign',
    participantIds: ['positioner-elemental', 'reddit-elemental'],
    participantTasks: [],
    status: 'completed',
    startedAt: AT,
    completedAt: DONE,
    timeoutMinutes: 30,
    ...overrides,
  } as CoordinationSession;
}

const plan = (steps: unknown[]): OrchestrationPlan =>
  ({
    planId: 'plan-1',
    sessionId: 'session-test-1',
    originalScenario: 'launch campaign',
    steps,
    createdAt: AT,
    status: 'completed',
  }) as OrchestrationPlan;

const completedStep = (n: number, agentId: string) => ({
  stepNumber: n,
  agentId,
  actionType: 'travel_and_collaborate',
  description: `step ${n}`,
  output: `output of step ${n}`,
  status: 'completed',
  startedAt: AT,
  completedAt: DONE,
});

const completedTask = (agentId: string, result: string) => ({
  agentId,
  task: `task for ${agentId}`,
  result,
  status: 'completed',
  assignedAt: AT,
  completedAt: DONE,
});

const fallbackContribution = (agentId: string, contribution: string) => ({
  agentId,
  contribution,
  weight: 1,
});

describe('collectSessionContributions', () => {
  describe('orchestration path (plan steps)', () => {
    it('records each completed step', () => {
      const records = collectSessionContributions(
        baseSession(),
        plan([completedStep(1, 'campaign-coordinator-druid'), completedStep(2, 'campaign-coordinator-druid')])
      );
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        sessionId: 'session-test-1',
        stepNumber: 1,
        agentRole: 'coordinator',
        actionType: 'travel_and_collaborate',
        content: 'output of step 1',
      });
      expect(records[0]?.durationMs).toBe(DONE.getTime() - AT.getTime());
    });

    it('ignores steps that did not complete', () => {
      const records = collectSessionContributions(
        baseSession(),
        plan([
          completedStep(1, 'campaign-coordinator-druid'),
          { ...completedStep(2, 'campaign-coordinator-druid'), status: 'failed' },
        ])
      );
      expect(records).toHaveLength(1);
    });
  });

  describe('direct task assignment', () => {
    it('records completed tasks when there is no plan', () => {
      const records = collectSessionContributions(
        baseSession({
          participantTasks: [
            completedTask('positioner-elemental', 'positioning output'),
            completedTask('reddit-elemental', 'three reddit posts'),
          ],
        } as Partial<CoordinationSession>)
      );
      expect(records.map((r) => r.agentId)).toEqual(['positioner-elemental', 'reddit-elemental']);
      expect(records.every((r) => r.agentRole === 'participant')).toBe(true);
    });

    it('skips a task that completed with no result', () => {
      const records = collectSessionContributions(
        baseSession({
          participantTasks: [
            completedTask('positioner-elemental', 'positioning output'),
            { ...completedTask('reddit-elemental', ''), result: '' },
          ],
        } as Partial<CoordinationSession>)
      );
      expect(records).toHaveLength(1);
    });
  });

  describe('the fallback path — what was being dropped', () => {
    // executeSimpleCoordination writes only here. This is the case that
    // persisted nothing.
    const session = baseSession({
      finalResult: {
        summary: 's',
        participantContributions: [
          fallbackContribution('campaign-coordinator-druid', 'x'.repeat(7949)),
          fallbackContribution('facebook-elemental', 'x'.repeat(5391)),
          fallbackContribution('reddit-elemental', 'x'.repeat(5486)),
        ],
        coordinatorAnalysis: '',
        recommendations: [],
        publishedTo: [],
      },
    } as Partial<CoordinationSession>);

    it('records every contributor', () => {
      const records = collectSessionContributions(session);
      expect(records.map((r) => r.agentId)).toEqual([
        'campaign-coordinator-druid',
        'facebook-elemental',
        'reddit-elemental',
      ]);
    });

    it('preserves the content verbatim rather than truncating it', () => {
      // The synthesis is truncated to a token budget; the durable record must
      // not be. That distinction is the whole point of persisting these.
      const records = collectSessionContributions(session);
      expect(records[0]?.content).toHaveLength(7949);
      expect(records[1]?.content).toHaveLength(5391);
    });

    it('numbers steps from 1 and leaves unknown fields null', () => {
      // This shape carries no task description and no timing, so those are null
      // rather than invented.
      const records = collectSessionContributions(session);
      expect(records.map((r) => r.stepNumber)).toEqual([1, 2, 3]);
      expect(records[0]?.description).toBeNull();
      expect(records[0]?.durationMs).toBeNull();
      expect(records[0]?.actionType).toBeNull();
    });

    it('drops malformed entries instead of writing empty rows', () => {
      const records = collectSessionContributions(
        baseSession({
          finalResult: {
            summary: 's',
            participantContributions: [
              fallbackContribution('reddit-elemental', 'real output'),
              fallbackContribution('', 'no agent'),
              fallbackContribution('linkedin-elemental', ''),
            ],
            coordinatorAnalysis: '',
            recommendations: [],
            publishedTo: [],
          },
        } as Partial<CoordinationSession>)
      );
      expect(records.map((r) => r.agentId)).toEqual(['reddit-elemental']);
    });
  });

  describe('precedence', () => {
    it('prefers plan steps and does not double-count', () => {
      // The three collections describe the same work from different paths, so a
      // merge would record it twice.
      const records = collectSessionContributions(
        baseSession({
          participantTasks: [completedTask('reddit-elemental', 'task result')],
          finalResult: {
            summary: 's',
            participantContributions: [fallbackContribution('reddit-elemental', 'fallback result')],
            coordinatorAnalysis: '',
            recommendations: [],
            publishedTo: [],
          },
        } as Partial<CoordinationSession>),
        plan([completedStep(1, 'campaign-coordinator-druid')])
      );
      expect(records).toHaveLength(1);
      expect(records[0]?.content).toBe('output of step 1');
    });

    it('keeps the orchestration representation when the plan is supplied again', () => {
      // The session is persisted twice on the orchestration path: once with the
      // plan, then again after synthesis. generateOrchestrationResult copies the
      // completed steps into finalResult.participantContributions, so a
      // plan-less second collect returns the *same step keys* in a poorer shape
      // — agentRole 'participant', no actionType, no description — and
      // persistContributions upserts on (session_id, step_number,
      // sub_step_number), overwriting the richer rows. Passing the plan to the
      // republish is what prevents that; this pins the shape it must produce.
      const session = baseSession({
        finalResult: {
          summary: 's',
          participantContributions: [
            fallbackContribution('campaign-coordinator-druid', 'output of step 1'),
          ],
          coordinatorAnalysis: '',
          recommendations: [],
          publishedTo: [],
        },
      } as Partial<CoordinationSession>);
      const executed = plan([completedStep(1, 'campaign-coordinator-druid')]);

      const first = collectSessionContributions(session, executed);
      const republish = collectSessionContributions(session, executed);

      expect(republish).toEqual(first);
      expect(republish[0]).toMatchObject({
        agentRole: 'coordinator',
        actionType: 'travel_and_collaborate',
        description: 'step 1',
      });
    });

    it('degrades the representation if the plan is dropped — why it must be passed', () => {
      // The failure this guards against, stated explicitly: same step key, same
      // content, but the metadata the report renders is gone.
      const session = baseSession({
        finalResult: {
          summary: 's',
          participantContributions: [
            fallbackContribution('campaign-coordinator-druid', 'output of step 1'),
          ],
          coordinatorAnalysis: '',
          recommendations: [],
          publishedTo: [],
        },
      } as Partial<CoordinationSession>);

      const withPlan = collectSessionContributions(session, plan([completedStep(1, 'campaign-coordinator-druid')]));
      const withoutPlan = collectSessionContributions(session);

      expect(withoutPlan[0]?.stepNumber).toBe(withPlan[0]?.stepNumber); // collides
      expect(withoutPlan[0]?.agentRole).toBe('participant');
      expect(withoutPlan[0]?.actionType).toBeNull();
      expect(withoutPlan[0]?.description).toBeNull();
    });

    it('falls through a plan with no completed steps to the tasks', () => {
      const records = collectSessionContributions(
        baseSession({
          participantTasks: [completedTask('reddit-elemental', 'task result')],
        } as Partial<CoordinationSession>),
        plan([{ ...completedStep(1, 'x'), status: 'failed' }])
      );
      expect(records).toHaveLength(1);
      expect(records[0]?.content).toBe('task result');
    });
  });

  describe('degenerate input', () => {
    it('returns nothing for a session that genuinely produced nothing', () => {
      expect(collectSessionContributions(baseSession())).toEqual([]);
    });

    it('does not throw when finalResult is absent or empty', () => {
      // finalResult is optional on the interface but not assignable as
      // `undefined` through Partial, so omit it rather than set it.
      expect(collectSessionContributions(baseSession())).toEqual([]);
      expect(
        collectSessionContributions(
          baseSession({
            finalResult: {
              summary: '',
              participantContributions: [],
              coordinatorAnalysis: '',
              recommendations: [],
              publishedTo: [],
            },
          } as Partial<CoordinationSession>)
        )
      ).toEqual([]);
    });
  });

  describe('the invariant', () => {
    // The assertion that catches the next collection someone adds. Each case is
    // a session that demonstrably produced work; none may persist zero rows.
    const producedWork: Array<[string, CoordinationSession, OrchestrationPlan | undefined]> = [
      [
        'orchestration path',
        baseSession(),
        plan([completedStep(1, 'campaign-coordinator-druid')]),
      ],
      [
        'direct task assignment',
        baseSession({
          participantTasks: [completedTask('reddit-elemental', 'output')],
        } as Partial<CoordinationSession>),
        undefined,
      ],
      [
        'simple-coordination fallback',
        baseSession({
          finalResult: {
            summary: 's',
            participantContributions: [fallbackContribution('reddit-elemental', 'output')],
            coordinatorAnalysis: '',
            recommendations: [],
            publishedTo: [],
          },
        } as Partial<CoordinationSession>),
        undefined,
      ],
    ];

    it.each(producedWork)(
      'a completed session with contributions never persists zero rows (%s)',
      (_label, session, maybePlan) => {
        const records = collectSessionContributions(session, maybePlan);
        expect(records.length).toBeGreaterThan(0);
        expect(records.every((r) => r.content.length > 0)).toBe(true);
        expect(records.every((r) => r.agentId.length > 0)).toBe(true);
        expect(records.every((r) => r.sessionId === session.id)).toBe(true);
      }
    );
  });
});
