import { AgentId, ScenarioId, UserId } from './Types';

/**
 * Coordinator - First-class entity for orchestrating multi-agent collaboration
 * 
 * A Coordinator is a specialized agent that manages scenario execution,
 * coordinates between participant agents, and publishes final results.
 */
export interface Coordinator {
  id: AgentId;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'coordinating';
  
  // LLM Configuration for coordination decisions
  llmConfig: {
    provider: 'ollama' | 'openai';
    model: string;
    systemPrompt: string;
    temperature?: number;
  };
  
  // MCP Server tools for result publication
  mcpTools: string[];
  toolPermissions: {
    [toolName: string]: {
      operations: ('read' | 'write' | 'execute')[];
      quotas?: {
        maxRequestsPerMinute?: number;
        maxRequestsPerHour?: number;
      };
    };
  };
  
  // Coordination capabilities
  coordination: {
    maxParticipants: number;
    maxConcurrentScenarios: number;
    supportedScenarioTypes: string[];
    coordinationStyle: 'directive' | 'consultative' | 'collaborative';
    decisionMaking: 'autonomous' | 'consensus-seeking' | 'majority-rule';
  };
  
  // Current assignments
  activeScenarios: ScenarioId[];
  currentParticipants: AgentId[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: UserId;
  lastModifiedBy: UserId;
}

/**
 * Coordination Session - Tracks a single coordination instance
 */
export interface CoordinationSession {
  id: string;
  coordinatorId: AgentId;
  scenarioId: ScenarioId;
  participants: AgentId[];
  
  status: 'initializing' | 'coordinating' | 'waiting_responses' | 'synthesizing' | 'completed' | 'failed';
  
  // Coordination flow
  scenarioPrompt: string;
  participantTasks: {
    agentId: AgentId;
    task: string;
    status: 'assigned' | 'in_progress' | 'completed' | 'failed';
    result?: string;
    error?: string;
    assignedAt: string;
    completedAt?: string;
  }[];
  
  // Final coordination result
  finalResult?: {
    summary: string;
    participantContributions: {
      agentId: AgentId;
      contribution: string;
      weight: number;
    }[];
    coordinatorAnalysis: string;
    recommendations: string[];
    integratedContent?: string; // The final synthesized/integrated content
    publishedTo: string[]; // MCP server tools used for publication
  };
  
  // Timing
  startedAt: string;
  completedAt?: string;
  timeoutAt: string;
}

/**
 * Coordination Request - Input for starting coordination
 */
export interface CoordinationRequest {
  coordinatorId: AgentId;
  scenarioPrompt: string;
  participantIds: AgentId[];
  timeoutMinutes?: number;
  coordinationStyle?: 'directive' | 'consultative' | 'collaborative';
  publishTo?: string[]; // MCP tools to publish results to
}

/**
 * Coordination Result - Output of coordination process
 */
export interface CoordinationResult {
  sessionId: string;
  status: 'completed' | 'failed' | 'timeout';
  finalResult?: CoordinationSession['finalResult'];
  error?: string;
  executionTime: number;
}