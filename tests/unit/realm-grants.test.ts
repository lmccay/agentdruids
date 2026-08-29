/**
 * Realm Grant Helper Tests
 *
 * `realmAccess.accessibleRealms` is polymorphic: bare realm-id strings in rows
 * written to date, `{ realmId, permissions, grantedAt, grantedBy }` objects in
 * the typed model, and migration 021 deliberately preserves both.
 *
 * That handling was reimplemented inline at seven call sites, and three others
 * got it wrong in two directions — `.includes()` and a jsonb `?` test miss
 * object entries, while reading `entry.realmId` unconditionally misses strings.
 * These tests pin the single helper they now all share.
 */

import { grantRealmId, grantRealmIds, grantsIncludeRealm } from '../../src/utils/realmGrants';

const objectGrant = {
  realmId: 'ets',
  permissions: ['read', 'write'],
  grantedAt: '2026-01-01T00:00:00Z',
  grantedBy: 'operator',
};

describe('Realm grant helpers', () => {
  describe('grantRealmId', () => {
    it('reads a bare id string', () => {
      expect(grantRealmId('launch-visibility')).toBe('launch-visibility');
    });

    it('reads an object grant', () => {
      expect(grantRealmId(objectGrant)).toBe('ets');
    });

    it('returns empty for a malformed entry rather than throwing', () => {
      // Callers filter on the empty string; a throw here would take down an
      // agent listing because one row has an odd grant.
      expect(grantRealmId(null)).toBe('');
      expect(grantRealmId(undefined)).toBe('');
      expect(grantRealmId({} as any)).toBe('');
      expect(grantRealmId({ realmId: 42 } as any)).toBe('');
    });
  });

  describe('grantRealmIds', () => {
    it('handles a mixed list, which is what the database actually contains', () => {
      expect(grantRealmIds([objectGrant, 'launch-visibility'])).toEqual(['ets', 'launch-visibility']);
    });

    it('skips malformed entries instead of emitting empties', () => {
      expect(grantRealmIds(['ets', null as any, {} as any, 'open-source-realm']))
        .toEqual(['ets', 'open-source-realm']);
    });

    it('de-duplicates across shapes', () => {
      // The same realm granted twice, once per shape, is one realm.
      expect(grantRealmIds([objectGrant, 'ets'])).toEqual(['ets']);
    });

    it('tolerates null and undefined lists', () => {
      expect(grantRealmIds(null)).toEqual([]);
      expect(grantRealmIds(undefined)).toEqual([]);
    });
  });

  describe('grantsIncludeRealm', () => {
    it('matches an object grant — the case `.includes()` missed', () => {
      expect(grantsIncludeRealm([objectGrant], 'ets')).toBe(true);
      expect([objectGrant].includes('ets' as any)).toBe(false); // the old behaviour
    });

    it('matches a bare id string', () => {
      expect(grantsIncludeRealm(['ets'], 'ets')).toBe(true);
    });

    it('does not match a realm that is absent', () => {
      expect(grantsIncludeRealm([objectGrant, 'launch-visibility'], 'open-source-realm')).toBe(false);
    });

    it('never matches on an empty realm id', () => {
      // grantRealmId returns '' for malformed entries, so an empty query must
      // not collide with them.
      expect(grantsIncludeRealm([{} as any], '')).toBe(false);
      expect(grantsIncludeRealm(['ets'], '')).toBe(false);
    });

    it('is exact, not prefix or substring', () => {
      expect(grantsIncludeRealm(['ets-staging'], 'ets')).toBe(false);
    });
  });
});
