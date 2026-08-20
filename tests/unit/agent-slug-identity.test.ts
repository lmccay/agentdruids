/**
 * Agent Slug Identity Tests
 *
 * The slug id is the identity the runtime keys on (see migrations 016 and 018);
 * the agents.id UUID is a deployment-local surrogate that never surfaces above
 * the repository.
 *
 * These tests pin the slug derivation, which is load-bearing in a way that is
 * easy to miss: migration 018 backfilled `agents.slug_id` using the exact same
 * transformation. "Improving" this function — most temptingly by trimming
 * trailing separators — would stop resolving every already-backfilled agent
 * whose name does not round-trip. The awkward expectations below are therefore
 * deliberate, and a failure here means the migration and the code have diverged.
 */

import { slugifyAgentName, isValidUUID } from '../../src/utils/uuidUtils';

describe('Agent slug identity', () => {
  describe('slugifyAgentName', () => {
    it('leaves an already-slug name unchanged', () => {
      expect(slugifyAgentName('facebook-elemental')).toBe('facebook-elemental');
      expect(slugifyAgentName('campaign-coordinator-druid')).toBe('campaign-coordinator-druid');
    });

    it('lowercases and separates a display name', () => {
      // This is the live case: "System Coordinator" is stored with slug_id
      // 'system-coordinator' by migration 018's backfill.
      expect(slugifyAgentName('System Coordinator')).toBe('system-coordinator');
    });

    it('collapses runs of separators into a single dash', () => {
      expect(slugifyAgentName('Risk   Narrative')).toBe('risk-narrative');
      expect(slugifyAgentName('a  --  b')).toBe('a-b');
    });

    it('preserves digits', () => {
      expect(slugifyAgentName('Tier 2 Reviewer')).toBe('tier-2-reviewer');
    });

    it('does NOT trim trailing or leading separators', () => {
      // Intentional. Migration 018 backfilled the untrimmed form, so trimming
      // here would silently orphan any agent whose name ends in punctuation.
      expect(slugifyAgentName('Trailing!')).toBe('trailing-');
      expect(slugifyAgentName('!Leading')).toBe('-leading');
    });

    it('maps names that differ only in separator style onto the same slug', () => {
      // A genuine collision. It is not prevented here — it is caught by the
      // unique index on agents.slug_id, which is the correct place for it.
      const collisions = ['Foo Bar', 'foo-bar', 'foo_bar', 'foo.bar'];
      const slugs = new Set(collisions.map(slugifyAgentName));
      expect(slugs.size).toBe(1);
      expect([...slugs][0]).toBe('foo-bar');
    });

    it('yields an empty slug for a name with no alphanumerics', () => {
      // AgentService rejects this rather than persisting an empty identity.
      expect(slugifyAgentName('!!!')).toBe('-');
      expect(slugifyAgentName('')).toBe('');
    });
  });

  describe('isValidUUID', () => {
    it('recognises a surrogate key', () => {
      expect(isValidUUID('d7174e55-98ea-44ee-a6e2-e4eb86f8b264')).toBe(true);
    });

    it('does not mistake a slug for a UUID', () => {
      // This distinction is what lets the repository accept either form and
      // route it to the right column.
      expect(isValidUUID('facebook-elemental')).toBe(false);
      expect(isValidUUID('system-coordinator')).toBe(false);
    });
  });
});
