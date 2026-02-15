import axios from 'axios';

// Types
export interface Agent {
  id: string;
  name: string;
  type: 'druid' | 'elemental' | 'gaia' | 'worldtree';
  status: 'active' | 'inactive' | 'error';
  description: string;
  capabilities: string[];
  specialization: {
    domain: string;
    expertise: string[];
    knowledgeNamespaces: string[];
    maxConcurrentTasks: number;
  };
  personality: {
    traits: string[];
    communicationStyle: string;
    decisionMaking: string;
  };
  llmConfig?: {
    provider: string;
    model: string;
    modelConfigId?: string; // Reference to named model configuration
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    agenticLoop?: {
      enabled: boolean;
      maxIterations?: number;
      trackCosts?: boolean;
    };
  };
  systemPrompt?: string;
  realmId?: string; // Deprecated - kept for backward compatibility
  realmAccess?: {
    boundRealmId?: string; // For Elementals
    accessibleRealms?: string[]; // For Druids - simplified to just realm IDs
  };
  mcpTools?: string[]; // MCP tool patterns with wildcard support (e.g., "github:*", "github:list_*")
  promptConfig?: {
    baseTemplate: 'standard' | 'minimal';
    agentExtension?: string;
    disableRealmPrompt?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  tags: string[];
  provider: string;
  model: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface CreateAgentRequest {
  name: string;
  type: 'druid' | 'elemental' | 'gaia' | 'worldtree';
  description: string;
  domain?: string;
  systemPrompt?: string;
  realmId?: string; // Deprecated - use realmAccess instead
  realmAccess?: {
    boundRealmId?: string; // For Elementals
    accessibleRealms?: string[]; // For Druids
  };
  capabilities?: string[];
  expertise?: string[];
  knowledgeNamespaces?: string[];
  maxConcurrentTasks?: number;
  personalityTraits?: string[];
  communicationStyle?: string;
  decisionMaking?: string;
  modelId?: string; // Named model configuration ID
  mcpTools?: string[]; // MCP tool patterns with wildcard support
  agenticLoop?: {
    enabled: boolean;
    maxIterations?: number;
    trackCosts?: boolean;
  };
  promptConfig?: {
    baseTemplate: 'standard' | 'minimal';
    agentExtension?: string;
    disableRealmPrompt?: boolean;
  };
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  capabilities?: string[];
  specialization?: Partial<{
    domain: string;
    expertise: string[];
    knowledgeNamespaces: string[];
    maxConcurrentTasks: number;
  }>;
  personality?: Partial<{
    traits: string[];
    communicationStyle: string;
    decisionMaking: string;
  }>;
  llmConfig?: Partial<{
    systemPrompt: string;
    modelConfigId: string; // Add support for model configuration updates
    agenticLoop: {
      enabled: boolean;
      maxIterations?: number;
      trackCosts?: boolean;
    };
  }>;
  type?: 'druid' | 'elemental' | 'gaia' | 'worldtree';
  realmId?: string; // Deprecated - kept for backward compatibility
  realmAccess?: {
    boundRealmId?: string;
    accessibleRealms?: string[];
  };
  modelId?: string; // Named model configuration ID
  mcpTools?: string[]; // MCP tool patterns with wildcard support
  promptConfig?: {
    baseTemplate: 'standard' | 'minimal';
    agentExtension?: string;
    disableRealmPrompt?: boolean;
  };
}

export interface CreateRealmRequest {
  name: string;
  description: string;
  type: 'development' | 'testing' | 'staging' | 'production' | 'monitoring';
  configuration: {
    maxAgents: number;
    allowExternalAccess: boolean;
    leyLineEndpoint?: string;
  };
}

export interface Realm {
  id: string;
  name: string;
  description: string;
  type: 'development' | 'testing' | 'staging' | 'production' | 'monitoring';
  status: 'active' | 'inactive' | 'suspended' | 'maintenance' | 'error';
  configuration: {
    maxAgents: number;
    allowExternalAccess: boolean;
    leyLineEndpoint?: string;
  };
  agents?: Agent[];
  agentIds?: string[];
  agentCount: number;
  mcpServers?: string[]; // Array of MCP server IDs available to this realm
  createdAt?: string;
  updatedAt?: string;
}

export interface Coordinator {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  coordinationStyle: string;
  maxParticipants: number;
  activeScenarios?: number;
  totalExecutions?: number;
  lastUsed?: string;
  createdAt: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  type: 'collaboration' | 'competition' | 'self-play' | 'benchmark';
  status: 'draft' | 'active' | 'running' | 'completed' | 'failed';
  executionCount: number;
  successCount: number;
  tags: string[];
  createdAt: string;
}

export interface ScenarioExecution {
  id: string;
  scenario: string;
  status: 'running' | 'completed' | 'failed';
  results?: any;
  error?: string;
  startTime: string;
  endTime?: string;
}

export interface ModelConfiguration {
  id: string;
  name: string;
  description: string;
  provider: 'ollama' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPromptPrefix?: string;
  tags: string[];
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CreateModelRequest {
  id: string;
  name: string;
  description: string;
  provider: 'ollama' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPromptPrefix?: string;
  tags: string[];
  isDefault?: boolean;
  isActive?: boolean;
}

// Base API configuration
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  },
});

