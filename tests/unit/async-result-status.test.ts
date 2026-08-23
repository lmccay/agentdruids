/**
 * Async Result Status Contract Tests
 *
 * Async result persistence never worked: among other mismatches, the code's
 * status values and the database CHECK constraint had never agreed. The table
 * permitted 'running' and 'cancelled', which the application never produces,
 * and rejected 'processing' and 'expired', which it does — so an in-flight or
 * aged-out request could not be written even once the column names were right.
 *
 * Because every write failure was swallowed, nothing surfaced the disagreement.
 * These tests pin the set so a status added in code without a matching
 * migration fails here rather than silently in production.
 */

import {
  ASYNC_RESULT_STATUSES,
  TERMINAL_ASYNC_RESULT_STATUSES,
  AsyncResultStatus,
} from '../../src/services/AsyncResultManager';

describe('Async result status contract', () => {
  it('matches the async_results_status_check constraint in migration 022', () => {
    // Changing this list requires a migration updating the CHECK to match.
    expect([...ASYNC_RESULT_STATUSES]).toEqual([
      'pending',
      'processing',
      'completed',
      'failed',
      'expired',
    ]);
  });

  it('excludes the values the old constraint allowed', () => {
    // 'running' and 'cancelled' were permitted by the database and produced by
    // nothing. They are gone; if either reappears, the two have drifted again.
    expect(ASYNC_RESULT_STATUSES).not.toContain('running' as AsyncResultStatus);
    expect(ASYNC_RESULT_STATUSES).not.toContain('cancelled' as AsyncResultStatus);
  });

  it('treats exactly the finished states as terminal', () => {
    // Terminal statuses stamp completed_at; in-flight ones must not.
    expect([...TERMINAL_ASYNC_RESULT_STATUSES].sort()).toEqual(['completed', 'expired', 'failed']);
  });

  it('has every terminal status within the overall set', () => {
    for (const status of TERMINAL_ASYNC_RESULT_STATUSES) {
      expect(ASYNC_RESULT_STATUSES).toContain(status);
    }
  });

  it('leaves the in-flight statuses non-terminal', () => {
    expect(TERMINAL_ASYNC_RESULT_STATUSES).not.toContain('pending');
    expect(TERMINAL_ASYNC_RESULT_STATUSES).not.toContain('processing');
  });
});
