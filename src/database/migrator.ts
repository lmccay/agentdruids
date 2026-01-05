import { DatabaseService } from '../services/DatabaseService';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Database migration runner for initializing schema and sample data
 */
export class DatabaseMigrator {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Run all database migrations
   */
  async migrate(): Promise<void> {
    console.log('🚀 Starting database migration...');

    try {
      // Connect to database
      await this.db.connect();

      // Run schema migration
      await this.runSchemaMigration();

      console.log('✅ Database migration completed successfully');
    } catch (error) {
      console.error('❌ Database migration failed:', error);
      throw error;
    }
  }

  /**
   * Run schema migration from SQL file
   */
  private async runSchemaMigration(): Promise<void> {
    try {
      // Read from the project root src directory
      const schemaPath = join(process.cwd(), 'src/database/schema.sql');
      const schemaSql = readFileSync(schemaPath, 'utf8');

      console.log('📄 Executing schema migration...');
      await this.db.query(schemaSql);
      console.log('✅ Schema migration completed');
    } catch (error) {
      console.error('❌ Schema migration failed:', error);
      throw error;
    }
  }

  /**
   * Check if migration is needed by testing for required tables
   */
  async isMigrationNeeded(): Promise<boolean> {
    try {
      // Check if agents table exists
      const result = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'druids_core' 
          AND table_name = 'agents'
        )
      `);

      return !result.rows[0]['exists'];
    } catch (error) {
      console.log('Migration check failed, assuming migration is needed:', error);
      return true;
    }
  }

  /**
   * Get current database version/status
   */
  async getDatabaseStatus(): Promise<{
    connected: boolean;
    schemaExists: boolean;
    agentCount: number;
    realmCount: number;
  }> {
    try {
      await this.db.connect();

      // Check if schema exists
      const schemaCheck = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'druids_core' 
          AND table_name = 'agents'
        ) as agents_exist,
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'druids_core' 
          AND table_name = 'realms'
        ) as realms_exist
      `);

      const schemaExists = schemaCheck.rows[0]['agents_exist'] && schemaCheck.rows[0]['realms_exist'];

      let agentCount = 0;
      let realmCount = 0;

      if (schemaExists) {
        const agentCountResult = await this.db.query('SELECT COUNT(*) as count FROM druids_core.agents');
        const realmCountResult = await this.db.query('SELECT COUNT(*) as count FROM druids_core.realms');
        
        agentCount = parseInt(agentCountResult.rows[0]['count'], 10);
        realmCount = parseInt(realmCountResult.rows[0]['count'], 10);
      }

      return {
        connected: true,
        schemaExists,
        agentCount,
        realmCount
      };
    } catch (error) {
      console.error('Failed to get database status:', error);
      return {
        connected: false,
        schemaExists: false,
        agentCount: 0,
        realmCount: 0
      };
    }
  }
}

/**
 * CLI script to run migrations
 */
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  
  migrator.migrate()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}