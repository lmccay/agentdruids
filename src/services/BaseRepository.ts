import { DatabaseService } from './DatabaseService';
import { BaseEntity } from '../models/Types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base repository class providing common CRUD operations for all entities
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected db: DatabaseService;
  protected tableName: string;
  protected schema: string;

  constructor(db: DatabaseService, tableName: string, schema: string = 'druids_core') {
    this.db = db;
    this.tableName = tableName;
    this.schema = schema;
  }

  /**
   * Get the full table name with schema
   */
  protected getFullTableName(): string {
    return `${this.schema}.${this.tableName}`;
  }

  /**
   * Generate a new UUID for entity IDs
   */
  protected generateId(): string {
    return uuidv4();
  }

  /**
   * Convert entity to database row format
   */
  protected abstract entityToRow(entity: T): Record<string, any>;

  /**
   * Convert database row to entity format
   */
  protected abstract rowToEntity(row: Record<string, any>): T;

  /**
   * Create a new entity
   */
  async create(entityData: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = new Date().toISOString();
    const id = this.generateId();
    
    const entity: T = {
      ...entityData,
      id,
      createdAt: now,
      updatedAt: now,
    } as T;

    const row = this.entityToRow(entity);
    const columns = Object.keys(row);
    const values = Object.values(row);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const query = `
      INSERT INTO ${this.getFullTableName()} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const { rows } = await this.db.query(query, values);
    return this.rowToEntity(rows[0]);
  }

  /**
   * Find entity by ID
   */
  async findById(id: string): Promise<T | null> {
    const query = `SELECT * FROM ${this.getFullTableName()} WHERE id = $1`;
    const { rows } = await this.db.query(query, [id]);
    
    if (rows.length === 0) {
      return null;
    }
    
    return this.rowToEntity(rows[0]);
  }

  /**
   * Find all entities with optional filtering
   */
  async findAll(filters?: Record<string, any>): Promise<T[]> {
    let query = `SELECT * FROM ${this.getFullTableName()}`;
    const params: any[] = [];

    if (filters && Object.keys(filters).length > 0) {
      const conditions = Object.keys(filters).map((key, index) => {
        params.push(filters[key]);
        return `${key} = $${index + 1}`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const { rows } = await this.db.query(query, params);
    return rows.map(row => this.rowToEntity(row));
  }

  /**
   * Update an entity by ID
   */
  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const entityUpdateKeys = Object.keys(updates).filter(key => key !== 'id' && key !== 'createdAt');
    
    if (entityUpdateKeys.length === 0) {
      return existing;
    }

    // Create entity with just the updated fields to get the correct column mapping
    const updatesWithTimestamp = { ...updates, updatedAt: new Date().toISOString() } as Partial<T>;
    const updatesRow = this.entityToRow(updatesWithTimestamp as T);
    
    // Get the database column names that correspond to the updated entity properties
    const updateColumns = Object.keys(updatesRow).filter(col => col !== 'id' && col !== 'created_at');
    const values = updateColumns.map(col => updatesRow[col]);

    const setClause = updateColumns.map((col, index) => `${col} = $${index + 2}`).join(', ');

    const query = `
      UPDATE ${this.getFullTableName()}
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await this.db.query(query, [id, ...values]);
    return this.rowToEntity(rows[0]);
  }

  /**
   * Delete an entity by ID
   */
  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM ${this.getFullTableName()} WHERE id = $1`;
    const { rowCount } = await this.db.query(query, [id]);
    return rowCount > 0;
  }

  /**
   * Count entities with optional filtering
   */
  async count(filters?: Record<string, any>): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.getFullTableName()}`;
    const params: any[] = [];

    if (filters && Object.keys(filters).length > 0) {
      const conditions = Object.keys(filters).map((key, index) => {
        params.push(filters[key]);
        return `${key} = $${index + 1}`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const { rows } = await this.db.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  /**
   * Check if entity exists by ID
   */
  async exists(id: string): Promise<boolean> {
    const query = `SELECT 1 FROM ${this.getFullTableName()} WHERE id = $1 LIMIT 1`;
    const { rowCount } = await this.db.query(query, [id]);
    return rowCount > 0;
  }

  /**
   * Execute custom query
   */
  protected async executeQuery<R = any>(query: string, params?: any[]): Promise<{ rows: R[]; rowCount: number }> {
    return this.db.query<R>(query, params);
  }
}

/**
 * Repository interface for standardized operations
 */
export interface Repository<T extends BaseEntity> {
  create(entityData: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(filters?: Record<string, any>): Promise<T[]>;
  update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(filters?: Record<string, any>): Promise<number>;
  exists(id: string): Promise<boolean>;
}