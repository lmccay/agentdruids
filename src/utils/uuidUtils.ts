import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Derive a stable slug id from a display name.
 *
 * This derivation is load-bearing and must not be "improved": migrations 018
 * and 020 backfilled `agents.slug_id` and `realms.slug_id` with the exact same
 * transformation, so changing it (for example by trimming trailing separators)
 * would stop resolving existing rows. It is applied when minting a slug for a
 * new agent or realm, and to normalise an explicitly supplied one.
 */
export function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Reserved realm slug meaning "not present in any realm". Enforced in the
 * database by realms_slug_id_not_sentinel, and compared case-insensitively
 * because the runtime lowercases before testing it.
 */
export const REALM_SENTINEL_SLUG = 'default';

export function isRealmSentinel(value: string | null | undefined): boolean {
  return !!value && value.toLowerCase() === REALM_SENTINEL_SLUG;
}
