import { RealmId } from "../models/Types";
import { isValidUUID, slugifyName, isRealmSentinel } from '../utils/uuidUtils';
import { RepositoryManager } from './RepositoryManager';
import { MCPConfigLoader } from './mcp/MCPConfigLoader';

export class RealmService {
  private realms: Map<RealmId, any> = new Map();
  /** Legacy realm UUID -> canonical slug, memoised from the unique index. */
  private uuidToSlug: Map<string, string> = new Map();
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
      // camelCase: entityToRow tests `realm.mcpServers`, so a snake_case key here
      // was silently ignored and the field never reached the INSERT.
      mcpServers: serviceRealm.mcpServers || [],
      createdBy: 'system',
      createdAt: serviceRealm.createdAt,
      updatedAt: serviceRealm.updatedAt,
      lastModifiedBy: 'system',
      version: 1
    };
  }
  
  async createRealm(request: any): Promise<any> {
    // Realms are identified by slug (migration 020). An explicitly supplied id
    // is normalised through the same derivation rather than rejected, so
    // "My Realm" and "my-realm" both land on the canonical form the database
    // requires; otherwise the caller would meet a raw constraint violation.
    const requestedSlug =
      request.id && !isValidUUID(request.id) ? slugifyName(String(request.id)) : undefined;
    const slug = requestedSlug || slugifyName(String(request.name ?? ''));

    if (!slug || slug === '-') {
      throw new Error(
        'Cannot derive a realm slug id: provide an id, or a name containing alphanumeric characters'
      );
    }

    if (isValidUUID(slug)) {
      // A realm named like a UUID would derive a UUID-shaped slug, which every
      // resolver treats as the surrogate rather than a slug — the repository
      // would reject it on create and misclassify it on lookup.
      throw new Error(
        `"${slug}" cannot be used as a realm id: it has the shape of an internal ` +
        'identifier. Choose a name or id that is not formatted as a UUID.'
      );
    }

    if (isRealmSentinel(slug)) {
      throw new Error(
        `"${slug}" is reserved: it is the sentinel meaning "not present in any realm", ` +
        'so a realm cannot use it as an identity. Choose a different name or id.'
      );
    }

    const realm = {
      id: slug,
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

    // Persist to the database first (primary persistence).
    //
    // RealmRepository.create is an upsert keyed on slug_id: the slug we derived
    // above *is* the identity, the surrogate UUID is left to the column default,
    // and the entity comes back with the slug as its id. We still read the
    // persisted entity rather than assuming our local copy is authoritative —
    // see the note below on the agent roster — because a divergence between the
    // in-memory map and the database would break realm-scoped lookups (e.g.
    // ingest scope validation) until a restart reloaded the map.
    if (this.repositoryManager) {
      try {
        const dbRealm = this.transformServiceRealmToDbFormat(realm);
        const persisted = await this.repositoryManager.realms.create(dbRealm);

        // Adopt the persisted entity, not just its id. create() is an upsert
        // that deliberately preserves an existing realm's agent roster, while
        // this object was built with an empty one — caching the local copy
        // would report the realm as empty until a restart, and a later
        // membership update could then write that emptiness back.
        realm.id = persisted.id;
        realm.agentIds = (persisted as any).agents ?? realm.agentIds;
        console.log(`💾 Stored realm ${realm.id} in database`);
      } catch (error) {
        console.warn('Failed to persist realm to database:', error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // Store in memory under the canonical (DB-assigned) id for fast access
    this.realms.set(realm.id, realm);
    
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
  
  /**
   * Resolve any accepted realm reference to the slug the in-memory map is keyed
   * by.
   *
   * The application speaks slugs, but UUIDs still arrive from outside: external
   * MCP clients hold ids issued before migration 020, and REST callers may have
   * bookmarked one. Rather than break them, a UUID is translated once via the
   * unique index and cached. Anything unrecognised is returned unchanged so the
   * caller's own "not found" handling applies.
   */
  async resolveRealmKey(idOrSlug: RealmId): Promise<RealmId> {
    if (!idOrSlug || this.realms.has(idOrSlug)) {
      return idOrSlug;
    }

    if (isValidUUID(String(idOrSlug)) && this.repositoryManager) {
      const cached = this.uuidToSlug.get(String(idOrSlug));
      if (cached) {
        return cached as RealmId;
      }
      try {
        const slug = await this.repositoryManager.realms.resolveSlug(String(idOrSlug));
        if (slug) {
          this.uuidToSlug.set(String(idOrSlug), slug);
          console.log(`🔄 Resolved legacy realm UUID ${idOrSlug} to slug "${slug}"`);
          return slug as RealmId;
        }
      } catch (error) {
        console.warn(
          `Failed to resolve realm UUID ${idOrSlug}:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    return idOrSlug;
  }

  /**
   * Normalise a list of realm references to canonical slugs, preserving order
   * and dropping duplicates. Used at inbound boundaries (coordination research
   * scope, directed corpus search) so a caller holding a pre-migration UUID is
   * still understood.
   */
  async resolveRealmIds(ids: Array<string | null | undefined>): Promise<string[]> {
    await this.loadingPromise;
    const out: string[] = [];
    for (const id of ids) {
      if (!id) continue;
      const slug = String(await this.resolveRealmKey(String(id) as RealmId));
      if (slug && !out.includes(slug)) out.push(slug);
    }
    return out;
  }

  async getRealm(realmId: RealmId): Promise<any | null> {
    await this.loadingPromise; // Ensure data is loaded
    const key = await this.resolveRealmKey(realmId);
    return this.realms.get(key) || null;
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
    const key = await this.resolveRealmKey(realmId);
    const realm = this.realms.get(key);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }

    // Apply updates to the realm and update timestamp
    const updatedRealm = {
      ...realm,
      ...updates,
      // Identity is immutable and is not settable through an update payload.
      // Without this, a PUT carrying { id: ... } would change the returned id
      // while the realm stayed stored under its real key and slug — the caller
      // would then be unable to find it by the id it was just handed.
      id: key,
      updatedAt: new Date().toISOString()
    };
    
    this.realms.set(key, updatedRealm);
    
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

        await this.repositoryManager.realms.update(key, dbUpdates);
        console.log(`💾 Updated realm ${key} in database`);
      } catch (error) {
        // Loud, and re-thrown. The in-memory map was already updated above, so
        // swallowing this returns success for a write that did not happen — the
        // caller then reads its own change straight back out of memory and sees
        // no problem until a restart loses it. That is exactly how the missing
        // mcp_servers column stayed hidden.
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to persist realm ${key}; rolling back the in-memory copy:`, message);
        this.realms.set(key, realm);
        throw new Error(`Failed to update realm ${key}: ${message}`);
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
    const key = await this.resolveRealmKey(realmId);
    
    const realm = this.realms.get(key);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }
    
    // Remove from memory
    this.realms.delete(key);
    
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
          // Both operations key on the resolved slug. namespaces.realm_id is a
          // slug column as of migration 021; passing the caller's raw id could
          // be a surrogate UUID and would match nothing.
          const namespacesResult = await this.repositoryManager!.database.query(namespacesDeleteQuery, [key]);
          console.log(`💾 Deleted ${namespacesResult.rowCount || 0} namespaces for realm ${key}`);

          // Then delete the realm itself
          await this.repositoryManager!.realms.delete(key);
          console.log(`💾 Deleted realm ${key} from database`);
        });
      } catch (error) {
        // Previously a "uuid" in the message was swallowed as "this realm only
        // exists in Redis". That was a workaround for passing a slug to a
        // UUID-typed column — the mismatch migration 021 removes. Keeping it
        // would now hide a real failure and leave the row behind while the
        // realm disappeared from memory, so every error is treated as real.
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to delete realm ${key} from database:`, errorMessage);
        this.realms.set(key, realm);
        throw error;
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
    const key = await this.resolveRealmKey(realmId);

    const realm = this.realms.get(key);
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
    const key = await this.resolveRealmKey(realmId);

    const realm = this.realms.get(key);
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
    const key = await this.resolveRealmKey(realmId);

    const realm = this.realms.get(key);
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
    const key = await this.resolveRealmKey(realmId);

    const realm = this.realms.get(key);
    if (!realm) {
      throw new Error(`Realm not found: ${realmId}`);
    }

    return realm.mcpServers || [];
  }

  // TODO: Add database mapping functions when integrating with RepositoryManager
}
