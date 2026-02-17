import {
  AgentId,
  RealmId,
  AgentType,
  AgentStatus,
  Timestamp,
  BaseEntity,
  ResourceLimits,
  LLMProvider
} from './Types';
import { AgentPromptConfig } from './PromptConfig';

/**
 * Specialization profile defining an agent's domain expertise and capabilities
 */
export interface SpecializationProfile {
  domain: string;
  expertise: string[];
  knowledgeNamespaces: string[];
  maxConcurrentTasks: number;
  preferredTools?: string[];
  skillLevel?: 'novice' | 'intermediate' | 'expert' | 'master';
  certifications?: string[];
}

/**
 * Personality traits that influence agent behavior and communication
 */
export interface DruidPersona {
  traits: string[];
  communicationStyle: 'formal' | 'casual' | 'technical' | 'concise' | 'verbose';
  decisionMaking: 'analytical' | 'intuitive' | 'consensus-seeking' | 'independent' | 'rule-based' | 'optimization-focused';
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  collaborationPreference?: 'autonomous' | 'collaborative' | 'supportive' | 'directive';
  learningStyle?: 'experiential' | 'observational' | 'analytical' | 'social';
}

/**
 * LLM configuration for agent's language model interaction
 * Now supports both direct configuration and named model references
 */
export interface LLMConfiguration {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  contextWindow?: number;
  additionalParameters?: Record<string, any>;

  // Named model configuration support
  modelConfigId?: string; // Reference to a named model configuration

  // Agentic loop configuration for iterative tool usage
  agenticLoop?: {
    enabled: boolean;
    maxIterations?: number; // Default: 10
    stopOnNoTools?: boolean; // Default: true - stop when no tool calls are made
    trackCosts?: boolean; // Default: true - track total tokens/costs across iterations

    // Token optimization strategies
    contextStrategy?: 'full' | 'sliding-window' | 'summarized'; // Default: 'summarized'
    slidingWindowSize?: number; // Default: 5 - only keep last N messages
    maxToolResultTokens?: number; // Default: 1000 - truncate tool results
    summarizeToolResults?: boolean; // Default: true - use LLM to summarize large results
  };
}

/**
 * Tool permissions defining what operations an agent can perform with specific tools
 */
export interface ToolPermissions {
  [toolName: string]: {
    operations: string[];
    paths?: string[];
    domains?: string[];
    tables?: string[];
    quotas?: {
      maxFileSize?: string;
      maxFilesPerHour?: number;
      maxRequestsPerMinute?: number;
      maxBandwidthMB?: number;
      maxQueriesPerHour?: number;
    };
    restrictions?: string[];
  };
}

/**
 * Resource access configuration for file and URL operations
 * Agents must explicitly opt-in by configuring allowed locations
 */
export interface ResourceAccess {
  // Allowed file system paths (file:/// protocol)
  allowedFilePaths?: string[];  // e.g., "file:///app/data/file.txt", "file:///app/data/**/*"

  // Allowed HTTP/HTTPS URLs
  allowedUrls?: string[];  // e.g., "https://api.example.com/endpoint", "https://api.example.com/**"

  // Shorthand: combined array of all allowed locations
  allowedLocations?: string[];  // Supports file:///, http://, https:// with wildcards
}

/**
 * Realm access configuration for agents
 */
export interface RealmAccess {
  // For Elementals: single realm binding (required)
  boundRealmId?: RealmId;
  
  // For Druids: multiple realm permissions (can travel between realms)
  accessibleRealms: {
    realmId: RealmId;
    permissions: ('read' | 'write' | 'execute' | 'admin')[];
    grantedAt: Timestamp;
    grantedBy?: string;
  }[];
  
  // Current active realm (where the agent is currently operating)
  currentRealmId?: RealmId;
  
  // Access control settings
  allowRealmTravel?: boolean; // Only true for Druids
  maxConcurrentRealms?: number; // For Druids with multi-realm operations
}

/**
 * Agent binding defining relationships between agents
 */
export interface AgentBinding {
  id: string;
  targetAgentId: AgentId;
  type: 'dependency' | 'collaboration' | 'monitoring' | 'delegation';
  relationship: 'coordinates' | 'supervises' | 'delegates' | 'monitors' | 'assists';
  permissions: string[];
  constraints: {
    maxConcurrentInteractions?: number;
    timeoutMs?: number;
    priority?: 'low' | 'medium' | 'high';
  };
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Timestamp;
  lastUsed?: Timestamp;
}

