/**
 * Shared service instances for the application
 * This ensures that all API endpoints use the same service instances
 * and share the same in-memory state.
 */

import { AgentService } from './AgentService';

// Singleton AgentService instance
let sharedAgentService: AgentService | null = null;

export function getSharedAgentService(): AgentService {
  if (!sharedAgentService) {
    sharedAgentService = new AgentService();
  }
  return sharedAgentService;
}

// Export the shared instance for convenience
export const agentService = getSharedAgentService();