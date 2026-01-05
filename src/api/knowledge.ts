import { Router, Request, Response } from 'express';
import { KnowledgeService } from '../services/KnowledgeService';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const knowledgeService = new KnowledgeService();
    const namespaces = await knowledgeService.listKnowledgeNamespaces();
    res.json(namespaces);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list knowledge namespaces' });
  }
});

/**
 * GET /knowledge/namespaces - List all knowledge namespaces  
 */
router.get('/namespaces', async (_req: Request, res: Response) => {
  try {
    const knowledgeService = new KnowledgeService();
    const namespaces = await knowledgeService.listKnowledgeNamespaces();
    res.json(namespaces);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list knowledge namespaces' });
  }
});

/**
 * GET /knowledge/namespaces/{namespacePath} - Get knowledge entries from a namespace
 */
router.get('/namespaces/*', async (req: Request, res: Response) => {
  try {
    const namespacePath = req.params[0]; // Capture the rest of the path after namespaces/
    
    // For now, return empty array - this would connect to KnowledgeService
    console.log(`Getting knowledge from namespace: ${namespacePath}`);
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve knowledge' });
  }
});

/**
 * POST /knowledge/namespaces/{namespacePath} - Create/update knowledge entry
 */
router.post('/namespaces/*', async (req: Request, res: Response) => {
  try {
    const namespacePath = req.params[0];
    const { key, value, metadata } = req.body;
    
    // Validate required fields
    if (!key || !value) {
      return res.status(400).json({
        error: 'Validation error',
        details: 'key and value are required'
      });
    }
    
    // For now, return a mock response
    const entry = {
      id: `entry-${Date.now()}`,
      key,
      value,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        createdBy: 'system',
        lastModified: new Date().toISOString(),
        version: '1.0.0'
      },
      namespace: namespacePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return res.status(201).json(entry);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create knowledge entry' });
  }
});

export default router;
