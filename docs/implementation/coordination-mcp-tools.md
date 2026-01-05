# Coordination MCP Tools Implementation

## Overview

Add high-level coordination MCP tools that encapsulate validation and orchestration preparation in single calls, reducing token usage and round-trips by ~50%.

## Tools to Implement

### 1. `prepare_druid_orchestration`
Validates druid, realm, and collaborators in one call and prepares orchestration plan.

### 2. `execute_druid_orchestration`
Executes a validated orchestration plan.

### 3. `validate_coordination_request`
Quick feasibility check with suggestions for missing components.

## Implementation Location

**File:** `/Users/lmccay/Projects/druids/src/mcp/SimpleMCPServer.ts`

**Section:** Add to `tools` array in `tools/list` response handler (around line 422)

## Detailed Implementation

### Tool 1: `prepare_druid_orchestration`

**Location in SimpleMCPServer.ts:** Add to tools array (~line 1150)

```typescript
{
  name: 'prepare_druid_orchestration',
  description: 'Validate druid, realm, and collaborators, then prepare orchestration plan. This encapsulates all validation in a single efficient call.',
  inputSchema: {
    type: 'object',
    properties: {
      druidId: {
        type: 'string',
        description: 'ID of the druid agent to orchestrate (e.g., "code-reviewer-druid-1")'
      },
      realmId: {
        type: 'string',
        description: 'ID or name of the realm where druid should travel (e.g., "oss-realm")'
      },
      collaboratorIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of agents (elementals) the druid should collaborate with'
      },
      goal: {
        type: 'string',
        description: 'Natural language description of what to accomplish'
      },
      userContext: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          sessionId: { type: 'string' }
        },
        description: 'User and session context for this orchestration'
      }
    },
    required: ['druidId', 'realmId', 'collaboratorIds', 'goal']
  }
}
```

**Handler Implementation:** Add to `tools/call` handler switch statement

