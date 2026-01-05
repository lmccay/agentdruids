"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncResultManager = void 0;
const uuid_1 = require("uuid");
/**
 * AsyncResultManager - Manages asynchronous agent task results using WorldTree namespace
 */
class AsyncResultManager {
    constructor() {
        this.NAMESPACE_PREFIX = 'worldtree://public/async_results';
        this.DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
        this.DEFAULT_ESTIMATED_DURATION = 30000; // 30 seconds
        this.CHECK_INTERVAL = 2000; // 2 seconds
        // In-memory storage for demo (would use WorldTree knowledge service in production)
        this.results = new Map();
        this.processingTasks = new Map();
    }
    /**
     * Generate a unique request ID with agent prefix
     */
    generateRequestId(agentId) {
        const timestamp = Date.now();
        const uuid = (0, uuid_1.v4)().slice(0, 8);
        return `req_${agentId}_${timestamp}_${uuid}`;
    }
    /**
     * Create an async request and return immediate response
     */
    async createAsyncRequest(request) {
        const requestId = this.generateRequestId(request.agentId);
        const estimatedDuration = request.estimatedDuration || this.DEFAULT_ESTIMATED_DURATION;
        const expiresAt = new Date(Date.now() + this.DEFAULT_EXPIRY_MS).toISOString();
        const asyncResult = {
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
    async updateResultStatus(requestId, status, progress) {
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
    async completeAsyncRequest(requestId, agentResponse) {
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
    async failAsyncRequest(requestId, error) {
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
    async getResult(requestId) {
        // In production, this would query WorldTree namespace
        // For demo, using in-memory storage
        return this.results.get(requestId) || null;
    }
    /**
     * Get results by agent ID
     */
    async getResultsByAgent(agentId, limit) {
        const agentResults = Array.from(this.results.values())
            .filter(result => result.agentId === agentId)
            .sort((a, b) => new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime());
        return limit ? agentResults.slice(0, limit) : agentResults;
    }
    /**
     * Check if request is still valid (not expired)
     */
    isRequestValid(result) {
        const createdAt = new Date(result.metadata.createdAt).getTime();
        const now = Date.now();
        return (now - createdAt) < this.DEFAULT_EXPIRY_MS;
    }
    /**
     * Clean up expired results
     */
    async cleanupExpiredResults() {
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
     * Store result (in production, this would write to WorldTree namespace)
     */
    async storeResult(result) {
        // For demo: store in memory
        this.results.set(result.requestId, { ...result });
        // In production, this would be:
        // await this.worldTreeService.publish(`${this.NAMESPACE_PREFIX}/${result.agentId}/${result.requestId}`, result);
        console.log(`📝 Stored async result: ${result.requestId} (${result.status})`);
    }
    /**
     * Get namespace path for a request
     */
    getNamespacePath(agentId, requestId, file) {
        const basePath = `${this.NAMESPACE_PREFIX}/${agentId}/${requestId}`;
        return file ? `${basePath}/${file}` : basePath;
    }
    /**
     * Get statistics about async results
     */
    async getStatistics() {
        const results = Array.from(this.results.values());
        const total = results.length;
        const byStatus = {
            'pending': 0,
            'processing': 0,
            'completed': 0,
            'failed': 0,
            'expired': 0
        };
        const byAgent = {};
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
exports.AsyncResultManager = AsyncResultManager;
