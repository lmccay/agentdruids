/**
 * Realm Slug Identity Tests
 *
 * Realms are identified by slug (migrations 020 and 021); the realms.id UUID is
 * a deployment-local surrogate that no longer appears above the repository.
 *
 * These cover the pure logic. The database-dependent behaviour — slug/UUID
 * resolution, the reference migration, and realm-scoped retrieval — is verified
 * against a live database rather than here.
 */

import { slugifyName, isRealmSentinel, REALM_SENTINEL_SLUG } from '../../src/utils/uuidUtils';
import { resolveSearchScope } from '../../src/services/searchScope';

describe('Realm slug identity', () => {
  describe('slug derivation', () => {
    it('produces the slugs migration 020 backfilled', () => {
      // These three are the live realms; the migration derived their slugs with
      // this exact transformation, so a change here orphans them.
      expect(slugifyName('ETS')).toBe('ets');
      expect(slugifyName('Open Source Realm')).toBe('open-source-realm');
      expect(slugifyName('launch-visibility')).toBe('launch-visibility');
    });

    it('is shared with agents rather than reimplemented', () => {
      // Same function backs migrations 018 and 020. Divergence between the two
      // would be invisible until a lookup silently missed.
      expect(slugifyName('System Coordinator')).toBe('system-coordinator');
    });
  });

  describe('reserved sentinel', () => {
    it('recognises the sentinel case-insensitively, matching the runtime', () => {
      // AgentService lowercases before testing, so a realm slugged 'Default'
      // would be read as "no realm" and silently lose its own scope.
      expect(isRealmSentinel('default')).toBe(true);
      expect(isRealmSentinel('Default')).toBe(true);
      expect(isRealmSentinel('DEFAULT')).toBe(true);
    });

    it('does not flag ordinary realms', () => {
      expect(isRealmSentinel('ets')).toBe(false);
      expect(isRealmSentinel('default-realm')).toBe(false);
      expect(isRealmSentinel(null)).toBe(false);
      expect(isRealmSentinel(undefined)).toBe(false);
    });

    it('cannot be produced accidentally by naming a realm "Default"', () => {
      // The derivation lowercases, so the name collides with the sentinel and
      // is rejected by RealmService before the database constraint is reached.
      expect(isRealmSentinel(slugifyName('Default'))).toBe(true);
      expect(slugifyName('Default')).toBe(REALM_SENTINEL_SLUG);
    });
  });

  describe('search scope with slug realms', () => {
    it('keeps slug realms that are within the agent grants', () => {
      const scope = resolveSearchScope({
        accessibleRealms: ['ets', 'launch-visibility'],
        sessionResearchRealms: ['ets'],
        currentRealm: null,
      });
      expect(scope).toContain('ets');
      expect(scope).not.toContain('launch-visibility');
    });

    it('never treats the sentinel as a realm to search', () => {
      const scope = resolveSearchScope({
        accessibleRealms: ['ets'],
        currentRealm: 'default',
      });
      expect(scope).not.toContain('default');
    });

    it('still clamps requested realms to the grants', () => {
      const scope = resolveSearchScope({
        accessibleRealms: ['ets'],
        explicitRealms: ['ets', 'open-source-realm'],
      });
      expect(scope).toEqual(['ets']);
    });
  });
});