```typescript
case 'prepare_druid_orchestration': {
  try {
    const { druidId, realmId, collaboratorIds, goal, userContext } = args;

    console.log(`🎯 Preparing orchestration: druid=${druidId}, realm=${realmId}, collaborators=${collaboratorIds.join(',')}`);

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate druid exists and get details
    let druid = null;
    try {
      const agents = await this.apiCall('/agents', 'GET');
      druid = agents.find((a: any) => a.agentId === druidId);

      if (!druid) {
        errors.push(`Druid "${druidId}" not found`);
      } else if (druid.type !== 'druid') {
        errors.push(`Agent "${druidId}" is type "${druid.type}", not a druid`);
      }
    } catch (error: any) {
      errors.push(`Failed to validate druid: ${error.message}`);
    }

    // 2. Validate realm exists and get details
    let realm = null;
    try {
      const realms = await this.apiCall('/realms', 'GET');

      // Try to find by ID first, then by name
      realm = realms.find((r: any) => r.id === realmId);
      if (!realm) {
        realm = realms.find((r: any) => r.name.toLowerCase() === realmId.toLowerCase());
      }

      if (!realm) {
        errors.push(`Realm "${realmId}" not found`);
      }
    } catch (error: any) {
      errors.push(`Failed to validate realm: ${error.message}`);
    }

    // 3. Validate collaborators exist in the target realm
    const collaborators: any[] = [];
    if (realm) {
      try {
        const agents = await this.apiCall('/agents', 'GET');

        for (const collabId of collaboratorIds) {
          const agent = agents.find((a: any) => a.agentId === collabId);

          if (!agent) {
            errors.push(`Collaborator "${collabId}" not found`);
            continue;
          }

          // Check if agent is in the target realm
          if (agent.type === 'elemental') {
            // Elementals are realm-bound - check their realm
            if (agent.realmId !== realm.id) {
              errors.push(`Elemental "${collabId}" is bound to realm "${agent.realmId}", not "${realm.id}"`);
              continue;
            }

            collaborators.push({
              id: agent.agentId,
              name: agent.name,
              type: agent.type,
              capabilities: agent.capabilities || [],
              mcpBindings: agent.networkInfo?.mcpServer || null
            });
          } else if (agent.type === 'druid') {
            // Druids can travel, but warn if using druid as collaborator (unusual pattern)
            warnings.push(`Collaborator "${collabId}" is a druid (can travel). Consider using elementals for realm-specific tools.`);

            collaborators.push({
              id: agent.agentId,
              name: agent.name,
              type: agent.type,
              capabilities: agent.capabilities || []
            });
          } else {
            errors.push(`Collaborator "${collabId}" is type "${agent.type}", not elemental or druid`);
          }
        }
      } catch (error: any) {
        errors.push(`Failed to validate collaborators: ${error.message}`);
      }
    }

    // 4. If validation failed, return errors
    if (errors.length > 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: false,
            errors: errors,
            warnings: warnings.length > 0 ? warnings : undefined
          }, null, 2)
        }]
      };
    }

    // 5. Build orchestration plan
    const orchestration = {
      druid: {
        id: druid.agentId,
        name: druid.name,
        type: druid.type,
        capabilities: druid.capabilities || []
      },
      realm: {
        id: realm.id,
        name: realm.name,
        description: realm.description
      },
      collaborators: collaborators,
      goal: goal,
      userContext: userContext || null,
      readyToExecute: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };

    console.log(`✅ Orchestration prepared successfully`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: true,
          orchestration: orchestration
        }, null, 2)
      }]
    };

  } catch (error: any) {
    console.error(`❌ prepare_druid_orchestration failed:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: false,
          errors: [`Orchestration preparation failed: ${error.message}`]
        }, null, 2)
      }],
      isError: true
    };
  }
}
```

### Tool 2: `execute_druid_orchestration`

**Tool Definition:**

```typescript
{
  name: 'execute_druid_orchestration',
  description: 'Execute a validated orchestration plan. Should be called after prepare_druid_orchestration confirms the plan is valid.',
  inputSchema: {
    type: 'object',
    properties: {
      druidId: {
        type: 'string',
        description: 'ID of the druid to orchestrate'
      },
      realmId: {
        type: 'string',
        description: 'ID or name of the destination realm'
      },
      collaboratorIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of collaborating agents'
      },
      goal: {
        type: 'string',
        description: 'Goal to accomplish'
      },
      userContext: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          sessionId: { type: 'string' }
        }
      }
    },
    required: ['druidId', 'realmId', 'collaboratorIds', 'goal']
  }
}
```

**Handler Implementation:**

```typescript
case 'execute_druid_orchestration': {
  try {
    const { druidId, realmId, collaboratorIds, goal, userContext } = args;

    console.log(`🚀 Executing orchestration: druid=${druidId} → realm=${realmId}`);

    // Resolve realm ID if name was provided
    let resolvedRealmId = realmId;
    try {
      const realms = await this.apiCall('/realms', 'GET');
      const realm = realms.find((r: any) => r.id === realmId || r.name.toLowerCase() === realmId.toLowerCase());
      if (realm) {
        resolvedRealmId = realm.id;
      }
    } catch (error: any) {
      console.error(`⚠️ Could not resolve realm ID, using as-is: ${error.message}`);
    }

    // Create coordination request
    // Use the existing coordination API with orchestration structure
    const coordinationRequest = {
      coordinatorId: 'built-in-coordinator',
      participantIds: [druidId, ...collaboratorIds],
      scenarioPrompt: goal,
      orchestration: {
        druidId: druidId,
        realmId: resolvedRealmId,
        collaboratorIds: collaboratorIds
      },
      userId: userContext?.userId,
      sessionId: userContext?.sessionId
    };

    // Call coordination API
    const result = await this.apiCall('/coordinators/coordinate', 'POST', coordinationRequest);

    console.log(`✅ Orchestration started: sessionId=${result.sessionId}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          executionId: result.sessionId,
          status: result.status || 'started',
          message: result.message || 'Orchestration started successfully',
          sessionId: result.sessionId
        }, null, 2)
      }]
    };

  } catch (error: any) {
    console.error(`❌ execute_druid_orchestration failed:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `Orchestration execution failed: ${error.message}`
        }, null, 2)
      }],
      isError: true
    };
  }
}
```

### Tool 3: `validate_coordination_request`

**Tool Definition:**

```typescript
{
  name: 'validate_coordination_request',
  description: 'Quickly validate coordination feasibility and get suggestions for missing components. Useful for exploratory queries before committing to full orchestration.',
  inputSchema: {
    type: 'object',
    properties: {
      druidId: {
        type: 'string',
        description: 'Optional: Specific druid to validate. If omitted, will suggest suitable druids.'
      },
      realmId: {
        type: 'string',
        description: 'Optional: Specific realm to validate. If omitted, will suggest suitable realms.'
      },
      collaboratorIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Specific collaborators to validate.'
      },
      requiredCapabilities: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Required capabilities to match against (e.g., ["code_review", "github"])'
      },
      goalDescription: {
        type: 'string',
        description: 'Optional: Natural language description of goal for better suggestions'
      }
    }
  }
}
```

**Handler Implementation:**

```typescript
case 'validate_coordination_request': {
  try {
    const { druidId, realmId, collaboratorIds, requiredCapabilities, goalDescription } = args;

    console.log(`🔍 Validating coordination request...`);

    const validation: any = {
      feasible: true,
      suggestions: {},
      warnings: []
    };

    // Get all agents and realms for validation and suggestions
    const agents = await this.apiCall('/agents', 'GET');
    const realms = await this.apiCall('/realms', 'GET');

    // 1. Validate or suggest druid
    if (druidId) {
      const druid = agents.find((a: any) => a.agentId === druidId);
      if (!druid) {
        validation.feasible = false;
        validation.warnings.push(`Druid "${druidId}" not found`);
      } else if (druid.type !== 'druid') {
        validation.feasible = false;
        validation.warnings.push(`Agent "${druidId}" is not a druid (type: ${druid.type})`);
      } else {
        validation.druid = { id: druid.agentId, name: druid.name, capabilities: druid.capabilities };
      }
    } else {
      // Suggest druids based on capabilities
      const druids = agents.filter((a: any) => a.type === 'druid');

      if (requiredCapabilities && requiredCapabilities.length > 0) {
        // Filter by capability match
        validation.suggestions.druids = druids
          .filter((d: any) => {
            const caps = d.capabilities || [];
            return requiredCapabilities.some((req: string) =>
              caps.some((cap: string) => cap.toLowerCase().includes(req.toLowerCase()))
            );
          })
          .map((d: any) => ({
            id: d.agentId,
            name: d.name,
            capabilities: d.capabilities,
            match: 'capability'
          }));
      } else {
        // Suggest all druids
        validation.suggestions.druids = druids.map((d: any) => ({
          id: d.agentId,
          name: d.name,
          capabilities: d.capabilities
        }));
      }

      if (validation.suggestions.druids.length === 0) {
        validation.warnings.push('No suitable druids found');
      }
    }

    // 2. Validate or suggest realm
    if (realmId) {
      const realm = realms.find((r: any) => r.id === realmId || r.name.toLowerCase() === realmId.toLowerCase());
      if (!realm) {
        validation.feasible = false;
        validation.warnings.push(`Realm "${realmId}" not found`);
      } else {
        validation.realm = { id: realm.id, name: realm.name };
      }
    } else {
      // Suggest all realms
      validation.suggestions.realms = realms.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description
      }));

      if (validation.suggestions.realms.length === 0) {
        validation.warnings.push('No realms available');
      }
    }

    // 3. Validate or suggest collaborators
    if (collaboratorIds && collaboratorIds.length > 0) {
      validation.collaborators = [];

      for (const collabId of collaboratorIds) {
        const agent = agents.find((a: any) => a.agentId === collabId);
        if (!agent) {
          validation.feasible = false;
          validation.warnings.push(`Collaborator "${collabId}" not found`);
        } else {
          validation.collaborators.push({
            id: agent.agentId,
            name: agent.name,
            type: agent.type,
            realmId: agent.realmId
          });
        }
      }
    } else if (realmId) {
      // Suggest elementals in the target realm
      const realm = realms.find((r: any) => r.id === realmId || r.name.toLowerCase() === realmId.toLowerCase());
      if (realm) {
        const elementals = agents.filter((a: any) =>
          a.type === 'elemental' && a.realmId === realm.id
        );

        validation.suggestions.collaborators = elementals.map((e: any) => ({
          id: e.agentId,
          name: e.name,
          type: e.type,
          capabilities: e.capabilities,
          realmId: e.realmId,
          mcpBindings: e.networkInfo?.mcpServer || null
        }));

        if (validation.suggestions.collaborators.length === 0) {
          validation.warnings.push(`No elementals found in realm "${realm.name}"`);
        }
      }
    }

    console.log(`✅ Validation complete: feasible=${validation.feasible}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(validation, null, 2)
      }]
    };

  } catch (error: any) {
    console.error(`❌ validate_coordination_request failed:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          feasible: false,
          error: `Validation failed: ${error.message}`
        }, null, 2)
      }],
      isError: true
    };
  }
}
```

## CoordinationService Integration

Update `CoordinationService.ts` to accept orchestration parameters from MCP tools.

**Location:** `/Users/lmccay/Projects/druids/src/services/CoordinationService.ts`

### Modify `startOrchestatedCoordination` method

Add support for pre-validated orchestration from MCP tools:

```typescript
// Around line 200
async startOrchestatedCoordination(request: CoordinationRequest): Promise<string> {
  if (!this.agentService) {
    throw new Error('AgentService not configured');
  }

  // ... existing validation code ...

  // NEW: Check if orchestration was pre-prepared by MCP tool
  if (request.orchestration) {
    console.log(`🎯 Using pre-prepared orchestration from MCP tool`);

    const { druidId, realmId, collaboratorIds } = request.orchestration;

    // Create session with explicit orchestration
    const session: CoordinationSession = {
      id: sessionId,
      coordinatorId: request.coordinatorId,
      participantIds: request.participantIds,
      scenarioPrompt: request.scenarioPrompt,
      startTime: Date.now(),
      status: 'active',
      steps: [],
      userId: request.userId,
      orchestration: {
        druidId: druidId,
        realmId: realmId,
        collaboratorIds: collaboratorIds
      }
    };

    this.sessions.set(sessionId, session);

    // Create explicit orchestration plan from MCP tool parameters
    const plan = await this.createExplicitOrchestrationPlan(session);

    // Execute plan
    await this.executePlan(session, plan);

    return sessionId;
  }

  // EXISTING: LLM-based orchestration planning
  const plan = await this.createOrchestrationPlan(session);

  // ... rest of existing code ...
}
```

### Add `createExplicitOrchestrationPlan` method

```typescript
// Add new method around line 400
/**
 * Create orchestration plan from explicit parameters (pre-validated by MCP tool)
 */
