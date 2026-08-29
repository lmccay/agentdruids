/**
 * "No Realm" Representation Tests
 *
 * Three different values used to mean "this agent is in no realm":
 * 'default-realm' in the REST payloads, 'default-realm' again in coordination,
 * and 'default' in AgentService — plus simply omitting the key, which is what
 * resolveCurrentRealm treats as absence.
 *
 * Under UUID identity 'default-realm' was unambiguously not a realm id, because
 * no realm could ever be called that. Under slug identity (migrations 020, 021)
 * it is a well-formed slug, and exactly the slug a realm named "Default Realm"
 * would receive — so a consumer could no longer tell "no realm" from "the
 * Default Realm". Only 'default' is reserved, by realms_slug_id_not_sentinel.
 *
 * Settled representation: omit the field where it is optional, use the reserved
 * sentinel where a value is structurally required, and never emit a string that
 * could collide with a real slug.
 */

import { realmIdField } from '../../src/utils/realmPayload';
import { REALM_SENTINEL_SLUG, isRealmSentinel } from '../../src/utils/uuidUtils';
import { resolveSearchScope } from '../../src/services/searchScope';

describe('"No realm" representation', () => {
  describe('realmIdField', () => {
    it('emits a real realm id', () => {
      expect(realmIdField('ets')).toEqual({ realmId: 'ets' });
    });

    it('omits the field entirely when there is no realm', () => {
      // Not a placeholder. `if (agent.realmId)` then does the right thing, where
      // a placeholder would send a consumer looking up a realm that cannot exist.
      expect(realmIdField(undefined)).toEqual({});
      expect(realmIdField(null)).toEqual({});
      expect(realmIdField('')).toEqual({});
      expect('realmId' in realmIdField(undefined)).toBe(false);
    });

    it('treats the reserved sentinel as absence', () => {
      // The sentinel is how required fields spell "no realm"; it must not be
      // forwarded to a consumer as though it were a realm to look up.
      expect(realmIdField(REALM_SENTINEL_SLUG)).toEqual({});
      expect(realmIdField('Default')).toEqual({});
    });

    it('never emits the old slug-shaped placeholder', () => {
      // The whole point: 'default-realm' is a legitimate slug now, so it cannot
      // double as "no realm". If a realm really is slugged 'default-realm', it
      // is passed through as itself.
      for (const input of [undefined, null, '', REALM_SENTINEL_SLUG]) {
        expect(realmIdField(input)).not.toHaveProperty('realmId', 'default-realm');
      }
      expect(realmIdField('default-realm')).toEqual({ realmId: 'default-realm' });
    });

    it('spreads into a payload without leaving an undefined key', () => {
      // Conditional spread rather than `realmId: undefined`, which would
      // serialise the key away in JSON but still be present on the object.
      const withRealm = { id: 'facebook-elemental', ...realmIdField('ets') };
      const without = { id: 'campaign-coordinator-druid', ...realmIdField(undefined) };
      expect(Object.keys(withRealm)).toEqual(['id', 'realmId']);
      expect(Object.keys(without)).toEqual(['id']);
    });
  });

  describe('the sentinel is the only reserved value', () => {
    it('recognises the sentinel but not the old placeholder', () => {
      expect(isRealmSentinel(REALM_SENTINEL_SLUG)).toBe(true);
      expect(isRealmSentinel('default-realm')).toBe(false);
    });

    it('keeps a realm legitimately slugged "default-realm" searchable', () => {
      // The consequence of the old placeholder: a real realm with this slug was
      // indistinguishable from absence. It must scope like any other realm.
      const scope = resolveSearchScope({
        accessibleRealms: ['default-realm', 'ets'],
        currentRealm: 'default-realm',
      });
      expect(scope).toContain('default-realm');
    });

    it('still excludes the sentinel from search scope', () => {
      const scope = resolveSearchScope({
        accessibleRealms: ['ets'],
        currentRealm: REALM_SENTINEL_SLUG,
      });
      expect(scope).not.toContain(REALM_SENTINEL_SLUG);
    });

    it('excludes a differently-cased sentinel too', () => {
      // searchScope now tests through isRealmSentinel rather than a literal
      // lowercase comparison of its own.
      const scope = resolveSearchScope({
        accessibleRealms: ['ets'],
        currentRealm: 'Default',
      });
      expect(scope).not.toContain('Default');
      expect(scope).not.toContain(REALM_SENTINEL_SLUG);
    });
  });
});
