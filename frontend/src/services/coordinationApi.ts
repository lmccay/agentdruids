import axios from 'axios';

// Types for our new coordination system
export interface CoordinationSession {
  id: string;
  coordinatorId: string;
  scenarioPrompt: string;
  participantIds: string[];
  status: 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  timeoutMinutes: number;
  coordinationStyle: 'collaborative' | 'consultative' | 'directive';
  participantTasks: ParticipantTask[];
  finalResult?: CoordinationResult;
}

export interface ParticipantTask {
  participantId: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  result?: string;
}

export interface CoordinationResult {
  summary: string;
  recommendations: string[];
  integratedContent?: string;
  publishedContentId?: string;
}

export interface CoordinationRequest {
  coordinatorId: string;
  scenarioPrompt: string;
  participantIds: string[];
  timeoutMinutes?: number;
  coordinationStyle?: 'collaborative' | 'consultative' | 'directive';
}

export interface ConcurrencyMetrics {
  totalActiveSessions: number;
  sessionsByCoordinator: { [coordinatorId: string]: number };
  maxConcurrentScenarios: number;
  activeSessions: Array<{
    sessionId: string;
    coordinatorId: string;
    participantCount: number;
    startTime: string;
    lastActivity: string;
  }>;
}

export interface PublishedContent {
  id: string;
  sessionId: string;
  title: string;
  content: string;
  contentType: 'text' | 'markdown' | 'json';
  createdAt: string;
  tags?: string[];
}

// MCP-based coordination API
class MCPCoordinationAPI {
  private baseURL = 'http://localhost:3003/mcp';
  private sessionId: string | null = null;

  private async initializeSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'druids-ui',
            version: '1.0.0'
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize MCP session: ${response.statusText}`);
    }

    // Extract session ID from header
    const sessionId = response.headers.get('Mcp-Session-Id');
    if (!sessionId) {
      throw new Error('No MCP session ID returned');
    }

    this.sessionId = sessionId;
    return sessionId;
  }

  private async mcpCall(method: string, params: any): Promise<any> {
    const sessionId = await this.initializeSession();

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: method,
          arguments: params
        },
        id: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`MCP call failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`MCP error: ${result.error.message}`);
    }

    // Parse the response content
    if (result.result?.content?.[0]?.text) {
      try {
        return JSON.parse(result.result.content[0].text);
      } catch {
        return result.result.content[0].text;
      }
    }

    return result.result;
  }

  async startCoordination(request: CoordinationRequest): Promise<string> {
    const result = await this.mcpCall('start_orchestrated_coordination', {
      coordinator_id: request.coordinatorId,
      participant_ids: request.participantIds,
      scenario_prompt: request.scenarioPrompt,
      timeout_minutes: request.timeoutMinutes || 30,
      coordination_style: request.coordinationStyle || 'collaborative'
    });

    return result.session_id;
  }

  async getSessionStatus(sessionId: string): Promise<CoordinationSession | null> {
    try {
      const result = await this.mcpCall('get_coordination_status', {
        session_id: sessionId
      });
      return result;
    } catch (error) {
      console.error('Failed to get session status:', error);
      return null;
    }
  }

  async getActiveSessions(): Promise<CoordinationSession[]> {
    try {
      const result = await this.mcpCall('list_active_sessions', {});
      return result.sessions || [];
    } catch (error) {
      console.error('Failed to get active sessions:', error);
      return [];
    }
  }

  async getConcurrencyMetrics(): Promise<ConcurrencyMetrics> {
    try {
      const result = await this.mcpCall('get_coordinator_metrics', {
        coordinator_id: 'built-in-coordinator'
      });
      return result;
    } catch (error) {
      console.error('Failed to get concurrency metrics:', error);
      return {
        totalActiveSessions: 0,
        sessionsByCoordinator: {},
        maxConcurrentScenarios: 10,
        activeSessions: []
      };
    }
  }

  async getPublishedContent(sessionId: string): Promise<PublishedContent[]> {
    try {
      const result = await this.mcpCall('get_session_content', {
        session_id: sessionId
      });
      return result.content || [];
    } catch (error) {
      console.error('Failed to get published content:', error);
      return [];
    }
  }

  async getContentDetails(contentId: string): Promise<PublishedContent | null> {
    try {
      const result = await this.mcpCall('get_content_details', {
        content_id: contentId
      });
      return result;
    } catch (error) {
      console.error('Failed to get content details:', error);
      return null;
    }
  }
}

export const mcpCoordinationApi = new MCPCoordinationAPI();