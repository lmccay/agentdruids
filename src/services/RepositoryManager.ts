import { DatabaseService } from './DatabaseService';
import { AgentRepository } from './AgentRepository';
import { RealmRepository } from './RealmRepository';
import { ModelRepository } from './ModelRepository';

/**
 * Central repository manager that coordinates all entity repositories
 * and provides a unified interface for database operations.
 */
export class RepositoryManager {
  private static instance: RepositoryManager;
  private db: DatabaseService;
  private agentRepo: AgentRepository;
  private realmRepo: RealmRepository;
  private modelRepo: ModelRepository;

  private constructor(db: DatabaseService) {
    this.db = db;
    this.agentRepo = new AgentRepository(db);
    this.realmRepo = new RealmRepository(db);
    this.modelRepo = new ModelRepository(db);
  }

  /**
   * Get singleton instance of RepositoryManager
   */
  public static getInstance(): RepositoryManager {
    if (!RepositoryManager.instance) {
      const db = DatabaseService.getInstance();
      RepositoryManager.instance = new RepositoryManager(db);
    }
    return RepositoryManager.instance;
  }

  /**
   * Initialize the repository manager with database connection
   */
  public static async initialize(): Promise<RepositoryManager> {
    const db = DatabaseService.getInstance();
    await db.connect();
    return RepositoryManager.getInstance();
  }

  /**
   * Get Agent repository
   */
  public get agents(): AgentRepository {
    return this.agentRepo;
  }

  /**
   * Get Realm repository
   */
  public get realms(): RealmRepository {
    return this.realmRepo;
  }

  /**
   * Get Model configuration repository
   */
  public get models(): ModelRepository {
    return this.modelRepo;
  }

  /**
   * Execute a raw database query (for specialized operations)
   */
  public async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    return this.db.query<T>(text, params);
  }

  /**
   * Get database service for direct access
   */
  public get database(): DatabaseService {
    return this.db;
  }

  /**
   * Execute operations within a transaction
   */
  public async transaction<T>(
    operations: (repos: RepositoryManager) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(async () => {
      return operations(this);
    });
  }

  /**
   * Check overall system health
   */
  public async getSystemHealth(): Promise<{
    database: { connected: boolean; latency?: number };
    repositories: {
      agents: { available: boolean; count: number };
      realms: { available: boolean; count: number };
    };
  }> {
    try {
      const dbHealth = await this.db.healthCheck();
      
      // Check repository availability by counting records
      const [agentCount, realmCount] = await Promise.all([
        this.agentRepo.count().catch(() => -1),
        this.realmRepo.count().catch(() => -1)
      ]);

      return {
        database: dbHealth,
        repositories: {
          agents: {
            available: agentCount >= 0,
            count: Math.max(0, agentCount)
          },
          realms: {
            available: realmCount >= 0,
            count: Math.max(0, realmCount)
          }
        }
      };
    } catch (error) {
      console.error('System health check failed:', error);
      return {
        database: { connected: false },
        repositories: {
          agents: { available: false, count: 0 },
          realms: { available: false, count: 0 }
        }
      };
    }
  }

  /**
   * Get comprehensive system statistics
   */
  public async getSystemStatistics(): Promise<{
    agents: Awaited<ReturnType<AgentRepository['getStatistics']>>;
    realms: Awaited<ReturnType<RealmRepository['getStatistics']>>;
    lastUpdated: string;
  }> {
    const [agentStats, realmStats] = await Promise.all([
      this.agentRepo.getStatistics(),
      this.realmRepo.getStatistics()
    ]);

    return {
      agents: agentStats,
      realms: realmStats,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Close all database connections
   */
  public async close(): Promise<void> {
    await this.db.close();
  }
}