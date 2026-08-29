/**
 * Realm grant helpers.
 *
 * `realmAccess.accessibleRealms` is polymorphic: older rows hold bare realm id
 * strings, the Agent model types it as
 * `{ realmId, permissions, grantedAt, grantedBy }` objects, and migration 021
 * deliberately preserves both forms. The agent edit form only ever shows a
 * checkbox per realm, so it needs ids — but writing those ids straight back
 * discards every object entry's permissions and provenance.
 *
 * These live in their own module rather than inside the page component so the
 * logic is pure, importable, and testable without a React renderer.
 */

/** A realm grant as stored: either a bare realm id, or an object carrying metadata. */
export type RealmGrant = string | { realmId: string; [key: string]: unknown };

/** The realm id of a grant, whichever shape it is stored in. */
export const grantRealmId = (grant: RealmGrant): string =>
  typeof grant === 'string' ? grant : (grant?.realmId ?? '');

/** Realm ids of a grant list, for checkbox state. */
export const grantRealmIds = (grants: RealmGrant[] | undefined): string[] =>
  (grants ?? []).map(grantRealmId).filter(Boolean);

/**
 * Rebuild the grant list from checkbox state without losing metadata.
 *
 * A realm that was already granted keeps its original entry untouched, so
 * permissions, grantedAt and grantedBy survive an unrelated edit. A newly
 * checked realm is emitted as a bare id, because the form knows only that
 * access was granted — not with what permissions — and inventing a permission
 * set here would be a silent policy decision.
 *
 * Order follows the checkbox state, so the result is stable for a given
 * selection regardless of how the original list was ordered.
 */
export const reconcileRealmGrants = (
  original: RealmGrant[] | undefined,
  checked: string[]
): RealmGrant[] => {
  const byId = new Map<string, RealmGrant>();
  for (const grant of original ?? []) {
    const id = grantRealmId(grant);
    if (id) byId.set(id, grant);
  }
  return checked.map((id) => byId.get(id) ?? id);
};