// API Services using direct REST endpoints
export const agentApi = {
  // List all agents
  async getAgents(): Promise<{ data: Agent[] }> {
    const response = await api.get('/agents');
    return { data: response.data };
  },

  // Get single agent
  async getAgent(id: string): Promise<{ data: Agent }> {
    const response = await api.get(`/agents/${id}`);
    return { data: response.data };
  },

  // Get available model configurations
  async getAvailableModels(): Promise<{ data: ModelOption[] }> {
    const response = await api.get('/models');
    // Return all models (both active and inactive) - users can choose any
    const allModels = response.data.data;
    const modelOptions: ModelOption[] = allModels.map((model: any) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      tags: model.tags || [],
      provider: model.provider,
      model: model.model, // Include the actual model name
      isDefault: model.isDefault || false,
      isActive: model.isActive || false
    }));
    return { data: modelOptions };
  },

  // Create agent using direct format
  async createAgent(data: CreateAgentRequest): Promise<{ data: Agent }> {
    const response = await api.post('/agents/create', data);
    return { data: response.data };
  },

  // Update agent
  async updateAgent(id: string, updates: UpdateAgentRequest): Promise<{ data: Agent }> {
    const response = await api.put(`/agents/${id}`, updates);
    return { data: response.data };
  },

  // Delete agent
  async deleteAgent(id: string): Promise<void> {
    await api.delete(`/agents/${id}`);
  },

  // Refresh agent cache from database (useful for concurrent users)
  async refreshCache(): Promise<void> {
    await api.post('/agents/refresh');
  },

  // Start/Stop agent (these might not exist in the current API, but we'll add placeholder implementations)
  async startAgent(id: string): Promise<{ data: Agent }> {
    const response = await api.put(`/agents/${id}`, { status: 'active' });
    return { data: response.data };
  },

  async stopAgent(id: string): Promise<{ data: Agent }> {
    const response = await api.put(`/agents/${id}`, { status: 'inactive' });
    return { data: response.data };
  },

  // Execute agent prompt
  async executePrompt(id: string, prompt: string): Promise<{ data: { response: string } }> {
    // This would need to be implemented on the backend - for now mock it
    return { data: { response: `Mock response from agent ${id} for: ${prompt}` } };
  }
};

export const realmApi = {
  async getRealms(): Promise<{ data: Realm[] }> {
    const response = await api.get('/realms');
    return response.data; // API already returns { data: [...] }
  },

  async getRealm(id: string): Promise<{ data: Realm }> {
    const response = await api.get(`/realms/${id}`);
    return { data: response.data }; // Single realm, not wrapped by backend
  },

  async createRealm(realm: CreateRealmRequest): Promise<{ data: Realm }> {
    const response = await api.post('/realms', realm);
    return { data: response.data }; // Single realm, not wrapped by backend
  },

  async updateRealm(id: string, updates: Partial<Realm>): Promise<{ data: Realm }> {
    const response = await api.put(`/realms/${id}`, updates);
    return { data: response.data }; // Single realm, not wrapped by backend
  },

  async deleteRealm(id: string): Promise<void> {
    await api.delete(`/realms/${id}`);
  },

  // Refresh realm cache from database (useful for concurrent users)
  async refreshCache(): Promise<void> {
    await api.post('/realms/refresh');
  },

  // Agent-Realm Association Methods
  async getRealmAgents(realmId: string): Promise<{ data: { realmId: string; agentIds: string[]; agentCount: number } }> {
    const response = await api.get(`/realms/${realmId}/agents`);
    return response.data;
  },

  async addAgentToRealm(realmId: string, agentId: string, permissions: string[] = ['read', 'execute']): Promise<{ data: any }> {
    const response = await api.post(`/realms/${realmId}/agents`, { agentId, permissions });
    return { data: response.data };
  },

  async removeAgentFromRealm(realmId: string, agentId: string): Promise<void> {
    await api.delete(`/realms/${realmId}/agents/${agentId}`);
  },

  // MCP Server Methods
  async getMCPServers(realmId: string): Promise<{ realmId: string; mcpServers: string[]; count: number }> {
    const response = await api.get(`/realms/${realmId}/mcp-servers`);
    return response.data;
  },

  async updateMCPServers(realmId: string, serverIds: string[]): Promise<{ message: string; realmId: string; mcpServers: string[] }> {
    const response = await api.put(`/realms/${realmId}/mcp-servers`, { serverIds });
    return response.data;
  },

  async addMCPServer(realmId: string, serverId: string): Promise<{ message: string; realmId: string; serverId: string }> {
    const response = await api.post(`/realms/${realmId}/mcp-servers`, { serverId });
    return response.data;
  },

  async removeMCPServer(realmId: string, serverId: string): Promise<{ message: string; realmId: string; serverId: string }> {
    const response = await api.delete(`/realms/${realmId}/mcp-servers/${serverId}`);
    return response.data;
  }
};

