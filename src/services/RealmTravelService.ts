import { AgentService } from './AgentService';
import { RealmService } from './RealmService';

/**
 * RealmTravelService - Generic multi-agent realm travel and interaction system
 * Completely agnostic to specific realm names or concepts
 */

export interface TravelResult {
  success: boolean;
  previousRealmId?: string | undefined;
  currentRealmId: string;
  availableElementals: ElementalInfo[];
  error?: string;
  timestamp: string;
}

export interface ElementalInfo {
  elementalId: string;
  name: string;
  type: string;
  capabilities: string[];
  mcpToolsAvailable: boolean;
  isActive: boolean;
}

export interface AgentInteractionRequest {
  fromAgentId: string;
  toAgentId: string;
  message: string;
  taskType?: string;
  expectedResponseFormat?: 'text' | 'structured' | 'mcp_tool_result';
  collaborationContext?: {
    sessionId?: string;
    realmContext: string;
    sharedWorkspace?: string;
  };
}

export interface AgentInteractionResponse {
  success: boolean;
  fromAgentId: string;
  response: string;
  mcpToolResults?: any[];
  metadata: {
    responseTime: number;
    tokensUsed?: number | undefined;
    realmContext: string;
    timestamp: string;
  };
  error?: string;
}

/**
 * RealmTravelService - Manages agent travel and realm-based interactions
 */
export class RealmTravelService {
  private agentService: AgentService;
  private realmService: RealmService;

  constructor(agentService: AgentService, realmService: RealmService) {
    this.agentService = agentService;
    this.realmService = realmService;
  }

  /**
   * Validate if agent can travel to target realm based on profile configuration
   */
  async canTravelToRealm(agentId: string, targetRealmId: string): Promise<boolean> {
    try {
      const agent = await this.agentService.getAgent(agentId);
      
      // Check if agent has realm access configuration
      if (!agent.realmAccess || !agent.realmAccess.accessibleRealms) {
        return false;
      }

      // Check if agent has travel permissions - if allowRealmTravel is missing, allow travel for existing accessible realms
      const hasPermission = agent.realmAccess.allowRealmTravel !== false && agent.realmAccess.accessibleRealms.length > 0;
      if (!hasPermission) {
        return false;
      }

      // Check if realm is in agent's accessible realms list
      // Handle both string array and object array formats
      const hasAccess = agent.realmAccess.accessibleRealms.some(
        (access: any) => {
          if (typeof access === 'string') {
            return access === targetRealmId;
          } else {
            return access.realmId === targetRealmId;
          }
        }
      );

      return hasAccess;
    } catch (error) {
      console.error('Error validating realm travel permissions:', error);
      return false;
    }
  }

