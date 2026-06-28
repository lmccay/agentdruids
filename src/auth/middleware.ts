import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/User';

/**
 * Identity resolution for incoming requests. This slice RESOLVES a principal
 * onto the request; it does NOT reject — the control-plane and data-plane gates
 * (later slices) make the authorization decisions. Resolving-without-rejecting
 * keeps this change non-breaking: existing open access is unchanged until the
 * gates land.
 *
 * Sources, in order:
 *   1. Session cookie  → an authenticated human (console login).
 *   2. Internal service token (Bearer) → trusted service-to-service caller
 *      (interim, replaced by RFC 8693 token exchange in Phase 4).
 *   3. None → anonymous (principal undefined).
 *
 * Bearer OIDC access tokens (external MCP clients) are a separate slice.
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

export function resolvePrincipal(req: Request, _res: Response, next: NextFunction): void {
  // 1. Human session.
  if (req.session?.userId) {
    req.principal = {
      userId: req.session.userId,
      roles: req.session.roles ?? ['user'],
      service: false,
    };
    return next();
  }

  // 2. Interim internal service token.
  const auth = req.headers.authorization;
  const serviceToken = (process.env['INTERNAL_SERVICE_TOKEN'] || '').trim();
  if (serviceToken && auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token === serviceToken) {
      req.principal = { userId: null, roles: [], service: true };
      return next();
    }
  }

  // 3. Anonymous — principal left undefined; gates decide what that means.
  next();
}