export const coordinatorApi = {
  async getCoordinators(): Promise<{ data: Coordinator[] }> {
    const response = await api.get('/coordinators');
    return { data: response.data };
  },

  async createCoordinator(coordinator: { 
    name: string; 
    description: string; 
    coordinationStyle?: string;
    maxParticipants?: number;
    llmModel?: string;
    systemPrompt?: string;
  }): Promise<{ data: Coordinator }> {
    const response = await api.post('/coordinators', coordinator);
    return { data: response.data };
  },

  async getCoordinator(id: string): Promise<{ data: Coordinator }> {
    const response = await api.get(`/coordinators/${id}`);
    return { data: response.data };
  },

  async updateCoordinator(id: string, updates: Partial<Coordinator>): Promise<{ data: Coordinator }> {
    const response = await api.put(`/coordinators/${id}`, updates);
    return { data: response.data };
  },

  async deleteCoordinator(id: string): Promise<void> {
    await api.delete(`/coordinators/${id}`);
  }
};

export const scenarioApi = {
  async getScenarios(): Promise<{ data: Scenario[] }> {
    const response = await api.get('/scenarios');
    return { data: response.data };
  },

  async createScenario(scenario: {
    name: string;
    description: string;
    type?: string;
  }): Promise<{ data: Scenario }> {
    const response = await api.post('/scenarios', scenario);
    return { data: response.data };
  },

  async executeScenario(scenarioId: string): Promise<{ data: ScenarioExecution }> {
    const response = await api.post(`/scenarios/${scenarioId}/execute`);
    return { data: response.data };
  },

  async getExecutionStatus(executionId: string): Promise<{ data: ScenarioExecution }> {
    const response = await api.get(`/executions/${executionId}`);
    return { data: response.data };
  }
};

export const contentApi = {
  async getPublishedContent(sessionId: string): Promise<{ data: any }> {
    // This would need to be implemented as a REST endpoint - for now mock it
    return { 
      data: { 
        sessionId, 
        content: `Mock published content for session ${sessionId}`,
        timestamp: new Date().toISOString()
      } 
    };
  },

  async listPublishedContent(): Promise<{ data: any[] }> {
    // This would need to be implemented as a REST endpoint - for now mock it
    return {
      data: [
        {
          id: 'content-1',
          title: 'Multi-Agent Analysis Report',
          type: 'report',
          sessionId: 'session-123',
          createdAt: new Date().toISOString()
        }
      ]
    };
  }
};

export const systemApi = {
  async getSystemStats(): Promise<{ data: any }> {
    const response = await api.get('/system/stats');
    return { data: response.data };
  },

  async getRecentActivity(): Promise<{ data: any[] }> {
    const response = await api.get('/system/activity');
    return { data: response.data };
  },

  async getSystemHealth(): Promise<{ data: any }> {
    const response = await api.get('/system/health');
    return { data: response.data };
  }
};

export const modelApi = {
  async getModels(): Promise<{ data: ModelConfiguration[] }> {
    const response = await api.get('/models');
    return response.data; // Backend already returns { data: ModelConfiguration[] }
  },

  async getActiveModels(): Promise<{ data: ModelConfiguration[] }> {
    const response = await api.get('/models/active');
    return response.data; // Backend already returns { data: ModelConfiguration[] }
  },

  async getModel(id: string): Promise<{ data: ModelConfiguration }> {
    const response = await api.get(`/models/${id}`);
    return response.data; // Backend already returns { data: ModelConfiguration }
  },

  async createModel(model: CreateModelRequest): Promise<{ data: ModelConfiguration }> {
    const response = await api.post('/models', model);
    return response.data; // Backend already returns { data: ModelConfiguration }
  },

  async updateModel(id: string, updates: Partial<ModelConfiguration>): Promise<{ data: ModelConfiguration }> {
    const response = await api.put(`/models/${id}`, updates);
    return response.data; // Backend already returns { data: ModelConfiguration }
  },

  async deleteModel(id: string): Promise<void> {
    await api.delete(`/models/${id}`);
  },

  async toggleModelActive(id: string, active: boolean): Promise<{ data: ModelConfiguration }> {
    const response = await api.patch(`/models/${id}/active`, { active });
    return response.data; // Backend already returns { data: ModelConfiguration }
  }
};

// Error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);