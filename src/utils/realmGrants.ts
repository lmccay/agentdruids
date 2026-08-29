/**
 * Realm grant helpers.
 *
 * `realmAccess.accessibleRealms` is polymorphic. `RealmAccess` types it as
 * `{ realmId, permissions, grantedAt, grantedBy }` objects, the rows written to
 * date hold bare realm-id strings, and migration 021 deliberately preserves
 * both. Every reader therefore has to handle either shape.
 *
 * These exist because that handling was previously reimplemented inline at
 * seven call sites — and three others got it wrong in two different directions:
 * `.includes()` on the array misses object entries, a jsonb `?` test can only
 * match top-level strings, and reading `entry.realmId` unconditionally misses
 * string entries. One helper, used everywhere, is the point.
 *
 * The frontend has its own copy at `frontend/src/utils/realmGrants.ts`; the two
 * bundles are built separately and share no module graph.
 */

/** A realm grant as stored: either a bare realm id, or an object carrying metadata. */
export type RealmGrant = string | { realmId?: string; [key: string]: unknown };

/**
 * The realm id of a grant, whichever shape it is stored in.
 * Returns '' for a malformed entry so callers can filter rather than crash.
 */
export function grantRealmId(grant: RealmGrant | null | undefined): string {
  if (!grant) return '';
  if (typeof grant === 'string') return grant;
  return typeof grant.realmId === 'string' ? grant.realmId : '';
}

/** Realm ids of a grant list, skipping malformed entries and duplicates. */
export function grantRealmIds(grants: readonly RealmGrant[] | null | undefined): string[] {
  const out: string[] = [];
  for (const grant of grants ?? []) {
    const id = grantRealmId(grant);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Whether a grant list includes a realm, matching either stored shape. */
export function grantsIncludeRealm(
  grants: readonly RealmGrant[] | null | undefined,
  realmId: string
): boolean {
  if (!realmId) return false;
  return (grants ?? []).some((grant) => grantRealmId(grant) === realmId);
}
