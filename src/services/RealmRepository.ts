import { BaseRepository } from './BaseRepository';
import { DatabaseService } from './DatabaseService';
import { Realm } from '../models/Realm';
import { RealmId, AgentId } from '../models/Types';
import { safeJsonParse } from '../utils/jsonUtils';

/**
 * Repository for Realm entities with PostgreSQL persistence
 */
export class RealmRepository extends BaseRepository<Realm> {
  constructor(db: DatabaseService) {
    super(db, 'realms', 'druids_core');
  }

  /**
   * Convert Realm entity to database row format
   */
  protected entityToRow(realm: Realm): Record<string, any> {
    return {
      id: realm.id,
      name: realm.name,
      description: realm.description,
      type: realm.type,
      status: realm.status,
      configuration: JSON.stringify(realm.configuration || {}),
      agents: JSON.stringify(realm.agents || []),
      agent_limits: JSON.stringify(realm.agentLimits || {}),
      ley_line_connections: JSON.stringify(realm.leyLineConnections || []),
      usage: JSON.stringify(realm.usage || {}),
      health: JSON.stringify(realm.health || {}),
      security: JSON.stringify(realm.security || {}),
      tags: JSON.stringify(realm.tags || []),
      metadata: JSON.stringify(realm.metadata || {}),
      parent_realm_id: realm.parentRealmId || null,
      child_realm_ids: JSON.stringify(realm.childRealmIds || []),
      lifecycle: JSON.stringify(realm.lifecycle || {}),
      created_by: realm.createdBy,
      created_at: realm.createdAt,
      updated_at: realm.updatedAt,
      last_modified_by: realm.lastModifiedBy,
      version: realm.version || 1
    };
  }

  /**
   * Convert database row to Realm entity format
   */
  protected rowToEntity(row: Record<string, any>): Realm {
    return {
      id: row['id'],
      name: row['name'],
      description: row['description'],
      type: row['type'],
      status: row['status'],
      configuration: safeJsonParse(row['configuration'], {}),
      agents: safeJsonParse(row['agents'], []),
      agentLimits: safeJsonParse(row['agent_limits'], {}),
      leyLineConnections: safeJsonParse(row['ley_line_connections'], []),
      usage: safeJsonParse(row['usage'], {}),
      health: safeJsonParse(row['health'], {}),
      security: safeJsonParse(row['security'], {}),
      tags: safeJsonParse(row['tags'], []),
      metadata: safeJsonParse(row['metadata'], {}),
      parentRealmId: row['parent_realm_id'] || undefined,
      childRealmIds: safeJsonParse(row['child_realm_ids'], []),
      lifecycle: safeJsonParse(row['lifecycle'], {}),
      createdBy: row['created_by'],
      createdAt: row['created_at'],
      updatedAt: row['updated_at'],
      lastModifiedBy: row['last_modified_by'],
      version: row['version'] || 1
    };
  }

