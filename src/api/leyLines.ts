import { Router, Request, Response } from 'express';
import { RealmId } from '../models/Types';

const router = Router();

// LeyLine interfaces
interface LeyLine {
  id: string;
  sourceRealmId: RealmId;
  targetRealmId: RealmId;
  status: 'active' | 'inactive' | 'connecting' | 'disconnected';
  createdAt: string;
  configuration: {
    bandwidth: number; // MB/s
    encryption: boolean;
    protocol: 'secure-mcp' | 'standard-mcp' | 'custom';
    bidirectional: boolean;
    priority: 'low' | 'normal' | 'high' | 'critical';
    failoverConfig?: {
      enabled: boolean;
      retryAttempts: number;
      timeoutSeconds: number;
    };
    compressionConfig?: {
      enabled: boolean;
      algorithm: 'gzip' | 'lz4' | 'brotli';
      level: number;
    };
    rateLimiting?: {
      enabled: boolean;
      requestsPerSecond: number;
      burstLimit: number;
    };
  };
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'establishing';
    latency: number; // ms
    throughput: number; // MB/s
    errorRate: number; // percentage
    lastPingTime?: string;
    uptime: number; // seconds
    packetsTransmitted: number;
    packetsReceived: number;
    packetsLost: number;
  };
  metadata?: {
    description?: string;
    tags?: string[];
    createdBy?: string;
    lastModifiedBy?: string;
    lastModifiedAt?: string;
  };
}

interface CreateLeyLineRequest {
  targetRealmId: RealmId;
  configuration: {
    bandwidth: number;
    encryption: boolean;
    protocol: 'secure-mcp' | 'standard-mcp' | 'custom';
    bidirectional: boolean;
    priority: 'low' | 'normal' | 'high' | 'critical';
    failoverConfig?: {
      enabled: boolean;
      retryAttempts: number;
      timeoutSeconds: number;
    };
    compressionConfig?: {
      enabled: boolean;
      algorithm: 'gzip' | 'lz4' | 'brotli';
      level: number;
    };
    rateLimiting?: {
      enabled: boolean;
      requestsPerSecond: number;
      burstLimit: number;
    };
  };
  metadata?: {
    description?: string;
    tags?: string[];
  };
}

// In-memory storage for ley lines
const leyLines: Map<string, LeyLine> = new Map();

// Initialize with default ley lines
function initializeDefaultLeyLines() {
  const now = Date.now().toString();
  
  const defaultLeyLine: LeyLine = {
    id: 'leyline-001',
    sourceRealmId: 'system-realm' as RealmId,
    targetRealmId: 'test-realm-001' as RealmId,
    status: 'active',
    createdAt: now,
    configuration: {
      bandwidth: 1000,
      encryption: true,
      protocol: 'secure-mcp',
      bidirectional: true,
      priority: 'normal',
      failoverConfig: {
        enabled: true,
        retryAttempts: 3,
        timeoutSeconds: 30
      }
    },
    health: {
      status: 'healthy',
      latency: 45,
      throughput: 850,
      errorRate: 0.1,
      lastPingTime: now,
      uptime: 86400,
      packetsTransmitted: 15420,
      packetsReceived: 15404,
      packetsLost: 16
    },
    metadata: {
      description: 'Primary connection between system and test realm',
      tags: ['system', 'test', 'primary'],
      createdBy: 'system',
      lastModifiedBy: 'system',
      lastModifiedAt: now
    }
  };

  const highPriorityLeyLine: LeyLine = {
    id: 'leyline-002',
    sourceRealmId: 'test-realm-001' as RealmId,
    targetRealmId: 'test-realm-002' as RealmId,
    status: 'active',
    createdAt: now,
    configuration: {
      bandwidth: 5000,
      encryption: true,
      protocol: 'secure-mcp',
      bidirectional: false,
      priority: 'high',
      failoverConfig: {
        enabled: true,
        retryAttempts: 5,
        timeoutSeconds: 15
      },
      compressionConfig: {
        enabled: true,
        algorithm: 'lz4',
        level: 3
      }
    },
    health: {
      status: 'healthy',
      latency: 28,
      throughput: 4200,
      errorRate: 0.05,
      lastPingTime: now,
      uptime: 43200,
      packetsTransmitted: 89432,
      packetsReceived: 89387,
      packetsLost: 45
    }
  };

  leyLines.set('leyline-001', defaultLeyLine);
  leyLines.set('leyline-002', highPriorityLeyLine);
}

// Initialize default ley lines
initializeDefaultLeyLines();

