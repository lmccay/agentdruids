import { Router, Request, Response } from 'express';
import { identityService } from '../services/IdentityService';
import { requireAdmin } from '../auth/authorize';
import { UserId, AgentId } from '../models/Types';

/**
 * Group & group-assumable-druid administration (docs/identity-and-access-control.md).
 * Group membership is sourced from OIDC claims at login; the grants below are
 * managed in Druids and are admin-only. A user's effective assumable set is
 * their direct grants UNION the grants of every group they belong to.
 */
const router = Router();

// List known groups (discovery cache, populated from login claims / grants).
router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const groups = await identityService.listGroups();
    res.json({ groups });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to list groups' });
  }
});

// List the druids a group may assume.
router.get('/:groupKey/assumable-druids', requireAdmin, async (req: Request, res: Response) => {
  try {
    const grants = await identityService.listGroupAssumableDruids(req.params['groupKey'] as string);
    res.json({ assumableDruids: grants });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to list group assumable druids' });
  }
});

// Grant a group the ability to assume a druid.
router.post('/:groupKey/assumable-druids', requireAdmin, async (req: Request, res: Response) => {
  try {
    const druidId = req.body?.druidId as AgentId | undefined;
    if (!druidId || typeof druidId !== 'string') {
      res.status(400).json({ error: 'Validation error', message: 'druidId is required' });
      return;
    }
    const grantedBy = req.principal?.userId as UserId | undefined;
    await identityService.grantGroupAssumableDruid(req.params['groupKey'] as string, druidId, grantedBy ?? undefined);
    res.status(201).json({ success: true, groupKey: req.params['groupKey'], druidId });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to grant group assumable druid' });
  }
});

// Revoke a group's ability to assume a druid.
router.delete('/:groupKey/assumable-druids/:druidId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const removed = await identityService.revokeGroupAssumableDruid(
      req.params['groupKey'] as string,
      req.params['druidId'] as AgentId
    );
    if (!removed) {
      res.status(404).json({ error: 'Not found', message: 'No such grant' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: 'Failed to revoke group assumable druid' });
  }
});

export default router;