  /**
   * Find realms by type
   */
  async findByType(type: string): Promise<Realm[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE type = $1
      ORDER BY created_at DESC
    `;
    
    const { rows } = await this.db.query(query, [type]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find realms by status
   */
  async findByStatus(status: string): Promise<Realm[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE status = $1
      ORDER BY created_at DESC
    `;
    
    const { rows } = await this.db.query(query, [status]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find realms that have a specific agent
   */
  async findByAgent(agentId: AgentId): Promise<Realm[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE agents ? $1
      ORDER BY created_at DESC
    `;
    
    const { rows } = await this.db.query(query, [agentId]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find realms connected via ley lines to a specific realm
   */
  async findConnectedRealms(realmId: RealmId): Promise<Realm[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE ley_line_connections @> $1
      ORDER BY created_at DESC
    `;
    
    const { rows } = await this.db.query(query, [JSON.stringify([{ targetRealmId: realmId }])]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Add agent to realm
   */
  async addAgent(realmId: RealmId, agentId: AgentId): Promise<void> {
    const query = `
      UPDATE ${this.getFullTableName()}
      SET agents = COALESCE(agents, '[]'::jsonb) || $2,
          updated_at = $3
      WHERE id = $1 AND NOT (agents ? $4)
    `;
    
    await this.db.query(query, [
      realmId, 
      JSON.stringify([agentId]), 
      new Date().toISOString(),
      agentId
    ]);
  }

  /**
   * Remove agent from realm
   */
  async removeAgent(realmId: RealmId, agentId: AgentId): Promise<void> {
    const query = `
      UPDATE ${this.getFullTableName()}
      SET agents = agents - $2,
          updated_at = $3
      WHERE id = $1
    `;
    
    await this.db.query(query, [realmId, agentId, new Date().toISOString()]);
  }

  /**
   * Add ley line connection between realms
   */
  async addLeyLineConnection(sourceRealmId: RealmId, targetRealmId: RealmId, connectionType: string = 'bidirectional'): Promise<void> {
    const leyLineConnection = {
      id: `ley_${sourceRealmId}_${targetRealmId}_${Date.now()}`,
      targetRealmId,
      connectionType,
      protocol: 'mcp',
      security: {
        encryptionEnabled: true,
        authenticationRequired: true
      },
      performance: {
        maxBandwidth: 1000,
        maxLatency: 100,
        priority: 'normal'
      },
      establishedAt: new Date().toISOString()
    };

    const query = `
      UPDATE ${this.getFullTableName()}
      SET ley_line_connections = COALESCE(ley_line_connections, '[]'::jsonb) || $2,
          updated_at = $3
      WHERE id = $1
    `;
    
    await this.db.query(query, [
      sourceRealmId,
      JSON.stringify([leyLineConnection]),
      new Date().toISOString()
    ]);
  }

  /**
   * Search realms by name pattern
   */
  async searchByName(namePattern: string): Promise<Realm[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE name ILIKE $1
      ORDER BY name ASC
    `;
    
    const { rows } = await this.db.query(query, [`%${namePattern}%`]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find realms by tags
   */
  async findByTags(tags: string[]): Promise<Realm[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE tags ?| $1
      ORDER BY created_at DESC
    `;
    
    const { rows } = await this.db.query(query, [tags]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Get realm statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalAgents: number;
    totalLeyLineConnections: number;
  }> {
    const totalQuery = `SELECT COUNT(*) as count FROM ${this.getFullTableName()}`;
    const typeQuery = `SELECT type, COUNT(*) as count FROM ${this.getFullTableName()} GROUP BY type`;
    const statusQuery = `SELECT status, COUNT(*) as count FROM ${this.getFullTableName()} GROUP BY status`;
    const agentCountQuery = `SELECT SUM(jsonb_array_length(agents)) as count FROM ${this.getFullTableName()} WHERE agents IS NOT NULL`;
    const leyLineCountQuery = `SELECT SUM(jsonb_array_length(ley_line_connections)) as count FROM ${this.getFullTableName()} WHERE ley_line_connections IS NOT NULL`;

    const [totalResult, typeResult, statusResult, agentCountResult, leyLineCountResult] = await Promise.all([
      this.db.query(totalQuery),
      this.db.query(typeQuery),
      this.db.query(statusQuery),
      this.db.query(agentCountQuery),
      this.db.query(leyLineCountQuery)
    ]);

    const byType: Record<string, number> = {};
    typeResult.rows.forEach(row => {
      byType[row['type']] = parseInt(row['count'], 10);
    });

    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach(row => {
      byStatus[row['status']] = parseInt(row['count'], 10);
    });

    return {
      total: parseInt(totalResult.rows[0]['count'], 10),
      byType,
      byStatus,
      totalAgents: parseInt(agentCountResult.rows[0]['count'] || '0', 10),
      totalLeyLineConnections: parseInt(leyLineCountResult.rows[0]['count'] || '0', 10)
    };
  }
}