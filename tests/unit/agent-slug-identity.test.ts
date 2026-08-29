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

import { slugifyName, isValidUUID } from '../../src/utils/uuidUtils';
import { resolveAgentSlugId } from '../../src/services/AgentService';

describe('Agent slug identity', () => {
  describe('slugifyName', () => {
    it('leaves an already-slug name unchanged', () => {
      expect(slugifyName('facebook-elemental')).toBe('facebook-elemental');
      expect(slugifyName('campaign-coordinator-druid')).toBe('campaign-coordinator-druid');
    });

    it('lowercases and separates a display name', () => {
      // This is the live case: "System Coordinator" is stored with slug_id
      // 'system-coordinator' by migration 018's backfill.
      expect(slugifyName('System Coordinator')).toBe('system-coordinator');
    });

    it('collapses runs of separators into a single dash', () => {
      expect(slugifyName('Risk   Narrative')).toBe('risk-narrative');
      expect(slugifyName('a  --  b')).toBe('a-b');
    });

    it('preserves digits', () => {
      expect(slugifyName('Tier 2 Reviewer')).toBe('tier-2-reviewer');
    });

    it('does NOT trim trailing or leading separators', () => {
      // Intentional. Migration 018 backfilled the untrimmed form, so trimming
      // here would silently orphan any agent whose name ends in punctuation.
      expect(slugifyName('Trailing!')).toBe('trailing-');
      expect(slugifyName('!Leading')).toBe('-leading');
    });

    it('maps names that differ only in separator style onto the same slug', () => {
      // A genuine collision. It is not prevented here — it is caught by the
      // unique index on agents.slug_id, which is the correct place for it.
      const collisions = ['Foo Bar', 'foo-bar', 'foo_bar', 'foo.bar'];
      const slugs = new Set(collisions.map(slugifyName));
      expect(slugs.size).toBe(1);
      expect([...slugs][0]).toBe('foo-bar');
    });

    it('yields no usable slug for a name with no alphanumerics', () => {
      // Not empty — punctuation collapses to a single separator, because the
      // derivation deliberately does not trim. Both results are unusable as an
      // identity, and AgentService rejects them rather than persisting one.
      expect(slugifyName('!!!')).toBe('-');
      expect(slugifyName('')).toBe('');
    });
  });

  describe('resolveAgentSlugId', () => {
    // The function createAgent calls, not a copy of it. An explicit request.id
    // used to be persisted verbatim, so a non-canonical id became identity —
    // and uq_agents_slug_id is case-sensitive, so 'Facebook-Elemental' and
    // 'facebook-elemental' would have been two distinct agents.

    it('derives from the name when no id is supplied', () => {
      expect(resolveAgentSlugId({ name: 'System Coordinator' })).toBe('system-coordinator');
    });

    it('prefers an explicitly supplied id over the name', () => {
      expect(resolveAgentSlugId({ id: 'risk-narrative', name: 'Something Else' }))
        .toBe('risk-narrative');
    });

    it('canonicalises an explicit id instead of taking it verbatim', () => {
      // The defect. Both spellings must land on one identity, not two.
      expect(resolveAgentSlugId({ id: 'Facebook-Elemental', name: 'x' }))
        .toBe('facebook-elemental');
      expect(resolveAgentSlugId({ id: 'Facebook Elemental', name: 'x' }))
        .toBe('facebook-elemental');
      expect(resolveAgentSlugId({ id: 'FACEBOOK_ELEMENTAL', name: 'x' }))
        .toBe('facebook-elemental');
    });

    it('leaves an already-canonical id untouched', () => {
      // Idempotence matters: creation upserts on slug_id, so re-creating an
      // existing agent under its own id must not shift its identity.
      for (const slug of ['facebook-elemental', 'campaign-coordinator-druid', 'twitter-x-elemental']) {
        expect(resolveAgentSlugId({ id: slug, name: 'ignored' })).toBe(slug);
      }
    });

    it('derives a slug for a caller still passing a UUID as the id', () => {
      // Honouring the old contract, not persisting the surrogate as identity.
      expect(resolveAgentSlugId({
        id: 'd7174e55-98ea-44ee-a6e2-e4eb86f8b264',
        name: 'Positioner Elemental',
      })).toBe('positioner-elemental');
    });

    it('refuses a name with no alphanumeric content', () => {
      // '-' passes the lowercase constraint but is not a usable identity, and
      // was previously accepted because only the empty string was checked.
      expect(() => resolveAgentSlugId({ name: '!!!' })).toThrow(/alphanumeric/);
      expect(() => resolveAgentSlugId({ name: '' })).toThrow(/alphanumeric/);
    });

    it('refuses a slug shaped like an internal identifier', () => {
      // resolveDbId routes a UUID-shaped id to the surrogate column, so this
      // agent could never be looked up by its own identity.
      expect(() => resolveAgentSlugId({ name: 'd7174e55-98ea-44ee-a6e2-e4eb86f8b264' }))
        .toThrow(/shape of an internal identifier/);
    });

    it('produces a slug that satisfies agents_slug_id_lowercase', () => {
      // Migration 024's CHECK is the backstop; this is the primary defence, and
      // the two must not disagree.
      const inputs = [
        { name: 'Tier 2 Reviewer' },
        { id: 'Mixed_Case Id', name: 'x' },
        { id: 'ALLCAPS', name: 'x' },
      ];
      for (const input of inputs) {
        const slug = resolveAgentSlugId(input);
        expect(slug).toBe(slug.toLowerCase());
      }
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
