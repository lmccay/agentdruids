import { Router, Request, Response } from 'express';
// import { CoordinationService } from '../services/CoordinationService';
import { AgentId } from '../models/Types';
import ServiceContainer from '../services/ServiceContainer';

const router = Router();
const serviceContainer = ServiceContainer.getInstance();
const coordinationService = serviceContainer.getCoordinationService();

/**
 * POST /coordinators - Return the built-in coordinator (deprecated - coordinators are no longer created dynamically)
 */
router.post('/', async (_req: Request, res: Response) => {
  try {
    // Instead of creating new coordinators, return the built-in one
    const coordinator = coordinationService.getBuiltInCoordinator();
    
    const coordinatorResponse = {
      id: coordinator.id,
      name: coordinator.name,
      description: coordinator.description,
      status: coordinator.status,
      maxConcurrentScenarios: coordinator.capabilities.maxConcurrentScenarios,
      supportedScenarioTypes: coordinator.capabilities.supportedScenarioTypes,
      coordinationStyle: coordinator.capabilities.coordinationStyle,
      decisionMaking: coordinator.capabilities.decisionMaking,
      createdAt: coordinator.createdAt.toISOString(),
      updatedAt: coordinator.createdAt.toISOString()
    };

    res.status(201).json(coordinatorResponse);
  } catch (error) {
    console.error('Error getting built-in coordinator:', error);
    res.status(500).json({
      error: 'Failed to get coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators - List all coordinators (includes built-in)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Get the built-in coordinator from CoordinationService
    const builtInCoordinator = coordinationService.getBuiltInCoordinator();
    
    // Transform to match the expected API format
    const coordinatorResponse = {
      id: builtInCoordinator.id,
      name: builtInCoordinator.name,
      description: builtInCoordinator.description,
      status: builtInCoordinator.status,
      maxConcurrentScenarios: builtInCoordinator.capabilities.maxConcurrentScenarios,
      supportedScenarioTypes: builtInCoordinator.capabilities.supportedScenarioTypes,
      coordinationStyle: builtInCoordinator.capabilities.coordinationStyle,
      decisionMaking: builtInCoordinator.capabilities.decisionMaking,
      createdAt: builtInCoordinator.createdAt.toISOString(),
      updatedAt: builtInCoordinator.createdAt.toISOString()
    };
    
    // Return array with just the built-in coordinator
    res.json([coordinatorResponse]);
  } catch (error) {
    console.error('Error listing coordinators:', error);
    res.status(500).json({
      error: 'Failed to list coordinators',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators/test - Simple test route
 */
router.get('/test', async (_req: Request, res: Response) => {
  res.json({ message: 'Test route working' });
});

/**
 * GET /coordinators/sessions - List coordination sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    console.log('🔍 Listing sessions with status filter:', status);
    
    const sessions = coordinationService.listSessions(status as string);
    console.log('🔍 Found sessions:', sessions.length);
    
    res.status(200).json(sessions);
  } catch (error) {
    console.error('Error listing coordination sessions:', error);
    res.status(500).json({
      error: 'Failed to list coordination sessions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators/sessions/{sessionId} - Get coordination session status
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params['sessionId'];
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }
    
    const session = await coordinationService.getCoordinationSession(sessionId);
    
    if (!session) {
      res.status(404).json({
        error: `Coordination session ${sessionId} not found`
      });
      return;
    }

    res.status(200).json(session);
  } catch (error) {
    console.error('Error getting coordination session:', error);
    res.status(500).json({
      error: 'Failed to get coordination session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators/{coordinatorId} - Get coordinator by ID
 */
router.get('/:coordinatorId', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const coordinator = await coordinationService.getCoordinator(coordinatorId);
    
    if (!coordinator) {
      res.status(404).json({
        error: `Coordinator ${coordinatorId} not found`
      });
      return;
    }

    res.status(200).json(coordinator);
  } catch (error) {
    console.error('Error getting coordinator:', error);
    res.status(500).json({
      error: 'Failed to get coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /coordinators/{coordinatorId} - Update coordinator
 */
router.put('/:coordinatorId', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const updateData = req.body;

    if (!coordinatorId) {
      res.status(400).json({
        error: 'Coordinator ID is required'
      });
      return;
    }

    const updatedCoordinator = coordinationService.updateCoordinator(coordinatorId, updateData);
    if (!updatedCoordinator) {
      res.status(404).json({
        error: `Coordinator ${coordinatorId} not found`
      });
      return;
    }

    res.status(200).json(updatedCoordinator);
  } catch (error) {
    console.error('Error updating coordinator:', error);
    res.status(500).json({
      error: 'Failed to update coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /coordinators/{coordinatorId} - Delete coordinator
 */
router.delete('/:coordinatorId', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;

    if (!coordinatorId) {
      res.status(400).json({
        error: 'Coordinator ID is required'
      });
      return;
    }

    const deleted = coordinationService.deleteCoordinator(coordinatorId);
    if (!deleted) {
      res.status(404).json({
        error: `Coordinator ${coordinatorId} not found`
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting coordinator:', error);
    
    // Check if it's a business logic error (coordinator busy)
    if (error instanceof Error && error.message.includes('currently busy')) {
      res.status(409).json({
        error: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/{coordinatorId}/coordinate - Start coordination
 */
router.post('/:coordinatorId/coordinate', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const {
      scenarioPrompt,
      participantIds,
      timeoutMinutes,
      coordinationStyle,
      publishTo
    } = req.body;

    // Basic validation
    if (!scenarioPrompt || !participantIds || !Array.isArray(participantIds)) {
      res.status(400).json({
        error: 'Missing required fields: scenarioPrompt, participantIds (array)'
      });
      return;
    }

    const coordinationRequest = {
      coordinatorId,
      scenarioPrompt,
      participantIds,
      timeoutMinutes: timeoutMinutes || 30,
      coordinationStyle,
      publishTo
    } as any; // Cast to avoid type conflict

    const sessionId = await coordinationService.startCoordination(coordinationRequest);
    
    res.status(202).json({
      sessionId,
      status: 'started',
      message: 'Coordination session initiated successfully'
    });
  } catch (error) {
    console.error('Error starting coordination:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: error.message
        });
        return;
      }
      if (error.message.includes('not active')) {
        res.status(409).json({
          error: error.message
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Failed to start coordination',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/{coordinatorId}/orchestrate - Start orchestrated coordination
 */
router.post('/:coordinatorId/orchestrate', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const {
      scenarioPrompt,
      participantIds,
      timeoutMinutes,
      coordinationStyle,
      publishTo
    } = req.body;

    // Basic validation
    if (!scenarioPrompt || !participantIds || !Array.isArray(participantIds)) {
      res.status(400).json({
        error: 'Missing required fields: scenarioPrompt, participantIds (array)'
      });
      return;
    }

    const coordinationRequest = {
      coordinatorId,
      scenarioPrompt,
      participantIds,
      timeoutMinutes: timeoutMinutes || 30,
      coordinationStyle,
      publishTo
    } as any; // Cast to avoid type conflict

    const sessionId = await coordinationService.startOrchestatedCoordination(coordinationRequest);
    
    res.status(202).json({
      sessionId,
      status: 'orchestration_started',
      message: 'Orchestrated coordination session initiated successfully'
    });
  } catch (error) {
    console.error('Error starting orchestrated coordination:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: error.message
        });
        return;
      }
      if (error.message.includes('not active')) {
        res.status(409).json({
          error: error.message
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Failed to start orchestrated coordination',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/coordinate - Start coordination with smart coordinator defaulting
 * This endpoint automatically uses built-in-coordinator if none specified, making it
 * perfect for natural language interfaces that shouldn't require explicit coordinator selection
 */
router.post('/coordinate', async (req: Request, res: Response) => {
  try {
    const {
      coordinatorId,
      scenarioPrompt,
      participantIds,
      timeoutMinutes,
      coordinationStyle,
      publishTo,
      metadata
    } = req.body;

    // Basic validation
    if (!scenarioPrompt || !participantIds || !Array.isArray(participantIds)) {
      res.status(400).json({
        error: 'Missing required fields: scenarioPrompt, participantIds (array)'
      });
      return;
    }

    // Default to built-in coordinator if none specified - perfect for natural language interfaces
    const effectiveCoordinatorId = coordinatorId || 'built-in-coordinator';

    const coordinationRequest = {
      coordinatorId: effectiveCoordinatorId,
      scenarioPrompt,
      participantIds,
      timeoutMinutes: timeoutMinutes || 30,
      coordinationStyle,
      publishTo,
      metadata
    } as any;

    const sessionId = await coordinationService.startCoordination(coordinationRequest);

    res.status(202).json({
      sessionId,
      status: 'started',
      message: 'Coordination session initiated successfully',
      coordinatorId: effectiveCoordinatorId
    });
  } catch (error) {
    console.error('Error starting coordination:', error);
    
    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: error.message
        });
        return;
      }
      
      if (error.message.includes('not active')) {
        res.status(409).json({
          error: error.message
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Failed to start coordination',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Export coordination service for dependency injection
export { coordinationService };
export default router;