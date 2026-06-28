import { Request, Response, NextFunction } from 'express';

/**
 * Authorization gates (docs/identity-and-access-control.md). These consume the
 * principal that resolvePrincipal already attached and make the actual
 * allow/deny decisions.
 *
 * requireAuth  — any authenticated principal (human session or service token).
 * requireAdmin — the control-plane gate: an admin human only. The interim
 *                internal service token is control-plane-EXEMPT: it
 *                authenticates data-plane service calls but is NOT admin and
 *                cannot perform control-plane operations.
 */

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    res.status(401).json({ error: 'Authentication required', message: 'Sign in to perform this action' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    res.status(401).json({ error: 'Authentication required', message: 'Sign in to perform this action' });
    return;
  }
  if (principal.service || !principal.roles.includes('admin')) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin role required for control-plane operations',
    });
    return;
  }
  next();
}