  /**
   * Travel to target realm (update agent's current realm)
   */
  async travelToRealm(agentId: string, targetRealmId: string): Promise<TravelResult> {
    try {
      // Validate travel permissions
      const canTravel = await this.canTravelToRealm(agentId, targetRealmId);
      if (!canTravel) {
        return {
          success: false,
          currentRealmId: await this.getCurrentRealm(agentId) || 'unknown',
          availableElementals: [],
          error: 'Agent does not have permission to travel to this realm',
          timestamp: new Date().toISOString()
        };
      }

      const agent = await this.agentService.getAgent(agentId);
      const previousRealmId = agent.realmAccess?.currentRealmId;

      // Update agent's current realm - ensure proper data structure
      const currentRealmAccess = agent.realmAccess || {};
      
      // Convert accessibleRealms to proper format if it's still in old format
      let accessibleRealms: any[] = (currentRealmAccess as any).accessibleRealms || [];
      if (accessibleRealms.length > 0 && typeof accessibleRealms[0] === 'string') {
        // Convert from old string array format to new object array format
        accessibleRealms = accessibleRealms.map((realmId: string) => ({
          realmId,
          permissions: ['read', 'write', 'execute'],
          grantedAt: new Date().toISOString(),
          grantedBy: 'system'
        }));
      }

      await this.agentService.updateAgent(agentId, {
        realmAccess: {
          ...currentRealmAccess,
          accessibleRealms,
          currentRealmId: targetRealmId
        }
      });

      // Update realm occupancy
      if (previousRealmId && previousRealmId !== targetRealmId) {
        await this.updateRealmOccupancy(previousRealmId, agentId, 'leave');
      }
      await this.updateRealmOccupancy(targetRealmId, agentId, 'enter');

      // Get available elementals in target realm
      const availableElementals = await this.getElementalsInRealm(targetRealmId);

      return {
        success: true,
        previousRealmId: previousRealmId || undefined,
        currentRealmId: targetRealmId,
        availableElementals,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error during realm travel:', error);
      return {
        success: false,
        currentRealmId: await this.getCurrentRealm(agentId) || 'unknown',
        availableElementals: [],
        error: error instanceof Error ? error.message : 'Unknown travel error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get agent's current realm
   */
  async getCurrentRealm(agentId: string): Promise<string | null> {
    try {
      const agent = await this.agentService.getAgent(agentId);
      return agent.realmAccess?.currentRealmId || null;
    } catch (error) {
      console.error('Error getting current realm:', error);
      return null;
    }
  }

  /**
   * Find all elementals bound to a specific realm
   */
  async getElementalsInRealm(realmId: string): Promise<ElementalInfo[]> {
    try {
      const allAgents = await this.agentService.listAgents();
      
      const elementals = allAgents
        .filter((agent: any) => 
          agent.type === 'elemental' && 
          agent.realmAccess?.boundRealmId === realmId &&
          agent.status === 'active'
        )
        .map((elemental: any) => ({
          elementalId: elemental.id,
          name: elemental.name,
          type: elemental.type,
          capabilities: elemental.capabilities || [],
          mcpToolsAvailable: (elemental.mcpTools?.length || 0) > 0,
          isActive: elemental.status === 'active'
        }));

      return elementals;
    } catch (error) {
      console.error('Error getting elementals in realm:', error);
      return [];
    }
  }

  /**
   * Send message/task to another agent (elemental collaboration)
   */
  async interactWithAgent(request: AgentInteractionRequest): Promise<AgentInteractionResponse> {
    try {
      // Validate both agents are in same realm or have interaction permissions
      const fromRealm = await this.getCurrentRealm(request.fromAgentId);
      const toAgent = await this.agentService.getAgent(request.toAgentId);
      
      // For elemental interactions, validate realm proximity
      if (toAgent.type === 'elemental') {
        const elementalRealm = toAgent.realmAccess?.boundRealmId;
        if (fromRealm !== elementalRealm) {
          return {
            success: false,
            fromAgentId: request.fromAgentId,
            response: '',
            metadata: {
              responseTime: 0,
              realmContext: fromRealm || 'unknown',
              timestamp: new Date().toISOString()
            },
            error: 'Cannot interact with elemental outside of their bound realm'
          };
        }
      }

      const startTime = Date.now();

      // Execute the interaction through AgentService
      const result = await this.agentService.executeAgentPrompt(request.toAgentId, {
        prompt: request.message,
        collaborationContext: {
          scenarioName: request.taskType || 'Agent Collaboration',
          scenarioType: 'realm_interaction',
          agentRole: 'participant',
          usePersonaPrompt: true
        }
      });

      return {
        success: true,
        fromAgentId: request.fromAgentId,
        response: result.response,
        metadata: {
          responseTime: Date.now() - startTime,
          tokensUsed: result.usage?.totalTokens || undefined,
          realmContext: fromRealm || 'unknown',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error in agent interaction:', error);
      return {
        success: false,
        fromAgentId: request.fromAgentId,
        response: '',
        metadata: {
          responseTime: 0,
          realmContext: await this.getCurrentRealm(request.fromAgentId) || 'unknown',
          timestamp: new Date().toISOString()
        },
        error: error instanceof Error ? error.message : 'Unknown interaction error'
      };
    }
  }

  /**
   * Update realm occupancy tracking
   */
  private async updateRealmOccupancy(realmId: string, agentId: string, action: 'enter' | 'leave'): Promise<void> {
    try {
      // Get realm and update its agent list
      const realm = await this.realmService.getRealm(realmId);
      if (realm) {
        console.log(`🌍 Agent ${agentId} ${action}ed realm ${realmId}`);
        // Additional realm occupancy logic could be added here
      }
    } catch (error) {
      console.error('Error updating realm occupancy:', error);
    }
  }

  /**
   * Get all agents currently in a realm
   */
  async getAgentsInRealm(realmId: string): Promise<string[]> {
    try {
      const allAgents = await this.agentService.listAgents();
      
      return allAgents
        .filter((agent: any) => agent.realmAccess?.currentRealmId === realmId)
        .map((agent: any) => agent.id);
    } catch (error) {
      console.error('Error getting agents in realm:', error);
      return [];
    }
  }
}