/**
 * Agent deployment status and runtime information
 */
export interface AgentDeployment {
  realmId: RealmId;
  deployedAt: Timestamp;
  lastHeartbeat?: Timestamp;
  health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  resourceUsage: {
    memoryMB: number;
    cpuPercent: number;
    activeTasks: number;
    queuedTasks: number;
  };
  performance: {
    tasksCompleted: number;
    averageTaskTime: number;
    successRate: number;
    errorCount: number;
  };
  networkInfo?: {
    endpoint: string;
    protocol: string;
    port?: number;
  };
}

/**
 * Main Agent interface representing all types of agents in the system
 */
export interface Agent extends BaseEntity {
  id: AgentId;
  type: AgentType;
  name: string;
  description: string;
  status: AgentStatus;

  // Core capabilities and configuration
  capabilities: string[];
  specialization: SpecializationProfile;
  personality: DruidPersona;

  // Technical configuration
  mcpTools: string[];
  toolPermissions: ToolPermissions;
  resourceAccess?: ResourceAccess;  // File and URL access permissions
  llmConfig: LLMConfiguration;
  resourceLimits: ResourceLimits;

  // System Prompt Configuration (NEW - Phase 1)
  promptConfig?: AgentPromptConfig;

  // Deployment and runtime
  deployment?: AgentDeployment;
  bindings: AgentBinding[];

  // Realm access control
  realmAccess?: RealmAccess;

  // Metadata
  tags?: string[];
  metadata?: Record<string, any>;

  // Audit information
  createdBy?: string;
  lastModifiedBy?: string;
}

/**
 * Agent creation request interface
 */
export interface CreateAgentRequest {
  id?: AgentId;
  type: AgentType;
  name: string;
  description: string;
  capabilities: string[];
  specialization: SpecializationProfile;
  personality: DruidPersona;
  mcpTools: string[];
  toolPermissions: ToolPermissions;
  resourceAccess?: ResourceAccess;
  llmConfig: LLMConfiguration;
  resourceLimits?: ResourceLimits;
  realmAccess?: RealmAccess;
  promptConfig?: AgentPromptConfig;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Agent update request interface
 */
export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  type?: AgentType; // Add support for type updates
  status?: AgentStatus; // Add support for status updates
  capabilities?: string[];
  specialization?: Partial<SpecializationProfile>;
  personality?: Partial<DruidPersona>;
  mcpTools?: string[];
  toolPermissions?: ToolPermissions;
  resourceAccess?: ResourceAccess;
  llmConfig?: Partial<LLMConfiguration>;
  resourceLimits?: ResourceLimits;
  realmAccess?: Partial<RealmAccess>;
  promptConfig?: AgentPromptConfig;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Agent query filters for searching and listing agents
 */
export interface AgentQueryFilters {
  type?: AgentType | AgentType[];
  status?: AgentStatus | AgentStatus[];
  realmId?: RealmId;
  capabilities?: string[];
  domain?: string;
  tags?: string[];
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
  createdAfter?: Timestamp;
  createdBefore?: Timestamp;
}

/**
 * Agent summary for list views
 */
export interface AgentSummary {
  id: AgentId;
  type: AgentType;
  name: string;
  status: AgentStatus;
  realmId?: RealmId;
  domain: string;
  capabilities: string[];
  health?: 'healthy' | 'degraded' | 'unhealthy';
  lastActive?: Timestamp;
  tasksCompleted?: number;
  successRate?: number;
}

/**
 * Agent statistics for monitoring and analytics
 */
export interface AgentStatistics {
  agentId: AgentId;
  timeRange: {
    start: Timestamp;
    end: Timestamp;
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    averageExecutionTime: number;
  };
  resources: {
    averageMemoryMB: number;
    averageCpuPercent: number;
    peakMemoryMB: number;
    peakCpuPercent: number;
  };
  interactions: {
    messagesReceived: number;
    messagesSent: number;
    collaborations: number;
    knowledgeQueries: number;
    toolOperations: number;
  };
  availability: {
    uptimePercent: number;
    downtimeMinutes: number;
    maintenanceMinutes: number;
  };
}
