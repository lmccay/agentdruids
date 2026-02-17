import { BaseRepository } from './BaseRepository';
import { DatabaseService } from './DatabaseService';
import { Agent, AgentQueryFilters } from '../models/Agent';
import { AgentId } from '../models/Types';
import { safeJsonParse } from '../utils/jsonUtils';

/**
 * Repository for Agent entities with PostgreSQL persistence
 */
export class AgentRepository extends BaseRepository<Agent> {
  constructor(db: DatabaseService) {
    super(db, 'agents', 'druids_core');
  }

  /**
   * Convert Agent entity to database row format
   */
  protected entityToRow(agent: Agent): Record<string, any> {
    return {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      description: agent.description,
      capabilities: JSON.stringify(agent.capabilities),
      specialization: JSON.stringify(agent.specialization),
      personality: JSON.stringify(agent.personality),
      mcp_tools: JSON.stringify(agent.mcpTools || []),
      tool_permissions: JSON.stringify(agent.toolPermissions || {}),
      resource_access: agent.resourceAccess ? JSON.stringify(agent.resourceAccess) : null,
      llm_config: JSON.stringify(agent.llmConfig),
      resource_limits: JSON.stringify(agent.resourceLimits),
      bindings: JSON.stringify(agent.bindings || []),
      realm_access: JSON.stringify(agent.realmAccess || {}),
      deployment: JSON.stringify(agent.deployment || {}),
      tags: JSON.stringify(agent.tags || []),
      metadata: JSON.stringify(agent.metadata || {}),
      prompt_config: agent.promptConfig ? JSON.stringify(agent.promptConfig) : null,
      created_at: agent.createdAt,
      updated_at: agent.updatedAt,
      last_modified_by: agent.lastModifiedBy || null,
      version: agent.version || 1
    };
  }

  /**
   * Convert database row to Agent entity format
   */
  protected rowToEntity(row: Record<string, any>): Agent {
    return {
      id: row['id'],
      name: row['name'],
      type: row['type'],
      status: row['status'],
      description: row['description'],
      capabilities: safeJsonParse(row['capabilities'], []),
      specialization: safeJsonParse(row['specialization'], {}),
      personality: safeJsonParse(row['personality'], {}),
      mcpTools: safeJsonParse(row['mcp_tools'], []),
      toolPermissions: safeJsonParse(row['tool_permissions'], {}),
      resourceAccess: row['resource_access'] ? safeJsonParse(row['resource_access'], undefined) : undefined,
      llmConfig: safeJsonParse(row['llm_config'], {}),
      resourceLimits: safeJsonParse(row['resource_limits'], {}),
      bindings: safeJsonParse(row['bindings'], []),
      realmAccess: safeJsonParse(row['realm_access'], {}),
      deployment: safeJsonParse(row['deployment'], {}),
      tags: safeJsonParse(row['tags'], []),
      metadata: safeJsonParse(row['metadata'], {}),
      promptConfig: row['prompt_config'] ? safeJsonParse(row['prompt_config'], undefined) : undefined,
      createdAt: row['created_at'],
      updatedAt: row['updated_at'],
      lastModifiedBy: row['last_modified_by'],
      version: row['version'] || 1
    };
  }

  /**
   * Find agents with advanced filtering
   */
  async findWithFilters(filters: AgentQueryFilters): Promise<Agent[]> {
    let query = `SELECT * FROM ${this.getFullTableName()}`;
    const params: any[] = [];
    const conditions: string[] = [];

    // Type filtering
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      conditions.push(`type = ANY($${params.length + 1})`);
      params.push(types);
    }

    // Status filtering
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      conditions.push(`status = ANY($${params.length + 1})`);
      params.push(statuses);
    }

    // Domain filtering (search in specialization JSON)
    if (filters.domain) {
      conditions.push(`specialization->>'domain' = $${params.length + 1}`);
      params.push(filters.domain);
    }

    // Capabilities filtering (search in capabilities JSON array)
    if (filters.capabilities && filters.capabilities.length > 0) {
      conditions.push(`capabilities ?| $${params.length + 1}`);
      params.push(filters.capabilities);
    }

    // Tags filtering (search in tags JSON array)
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags ?| $${params.length + 1}`);
      params.push(filters.tags);
    }

    // Realm filtering (search in realm_access JSON)
    if (filters.realmId) {
      conditions.push(`(realm_access->>'boundRealmId' = $${params.length + 1} OR realm_access->'accessibleRealms' ? $${params.length + 1})`);
      params.push(filters.realmId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const { rows } = await this.db.query(query, params);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Find agents by realm access
   */
  async findByRealmAccess(realmId: string): Promise<Agent[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE realm_access->>'boundRealmId' = $1 
         OR realm_access->'accessibleRealms' ? $1
      ORDER BY created_at DESC
    `;
    
    const { rows } = await this.db.query(query, [realmId]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Update agent's last activity timestamp
   */
  async updateLastActivity(agentId: AgentId): Promise<void> {
    const query = `
      UPDATE ${this.getFullTableName()}
      SET deployment = jsonb_set(deployment, '{lastHeartbeat}', to_jsonb($2::text)),
          updated_at = $2
      WHERE id = $1
    `;
    
    await this.db.query(query, [agentId, new Date().toISOString()]);
  }

  /**
   * Get agents by status
   */
  async findByStatus(status: string): Promise<Agent[]> {
    return this.findAll({ status });
  }

  /**
   * Get agents by type
   */
  async findByType(type: string): Promise<Agent[]> {
    return this.findAll({ type });
  }

  /**
   * Search agents by name pattern
   */
  async searchByName(namePattern: string): Promise<Agent[]> {
    const query = `
      SELECT * FROM ${this.getFullTableName()}
      WHERE name ILIKE $1
      ORDER BY name ASC
    `;
    
    const { rows } = await this.db.query(query, [`%${namePattern}%`]);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Get agent statistics
   */
  async getStatistics(): Promise<{ total: number; byType: Record<string, number>; byStatus: Record<string, number> }> {
    const totalQuery = `SELECT COUNT(*) as count FROM ${this.getFullTableName()}`;
    const typeQuery = `SELECT type, COUNT(*) as count FROM ${this.getFullTableName()} GROUP BY type`;
    const statusQuery = `SELECT status, COUNT(*) as count FROM ${this.getFullTableName()} GROUP BY status`;

    const [totalResult, typeResult, statusResult] = await Promise.all([
      this.db.query(totalQuery),
      this.db.query(typeQuery),
      this.db.query(statusQuery)
    ]);

    const byType: Record<string, number> = {};
    typeResult.rows.forEach(row => {
      byType[row.type] = parseInt(row.count, 10);
    });

    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach(row => {
      byStatus[row.status] = parseInt(row.count, 10);
    });

    return {
      total: parseInt(totalResult.rows[0].count, 10),
      byType,
      byStatus
    };
  }
}