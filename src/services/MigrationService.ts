import { DatabaseService } from './DatabaseService';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * MigrationService handles database schema migrations
 * Uses a version-based approach similar to Flyway/Liquibase
 */
export class MigrationService {
  private db: DatabaseService;
  private migrationsDir: string;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.migrationsDir = join(__dirname, '../database/migrations');
  }

  /**
   * Run all pending migrations on startup
   */
  async runPendingMigrations(): Promise<void> {
    console.log('🔄 Checking for pending database migrations...');

    try {
      await this.db.connect();

      // Ensure migration tracking table exists
      await this.ensureMigrationTable();

      // Get current version
      const currentVersion = await this.getCurrentVersion();
      console.log(`📊 Current schema version: ${currentVersion}`);

      // Get available migrations
      const availableMigrations = this.getAvailableMigrations();
      console.log(`📁 Found ${availableMigrations.length} migration files`);

      // Filter to pending migrations
      const pendingMigrations = availableMigrations.filter(
        (m) => m.version > currentVersion
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ Database schema is up to date');
        return;
      }

      console.log(`🔧 Applying ${pendingMigrations.length} pending migrations...`);

      // Apply each migration in order
      for (const migration of pendingMigrations) {
        await this.applyMigration(migration);
      }

      console.log('✅ All migrations applied successfully');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw new Error(`Database migration failed: ${error}`);
    }
  }

  /**
   * Ensure migration tracking table exists
   */
  private async ensureMigrationTable(): Promise<void> {
    try {
      // Try to query the table
      await this.db.query('SELECT version FROM druids_core.schema_migrations LIMIT 1');
    } catch (error) {
      // Table doesn't exist - this should not happen if init.sql ran
      throw new Error(
        'Migration tracking table does not exist. ' +
        'This usually means the database was not initialized properly. ' +
        'Run: ./scripts/db-reset.sh'
      );
    }
  }

  /**
   * Get current schema version from database
   */
  private async getCurrentVersion(): Promise<number> {
    try {
      const result = await this.db.query(`
        SELECT MAX(version) as version
        FROM druids_core.schema_migrations
        WHERE success = true
      `);

      return result.rows[0]['version'] || 0;
    } catch (error) {
      // Table doesn't exist yet, version is 0
      return 0;
    }
  }

  /**
   * Get list of available migration files
   * Migrations start from version 002 (000 and 001 are baseline from init.sql)
   */
  private getAvailableMigrations(): Array<{ version: number; name: string; filename: string }> {
    try {
      const files = readdirSync(this.migrationsDir);
      const migrations = files
        .filter((f) => f.endsWith('.sql'))
        .map((filename) => {
          const match = filename.match(/^(\d+)_(.+)\.sql$/);
          if (!match) {
            throw new Error(`Invalid migration filename: ${filename}`);
          }
          const version = parseInt(match[1], 10);
          if (version < 2) {
            throw new Error(
              `Migration version ${version} is reserved for baseline. ` +
              `Migrations must start from version 002.`
            );
          }
          return {
            version,
            name: match[2],
            filename,
          };
        })
        .sort((a, b) => a.version - b.version);

      return migrations;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        // Directory doesn't exist yet - that's ok, no migrations
        return [];
      }
      if (error instanceof Error && error.message.includes('reserved')) {
        throw error; // Re-throw validation errors
      }
      console.warn('⚠️  Could not read migrations directory:', error);
      return [];
    }
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: {
    version: number;
    name: string;
    filename: string;
  }): Promise<void> {
    console.log(`  📝 Applying migration ${migration.version}: ${migration.name}...`);

    const startTime = Date.now();

    try {
      // Read migration SQL
      const sql = readFileSync(join(this.migrationsDir, migration.filename), 'utf8');

      // Execute migration
      await this.db.query(sql);

      const executionTime = Date.now() - startTime;

      // Record successful migration
      await this.db.query(
        `
        INSERT INTO druids_core.schema_migrations (version, name, execution_time_ms, success)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (version) DO UPDATE SET
          applied_at = CURRENT_TIMESTAMP,
          execution_time_ms = EXCLUDED.execution_time_ms,
          success = EXCLUDED.success
      `,
        [migration.version, migration.name, executionTime, true]
      );

      console.log(`  ✅ Migration ${migration.version} completed in ${executionTime}ms`);
    } catch (error) {
      // Record failed migration
      await this.db.query(
        `
        INSERT INTO druids_core.schema_migrations (version, name, success)
        VALUES ($1, $2, $3)
        ON CONFLICT (version) DO UPDATE SET
          applied_at = CURRENT_TIMESTAMP,
          success = EXCLUDED.success
      `,
        [migration.version, migration.name, false]
      );

      throw new Error(`Migration ${migration.version} failed: ${error}`);
    }
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(): Promise<Array<{
    version: number;
    name: string;
    applied_at: Date;
    success: boolean;
  }>> {
    try {
      const result = await this.db.query(`
        SELECT version, name, applied_at, success
        FROM druids_core.schema_migrations
        ORDER BY version
      `);

      return result.rows.map((row) => ({
        version: row['version'],
        name: row['name'],
        applied_at: new Date(row['applied_at']),
        success: row['success'],
      }));
    } catch (error) {
      console.warn('⚠️  Could not get migration history:', error);
      return [];
    }
  }
}

export const migrationService = new MigrationService();
