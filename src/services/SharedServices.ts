/**
 * Shared service instances for the application
 * This ensures that all API endpoints use the same service instances
 * and share the same in-memory state.
 */

import { AgentService } from './AgentService';
import { RealmService } from './RealmService';

// Singleton AgentService instance
let sharedAgentService: AgentService | null = null;

export function getSharedAgentService(): AgentService {
  if (!sharedAgentService) {
    sharedAgentService = new AgentService();
  }
  return sharedAgentService;
}

// Singleton RealmService instance
let sharedRealmService: RealmService | null = null;

export function getSharedRealmService(): RealmService {
  if (!sharedRealmService) {
    sharedRealmService = new RealmService();
  }
  return sharedRealmService;
}

// Export the shared instances for convenience
export const agentService = getSharedAgentService();
export const realmService = getSharedRealmService();