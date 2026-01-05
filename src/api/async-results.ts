import { Router, Request, Response } from 'express';
import { AsyncResultManager } from '../services/AsyncResultManager';

const router = Router();

// Initialize the AsyncResultManager
const asyncResultManager = new AsyncResultManager();

/**
 * POST /async-requests
 * Create a new async request
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { agent_id, message, conversation_context } = req.body;

    if (!agent_id || !message) {
      res.status(400).json({
        error: 'Validation error',
        message: 'agent_id and message are required'
      });
      return;
    }

    const asyncRequest = {
      agentId: agent_id,
      message: message,
      conversationContext: conversation_context,
      clientInfo: {
        sessionId: 'mcp-server',
        userAgent: 'MCP Server'
      }
    };

    const result = await asyncResultManager.createAsyncRequest(asyncRequest);
    res.json(result);
  } catch (error) {
    console.error('Error creating async request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create async request'
    });
  }
});

/**
 * GET /async-results/:requestId
 * Get an async result by request ID
 */
router.get('/:requestId', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;

    if (!requestId) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Request ID is required'
      });
      return;
    }

    const result = await asyncResultManager.getResult(requestId);
    
    if (!result) {
      res.status(404).json({
        error: 'Not found',
        message: `Async result with ID '${requestId}' not found`
      });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting async result:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get async result'
    });
  }
});

/**
 * GET /async-results/agent/:agentId
 * Get all async results for an agent
 */
router.get('/agent/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required'
      });
      return;
    }

    const results = await asyncResultManager.getResultsByAgent(agentId);
    res.json({
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Error getting async results by agent:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get async results'
    });
  }
});

/**
 * GET /async-results
 * List all async results
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // AsyncResultManager doesn't have getAllResults, so return empty for now
    res.json({
      results: [],
      count: 0,
      message: 'List all results not implemented - use agent-specific endpoints'
    });
  } catch (error) {
    console.error('Error listing async results:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to list async results'
    });
  }
});

/**
 * PUT /async-results/:requestId/status
 * Update async result status
 */
router.put('/:requestId/status', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    if (!requestId || !status) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Request ID and status are required'
      });
      return;
    }

    await asyncResultManager.updateResultStatus(requestId, status);
    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    console.error('Error updating async result status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update status'
    });
  }
});

/**
 * PUT /async-results/:requestId/complete
 * Complete an async request with result data
 */
router.put('/:requestId/complete', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const resultData = req.body;

    if (!requestId) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Request ID is required'
      });
      return;
    }

    await asyncResultManager.completeAsyncRequest(requestId, resultData);
    res.json({ success: true, message: 'Request completed' });
  } catch (error) {
    console.error('Error completing async request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to complete request'
    });
  }
});

/**
 * PUT /async-results/:requestId/fail
 * Fail an async request with error message
 */
router.put('/:requestId/fail', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { error: errorMessage } = req.body;

    if (!requestId || !errorMessage) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Request ID and error message are required'
      });
      return;
    }

    await asyncResultManager.failAsyncRequest(requestId, errorMessage);
    res.json({ success: true, message: 'Request failed' });
  } catch (error) {
    console.error('Error failing async request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fail request'
    });
  }
});

export default router;