"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentStorage = void 0;
// Try to import Redis, but gracefully handle if it's not available
let createClient = null;
let RedisAvailable = false;
try {
    const redis = require('redis');
    createClient = redis.createClient;
    RedisAvailable = true;
}
catch (error) {
    console.warn('Redis module not available, using in-memory fallback for agent storage');
}
/**
 * Redis-based storage adapter for agent persistence
 * Falls back to in-memory storage if Redis is not available
 */
class AgentStorage {
    constructor(redisUrl) {
        this.client = null;
        this.keyPrefix = 'druids:agents:';
        this.isConnected = false;
        // Fallback in-memory storage
        this.memoryStorage = new Map();
        if (!RedisAvailable) {
            console.log('📦 Using in-memory storage (Redis not available)');
            return;
        }
        try {
            const url = redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379';
            this.client = createClient({ url });
            this.client.on('error', (err) => {
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
        }
        catch (error) {
            console.warn('Failed to initialize Redis client, using in-memory fallback:', error);
            this.client = null;
        }
    }
    /**
     * Connect to Redis
     */
    async connect() {
        if (!this.isConnected) {
            await this.client.connect();
        }
    }
    /**
     * Disconnect from Redis
     */
    async disconnect() {
        if (this.isConnected) {
            await this.client.disconnect();
        }
    }
    /**
     * Store an agent in Redis or memory fallback
     */
    async setAgent(agentId, agent) {
        // Use memory fallback if Redis not available
        if (!this.client || !this.isConnected) {
            this.memoryStorage.set(agentId, agent);
            console.log(`💾 Stored agent ${agentId} in memory (fallback)`);
            return;
        }
        try {
            await this.connect();
            const key = this.keyPrefix + agentId;
            const serialized = JSON.stringify(agent);
            await this.client.set(key, serialized);
            console.log(`💾 Stored agent ${agentId} in Redis`);
        }
        catch (error) {
            console.warn('Redis storage failed, using memory fallback:', error);
            this.memoryStorage.set(agentId, agent);
        }
    }
    /**
     * Retrieve an agent from Redis or memory fallback
     */
    async getAgent(agentId) {
        // Use memory fallback if Redis not available
        if (!this.client || !this.isConnected) {
            const agent = this.memoryStorage.get(agentId) || null;
            if (agent) {
                console.log(`📥 Retrieved agent ${agentId} from memory (fallback)`);
            }
            return agent;
        }
        try {
            await this.connect();
            const key = this.keyPrefix + agentId;
            const serialized = await this.client.get(key);
            if (!serialized) {
                return null;
            }
            const agent = JSON.parse(serialized);
            console.log(`📥 Retrieved agent ${agentId} from Redis`);
            return agent;
        }
        catch (error) {
            console.warn('Redis retrieval failed, checking memory fallback:', error);
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
    async getAllAgentIds() {
        // Use memory fallback if Redis not available
        if (!this.client || !this.isConnected) {
            return Array.from(this.memoryStorage.keys());
        }
        try {
            await this.connect();
            const pattern = this.keyPrefix + '*';
            const keys = await this.client.keys(pattern);
            return keys.map((key) => key.replace(this.keyPrefix, ''));
        }
        catch (error) {
            console.warn('Redis key listing failed, using memory fallback:', error);
            return Array.from(this.memoryStorage.keys());
        }
    }
    /**
     * Get all agents
     */
    async getAllAgents() {
        try {
            const agentIds = await this.getAllAgentIds();
            const agents = new Map();
            for (const agentId of agentIds) {
                const agent = await this.getAgent(agentId);
                if (agent) {
                    agents.set(agentId, agent);
                }
            }
            console.log(`📥 Retrieved ${agents.size} agents from Redis`);
            return agents;
        }
        catch (error) {
            console.error('Error getting all agents from Redis:', error);
            throw error;
        }
    }
    /**
     * Delete an agent from Redis or memory fallback
     */
    async deleteAgent(agentId) {
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
        }
        catch (error) {
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
    isAvailable() {
        return this.isConnected;
    }
    /**
     * Graceful fallback: if Redis is unavailable, return empty results instead of errors
     */
    async safeOperation(operation, fallback) {
        try {
            return await operation();
        }
        catch (error) {
            console.warn('Redis operation failed, using fallback:', error instanceof Error ? error.message : 'Unknown error');
            return fallback;
        }
    }
    /**
     * Safe version of getAgent that falls back to null if Redis is unavailable
     */
    async safeGetAgent(agentId) {
        return this.safeOperation(() => this.getAgent(agentId), null);
    }
    /**
     * Safe version of getAllAgents that falls back to empty Map if Redis is unavailable
     */
    async safeGetAllAgents() {
        return this.safeOperation(() => this.getAllAgents(), new Map());
    }
}
exports.AgentStorage = AgentStorage;
