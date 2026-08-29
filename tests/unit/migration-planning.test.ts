/**
 * Migration Planning Tests
 *
 * The runner used to compute what to apply from `MAX(version)`, so a migration
 * whose version sat below the high-water mark was never applied and never
 * reported. Two branches adding 021 and 022 in parallel were enough: a database
 * that applied 022 first would never apply 021 and would call itself up to date.
 * That happened during review of #95 — 021 was rolled back for re-testing and
 * silently refused to re-apply.
 *
 * These tests pin the set-difference plan. The threshold cases are the point: a
 * test that only covers a contiguous prefix passes under either algorithm, since
 * both select the same files there.
 */

import { planPendingMigrations, MigrationDescriptor } from '../../src/services/MigrationService';

const m = (version: number, name = `migration_${version}`): MigrationDescriptor => ({
  version,
  name,
  filename: `${String(version).padStart(3, '0')}_${name}.sql`,
});

/** The live numbering: no 002, contiguous from 003. */
const AVAILABLE = [3, 18, 19, 20, 21, 22, 23].map((v) => m(v));

const versions = (list: MigrationDescriptor[]) => list.map((x) => x.version);

describe('Migration planning', () => {
  describe('the ordinary case', () => {
    it('applies everything against an empty database', () => {
      const plan = planPendingMigrations(AVAILABLE, []);
      expect(versions(plan.pending)).toEqual([3, 18, 19, 20, 21, 22, 23]);
      expect(plan.highestApplied).toBe(0);
      expect(plan.outOfOrder).toEqual([]);
    });

    it('applies nothing when every file is recorded', () => {
      const plan = planPendingMigrations(AVAILABLE, [3, 18, 19, 20, 21, 22, 23]);
      expect(plan.pending).toEqual([]);
      expect(plan.highestApplied).toBe(23);
    });

    it('applies the tail after a contiguous prefix', () => {
      // Identical under a high-water mark. Included so the two algorithms are
      // shown to agree where they should.
      const plan = planPendingMigrations(AVAILABLE, [3, 18, 19, 20]);
      expect(versions(plan.pending)).toEqual([21, 22, 23]);
      expect(plan.outOfOrder).toEqual([]);
    });
  });

  describe('the skipped-migration defect', () => {
    it('applies a migration sitting below the high-water mark', () => {
      // The #95/#97 collision: 022 landed first, so MAX(version) = 22 and 021
      // was considered behind it forever.
      const plan = planPendingMigrations(AVAILABLE, [3, 18, 19, 20, 22]);
      expect(versions(plan.pending)).toEqual([21, 23]);
      expect(plan.highestApplied).toBe(22);
    });

    it('reports it as out of order rather than skipping it in silence', () => {
      const plan = planPendingMigrations(AVAILABLE, [3, 18, 19, 20, 22]);
      expect(versions(plan.outOfOrder)).toEqual([21]);
    });

    it('recovers a whole missing run below the mark', () => {
      const plan = planPendingMigrations(AVAILABLE, [3, 23]);
      expect(versions(plan.pending)).toEqual([18, 19, 20, 21, 22]);
      expect(versions(plan.outOfOrder)).toEqual([18, 19, 20, 21, 22]);
    });

    it('does not flag the tail as out of order', () => {
      // Only versions genuinely below the mark indicate something went wrong.
      const plan = planPendingMigrations(AVAILABLE, [3, 18, 19, 20]);
      expect(versions(plan.pending)).toEqual([21, 22, 23]);
      expect(plan.outOfOrder).toEqual([]);
    });

    it('applies in ascending order regardless of input order', () => {
      // Migrations must run in sequence; a later one may depend on an earlier.
      const shuffled = [m(22), m(3), m(21), m(19)];
      const plan = planPendingMigrations(shuffled, [18, 20, 23]);
      expect(versions(plan.pending)).toEqual([3, 19, 21, 22]);
    });
  });

  describe('gaps that are not gaps', () => {
    it('does not invent a pending 002', () => {
      // There is no 002 file and never has been; numbering starts at 003. Since
      // only files on disk can be pending, it needs no special case — but a gap
      // check written against the numbering rather than the files would trip.
      const plan = planPendingMigrations(AVAILABLE, [3, 18, 19, 20, 21, 22, 23]);
      expect(plan.pending).toEqual([]);
      expect(plan.outOfOrder).toEqual([]);
      expect(versions(plan.pending)).not.toContain(2);
    });

    it('ignores recorded baseline versions that have no file', () => {
      // The live database records 0 and 1 from init.sql's baseline, with no
      // corresponding files. They must not become pending or raise a gap.
      const plan = planPendingMigrations(AVAILABLE, [0, 1, 3, 18, 19, 20, 21, 22, 23]);
      expect(plan.pending).toEqual([]);
      expect(plan.outOfOrder).toEqual([]);
    });

    it('tolerates a recorded version far above anything on disk', () => {
      // A rollback that dropped files but not rows. Nothing is applied, and the
      // absence of files below the mark is not reported as out of order.
      const plan = planPendingMigrations([m(3)], [3, 99]);
      expect(plan.pending).toEqual([]);
      expect(plan.highestApplied).toBe(99);
      expect(plan.outOfOrder).toEqual([]);
    });
  });

  describe('failed migrations', () => {
    it('retries a migration absent from the applied set', () => {
      // getAppliedVersions selects only success = true, so a failed 021 is
      // simply not in the set and comes back as pending.
      const plan = planPendingMigrations(AVAILABLE, [3, 18, 19, 20, 22, 23]);
      expect(versions(plan.pending)).toEqual([21]);
      expect(versions(plan.outOfOrder)).toEqual([21]);
    });
  });

  describe('degenerate input', () => {
    it('handles an empty file set without claiming work', () => {
      // getAvailableMigrations already refuses to return empty — that is the
      // packaging check from #92 — so this only pins that the planner itself
      // does not misbehave.
      const plan = planPendingMigrations([], [3, 18]);
      expect(plan.pending).toEqual([]);
      expect(plan.highestApplied).toBe(18);
    });

    it('de-duplicates repeated applied versions', () => {
      const plan = planPendingMigrations(AVAILABLE, [3, 3, 18, 18]);
      expect(versions(plan.pending)).toEqual([19, 20, 21, 22, 23]);
      expect(plan.highestApplied).toBe(18);
    });
  });
});
