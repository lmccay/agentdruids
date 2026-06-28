import { Router, Request, Response } from 'express';
import { modelRegistryService } from '../services/ModelRegistryService';
import { requireAdmin } from '../auth/authorize';
import { ModelConfiguration } from '../models/ModelConfiguration';
import { LLMProvider } from '../models/Types';

const router = Router();

/**
 * GET /models
 * List all model configurations
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const models = modelRegistryService.getAllModels();
    res.json({ data: models });
  } catch (error) {
    console.error('Error getting models:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve models'
    });
  }
});

/**
 * GET /models/active
 * List only active model configurations
 */
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const models = modelRegistryService.getAvailableModels();
    res.json({ data: models });
  } catch (error) {
    console.error('Error getting active models:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve active models'
    });
  }
});

/**
 * GET /models/:id
 * Get a specific model configuration
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model ID is required'
      });
      return;
    }
    
    const model = modelRegistryService.getModel(id);
    
    if (!model) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model configuration with ID '${id}' not found`
      });
      return;
    }
    
    res.json({ data: model });
  } catch (error) {
    console.error('Error getting model:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve model'
    });
  }
});

/**
 * POST /models
 * Create a new model configuration
 */
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      id,
      name,
      description,
      provider,
      model,
      temperature,
      maxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
      systemPromptPrefix,
      tags,
      isDefault,
      isActive
    } = req.body;

    // Validate required fields
    if (!id || typeof id !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model ID is required and must be a string'
      });
      return;
    }

    if (!name || typeof name !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model name is required and must be a string'
      });
      return;
    }

    if (!description || typeof description !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model description is required and must be a string'
      });
      return;
    }

    if (!provider || !['ollama', 'openai', 'anthropic'].includes(provider)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Provider must be one of: ollama, openai, anthropic'
      });
      return;
    }

    if (!model || typeof model !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model name is required and must be a string'
      });
      return;
    }

    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Temperature must be a number between 0 and 2'
      });
      return;
    }

    if (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 100000) {
      res.status(400).json({
        error: 'Validation error',
        message: 'maxTokens must be a number between 1 and 100000'
      });
      return;
    }

    // Check if model ID already exists
    const existingModel = modelRegistryService.getModel(id);
    if (existingModel) {
      res.status(409).json({
        error: 'Conflict',
        message: `Model with ID '${id}' already exists`
      });
      return;
    }

    const newModel: ModelConfiguration = {
      id,
      name,
      description,
      provider: provider as LLMProvider,
      model,
      temperature,
      maxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
      systemPromptPrefix,
      tags: Array.isArray(tags) ? tags : [],
      isDefault: Boolean(isDefault),
      isActive: isActive !== false // Default to true if not specified
    };

    await modelRegistryService.addModel(newModel);

    res.status(201).json({ data: newModel });
  } catch (error) {
    console.error('Error creating model:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create model'
    });
  }
});

/**
 * PUT /models/:id
 * Update an existing model configuration
 */
router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model ID is required'
      });
      return;
    }
    
    const updates = req.body;

    // Check if model exists
    const existingModel = modelRegistryService.getModel(id);
    if (!existingModel) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model configuration with ID '${id}' not found`
      });
      return;
    }

    // Validate updates
    if (updates.temperature !== undefined) {
      if (typeof updates.temperature !== 'number' || updates.temperature < 0 || updates.temperature > 2) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Temperature must be a number between 0 and 2'
        });
        return;
      }
    }

    if (updates.maxTokens !== undefined) {
      if (typeof updates.maxTokens !== 'number' || updates.maxTokens < 1 || updates.maxTokens > 100000) {
        res.status(400).json({
          error: 'Validation error',
          message: 'maxTokens must be a number between 1 and 100000'
        });
        return;
      }
    }

    if (updates.provider !== undefined && !['ollama', 'openai', 'anthropic'].includes(updates.provider)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Provider must be one of: ollama, openai, anthropic'
      });
      return;
    }

    const success = await modelRegistryService.updateModel(id, updates);
    if (!success) {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update model'
      });
      return;
    }

    const updatedModel = modelRegistryService.getModel(id);
    res.json({ data: updatedModel });
  } catch (error) {
    console.error('Error updating model:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update model'
    });
  }
});

/**
 * DELETE /models/:id
 * Delete a model configuration
 */
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model ID is required'
      });
      return;
    }

    // Check if model exists
    const existingModel = modelRegistryService.getModel(id);
    if (!existingModel) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model configuration with ID '${id}' not found`
      });
      return;
    }

    // Prevent deletion of default model
    if (existingModel.isDefault) {
      res.status(400).json({
        error: 'Cannot delete default model',
        message: 'Cannot delete the default model configuration'
      });
      return;
    }

    const success = await modelRegistryService.removeModel(id);
    if (!success) {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete model'
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete model'
    });
  }
});

/**
 * PATCH /models/:id/active
 * Toggle model active status
 */
router.patch('/:id/active', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (!id || typeof id !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Model ID is required'
      });
      return;
    }

    if (typeof active !== 'boolean') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Active status must be a boolean value'
      });
      return;
    }

    // Check if model exists
    const existingModel = modelRegistryService.getModel(id);
    if (!existingModel) {
      res.status(404).json({
        error: 'Model not found',
        message: `Model configuration with ID '${id}' not found`
      });
      return;
    }

    const success = await modelRegistryService.setModelActive(id, active);
    if (!success) {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update model status'
      });
      return;
    }

    const updatedModel = modelRegistryService.getModel(id);
    res.json({ data: updatedModel });
  } catch (error) {
    console.error('Error updating model status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update model status'
    });
  }
});

export default router;