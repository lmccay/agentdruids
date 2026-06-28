import { Router, Request, Response } from 'express';
import { AgentId } from '../models/Types';
import { requireAdmin } from '../auth/authorize';

const router = Router();

// Tool Access interfaces
interface ToolAccess {
  accessToken: string;
  agentId: AgentId;
  toolId: string;
  toolType?: 'internal' | 'mcp' | 'external';
  grantedPermissions: string[];
  requestedPermissions: string[];
  justification: string;
  duration: number; // seconds
  expiresAt: string;
  status: 'granted' | 'denied' | 'revoked' | 'expired';
  createdAt: string;
  lastUsedAt?: string;
  mcpConfiguration?: {
    serverUrl: string;
    protocol: 'json-rpc' | 'http' | 'websocket';
    authentication: {
      type: 'bearer' | 'api-key' | 'oauth2' | 'none';
      tokenSource: 'environment' | 'vault' | 'inline';
      credentials?: any;
    };
  };
  autoRevoke?: {
    onTaskCompletion: boolean;
    onError: boolean;
    maxUsageCount?: number;
  };
  usageTracking?: {
    maxUsageCount?: number;
    currentUsageCount: number;
    lastUsageDetails?: {
      timestamp: string;
      operation: string;
      result: 'success' | 'failure';
    };
  };
  delegation?: {
    delegatedTo: AgentId;
    allowSubDelegation: boolean;
    delegationScope: string[];
  };
  isDelegated?: boolean;
  resourceConstraints?: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxDiskUsageMB: number;
    maxNetworkMbps: number;
  };
  monitoring?: {
    resourceTracking: boolean;
    alertThresholds: {
      memoryPercent: number;
      cpuPercent: number;
      diskPercent: number;
      networkPercent: number;
    };
    currentUsage?: {
      memoryMB: number;
      cpuPercent: number;
      diskUsageMB: number;
      networkMbps: number;
    };
  };
  metadata?: {
    scenarioId?: string;
    executionId?: string;
    tags?: string[];
    revocationReason?: string;
    revokedAt?: string;
  };
}

interface ToolAccessRequest {
  agentId: AgentId;
  toolId: string;
  toolType?: 'internal' | 'mcp' | 'external';
  requestedPermissions: string[];
  justification: string;
  duration: number; // seconds
  mcpConfiguration?: {
    serverUrl: string;
    protocol: 'json-rpc' | 'http' | 'websocket';
    authentication: {
      type: 'bearer' | 'api-key' | 'oauth2' | 'none';
      tokenSource: 'environment' | 'vault' | 'inline';
      credentials?: any;
    };
  };
  autoRevoke?: {
    onTaskCompletion: boolean;
    onError: boolean;
    maxUsageCount?: number;
  };
  delegation?: {
    delegatedTo: AgentId;
    allowSubDelegation: boolean;
    delegationScope: string[];
  };
  resourceConstraints?: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxDiskUsageMB: number;
    maxNetworkMbps: number;
  };
  metadata?: {
    scenarioId?: string;
    executionId?: string;
    tags?: string[];
    revocationReason?: string;
    revokedAt?: string;
  };
}

// In-memory storage for tool access tokens
const toolAccess: Map<string, ToolAccess> = new Map();

// Initialize with default tool access
function initializeDefaultToolAccess() {
  const now = Date.now().toString();
  const expiresAt = (Date.now() + 3600000).toString(); // 1 hour from now
  
  const defaultAccess: ToolAccess = {
    accessToken: 'token-12345',
    agentId: 'druid-demo-001' as AgentId,
    toolId: 'file-system-access',
    toolType: 'internal',
    grantedPermissions: ['read', 'write'],
    requestedPermissions: ['read', 'write'],
    justification: 'Data processing for demo scenario',
    duration: 3600,
    expiresAt,
    status: 'granted',
    createdAt: now,
    usageTracking: {
      maxUsageCount: 50,
      currentUsageCount: 5,
      lastUsageDetails: {
        timestamp: now,
        operation: 'file.read',
        result: 'success'
      }
    }
  };

  const mcpAccess: ToolAccess = {
    accessToken: 'mcp-token-67890',
    agentId: 'elemental-demo-001' as AgentId,
    toolId: 'external-api-client',
    toolType: 'mcp',
    grantedPermissions: ['execute'],
    requestedPermissions: ['execute'],
    justification: 'External data retrieval for analysis',
    duration: 7200,
    expiresAt: (Date.now() + 7200000).toString(),
    status: 'granted',
    createdAt: now,
    mcpConfiguration: {
      serverUrl: 'https://api.external-service.com',
      protocol: 'json-rpc',
      authentication: {
        type: 'bearer',
        tokenSource: 'environment'
      }
    },
    usageTracking: {
      currentUsageCount: 12
    }
  };

  toolAccess.set('token-12345', defaultAccess);
  toolAccess.set('mcp-token-67890', mcpAccess);
}

// Initialize default tool access
initializeDefaultToolAccess();

