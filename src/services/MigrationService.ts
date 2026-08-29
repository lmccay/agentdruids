import { DatabaseService } from './DatabaseService';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface MigrationDescriptor {
  version: number;
  name: string;
  filename: string;
}

export interface MigrationPlan {
  /** Migrations to apply, in ascending version order. */
  pending: MigrationDescriptor[];
  /**
   * Pending migrations whose version is *below* the highest applied version.
   * These are the ones a high-water mark would have skipped, and their presence
   * means something already went wrong — a branch landed out of order, or a row
   * was removed from the tracking table.
   */
  outOfOrder: MigrationDescriptor[];
  /** Highest successfully applied version, or 0 if none. */
  highestApplied: number;
}

/**
 * Decide which migrations to apply, from the *set* of applied versions rather
 * than a high-water mark.
 *
 * The runner previously computed `version > MAX(applied)`, so a migration whose
 * version sat below the maximum was never applied and never reported. Two
 * branches adding 021 and 022 in parallel were enough to trigger it: a database
 * that applied 022 first would never apply 021, and would report itself up to
 * date. That is exactly what happened during review of #95 — 021 was rolled back
 * for re-testing and silently refused to re-apply because 022 was present.
 *
 * A set difference applies out-of-order arrivals and is otherwise identical: for
 * a database that has applied a contiguous prefix, it selects the same files.
 *
 * Gaps in the *file* numbering are not gaps here. There is no 002 and never has
 * been — numbering starts at 003 — and since no such file exists it can never be
 * pending, so it needs no special case. Only a file that exists and is unapplied
 * is reported.
 *
 * @param available every migration file found on disk
 * @param appliedVersions versions recorded as *successfully* applied; a failed
 *   migration is deliberately absent so it is retried
 */
export function planPendingMigrations(
  available: readonly MigrationDescriptor[],
  appliedVersions: Iterable<number>
): MigrationPlan {
  const applied = new Set(appliedVersions);
  const highestApplied = applied.size === 0 ? 0 : Math.max(...applied);

  const pending = available
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  return {
    pending,
    outOfOrder: pending.filter((m) => m.version < highestApplied),
    highestApplied,
  };
}

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

      // Which versions the database has actually applied — the set, not just the
      // maximum. See planPendingMigrations for why the difference matters.
      const appliedVersions = await this.getAppliedVersions();

      // Get available migrations
      const availableMigrations = this.getAvailableMigrations();
      console.log(`📁 Found ${availableMigrations.length} migration files`);

      const plan = planPendingMigrations(availableMigrations, appliedVersions);
      console.log(`📊 Current schema version: ${plan.highestApplied}`);

      if (plan.outOfOrder.length > 0) {
        // Not fatal — applying them is the fix — but it is reported loudly,
        // because a migration sitting below the high-water mark means a branch
        // landed out of order or a tracking row went missing, and the previous
        // runner would have skipped it in silence.
        console.warn(
          `⚠️  ${plan.outOfOrder.length} migration(s) are unapplied despite being below ` +
          `applied version ${plan.highestApplied}: ` +
          plan.outOfOrder.map((m) => `${m.version} (${m.name})`).join(', ') +
          '. Applying them now; a previous run skipped them silently.'
        );
      }

      if (plan.pending.length === 0) {
        console.log('✅ Database schema is up to date');
        return;
      }

      console.log(
        `🔧 Applying ${plan.pending.length} pending migrations: ` +
        plan.pending.map((m) => m.version).join(', ')
      );

      // Apply each migration in order
      for (const migration of plan.pending) {
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
   * Every version the database records as successfully applied.
   *
   * A failed migration is left out on purpose, so it is retried on the next
   * start rather than being treated as done.
   *
   * Errors propagate. This used to `catch { return 0 }` on the theory that the
   * table might not exist yet — but ensureMigrationTable has already refused to
   * continue in that case, so the only thing the catch could still absorb was a
   * genuine query failure. Absorbing it would report *no* migrations as applied
   * and re-run every one of them against a live database, which for a migration
   * that rewrites stored references is far worse than failing to start.
   */
  private async getAppliedVersions(): Promise<number[]> {
    const result = await this.db.query(`
      SELECT version
      FROM druids_core.schema_migrations
      WHERE success = true
    `);

    return result.rows
      .map((row) => Number(row['version']))
      .filter((version) => Number.isFinite(version));
  }

  /**
   * Get list of available migration files
   * Migrations start from version 002 (000 and 001 are baseline from init.sql)
   */
  private getAvailableMigrations(): Array<{ version: number; name: string; filename: string }> {
    // Only the directory read is guarded. Everything after it — filename
    // validation, the reserved-version check, and the empty-set check — must
    // propagate, so it deliberately sits outside the try.
    let files: string[];
    try {
      files = readdirSync(this.migrationsDir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT' || (error instanceof Error && error.message.includes('ENOENT'))) {
        // A missing migrations directory is a packaging fault, not "no
        // migrations to run". Treating it as the latter is how a production
        // image shipped without its .sql files could start cleanly, report
        // success, and serve an unmigrated database — silently. Fail fast
        // instead; index.ts turns this into a clear startup failure.
        throw new Error(
          `Migrations directory not found at ${this.migrationsDir}. ` +
          'This is a packaging error, not an empty migration set: tsc does not ' +
          'emit .sql files, so they must be copied into the build output ' +
          '(see scripts/copy-runtime-assets.js, run by `npm run build`). ' +
          'Refusing to start against a potentially unmigrated database.'
        );
      }
      throw error;
    }

    {
      const migrations = files
        .filter((f) => f.endsWith('.sql'))
        .map((filename) => {
          const match = filename.match(/^(\d+)_(.+)\.sql$/);
          if (!match) {
            throw new Error(`Invalid migration filename: ${filename}`);
          }
          const versionStr = match[1];
          const name = match[2];
          if (versionStr === undefined || name === undefined) {
            // Unreachable given the regex, but TypeScript needs the narrow.
            throw new Error(`Invalid migration filename: ${filename}`);
          }
          const version = parseInt(versionStr, 10);
          if (version < 2) {
            throw new Error(
              `Migration version ${version} is reserved for baseline. ` +
              `Migrations must start from version 002.`
            );
          }
          return {
            version,
            name,
            filename,
          };
        })
        .sort((a, b) => a.version - b.version);

      // An empty directory is the same packaging fault as a missing one — the
      // copy step ran but produced nothing — and would otherwise read as
      // "nothing to apply". This repository always has migrations, so zero is
      // never a legitimate state.
      if (migrations.length === 0) {
        throw new Error(
          `No migration files found in ${this.migrationsDir}. ` +
          'Expected at least one .sql file. This is a packaging error: tsc does ' +
          'not emit .sql files, so they must be copied into the build output ' +
          '(see scripts/copy-runtime-assets.js, run by `npm run build`). ' +
          'Refusing to start against a potentially unmigrated database.'
        );
      }

      return migrations;
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
