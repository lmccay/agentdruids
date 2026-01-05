import { DatabaseService } from '../services/DatabaseService';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Migration runner for updating existing schema to v2 comprehensive model
 */
export class MigrationV2Runner {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Run the v2 migration to update existing schema
   */
  async runMigration(): Promise<void> {
    console.log('🚀 Starting database migration to v2 comprehensive schema...');

    try {
      // Connect to database
      await this.db.connect();

      // Check current schema version
      const currentStatus = await this.checkCurrentSchema();
      console.log('📊 Current database status:', currentStatus);

      // Run migration if needed
      if (await this.needsMigration()) {
        await this.executeMigration();
        console.log('✅ Migration completed successfully');
      } else {
        console.log('ℹ️ Database already up to date');
      }

      // Verify migration
      await this.verifyMigration();

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Check current database schema status
   */
  private async checkCurrentSchema(): Promise<{
    agentsColumns: string[];
    realmsColumns: string[];
    hasScenarios: boolean;
    hasKnowledge: boolean;
    hasAsyncResults: boolean;
  }> {
    try {
      // Check agents table columns
      const agentsColumns = await this.db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'druids_core' AND table_name = 'agents'
        ORDER BY column_name
      `);

      // Check realms table columns
      const realmsColumns = await this.db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'druids_core' AND table_name = 'realms'
        ORDER BY column_name
      `);

      // Check if new tables exist
      const tableCheck = await this.db.query(`
        SELECT 
          (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'druids_core' AND table_name = 'scenarios')) as has_scenarios,
          (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'druids_knowledge' AND table_name = 'entries')) as has_knowledge,
          (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'druids_core' AND table_name = 'async_results')) as has_async_results
      `);

      return {
        agentsColumns: agentsColumns.rows.map(row => row['column_name']),
        realmsColumns: realmsColumns.rows.map(row => row['column_name']),
        hasScenarios: tableCheck.rows[0]['has_scenarios'],
        hasKnowledge: tableCheck.rows[0]['has_knowledge'],
        hasAsyncResults: tableCheck.rows[0]['has_async_results']
      };
    } catch (error) {
      console.error('Failed to check current schema:', error);
      throw error;
    }
  }

  /**
   * Check if migration is needed
   */
  private async needsMigration(): Promise<boolean> {
    try {
      const status = await this.checkCurrentSchema();
      
      // Check if we have the new columns in agents table
      const hasNewAgentColumns = status.agentsColumns.includes('realm_access') && 
                                 status.agentsColumns.includes('specialization') &&
                                 status.agentsColumns.includes('bindings');

      // Check if we have the new columns in realms table  
      const hasNewRealmColumns = status.realmsColumns.includes('agents') && 
                                status.realmsColumns.includes('ley_line_connections') &&
                                status.realmsColumns.includes('lifecycle');

      // Check if all new tables exist
      const hasAllTables = status.hasScenarios && status.hasKnowledge && status.hasAsyncResults;

      return !hasNewAgentColumns || !hasNewRealmColumns || !hasAllTables;
    } catch (error) {
      console.log('Migration check failed, assuming migration is needed:', error);
      return true;
    }
  }

  /**
   * Execute the migration SQL
   */
  private async executeMigration(): Promise<void> {
    try {
      const migrationPath = join(process.cwd(), 'src/database/migration-v2.sql');
      const migrationSql = readFileSync(migrationPath, 'utf8');

      console.log('📄 Executing v2 migration...');
      const result = await this.db.query(migrationSql);
      
      console.log('✅ Migration SQL executed successfully');
      
      // Show summary results if available
      if (result.rows && result.rows.length > 0) {
        console.log('📈 Migration summary:');
        result.rows.forEach(row => {
          console.log(`  - ${row['table_name']}: ${row['row_count']} rows`);
        });
      }
    } catch (error) {
      console.error('❌ Migration execution failed:', error);
      throw error;
    }
  }

  /**
   * Verify migration completed successfully
   */
  private async verifyMigration(): Promise<void> {
    try {
      console.log('🔍 Verifying migration...');
      
      const status = await this.checkCurrentSchema();
      
      // Verify agents table has new columns
      const requiredAgentColumns = ['realm_access', 'specialization', 'bindings', 'deployment', 'tags'];
      const missingAgentColumns = requiredAgentColumns.filter(col => !status.agentsColumns.includes(col));
      
      if (missingAgentColumns.length > 0) {
        throw new Error(`Missing agent columns: ${missingAgentColumns.join(', ')}`);
      }

      // Verify realms table has new columns
      const requiredRealmColumns = ['agents', 'ley_line_connections', 'lifecycle', 'health'];
      const missingRealmColumns = requiredRealmColumns.filter(col => !status.realmsColumns.includes(col));
      
      if (missingRealmColumns.length > 0) {
        throw new Error(`Missing realm columns: ${missingRealmColumns.join(', ')}`);
      }

      // Verify all tables exist
      if (!status.hasScenarios) throw new Error('scenarios table missing');
      if (!status.hasKnowledge) throw new Error('knowledge.entries table missing');
      if (!status.hasAsyncResults) throw new Error('async_results table missing');

      // Test a sample query from each table
      await this.db.query('SELECT COUNT(*) FROM druids_core.agents');
      await this.db.query('SELECT COUNT(*) FROM druids_core.realms');  
      await this.db.query('SELECT COUNT(*) FROM druids_core.scenarios');
      await this.db.query('SELECT COUNT(*) FROM druids_knowledge.entries');
      await this.db.query('SELECT COUNT(*) FROM druids_core.async_results');

      console.log('✅ Migration verification completed successfully');
    } catch (error) {
      console.error('❌ Migration verification failed:', error);
      throw error;
    }
  }

  /**
   * Get post-migration database statistics
   */
  async getPostMigrationStats(): Promise<{
    agents: number;
    realms: number;
    scenarios: number;
    knowledge: number;
    asyncResults: number;
  }> {
    try {
      const [agentCount, realmCount, scenarioCount, knowledgeCount, asyncCount] = await Promise.all([
        this.db.query('SELECT COUNT(*) as count FROM druids_core.agents'),
        this.db.query('SELECT COUNT(*) as count FROM druids_core.realms'),
        this.db.query('SELECT COUNT(*) as count FROM druids_core.scenarios'),
        this.db.query('SELECT COUNT(*) as count FROM druids_knowledge.entries'),
        this.db.query('SELECT COUNT(*) as count FROM druids_core.async_results')
      ]);

      return {
        agents: parseInt(agentCount.rows[0]['count'], 10),
        realms: parseInt(realmCount.rows[0]['count'], 10),
        scenarios: parseInt(scenarioCount.rows[0]['count'], 10),
        knowledge: parseInt(knowledgeCount.rows[0]['count'], 10),
        asyncResults: parseInt(asyncCount.rows[0]['count'], 10)
      };
    } catch (error) {
      console.error('Failed to get post-migration stats:', error);
      throw error;
    }
  }
}

/**
 * CLI script to run v2 migration
 */
if (require.main === module) {
  const migrator = new MigrationV2Runner();
  
  migrator.runMigration()
    .then(async () => {
      const stats = await migrator.getPostMigrationStats();
      console.log('🎉 Migration completed successfully!');
      console.log('📊 Final database statistics:', stats);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}