private async createExplicitOrchestrationPlan(session: CoordinationSession): Promise<OrchestrationPlan> {
  if (!session.orchestration) {
    throw new Error('No orchestration parameters provided');
  }

  const { druidId, realmId, collaboratorIds } = session.orchestration;

  console.log(`🎯 Creating explicit orchestration: druid=${druidId} → realm=${realmId}`);

  // Get druid details
  const druid = await this.agentService!.getAgent(druidId);
  if (!druid) {
    throw new Error(`Druid ${druidId} not found`);
  }

  // Get realm details
  const realm = await this.realmService!.getRealm(realmId);
  if (!realm) {
    throw new Error(`Realm ${realmId} not found`);
  }

  // Get collaborator details
  const collaborators = [];
  for (const collabId of collaboratorIds) {
    const agent = await this.agentService!.getAgent(collabId);
    if (agent) {
      collaborators.push({
        agentId: agent.agentId,
        name: agent.name,
        domain: agent.capabilities?.join(', ') || 'general'
      });
    }
  }

  // Create single orchestration step
  const step: OrchestrationStep = {
    stepId: `${session.id}-step-1`,
    stepNumber: 1,
    description: `Travel to ${realm.name} and collaborate with ${collaborators.map(c => c.name).join(', ')}`,
    agentId: druid.agentId,
    actionType: 'travel_and_collaborate',
    parameters: {
      realmId: realm.id,
      realmName: realm.name,
      elementals: collaborators,
      collaborationPrompt: session.scenarioPrompt,
      expectedDeliverable: 'Task completion result',
      publishKey: 'result',
      requiresPrevious: []
    },
    status: 'pending'
  };

  console.log(`✅ Explicit orchestration plan created with 1 step`);

  return {
    sessionId: session.id,
    druidAgentId: druid.agentId,
    druidName: druid.name,
    steps: [step]
  };
}
```

### Update `CoordinationRequest` interface

```typescript
// Around line 50
export interface CoordinationRequest {
  coordinatorId: string;
  participantIds: string[];
  scenarioPrompt: string;
  userId?: string;
  sessionId?: string;
  orchestration?: {           // NEW: Pre-validated orchestration from MCP tool
    druidId: string;
    realmId: string;
    collaboratorIds: string[];
  };
}
```

## Testing Plan

### Unit Tests

**File:** `/Users/lmccay/Projects/druids/tests/mcp/coordination-tools.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Coordination MCP Tools', () => {
  describe('prepare_druid_orchestration', () => {
    it('should validate all components and return orchestration plan', async () => {
      const result = await callMCPTool('prepare_druid_orchestration', {
        druidId: 'code-reviewer-druid-1',
        realmId: 'oss-realm',
        collaboratorIds: ['github-elemental-1'],
        goal: 'Review pull requests'
      });

      expect(result.valid).toBe(true);
      expect(result.orchestration.druid.id).toBe('code-reviewer-druid-1');
      expect(result.orchestration.realm.id).toBe('oss-realm');
      expect(result.orchestration.collaborators).toHaveLength(1);
    });

    it('should return errors for invalid druid', async () => {
      const result = await callMCPTool('prepare_druid_orchestration', {
        druidId: 'nonexistent-druid',
        realmId: 'oss-realm',
        collaboratorIds: ['github-elemental-1'],
        goal: 'Test'
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Druid "nonexistent-druid" not found');
    });

    it('should validate elemental is in target realm', async () => {
      const result = await callMCPTool('prepare_druid_orchestration', {
        druidId: 'code-reviewer-druid-1',
        realmId: 'oss-realm',
        collaboratorIds: ['legal-elemental-1'], // Wrong realm
        goal: 'Test'
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/bound to realm/);
    });
  });

  describe('execute_druid_orchestration', () => {
    it('should start coordination session', async () => {
      const result = await callMCPTool('execute_druid_orchestration', {
        druidId: 'code-reviewer-druid-1',
        realmId: 'oss-realm',
        collaboratorIds: ['github-elemental-1'],
        goal: 'Review PRs'
      });

      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('started');
    });
  });

  describe('validate_coordination_request', () => {
    it('should suggest druids when not specified', async () => {
      const result = await callMCPTool('validate_coordination_request', {
        requiredCapabilities: ['code_review']
      });

      expect(result.feasible).toBe(true);
      expect(result.suggestions.druids.length).toBeGreaterThan(0);
    });

    it('should suggest collaborators in target realm', async () => {
      const result = await callMCPTool('validate_coordination_request', {
        realmId: 'oss-realm'
      });

      expect(result.suggestions.collaborators).toBeDefined();
      expect(result.suggestions.collaborators.length).toBeGreaterThan(0);
    });
  });
});
```

### Integration Test

**Test scenario:** Full GitHub PR review orchestration via MCP tools

```typescript
describe('GitHub PR Review via Coordination MCP Tools', () => {
  it('should orchestrate PR review using MCP tools', async () => {
    // Step 1: Prepare orchestration
    const preparation = await callMCPTool('prepare_druid_orchestration', {
      druidId: 'code-reviewer-druid-1',
      realmId: 'oss-realm',
      collaboratorIds: ['github-elemental-1'],
      goal: 'Review open pull requests in druids repository',
      userContext: { userId: 'alice', sessionId: 'test-session' }
    });

    expect(preparation.valid).toBe(true);
    expect(preparation.orchestration.readyToExecute).toBe(true);

    // Step 2: Execute orchestration
    const execution = await callMCPTool('execute_druid_orchestration', {
      druidId: 'code-reviewer-druid-1',
      realmId: 'oss-realm',
      collaboratorIds: ['github-elemental-1'],
      goal: 'Review open pull requests in druids repository',
      userContext: { userId: 'alice', sessionId: 'test-session' }
    });

    expect(execution.executionId).toBeDefined();
    expect(execution.status).toBe('started');

    // Step 3: Monitor execution
    const status = await callMCPTool('get_coordination_status', {
      sessionId: execution.executionId
    });

    expect(status.status).toMatch(/active|completed/);
  });
});
```

## Coordinator Flow Update

Update the coordinator's system prompt to use these tools:

**File:** `/Users/lmccay/Projects/druids/src/services/CoordinationService.ts`

**Location:** Built-in coordinator definition (~line 1005)

```typescript
private builtInCoordinator: Coordinator = {
  id: 'built-in-coordinator',
  name: 'System Coordination Engine',
  description: 'Built-in coordination management system for orchestrating multi-agent workflows',
  capabilities: {
    taskDecomposition: true,
    agentSelection: true,
    resultSynthesis: true
  },
  llmConfig: {
    provider: process.env.LLM_PROVIDER || 'openai',
    model: process.env.LLM_MODEL || 'gpt-4',
    temperature: 0.3,
    systemPrompt: `You are a coordination agent that orchestrates multi-agent collaborations.

AVAILABLE MCP TOOLS:
1. prepare_druid_orchestration - Validate and prepare orchestration (use this FIRST)
2. execute_druid_orchestration - Execute validated orchestration
3. validate_coordination_request - Quick feasibility check with suggestions

WORKFLOW:
When given a natural language coordination request:

1. Parse the request to extract:
   - Which druid to use
   - Which realm to target
   - Which collaborators (elementals) needed
   - What goal to accomplish

2. Call prepare_druid_orchestration with extracted parameters
   - This validates everything in ONE call
   - Returns full orchestration details if valid
   - Returns specific errors if invalid

3. If valid, call execute_druid_orchestration to start
   - Uses the same parameters as prepare
   - Returns execution ID to track progress

4. Report results to user

EXAMPLES:

User: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1 to review PRs"

You parse:
  druidId: "code-reviewer-druid-1"
  realmId: "oss-realm"
  collaboratorIds: ["github-elemental-1"]
  goal: "review pull requests"

You call: prepare_druid_orchestration(...)
If valid, call: execute_druid_orchestration(...)

BE EFFICIENT: Use ONE prepare call, not multiple list/get calls.`
  }
};
```

## Token Efficiency Analysis

### Before (Multiple Tool Calls)

```
User: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1 to review PRs"

LLM Call 1: Parse command
  Input: System prompt (500 tokens) + User command (50 tokens)
  Output: Parsed parameters (100 tokens)
  Total: 650 tokens

Tool Call 1: agent_list()
  Response: List of 50 agents (2000 tokens)

Tool Call 2: realm_list()
  Response: List of 10 realms (500 tokens)

Tool Call 3: get_elementals_in_realm("oss-realm")
  Response: List of 5 elementals (300 tokens)

LLM Call 2: Validate and synthesize
  Input: System prompt (500) + tool results (2800) + task (50)
  Output: Validation result (200 tokens)
  Total: 3550 tokens

TOTAL: 650 + 2000 + 500 + 300 + 3550 = 7000 tokens
ROUND-TRIPS: 5
```

### After (Single Coordination Tool)

```
User: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1 to review PRs"

LLM Call 1: Parse and call tool
  Input: System prompt (500 tokens) + User command (50 tokens)
  Output: Tool call with parameters (150 tokens)
  Total: 700 tokens

Tool Call 1: prepare_druid_orchestration(...)
  Response: Validated orchestration (400 tokens)

LLM Call 2: Execute orchestration
  Input: System prompt (500) + orchestration (400) + task (50)
  Output: Execute call (100 tokens)
  Total: 1050 tokens

Tool Call 2: execute_druid_orchestration(...)
  Response: Execution started (100 tokens)

TOTAL: 700 + 400 + 1050 + 100 = 2250 tokens
ROUND-TRIPS: 4

SAVINGS: 68% fewer tokens, 20% fewer round-trips
```

## Migration Path

### Phase 1: Add MCP Tools (Non-Breaking)
- Implement three new MCP tools in SimpleMCPServer.ts
- Add tests
- Tools available but not yet used by coordinator

### Phase 2: Update CoordinationService (Non-Breaking)
- Add support for `orchestration` parameter in CoordinationRequest
- Add `createExplicitOrchestrationPlan` method
- Existing LLM-based flow still works

### Phase 3: Update Coordinator System Prompt
- Add tool usage instructions to built-in coordinator
- Coordinator now uses efficient tool calls
- Old behavior (direct JSON generation) deprecated but still functional

### Phase 4: Documentation and Examples
- Update GitHub PR review scenario to use new tools
- Create coordinator usage examples
- Document token efficiency gains

## Success Criteria

- [ ] Three MCP tools implemented and tested
- [ ] CoordinationService accepts pre-validated orchestration
- [ ] Coordinator system prompt includes tool usage instructions
- [ ] GitHub PR review scenario works via MCP tools
- [ ] Token usage reduced by >50% for typical orchestration
- [ ] Round-trips reduced by >20%
- [ ] All existing coordination workflows still functional

---

*Last updated: January 3, 2025*