// Helper function to generate access token
function generateAccessToken(): string {
  return `token-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
}

// Helper function to validate permissions
function validatePermissions(toolId: string, requestedPermissions: string[]): string[] {
  // In a real system, this would check against tool capabilities
  // For demo purposes, we'll grant most permissions but with some logic
  
  const validPermissions = ['read', 'write', 'execute', 'admin', 'delete'];
  const toolPermissionLimits: { [key: string]: string[] } = {
    'file-system-access': ['read', 'write'],
    'external-api-client': ['execute'],
    'system-monitoring': ['read'],
    'data-analytics': ['read', 'execute'],
    'high-performance-compute': ['execute']
  };
  
  const allowedForTool = toolPermissionLimits[toolId] || validPermissions;
  return requestedPermissions.filter(perm => 
    validPermissions.includes(perm) && allowedForTool.includes(perm)
  );
}

/**
 * POST /tools/access
 * Request tool access
 */
router.post('/tools/access', requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      agentId,
      toolId,
      toolType,
      requestedPermissions,
      justification,
      duration,
      mcpConfiguration,
      autoRevoke,
      delegation,
      resourceConstraints,
      metadata
    } = req.body as ToolAccessRequest;

    // Validate required fields
    if (!agentId || typeof agentId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Agent ID is required'
      });
      return;
    }

    if (!toolId || typeof toolId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Tool ID is required'
      });
      return;
    }

    if (!Array.isArray(requestedPermissions) || requestedPermissions.length === 0) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Requested permissions must be a non-empty array'
      });
      return;
    }

    if (!justification || typeof justification !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Justification is required'
      });
      return;
    }

    if (typeof duration !== 'number' || duration <= 0) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Duration must be a positive number (seconds)'
      });
      return;
    }

    // Validate MCP configuration if provided
    if (toolType === 'mcp' && !mcpConfiguration) {
      res.status(400).json({
        error: 'Validation error',
        message: 'MCP configuration is required for MCP tools'
      });
      return;
    }

    if (mcpConfiguration) {
      if (!mcpConfiguration.serverUrl || !mcpConfiguration.protocol) {
        res.status(400).json({
          error: 'Validation error',
          message: 'MCP configuration must include serverUrl and protocol'
        });
        return;
      }
    }

    // Validate resource constraints if provided
    if (resourceConstraints) {
      const constraints = resourceConstraints;
      if (constraints.maxMemoryMB && constraints.maxMemoryMB <= 0) {
        res.status(400).json({
          error: 'Validation error',
          message: 'Memory constraint must be positive'
        });
        return;
      }
    }

    // Determine granted permissions based on tool capabilities and policies
    const grantedPermissions = validatePermissions(toolId, requestedPermissions);
    
    if (grantedPermissions.length === 0) {
      res.status(403).json({
        error: 'Access denied',
        message: 'No permissions can be granted for this tool'
      });
      return;
    }

    // Generate access token and create access record
    const accessToken = generateAccessToken();
    const now = Date.now().toString();
    const expiresAt = (Date.now() + (duration * 1000)).toString();

    const newAccess: ToolAccess = {
      accessToken,
      agentId,
      toolId,
      toolType: toolType || 'internal',
      grantedPermissions,
      requestedPermissions,
      justification,
      duration,
      expiresAt,
      status: 'granted',
      createdAt: now,
      ...(mcpConfiguration && { mcpConfiguration }),
      ...(autoRevoke && { autoRevoke }),
      usageTracking: {
        ...(autoRevoke?.maxUsageCount && { maxUsageCount: autoRevoke.maxUsageCount }),
        currentUsageCount: 0
      },
      ...(delegation && { 
        delegation,
        isDelegated: true 
      }),
      ...(resourceConstraints && { 
        resourceConstraints,
        monitoring: {
          resourceTracking: true,
          alertThresholds: {
            memoryPercent: 85,
            cpuPercent: 80,
            diskPercent: 90,
            networkPercent: 85
          },
          currentUsage: {
            memoryMB: 0,
            cpuPercent: 0,
            diskUsageMB: 0,
            networkMbps: 0
          }
        }
      }),
      ...(metadata && { metadata })
    };

    toolAccess.set(accessToken, newAccess);
    res.status(201).json(newAccess);
  } catch (error) {
    console.error('Error creating tool access:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create tool access'
    });
  }
});

/**
 * GET /tools/access
 * List tool access tokens with optional filtering
 */
router.get('/tools/access', async (req: Request, res: Response) => {
  try {
    const { agentId, toolId, status, limit } = req.query;
    let accessList = Array.from(toolAccess.values());

    // Filter by agent ID if specified
    if (agentId && typeof agentId === 'string') {
      accessList = accessList.filter(access => access.agentId === agentId);
    }

    // Filter by tool ID if specified
    if (toolId && typeof toolId === 'string') {
      accessList = accessList.filter(access => access.toolId === toolId);
    }

    // Filter by status if specified
    if (status && typeof status === 'string') {
      accessList = accessList.filter(access => access.status === status);
    }

    // Check for expired tokens and update status
    const now = Date.now();
    accessList.forEach(access => {
      if (access.status === 'granted' && parseInt(access.expiresAt) < now) {
        access.status = 'expired';
        toolAccess.set(access.accessToken, access);
      }
    });

    // Limit results if specified
    if (limit && typeof limit === 'string') {
      const limitNumber = parseInt(limit, 10);
      if (!isNaN(limitNumber) && limitNumber > 0) {
        accessList = accessList.slice(0, limitNumber);
      }
    }

    // Sort by creation time descending
    accessList.sort((a, b) => parseInt(b.createdAt) - parseInt(a.createdAt));

    res.json(accessList);
  } catch (error) {
    console.error('Error listing tool access:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve tool access list'
    });
  }
});

/**
 * GET /tools/access/:accessToken
 * Get specific tool access details
 */
router.get('/tools/access/:accessToken', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.params;

    if (!accessToken || typeof accessToken !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Access token is required'
      });
      return;
    }

    const access = toolAccess.get(accessToken);
    if (!access) {
      res.status(404).json({
        error: 'Not found',
        message: 'Access token not found'
      });
      return;
    }

    // Check if token is expired and update status
    const now = Date.now();
    if (access.status === 'granted' && parseInt(access.expiresAt) < now) {
      access.status = 'expired';
      toolAccess.set(accessToken, access);
    }

    res.json(access);
  } catch (error) {
    console.error('Error getting tool access:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve tool access'
    });
  }
});

/**
 * PUT /tools/access/:accessToken/revoke
 * Revoke tool access
 */
router.put('/tools/access/:accessToken/revoke', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.params;
    const { reason } = req.body;

    if (!accessToken || typeof accessToken !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Access token is required'
      });
      return;
    }

    const access = toolAccess.get(accessToken);
    if (!access) {
      res.status(404).json({
        error: 'Not found',
        message: 'Access token not found'
      });
      return;
    }

    if (access.status !== 'granted') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Can only revoke granted access tokens'
      });
      return;
    }

    access.status = 'revoked';
    access.metadata = {
      ...access.metadata,
      revocationReason: reason || 'Manual revocation',
      revokedAt: Date.now().toString()
    };

    toolAccess.set(accessToken, access);
    res.json(access);
  } catch (error) {
    console.error('Error revoking tool access:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to revoke tool access'
    });
  }
});

/**
 * POST /tools/access/:accessToken/usage
 * Record tool usage
 */
router.post('/tools/access/:accessToken/usage', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.params;
    const { operation, result, details } = req.body;

    if (!accessToken || typeof accessToken !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Access token is required'
      });
      return;
    }

    const access = toolAccess.get(accessToken);
    if (!access) {
      res.status(404).json({
        error: 'Not found',
        message: 'Access token not found'
      });
      return;
    }

    if (access.status !== 'granted') {
      res.status(403).json({
        error: 'Access denied',
        message: 'Access token is not active'
      });
      return;
    }

    // Check if token is expired
    const now = Date.now();
    if (parseInt(access.expiresAt) < now) {
      access.status = 'expired';
      toolAccess.set(accessToken, access);
      res.status(403).json({
        error: 'Access denied',
        message: 'Access token has expired'
      });
      return;
    }

    // Update usage tracking
    if (access.usageTracking) {
      access.usageTracking.currentUsageCount += 1;
      access.usageTracking.lastUsageDetails = {
        timestamp: now.toString(),
        operation: operation || 'unknown',
        result: result || 'success'
      };

      // Check usage limits
      if (access.usageTracking.maxUsageCount && 
          access.usageTracking.currentUsageCount >= access.usageTracking.maxUsageCount) {
        access.status = 'revoked';
        access.metadata = {
          ...access.metadata,
          revocationReason: 'Usage limit exceeded',
          revokedAt: now.toString()
        };
      }
    }

    access.lastUsedAt = now.toString();
    
    // Update resource usage if monitoring is enabled
    if (access.monitoring && details?.resourceUsage) {
      access.monitoring.currentUsage = {
        ...access.monitoring.currentUsage,
        ...details.resourceUsage
      };
    }

    toolAccess.set(accessToken, access);

    const usageRecord = {
      accessToken,
      operation: operation || 'unknown',
      result: result || 'success',
      timestamp: now.toString(),
      remainingUsage: access.usageTracking?.maxUsageCount ? 
        access.usageTracking.maxUsageCount - access.usageTracking.currentUsageCount : undefined
    };

    res.json(usageRecord);
  } catch (error) {
    console.error('Error recording tool usage:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to record tool usage'
    });
  }
});

/**
 * DELETE /tools/access/:accessToken
 * Delete tool access record
 */
router.delete('/tools/access/:accessToken', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.params;

    if (!accessToken || typeof accessToken !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Access token is required'
      });
      return;
    }

    const access = toolAccess.get(accessToken);
    if (!access) {
      res.status(404).json({
        error: 'Not found',
        message: 'Access token not found'
      });
      return;
    }

    // Only allow deletion of revoked or expired tokens
    if (access.status === 'granted') {
      res.status(409).json({
        error: 'Conflict',
        message: 'Cannot delete active access token. Please revoke first.'
      });
      return;
    }

    toolAccess.delete(accessToken);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting tool access:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete tool access'
    });
  }
});

export default router;
