import { Agent } from '../models/Agent';
import { AgentId } from '../models/Types';

// Try to import Redis, but gracefully handle if it's not available
let createClient: any = null;
let RedisAvailable = false;

try {
  const redis = require('redis');
  createClient = redis.createClient;
  RedisAvailable = true;
} catch (error) {
  console.warn('Redis module not available, using in-memory fallback for agent storage');
}

/**
 * Redis-based storage adapter for agent persistence
 * Falls back to in-memory storage if Redis is not available
 */
export class AgentStorage {
  private client: any = null;
  private keyPrefix = 'druids:agents:';
  private isConnected = false;
  
  // Fallback in-memory storage
  private memoryStorage: Map<AgentId, Agent> = new Map();

  constructor(redisUrl?: string) {
    if (!RedisAvailable) {
      console.log('📦 Using in-memory storage (Redis not available)');
      return;
    }
    
    try {
      const url = redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379';
      this.client = createClient({ url });
      
      this.client.on('error', (err: any) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected for agent storage');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('❌ Redis disconnected');
        this.isConnected = false;
      });
    } catch (error) {
      console.warn('Failed to initialize Redis client, using in-memory fallback:', error);
      this.client = null;
    }
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    
    if (!this.client.isReady) {
      console.log('🔄 Connecting to Redis...');
      await this.client.connect();
      console.log('✅ Redis connection established');
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
    }
  }

  /**
   * Store an agent in Redis or memory fallback
   */
  async setAgent(agentId: AgentId, agent: Agent): Promise<void> {
    // If no Redis client available, use memory fallback
    if (!this.client) {
      this.memoryStorage.set(agentId, agent);
      console.log(`💾 Stored agent ${agentId} in memory (fallback)`);
      return;
    }
    
    try {
      // Ensure connection before storing
      if (!this.isConnected) {
        await this.connect();
      }
      
      const key = this.keyPrefix + agentId;
      const serialized = JSON.stringify(agent);
      await this.client.set(key, serialized);
      console.log(`💾 Stored agent ${agentId} in Redis`);
    } catch (error) {
      console.warn('Redis storage failed, using memory fallback:', error);
      this.memoryStorage.set(agentId, agent);
    }
  }

  /**
   * Retrieve an agent from Redis or memory fallback
   */
  async getAgent(agentId: AgentId): Promise<Agent | null> {
    // If no Redis client available, use memory fallback
    if (!this.client) {
      const agent = this.memoryStorage.get(agentId) || null;
      if (agent) {
        console.log(`📥 Retrieved agent ${agentId} from memory (fallback)`);
      }
      return agent;
    }
    
    try {
      // Ensure connection before retrieving
      if (!this.isConnected) {
        await this.connect();
      }
      
      const key = this.keyPrefix + agentId;
      const serialized = await this.client.get(key);
      
      if (!serialized) {
        return null;
      }

      const agent = JSON.parse(serialized) as Agent;
      console.log(`📥 Retrieved agent ${agentId} from Redis`);
      return agent;
    } catch (error) {
      console.warn(`Redis retrieval failed for agent ${agentId}, checking memory fallback:`, error);
      const agent = this.memoryStorage.get(agentId) || null;
      if (agent) {
        console.log(`📥 Retrieved agent ${agentId} from memory (fallback)`);
      }
      return agent;
    }
  }

  /**
   * Get all agent IDs from Redis or memory fallback
   */
  async getAllAgentIds(): Promise<AgentId[]> {
    // Use memory fallback if Redis not available
    if (!this.client) {
      return Array.from(this.memoryStorage.keys());
    }
    
    try {
      await this.connect();
      
      if (!this.client.isReady) {
        console.log('Redis not ready, using memory fallback');
        return Array.from(this.memoryStorage.keys());
      }
      
      const pattern = this.keyPrefix + '*';
      const keys = await this.client.keys(pattern);
      const agentIds = keys.map((key: string) => key.replace(this.keyPrefix, '') as AgentId);
      return agentIds;
    } catch (error) {
      console.warn('Redis key listing failed, using memory fallback:', error);
      return Array.from(this.memoryStorage.keys());
    }
  }

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<Map<AgentId, Agent>> {
    try {
      const agentIds = await this.getAllAgentIds();
      const agents = new Map<AgentId, Agent>();
      
      for (const agentId of agentIds) {
        const agent = await this.getAgent(agentId);
        if (agent) {
          agents.set(agentId, agent);
        }
      }
      
      console.log(`📥 Retrieved ${agents.size} agents from Redis`);
      return agents;
    } catch (error) {
      console.error('Error getting all agents from Redis:', error);
      throw error;
    }
  }

  /**
   * Delete an agent from Redis or memory fallback
   */
  async deleteAgent(agentId: AgentId): Promise<boolean> {
    // Use memory fallback if Redis not available  
    if (!this.client || !this.isConnected) {
      const deleted = this.memoryStorage.delete(agentId);
      if (deleted) {
        console.log(`🗑️ Deleted agent ${agentId} from memory (fallback)`);
      }
      return deleted;
    }
    
    try {
      await this.connect();
      const key = this.keyPrefix + agentId;
      const result = await this.client.del(key);
      const deleted = result > 0;
      
      if (deleted) {
        console.log(`🗑️ Deleted agent ${agentId} from Redis`);
      }
      
      // Also remove from memory fallback if present
      this.memoryStorage.delete(agentId);
      
      return deleted;
    } catch (error) {
      console.warn('Redis delete failed, using memory fallback:', error);
      const deleted = this.memoryStorage.delete(agentId);
      if (deleted) {
        console.log(`🗑️ Deleted agent ${agentId} from memory (fallback)`);
      }
      return deleted;
    }
  }

  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    return this.isConnected;
  }

  /**
   * Graceful fallback: if Redis is unavailable, return empty results instead of errors
   */
  private async safeOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.warn('Redis operation failed, using fallback:', error instanceof Error ? error.message : 'Unknown error');
      return fallback;
    }
  }

  /**
   * Safe version of getAgent that falls back to null if Redis is unavailable
   */
  async safeGetAgent(agentId: AgentId): Promise<Agent | null> {
    return this.safeOperation(() => this.getAgent(agentId), null);
  }

  /**
   * Safe version of getAllAgents that falls back to empty Map if Redis is unavailable
   */
  async safeGetAllAgents(): Promise<Map<AgentId, Agent>> {
    return this.safeOperation(() => this.getAllAgents(), new Map<AgentId, Agent>());
  }
}