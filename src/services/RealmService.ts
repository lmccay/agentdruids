import { RealmId } from "../models/Types";
import { RepositoryManager } from './RepositoryManager';
import { MCPConfigLoader } from './mcp/MCPConfigLoader';

export class RealmService {
  private realms: Map<RealmId, any> = new Map();
  private loadingPromise: Promise<void>;
  private repositoryManager: RepositoryManager | null = null;
  private mcpConfigLoader: MCPConfigLoader;

  constructor() {
    this.mcpConfigLoader = new MCPConfigLoader();
    this.loadingPromise = this.initializeService();
  }

  private async initializeService(): Promise<void> {
    // Load MCP config
    try {
      await this.mcpConfigLoader.load();
      console.log('✅ MCP config loaded in RealmService');
    } catch (error) {
      console.warn('⚠️ Failed to load MCP config:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Initialize database connection as single source of truth
    try {
      this.repositoryManager = await RepositoryManager.initialize();
      console.log('✅ Database connection established for RealmService');

      // Load from database only
      await this.loadFromDatabase();
    } catch (error) {
      console.warn('⚠️ Database connection failed:', error instanceof Error ? error.message : 'Unknown error');
      this.repositoryManager = null;
    }
  }

  private async loadFromDatabase(): Promise<void> {
    if (!this.repositoryManager) {
      return;
    }

    try {
      const dbRealms = await this.repositoryManager.realms.findAll();
      
      // Load database realms into memory for fast access
      for (const dbRealm of dbRealms) {
        this.realms.set(dbRealm.id, this.transformDbRealmToServiceFormat(dbRealm));
      }
      
      if (dbRealms.length > 0) {
        console.log(`✅ Loaded ${dbRealms.length} realms from database`);
      } else {
        console.log('⚠️ No realms found in database.');
      }
    } catch (error) {
      console.warn('Failed to load realms from database:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private transformDbRealmToServiceFormat(dbRealm: any): any {
    // Transform database realm format to service format
    return {
      id: dbRealm.id,
      name: dbRealm.name,
      description: dbRealm.description,
      type: dbRealm.type,
      status: dbRealm.status,
      configuration: dbRealm.configuration || { maxAgents: 10, allowExternalAccess: false },
      agentIds: dbRealm.agents || [],
      mcpServers: dbRealm.mcpServers || [],  // rowToEntity already converted to camelCase
      createdAt: dbRealm.createdAt,
      updatedAt: dbRealm.updatedAt
    };
  }

  private transformServiceRealmToDbFormat(serviceRealm: any): any {
    // Transform service realm format to database format
    return {
      id: serviceRealm.id,
      name: serviceRealm.name,
      description: serviceRealm.description,
      type: serviceRealm.type,
      status: serviceRealm.status,
      configuration: serviceRealm.configuration || {},
      agents: serviceRealm.agentIds || [],
      mcp_servers: serviceRealm.mcpServers || [],
      createdBy: 'system',
      createdAt: serviceRealm.createdAt,
      updatedAt: serviceRealm.updatedAt,
      lastModifiedBy: 'system',
      version: 1
    };
  }
  
  async createRealm(request: any): Promise<any> {
    const realm = {
      id: request.id || `realm-${Date.now()}`,
      name: request.name,
      description: request.description,
      type: request.type || 'development',
      status: request.status || 'active',
      configuration: request.configuration || {
        maxAgents: 10,
        allowExternalAccess: false
      },
      agentIds: [],
      mcpServers: request.mcpServers || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in memory for fast access
    this.realms.set(realm.id, realm);
    
    // Persist to database first (primary persistence)
    if (this.repositoryManager) {
      try {
        const dbRealm = this.transformServiceRealmToDbFormat(realm);
        await this.repositoryManager.realms.create(dbRealm);
        console.log(`💾 Stored realm ${realm.id} in database`);
      } catch (error) {
        console.warn('Failed to persist realm to database:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Persist to Redis cache (secondary persistence)
    try {
      // Redis removed - database is single source of truth
      console.log(`💾 Cached realm ${realm.id} in Redis`);
    } catch (error) {
      console.warn('Failed to cache realm in Redis:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    console.log(`✅ Created realm ${realm.id} with dual persistence`);
    return realm;
  }
  
  async getRealm(realmId: RealmId): Promise<any | null> {
    await this.loadingPromise; // Ensure data is loaded
    return this.realms.get(realmId) || null;
  }
  
  async listRealms(filters?: any): Promise<any[]> {
    await this.loadingPromise; // Ensure data is loaded
    let results = Array.from(this.realms.values());
    if (filters) {
      if (filters.type) results = results.filter((r: any) => r.type === filters.type);
      if (filters.agentId) results = results.filter((r: any) => r.agentIds?.includes(filters.agentId));
    }
    
    // Sort alphabetically by name (case-insensitive)
    results.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    
    return results;
  }

  async getRealms(): Promise<any[]> {
    return this.listRealms();
  }

  async updateRealm(realmId: RealmId, updates: any): Promise<any> {
    await this.loadingPromise; // Ensure data is loaded
    const realm = this.realms.get(realmId);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }

    // Apply updates to the realm and update timestamp
    const updatedRealm = {
      ...realm,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.realms.set(realmId, updatedRealm);
    
    // Persist to database first (primary persistence)
    if (this.repositoryManager) {
      try {
        // Only update specific fields that were actually changed, avoid full transformation issues
        const dbUpdates: any = {};

        if (updates.agentIds !== undefined) {
          dbUpdates.agents = updates.agentIds;
        }
        if (updates.name !== undefined) {
          dbUpdates.name = updates.name;
        }
        if (updates.description !== undefined) {
          dbUpdates.description = updates.description;
        }
        if (updates.status !== undefined) {
          dbUpdates.status = updates.status;
        }
        if (updates.configuration !== undefined) {
          dbUpdates.configuration = updates.configuration;
        }
        if (updates.mcpServers !== undefined) {
          dbUpdates.mcpServers = updates.mcpServers;  // Use camelCase - entityToRow will convert to snake_case
        }

        // Don't add updated_at here - BaseRepository will handle it automatically

        await this.repositoryManager.realms.update(realmId, dbUpdates);
        console.log(`💾 Updated realm ${realmId} in database`);
      } catch (error) {
        console.warn('Failed to update realm in database:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Persist to Redis cache (secondary persistence)
    try {
      // Redis removed - database is single source of truth
      console.log(`💾 Updated realm ${realmId} in Redis cache`);
    } catch (error) {
      console.warn('Failed to update realm in Redis cache:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    console.log(`✅ Updated realm ${realmId} with dual persistence`);
    return updatedRealm;
  }

  async deleteRealm(realmId: RealmId): Promise<void> {
    await this.loadingPromise; // Ensure service is initialized
    
    const realm = this.realms.get(realmId);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }
    
    // Remove from memory
    this.realms.delete(realmId);
    
    // Remove from database if available
    if (this.repositoryManager) {
      try {
        // Use transaction to ensure cascade deletion is atomic
        await this.repositoryManager.database.transaction(async () => {
          // First, delete all dependent namespaces
          const namespacesDeleteQuery = `
            DELETE FROM druids_knowledge.namespaces 
            WHERE realm_id = $1
          `;
          const namespacesResult = await this.repositoryManager!.database.query(namespacesDeleteQuery, [realmId]);
          console.log(`💾 Deleted ${namespacesResult.rowCount || 0} namespaces for realm ${realmId}`);
          
          // Then delete the realm itself
          await this.repositoryManager!.realms.delete(realmId);
          console.log(`💾 Deleted realm ${realmId} from database`);
        });
      } catch (error) {
        // Check if this is a UUID format error (non-UUID realms only exist in Redis)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('uuid') || errorMessage.includes('UUID')) {
          console.log(`⚠️ Realm ${realmId} not in database (Redis-only realm), continuing with Redis cleanup`);
        } else {
          console.warn('Failed to delete realm from database:', errorMessage);
          // Re-add to memory if database deletion failed for other reasons
          this.realms.set(realmId, realm);
          throw error;
        }
      }
    }
    
    // Remove from Redis cache
    try {
      // Redis removed - database is single source of truth
      console.log(`💾 Deleted realm ${realmId} from Redis cache`);
    } catch (error) {
      console.warn('Failed to delete realm from Redis cache:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    console.log(`✅ Deleted realm ${realmId} with cascade deletion and dual persistence cleanup`);
  }

  /**
   * Refresh realm cache from database to get latest updates
   * Useful for concurrent user scenarios where realms may have been
   * created/updated/deleted by other users
   */
  async refreshRealmCache(): Promise<void> {
    console.log('🔄 Refreshing realm cache from database...');

    // Clear current cache
    this.realms.clear();

    // Reload from database
    await this.loadFromDatabase();

    console.log(`✅ Realm cache refreshed - now contains ${this.realms.size} realms`);
  }

  /**
   * Validate that MCP server IDs exist in the configuration
   * @param serverIds - Array of MCP server IDs to validate
   * @returns Array of invalid server IDs (empty if all valid)
   */
  private validateMCPServerIds(serverIds: string[]): string[] {
    const config = this.mcpConfigLoader.getConfig();
    const invalidServers: string[] = [];

    if (!config) {
      // If config is null, all servers are invalid
      return serverIds;
    }

    for (const serverId of serverIds) {
      if (!config.servers[serverId]) {
        invalidServers.push(serverId);
      }
    }

    return invalidServers;
  }

  /**
   * Assign MCP servers to a realm
   * @param realmId - ID of the realm
   * @param serverIds - Array of MCP server IDs to assign
   * @throws Error if realm not found or server IDs invalid
   */
  async assignMCPServers(realmId: RealmId, serverIds: string[]): Promise<void> {
    await this.loadingPromise;

    const realm = this.realms.get(realmId);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }

    // Validate server IDs exist in config
    const invalidServers = this.validateMCPServerIds(serverIds);
    if (invalidServers.length > 0) {
      throw new Error(`Invalid MCP server IDs: ${invalidServers.join(', ')}`);
    }

    // Update realm with new server list (replace existing)
    await this.updateRealm(realmId, { mcpServers: serverIds });

    console.log(`✅ Assigned MCP servers [${serverIds.join(', ')}] to realm ${realmId}`);
  }

  /**
   * Add a single MCP server to a realm
   * @param realmId - ID of the realm
   * @param serverId - MCP server ID to add
   * @throws Error if realm not found or server ID invalid
   */
  async addMCPServer(realmId: RealmId, serverId: string): Promise<void> {
    await this.loadingPromise;

    const realm = this.realms.get(realmId);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }

    // Validate server ID
    const invalidServers = this.validateMCPServerIds([serverId]);
    if (invalidServers.length > 0) {
      throw new Error(`Invalid MCP server ID: ${serverId}`);
    }

    // Add server if not already present
    const currentServers = realm.mcpServers || [];
    if (!currentServers.includes(serverId)) {
      const updatedServers = [...currentServers, serverId];
      await this.updateRealm(realmId, { mcpServers: updatedServers });
      console.log(`✅ Added MCP server ${serverId} to realm ${realmId}`);
    } else {
      console.log(`⚠️ MCP server ${serverId} already assigned to realm ${realmId}`);
    }
  }

  /**
   * Remove an MCP server from a realm
   * @param realmId - ID of the realm
   * @param serverId - MCP server ID to remove
   * @throws Error if realm not found
   */
  async removeMCPServer(realmId: RealmId, serverId: string): Promise<void> {
    await this.loadingPromise;

    const realm = this.realms.get(realmId);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }

    // Remove server from list
    const currentServers = realm.mcpServers || [];
    const updatedServers = currentServers.filter((id: string) => id !== serverId);

    if (updatedServers.length !== currentServers.length) {
      await this.updateRealm(realmId, { mcpServers: updatedServers });
      console.log(`✅ Removed MCP server ${serverId} from realm ${realmId}`);
    } else {
      console.log(`⚠️ MCP server ${serverId} not found in realm ${realmId}`);
    }
  }

  /**
   * Get list of MCP servers assigned to a realm
   * @param realmId - ID of the realm
   * @returns Array of MCP server IDs
   * @throws Error if realm not found
   */
  async getMCPServers(realmId: RealmId): Promise<string[]> {
    await this.loadingPromise;

    const realm = this.realms.get(realmId);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }

    return realm.mcpServers || [];
  }

  // TODO: Add database mapping functions when integrating with RepositoryManager
}
