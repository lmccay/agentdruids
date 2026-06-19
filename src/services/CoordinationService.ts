import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { AgentService } from './AgentService';
import { RealmService } from './RealmService';
import { KnowledgeService } from './KnowledgeService';
import { OpenAIClient, OpenAIChatRequest, createDefaultOpenAIConfig } from './OpenAIClient';
import { OllamaClient, ChatRequest, createDefaultOllamaConfig } from './OllamaClient';
import { SessionAgentManagerImpl } from './SessionAgentManager';
import { SessionContentManagerImpl } from './SessionContentManager';
import { CoordinatorConcurrencyManagerImpl } from './CoordinatorConcurrencyManager';
import { getSessionPublicationService } from './SessionPublicationService';
import type {
  ContributionRecord,
  SessionRecord,
} from './publishing/types';

// Types for coordination
export type AgentId = string;

export interface Coordinator {
  id: string;
  name: string;
  description: string;
  capabilities: {
    maxConcurrentScenarios: number;
    supportedScenarioTypes: string[];
    coordinationStyle: 'collaborative' | 'consultative' | 'directive';
    decisionMaking: 'consensus-seeking' | 'decisive' | 'analytical';
  };
  status: 'active' | 'inactive' | 'busy';
  createdAt: Date;
  createdBy: string;
  llmConfig: {
    provider: 'openai';
    model: string;
    systemPrompt: string;
    temperature: number;
  };
}

// Types for coordination
export interface CoordinationRequest {
  coordinatorId: string;
  scenarioPrompt: string;
  participantIds: string[];
  timeoutMinutes: number;
  coordinationStyle: 'collaborative' | 'consultative' | 'directive';
  publishTo?: string[];
  // Typed publishing modes (catalogued in druids_core.publishing_modes). Defaults to ['report'].
  publishAs?: string[];
  // Caller-supplied per-request extras (e.g., workflowMode='diagram',
  // originalWorkflow for PlantUML workflows). Forwarded to the session's
  // metadata.
  metadata?: Record<string, any>;
}

export interface CoordinationSession {
  id: string;
  coordinatorId: string;
  scenarioPrompt: string;
  participantIds: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'timeout';
  startedAt: Date;
  completedAt?: Date;
  timeoutMinutes: number;
  coordinationStyle: 'collaborative' | 'consultative' | 'directive';
  participantTasks: ParticipantTask[];
  finalResult?: FinalCoordinationResult;
  error?: string;  // Error message if session failed
  metadata?: Record<string, any>;  // Additional session metadata (warnings, etc.)
  // Destinations to publish the final integrated content to. Persisted on the
  // session so that rerun and the simple-coordination fallback can both honor
  // the original request's publish intent.
  publishTo?: string[];

  // Typed publishing modes captured from the original request
  publishAs?: string[];

  // Realm context for the session (used in publication records)
  realmId?: string;

  // Session-scoped agent management for concurrency safety
  sessionAgentManager: SessionAgentManagerImpl;

  // Session-scoped content storage for isolation
  sessionContentManager: SessionContentManagerImpl;
}

export interface ParticipantTask {
  agentId: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  assignedAt: Date;
  completedAt?: Date;
}

export interface FinalCoordinationResult {
  summary: string;
  participantContributions: {
    agentId: string;
    contribution: string;
    weight: number;
  }[];
  coordinatorAnalysis: string;
  coordinatorSummary?: string;
  recommendations: string[];
  integratedContent?: string;
  publishedTo: string[];
  publishedAt?: string;
}

// New orchestrated workflow types
export interface OrchestrationStep {
  stepId: string;
  stepNumber: number;
  description: string;
  agentId: string;
  actionType: 'travel' | 'delegate' | 'message' | 'collect' | 'synthesize' | 'travel_and_collaborate' | 'execute_task';
  parameters: {
    realmId?: string;
    realmName?: string;
    targetAgentId?: string;
    taskDescription?: string;
    taskPrompt?: string;
    contentReferences?: string[]; // References to previous step outputs
    requiresPrevious?: string[];
    elementals?: Array<{
      agentId: string;
      name: string;
      domain: string;
    }>;
    collaborationTargets?: Array<{
      agentId: string;
      agentName: string;
      role: string;
    }>;
    collaborationPrompt?: string;
    expectedDeliverable?: string;
  };
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  contentId?: string; // WorldTree content ID for step output
}

export interface OrchestrationPlan {
  planId: string;
  sessionId: string;
  originalScenario: string;
  steps: OrchestrationStep[];
  createdAt: Date;
  status: 'draft' | 'executing' | 'completed' | 'failed';
  plantuml?: string;  // Optional PlantUML diagram source for visualization
}

/**
 * CoordinationService - Manages coordinator agents and orchestrates multi-agent collaboration
 * 
 * This service implements the core coordination workflow:
 * 1. Coordinator receives scenario prompt
 * 2. Coordinator uses its LLM to analyze and delegate tasks to participant agents
 * 3. Participant agents execute tasks (managed by AgentService)
 * 4. Coordinator synthesizes participant results into final recommendations
 * 
 * All coordination sessions are managed asynchronously to support long-running scenarios.
 * 
 * FUTURE EVOLUTION CAPABILITIES (Grant Proposal):
 * - Self-play coordination experiments in isolated realms
 * - Agent prompt evolution based on performance metrics
 * - Emergent strategy discovery through competitive scenarios
 * - Automatic MCP tool generation for successful coordination patterns
 */
export class CoordinationService {
  private sessions: Map<string, CoordinationSession> = new Map();
  private coordinators: Map<string, Coordinator> = new Map();
  /**
   * Active orchestration step per session. Set when a step begins executing,
   * cleared when it completes. Read by the tool layer (AgentService) to attach
   * sub-contributions to their parent orchestration step.
   */
  private activeSteps: Map<string, number> = new Map();
  private agentService: AgentService | null = null;
  private realmService: RealmService | null = null;
  // private knowledgeService: KnowledgeService | null = null;
  private openaiClient: OpenAIClient | null = null;
  private ollamaClient: OllamaClient;
  private coordinatorConcurrencyManager: CoordinatorConcurrencyManagerImpl;

  constructor(_knowledgeService?: KnowledgeService, openaiClient?: OpenAIClient, ollamaClient?: OllamaClient) {
    // this.knowledgeService = knowledgeService || null;
    this.openaiClient = openaiClient || null;
    this.ollamaClient = ollamaClient || new OllamaClient(createDefaultOllamaConfig());
    this.coordinatorConcurrencyManager = new CoordinatorConcurrencyManagerImpl();
    
    // Initialize OpenAI client if API key is available
    if (!this.openaiClient && process.env['OPENAI_API_KEY']) {
      this.openaiClient = new OpenAIClient(createDefaultOpenAIConfig());
    }
  }

  /**
   * Configure AgentService after construction
   */
  setAgentService(agentService: AgentService): void {
    this.agentService = agentService;
  }

  /**
   * Configure RealmService after construction
   */
  setRealmService(realmService: RealmService): void {
    this.realmService = realmService;
  }

