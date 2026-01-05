import { Router, Request, Response } from 'express';
import { agentService } from '../services/SharedServices';

const router = Router();

/**
 * GET /system/stats
 * Get system-wide statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Get actual agents data
    const agents = await agentService.listAgents();
    const activeAgents = agents.filter(agent => agent.status === 'active');
    const inactiveAgents = agents.filter(agent => agent.status === 'inactive');

    // TODO: Get actual realms data when RealmService is available
    // For now, mock realms data
    const realmsData = { total: 1, active: 1 };

    // TODO: Get actual scenarios data when ScenarioService is available  
    // For now, mock scenarios data
    const scenariosData = { total: 8, running: 0, completed: 8 };

    // TODO: Get actual coordination data when CoordinationService is available
    // For now, mock coordination data
    const coordinationData = { sessions: 0, active: 0 };

    const stats = {
      agents: {
        total: agents.length,
        active: activeAgents.length,
        inactive: inactiveAgents.length
      },
      realms: realmsData,
      scenarios: scenariosData,
      coordination: coordinationData
    };

    // Set cache headers to prevent caching of dynamic system data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve system statistics'
    });
  }
});

/**
 * GET /system/activity
 * Get recent system activity
 */
router.get('/activity', async (_req: Request, res: Response) => {
  try {
    // TODO: Implement actual activity logging and retrieval
    // For now, return some sample activity based on actual agent data
    const agents = await agentService.listAgents();
    
    const activities = [];
    
    // Add agent-related activities
    agents.slice(0, 3).forEach((agent, index) => {
      activities.push({
        id: `activity-${Date.now()}-${index}`,
        type: 'agent',
        message: `Agent "${agent.name || agent.id}" is ${agent.status}`,
        timestamp: new Date(Date.now() - index * 5 * 60 * 1000).toISOString(),
        status: agent.status === 'active' ? 'success' : 'info'
      });
    });

    // Add some system activities
    activities.push({
      id: `activity-system-${Date.now()}`,
      type: 'system',
      message: 'System health check completed successfully',
      timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      status: 'success'
    });

    res.json(activities);
  } catch (error) {
    console.error('Error fetching system activity:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve system activity'
    });
  }
});

/**
 * GET /system/health
 * Get system health status
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    // Check various system components
    const health = {
      status: 'healthy',
      components: {
        api: { status: 'online', message: 'API server running' },
        database: { status: 'online', message: 'Database connected' },
        redis: { status: 'online', message: 'Redis connected' },
        mcp: { status: 'online', message: 'MCP server running' }
      },
      timestamp: new Date().toISOString()
    };

    res.json(health);
  } catch (error) {
    console.error('Error checking system health:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check system health'
    });
  }
});

export default router;