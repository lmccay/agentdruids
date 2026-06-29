import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/User';
import { validateAccessToken } from './accessTokenValidator';
import { identityService } from '../services/IdentityService';

/**
 * Identity resolution for incoming requests. This RESOLVES a principal onto the
 * request; it does NOT reject — the control-plane and data-plane gates make the
 * authorization decisions. Resolving-without-rejecting keeps it non-breaking.
 *
 * Sources, in order:
 *   1. Session cookie  → an authenticated human (console login).
 *   2. Internal service token (Bearer) → trusted service-to-service caller
 *      (interim, replaced by RFC 8693 token exchange in Phase 4).
 *   3. OIDC bearer access token → an authenticated user (e.g. an MCP client).
 *      Validated against the IdP; claims resolved/upserted to a Druids user.
 *   4. None → anonymous (principal undefined).
 */

export interface RequestPrincipal {
  /** Resolved user id for a human session; null for a service principal. */
  userId: string | null;
  roles: UserRole[];
  /** True when authenticated via the interim internal service token. */
  service: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: RequestPrincipal;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    roles?: UserRole[];
    // Transient OIDC handshake state, set before redirect, cleared at callback.
    oidc?: { state: string; nonce: string; codeVerifier: string };
  }
}

// Cache token → resolved principal so a bearer request doesn't re-validate and
// re-upsert on every call (TTL bounded; the validator has its own userinfo cache).
const BEARER_PRINCIPAL_TTL_MS = 60_000;
const bearerPrincipalCache = new Map<string, { principal: RequestPrincipal; expiresAt: number }>();

/** Validate an OIDC bearer access token and resolve it to a Druids principal. */
async function resolveBearerPrincipal(token: string, now: number = Date.now()): Promise<RequestPrincipal | null> {
  const hit = bearerPrincipalCache.get(token);
  if (hit && hit.expiresAt > now) return hit.principal;

  const claims = await validateAccessToken(token, now);
  if (!claims) return null;

  // Same identity resolution as a browser login: upsert the user, sync roles
  // (incl. env-admin) and groups. The issuer is the configured public issuer.
  const user = await identityService.upsertOnLogin({
    issuer: (process.env['OIDC_ISSUER'] || '').trim(),
    subject: claims.sub,
    email: claims.email,
    name: claims.name,
    groups: claims.groups,
  });
  const principal: RequestPrincipal = { userId: user.id, roles: user.roles, service: false };
  bearerPrincipalCache.set(token, { principal, expiresAt: now + BEARER_PRINCIPAL_TTL_MS });
  return principal;
}

export async function resolvePrincipal(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Human session.
    if (req.session?.userId) {
      req.principal = {
        userId: req.session.userId,
        roles: req.session.roles ?? ['user'],
        service: false,
      };
      return next();
    }

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length).trim();

      // 2. Interim internal service token (exact match).
      const serviceToken = (process.env['INTERNAL_SERVICE_TOKEN'] || '').trim();
      if (serviceToken && token === serviceToken) {
        req.principal = { userId: null, roles: [], service: true };
        return next();
      }

      // 3. OIDC bearer access token → authenticated user.
      const principal = await resolveBearerPrincipal(token);
      if (principal) {
        req.principal = principal;
        return next();
      }
    }

    // 4. Anonymous — principal left undefined; gates decide what that means.
    next();
  } catch (error) {
    // Never let identity resolution wedge a request; fall through as anonymous.
    console.error('resolvePrincipal error:', error);
    next();
  }
}
