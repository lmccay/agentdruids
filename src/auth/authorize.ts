import { Request, Response, NextFunction } from 'express';
import { agentService } from '../services/SharedServices';
import { identityService } from '../services/IdentityService';

/**
 * Authorization gates (docs/identity-and-access-control.md). These consume the
 * principal that resolvePrincipal already attached and make the actual
 * allow/deny decisions.
 *
 * requireAuth          — any authenticated principal (human session or service token).
 * requireAdmin         — the control-plane gate: an admin human only.
 * requireAssumableAgent — the data-plane gate: a user may only drive a druid in
 *                         their assumable set (admin → any; non-druid agents →
 *                         admin only). The interim service token is trusted for
 *                         data-plane calls and bypasses this gate.
 *
 * The interim internal service token is control-plane-EXEMPT: it authenticates
 * data-plane service calls but is NOT admin and cannot perform control-plane
 * operations.
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

/**
 * Data-plane assume-gate: a user may drive a druid only if it is in their
 * assumable set. Admins may drive any agent; the interim service token is
 * trusted for data-plane calls. Non-druid agents may not be driven directly by
 * a non-admin (elementals are driven via coordination, not user-assumed).
 *
 * @param getAgentId extracts the target agent id from the request (param or body).
 */
export function requireAssumableAgent(getAgentId: (req: Request) => string | undefined) {
  return async function assumeGate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ error: 'Authentication required', message: 'Sign in to drive an agent' });
      return;
    }
    // Admins are unconstrained; the interim service token is trusted data-plane.
    if (principal.service || principal.roles.includes('admin')) {
      next();
      return;
    }

    const agentId = getAgentId(req);
    if (!agentId) {
      res.status(400).json({ error: 'Validation error', message: 'Target agent id is required' });
      return;
    }

    try {
      let agentType: string | undefined;
      try {
        const agent = await agentService.getAgent(agentId as Parameters<typeof agentService.getAgent>[0]);
        agentType = agent?.type;
      } catch {
        res.status(404).json({ error: 'Not found', message: 'Agent not found' });
        return;
      }

      if (agentType !== 'druid') {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins may directly drive non-druid agents; elementals are driven via coordination',
        });
        return;
      }

      const assumable = principal.userId
        ? await identityService.isDruidAssumable(principal.userId, agentId as Parameters<typeof identityService.isDruidAssumable>[1])
        : false;
      if (!assumable) {
        res.status(403).json({ error: 'Forbidden', message: 'You may not assume this druid' });
        return;
      }
      next();
    } catch (error) {
      // Never let an error in the gate wedge the request as an unhandled rejection.
      console.error('assume-gate error:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Authorization check failed' });
    }
  };
}
