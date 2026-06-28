import { Router, Request, Response } from 'express';
import { identityService } from '../services/IdentityService';
import { requireAdmin } from '../auth/authorize';
import { UserId, AgentId } from '../models/Types';

/**
 * User & assumable-druid administration (docs/identity-and-access-control.md).
 * Managing who may assume which druid is a control-plane action, so every
 * route here is admin-only. These grants feed the data-plane assume-gate.
 */
const router = Router();

// List users with their roles (so an admin can find user ids to grant against).
router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await identityService.listUsers();
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        status: u.status,
        roles: u.roles,
        lastLoginAt: u.lastLoginAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to list users' });
  }
});

// List the druids a user may assume.
router.get('/:userId/assumable-druids', requireAdmin, async (req: Request, res: Response) => {
  try {
    const grants = await identityService.listAssumableDruids(req.params['userId'] as UserId);
    res.json({ assumableDruids: grants });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to list assumable druids' });
  }
});

// Grant a user the ability to assume a druid.
router.post('/:userId/assumable-druids', requireAdmin, async (req: Request, res: Response) => {
  try {
    const druidId = req.body?.druidId as AgentId | undefined;
    if (!druidId || typeof druidId !== 'string') {
      res.status(400).json({ error: 'Validation error', message: 'druidId is required' });
      return;
    }
    const grantedBy = req.principal?.userId as UserId | undefined;
    await identityService.grantAssumableDruid(req.params['userId'] as UserId, druidId, grantedBy ?? undefined);
    res.status(201).json({ success: true, userId: req.params['userId'], druidId });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to grant assumable druid' });
  }
});

// Revoke a user's ability to assume a druid.
router.delete('/:userId/assumable-druids/:druidId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const removed = await identityService.revokeAssumableDruid(
      req.params['userId'] as UserId,
      req.params['druidId'] as AgentId
    );
    if (!removed) {
      res.status(404).json({ error: 'Not found', message: 'No such grant' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to revoke assumable druid' });
  }
});

export default router;
