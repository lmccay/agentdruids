import { Router, Request, Response } from 'express';
import { AgentService } from '../services/AgentService';
import { AgentId } from '../models/Types';

const router = Router();
const agentService = new AgentService();

// Mock storage for bindings (in real implementation, use database)
const bindingStorage = new Set<string>();

router.get('/agents/:agentId/bindings', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    
    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required'
      });
      return;
    }

    // Validate agent ID format  
    if (agentId.includes('/') || agentId.includes('\\') || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Invalid agent ID format'
      });
      return;
    }

    // Check if agent exists
    try {
      await agentService.getAgent(agentId as AgentId);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
        return;
      }
      throw error; // Re-throw other errors
    }

    res.json([]);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve agent bindings'
    });
  }
});

router.post('/agents/:agentId/bindings', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { targetAgentId, type, configuration } = req.body;
    
    // Validate agent ID format
    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        message: 'Agent ID is required'
      });
      return;
    }

    if (agentId.includes('/') || agentId.includes('\\') || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      res.status(400).json({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        message: 'Invalid agent ID format'
      });
      return;
    }

    // Validate required fields
    if (!targetAgentId) {
      res.status(400).json({
        error: 'Validation error: targetAgentId is required',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    if (!type) {
      res.status(400).json({
        error: 'Validation error: type is required',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    // Validate binding type
    const validTypes = ['collaboration', 'dependency', 'communication'];
    if (!validTypes.includes(type)) {
      res.status(400).json({
        error: `Validation error: type must be one of ${validTypes.join(', ')}`,
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    // Check if source agent exists
    try {
      await agentService.getAgent(agentId as AgentId);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
        return;
      }
      throw error;
    }

    // Check if target agent exists
    try {
      await agentService.getAgent(targetAgentId as AgentId);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'target agent not found',
          code: 'TARGET_AGENT_NOT_FOUND'
        });
        return;
      }
      throw error;
    }

    // Check for existing binding (simulate duplicate check)
    // For now, we'll create a simple check based on agent pairs and configuration
    const configHash = JSON.stringify(configuration || {});
    const bindingId = `${agentId}-${targetAgentId}-${type}-${configHash}`;
    
    if (bindingStorage.has(bindingId)) {
      res.status(409).json({
        error: 'Binding already exists',
        code: 'BINDING_ALREADY_EXISTS'
      });
      return;
    }

    // Create the binding
    bindingStorage.add(bindingId);
    
    const newBinding = {
      id: `binding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      targetAgentId,
      type,
      status: 'active',
      createdAt: new Date().toISOString(),
      configuration: configuration || {}
    };

    res.status(201).json(newBinding);
  } catch (error) {
    console.error('Agent binding creation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create agent binding'
    });
  }
});

// Special handler for agent IDs with slashes (invalid format)
router.get('/agents/:agentId/*/bindings', async (_req: Request, res: Response) => {
  res.status(400).json({
    error: 'Validation error',
    message: 'Invalid agent ID format'
  });
});

export default router;
