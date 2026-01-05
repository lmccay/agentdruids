import { Router, Request, Response } from 'express';
import { RealmService } from '../services/RealmService';

const router = Router();
const realmService = new RealmService();

// GET /realms - List all realms
router.get('/', async (_req: Request, res: Response) => {
  try {
    const realms = await realmService.listRealms();
    res.json({
      data: realms.map((realm: any) => ({
        ...realm,
        agents: realm.agents || [],
        agentCount: realm.agentIds ? realm.agentIds.length : 0
      }))
    });
  } catch (error) {
    console.error('Error listing realms:', error);
    res.status(500).json({ error: 'Failed to list realms' });
  }
});

// GET /realms/:realmId - Get specific realm
router.get('/:realmId', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    if (!realmId) {
      return res.status(400).json({ error: 'Realm ID is required' });
    }
    
    const realm = await realmService.getRealm(realmId);
    
    if (!realm) {
      return res.status(404).json({ error: 'Realm not found' });
    }
    
    return res.json(realm);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get realm' });
  }
});

// POST /realms - Create new realm
router.post('/', async (req: Request, res: Response) => {
  try {
    const realm = await realmService.createRealm(req.body);
    res.status(201).json(realm);
  } catch (error) {
    console.error('Error creating realm:', error);
    res.status(400).json({ error: 'Failed to create realm' });
  }
});

// PUT /realms/:realmId - Update realm
router.put('/:realmId', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    const updates = req.body;
    
    if (!realmId) {
      return res.status(400).json({ error: 'Realm ID is required' });
    }
    
    const updatedRealm = await realmService.updateRealm(realmId, updates);
    
    // Transform response to match frontend expectations
    const response = {
      ...updatedRealm,
      agents: updatedRealm.agents || [],
      agentCount: updatedRealm.agentIds ? updatedRealm.agentIds.length : 0
    };
    
    return res.json(response);
  } catch (error) {
    console.error('Error updating realm:', error);
    return res.status(500).json({ error: 'Failed to update realm' });
  }
});

// DELETE /realms/:realmId - Delete realm
router.delete('/:realmId', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    
    if (!realmId) {
      return res.status(400).json({ error: 'Realm ID is required' });
    }
    
    await realmService.deleteRealm(realmId);
    
    return res.json({ message: 'Realm deleted', realmId });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Error deleting realm:', error);
    return res.status(500).json({ error: 'Failed to delete realm' });
  }
});

// GET /realms/:realmId/agents - List agents in a realm
router.get('/:realmId/agents', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    
    if (!realmId) {
      return res.status(400).json({ error: 'Realm ID is required' });
    }
    
    const realm = await realmService.getRealm(realmId);
    if (!realm) {
      return res.status(404).json({ error: 'Realm not found' });
    }
    
    return res.json({
      data: {
        realmId,
        agentIds: realm.agentIds || [],
        agentCount: (realm.agentIds || []).length
      }
    });
  } catch (error) {
    console.error('Error listing agents in realm:', error);
    return res.status(500).json({ error: 'Failed to list agents in realm' });
  }
});

// POST /realms/:realmId/agents - Add agent to realm
router.post('/:realmId/agents', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    const { agentId, permissions = ['read', 'execute'] } = req.body;
    
    if (!realmId || !agentId) {
      return res.status(400).json({ error: 'Realm ID and Agent ID are required' });
    }
    
    // Get the realm and agent to validate they exist
    const realm = await realmService.getRealm(realmId);
    if (!realm) {
      return res.status(404).json({ error: 'Realm not found' });
    }
    
    // Add agent to realm's agent list
    if (!realm.agentIds.includes(agentId)) {
      realm.agentIds.push(agentId);
      await realmService.updateRealm(realmId, { agentIds: realm.agentIds });
    }
    
    return res.json({ 
      message: 'Agent added to realm successfully',
      realmId,
      agentId,
      permissions
    });
  } catch (error) {
    console.error('Error adding agent to realm:', error);
    return res.status(500).json({ error: 'Failed to add agent to realm' });
  }
});

// DELETE /realms/:realmId/agents/:agentId - Remove agent from realm
router.delete('/:realmId/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const { realmId, agentId } = req.params;
    
    if (!realmId || !agentId) {
      return res.status(400).json({ error: 'Realm ID and Agent ID are required' });
    }
    
    // Get the realm and remove agent from its agent list
    const realm = await realmService.getRealm(realmId);
    if (!realm) {
      return res.status(404).json({ error: 'Realm not found' });
    }
    
    // Remove agent from realm's agent list
    const agentIndex = realm.agentIds.indexOf(agentId);
    if (agentIndex > -1) {
      realm.agentIds.splice(agentIndex, 1);
      await realmService.updateRealm(realmId, { agentIds: realm.agentIds });
    }
    
    return res.json({ 
      message: 'Agent removed from realm successfully',
      realmId,
      agentId
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove agent from realm' });
  }
});

/**
 * POST /realms/refresh
 * Refresh realm cache from database to get latest updates from concurrent users
 */
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    await realmService.refreshRealmCache();
    
    res.json({
      success: true,
      message: 'Realm cache refreshed successfully'
    });
  } catch (error) {
    console.error('Realm cache refresh failed:', error instanceof Error ? error.message : 'Unknown error');
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to refresh realm cache'
    });
  }
});

/**
 * GET /realms/:realmId/elementals
 * Get elementals (agents) in a specific realm
 */
router.get('/:realmId/elementals', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;

    if (!realmId) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Realm ID is required'
      });
    }

    // Import RealmTravelService dynamically to avoid circular dependencies
    const { RealmTravelService } = await import('../services/RealmTravelService');
    const { agentService } = await import('../services/SharedServices');
    const realmTravelService = new RealmTravelService(agentService, realmService);

    const elementals = await realmTravelService.getElementalsInRealm(realmId);
    
    return res.json({
      elementals,
      count: elementals.length
    });
  } catch (error) {
    console.error('❌ Get elementals in realm error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;