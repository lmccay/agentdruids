import { v4 as uuidv4 } from 'uuid';
import { RepositoryManager } from './RepositoryManager';

/**
 * Async result status types
 */
export type AsyncResultStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

/**
 * Async result metadata
 */
export interface AsyncResultMetadata {
  requestId: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  actualDuration?: number;
  clientInfo?: {
    sessionId?: string;
    userAgent?: string;
  };
}

/**
 * Async result content
 */
export interface AsyncResult {
  requestId: string;
  agentId: string;
  status: AsyncResultStatus;
  result?: any;
  error?: string;
  metadata: AsyncResultMetadata;
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
}

/**
 * Request for async agent execution
 */
export interface AsyncAgentRequest {
  agentId: string;
  message: string;
  conversationContext?: string;
  estimatedDuration?: number;
  clientInfo?: {
    sessionId?: string;
    userAgent?: string;
  };
}

/**
 * Response for async agent request initiation
 */
export interface AsyncAgentResponse {
  requestId: string;
  status: 'accepted';
  estimatedDuration: number;
  checkInterval: number; // Recommended polling interval in ms
  expiresAt: string;
}

/**
 * AsyncResultManager - Manages asynchronous agent task results with persistent storage
 */
export class AsyncResultManager {
  private readonly NAMESPACE_PREFIX = 'worldtree://public/async_results';
  private readonly DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly DEFAULT_ESTIMATED_DURATION = 30000; // 30 seconds
  private readonly CHECK_INTERVAL = 2000; // 2 seconds
  
  // In-memory storage for fast access (with database backup)
  private results: Map<string, AsyncResult> = new Map();
  private processingTasks: Map<string, NodeJS.Timeout> = new Map();
  private repositoryManager: RepositoryManager | null = null;

