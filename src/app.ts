import express, { Express, Request, Response } from 'express';
import cors from 'cors';

// Import API routes
import agentsRouter from './api/agents';
import realmsRouter from './api/realms';
import knowledgeRouter from './api/knowledge';
import scenariosRouter from './api/scenarios';
import executionsRouter from './api/executions';
import leyLinesRouter from './api/leyLines';
import toolAccessRouter from './api/toolAccess';
import agentBindingsRouter from './api/agentBindings';
import coordinatorsRouter, { coordinationService } from './api/coordinators';
import systemRouter from './api/system';
import modelsRouter from './api/models';
import asyncResultsRouter from './api/async-results';
import contentRouter from './api/content';

// Import MCP server
import SimpleMCPServer from './mcp/SimpleMCPServer';

// Import middleware
import { requestLogger } from './middleware/requestLogger';
import { healthCheck } from './middleware/healthCheck';
import { errorHandler } from './middleware/errorHandler';

/**
 * Main Express application for the Druids multi-agent system
 */
export class DruidApp {
  public app: Express;
  private server: any;
  private mcpServer?: SimpleMCPServer;

  constructor() {
    this.app = express();
    this.configureServices();
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  /**
   * Configure service dependencies
   */
  private configureServices(): void {
    // Use shared service instances to avoid state duplication
    import('./services/SharedServices').then(({ agentService, realmService }) => {
      // Wire shared RealmService into shared AgentService
      agentService.setRealmService(realmService);
      console.log('🔗 Shared RealmService injected into shared AgentService');

      // Wire shared AgentService into coordination
      coordinationService.setAgentService(agentService);
      console.log('🔗 Shared AgentService wired to CoordinationService');

      // Wire shared RealmService into coordination
      coordinationService.setRealmService(realmService);
      console.log('🔗 Shared RealmService wired to CoordinationService');
    }).catch(error => {
      console.error('❌ Failed to wire shared service dependencies:', error);
    });
  }

  /**
   * Configure middleware stack
   */
  private configureMiddleware(): void {
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-requester-id', 'x-client-id']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger);

    // Health check
    this.app.use('/health', healthCheck);
  }

  /**
   * Configure API routes
   */
  private configureRoutes(): void {
    // Register all API routes under /api prefix
    // IMPORTANT: Mount specific routes before general ones to avoid conflicts
    this.app.use('/api', agentBindingsRouter); // Mount before agents router to handle /agents/:id/bindings
    this.app.use('/api', toolAccessRouter); // Mount at api level with full paths
    this.app.use('/api', leyLinesRouter); // Handles both /realms/{id}/ley-lines and /ley-lines routes
    
    this.app.use('/api/agents', agentsRouter);
    this.app.use('/api/coordinators', coordinatorsRouter); // New coordination endpoints
    this.app.use('/api/coordination', coordinatorsRouter); // Additional path for session endpoints
    this.app.use('/api/realms', realmsRouter);
    this.app.use('/api/knowledge', knowledgeRouter);
    this.app.use('/api/scenarios', scenariosRouter);
    this.app.use('/api/executions', executionsRouter);
    this.app.use('/api/system', systemRouter);
    this.app.use('/api/models', modelsRouter);
    this.app.use('/api/async-requests', asyncResultsRouter); // Async result management
    this.app.use('/api/async-results', asyncResultsRouter); // Async result retrieval
    this.app.use('/api/content', contentRouter); // Published content browsing

    // API documentation endpoint
    this.app.get('/api/v1', (_req: Request, res: Response) => {
      res.json({
        name: 'Druids Multi-Agent System API',
        version: '1.0.0',
        description: 'Sophisticated multi-agent system with federated architecture',
        endpoints: {
          agents: '/agents',
          coordinators: '/coordinators',
          coordination: '/coordination/sessions',
          realms: '/realms',
          knowledge: '/knowledge',
          scenarios: '/scenarios',
          executions: '/executions',
          tools: '/tools',
          agentBindings: '/agent-bindings'
        }
      });
    });

    // Root redirect
    this.app.get('/', (_req: Request, res: Response) => {
      res.redirect('/api/v1');
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Route not found',
        message: `The endpoint ${req.method} ${req.originalUrl} does not exist`
      });
    });
  }

  /**
   * Configure error handling
   */
  private configureErrorHandling(): void {
    this.app.use(errorHandler);
  }

  /**
   * Start the server
   */
  public async start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(port, () => {
          console.log(`🚀 Main API server running on port ${port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server gracefully
   */
  public async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 Main server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Start the MCP-compliant server for external clients
   */
  public async startMCPServer(port: number = 3003): Promise<void> {
    try {
      this.mcpServer = new SimpleMCPServer(port);
      await this.mcpServer.start();
      console.log(`🔗 MCP server running on port ${port}`);
    } catch (error) {
      console.error('Failed to start MCP server:', error);
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  public stopMCPServer(): void {
    if (this.mcpServer) {
      console.log('🛑 MCP server stopped');
      delete this.mcpServer;
    }
  }

  /**
   * Get the Express app instance
   */
  public getApp(): Express {
    return this.app;
  }
}
