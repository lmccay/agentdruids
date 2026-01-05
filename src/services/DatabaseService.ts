import { Pool, PoolClient } from 'pg';

/**
 * Database service for PostgreSQL connection management and query execution
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool;
  private connected: boolean = false;

  private constructor() {
    const dbUrl = process.env['DATABASE_URL'] || 'postgresql://druids_user:druids_pass_dev@localhost:5432/druids';
    
    this.pool = new Pool({
      connectionString: dbUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client:', err);
      this.connected = false;
    });

    this.pool.on('connect', () => {
      if (!this.connected) {
        console.log('Database connection established');
        this.connected = true;
      }
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize database connection and test connectivity
   */
  async connect(): Promise<void> {
    try {
      // Test connection by running a simple query
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.connected = true;
      console.log('Database connection established successfully');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Initialize database connection and test connectivity
   */
  async initialize(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      this.connected = true;
      console.log('✅ Database service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize database service:', error);
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   */
  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('🔍 Executed query', { text: text.substring(0, 100) + '...', duration, rows: res.rowCount });
      return { rows: res.rows, rowCount: res.rowCount || 0 };
    } catch (error) {
      console.error('❌ Database query error:', { text, params, error });
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client from the pool for manual transaction management
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Check if database is connected and healthy
   */
  async healthCheck(): Promise<{ connected: boolean; latency?: number; message: string }> {
    try {
      const startTime = Date.now();
      const { rows } = await this.query('SELECT NOW() as timestamp');
      const latency = Date.now() - startTime;
      
      return { 
        connected: true,
        latency,
        message: `Connected to PostgreSQL at ${rows[0]['timestamp']}` 
      };
    } catch (error) {
      return { 
        connected: false, 
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.connected = false;
    console.log('🔌 Database service connections closed');
  }

  /**
   * Check if database service is connected
   */
  public isConnected(): boolean {
    return this.connected;
  }
}