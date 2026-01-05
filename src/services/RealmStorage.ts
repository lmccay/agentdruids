import { RealmId } from '../models/Types';

// Try to import Redis, but gracefully handle if it's not available
let createClient: any = null;
let RedisAvailable = false;

try {
  const redis = require('redis');
  createClient = redis.createClient;
  RedisAvailable = true;
} catch (error) {
  console.warn('Redis module not available, using in-memory fallback for realm storage');
}

/**
 * Redis-based storage adapter for realm persistence
 * Falls back to in-memory storage if Redis is not available
 */
export class RealmStorage {
  private client: any = null;
  private keyPrefix = 'druids:realms:';
  private isConnected = false;
  
  // Fallback in-memory storage
  private memoryStorage: Map<RealmId, any> = new Map();

  constructor(redisUrl?: string) {
    if (!RedisAvailable) {
      console.log('📦 Using in-memory storage for realms (Redis not available)');
      return;
    }
    
    try {
      const url = redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379';
      this.client = createClient({ url });
      
      this.client.on('error', (err: any) => {
        console.error('Redis Client Error (RealmStorage):', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected for realm storage');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('❌ Redis disconnected (RealmStorage)');
        this.isConnected = false;
      });
    } catch (error) {
      console.warn('Failed to initialize Redis client for realms, using in-memory fallback:', error);
      this.client = null;
    }
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized for realm storage');
    }
    
    if (!this.client.isReady) {
      console.log('🔄 Connecting to Redis for realm storage...');
      await this.client.connect();
      console.log('✅ Redis connection established for realm storage');
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
   * Store a realm in Redis or memory fallback
   */
  async setRealm(realmId: RealmId, realm: any): Promise<void> {
    // If no Redis client available, use memory fallback
    if (!this.client) {
      this.memoryStorage.set(realmId, realm);
      console.log(`💾 Stored realm ${realmId} in memory (fallback)`);
      return;
    }
    
    try {
      // Ensure connection before storing
      if (!this.isConnected) {
        await this.connect();
      }
      
      const key = this.keyPrefix + realmId;
      const serialized = JSON.stringify(realm);
      await this.client.set(key, serialized);
      console.log(`💾 Stored realm ${realmId} in Redis`);
    } catch (error) {
      console.warn('Redis storage failed for realm, using memory fallback:', error);
      this.memoryStorage.set(realmId, realm);
    }
  }

  /**
   * Retrieve a realm from Redis or memory fallback
   */
  async getRealm(realmId: RealmId): Promise<any | null> {
    // If no Redis client available, use memory fallback
    if (!this.client) {
      const realm = this.memoryStorage.get(realmId) || null;
      if (realm) {
        console.log(`📥 Retrieved realm ${realmId} from memory (fallback)`);
      }
      return realm;
    }
    
    try {
      // Ensure connection before retrieving
      if (!this.isConnected) {
        await this.connect();
      }
      
      const key = this.keyPrefix + realmId;
      const serialized = await this.client.get(key);
      
      if (!serialized) {
        return null;
      }

      const realm = JSON.parse(serialized);
      console.log(`📥 Retrieved realm ${realmId} from Redis`);
      return realm;
    } catch (error) {
      console.warn(`Redis retrieval failed for realm ${realmId}, checking memory fallback:`, error);
      const realm = this.memoryStorage.get(realmId) || null;
      if (realm) {
        console.log(`📥 Retrieved realm ${realmId} from memory (fallback)`);
      }
      return realm;
    }
  }

  /**
   * Get all realm IDs from Redis or memory fallback
   */
  async getAllRealmIds(): Promise<RealmId[]> {
    // Use memory fallback if Redis not available
    if (!this.client) {
      return Array.from(this.memoryStorage.keys());
    }
    
    try {
      await this.connect();
      
      if (!this.client.isReady) {
        console.log('Redis not ready, using memory fallback for realms');
        return Array.from(this.memoryStorage.keys());
      }
      
      const pattern = this.keyPrefix + '*';
      const keys = await this.client.keys(pattern);
      const realmIds = keys.map((key: string) => key.replace(this.keyPrefix, '') as RealmId);
      return realmIds;
    } catch (error) {
      console.warn('Redis key listing failed for realms, using memory fallback:', error);
      return Array.from(this.memoryStorage.keys());
    }
  }

  /**
   * Get all realms
   */
  async getAllRealms(): Promise<Map<RealmId, any>> {
    try {
      const realmIds = await this.getAllRealmIds();
      const realms = new Map<RealmId, any>();
      
      for (const realmId of realmIds) {
        const realm = await this.getRealm(realmId);
        if (realm) {
          realms.set(realmId, realm);
        }
      }
      
      console.log(`📥 Retrieved ${realms.size} realms from Redis`);
      return realms;
    } catch (error) {
      console.error('Error getting all realms from Redis:', error);
      throw error;
    }
  }

  /**
   * Delete a realm from Redis or memory fallback
   */
  async deleteRealm(realmId: RealmId): Promise<void> {
    // If no Redis client available, use memory fallback
    if (!this.client) {
      this.memoryStorage.delete(realmId);
      console.log(`🗑️ Deleted realm ${realmId} from memory (fallback)`);
      return;
    }
    
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const key = this.keyPrefix + realmId;
      await this.client.del(key);
      console.log(`🗑️ Deleted realm ${realmId} from Redis`);
    } catch (error) {
      console.warn('Redis deletion failed for realm, using memory fallback:', error);
      this.memoryStorage.delete(realmId);
    }
  }

  /**
   * Safe operation wrapper that handles errors gracefully
   */
  async safeOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.warn('Redis operation failed, returning fallback:', error);
      return fallback;
    }
  }

  /**
   * Safe version of getAllRealms that falls back to empty Map if Redis is unavailable
   */
  async safeGetAllRealms(): Promise<Map<RealmId, any>> {
    return this.safeOperation(() => this.getAllRealms(), new Map<RealmId, any>());
  }
}