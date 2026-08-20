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
 * Derive an agent's stable slug id from a display name.
 *
 * This derivation is load-bearing and must not be "improved": migration 018
 * backfilled `agents.slug_id` with the exact same transformation, so changing it
 * (for example by trimming trailing separators) would stop resolving existing
 * agents. It is only ever applied when minting a slug for a *new* agent, or as a
 * defensive fallback for a row that predates the column.
 */
export function slugifyAgentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