  /**
   * Get coordination session status
   */
  getCoordinationSession(sessionId: string): Partial<CoordinationSession> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Create a serializable copy without circular references
    return {
      id: session.id,
      coordinatorId: session.coordinatorId,
      scenarioPrompt: session.scenarioPrompt,
      participantIds: session.participantIds,
      status: session.status,
      startedAt: session.startedAt,
      ...(session.completedAt && { completedAt: session.completedAt }),
      timeoutMinutes: session.timeoutMinutes,
      coordinationStyle: session.coordinationStyle,
      participantTasks: session.participantTasks,
      ...(session.finalResult && { finalResult: session.finalResult }),
      ...(session.error && { error: session.error }),
      ...(session.metadata && { metadata: session.metadata })
      // Exclude sessionAgentManager and sessionContentManager to avoid circular references
    };
  }

  /**
   * Get SessionAgentManager for a given session (for session-scoped agent state)
   */
  getSessionAgentManager(sessionId: string): SessionAgentManagerImpl | null {
    const session = this.sessions.get(sessionId);
    return session ? session.sessionAgentManager : null;
  }

  /**
   * NEW ORCHESTRATED WORKFLOW: Start coordination with LLM-driven task decomposition
   */
  async startOrchestatedCoordination(request: CoordinationRequest): Promise<string> {
    if (!this.agentService) {
      throw new Error('AgentService not configured');
    }

    // Check if coordinator can start a new session
    if (!this.coordinatorConcurrencyManager.canStartSession(request.coordinatorId)) {
      const currentCount = this.coordinatorConcurrencyManager.getActiveSessionCount(request.coordinatorId);
      throw new Error(`Coordinator ${request.coordinatorId} is at maximum concurrent sessions (${currentCount})`);
    }

    console.log(`🎯 Starting orchestrated coordination with scenario: ${request.scenarioPrompt.substring(0, 100)}...`);

    // Create session
    const sessionId = `session-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // Register session with concurrency manager
    this.coordinatorConcurrencyManager.startSession(
      sessionId, 
      request.coordinatorId, 
      request.participantIds.length,
      request.scenarioPrompt
    );

    const sessionAgentManager = new SessionAgentManagerImpl(sessionId);
    const sessionContentManager = new SessionContentManagerImpl({
      baseDirectory: `./data/published_content/sessions`,
      useSessionDirectories: true
    });
    
    const session: CoordinationSession = {
      id: sessionId,
      coordinatorId: request.coordinatorId,
      scenarioPrompt: request.scenarioPrompt,
      participantIds: request.participantIds,
      status: 'in_progress',
      startedAt: new Date(),
      timeoutMinutes: request.timeoutMinutes,
      coordinationStyle: request.coordinationStyle,
      participantTasks: [],
      sessionAgentManager,
      sessionContentManager,
      ...(request.publishTo !== undefined && { publishTo: request.publishTo }),
      ...(request.publishAs !== undefined && { publishAs: request.publishAs })
    };
    
    // Initialize session-scoped agent states
    if (this.agentService) {
      for (const participantId of request.participantIds) {
        try {
          const agent = await this.agentService.getAgent(participantId);
          sessionAgentManager.joinSession(participantId, agent);
        } catch (error) {
          console.warn(`⚠️ Failed to initialize session state for agent ${participantId}:`, error);
        }
      }
    }
    
    this.sessions.set(sessionId, session);

    // Phase 1: Use LLM to decompose scenario into orchestration plan
    const plan = await this.createOrchestrationPlan(session);
    
    // Phase 2: Execute plan step by step
    this.executeOrchestrationPlan(session, plan);

    return sessionId;
  }

  /**
   * Use LLM to break down complex scenario into sequential instructions for the druid
   */
  /**
   * Parse PlantUML workflow diagram into orchestration steps
   */
  private async parsePlantUMLWorkflow(session: CoordinationSession, plantuml: string): Promise<OrchestrationStep[]> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`📊 Parsing PlantUML workflow diagram into executable steps`);

    // Extract participant declarations (e.g., "participant Dev Druid Alpha")
    const participantPattern = /participant\s+"([^"]+)"\s+as\s+(\w+)/g;
    const participantMap = new Map<string, string>(); // alias -> full name
    let match;

    while ((match = participantPattern.exec(plantuml)) !== null) {
      const [, fullName, alias] = match;
      if (fullName === undefined || alias === undefined) {
        // Unreachable given the regex, but TypeScript needs the narrow.
        continue;
      }
      participantMap.set(alias, fullName);
    }

    // Extract arrows/actions (e.g., "Alpha -> OSSR : travel_to_realm")
    const arrowPattern = /(\w+)\s*-+>\s*(\w+)\s*:\s*([^\n]+)/g;
    const actions: Array<{ from: string; to: string; action: string }> = [];

    while ((match = arrowPattern.exec(plantuml)) !== null) {
      const [, from, to, action] = match;
      if (from === undefined || to === undefined || action === undefined) {
        // Unreachable given the regex, but TypeScript needs the narrow.
        continue;
      }
      actions.push({
        from: from.trim(),
        to: to.trim(),
        action: action.trim()
      });
    }

    console.log(`📊 Found ${participantMap.size} participants and ${actions.length} actions`);

    // Map participant names to agent IDs
    const nameToAgentId = new Map<string, string>();
    for (const [alias, fullName] of participantMap) {
      // Find agent by name
      for (const agentId of session.participantIds) {
        try {
          const agent = await this.agentService!.getAgent(agentId);
          if (agent.name === fullName || agent.name === alias) {
            nameToAgentId.set(alias, agentId);
            nameToAgentId.set(fullName, agentId);
            console.log(`✓ Mapped ${fullName} (${alias}) to agent ${agentId}`);
            break;
          }
        } catch (e) {
          console.warn(`Could not load agent ${agentId}`);
        }
      }
    }

    // Also try to map realm names mentioned in the diagram
    const realmNameToId = new Map<string, string>();
    if (this.realmService) {
      try {
        const realms = await this.realmService.listRealms();
        for (const realm of realms) {
          realmNameToId.set(realm.name, realm.id);
          // Also try uppercase versions since PlantUML often uses uppercase
          realmNameToId.set(realm.name.toUpperCase(), realm.id);
          // Try acronyms (e.g., "Open Source Software" -> "OSS" or "OSSR")
          const acronym = realm.name.split(' ').map((w: string) => w[0]).join('').toUpperCase();
          if (acronym.length > 1) {
            realmNameToId.set(acronym, realm.id);
            // Also try with "R" for Realm suffix
            realmNameToId.set(acronym + 'R', realm.id);
          }

          // Also map participant aliases from PlantUML (e.g., "OSSR" as participant)
          for (const [alias, fullName] of participantMap) {
            if (fullName.toLowerCase().includes(realm.name.toLowerCase()) ||
                realm.name.toLowerCase().includes(fullName.toLowerCase())) {
              realmNameToId.set(alias, realm.id);
              console.log(`✓ Mapped participant ${alias} (${fullName}) to realm ${realm.name}`);
            }
          }
        }
        console.log(`✓ Mapped ${realmNameToId.size} realm name variations`);
      } catch (error) {
        console.warn('Failed to load realms:', error);
      }
    }

    // Convert actions to orchestration steps
    const steps: OrchestrationStep[] = [];
    let stepNumber = 1;

    for (const action of actions) {
      const fromAgentId = nameToAgentId.get(action.from);
      if (!fromAgentId) {
        console.warn(`⚠️ Could not find agent ID for ${action.from}, skipping action`);
        continue;
      }

      const fromAgent = await this.agentService!.getAgent(fromAgentId);
      const actionLower = action.action.toLowerCase();

      // Parse travel_to_realm actions
      if (actionLower.includes('travel_to_realm') || actionLower.includes('travel to')) {
        const realmName = action.to;
        const realmId = realmNameToId.get(realmName) || realmNameToId.get(realmName.toUpperCase());

        if (!realmId) {
          console.warn(`⚠️ Could not find realm ID for ${realmName}, skipping travel action`);
          continue;
        }

        steps.push({
          stepId: `${session.id}-step-${stepNumber}`,
          stepNumber: stepNumber++,
          description: `${fromAgent.name} travels to realm ${realmName}`,
          agentId: fromAgentId,
          actionType: 'travel',
          parameters: {
            realmId,
            realmName
          },
          status: 'pending'
        } as OrchestrationStep);
      }
      // Parse delegate_task actions
      else if (actionLower.includes('delegate_task') || actionLower.includes('delegate')) {
        const toAgentId = nameToAgentId.get(action.to);
        if (!toAgentId) {
          console.warn(`⚠️ Could not find agent ID for ${action.to}, skipping delegate action`);
          continue;
        }

        const toAgent = await this.agentService!.getAgent(toAgentId);

        // Extract task description from action text (after the colon or action name)
        let taskDescription = action.action;
        if (taskDescription.includes(':')) {
          taskDescription = taskDescription.split(':').slice(1).join(':').trim();
        } else if (taskDescription.toLowerCase().startsWith('delegate')) {
          taskDescription = taskDescription.replace(/^delegate[_\s]*(task)?[_\s]*/i, '').trim();
        }

        // If still generic, use a default
        if (!taskDescription || taskDescription.length < 5) {
          taskDescription = `Work with ${toAgent.name} on this coordination task`;
        }

        steps.push({
          stepId: `${session.id}-step-${stepNumber}`,
          stepNumber: stepNumber++,
          description: `${fromAgent.name} delegates task to ${toAgent.name}`,
          agentId: fromAgentId,
          actionType: 'travel_and_collaborate',
          parameters: {
            realmId: toAgent.realmAccess?.boundRealmId || toAgent.realmAccess?.currentRealmId,
            realmName: action.to, // Use the alias as a placeholder
            collaborationTargets: [{
              agentId: toAgentId,
              agentName: toAgent.name,
              role: toAgent.specialization?.domain || 'contributor'
            }],
            taskPrompt: taskDescription,
            expectedDeliverable: 'Task completion output'
          },
          status: 'pending'
        } as OrchestrationStep);
      }
      // Parse other message/action arrows as collaboration
      else {
        const toAgentId = nameToAgentId.get(action.to);

        // If target is a realm or unknown, treat as travel+collaborate
        if (!toAgentId || realmNameToId.has(action.to)) {
          const realmId = realmNameToId.get(action.to) || realmNameToId.get(action.to.toUpperCase());

          steps.push({
            stepId: `${session.id}-step-${stepNumber}`,
            stepNumber: stepNumber++,
            description: `${fromAgent.name}: ${action.action}`,
            agentId: fromAgentId,
            actionType: 'execute_task',
            parameters: {
              taskPrompt: action.action,
              ...(realmId && { realmId, realmName: action.to })
            },
            status: 'pending'
          } as OrchestrationStep);
        } else {
          // Collaboration between two agents
          const toAgent = await this.agentService!.getAgent(toAgentId);

          steps.push({
            stepId: `${session.id}-step-${stepNumber}`,
            stepNumber: stepNumber++,
            description: `${fromAgent.name} collaborates with ${toAgent.name}: ${action.action}`,
            agentId: fromAgentId,
            actionType: 'travel_and_collaborate',
            parameters: {
              collaborationTargets: [{
                agentId: toAgentId,
                agentName: toAgent.name,
                role: toAgent.specialization?.domain || 'collaborator'
              }],
              taskPrompt: action.action,
              realmId: toAgent.realmAccess?.boundRealmId || toAgent.realmAccess?.currentRealmId
            },
            status: 'pending'
          } as OrchestrationStep);
        }
      }
    }

    console.log(`✅ Parsed PlantUML into ${steps.length} executable steps`);
    return steps;
  }

  private async createOrchestrationPlan(session: CoordinationSession): Promise<OrchestrationPlan> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🎯 Coordinator ${session.coordinatorId} creating orchestration plan for ${session.participantIds.length} participants`);

    // Check if scenario prompt contains PlantUML workflow diagram
    if (session.scenarioPrompt.includes('@startuml') || session.metadata?.['workflowMode'] === 'diagram') {
      console.log(`📊 Detected PlantUML workflow diagram, parsing directly into execution steps`);

      // Extract PlantUML content
      let plantumlContent = session.scenarioPrompt;
      const originalPlantuml = session.metadata?.['originalWorkflow']?.plantuml;
      if (originalPlantuml) {
        plantumlContent = originalPlantuml;
      }

      // Parse PlantUML into steps
      const steps = await this.parsePlantUMLWorkflow(session, plantumlContent);

      return {
        planId: `plan-${session.id}`,
        sessionId: session.id,
        originalScenario: session.scenarioPrompt,
        steps,
        createdAt: new Date(),
        status: 'draft',
        plantuml: plantumlContent  // Include PlantUML for visualization in approval UI
      };
    }

    // Get detailed agent and realm information to help LLM make informed decisions
    const participantDetails = await Promise.all(
      session.participantIds.map(async (id) => {
        try {
          const agent = await this.agentService!.getAgent(id);
          let realmInfo = '';

          if (agent.realmAccess?.boundRealmId) {
            // Elemental bound to a realm
            try {
              const realm = await this.realmService?.getRealm(agent.realmAccess.boundRealmId);
              realmInfo = ` (Elemental bound to realm: ${realm?.name || 'unknown'}, ID: ${agent.realmAccess.boundRealmId})`;
            } catch (e) {
              realmInfo = ` (Elemental bound to realm ID: ${agent.realmAccess.boundRealmId})`;
            }
          } else if (agent.type === 'druid') {
            realmInfo = ' (Druid - can travel between realms)';
          }

          return `- ${agent.name} (ID: ${id})${realmInfo} - ${agent.specialization?.domain || 'general'}`;
        } catch (error) {
          return `- ${id} (agent not found)`;
        }
      })
    );

    // Get all available realms
    let realmsList = '';
    if (this.realmService) {
      try {
        const realms = await this.realmService.listRealms();
        realmsList = realms.map(realm =>
          `- ${realm.name} (ID: ${realm.id})`
        ).join('\n');
      } catch (error) {
        console.warn('Failed to load realms for orchestration planning:', error);
      }
    }

    const coordinatorPrompt = `You are the built-in coordinator orchestrating a collaboration scenario.

IMPORTANT CONSTRAINT: You can ONLY assign tasks to DRUID agents. You CANNOT directly assign tasks to ELEMENTAL agents.
- DRUIDS can travel between realms and collaborate with agents in those realms
- ELEMENTALS are bound to specific realms and can only be accessed by Druids who travel to their realm

SCENARIO:
${session.scenarioPrompt}

AVAILABLE PARTICIPANTS:
${participantDetails.join('\n')}

AVAILABLE REALMS:
${realmsList}

ORCHESTRATION GUIDELINES:
- Analyze the scenario to identify distinct tasks
- Create ONE instruction step for EACH distinct task (not just one step total)
- If the scenario mentions sequential work (e.g., "then", "after", "next"), create multiple steps
- ONLY assign tasks to DRUID participants (never directly to Elementals)
- For each task that requires Elemental expertise:
  * Assign the task to a DRUID
  * Specify which ELEMENTALS in the target realm the Druid should collaborate with
  * The Druid will travel to the realm and work with those Elementals
- Match realm names from the scenario to the available realms listed above
- Use the EXACT realm ID from the list above

Create instruction steps as JSON:
{
  "instructions": [
    {
      "stepNumber": 1,
      "action": "travel_and_collaborate",
      "assignedDruidId": "<DRUID agent ID from AVAILABLE PARTICIPANTS>",
      "assignedDruidName": "<DRUID agent name>",
      "realmId": "<exact UUID from AVAILABLE REALMS list>",
      "realmName": "<exact name from AVAILABLE REALMS list>",
      "collaborationTargets": [
        {
          "agentId": "<ELEMENTAL or DRUID agent ID to collaborate with>",
          "agentName": "<agent name>",
          "role": "<what this agent contributes>"
        }
      ],
      "taskPrompt": "<specific task for the Druid - describe what they should achieve through collaboration>",
      "expectedDeliverable": "Task output",
      "publishKey": "step1_content",
      "requiresPrevious": []
    },
    {
      "stepNumber": 2,
      "action": "travel_and_collaborate",
      "assignedDruidId": "<DRUID agent ID for second task>",
      "assignedDruidName": "<DRUID agent name>",
      "realmId": "<realm UUID>",
      "realmName": "<realm name>",
      "collaborationTargets": [
        {
          "agentId": "<agent to collaborate with, if any>",
          "agentName": "<agent name>",
          "role": "<contribution>"
        }
      ],
      "taskPrompt": "<task description - can reference step 1 output using get_step_content tool>",
      "expectedDeliverable": "Final output",
      "publishKey": "step2_content",
      "requiresPrevious": [1]
    }
  ]
}

CRITICAL: Only assign tasks to DRUIDs. If an Elemental's expertise is needed, assign a Druid to collaborate with that Elemental in their realm.`;

    console.log(`🔍 Creating druid orchestration plan with LLM...`);
    
    // Use coordinator's LLM to create instructions
    const coordinator = await this.getCoordinator(session.coordinatorId);
    if (!coordinator) {
      throw new Error(`Coordinator ${session.coordinatorId} not found`);
    }
    
    const response = await this.executeCoordinatorPrompt(coordinator, coordinatorPrompt);
    
    // Parse the JSON response
    let planData;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('LLM Response without JSON:', response);
        throw new Error('No JSON found in LLM response');
      }
      
      console.log(`🔍 Raw LLM JSON response: ${jsonMatch[0]}`);
      planData = JSON.parse(jsonMatch[0]);
      
      console.log(`🔍 Parsed plan data:`, JSON.stringify(planData, null, 2));
      
      if (!planData.instructions || !Array.isArray(planData.instructions)) {
        throw new Error(`Invalid plan structure: instructions missing or not array. Got: ${JSON.stringify(planData)}`);
      }
      
    } catch (error) {
      console.error('Failed to parse orchestration plan:', error);
      console.error('Raw LLM response:', response);
      throw new Error(`Failed to create orchestration plan: ${error}`);
    }

    // Create orchestration steps from coordinator's plan
    console.log(`🔍 Creating orchestration steps from ${planData.instructions.length} instructions`);

    const steps: OrchestrationStep[] = planData.instructions.map((instruction: any, index: number) => {
      console.log(`🔍 Processing instruction ${index + 1}:`, JSON.stringify(instruction, null, 2));

      if (!instruction.assignedDruidId) {
        console.error(`❌ Invalid instruction structure at index ${index}: missing assignedDruidId`);
        throw new Error(`Invalid instruction structure at index ${index}: assignedDruidId is required`);
      }

      // Validate that assigned agent is actually a Druid
      const isDruid = session.participantIds.includes(instruction.assignedDruidId);
      if (!isDruid) {
        console.warn(`⚠️ Warning: assignedDruidId ${instruction.assignedDruidId} not found in participants`);
      }

      const collabTargets = instruction.collaborationTargets || [];
      const step = {
        stepId: `${session.id}-step-${instruction.stepNumber}`,
        stepNumber: instruction.stepNumber,
        description: `${instruction.assignedDruidName || instruction.assignedDruidId} travels to ${instruction.realmName} and collaborates with ${collabTargets.map((t: any) => t.agentName).join(', ')}`,
        agentId: instruction.assignedDruidId,
        actionType: 'travel_and_collaborate',
        parameters: {
          realmId: instruction.realmId,
          realmName: instruction.realmName,
          collaborationTargets: instruction.collaborationTargets,
          taskPrompt: instruction.taskPrompt,
          expectedDeliverable: instruction.expectedDeliverable,
          publishKey: instruction.publishKey,
          requiresPrevious: instruction.requiresPrevious || []
        },
        status: 'pending'
      };

      console.log(`✅ Created step ${index + 1}:`, JSON.stringify(step, null, 2));
      return step;
    });

    const plan: OrchestrationPlan = {
      planId: `plan-${session.id}`,
      sessionId: session.id,
      originalScenario: session.scenarioPrompt,
      steps,
      createdAt: new Date(),
      status: 'draft'
    };

    console.log(`✅ Created orchestration plan with ${steps.length} steps`);
    return plan;
  }

  /**
   * Execute orchestration plan step by step with content management
   */
  private async executeOrchestrationPlan(session: CoordinationSession, plan: OrchestrationPlan): Promise<void> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🎯 Executing orchestration plan with ${plan.steps.length} steps...`);
    plan.status = 'executing';

    try {
      for (const step of plan.steps) {
        // Update session activity
        this.coordinatorConcurrencyManager.updateSessionActivity(session.id);
        
        console.log(`📍 Executing step ${step.stepNumber}: ${step.description}`);
        step.status = 'in_progress';
        step.startedAt = new Date();

        // Build step context from previous outputs
        const stepContext = await this.buildStepContext(plan, step);

        // Mark this step as active so tool calls can attribute their
        // sub-contributions back to it.
        this.activeSteps.set(session.id, step.stepNumber);

        // Ensure the coordination_sessions row exists before any tool call can
        // insert sub-contributions (FK target). Best-effort; sweep at end will reconcile.
        await getSessionPublicationService().ensureSessionRecord({
          sessionId: session.id,
          coordinatorAgentId: session.coordinatorId,
          realmId: session.realmId ?? null,
          prompt: session.scenarioPrompt,
          participantAgentIds: session.participantIds,
        }).catch((err) => console.warn(`ensureSessionRecord failed for ${session.id}:`, err));
        try {
          // Execute the step with session context
          const stepOutput = await this.executeOrchestrationStep(step, stepContext, session.id);

          // Store step output in session-isolated storage
          step.contentId = await this.storeStepContent(step, stepOutput, session);
          step.output = stepOutput;
          step.status = 'completed';
          step.completedAt = new Date();
        } finally {
          this.activeSteps.delete(session.id);
        }

        console.log(`✅ Step ${step.stepNumber} completed, content stored as ${step.contentId}`);

        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      plan.status = 'completed';
      session.status = 'completed';
      session.completedAt = new Date();

      // Notify concurrency manager of completion
      this.coordinatorConcurrencyManager.endSession(session.id, 'completed');

      // Generate final result
      await this.generateOrchestrationResult(session, plan);

      // Persist session + contributions and publish typed artifacts.
      // Best-effort — does not fail the session if publishing errors.
      await this.persistAndPublishSession(session, plan).catch((err) => {
        console.error(`⚠️ persistAndPublishSession failed for ${session.id}:`, err);
      });

      // Clean up session-scoped resources
      session.sessionAgentManager.cleanup();
      session.sessionContentManager.shutdown();

      console.log(`🎉 Orchestration plan completed successfully`);
    } catch (error) {
      console.error(`❌ Orchestration plan failed:`, error);
      plan.status = 'failed';
      session.status = 'failed';
      session.completedAt = new Date();
      
      // Notify concurrency manager of failure
      this.coordinatorConcurrencyManager.endSession(session.id, 'failed');
      
      // Clean up session-scoped agent states on failure
      session.sessionAgentManager.cleanup();
      
      throw error;
    }
  }

  /**
   * Build context for a step from previous step outputs
   */
  private async buildStepContext(plan: OrchestrationPlan, currentStep: OrchestrationStep): Promise<string> {
    const completedSteps = plan.steps.filter(s => 
      s.stepNumber < currentStep.stepNumber && s.status === 'completed' && s.contentId
    );

    if (completedSteps.length === 0) {
      return "This is the first step in the coordination plan.";
    }

    // Instead of including full content, just provide content IDs for tool access
    let context = "Previous step outputs available via get_step_content tool:\n";
    for (const step of completedSteps) {
      context += `- Step ${step.stepNumber} (${step.description}): Content ID "${step.contentId}"\n`;
    }
    
    context += `\nIMPORTANT: Use the get_step_content tool to retrieve specific content from previous steps by their Content ID.`;
    context += `\nExample: get_step_content("${completedSteps[0]?.contentId}") to get the output from Step ${completedSteps[0]?.stepNumber}`;

    return context;
  }

  /**
   * Execute a single orchestration step
   */
  private async executeOrchestrationStep(step: OrchestrationStep, context: string, sessionId?: string): Promise<string> {
    if (!this.agentService) throw new Error('AgentService not configured');

    if (step.actionType === 'execute_task') {
      return await this.executeTaskStep(step, context, sessionId);
    }

    if (step.actionType === 'travel_and_collaborate') {
      return await this.executeTravelAndCollaborate(step, context, sessionId);
    }

    // Fallback for any other action types
    const prompt = `${context}\n\nExecute this action: ${step.description}`;
    const result = await this.agentService.executeAgentPrompt(step.agentId, {
      prompt,
      ...(sessionId && { sessionId }),
      collaborationContext: {
        scenarioName: 'Orchestrated Coordination',
        scenarioType: 'step_execution',
        agentRole: 'executor',
        usePersonaPrompt: true  // CRITICAL: Preserve agent-specific prompts
      }
    });

    return result.response;
  }

  /**
   * Execute a task step - coordinator directly assigns task to participant
   */
  private async executeTaskStep(step: OrchestrationStep, context: string, sessionId?: string): Promise<string> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🎯 Executing task step ${step.stepNumber}: ${step.description}`);
    console.log(`🔍 Assigned to agent: ${step.agentId}`);
    console.log(`🔍 Realm: ${step.parameters.realmName} (${step.parameters.realmId})`);

    // Get the assigned agent
    const agent = await this.agentService.getAgent(step.agentId);
    if (!agent) {
      throw new Error(`Agent ${step.agentId} not found`);
    }

    // Check if agent needs to travel to the realm
    const needsTravel = agent.type === 'druid' &&
                       agent.realmAccess?.currentRealmId !== step.parameters.realmId;

    if (needsTravel) {
      console.log(`🚶 Agent ${agent.name} needs to travel to realm ${step.parameters.realmName}`);
      // Travel first by asking agent to use the travel tool
      try {
        const travelPrompt = `Travel to realm "${step.parameters.realmName}" (realm ID: ${step.parameters.realmId}). Use the travel_to_realm tool.`;
        await this.agentService.executeAgentPrompt(step.agentId, {
          prompt: travelPrompt,
          ...(sessionId && { sessionId }),
          collaborationContext: {
            scenarioName: 'Orchestrated Coordination',
            scenarioType: 'realm_travel',
            agentRole: 'traveler',
            usePersonaPrompt: true  // CRITICAL: Preserve agent-specific prompts even during travel
          }
        });
        console.log(`✅ Agent ${agent.name} traveled to ${step.parameters.realmName}`);
      } catch (error) {
        console.error(`❌ Travel failed:`, error);
        throw new Error(`Failed to travel to realm: ${error}`);
      }
    }

    // Build the task prompt with context from previous steps
    let fullPrompt = '';
    if (context && context !== "This is the first step in the coordination plan.") {
      fullPrompt += `${context}\n\n`;
    }

    // Always include the original scenario text so the executing agent has the
    // full brief, not just the planner's per-step paraphrase. The
    // "Execute this PlantUML" guard skips synthetic diagram-execution prompts
    // that re-embed the diagram itself.
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (session && session.scenarioPrompt && !session.scenarioPrompt.startsWith('Execute this PlantUML')) {
      fullPrompt += `COORDINATION CONTEXT:\n${session.scenarioPrompt}\n\nYOUR SPECIFIC TASK:\n`;
    }

    fullPrompt += `${step.parameters.taskPrompt}`;

    console.log(`📝 Executing task for agent ${agent.name}...`);

    // Execute the task
    const result = await this.agentService.executeAgentPrompt(step.agentId, {
      prompt: fullPrompt,
      ...(sessionId && { sessionId }),
      collaborationContext: {
        scenarioName: 'Orchestrated Coordination',
        scenarioType: 'coordinated_task',
        agentRole: 'contributor',
        usePersonaPrompt: true  // CRITICAL: Preserve agent-specific prompts
      }
    });

    console.log(`✅ Task completed by ${agent.name}`);
    return result.response;
  }

  /**
   * Execute travel and collaboration step for druid
   * Druid travels to realm and collaborates with specified agents (respecting realm boundaries)
   */
  private async executeTravelAndCollaborate(step: OrchestrationStep, context: string, sessionId?: string): Promise<string> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🚀 Starting travel and collaborate for step: ${step.stepId}`);
    console.log(`🔍 Step parameters:`, JSON.stringify(step.parameters, null, 2));

    // Get the Druid agent
    const druid = await this.agentService.getAgent(step.agentId);
    if (!druid) {
      throw new Error(`Druid agent ${step.agentId} not found`);
    }

    // Check if druid needs to travel
    const needsTravel = druid.realmAccess?.currentRealmId !== step.parameters.realmId;

    // Build collaboration instructions
    const collaborationTargets = step.parameters.collaborationTargets || [];
    const hasCollaborators = collaborationTargets.length > 0;

    let prompt = '';

    // Add context from previous steps if available
    if (context && context !== "This is the first step in the coordination plan.") {
      prompt += `${context}\n\n`;
    }

    // Always include the original scenario text so the executing agent has the
    // full brief, not just the planner's per-step paraphrase. The
    // "Execute this PlantUML" guard skips synthetic diagram-execution prompts
    // that re-embed the diagram itself.
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (session && session.scenarioPrompt && !session.scenarioPrompt.startsWith('Execute this PlantUML')) {
      prompt += `COORDINATION CONTEXT:\n${session.scenarioPrompt}\n\n`;
    }

    // Build a natural task prompt with context, letting the agent decide which tools to use
    prompt += `YOUR SPECIFIC TASK: ${step.parameters.taskPrompt}\n\n`;

    // Add context about the situation without being prescriptive
    if (needsTravel) {
      prompt += `Note: You need to travel to realm "${step.parameters.realmName}" (ID: ${step.parameters.realmId}) to complete this task.\n`;
    }

    if (hasCollaborators) {
      const collabList = collaborationTargets.map(t => `${t.agentName} (${t.agentId}) specializes in ${t.role}`).join('; ');
      prompt += `Available collaborators in this realm: ${collabList}\n`;
    }

    prompt += `\nUse your available tools as needed to accomplish this task.`;

    console.log(`🎯 Executing step for druid ${druid.name}: ${step.description}`);
    console.log(`📝 Prompt:`, prompt);

    const result = await this.agentService.executeAgentPrompt(step.agentId, {
      prompt,
      ...(sessionId && { sessionId }),
      collaborationContext: {
        scenarioName: 'Orchestrated Coordination',
        scenarioType: 'druid_coordination',
        agentRole: 'druid_coordinator',
        usePersonaPrompt: true  // CRITICAL: Preserve agent-specific prompts
      }
    });

    console.log(`✅ Druid ${druid.name} completed step`);
    return result.response;
  }

  /**
   * Find an available druid agent for orchestration
   * NOTE: Currently unused as coordinator handles orchestration directly
   */
  /*
  private async findAvailableDruid(): Promise<{agentId: string, name: string} | null> {
    if (!this.agentService) return null;

    try {
      const agents = await this.agentService.listAgents({ type: 'druid', status: 'active' });

      if (agents.length > 0) {
        const druidAgent = agents[0]!; // Use first available druid (we know it exists)
        console.log(`✅ Found available druid agent: ${druidAgent.name} (${druidAgent.id})`);
        return { agentId: druidAgent.id, name: druidAgent.name };
      }

      console.warn(`⚠️ No active druid agents found`);
      return null;
    } catch (error) {
      console.error(`Failed to find druid agents:`, error);
      return null;
    }
  }
  */

  /**
   * Get elementals organized by realm - only from session participants
   */
  // Temporarily disabled - not used in simplified orchestration
  /*
  private async getElementalsByRealm(participantIds: string[]): Promise<string> {
    if (!this.agentService) return 'No elementals found';
    
    try {
      const realmGroups: Record<string, any[]> = {};
      
      // Only process participants, excluding the druid
      for (const participantId of participantIds) {
        try {
          const agent: any = await this.agentService.getAgent(participantId);
          
          // Skip the druid, only include elementals
          if (agent.type === 'elemental') {
            const realmId = agent.realmAccess?.boundRealmId || 'default-realm';
            if (!realmGroups[realmId]) {
              realmGroups[realmId] = [];
            }
            
            const realmName = realmId === 'default-realm' ? 'Default Realm' : await this.getRealmName(realmId);
            realmGroups[realmId].push({
              name: agent.name,
              agentId: agent.id,
              domain: agent.specialization?.domain || 'general',
              realmName
            });
          }
        } catch (error) {
          console.error(`Failed to load participant agent ${participantId}:`, error);
        }
      }
      
      let result = '';
      for (const [realmId, elementals] of Object.entries(realmGroups)) {
        const realmName = elementals[0]?.realmName || 'Unknown Realm';
        result += `\nREALM: ${realmName} (ID: ${realmId})\n`;
        for (const elemental of elementals) {
          result += `- ${elemental.name} (ID: ${elemental.agentId}, Domain: ${elemental.domain})\n`;
        }
      }
      
      return result || 'No elemental participants found';
    } catch (error) {
      console.error('Failed to get elementals by realm:', error);
      return 'Error loading elemental information';
    }
  }
  */

  /**
   * Store step content in session-isolated storage
   */
  private async storeStepContent(step: OrchestrationStep, output: string, session: CoordinationSession): Promise<string> {
    const stepData = {
      content_id: `coordination/${step.stepId}`,
      step_number: step.stepNumber,
      description: step.description,
      agent_id: step.agentId,
      action_type: step.actionType,
      output,
      timestamp: new Date().toISOString()
    };

    try {
      // Use session-isolated content storage
      const contentId = await session.sessionContentManager.storeStepContent(
        session.id,
        step.stepId,
        stepData,
        step.agentId
      );
      
      console.log(`📝 Stored step content in session-isolated storage: ${session.id}/${contentId}`);
      return contentId;
    } catch (error) {
      console.error(`Failed to store step content:`, error);
      return `fallback-${step.stepId}`;
    }
  }

  /**
   * Generate final orchestration result
   */
  private async generateOrchestrationResult(session: CoordinationSession, plan: OrchestrationPlan): Promise<void> {
    const completedSteps = plan.steps.filter(s => s.status === 'completed');
    // Extract creative content for publishing
    const creativeExtraction = this.extractCreativeContent(completedSteps, session);
    
    session.finalResult = {
      summary: `Orchestrated coordination completed ${completedSteps.length}/${plan.steps.length} steps successfully.`,
      participantContributions: completedSteps.map(step => ({
        agentId: step.agentId,
        contribution: step.output || '',
        weight: 1 / completedSteps.length
      })),
      coordinatorAnalysis: `The orchestration plan executed ${completedSteps.length} atomic steps in sequence, maintaining content flow between steps.`,
      recommendations: [
        'Review step outputs for quality and completeness',
        'Consider optimizing step sequencing for future similar scenarios'
      ],
      integratedContent: this.integrateStepOutputs(completedSteps),
      publishedTo: []
    };

    // Publish creative content separately if it exists
    if (creativeExtraction.metadata.contentType === 'creative_collaboration') {
      await this.publishCreativeContent(creativeExtraction.content, creativeExtraction.metadata, session);
    }
  }

  /**
   * Integrate outputs from all completed steps - focus on final creative deliverable only
   */
  private integrateStepOutputs(steps: OrchestrationStep[]): string {
    // Sort steps by step number to ensure we get the final step
    const sortedSteps = steps.sort((a, b) => a.stepNumber - b.stepNumber);
    
    // Only extract the creative deliverable from the FINAL step
    const finalStep = sortedSteps[sortedSteps.length - 1];
    
    if (!finalStep || !finalStep.output) {
      return `Coordination completed with ${steps.length} steps. No final deliverable found.`;
    }
    
    // Look for simple task assignment results in the final step
    // Fixed regex to avoid catastrophic backtracking
    const simpleTaskMatches = finalStep.output.match(/"completion_type":\s*"simple_assignment"[^}]*"result":\s*"((?:[^"\\]|\\.)*)"/)||
                             finalStep.output.match(/"result":\s*"((?:[^"\\]|\\.)*)"[^}]*"completion_type":\s*"simple_assignment"/);
    
    if (simpleTaskMatches && simpleTaskMatches[1]) {
      // Extract and clean the final creative deliverable
      const finalDeliverable = simpleTaskMatches[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\t/g, '\t')
        .trim();
      
      if (finalDeliverable && finalDeliverable.length > 100) {
        return finalDeliverable;
      }
    }
    
    // Fallback: Look for delegate_task results in the final step
    // Fixed regex to avoid catastrophic backtracking
    const delegateTaskMatches = finalStep.output.match(/"task_delegated":[^}]*"result":\s*"((?:[^"\\]|\\.)*)"/) ||
                               finalStep.output.match(/"result":\s*"((?:[^"\\]|\\.)*)"[^}]*"execution_time":\s*\d+\s*\}/);
    
    if (delegateTaskMatches && delegateTaskMatches[1]) {
      const finalDeliverable = delegateTaskMatches[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\t/g, '\t')
        .trim();
        
      if (finalDeliverable && finalDeliverable.length > 100) {
        return finalDeliverable;
      }
    }
    
    // No final deliverable found
    return `Coordination completed with ${steps.length} steps. Final step produced no identifiable creative deliverable.`;
  }

  /**
   * Extract creative content from orchestration steps for publishing
   */
  private extractCreativeContent(steps: OrchestrationStep[], session: CoordinationSession): { content: string; metadata: any } {
    const creativeOutputs: string[] = [];
    const metadata = {
      sessionId: session.id,
      coordinatorId: session.coordinatorId,
      scenario: session.scenarioPrompt,
      timestamp: new Date().toISOString(),
      participants: session.participantIds,
      contentType: 'creative_collaboration'
    };

    for (const step of steps) {
      if (step.output) {
        // Extract content from delegate_task tool results
        const toolResultMatch = step.output.match(/TOOL_RESULT:\s*{[^}]*"result":\s*"([^"]+)"/g);
        
        if (toolResultMatch) {
          for (const match of toolResultMatch) {
            try {
              // Parse the tool result to get the actual creative content
              const resultMatch = match.match(/"result":\s*"([^"]+)"/);
              if (resultMatch && resultMatch[1]) {
                const creativeContent = resultMatch[1]
                  .replace(/\\n/g, '\n')
                  .replace(/\\"/g, '"')
                  .trim();
                
                if (creativeContent.length > 100) { // Only include substantial content
                  creativeOutputs.push(creativeContent);
                }
              }
            } catch (error) {
              console.warn('Failed to parse creative content from tool result:', error);
            }
          }
        }
      }
    }

    // If we have creative outputs, format them nicely
    if (creativeOutputs.length > 0) {
      const content = creativeOutputs.join('\n\n---\n\n');
      return { content, metadata };
    }

    // Fallback to technical report if no creative content found
    return { 
      content: this.integrateStepOutputs(steps), 
      metadata: { ...metadata, contentType: 'technical_report' }
    };
  }

  /**
   * Build realm mapping for LLM decomposition
   */
  /*
  private async buildRealmMapping(): Promise<string> {
    const realmMap: { [key: string]: string } = {
      '8c3e2c6b-ba77-49cd-884e-4e67afd230d0': 'Newford',
      '9d8fb809-e2f0-411a-aca8-e7e202360069': 'Middle Earth'
    };

    let mapping = "REALM IDs and NAMES:\n";
    for (const [realmId, realmName] of Object.entries(realmMap)) {
      mapping += `- ${realmName}: ${realmId}\n`;
    }
    
    return mapping;
  }
  */

  /**
   * Resolve agent name to agent ID if needed
   */
  private async resolveAgentId(agentIdOrName: string): Promise<string> {
    if (!this.agentService) {
      throw new Error('AgentService not available');
    }

    // First, try to get agent by ID directly
    try {
      const agent = await this.agentService.getAgent(agentIdOrName as AgentId);
      if (agent) {
        return agentIdOrName; // It's already an ID
      }
    } catch (error) {
      // Not found by ID, try name resolution
    }

    // Name patterns for common agents (matching MCP server patterns)
    const namePatterns = [
      { pattern: /pierre robert/i, id: 'pierre-robert' },
      { pattern: /de lint/i, id: 'de-lint' },
      { pattern: /tolkien/i, id: 'tolkien' },
      { pattern: /asimov/i, id: 'asimov' },
      { pattern: /lucas/i, id: 'lucas' },
      { pattern: /colleen/i, id: 'colleen' }
    ];

    // Check for specific agent name patterns
    for (const pattern of namePatterns) {
      if (pattern.pattern.test(agentIdOrName)) {
        try {
          const agent = await this.agentService.getAgent(pattern.id as AgentId);
          if (agent) {
            console.log(`🔄 Resolved agent name "${agentIdOrName}" to ID "${pattern.id}"`);
            return pattern.id;
          }
        } catch (error) {
          // Continue to next pattern
        }
      }
    }

    // If no pattern matches, try to find by name from all agents
    try {
      const agents = await this.agentService.listAgents({});
      const matchingAgent = agents.find(agent => 
        agent.name.toLowerCase() === agentIdOrName.toLowerCase() ||
        agent.name.toLowerCase().includes(agentIdOrName.toLowerCase()) ||
        agentIdOrName.toLowerCase().includes(agent.name.toLowerCase())
      );
      
      if (matchingAgent) {
        console.log(`🔄 Resolved agent name "${agentIdOrName}" to ID "${matchingAgent.id}"`);
        return matchingAgent.id;
      }
    } catch (error) {
      console.error('❌ Error searching agents by name:', error);
    }

    // If all else fails, return original value
    console.warn(`⚠️ Could not resolve agent identifier "${agentIdOrName}"`);
    return agentIdOrName;
  }

  /**
   * Start a new coordination session
   */
  /**
   * Create a coordination session with plan-only mode (requires approval before execution)
   */
  async createCoordinationPlan(request: CoordinationRequest): Promise<string> {
    console.log(`🔍 Creating plan-only coordination session for ${request.participantIds.length} participants`);

    // Resolve agent names to IDs and validate participants exist
    if (!this.agentService) {
      throw new Error('AgentService not configured');
    }

    const resolvedParticipantIds: string[] = [];
    for (const participantId of request.participantIds) {
      const resolvedId = await this.resolveAgentId(participantId);
      const agent = await this.agentService.getAgent(resolvedId as AgentId);
      if (!agent) {
        throw new Error(`Participant agent ${resolvedId} (original: ${participantId}) not found`);
      }
      resolvedParticipantIds.push(resolvedId);
    }

    // Create coordination session
    const sessionId = `session-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const sessionAgentManager = new SessionAgentManagerImpl(sessionId);
    const sessionContentManager = new SessionContentManagerImpl({
      baseDirectory: `./data/published_content/sessions`,
      useSessionDirectories: true
    });

    const session: CoordinationSession = {
      id: sessionId,
      coordinatorId: request.coordinatorId,
      scenarioPrompt: request.scenarioPrompt,
      participantIds: resolvedParticipantIds,
      status: 'pending',
      startedAt: new Date(),
      timeoutMinutes: request.timeoutMinutes,
      coordinationStyle: request.coordinationStyle,
      participantTasks: [],
      sessionAgentManager,
      sessionContentManager,
      ...(request.metadata !== undefined && { metadata: request.metadata }),
      ...(request.publishTo !== undefined && { publishTo: request.publishTo }),
      ...(request.publishAs !== undefined && { publishAs: request.publishAs })
    };

    // Initialize session-scoped agent states
    for (const participantId of resolvedParticipantIds) {
      try {
        const agent = await this.agentService.getAgent(participantId as AgentId);
        sessionAgentManager.joinSession(participantId, agent);
      } catch (error) {
        console.warn(`⚠️ Failed to initialize session state for agent ${participantId}:`, error);
      }
    }

    // Generate the orchestration plan but DON'T execute it
    try {
      const plan = await this.createOrchestrationPlan(session);

      // Store the plan in session metadata for later approval
      if (!session.metadata) session.metadata = {};
      session.metadata['orchestrationPlan'] = plan;

      console.log(`✅ Created orchestration plan with ${plan.steps.length} steps, awaiting approval`);
    } catch (error) {
      console.error(`❌ Failed to create orchestration plan:`, error);
      throw new Error(`Failed to create orchestration plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.sessions.set(sessionId, session);
    console.log(`🚀 Created plan-only coordination session: ${sessionId}`);

    return sessionId;
  }

  /**
   * Approve and execute a coordination plan
   */
  async approveAndExecutePlan(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'pending') {
      throw new Error(`Session ${sessionId} is not pending approval (status: ${session.status})`);
    }

    const plan = session.metadata?.['orchestrationPlan'] as OrchestrationPlan;
    if (!plan) {
      throw new Error(`No orchestration plan found for session ${sessionId}`);
    }

    console.log(`✅ Plan approved for session ${sessionId}, starting execution...`);

    // Start async execution
    this.executeApprovedPlan(sessionId, plan).catch(error => {
      console.error(`❌ Approved plan execution failed for session ${sessionId}:`, error);
      session.status = 'failed';
      session.completedAt = new Date();
      session.error = error instanceof Error ? error.message : String(error);

      // Clean up session-scoped agent states on failure
      session.sessionAgentManager.cleanup();
    });
  }

  /**
   * Execute an approved orchestration plan
   */
  private async executeApprovedPlan(sessionId: string, plan: OrchestrationPlan): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      session.status = 'in_progress';

      // Execute the pre-generated plan
      await this.executeOrchestrationPlan(session, plan);

      // Handle content integration (same as in performCoordination)
      if (session.finalResult && session.finalResult.participantContributions.length > 0) {
        console.log(`🎯 Post-execution: Processing content integration...`);

        const isFileProcessingTask = session.scenarioPrompt.toLowerCase().includes('process') &&
          (session.scenarioPrompt.toLowerCase().includes('file') ||
           session.scenarioPrompt.toLowerCase().includes('batch') ||
           session.finalResult.participantContributions.some(c =>
             c.contribution.includes('process_files_batch') ||
             c.contribution.includes('Successfully processed')
           ));

        if (isFileProcessingTask) {
          console.log(`⏭️  Skipping synthesis - detected file processing task where output files are the deliverable`);
          session.finalResult.summary = `File processing completed successfully. ${session.finalResult.participantContributions.length} agent(s) contributed.`;
        } else {
          const mockTasks: ParticipantTask[] = session.finalResult.participantContributions
            .filter(contrib => contrib.contribution && contrib.contribution.length > 200)
            .map(contrib => {
              let extractedContent = contrib.contribution;

              if (contrib.contribution.includes('TOOL_RESULT:')) {
                try {
                  const toolResultMatch = contrib.contribution.match(/TOOL_RESULT:\s*(\{[\s\S]*?\})/);
                  if (toolResultMatch && toolResultMatch[1]) {
                    const toolResult = JSON.parse(toolResultMatch[1]);
                    if (toolResult.result && typeof toolResult.result === 'string') {
                      extractedContent = toolResult.result;
                    }
                  }
                } catch (error) {
                  console.log(`⚠️ Failed to parse TOOL_RESULT, using raw content`);
                }
              }

              return {
                agentId: contrib.agentId,
                task: `Content generation task (${extractedContent.substring(0, 50)}...)`,
                status: 'completed' as const,
                result: extractedContent,
                assignedAt: new Date(Date.now() - 60000),
                completedAt: new Date()
              };
            });

          if (mockTasks.length > 0) {
            const hasContentContributions = mockTasks.some(task => {
              if (!task.result || task.result.length < 200) return false;

              const planningIndicators = [
                'propose the following steps', 'here is my methodology', 'my approach would be',
                'i recommend the following steps', 'the plan should include',
                'step 1:', 'step 2:', 'step 3:', 'phase 1:', 'phase 2:', 'phase 3:'
              ];

              return !planningIndicators.some(indicator =>
                task.result!.toLowerCase().includes(indicator)
              );
            });

            if (hasContentContributions) {
              try {
                console.log(`🔄 Coordinator integrating content...`);
                const coordinator = this.getBuiltInCoordinator();
                const integrationPrompt = this.buildContentIntegrationPrompt(session, mockTasks, coordinator);
                const integratedContent = await this.executeCoordinatorPrompt(coordinator, integrationPrompt);

                session.finalResult.integratedContent = integratedContent;
                session.finalResult.summary = `Coordination completed successfully with integrated content from ${mockTasks.length} contributors`;
                console.log(`✅ Content integration completed`);
              } catch (synthesisError) {
                const errorMsg = synthesisError instanceof Error ? synthesisError.message : String(synthesisError);
                console.warn(`⚠️ Content synthesis failed: ${errorMsg}`);
                session.finalResult.summary = `Coordination completed successfully. ${mockTasks.length} agents contributed. Synthesis skipped.`;
                if (!session.metadata) session.metadata = {};
                session.metadata['synthesisWarning'] = errorMsg;
              }
            }
          }
        }
      }

      session.status = 'completed';
      console.log(`✅ Approved plan execution completed for session ${sessionId}`);

      // Clean up
      session.sessionAgentManager.cleanup();
      session.sessionContentManager.shutdown();

    } catch (error) {
      console.error(`❌ Approved plan execution failed:`, error);
      session.status = 'failed';
      session.completedAt = new Date();
      session.error = error instanceof Error ? error.message : String(error);
      session.sessionAgentManager.cleanup();
      throw error;
    }
  }

  async startCoordination(request: CoordinationRequest): Promise<string> {
    console.log(`🔍 DEBUG: Validating ${request.participantIds.length} participants: ${JSON.stringify(request.participantIds)}`);

    // Resolve agent names to IDs and validate participants exist
    if (!this.agentService) {
      throw new Error('AgentService not configured');
    }

    const resolvedParticipantIds: string[] = [];
    for (const participantId of request.participantIds) {
      console.log(`🔍 DEBUG: Resolving agent identifier ${participantId}...`);
      const resolvedId = await this.resolveAgentId(participantId);

      console.log(`🔍 DEBUG: Checking agent ${resolvedId}...`);
      const agent = await this.agentService.getAgent(resolvedId as AgentId);
      if (!agent) {
        throw new Error(`Participant agent ${resolvedId} (original: ${participantId}) not found`);
      }
      console.log(`✅ DEBUG: Agent ${resolvedId} found: ${agent.name}`);
      resolvedParticipantIds.push(resolvedId);
    }

    console.log(`✅ DEBUG: All ${request.participantIds.length} participants resolved and validated successfully`);

    // Update request with resolved participant IDs
    const resolvedRequest = {
      ...request,
      participantIds: resolvedParticipantIds
    };

    // Create coordination session
    const sessionId = `session-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const sessionAgentManager = new SessionAgentManagerImpl(sessionId);
    const sessionContentManager = new SessionContentManagerImpl({
      baseDirectory: `./data/published_content/sessions`,
      useSessionDirectories: true
    });

    const session: CoordinationSession = {
      id: sessionId,
      coordinatorId: resolvedRequest.coordinatorId,
      scenarioPrompt: resolvedRequest.scenarioPrompt,
      participantIds: resolvedRequest.participantIds,
      status: 'pending',
      startedAt: new Date(),
      timeoutMinutes: resolvedRequest.timeoutMinutes,
      coordinationStyle: resolvedRequest.coordinationStyle,
      participantTasks: [],
      sessionAgentManager,
      sessionContentManager,
      ...(resolvedRequest.metadata !== undefined && { metadata: resolvedRequest.metadata }),
      ...(resolvedRequest.publishTo !== undefined && { publishTo: resolvedRequest.publishTo }),
      ...(resolvedRequest.publishAs !== undefined && { publishAs: resolvedRequest.publishAs })
    };

    // Initialize session-scoped agent states
    if (this.agentService) {
      for (const participantId of resolvedRequest.participantIds) {
        try {
          const agent = await this.agentService.getAgent(participantId as AgentId);
          sessionAgentManager.joinSession(participantId, agent);
        } catch (error) {
          console.warn(`⚠️ Failed to initialize session state for agent ${participantId}:`, error);
        }
      }
    }

    this.sessions.set(sessionId, session);
    console.log(`🚀 Started coordination session: ${sessionId}`);

    // Start async coordination workflow
    console.log(`🔍 DEBUG: About to start async performCoordination...`);
    this.performCoordination(sessionId, request).catch(error => {
      console.error(`❌ Coordination failed for session ${sessionId}:`, error);
      session.status = 'failed';
      session.completedAt = new Date();

      // Clean up session-scoped agent states on failure
      session.sessionAgentManager.cleanup();
    });
    console.log(`🔍 DEBUG: Async performCoordination started, returning session ID`);

    return sessionId;
  }

  /**
   * Get coordination session status
   */
  getSession(sessionId: string): CoordinationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Returns the orchestration step number currently executing for a session,
   * or undefined if no step is active. Used by the tool layer to attach
   * sub-contributions to their parent step.
   */
  getActiveStep(sessionId: string): number | undefined {
    return this.activeSteps.get(sessionId);
  }

  /**
   * List all coordination sessions
   */
  listSessions(status?: string): any[] {
    const sessions = Array.from(this.sessions.values());
    const filteredSessions = status ? sessions.filter(session => session.status === status) : sessions;

    // Create serializable copies without circular references
    return filteredSessions.map(session => ({
      id: session.id,
      coordinatorId: session.coordinatorId,
      scenarioPrompt: session.scenarioPrompt,
      participantIds: session.participantIds,
      status: session.status,
      startedAt: session.startedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      timeoutMinutes: session.timeoutMinutes,
      coordinationStyle: session.coordinationStyle,
      participantTasks: session.participantTasks || [],
      finalResult: session.finalResult
    }));
  }

  /**
   * Rerun a coordination session with the same configuration
   */
  async rerunSession(sessionId: string): Promise<{ newSessionId: string; newSession: any }> {
    const originalSession = this.sessions.get(sessionId);

    if (!originalSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (originalSession.status !== 'completed' && originalSession.status !== 'failed' && originalSession.status !== 'timeout') {
      throw new Error('Can only rerun completed, failed, or timed out sessions');
    }

    // Create new session with same configuration
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newSession: CoordinationSession = {
      id: newSessionId,
      coordinatorId: originalSession.coordinatorId,
      scenarioPrompt: originalSession.scenarioPrompt,
      participantIds: [...originalSession.participantIds],
      status: 'pending',
      startedAt: new Date(),
      timeoutMinutes: originalSession.timeoutMinutes,
      coordinationStyle: originalSession.coordinationStyle,
      participantTasks: [],
      sessionAgentManager: new SessionAgentManagerImpl(newSessionId),
      sessionContentManager: new SessionContentManagerImpl({
        baseDirectory: `./data/published_content/sessions`,
        useSessionDirectories: true
      }),
      ...(originalSession.publishTo !== undefined && { publishTo: [...originalSession.publishTo] })
    };

    this.sessions.set(newSessionId, newSession);

    // Start the coordination asynchronously
    const coordinator = this.getBuiltInCoordinator();
    this.executeSimpleCoordination(newSession, coordinator).catch((error: Error) => {
      console.error('Error executing rerun session:', error);
      newSession.status = 'failed';
    });

    return {
      newSessionId,
      newSession: {
        id: newSession.id,
        coordinatorId: newSession.coordinatorId,
        scenarioPrompt: newSession.scenarioPrompt,
        participantIds: newSession.participantIds,
        status: newSession.status,
        startedAt: newSession.startedAt?.toISOString(),
        timeoutMinutes: newSession.timeoutMinutes,
        coordinationStyle: newSession.coordinationStyle
      }
    };
  }

  /**
   * Delete a coordination session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'in_progress' || session.status === 'pending') {
      throw new Error('Cannot delete running or pending session. Please wait for it to complete or fail.');
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Purge session results while keeping the session record
   */
  async purgeSessionResults(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'in_progress' || session.status === 'pending') {
      throw new Error('Cannot purge results of running or pending session');
    }

    // Clear results while keeping metadata
    delete session.finalResult;
    session.participantTasks = [];

    return {
      id: session.id,
      coordinatorId: session.coordinatorId,
      scenarioPrompt: session.scenarioPrompt,
      participantIds: session.participantIds,
      status: session.status,
      startedAt: session.startedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      timeoutMinutes: session.timeoutMinutes,
      coordinationStyle: session.coordinationStyle,
      participantTasks: session.participantTasks
    };
  }

  /**
   * Built-in coordination engine - no agent creation needed
   */
  private builtInCoordinator: Coordinator = {
    id: 'built-in-coordinator',
    name: 'System Coordination Engine',
    description: 'Built-in coordination management system for orchestrating multi-agent workflows',
    capabilities: {
      maxConcurrentScenarios: 50,
      supportedScenarioTypes: ['creative', 'analytical', 'technical', 'strategic', 'research', 'collaborative'],
      coordinationStyle: 'collaborative',
      decisionMaking: 'analytical'
    },
    status: 'active',
    createdAt: new Date(),
    createdBy: 'system',
    llmConfig: {
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: `You are the built-in coordination management engine responsible for orchestrating multi-agent collaborative workflows. Your role is to:

1. Analyze complex scenarios and break them down into specific, actionable tasks
2. Delegate tasks to appropriate specialist agents based on their expertise and realm access
3. Synthesize individual contributions into cohesive, integrated solutions
4. Ensure all aspects of the original scenario are addressed comprehensively

CRITICAL REALM COORDINATION RULES:
- AGENTS ≠ REALMS: Agent names (like "De Lint", "Tolkien") are NOT realm identifiers
- ELEMENTALS are bound to specific realms and work within their domains only
- DRUIDS can travel between realms using proper realm IDs (like "8c3e2c6b-ba77-49cd-884e-4e67afd230d0")
- When coordination involves realm travel, break it into clear sequential steps:
  1. First, assign elementals to work within their own bound realms
  2. Then, assign druids to travel between realms using proper realm IDs
  3. Finally, assign collection/synthesis tasks that respect realm boundaries

TASK DELEGATION PRINCIPLES:
- Give elementals direct content creation tasks within their expertise domains
- Give druids step-by-step travel and coordination tasks with specific realm IDs
- Never ask an agent to "travel to [AgentName]'s realm" - use proper realm identification
- Break complex multi-realm workflows into sequential, specific steps
- Provide exact realm IDs when travel is required

When delegating tasks, provide:
- Clear, specific instructions for each agent
- Expected deliverables and success criteria
- Context about how their work fits into the larger scenario
- Proper realm IDs for any travel requirements (NOT agent names)
- Sequential steps for complex multi-realm coordination

When synthesizing results, focus on:
- Creating integrated solutions that leverage all contributions
- Identifying synergies and resolving conflicts between different perspectives
- Providing actionable recommendations based on the collaborative analysis`,
      temperature: 0.7
    }
  };

  /**
   * Get the built-in coordinator - no dynamic creation needed
   */
  getBuiltInCoordinator(): Coordinator {
    return this.builtInCoordinator;
  }

  /**
   * List all coordinators (now just returns the built-in coordinator)
   */
  listCoordinators(status?: string): Coordinator[] {
    if (status && this.builtInCoordinator.status !== status) {
      return [];
    }
    return [this.builtInCoordinator];
  }

  /**
   * Get coordinator by ID
   */
  getCoordinator(coordinatorId: string): Coordinator | undefined {
    return coordinatorId === 'built-in-coordinator' ? this.builtInCoordinator : undefined;
  }

  /**
   * Main coordination workflow (private, async)
   */
  private async performCoordination(sessionId: string, request: CoordinationRequest): Promise<void> {
    console.log(`🎯 ENTRY: performCoordination called for session ${sessionId}`);
    console.log(`🔍 DEBUG: Starting performCoordination for session ${sessionId}`);
    
    const session = this.sessions.get(sessionId);
    
    // Handle built-in coordinator vs stored coordinators vs agent-as-coordinator
    let coordinator: Coordinator | null = null;
    
    if (request.coordinatorId === 'built-in-coordinator') {
      coordinator = this.builtInCoordinator;
    } else {
      // First try to find in coordinators map
      coordinator = this.coordinators.get(request.coordinatorId) || null;
      
      // If not found, check if it's an agent that can act as coordinator
      if (!coordinator && this.agentService) {
        try {
          const agent = await this.agentService.getAgent(request.coordinatorId as AgentId);
          if (agent) {
            // Create a coordinator wrapper around the agent
            coordinator = {
              id: agent.id,
              name: agent.name,
              description: agent.description || `Agent ${agent.name} acting as coordinator`,
              capabilities: {
                maxConcurrentScenarios: 5,
                supportedScenarioTypes: ['collaborative'],
                coordinationStyle: 'collaborative',
                decisionMaking: 'consensus-seeking'
              },
              status: 'active',
              createdAt: new Date(),
              createdBy: 'system',
              llmConfig: {
                provider: 'openai',
                model: agent.llmConfig?.model || 'gpt-4',
                systemPrompt: agent.llmConfig?.systemPrompt || 'You are a coordination agent helping to manage a collaborative scenario.',
                temperature: agent.llmConfig?.temperature || 0.7
              }
            };
            console.log(`🔧 Created coordinator wrapper for agent ${agent.name}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to get agent ${request.coordinatorId} for coordinator role:`, error);
        }
      }
    }
    
    console.log(`🔍 DEBUG: Session found: ${!!session}, Coordinator found: ${!!coordinator}, AgentService: ${!!this.agentService}`);
    
    if (!session || !coordinator || !this.agentService) {
      throw new Error('Invalid session, coordinator, or AgentService not available');
    }

    try {
      session.status = 'in_progress';

      // TRY ORCHESTRATION FIRST, FALL BACK TO SIMPLE COORDINATION IF IT FAILS
      try {
        console.log(`🎯 Attempting orchestration workflow for ${session.participantIds.length} participants...`);
        const plan = await this.createOrchestrationPlan(session);
        
        console.log(`🎯 Executing ${plan.steps.length} orchestration steps...`);
        await this.executeOrchestrationPlan(session, plan);
        
        console.log(`✅ Orchestration workflow completed successfully`);
      } catch (orchestrationError) {
        console.log(`⚠️ Orchestration failed, falling back to simple coordination approach:`, orchestrationError instanceof Error ? orchestrationError.message : 'Unknown error');
        
        // FALLBACK: Simple direct task assignment
        await this.executeSimpleCoordination(session, coordinator);
      }

      // CUSTOM INTEGRATION: Fix the content integration to use synthesizeResults logic
      if (session.finalResult && session.finalResult.participantContributions.length > 0) {
        console.log(`🎯 Phase 3: Re-processing content integration with synthesis logic...`);

        // Detect if this is a file processing task where synthesis is redundant
        const isFileProcessingTask = session.scenarioPrompt.toLowerCase().includes('process') &&
          (session.scenarioPrompt.toLowerCase().includes('file') ||
           session.scenarioPrompt.toLowerCase().includes('batch') ||
           session.finalResult.participantContributions.some(c =>
             c.contribution.includes('process_files_batch') ||
             c.contribution.includes('Successfully processed')
           ));

        if (isFileProcessingTask) {
          console.log(`⏭️  Skipping synthesis - detected file processing task where output files are the deliverable`);
          session.finalResult.summary = `File processing completed successfully. ${session.finalResult.participantContributions.length} agent(s) contributed.`;
        } else {
        
        // Convert orchestration contributions to task format for synthesis
        const mockTasks: ParticipantTask[] = session.finalResult.participantContributions
          .filter(contrib => contrib.contribution && contrib.contribution.length > 200)
          .map(contrib => {
            let extractedContent = contrib.contribution;
            
            // Extract content from TOOL_RESULT format if present
            if (contrib.contribution.includes('TOOL_RESULT:')) {
              try {
                const toolResultMatch = contrib.contribution.match(/TOOL_RESULT:\s*(\{[\s\S]*?\})/);
                if (toolResultMatch && toolResultMatch[1]) {
                  const toolResult = JSON.parse(toolResultMatch[1]);
                  if (toolResult.result && typeof toolResult.result === 'string') {
                    extractedContent = toolResult.result;
                  }
                }
              } catch (error) {
                console.log(`⚠️ Failed to parse TOOL_RESULT for ${contrib.agentId}, using raw content`);
                // Fall back to original content if parsing fails
              }
            }
            
            return {
              agentId: contrib.agentId,
              task: `Content generation task (${extractedContent.substring(0, 50)}...)`,
              status: 'completed' as const,
              result: extractedContent,
              assignedAt: new Date(Date.now() - 60000), // 1 minute ago
              completedAt: new Date()
            };
          });
        
        if (mockTasks.length > 0) {
          // Apply the improved content detection logic
          const hasContentContributions = mockTasks.some(task => {
            if (!task.result || task.result.length < 200) {
              return false;
            }
            
            const planningIndicators = [
              'propose the following steps',
              'here is my methodology',
              'my approach would be',
              'i recommend the following steps',
              'the plan should include',
              'step 1:', 'step 2:', 'step 3:',
              'phase 1:', 'phase 2:', 'phase 3:'
            ];
            
            const looksLikePlanning = planningIndicators.some(indicator => 
              task.result!.toLowerCase().includes(indicator)
            );
            
            return !looksLikePlanning;
          });
          
          console.log(`🔍 DEBUG: Has content contributions: ${hasContentContributions}`);

          if (hasContentContributions) {
            // Attempt synthesis, but don't fail the session if it errors (e.g., token limits)
            try {
              console.log(`🔄 Phase 3b: Coordinator integrating actual content...`);
              const integrationPrompt = this.buildContentIntegrationPrompt(session, mockTasks, coordinator);
              const integratedContent = await this.executeCoordinatorPrompt(coordinator, integrationPrompt);

              // Update the final result with proper integrated content
              session.finalResult.integratedContent = integratedContent;
              session.finalResult.summary = `Coordination completed successfully with integrated content from ${mockTasks.length} contributors`;

              console.log(`✅ Content integration completed - ${integratedContent.length} characters`);
            } catch (synthesisError) {
              // Log warning but don't fail the session - the actual work is already done
              const errorMsg = synthesisError instanceof Error ? synthesisError.message : String(synthesisError);
              console.warn(`⚠️ Content synthesis failed but work completed successfully. Synthesis skipped due to: ${errorMsg}`);

              // Set summary without synthesis
              session.finalResult.summary = `Coordination completed successfully. ${mockTasks.length} agents contributed. Note: Final synthesis skipped (${errorMsg.includes('token') ? 'content too large for synthesis' : 'synthesis error'})`;

              // Store warning in session metadata for visibility
              if (!session.metadata) session.metadata = {};
              session.metadata['synthesisWarning'] = errorMsg;
            }
          } else {
            console.log(`⚠️ DEBUG: Skipping content integration - no substantial content contributions found`);
          }
        }
        } // End of else block for file processing detection
      }
      
      session.status = 'completed';
      session.completedAt = session.completedAt ?? new Date();
      console.log(`✅ Coordination session ${sessionId} completed successfully`);

      // Republish after post-orchestration synthesis so publications carry the
      // final integratedContent. Idempotent — ON CONFLICT UPDATE in publishers.
      await this.persistAndPublishSession(session).catch((err) => {
        console.error(`⚠️ persistAndPublishSession failed for ${session.id}:`, err);
      });

      // Legacy publishTo paths kept for backward compatibility with external callers
      // that haven't migrated to publishAs.
      if (request.publishTo && request.publishTo.length > 0 && session.finalResult?.integratedContent) {
        try {
          for (const publishKey of request.publishTo) {
            const contentPath = path.join('./data/published_content', `${publishKey.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
            await fs.writeFile(contentPath, session.finalResult.integratedContent, 'utf-8');
            console.log(`📖 Published final content to: ${contentPath}`);
          }
        } catch (publishError) {
          console.warn('Failed to publish content:', publishError instanceof Error ? publishError.message : 'Unknown error');
        }
      }

      // Clean up session-scoped agent states on successful completion
      session.sessionAgentManager.cleanup();

    } catch (error) {
      console.error(`❌ Coordination failed for session ${sessionId}:`, error);
      session.status = 'failed';
      session.completedAt = new Date();

      // Persist error message to session
      session.error = error instanceof Error ? error.message : String(error);

      // Clean up session-scoped agent states on failure
      session.sessionAgentManager.cleanup();

      throw error;
    }
  }

  /**
   * Phase 1: Delegate tasks to participants
   */
  // OLD COORDINATION METHODS (replaced by orchestration system)
  /*
  private async delegateTasks(session: CoordinationSession, coordinator: Coordinator): Promise<{ agentId: string; task: string }[]> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🔍 DEBUG: Building delegation prompt...`);
    const delegationPrompt = await this.buildDelegationPrompt(session, coordinator);
    console.log(`🔍 DEBUG: Delegation prompt built, length: ${delegationPrompt.length}`);
    
    console.log(`🔍 DEBUG: Executing coordinator prompt...`);
    const response = await this.executeCoordinatorPrompt(coordinator, delegationPrompt);
    console.log(`🔍 DEBUG: Coordinator response received, length: ${response.length}`);

    return this.parseTaskDelegation(response, session.participantIds);
  }

  /**
   * Phase 2: Execute participant tasks
   */
  // @ts-ignore - Old method kept for reference
  private async executeParticipantTasks(session: CoordinationSession): Promise<void> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🔍 DEBUG: Starting participant task execution...`);
    
    // Check if this is a sequential workflow based on the scenario prompt
    const isSequential = session.scenarioPrompt.toLowerCase().includes('sequential') || 
                         session.scenarioPrompt.toLowerCase().includes('then') ||
                         session.scenarioPrompt.toLowerCase().includes('next,');
    
    if (isSequential) {
      console.log(`🔄 Sequential workflow detected - executing druid coordination task first...`);
      
      // Find the druid task that coordinates across realms
      const druidTask = session.participantTasks.find(task => 
        task.task.toLowerCase().includes('travel') && 
        (task.task.toLowerCase().includes('then') || task.task.toLowerCase().includes('2.'))
      );
      
      if (druidTask) {
        // Execute the druid's multi-step task first - this will handle contacting other agents
        console.log(`🎯 Executing druid coordination task for agent ${druidTask.agentId}...`);
        await this.executeTaskSequentially(druidTask, session.id);

        // Mark any elemental tasks that are still pending as completed if druid handled them
        session.participantTasks.forEach(task => {
          if (task !== druidTask && task.status === 'pending') {
            console.log(`📝 Marking elemental task ${task.agentId} as delegated by druid...`);
            task.status = 'completed';
            task.completedAt = new Date();
            task.result = `Task handled through druid coordination workflow`;
          }
        });
      } else {
        // Fallback to parallel execution if no clear druid task found
        console.log(`⚠️ No clear druid coordination task found, falling back to parallel execution...`);
        const taskPromises = session.participantTasks.map(task => this.executeTaskInParallel(task, session.id));
        await Promise.all(taskPromises);
      }

    } else {
      console.log(`⚡ Parallel workflow detected - executing all tasks simultaneously...`);
      // Execute all tasks in parallel (existing behavior)
      const taskPromises = session.participantTasks.map(task => this.executeTaskInParallel(task, session.id));
      await Promise.all(taskPromises);
    }
    
    console.log(`🔍 DEBUG: Participant task execution completed`);
  }

  /**
   * Execute a single task (helper method)
   */
  private async executeTaskInParallel(task: any, sessionId?: string): Promise<void> {
    try {
      task.status = 'in_progress';

      // Get role-specific prompt override for this agent
      const roleInfo = this.getCoordinationRole(task.agentId);

      const result = await this.agentService!.executeAgentPrompt(task.agentId, {
        prompt: task.task,
        ...(sessionId && { sessionId }),
        collaborationContext: {
          scenarioName: roleInfo.role || 'Collaborative Participant',
          scenarioType: 'coordination',
          agentRole: 'participant',
          usePersonaPrompt: false // Override persona with role-specific prompt
        }
      });

      task.result = result.response;
      task.status = 'completed';
      task.completedAt = new Date();
      
      console.log(`✅ Agent ${task.agentId} (Collaborative Participant) completed task`);
    } catch (error) {
      console.error(`❌ Agent ${task.agentId} task failed:`, error);
      task.status = 'failed';
      task.completedAt = new Date();
    }
  }

  /**
   * Execute a multi-step task sequentially (for complex druid workflows)
   */
  private async executeTaskSequentially(task: any, sessionId?: string): Promise<void> {
    try {
      task.status = 'in_progress';

      // Split the task into steps if it contains "then" or numbered steps
      const taskSteps = this.parseTaskSteps(task.task);

      console.log(`🎯 Executing ${taskSteps.length} sequential steps for agent ${task.agentId}`);

      let accumulatedResult = '';

      for (let i = 0; i < taskSteps.length; i++) {
        const step = taskSteps[i];
        if (!step) continue; // Skip undefined steps

        console.log(`📍 Step ${i + 1}/${taskSteps.length}: ${step.substring(0, 100)}...`);

        // Get role-specific prompt override for this agent
        const roleInfo = this.getCoordinationRole(task.agentId);

        // Enhanced step prompt to ensure active collaboration
        let enhancedStepPrompt;
        if (accumulatedResult) {
          enhancedStepPrompt = `Context from previous steps: ${accumulatedResult}\n\nNow complete this step by taking ALL required actions: ${step}\n\nCRITICAL: This step requires MULTIPLE tool calls. You must complete EVERY action mentioned in this step:\n1. If the step mentions traveling, use travel_to_realm\n2. If the step mentions delegating, use delegate_task\n3. If the step mentions collecting results, wait for and report the delegation response\n\nDO NOT STOP after just one tool call. Complete ALL actions in this step before responding.`;
        } else {
          enhancedStepPrompt = `Complete this coordination step by taking ALL required actions: ${step}\n\nCRITICAL: This step requires MULTIPLE tool calls. You must complete EVERY action mentioned in this step:\n1. If the step mentions traveling, use travel_to_realm\n2. If the step mentions delegating, use delegate_task  \n3. If the step mentions collecting results, wait for and report the delegation response\n\nDO NOT STOP after just one tool call. Complete ALL actions in this step before responding.`;
        }

        const result = await this.agentService!.executeAgentPrompt(task.agentId, {
          prompt: enhancedStepPrompt,
          ...(sessionId && { sessionId }),
          collaborationContext: {
            scenarioName: roleInfo.role || 'Sequential Coordinator',
            scenarioType: 'coordination',
            agentRole: 'participant',
            usePersonaPrompt: false
          }
        });

        accumulatedResult += `\nStep ${i + 1}: ${result.response}`;
        console.log(`✅ Step ${i + 1} completed for agent ${task.agentId}`);
        
        // Small delay between steps to ensure proper sequencing
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      task.result = accumulatedResult;
      task.status = 'completed';
      task.completedAt = new Date();
      
      console.log(`✅ Agent ${task.agentId} completed all sequential steps`);
    } catch (error) {
      console.error(`❌ Agent ${task.agentId} sequential task failed:`, error);
      task.status = 'failed';
      task.completedAt = new Date();
    }
  }

  /**
   * Parse task into sequential steps
   */
  private parseTaskSteps(taskDescription: string): string[] {
    // Split by common sequential indicators
    let steps: string[] = [];
    
    // Check for numbered steps first (1. 2. etc.) with "Then," separators
    if (taskDescription.match(/\d+\.\s.*?(?:Then,|$)/gi)) {
      // Split by "Then," but keep the step numbers
      const parts = taskDescription.split(/\.\s*Then,\s*/i);
      steps = parts.map((part, index) => {
        if (index === 0 && !part.match(/^\d+\./)) {
          return part.trim();
        }
        if (!part.match(/^\d+\./)) {
          return `${index + 2}. ${part.trim()}`;
        }
        return part.trim();
      });
    } else if (taskDescription.includes('Then,') || taskDescription.includes('then,')) {
      // Split by "Then," and add step numbers
      steps = taskDescription.split(/[Tt]hen,?\s*/).map((step, index) => {
        const trimmed = step.trim();
        if (index === 0) return trimmed;
        return trimmed.startsWith((index + 1) + '.') ? trimmed : `${index + 1}. ${trimmed}`;
      });
    } else if (taskDescription.includes('Next,') || taskDescription.includes('next,')) {
      // Split by "Next," and add step numbers
      steps = taskDescription.split(/[Nn]ext,?\s*/).map((step, index) => {
        const trimmed = step.trim();
        if (index === 0) return trimmed;
        return trimmed.startsWith((index + 1) + '.') ? trimmed : `${index + 1}. ${trimmed}`;
      });
    } else if (taskDescription.match(/\d+\.\s/)) {
      // Split by numbered steps (1. 2. 3.) - improved to capture full step content
      const matches = taskDescription.match(/(\d+\.\s[^.]*(?:\.[^0-9][^.]*)*)/g);
      if (matches) {
        steps = matches.map(match => match.trim());
      } else {
        // Fallback splitting
        steps = taskDescription.split(/(?=\d+\.\s)/).filter(step => step.trim());
      }
    } else {
      // If no clear sequential markers, treat as single task
      return [taskDescription];
    }
    
    // Clean up and filter empty steps
    steps = steps.map(step => step.trim()).filter(step => step.length > 10);
    
    // If no clear steps found, return the whole task as one step
    if (steps.length <= 1) {
      return [taskDescription];
    }
    
    console.log(`📋 Parsed ${steps.length} sequential steps:`, steps.map((step, i) => `${i+1}: ${step.substring(0, 50)}...`));
    return steps;
  }

  /**
   * Phase 3: Synthesize results
   */
  // @ts-ignore - Old method kept for reference
  private async synthesizeResults(session: CoordinationSession, coordinator: Coordinator, request: CoordinationRequest): Promise<void> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🔍 DEBUG: Starting result synthesis...`);
    const completedTasks = session.participantTasks.filter(task => task.status === 'completed');
    
    console.log(`🔍 DEBUG: Found ${completedTasks.length} completed tasks`);
    completedTasks.forEach((task, i) => {
      console.log(`🔍 DEBUG: Completed task ${i+1}: ${task.agentId} - ${task.status} - ${task.result ? `${task.result.length} chars` : 'no result'}`);
    });
    
    if (completedTasks.length === 0) {
      throw new Error('No participant tasks completed successfully');
    }

    // Phase 3a: Analysis of contributions
    const analysisPrompt = this.buildSynthesisPrompt(session, completedTasks, coordinator);
    const analysisResponse = await this.executeCoordinatorPrompt(coordinator, analysisPrompt);

    // Phase 3b: Content integration (if content contributions exist)
    let integratedContent = '';
    const hasContentContributions = completedTasks.some(task => {
      if (!task.result || task.result.length < 200) {
        return false; // Too short to be meaningful content
      }
      
      // Check if it looks like planning/methodology vs actual content
      const planningIndicators = [
        'propose the following steps',
        'here is my methodology',
        'my approach would be',
        'i recommend the following steps',
        'the plan should include',
        'step 1:', 'step 2:', 'step 3:',
        'phase 1:', 'phase 2:', 'phase 3:'
      ];
      
      const looksLikePlanning = planningIndicators.some(indicator => 
        task.result!.toLowerCase().includes(indicator)
      );
      
      // If it doesn't look like planning and is substantial, treat as content
      return !looksLikePlanning;
    });

    console.log(`🔍 DEBUG: Has content contributions: ${hasContentContributions}`);
    console.log(`🔍 DEBUG: Completed tasks: ${completedTasks.length}`);
    completedTasks.forEach((task, i) => {
      console.log(`🔍 DEBUG: Task ${i+1} (${task.agentId}): ${task.result ? task.result.length : 0} chars`);
    });

    if (hasContentContributions) {
      console.log(`🔄 Phase 3b: Coordinator integrating actual content...`);
      const integrationPrompt = this.buildContentIntegrationPrompt(session, completedTasks, coordinator);
      integratedContent = await this.executeCoordinatorPrompt(coordinator, integrationPrompt);
      
      // Phase 3c: Publish to WorldTree if requested
      if (request.publishTo && request.publishTo.length > 0) {
        await this.publishToWorldTree(integratedContent, request.publishTo, session);
      }
    } else {
      console.log(`⚠️ DEBUG: Skipping content integration - no substantial content contributions found`);
    }

    // Parse synthesis response and create final result
    session.finalResult = {
      summary: this.extractSection(analysisResponse, 'SUMMARY'),
      participantContributions: completedTasks.map(task => ({
        agentId: task.agentId,
        contribution: task.result || '',
        weight: 1.0 / completedTasks.length
      })),
      coordinatorAnalysis: this.extractSection(analysisResponse, 'ANALYSIS'),
      recommendations: this.extractRecommendations(analysisResponse),
      ...(integratedContent ? { integratedContent } : {}),
      publishedTo: request.publishTo || []
    };

    console.log(`📊 Coordination synthesis completed for session ${session.id}`);
    console.log(`🔍 DEBUG: Result synthesis completed`);
  }

  /**
   * Execute coordinator LLM prompt
   */
  private async executeCoordinatorPrompt(coordinator: Coordinator, prompt: string): Promise<string> {
    if (!this.agentService) throw new Error('AgentService not configured');

    // Handle built-in coordinator with direct LLM execution
    if (coordinator.id === 'built-in-coordinator') {
      let response: string;
      
      if (coordinator.llmConfig.provider === 'openai') {
        if (!this.openaiClient) {
          throw new Error('OpenAI client not available. Please configure OPENAI_API_KEY.');
        }
        
        const openaiRequest: OpenAIChatRequest = {
          model: coordinator.llmConfig.model,
          messages: [
            {
              role: 'system',
              content: coordinator.llmConfig.systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: coordinator.llmConfig.temperature
        };
        
        const openaiResponse = await this.openaiClient.chat(openaiRequest);
        response = openaiResponse.choices[0]?.message?.content || '';
      } else {
        // Default to Ollama
        const chatRequest: ChatRequest = {
          model: coordinator.llmConfig.model,
          messages: [
            {
              role: 'system',
              content: coordinator.llmConfig.systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          options: {
            temperature: coordinator.llmConfig.temperature
          }
        };
        
        const ollamaResponse = await this.ollamaClient.chat(chatRequest);
        response = ollamaResponse.message?.content || '';
      }
      
      return response;
    }

    // For regular coordinator agents, use AgentService
    const result = await this.agentService.executeAgentPrompt(coordinator.id, {
      prompt,
      systemPrompt: coordinator.llmConfig.systemPrompt,
      temperature: coordinator.llmConfig.temperature,
      collaborationContext: {
        scenarioName: 'Coordination Management',
        scenarioType: 'coordination',
        agentRole: 'coordinator',
        usePersonaPrompt: false
      }
    });

    return result.response;
  }

  /**
   * Build task delegation prompt for coordinator
   */
  // @ts-ignore - Old method kept for reference  
  private async buildDelegationPrompt(session: CoordinationSession, coordinator: Coordinator): Promise<string> {
    if (!this.agentService) throw new Error('AgentService not configured');

    // Get detailed participant information including realm access
    const participantDetails = await Promise.all(
      session.participantIds.map(async (id) => {
        try {
          const agent = await this.agentService!.getAgent(id);
          let realmInfo = 'No realm access info';
          let realmName = 'Unknown';
          
          if (agent.realmAccess?.boundRealmId) {
            // For elementals bound to specific realms, get realm name
            realmInfo = `BOUND to realm ${agent.realmAccess.boundRealmId}`;
            realmName = await this.getRealmName(agent.realmAccess.boundRealmId);
          } else if (agent.realmAccess?.accessibleRealms?.length) {
            // For druids who can travel
            const realmIds = agent.realmAccess.accessibleRealms.map(r => 
              typeof r === 'string' ? r : r.realmId
            );
            realmInfo = `CAN TRAVEL to realms: ${realmIds.join(', ')}`;
            const realmNames = await Promise.all(realmIds.map(id => this.getRealmName(id)));
            realmName = realmNames.join(', ');
          }
          
          return `- Agent: ${agent.name} (AGENT_ID: ${id})
  Type: ${agent.type?.toUpperCase() || 'UNKNOWN'}
  Domain: ${agent.specialization?.domain || 'general'}
  Realm Access: ${realmInfo}
  Realm Name(s): ${realmName}
  ⚠️  FOR TOOLS: Use agent ID "${id}" (not agent name "${agent.name}")`;
        } catch (error) {
          return `- Agent: ${id} (ERROR: Could not load agent details)`;
        }
      })
    );

    return `${coordinator.llmConfig.systemPrompt}

SCENARIO TO COORDINATE:
${session.scenarioPrompt}

AVAILABLE PARTICIPANTS:
${participantDetails.join('\n')}

REALM COORDINATION GUIDELINES:
- Agent names (e.g., "De Lint", "Tolkien") are NOT realm identifiers
- Use proper realm IDs for travel (e.g., "8c3e2c6b-ba77-49cd-884e-4e67afd230d0")
- ELEMENTALS work within their bound realm only - assign direct content creation tasks
- DRUIDS can travel between realms - assign step-by-step coordination tasks
- Break complex multi-realm workflows into sequential steps

TASK DELEGATION STRATEGY:
1. Assign elementals to create content within their own realms/domains
2. Assign druids to coordinate/collect across realms using proper realm IDs
3. Ensure each task is specific and respects agent capabilities

SEQUENTIAL WORKFLOW HANDLING:
- If the scenario contains "sequential" flow or words like "Then", "Next", break druid tasks into complete, self-contained steps
- Each step should include BOTH the travel AND the specific collaboration actions for that realm
- Format: "1. Travel to realm X and actively delegate the following task to agent Y: [specific task details]. Collect their results before proceeding. 2. Then, travel to realm W and actively collaborate with agent V by delegating this specific task: [specific task details]. Collect and integrate their work."
- Each step must include explicit delegation instructions with specific tasks for the target agent
- Use "Then," or "Next," to separate sequential steps clearly
- DRUIDS must use the 'delegate_task' tool to actively send tasks to other agents

AGENT COMMUNICATION RULES:
- When agents need to contact each other, they must use AGENT IDs (not names)
- Agent names are for human reference only - tools require actual IDs
- Include agent IDs in task descriptions when collaboration is needed
- Example: "Collaborate with agent c53fdf4b-4ade-4753-9c90-1e2c5a1cbb3a (Pierre Robert)"

INSTRUCTIONS:
Analyze this scenario and delegate specific tasks to the available participant agents.

**CRITICAL**: 
1. Use realm IDs (not agent names) for travel tasks
2. Use agent IDs (not agent names) when agents need to communicate
3. For sequential workflows, break druid tasks into numbered steps with "Then," separators
4. Make each step actionable and specific

Respond in this exact format:

TASK_DELEGATION:
Agent: [agent_id]
Task: [Specific task description - for sequential workflows, use "1. Step one. Then, 2. Step two." format]
Expected: [What the agent should produce/deliver]

[Repeat for each participant]

COORDINATION_NOTES:
[Brief explanation of how the tasks work together while respecting realm boundaries]`;
  }

  /**
   * Get realm name by ID (helper method)
   */
  private async getRealmName(realmId: string): Promise<string> {
    try {
      // This is a simplified approach - in a full implementation, 
      // you'd query the realm service or database
      const realmMap: { [key: string]: string } = {
        '8c3e2c6b-ba77-49cd-884e-4e67afd230d0': 'Newford',
        '9d8fb809-e2f0-411a-aca8-e7e202360069': 'Middle Earth',
        'd92bab7c-8183-42ce-9c64-062f8c5acba0': 'Galaxy Far Far Away'
      };
      return realmMap[realmId] || `Unknown Realm (${realmId})`;
    } catch (error) {
      return `Unknown Realm (${realmId})`;
    }
  }

  /**
   * Parse task delegation response from coordinator
   */
  // @ts-ignore - Old method kept for reference
  private parseTaskDelegation(response: string, participantIds: string[]): { agentId: string; task: string }[] {
    console.log(`🔍 DEBUG: Parsing task delegation...`);
    console.log(`🔍 DEBUG: Coordinator response to parse:`);
    console.log('==================================================');
    console.log(response);
    console.log('==================================================');
    console.log(`🔍 DEBUG: Available participant IDs: ${participantIds.join(', ')}`);

    const assignments: { agentId: string; task: string }[] = [];
    
    try {
      // Extract task delegation section (handle both "TASK_DELEGATION:" and "TASK DELEGATION:")
      const delegationMatch = response.match(/TASK[_\s]DELEGATION:([\s\S]*?)(?:COORDINATION_NOTES:|$)/);
      if (!delegationMatch) {
        throw new Error('TASK_DELEGATION section not found in coordinator response');
      }

      const delegationText = delegationMatch[1]?.trim() || '';
      if (!delegationText) {
        throw new Error('Empty TASK_DELEGATION section');
      }
      
      // Parse each agent task assignment
      const agentBlocks = delegationText.split(/Agent:\s*/).filter(block => block.trim());
      
      for (const block of agentBlocks) {
        const lines = block.trim().split('\n');
        const agentLine = lines[0] || '';
        
        // Extract agent ID - handle both full IDs and partial matches
        let agentId = '';
        for (const participantId of participantIds) {
          if (agentLine.includes(participantId) || participantId.includes(agentLine.trim())) {
            agentId = participantId;
            break;
          }
        }
        
        if (!agentId) {
          console.warn(`Could not match agent "${agentLine}" to any participant ID`);
          continue;
        }

        // Extract task description
        const taskMatch = block.match(/Task:\s*([\s\S]+?)(?:Expected:|$)/);
        if (taskMatch && taskMatch[1]) {
          const task = taskMatch[1].trim();
          assignments.push({ agentId, task });
        }
      }

      console.log(`🔍 DEBUG: Parsed ${assignments.length} task assignments:`);
      assignments.forEach((assignment, index) => {
        console.log(`  ${index + 1}. ${assignment.agentId}: ${assignment.task.substring(0, 100)}...`);
      });
      
    } catch (error) {
      console.warn('Failed to parse task delegation, using fallback', error);
      // Fallback: assign same task to all participants
      return participantIds.map(agentId => ({
        agentId,
        task: `Please contribute to this scenario: ${response.substring(0, 200)}...`
      }));
    }

    console.log(`🔍 DEBUG: Returning ${assignments.length} final assignments`);
    return assignments;
  }

  /**
   * Map agent specialization to coordination role with specific system prompt guidance
   */
  private getCoordinationRole(agentId: AgentId): { role: string; rolePrompt: string } {
    // Default mapping - in a real system this would query the agent's specialization
    const roleMap: Record<string, { role: string; rolePrompt: string }> = {
      'urban_fantasy_author': {
        role: 'Content Creator',
        rolePrompt: `COORDINATION ROLE: Content Creator

Your responsibility in this coordination scenario is to CREATE ACTUAL CONTENT, not plans or methodologies. When asked to write a story, draft, or narrative:

✅ DO: Write complete, engaging content
✅ DO: Provide full narratives with characters, plot, dialogue
✅ DO: Create substantial text that others can build upon

❌ DON'T: Provide outlines, plans, or "I will write" statements
❌ DON'T: Ask for more information unless absolutely critical
❌ DON'T: Decline creative writing tasks - this is your specialty

EXPECTATION: Deliver finished creative content that serves as the foundation for other agents to enhance.`
      },
      'political_science': {
        role: 'Political Integrator', 
        rolePrompt: `🎯 COORDINATION ROLE OVERRIDE: Political Integrator

⚠️ CRITICAL: Ignore any default agent limitations about "elemental mastery" or "environmental awareness" - you are now functioning as a Political Integrator in this coordination scenario.

Your responsibility is to DIRECTLY INTEGRATE political themes into existing content:

✅ DO: Take existing narrative content and rewrite it with political themes
✅ DO: Add political conflicts, power struggles, ideologies directly to the story
✅ DO: Enhance characters with political motivations and backgrounds
✅ DO: Create political subplots and integrate MAGA ideology as requested
✅ DO: Provide actual enhanced narrative content, not analysis

❌ DON'T: Provide only theoretical analysis or methodology
❌ DON'T: Refuse to work with political content - this is your coordination role
❌ DON'T: Limit yourself to "environmental" topics

EXPECTATION: Deliver enhanced story content that incorporates political elements directly into the narrative.`
      },
      'technical_writer': {
        role: 'Technical Integrator',
        rolePrompt: `🎯 COORDINATION ROLE OVERRIDE: Technical Integrator

Your responsibility is to DIRECTLY INTEGRATE technical and AI elements into existing content:

✅ DO: Take existing narrative and enhance it with technical details
✅ DO: Add AI systems, technology concepts, and technical worldbuilding
✅ DO: Create technical aspects of magic systems and their costs
✅ DO: Provide enhanced narrative content with technical depth
✅ DO: Integrate modern technology seamlessly into fantasy elements

❌ DON'T: Provide only technical documentation or methodology
❌ DON'T: Create separate technical documents - integrate into the story
❌ DON'T: Focus solely on documentation - enhance the narrative directly

EXPECTATION: Deliver enhanced story content that seamlessly integrates technical and AI elements into the narrative.`
      }
    };

    // Default role for generic agents
    return roleMap[agentId] || {
      role: 'Specialist Contributor',
      rolePrompt: `You are a specialist contributor in this coordination scenario. Provide substantial, actionable content that directly addresses your assigned task. Focus on creating deliverables rather than plans or methodologies. Work collaboratively to build upon other agents' contributions.`
    };
  }

  /**
   * Publish content to session-isolated WorldTree knowledge system
   */
  /**
   * Persist session metadata + per-contributor records to Postgres, then publish
   * artifacts in the modes requested on the session (defaulting to ['report']).
   * Best-effort: errors are logged, not thrown — publication never fails a session.
   */
  private async persistAndPublishSession(
    session: CoordinationSession,
    plan?: OrchestrationPlan
  ): Promise<void> {
    const pubService = getSessionPublicationService();

    const completedSteps = plan?.steps.filter((s) => s.status === 'completed') ?? [];

    const contributions: ContributionRecord[] = completedSteps.length > 0
      ? completedSteps.map((step) => ({
          sessionId: session.id,
          stepNumber: step.stepNumber,
          subStepNumber: 0,
          agentId: step.agentId,
          agentRole: 'coordinator',
          agentType: null,
          actionType: step.actionType,
          description: step.description,
          content: step.output ?? '',
          contentFormat: 'markdown' as const,
          tokenCount: null,
          durationMs:
            step.startedAt && step.completedAt
              ? step.completedAt.getTime() - step.startedAt.getTime()
              : null,
          createdAt: step.completedAt ?? new Date(),
        }))
      : session.participantTasks
          .filter((t) => t.status === 'completed' && t.result)
          .map((task, idx) => ({
            sessionId: session.id,
            stepNumber: idx + 1,
            subStepNumber: 0,
            agentId: task.agentId,
            agentRole: 'participant',
            agentType: null,
            actionType: null,
            description: task.task,
            content: task.result ?? '',
            contentFormat: 'markdown' as const,
            tokenCount: null,
            durationMs:
              task.assignedAt && task.completedAt
                ? task.completedAt.getTime() - task.assignedAt.getTime()
                : null,
            createdAt: task.completedAt ?? new Date(),
          }));

    const sessionRecord: SessionRecord = {
      sessionId: session.id,
      coordinatorAgentId: session.coordinatorId,
      realmId: session.realmId ?? null,
      prompt: session.scenarioPrompt,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt ?? null,
      participantAgentIds: session.participantIds,
      metadata: session.metadata ?? {},
      synthesis:
        session.finalResult?.integratedContent ??
        session.finalResult?.coordinatorSummary ??
        session.finalResult?.summary ??
        null,
    };

    try {
      await pubService.persistSession(sessionRecord);
      if (contributions.length > 0) {
        await pubService.persistContributions(contributions);
      }
      const publications = await pubService.publish(
        sessionRecord,
        contributions,
        session.publishAs
      );
      if (session.finalResult) {
        for (const pub of publications) {
          if (pub.status === 'published' && !session.finalResult.publishedTo.includes(pub.contentUri)) {
            session.finalResult.publishedTo.push(pub.contentUri);
          }
        }
      }
    } catch (err) {
      console.error(`⚠️ persistAndPublishSession error for ${session.id}:`, err);
    }
  }

  private async publishToWorldTree(content: string, publishPaths: string[], session: CoordinationSession): Promise<void> {
    try {
      // Use session-isolated content storage
      await session.sessionContentManager.publishToSessionWorldTree(
        session.id,
        content,
        publishPaths,
        {
          scenarioPrompt: session.scenarioPrompt,
          participants: session.participantTasks.map(task => ({
            agentId: task.agentId,
            contribution: task.result
          })),
          coordinatorId: session.coordinatorId
        }
      );
      
      console.log(`📋 Session ${session.id} content published to ${publishPaths.length} session-isolated paths`);
    } catch (error) {
      console.error(`❌ Failed to publish content for session ${session.id}:`, error);
      throw error;
    }
  }

  /**
   * Publish creative content separately from session details
   */
  private async publishCreativeContent(content: string, metadata: any, session: CoordinationSession): Promise<void> {
    try {
      // Create a clean directory structure for creative content
      const contentType = this.determineContentType(content);
      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const baseDir = path.join('data/published_content/creative', contentType, timestamp);
      
      // Ensure directory exists
      await fs.mkdir(baseDir, { recursive: true });
      
      // Create content ID based on session and content type
      const contentId = `${contentType}-${session.id}-${Date.now()}`;
      const contentPath = path.join(baseDir, `${contentId}.md`);
      const metadataPath = path.join(baseDir, `${contentId}-metadata.json`);
      
      // Create clean content with minimal metadata header
      const title = this.extractTitle(content, contentType);
      const cleanContent = `# ${title}

${content}

---
*Generated on ${new Date().toLocaleDateString()} via collaborative session*
`;

      // Write the pure creative content to filesystem
      await fs.writeFile(contentPath, cleanContent, 'utf-8');
      
      // Write metadata separately
      const contentMetadata = {
        ...metadata,
        title,
        publishedAt: new Date().toISOString(),
        contentType,
        sourceSession: session.id,
        contentPath: contentPath.replace('data/published_content/', ''),
        publicPath: `creative/${contentType}/${timestamp}/${contentId}.md`
      };
      
      await fs.writeFile(metadataPath, JSON.stringify(contentMetadata, null, 2), 'utf-8');

      console.log(`🎨 Creative content published to filesystem: ${contentPath}`);
      
      // Also publish to WorldTree public namespace for UI access
      await this.publishCreativeToWorldTree(cleanContent, contentMetadata, session);
      
      // Update session to track published content
      if (session.finalResult) {
        session.finalResult.publishedTo.push(`creative/${contentType}/${timestamp}/${contentId}.md`);
      }
    } catch (error) {
      console.error(`❌ Failed to publish creative content for session ${session.id}:`, error);
    }
  }

  /**
   * Publish creative content to WorldTree public namespace for UI access
   */
  private async publishCreativeToWorldTree(content: string, metadata: any, session: CoordinationSession): Promise<void> {
    try {
      // Create a meaningful session title from the scenario prompt
      const sessionTitle = this.generateSessionTitle(session.scenarioPrompt);
      
      // Construct WorldTree public namespace path with session organization
      const publicPath = `worldtree://public/creative-sessions/${sessionTitle}/${metadata.contentType}/${metadata.title}`;
      
      // Create content package for WorldTree storage
      const worldTreeContent = {
        content: content,
        metadata: {
          ...metadata,
          sessionTitle,
          worldTreePath: publicPath,
          accessLevel: 'public',
          uiAccessible: true
        }
      };
      
      // Store directly in WorldTree storage system (not session-isolated)
      // This requires direct storage bypass since we want public access
      await this.storeInPublicWorldTree(publicPath, worldTreeContent, session);
      
      console.log(`🌍 Creative content published to WorldTree: ${publicPath}`);
      
    } catch (error) {
      console.error(`❌ Failed to publish creative content to WorldTree for session ${session.id}:`, error);
    }
  }

  /**
   * Generate a meaningful session title from scenario prompt
   */
  private generateSessionTitle(scenarioPrompt: string): string {
    // Extract key elements from the scenario prompt
    const words = scenarioPrompt.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5); // Take first 5 meaningful words
    
    return words.join('-') || `session-${Date.now()}`;
  }

  /**
   * Store content directly in public WorldTree namespace
   */
  private async storeInPublicWorldTree(path: string, content: any, session: CoordinationSession): Promise<void> {
    try {
      // For now, use the existing session content manager with a public session marker
      // This will need to be enhanced to write to actual WorldTree storage when implemented
      const publicSessionId = 'public-worldtree';
      
      // Convert WorldTree path to filesystem-safe format
      const safePath = path.replace('worldtree://public/', '').replace(/[^a-zA-Z0-9\/\-_]/g, '_');
      
      // Store using session content manager with special public session
      const sessionContentManager = session.sessionContentManager;
      await sessionContentManager.publishToSessionWorldTree(
        publicSessionId,
        JSON.stringify(content, null, 2),
        [safePath],
        {
          isPublicContent: true,
          originalWorldTreePath: path,
          uiAccessible: true
        }
      );
      
    } catch (error) {
      console.error(`❌ Failed to store in public WorldTree:`, error);
      throw error;
    }
  }

  /**
   * Determine content type from creative content
   */
  private determineContentType(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('verse') || lowerContent.includes('chorus') || lowerContent.includes('bridge')) {
      return 'song';
    } else if (lowerContent.includes('chapter') || lowerContent.includes('story') || lowerContent.length > 1000) {
      return 'story';
    } else if (lowerContent.includes('poem') || lowerContent.match(/\n\s*\n/g)) {
      return 'poem';
    } else {
      return 'text';
    }
  }

  /**
   * Extract title from content
   */
  private extractTitle(content: string, contentType: string): string {
    // Try to find a title in the content
    const titleMatch = content.match(/^#\s*(.+)$/m) || content.match(/^(.{1,50})/);
    
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    
    // Generate a title based on content type
    const timestamp = new Date().toLocaleDateString();
    return `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} - ${timestamp}`;
  }

  /**
   * Build synthesis prompt for coordinator
   */
  private buildSynthesisPrompt(session: CoordinationSession, completedTasks: CoordinationSession['participantTasks'], coordinator: Coordinator): string {
    const contributionsText = completedTasks.map(task => 
      `CONTRIBUTION FROM ${task.agentId}:\n${task.result}\n`
    ).join('\n');

    return `${coordinator.llmConfig.systemPrompt}

ORIGINAL SCENARIO:
${session.scenarioPrompt}

PARTICIPANT CONTRIBUTIONS:
${contributionsText}

INSTRUCTIONS:
As the coordinator, synthesize these participant contributions into a comprehensive final result. Analyze the quality and relevance of each contribution, identify common themes and conflicts, and provide actionable recommendations.

Respond in this exact format:

SUMMARY:
[Comprehensive summary of the scenario outcome based on all contributions]

ANALYSIS:
[Your analysis of the participant contributions, their quality, and how they address the original scenario]

RECOMMENDATIONS:
1. [First actionable recommendation]
2. [Second actionable recommendation]
3. [Additional recommendations as needed]

PARTICIPANT_ASSESSMENT:
[Brief assessment of each participant's contribution and its value to the overall solution]`;
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate or summarize contributions to fit token limit
   */
  private optimizeContributionsForTokens(
    tasks: CoordinationSession['participantTasks'],
    maxTokens: number = 6000  // Leave room for system prompt and instructions (~2000 tokens)
  ): string {
    const contributions = tasks.map(task => ({
      agentId: task.agentId,
      content: task.result || '',
      tokens: this.estimateTokens(task.result || '')
    }));

    const totalTokens = contributions.reduce((sum, c) => sum + c.tokens, 0);

    console.log(`📊 Content optimization: ${contributions.length} contributions, ~${totalTokens} tokens`);

    if (totalTokens <= maxTokens) {
      // Fits within limit - return full content
      return contributions
        .map(c => `CONTRIBUTION FROM ${c.agentId}:\n${c.content}\n`)
        .join('\n');
    }

    console.warn(`⚠️ Content exceeds token limit (${totalTokens} > ${maxTokens}), truncating contributions`);

    // Calculate per-contribution token budget
    const tokenBudgetPerContribution = Math.floor(maxTokens / contributions.length);

    return contributions
      .map(c => {
        if (c.tokens <= tokenBudgetPerContribution) {
          // Small enough - include full content
          return `CONTRIBUTION FROM ${c.agentId}:\n${c.content}\n`;
        } else {
          // Truncate to budget
          const charLimit = tokenBudgetPerContribution * 4;
          const truncated = c.content.substring(0, charLimit);
          return `CONTRIBUTION FROM ${c.agentId} (truncated from ${c.tokens} to ~${tokenBudgetPerContribution} tokens):\n${truncated}...\n[Content truncated due to size]\n`;
        }
      })
      .join('\n');
  }

  /**
   * Build content integration prompt for coordinator with token optimization
   */
  private buildContentIntegrationPrompt(session: CoordinationSession, completedTasks: CoordinationSession['participantTasks'], coordinator: Coordinator): string {
    // Optimize contributions to fit within token limits
    const contributionsText = this.optimizeContributionsForTokens(completedTasks);

    const prompt = `${coordinator.llmConfig.systemPrompt}

CONTENT INTEGRATION TASK:
You have received substantial content contributions from multiple specialist agents. Your task is to integrate these contributions into a single, cohesive final deliverable.

ORIGINAL REQUEST:
${session.scenarioPrompt}

SPECIALIST CONTRIBUTIONS:
${contributionsText}

INSTRUCTIONS:
Integrate these contributions into a unified, polished final result. This should be a complete deliverable that:
1. Incorporates the best elements from each contribution
2. Maintains narrative/thematic consistency
3. Addresses all aspects of the original scenario
4. Creates a seamless, integrated experience

Do NOT just summarize or analyze - create the actual integrated content that fulfills the original request.

INTEGRATED RESULT:`;

    // Log final token estimate
    const promptTokens = this.estimateTokens(prompt);
    console.log(`📏 Final integration prompt: ~${promptTokens} tokens`);

    return prompt;
  }

  /**
   * Extract specific section from coordinator response
   */
  private extractSection(response: string, sectionName: string): string {
    const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i');
    const match = response.match(regex);
    return match && match[1] ? match[1].trim() : '';
  }

  /**
   * Update a coordinator's configuration
   */
  updateCoordinator(coordinatorId: string, updateData: Partial<Coordinator>): Coordinator | null {
    const existingCoordinator = this.coordinators.get(coordinatorId);
    if (!existingCoordinator) {
      return null;
    }

    // Create updated coordinator with merged data
    const updatedCoordinator: Coordinator = {
      ...existingCoordinator,
      ...updateData,
      id: coordinatorId, // Ensure ID doesn't change
      createdAt: existingCoordinator.createdAt, // Preserve creation date
    };

    this.coordinators.set(coordinatorId, updatedCoordinator);
    return updatedCoordinator;
  }

  /**
   * Delete a coordinator
   */
  deleteCoordinator(coordinatorId: string): boolean {
    const existingCoordinator = this.coordinators.get(coordinatorId);
    if (!existingCoordinator) {
      return false;
    }

    // Check if coordinator is currently busy
    if (existingCoordinator.status === 'busy') {
      throw new Error('Cannot delete coordinator that is currently busy with coordination');
    }

    return this.coordinators.delete(coordinatorId);
  }

  /**
   * Extract recommendations from coordinator response
   */
  private extractRecommendations(response: string): string[] {
    const recommendationsSection = this.extractSection(response, 'RECOMMENDATIONS');
    return recommendationsSection
      .split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(rec => rec.length > 0);
  }

  /**
   * Simple coordination fallback when orchestration fails
   */
  private async executeSimpleCoordination(session: CoordinationSession, coordinator: Coordinator): Promise<void> {
    if (!this.agentService) throw new Error('AgentService not configured');

    console.log(`🔄 Starting simple coordination fallback...`);

    // Mark session as in progress
    session.status = 'in_progress';
    
    // Direct task assignment to each participant
    const participantContributions: Array<{
      agentId: string;
      contribution: string;
      weight: number;
    }> = [];
    
    for (const participantId of session.participantIds) {
      console.log(`🎯 Assigning task to ${participantId}...`);
      
      const agent = await this.agentService.getAgent(participantId as AgentId);
      if (!agent) {
        console.warn(`⚠️ Agent ${participantId} not found, skipping...`);
        continue;
      }
      
      // Create a simple task based on the scenario prompt
      const taskPrompt = `Please contribute to this coordination scenario: ${session.scenarioPrompt}\n\nProvide your perspective as ${agent.name} with your expertise in ${agent.specialization?.domain || 'general analysis'}. Focus on delivering actual content rather than just methodology or steps.`;

      try {
        const contribution = await this.agentService.executeAgentPrompt(participantId as AgentId, {
          prompt: taskPrompt,
          sessionId: session.id
        });
        
        participantContributions.push({
          agentId: participantId,
          contribution: contribution.response,
          weight: 1.0 // Equal weight for all participants in simple mode
        });
        
        console.log(`✅ Received contribution from ${participantId} (${contribution.response.length} chars)`);
      } catch (error) {
        console.warn(`⚠️ Failed to get contribution from ${participantId}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Initialize finalResult with all required fields
    session.finalResult = {
      participantContributions: participantContributions,
      summary: '',
      coordinatorAnalysis: 'Simple coordination fallback used due to orchestration failure',
      recommendations: ['Consider retrying with updated agent configurations'],
      integratedContent: '',
      publishedTo: []
    };
    
    // Simple content integration
    if (participantContributions.length > 0) {
      console.log(`🔄 Integrating ${participantContributions.length} contributions...`);
      
      const integrationPrompt = `You are a coordination facilitator. Integrate the following contributions into a cohesive final result:

SCENARIO: ${session.scenarioPrompt}

CONTRIBUTIONS:
${participantContributions.map((contrib, index) => 
  `${index + 1}. ${contrib.agentId}:\n${contrib.contribution}\n`
).join('\n')}

Please create a well-structured, integrated response that combines these perspectives into a coherent final result. Focus on synthesis rather than just listing the contributions.`;
      
      try {
        const integratedContent = await this.executeCoordinatorPrompt(coordinator, integrationPrompt);
        session.finalResult.integratedContent = integratedContent;
        session.finalResult.summary = `Simple coordination completed with ${participantContributions.length} contributions`;
        
        console.log(`✅ Simple coordination integration completed (${integratedContent.length} chars)`);
      } catch (integrationError) {
        console.warn(`⚠️ Integration failed, using concatenated contributions:`, integrationError instanceof Error ? integrationError.message : 'Unknown error');
        
        // Fallback: just concatenate contributions
        session.finalResult.integratedContent = participantContributions
          .map(contrib => `**${contrib.agentId}:**\n${contrib.contribution}`)
          .join('\n\n---\n\n');
        session.finalResult.summary = `Simple coordination completed (integration failed, concatenated ${participantContributions.length} contributions)`;
      }
    } else {
      session.finalResult.summary = 'Simple coordination completed but no contributions received';
      session.finalResult.integratedContent = 'No contributions were successfully collected from participants.';
    }

    // Honor the original request's publish intent in the fallback path too.
    // session.publishTo is set at session creation from request.publishTo.
    if (session.publishTo && session.publishTo.length > 0 && session.finalResult.integratedContent) {
      try {
        for (const publishKey of session.publishTo) {
          const contentPath = path.join('./data/published_content', `${publishKey.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
          await fs.writeFile(contentPath, session.finalResult.integratedContent, 'utf-8');
          console.log(`📖 Published final content to: ${contentPath}`);
        }
        session.finalResult.publishedTo = [...session.publishTo];
      } catch (publishError) {
        console.warn('Failed to publish content:', publishError instanceof Error ? publishError.message : 'Unknown error');
      }
    }

    // Mark session as completed
    session.status = 'completed';
    session.completedAt = new Date();

    console.log(`✅ Simple coordination session ${session.id} completed`);
  }

  /**
   * Get concurrency metrics for monitoring
   */
  getConcurrencyMetrics(): {
    totalActiveSessions: number;
    sessionsByCoordinator: { [coordinatorId: string]: number };
    maxConcurrentScenarios: number;
    activeSessions: Array<{
      sessionId: string;
      coordinatorId: string;
      participantCount: number;
      startTime: Date;
      lastActivity: Date;
    }>;
  } {
    const metrics = this.coordinatorConcurrencyManager.getMetrics();
    const activeSessions = this.coordinatorConcurrencyManager.getActiveSessions()
      .map(session => ({
        sessionId: session.sessionId,
        coordinatorId: session.coordinatorId,
        participantCount: session.participantCount,
        startTime: session.startTime,
        lastActivity: session.lastActivity
      }));

    return {
      ...metrics,
      activeSessions
    };
  }

  /**
   * Force cleanup of timed out sessions
   */
  cleanupTimeoutSessions(): void {
    this.coordinatorConcurrencyManager.cleanupTimeoutSessions();
  }
}