  constructor() {
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      this.repositoryManager = await RepositoryManager.initialize();
      console.log('✅ AsyncResultManager: Database connection established');
      await this.loadResultsFromDatabase();
    } catch (error) {
      console.warn('⚠️ AsyncResultManager: Database connection failed, using memory-only mode:', error instanceof Error ? error.message : 'Unknown error');
      this.repositoryManager = null;
    }
  }

  private async loadResultsFromDatabase(): Promise<void> {
    if (!this.repositoryManager) return;

    try {
      // Load recent async results from database into memory
      const dbResults = await this.repositoryManager.query(`
        SELECT request_id, agent_id, status, result_data, error_message, progress, metadata, created_at, updated_at
        FROM async_results 
        WHERE expires_at > NOW() OR expires_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1000
      `);

      for (const row of dbResults.rows) {
        const result: AsyncResult = {
          requestId: row.request_id,
          agentId: row.agent_id,
          status: row.status,
          result: row.result_data,
          error: row.error_message,
          progress: row.progress,
          metadata: row.metadata
        };
        this.results.set(result.requestId, result);
      }

      console.log(`✅ Loaded ${dbResults.rows.length} async results from database`);
    } catch (error) {
      console.warn('⚠️ Failed to load async results from database:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Generate a unique request ID with agent prefix
   */
  generateRequestId(agentId: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4().slice(0, 8);
    return `req_${agentId}_${timestamp}_${uuid}`;
  }

  /**
   * Create an async request and return immediate response
   */
  async createAsyncRequest(request: AsyncAgentRequest): Promise<AsyncAgentResponse> {
    const requestId = this.generateRequestId(request.agentId);
    const estimatedDuration = request.estimatedDuration || this.DEFAULT_ESTIMATED_DURATION;
    const expiresAt = new Date(Date.now() + this.DEFAULT_EXPIRY_MS).toISOString();
    
    const asyncResult: AsyncResult = {
      requestId,
      agentId: request.agentId,
      status: 'pending',
      metadata: {
        requestId,
        agentId: request.agentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        estimatedDuration,
        ...(request.clientInfo && { clientInfo: request.clientInfo })
      }
    };

    // Store initial result
    await this.storeResult(asyncResult);

    return {
      requestId,
      status: 'accepted',
      estimatedDuration,
      checkInterval: this.CHECK_INTERVAL,
      expiresAt
    };
  }

  /**
   * Update result status and optionally add progress info
   */
  async updateResultStatus(
    requestId: string, 
    status: AsyncResultStatus, 
    progress?: { current: number; total: number; message?: string }
  ): Promise<void> {
    const result = await this.getResult(requestId);
    if (result) {
      result.status = status;
      result.metadata.updatedAt = new Date().toISOString();
      if (progress) {
        result.progress = progress;
      }
      await this.storeResult(result);
    }
  }

  /**
   * Complete an async request with result
   */
  async completeAsyncRequest(requestId: string, agentResponse: any): Promise<void> {
    const result = await this.getResult(requestId);
    if (result) {
      result.status = 'completed';
      result.result = agentResponse;
      result.metadata.updatedAt = new Date().toISOString();
      result.metadata.actualDuration = Date.now() - new Date(result.metadata.createdAt).getTime();
      
      // Clear progress since we're done
      delete result.progress;
      
      await this.storeResult(result);
      
      // Clean up processing task if exists
      const task = this.processingTasks.get(requestId);
      if (task) {
        clearTimeout(task);
        this.processingTasks.delete(requestId);
      }
    }
  }

  /**
   * Fail an async request with error
   */
  async failAsyncRequest(requestId: string, error: string): Promise<void> {
    const result = await this.getResult(requestId);
    if (result) {
      result.status = 'failed';
      result.error = error;
      result.metadata.updatedAt = new Date().toISOString();
      result.metadata.actualDuration = Date.now() - new Date(result.metadata.createdAt).getTime();
      
      await this.storeResult(result);
      
      // Clean up processing task if exists
      const task = this.processingTasks.get(requestId);
      if (task) {
        clearTimeout(task);
        this.processingTasks.delete(requestId);
      }
    }
  }

  /**
   * Get async result by request ID
   */
  async getResult(requestId: string): Promise<AsyncResult | null> {
    // In production, this would query WorldTree namespace
    // For demo, using in-memory storage
    return this.results.get(requestId) || null;
  }

  /**
   * Get results by agent ID
   */
  async getResultsByAgent(agentId: string, limit?: number): Promise<AsyncResult[]> {
    const agentResults = Array.from(this.results.values())
      .filter(result => result.agentId === agentId)
      .sort((a, b) => new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime());
    
    return limit ? agentResults.slice(0, limit) : agentResults;
  }

  /**
   * Check if request is still valid (not expired)
   */
  isRequestValid(result: AsyncResult): boolean {
    const createdAt = new Date(result.metadata.createdAt).getTime();
    const now = Date.now();
    return (now - createdAt) < this.DEFAULT_EXPIRY_MS;
  }

  /**
   * Clean up expired results
   */
  async cleanupExpiredResults(): Promise<number> {
    let cleanedCount = 0;
    
    const requestIds = Array.from(this.results.keys());
    for (const requestId of requestIds) {
      const result = this.results.get(requestId);
      if (result && !this.isRequestValid(result)) {
        this.results.delete(requestId);
        cleanedCount++;
        
        // Clean up any associated processing tasks
        const task = this.processingTasks.get(requestId);
        if (task) {
          clearTimeout(task);
          this.processingTasks.delete(requestId);
        }
      }
    }
    
    return cleanedCount;
  }

  /**
   * Store result (with database persistence)
   */
  private async storeResult(result: AsyncResult): Promise<void> {
    // Store in memory for fast access
    this.results.set(result.requestId, { ...result });
    
    // Persist to database if available
    if (this.repositoryManager) {
      try {
        const expiresAt = new Date(Date.now() + this.DEFAULT_EXPIRY_MS);
        
        await this.repositoryManager.query(`
          INSERT INTO async_results (
            request_id, agent_id, status, result_data, error_message, 
            progress, metadata, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (request_id) 
          DO UPDATE SET 
            status = EXCLUDED.status,
            result_data = EXCLUDED.result_data,
            error_message = EXCLUDED.error_message,
            progress = EXCLUDED.progress,
            metadata = EXCLUDED.metadata,
            updated_at = CURRENT_TIMESTAMP
        `, [
          result.requestId,
          result.agentId,
          result.status,
          result.result ? JSON.stringify(result.result) : null,
          result.error || null,
          result.progress ? JSON.stringify(result.progress) : null,
          JSON.stringify(result.metadata),
          expiresAt
        ]);
        
        console.log(`💾 Persisted async result to database: ${result.requestId} (${result.status})`);
      } catch (error) {
        console.warn(`⚠️ Failed to persist async result to database:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    console.log(`📝 Stored async result: ${result.requestId} (${result.status})`);
  }

  /**
   * Get namespace path for a request
   */
  getNamespacePath(agentId: string, requestId: string, file?: string): string {
    const basePath = `${this.NAMESPACE_PREFIX}/${agentId}/${requestId}`;
    return file ? `${basePath}/${file}` : basePath;
  }

  /**
   * Get statistics about async results
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<AsyncResultStatus, number>;
    byAgent: Record<string, number>;
    averageDuration: number;
  }> {
    const results = Array.from(this.results.values());
    const total = results.length;
    
    const byStatus: Record<AsyncResultStatus, number> = {
      'pending': 0,
      'processing': 0,
      'completed': 0,
      'failed': 0,
      'expired': 0
    };
    
    const byAgent: Record<string, number> = {};
    let totalDuration = 0;
    let completedCount = 0;
    
    for (const result of results) {
      byStatus[result.status]++;
      byAgent[result.agentId] = (byAgent[result.agentId] || 0) + 1;
      
      if (result.metadata.actualDuration) {
        totalDuration += result.metadata.actualDuration;
        completedCount++;
      }
    }
    
    return {
      total,
      byStatus,
      byAgent,
      averageDuration: completedCount > 0 ? totalDuration / completedCount : 0
    };
  }
}