// Helper function to generate ley line ID
function generateLeyLineId(): string {
  return `leyline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to get ley lines for a realm
function getLeyLinesForRealm(realmId: RealmId): LeyLine[] {
  return Array.from(leyLines.values()).filter(
    leyLine => leyLine.sourceRealmId === realmId || 
               (leyLine.configuration.bidirectional && leyLine.targetRealmId === realmId)
  );
}

/**
 * GET /realms/:realmId/ley-lines
 * Get all ley line connections for a realm
 */
router.get('/realms/:realmId/ley-lines', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    const { status, priority } = req.query;

    if (!realmId || typeof realmId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Realm ID is required'
      });
      return;
    }

    let realmLeyLines = getLeyLinesForRealm(realmId as RealmId);

    // Filter by status if specified
    if (status && typeof status === 'string') {
      realmLeyLines = realmLeyLines.filter(leyLine => leyLine.status === status);
    }

    // Filter by priority if specified
    if (priority && typeof priority === 'string') {
      realmLeyLines = realmLeyLines.filter(leyLine => leyLine.configuration.priority === priority);
    }

    // Sort by priority (critical > high > normal > low) then by creation time
    const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
    realmLeyLines.sort((a, b) => {
      const aPriority = priorityOrder[a.configuration.priority];
      const bPriority = priorityOrder[b.configuration.priority];
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      return parseInt(b.createdAt) - parseInt(a.createdAt);
    });

    res.json(realmLeyLines);
  } catch (error) {
    console.error('Error getting ley lines for realm:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve ley lines'
    });
  }
});

/**
 * POST /realms/:realmId/ley-lines
 * Create a new ley line connection from a realm
 */
router.post('/realms/:realmId/ley-lines', async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    const { targetRealmId, configuration, metadata } = req.body as CreateLeyLineRequest;

    if (!realmId || typeof realmId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Source realm ID is required'
      });
      return;
    }

    // Validate required fields
    if (!targetRealmId || typeof targetRealmId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Target realm ID is required'
      });
      return;
    }

    if (realmId === targetRealmId) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Source and target realm cannot be the same'
      });
      return;
    }

    if (!configuration || typeof configuration !== 'object') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Configuration is required'
      });
      return;
    }

    // Validate configuration fields
    if (typeof configuration.bandwidth !== 'number' || configuration.bandwidth <= 0) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Bandwidth must be a positive number'
      });
      return;
    }

    if (!['secure-mcp', 'standard-mcp', 'custom'].includes(configuration.protocol)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Protocol must be one of: secure-mcp, standard-mcp, custom'
      });
      return;
    }

    if (!['low', 'normal', 'high', 'critical'].includes(configuration.priority)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Priority must be one of: low, normal, high, critical'
      });
      return;
    }

    // Check if ley line already exists between these realms
    const existingLeyLine = Array.from(leyLines.values()).find(
      leyLine => 
        (leyLine.sourceRealmId === realmId && leyLine.targetRealmId === targetRealmId) ||
        (leyLine.configuration.bidirectional && 
         leyLine.sourceRealmId === targetRealmId && leyLine.targetRealmId === realmId)
    );

    if (existingLeyLine) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Ley line connection already exists between these realms'
      });
      return;
    }

    // Generate ley line ID
    const leyLineId = generateLeyLineId();
    const now = Date.now().toString();

    const newLeyLine: LeyLine = {
      id: leyLineId,
      sourceRealmId: realmId as RealmId,
      targetRealmId: targetRealmId as RealmId,
      status: 'connecting',
      createdAt: now,
      configuration,
      health: {
        status: 'establishing',
        latency: 0,
        throughput: 0,
        errorRate: 0,
        uptime: 0,
        packetsTransmitted: 0,
        packetsReceived: 0,
        packetsLost: 0
      },
      ...(metadata && { metadata: {
        ...metadata,
        createdBy: 'user', // In a real system, this would come from authentication
        lastModifiedBy: 'user',
        lastModifiedAt: now
      }})
    };

    leyLines.set(leyLineId, newLeyLine);

    // Simulate connection establishment
    setTimeout(() => {
      const leyLine = leyLines.get(leyLineId);
      if (leyLine && leyLine.status === 'connecting') {
        leyLine.status = 'active';
        leyLine.health.status = 'healthy';
        leyLine.health.latency = Math.floor(Math.random() * 100) + 20; // 20-120ms
        leyLine.health.lastPingTime = Date.now().toString();
        leyLines.set(leyLineId, leyLine);
      }
    }, 1000);

    res.status(201).json(newLeyLine);
  } catch (error) {
    console.error('Error creating ley line:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create ley line'
    });
  }
});

/**
 * GET /ley-lines/:leyLineId
 * Get specific ley line details
 */
router.get('/ley-lines/:leyLineId', async (req: Request, res: Response) => {
  try {
    const { leyLineId } = req.params;

    if (!leyLineId || typeof leyLineId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Ley line ID is required'
      });
      return;
    }

    const leyLine = leyLines.get(leyLineId);
    if (!leyLine) {
      res.status(404).json({
        error: 'Not found',
        message: `Ley line with ID '${leyLineId}' not found`
      });
      return;
    }

    res.json(leyLine);
  } catch (error) {
    console.error('Error getting ley line:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve ley line'
    });
  }
});

/**
 * PUT /ley-lines/:leyLineId
 * Update ley line configuration
 */
router.put('/ley-lines/:leyLineId', async (req: Request, res: Response) => {
  try {
    const { leyLineId } = req.params;
    const updateData = req.body;

    if (!leyLineId || typeof leyLineId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Ley line ID is required'
      });
      return;
    }

    const leyLine = leyLines.get(leyLineId);
    if (!leyLine) {
      res.status(404).json({
        error: 'Not found',
        message: `Ley line with ID '${leyLineId}' not found`
      });
      return;
    }

    // Update allowed fields
    if (updateData.status && ['active', 'inactive', 'connecting', 'disconnected'].includes(updateData.status)) {
      leyLine.status = updateData.status;
    }

    if (updateData.configuration) {
      // Validate configuration updates
      if (updateData.configuration.bandwidth && 
          (typeof updateData.configuration.bandwidth !== 'number' || updateData.configuration.bandwidth <= 0)) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Bandwidth must be a positive number'
        });
        return;
      }

      if (updateData.configuration.priority && 
          !['low', 'normal', 'high', 'critical'].includes(updateData.configuration.priority)) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Priority must be one of: low, normal, high, critical'
        });
        return;
      }

      leyLine.configuration = {
        ...leyLine.configuration,
        ...updateData.configuration
      };
    }

    if (updateData.metadata) {
      leyLine.metadata = {
        ...leyLine.metadata,
        ...updateData.metadata,
        lastModifiedBy: 'user',
        lastModifiedAt: Date.now().toString()
      };
    }

    leyLines.set(leyLineId, leyLine);
    res.json(leyLine);
  } catch (error) {
    console.error('Error updating ley line:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update ley line'
    });
  }
});

/**
 * DELETE /ley-lines/:leyLineId
 * Delete a ley line connection
 */
router.delete('/ley-lines/:leyLineId', async (req: Request, res: Response) => {
  try {
    const { leyLineId } = req.params;

    if (!leyLineId || typeof leyLineId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Ley line ID is required'
      });
      return;
    }

    const leyLine = leyLines.get(leyLineId);
    if (!leyLine) {
      res.status(404).json({
        error: 'Not found',
        message: `Ley line with ID '${leyLineId}' not found`
      });
      return;
    }

    // Don't allow deletion of critical ley lines that are active
    if (leyLine.configuration.priority === 'critical' && leyLine.status === 'active') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Cannot delete active critical ley line. Please deactivate first.'
      });
      return;
    }

    leyLines.delete(leyLineId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting ley line:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete ley line'
    });
  }
});

/**
 * POST /ley-lines/:leyLineId/ping
 * Test ley line connectivity
 */
router.post('/ley-lines/:leyLineId/ping', async (req: Request, res: Response) => {
  try {
    const { leyLineId } = req.params;

    if (!leyLineId || typeof leyLineId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Ley line ID is required'
      });
      return;
    }

    const leyLine = leyLines.get(leyLineId);
    if (!leyLine) {
      res.status(404).json({
        error: 'Not found',
        message: `Ley line with ID '${leyLineId}' not found`
      });
      return;
    }

    if (leyLine.status !== 'active') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Cannot ping inactive ley line'
      });
      return;
    }

    // Simulate ping
    const pingStartTime = Date.now();
    const simulatedLatency = Math.floor(Math.random() * 50) + 10; // 10-60ms
    
    // Update health metrics
    leyLine.health.latency = simulatedLatency;
    leyLine.health.lastPingTime = pingStartTime.toString();
    leyLine.health.packetsTransmitted += 1;
    leyLine.health.packetsReceived += 1;

    const pingResult = {
      leyLineId,
      timestamp: pingStartTime.toString(),
      latency: simulatedLatency,
      status: 'success',
      sourceRealmId: leyLine.sourceRealmId,
      targetRealmId: leyLine.targetRealmId
    };

    leyLines.set(leyLineId, leyLine);
    res.json(pingResult);
  } catch (error) {
    console.error('Error pinging ley line:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to ping ley line'
    });
  }
});

export default router;
