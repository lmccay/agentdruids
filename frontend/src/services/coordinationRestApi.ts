import { apiConfig } from '../config/api-config';

// REST API-based coordination service
class CoordinationRestAPI {
  private baseURL = apiConfig.apiBaseURL;

  async getCoordinators() {
    const response = await fetch(`${this.baseURL}/coordinators`);
    if (!response.ok) {
      throw new Error(`Failed to get coordinators: ${response.statusText}`);
    }
    return response.json();
  }

  async getSystemStats() {
    const response = await fetch(`${this.baseURL}/system/stats`);
    if (!response.ok) {
      throw new Error(`Failed to get system stats: ${response.statusText}`);
    }
    return response.json();
  }

  async startCoordination(coordinatorId: string, params: {
    scenarioPrompt: string;
    participantIds: string[];
    timeoutMinutes?: number;
    coordinationStyle?: string;
    publishTo?: string;
  }) {
    const response = await fetch(`${this.baseURL}/coordinators/${coordinatorId}/coordinate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to start coordination: ${response.statusText}`);
    }

    return response.json();
  }

  // Natural language coordination that defaults to built-in coordinator
  async startNaturalCoordination(params: {
    scenarioPrompt: string;
    participantIds: string[];
    coordinatorId?: string; // Optional - defaults to built-in-coordinator
    timeoutMinutes?: number;
    coordinationStyle?: string;
    publishTo?: string;
    metadata?: any;
  }) {
    const response = await fetch(`${this.baseURL}/coordinators/coordinate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to start coordination: ${response.statusText}`);
    }

    return response.json();
  }

  async getCoordinationSession(sessionId: string) {
    const response = await fetch(`${this.baseURL}/coordinators/sessions/${sessionId}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Session not found
      }
      throw new Error(`Failed to get session: ${response.statusText}`);
    }
    return response.json();
  }

  // For compatibility, map the old MCP interface to REST calls
  async getActiveSessions() {
    try {
      const response = await fetch(`${this.baseURL}/coordinators/sessions`);
      if (!response.ok) {
        throw new Error(`Failed to get sessions: ${response.statusText}`);
      }
      const sessions = await response.json();
      return {
        sessions: sessions || [],
        count: sessions ? sessions.length : 0
      };
    } catch (error) {
      console.error('Failed to get active sessions:', error);
      return { sessions: [], count: 0 };
    }
  }

  async getConcurrencyMetrics() {
    try {
      const stats = await this.getSystemStats();
      return {
        totalSessions: stats.coordination?.sessions || 0,
        activeSessions: stats.coordination?.active || 0,
        maxConcurrent: 10, // TODO: Get from configuration
        coordinators: [
          {
            id: 'system-coordinator',
            activeSessions: stats.coordination?.active || 0,
            maxSessions: 5
          }
        ]
      };
    } catch (error) {
      console.error('Failed to get concurrency metrics:', error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        maxConcurrent: 10,
        coordinators: []
      };
    }
  }

  async getSessionContent(sessionId: string) {
    try {
      const session = await this.getCoordinationSession(sessionId);
      if (!session) {
        return null;
      }

      // Return session with content details
      return {
        sessionId,
        status: session.status,
        content: session.content || [],
        publishedContent: session.publishedContent || []
      };
    } catch (error) {
      console.error('Failed to get session content:', error);
      return null;
    }
  }

  async getContentDetails(contentPath: string) {
    try {
      // For published content, try to fetch it directly
      if (contentPath.startsWith('/data/published_content/') || contentPath.startsWith('data/published_content/')) {
        // This would require a new endpoint to serve published content
        // For now, return a placeholder
        return {
          path: contentPath,
          content: 'Content details not yet available via REST API',
          contentType: 'text'
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get content details:', error);
      return null;
    }
  }

  // Action methods for completed sessions
  async rerunExecution(sessionId: string) {
    const response = await fetch(`${this.baseURL}/coordinators/sessions/${sessionId}/rerun`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || `Failed to rerun session: ${response.statusText}`);
    }

    return response.json();
  }

  async deleteExecution(sessionId: string) {
    const response = await fetch(`${this.baseURL}/coordinators/sessions/${sessionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || `Failed to delete session: ${response.statusText}`);
    }

    // 204 No Content response won't have a body
    if (response.status === 204) {
      return { success: true };
    }

    return response.json();
  }

  async purgeExecutionResults(sessionId: string) {
    const response = await fetch(`${this.baseURL}/coordinators/sessions/${sessionId}/results`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || `Failed to purge session results: ${response.statusText}`);
    }

    return response.json();
  }
}

export default new CoordinationRestAPI();