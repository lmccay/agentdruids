import { Router, Request, Response } from 'express';
// import { CoordinationService } from '../services/CoordinationService';
import { AgentId } from '../models/Types';
import ServiceContainer from '../services/ServiceContainer';
import { OpenAIClient, createDefaultOpenAIConfig } from '../services/OpenAIClient';
import { OllamaClient, createDefaultOllamaConfig } from '../services/OllamaClient';

const router = Router();
const serviceContainer = ServiceContainer.getInstance();
const coordinationService = serviceContainer.getCoordinationService();

/**
 * POST /coordinators - Return the built-in coordinator (deprecated - coordinators are no longer created dynamically)
 */
router.post('/', async (_req: Request, res: Response) => {
  try {
    // Instead of creating new coordinators, return the built-in one
    const coordinator = coordinationService.getBuiltInCoordinator();
    
    const coordinatorResponse = {
      id: coordinator.id,
      name: coordinator.name,
      description: coordinator.description,
      status: coordinator.status,
      maxConcurrentScenarios: coordinator.capabilities.maxConcurrentScenarios,
      supportedScenarioTypes: coordinator.capabilities.supportedScenarioTypes,
      coordinationStyle: coordinator.capabilities.coordinationStyle,
      decisionMaking: coordinator.capabilities.decisionMaking,
      createdAt: coordinator.createdAt.toISOString(),
      updatedAt: coordinator.createdAt.toISOString()
    };

    res.status(201).json(coordinatorResponse);
  } catch (error) {
    console.error('Error getting built-in coordinator:', error);
    res.status(500).json({
      error: 'Failed to get coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators - List all coordinators (includes built-in)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Get the built-in coordinator from CoordinationService
    const builtInCoordinator = coordinationService.getBuiltInCoordinator();
    
    // Transform to match the expected API format
    const coordinatorResponse = {
      id: builtInCoordinator.id,
      name: builtInCoordinator.name,
      description: builtInCoordinator.description,
      status: builtInCoordinator.status,
      maxConcurrentScenarios: builtInCoordinator.capabilities.maxConcurrentScenarios,
      supportedScenarioTypes: builtInCoordinator.capabilities.supportedScenarioTypes,
      coordinationStyle: builtInCoordinator.capabilities.coordinationStyle,
      decisionMaking: builtInCoordinator.capabilities.decisionMaking,
      createdAt: builtInCoordinator.createdAt.toISOString(),
      updatedAt: builtInCoordinator.createdAt.toISOString()
    };
    
    // Return array with just the built-in coordinator
    res.json([coordinatorResponse]);
  } catch (error) {
    console.error('Error listing coordinators:', error);
    res.status(500).json({
      error: 'Failed to list coordinators',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators/test - Simple test route
 */
router.get('/test', async (_req: Request, res: Response) => {
  res.json({ message: 'Test route working' });
});

/**
 * GET /coordinators/sessions - List coordination sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    console.log('🔍 Listing sessions with status filter:', status);
    
    const sessions = coordinationService.listSessions(status as string);
    console.log('🔍 Found sessions:', sessions.length);
    
    res.status(200).json(sessions);
  } catch (error) {
    console.error('Error listing coordination sessions:', error);
    res.status(500).json({
      error: 'Failed to list coordination sessions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators/sessions/{sessionId} - Get coordination session status
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params['sessionId'];
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }
    
    const session = await coordinationService.getCoordinationSession(sessionId);
    
    if (!session) {
      res.status(404).json({
        error: `Coordination session ${sessionId} not found`
      });
      return;
    }

    res.status(200).json(session);
  } catch (error) {
    console.error('Error getting coordination session:', error);
    res.status(500).json({
      error: 'Failed to get coordination session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /coordinators/{coordinatorId} - Get coordinator by ID
 */
router.get('/:coordinatorId', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const coordinator = await coordinationService.getCoordinator(coordinatorId);
    
    if (!coordinator) {
      res.status(404).json({
        error: `Coordinator ${coordinatorId} not found`
      });
      return;
    }

    res.status(200).json(coordinator);
  } catch (error) {
    console.error('Error getting coordinator:', error);
    res.status(500).json({
      error: 'Failed to get coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /coordinators/{coordinatorId} - Update coordinator
 */
router.put('/:coordinatorId', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const updateData = req.body;

    if (!coordinatorId) {
      res.status(400).json({
        error: 'Coordinator ID is required'
      });
      return;
    }

    const updatedCoordinator = coordinationService.updateCoordinator(coordinatorId, updateData);
    if (!updatedCoordinator) {
      res.status(404).json({
        error: `Coordinator ${coordinatorId} not found`
      });
      return;
    }

    res.status(200).json(updatedCoordinator);
  } catch (error) {
    console.error('Error updating coordinator:', error);
    res.status(500).json({
      error: 'Failed to update coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /coordinators/{coordinatorId} - Delete coordinator
 */
router.delete('/:coordinatorId', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;

    if (!coordinatorId) {
      res.status(400).json({
        error: 'Coordinator ID is required'
      });
      return;
    }

    const deleted = coordinationService.deleteCoordinator(coordinatorId);
    if (!deleted) {
      res.status(404).json({
        error: `Coordinator ${coordinatorId} not found`
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting coordinator:', error);
    
    // Check if it's a business logic error (coordinator busy)
    if (error instanceof Error && error.message.includes('currently busy')) {
      res.status(409).json({
        error: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete coordinator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/{coordinatorId}/coordinate - Start coordination
 */
router.post('/:coordinatorId/coordinate', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const {
      scenarioPrompt,
      participantIds,
      timeoutMinutes,
      coordinationStyle,
      publishTo
    } = req.body;

    // Basic validation
    if (!scenarioPrompt || !participantIds || !Array.isArray(participantIds)) {
      res.status(400).json({
        error: 'Missing required fields: scenarioPrompt, participantIds (array)'
      });
      return;
    }

    const coordinationRequest = {
      coordinatorId,
      scenarioPrompt,
      participantIds,
      timeoutMinutes: timeoutMinutes || 30,
      coordinationStyle,
      publishTo
    } as any; // Cast to avoid type conflict

    const sessionId = await coordinationService.startCoordination(coordinationRequest);
    
    res.status(202).json({
      sessionId,
      status: 'started',
      message: 'Coordination session initiated successfully'
    });
  } catch (error) {
    console.error('Error starting coordination:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: error.message
        });
        return;
      }
      if (error.message.includes('not active')) {
        res.status(409).json({
          error: error.message
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Failed to start coordination',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/{coordinatorId}/orchestrate - Start orchestrated coordination
 */
router.post('/:coordinatorId/orchestrate', async (req: Request, res: Response) => {
  try {
    const coordinatorId = req.params['coordinatorId'] as AgentId;
    const {
      scenarioPrompt,
      participantIds,
      timeoutMinutes,
      coordinationStyle,
      publishTo
    } = req.body;

    // Basic validation
    if (!scenarioPrompt || !participantIds || !Array.isArray(participantIds)) {
      res.status(400).json({
        error: 'Missing required fields: scenarioPrompt, participantIds (array)'
      });
      return;
    }

    const coordinationRequest = {
      coordinatorId,
      scenarioPrompt,
      participantIds,
      timeoutMinutes: timeoutMinutes || 30,
      coordinationStyle,
      publishTo
    } as any; // Cast to avoid type conflict

    const sessionId = await coordinationService.startOrchestatedCoordination(coordinationRequest);
    
    res.status(202).json({
      sessionId,
      status: 'orchestration_started',
      message: 'Orchestrated coordination session initiated successfully'
    });
  } catch (error) {
    console.error('Error starting orchestrated coordination:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: error.message
        });
        return;
      }
      if (error.message.includes('not active')) {
        res.status(409).json({
          error: error.message
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Failed to start orchestrated coordination',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/coordinate - Start coordination with smart coordinator defaulting
 * This endpoint automatically uses built-in-coordinator if none specified, making it
 * perfect for natural language interfaces that shouldn't require explicit coordinator selection
 */
router.post('/coordinate', async (req: Request, res: Response) => {
  try {
    const {
      coordinatorId,
      scenarioPrompt,
      workflow,
      participantIds,
      timeoutMinutes,
      coordinationStyle,
      publishTo,
      metadata,
      requireApproval = false  // New flag for plan approval workflow
    } = req.body;

    // Basic validation - either scenarioPrompt OR workflow must be provided
    if ((!scenarioPrompt && !workflow) || !participantIds || !Array.isArray(participantIds)) {
      res.status(400).json({
        error: 'Missing required fields: (scenarioPrompt OR workflow), participantIds (array)'
      });
      return;
    }

    // Validate workflow if provided
    if (workflow) {
      if (!workflow.plantuml || typeof workflow.plantuml !== 'string') {
        res.status(400).json({
          error: 'workflow.plantuml is required and must be a string'
        });
        return;
      }
      if (!workflow.plantuml.includes('@startuml')) {
        res.status(400).json({
          error: 'workflow.plantuml must be valid PlantUML (should contain @startuml)'
        });
        return;
      }
    }

    // Default to built-in coordinator if none specified - perfect for natural language interfaces
    const effectiveCoordinatorId = coordinatorId || 'built-in-coordinator';

    // Build coordination request
    const coordinationRequest = {
      coordinatorId: effectiveCoordinatorId,
      // ✅ Keep original scenarioPrompt for context (rich instructions)
      // If workflow provided, backend will use PlantUML for structure + scenarioPrompt for context
      scenarioPrompt: scenarioPrompt || (workflow
        ? `Execute this PlantUML workflow diagram:\n\n${workflow.plantuml}\n\nFollow the sequence exactly as shown in the diagram.`
        : ''),
      participantIds,
      timeoutMinutes: timeoutMinutes || 30,
      coordinationStyle,
      publishTo,
      metadata: {
        ...metadata,
        workflowMode: workflow ? 'diagram' : 'text',
        originalWorkflow: workflow || undefined
      }
    } as any;

    // If requireApproval is true, create plan only (don't execute)
    let sessionId: string;
    if (requireApproval) {
      sessionId = await coordinationService.createCoordinationPlan(coordinationRequest);

      res.status(201).json({
        sessionId,
        status: 'pending_approval',
        message: workflow
          ? 'Workflow plan created, awaiting approval'
          : 'Coordination plan created, awaiting approval',
        coordinatorId: effectiveCoordinatorId,
        workflowMode: workflow ? 'diagram' : 'text',
        requiresApproval: true
      });
    } else {
      // Original behavior: start execution immediately
      sessionId = await coordinationService.startCoordination(coordinationRequest);

      res.status(202).json({
        sessionId,
        status: 'started',
        message: workflow
          ? 'Workflow diagram coordination initiated successfully'
          : 'Coordination session initiated successfully',
        coordinatorId: effectiveCoordinatorId,
        workflowMode: workflow ? 'diagram' : 'text'
      });
    }
  } catch (error) {
    console.error('Error starting coordination:', error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: error.message
        });
        return;
      }

      if (error.message.includes('not active')) {
        res.status(409).json({
          error: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Failed to start coordination',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/sessions/:sessionId/approve - Approve and execute a coordination plan
 */
router.post('/sessions/:sessionId/approve', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        details: 'Session ID is required'
      });
      return;
    }

    console.log('✅ Approving and executing plan for session:', sessionId);

    await coordinationService.approveAndExecutePlan(sessionId);

    res.status(200).json({
      message: 'Plan approved and execution started',
      sessionId,
      status: 'in_progress'
    });
  } catch (error) {
    console.error('Error approving plan:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Session not found',
          details: error.message
        });
        return;
      }

      if (error.message.includes('not pending approval')) {
        res.status(409).json({
          error: 'Session is not pending approval',
          details: error.message
        });
        return;
      }

      if (error.message.includes('No orchestration plan')) {
        res.status(400).json({
          error: 'No plan found',
          details: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Failed to approve and execute plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /coordinators/sessions/:sessionId/rerun - Rerun a coordination session
 */
router.post('/sessions/:sessionId/rerun', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        details: 'Session ID is required'
      });
      return;
    }

    console.log('🔄 Rerunning session:', sessionId);

    const result = await coordinationService.rerunSession(sessionId);

    res.status(201).json({
      message: 'Session restarted successfully',
      originalSessionId: sessionId,
      newExecutionId: result.newSessionId,
      execution: result.newSession
    });
  } catch (error) {
    console.error('Error rerunning session:', error);
    res.status(500).json({
      error: 'Failed to rerun session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /coordinators/sessions/:sessionId - Delete a coordination session
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        details: 'Session ID is required'
      });
      return;
    }

    console.log('🗑️ Deleting session:', sessionId);

    await coordinationService.deleteSession(sessionId);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting session:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Session not found',
        details: error.message
      });
    } else if (error instanceof Error && error.message.includes('Cannot delete running')) {
      res.status(409).json({
        error: 'Cannot delete running session',
        details: error.message
      });
    } else {
      res.status(500).json({
        error: 'Failed to delete session',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * DELETE /coordinators/sessions/:sessionId/results - Purge session results
 */
router.delete('/sessions/:sessionId/results', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Validation error',
        details: 'Session ID is required'
      });
      return;
    }

    console.log('🧹 Purging results for session:', sessionId);

    const updatedSession = await coordinationService.purgeSessionResults(sessionId);

    res.json({
      message: 'Session results purged successfully',
      sessionId: sessionId,
      session: updatedSession
    });
  } catch (error) {
    console.error('Error purging session results:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Session not found',
        details: error.message
      });
    } else if (error instanceof Error && error.message.includes('Cannot purge')) {
      res.status(409).json({
        error: 'Cannot purge running session',
        details: error.message
      });
    } else {
      res.status(500).json({
        error: 'Failed to purge session results',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * POST /coordinators/convert-to-diagram - Convert text prompt to PlantUML workflow diagram
 */
router.post('/convert-to-diagram', async (req: Request, res: Response) => {
  try {
    const { prompt, coordinatorId = 'built-in-coordinator', availableAgents = [] } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const coordinator = coordinationService.getBuiltInCoordinator();
    const agentService = serviceContainer.getAgentService();

    // Get agent details for context
    const agentDetails = await Promise.all(
      availableAgents.map(async (agentId: string) => {
        try {
          const agent = await agentService.getAgent(agentId);
          return {
            id: agent.id,
            name: agent.name,
            type: agent.type,
            capabilities: agent.capabilities,
            hasFileAccess: !!(agent.resourceAccess?.allowedLocations?.length ||
                            agent.resourceAccess?.allowedFilePaths?.length)
          };
        } catch (error) {
          return null;
        }
      })
    );

    const validAgents = agentDetails.filter(a => a !== null);

    // Build conversion prompt for coordinator LLM
    const agentContext = validAgents.map(a =>
      `- ${a!.id} (${a!.name}): type=${a!.type}, capabilities=[${a!.capabilities.join(', ')}], fileAccess=${a!.hasFileAccess}`
    ).join('\n');

    const conversionPrompt = `Convert this coordination request into a PlantUML sequence diagram.

AVAILABLE AGENTS:
${agentContext || '(No agents specified)'}

USER REQUEST:
${prompt}

Generate a PlantUML sequence diagram that:
1. Starts with @startuml and ends with @enduml
2. Includes a title describing the workflow goal
3. Declares all actors/participants (User, agents, databases/resources)
4. Shows the complete sequence of actions with arrows (->)
5. Uses "note over" or "note right/left" to document goals, context, and important details
6. Uses "activate" and "deactivate" to show when agents are processing
7. Uses "loop" for repetitive operations
8. Shows return values with dashed arrows (-->)
9. Includes alt/else blocks for error handling when appropriate

IMPORTANT CONVENTIONS:
- User sends initial request to coordinating agent
- Druids can use travel_to_realm(target_realm: "realm-name")
- Agents communicate via delegate_task(task: "description")
- File operations: read_file(file_url), write_file(file_url, content), list_files(directory_url)
- Batch processing: process_files_batch(input_directory, output_directory, file_pattern, processing_instructions)

Output ONLY the PlantUML code. Do not include explanations or markdown code blocks.`;

    // Use coordinator LLM to generate PlantUML
    let response: string;

    if (coordinator.llmConfig.provider === 'openai') {
      const openaiClient = new OpenAIClient(createDefaultOpenAIConfig());
      const openaiResponse = await openaiClient.chat({
        model: coordinator.llmConfig.model,
        messages: [
          {
            role: 'system',
            content: coordinator.llmConfig.systemPrompt
          },
          {
            role: 'user',
            content: conversionPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });
      response = openaiResponse.choices[0]?.message?.content || '';
    } else {
      // Use Ollama
      const ollamaClient = new OllamaClient(createDefaultOllamaConfig());
      const ollamaResponse = await ollamaClient.chat({
        model: coordinator.llmConfig.model,
        messages: [
          {
            role: 'system',
            content: coordinator.llmConfig.systemPrompt
          },
          {
            role: 'user',
            content: conversionPrompt
          }
        ],
        options: {
          temperature: 0.3,
          num_predict: 2000
        }
      });
      response = ollamaResponse.message.content;
    }

    // Extract PlantUML from response (in case LLM adds extra text)
    let plantuml = response.trim();

    // Remove markdown code blocks if present
    plantuml = plantuml.replace(/```plantuml\n?/g, '').replace(/```\n?$/g, '');

    // Ensure it starts with @startuml and ends with @enduml
    if (!plantuml.startsWith('@startuml')) {
      plantuml = '@startuml\n' + plantuml;
    }
    if (!plantuml.endsWith('@enduml')) {
      plantuml = plantuml + '\n@enduml';
    }

    // Extract participants for mapping
    const participantRegex = /(?:participant|actor|database|boundary|control|entity|queue)\s+"([^"]+)"\s+as\s+(\w+)|(?:participant|actor|database|boundary|control|entity|queue)\s+(\w+)/g;
    const participants: Array<{ role: string; agentId: string }> = [];
    let match;

    while ((match = participantRegex.exec(plantuml)) !== null) {
      const displayName = match[1] || match[3];
      const alias = match[2] || match[3];

      // Try to match to actual agent IDs
      const matchedAgent = validAgents.find(a =>
        a!.name.toLowerCase().includes(displayName.toLowerCase()) ||
        displayName.toLowerCase().includes(a!.name.toLowerCase()) ||
        a!.id === alias
      );

      participants.push({
        role: displayName,
        agentId: matchedAgent?.id || alias
      });
    }

    res.json({
      plantuml,
      participants,
      originalPrompt: prompt,
      estimatedSteps: (plantuml.match(/->/g) || []).length
    });

  } catch (error) {
    console.error('Error converting to diagram:', error);
    res.status(500).json({
      error: 'Failed to convert prompt to diagram',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Export coordination service for dependency injection
export { coordinationService };
export default router;