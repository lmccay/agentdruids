import { getOidcClient } from './oidc';

/**
 * OIDC access-token validation for the resource-server surfaces (MCP ingress,
 * and bearer-authenticated REST). Validates a token by calling the IdP's
 * userinfo endpoint via the configured OIDC client — which reuses the Docker
 * back-channel rewrite (OIDC_INTERNAL_ISSUER) so the call is reachable from a
 * container. A token the IdP accepts at userinfo is, by definition, a live
 * token; the returned claims identify the principal.
 *
 * This module is intentionally DB-free so it can be reused by the MCP server
 * (which has no database) as well as the app. Resolving claims to a Druids
 * user/roles is the caller's job.
 *
 * A short in-memory cache avoids a userinfo round-trip on every request.
 */

export interface TokenClaims {
  sub: string;
  email: string | null;
  name: string | null;
  groups: string[] | null;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { claims: TokenClaims; expiresAt: number }>();

/** Validate an OIDC access token; returns its claims, or null if invalid. */
export async function validateAccessToken(token: string, now: number = Date.now()): Promise<TokenClaims | null> {
  if (!token) return null;

  const hit = cache.get(token);
  if (hit && hit.expiresAt > now) return hit.claims;

  try {
    const client = await getOidcClient();
    const info = await client.userinfo(token);
    const groups = Array.isArray((info as Record<string, unknown>)['groups'])
      ? ((info as Record<string, unknown>)['groups'] as string[])
      : null;
    const claims: TokenClaims = {
      sub: info.sub,
      email: (info.email as string | undefined) ?? null,
      name: (info.name as string | undefined) ?? null,
      groups,
    };
    cache.set(token, { claims, expiresAt: now + CACHE_TTL_MS });
    return claims;
  } catch {
    // Invalid/expired/unreachable — treat as unauthenticated.
    return null;
  }
}
