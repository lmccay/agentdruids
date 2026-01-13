# Database Migration System

## Overview

The Druids project now has a **production-ready, version-based database migration system** that ensures anyone cloning the repository gets a clean, working database automatically.

## Problem We Solved

**Before:**
- `docker/init.sql` had an outdated schema
- Database state persisted in Docker volumes
- New clones got old schema, existing systems had new schema
- Manual migration required (`migration-add-columns.sql`)
- No way to track which migrations were applied
- Developers had to manually fix schema inconsistencies

**After:**
- `docker/init.sql` has current schema (baseline)
- Versioned migrations in `src/database/migrations/`
- Automatic migration on app startup
- Migration tracking in database
- One command to reset: `./scripts/db-reset.sh`
- Zero manual intervention needed

## How It Works

### 1. Fresh Clone (First Startup)

```bash
git clone <repo>
cd druids
./scripts/dev.sh start
```

**What happens:**
1. PostgreSQL container starts
2. `docker/init.sql` runs ONCE (creates complete schema + records version 001)
3. App starts and checks migration version (currently 001)
4. No pending migrations yet (directory is empty, ready for version 002+)
5. System ready to use with baseline schema

### 2. Existing Installation (Schema Updates)

```bash
git pull  # Gets new migration files
docker-compose restart druids-app
```

**What happens:**
1. App starts and checks current schema version (e.g., 001 from baseline)
2. Scans `src/database/migrations/` for files
3. Finds new migration files (e.g., 002, 003)
4. Runs pending migrations in order (002 → 003)
5. Updates migration tracking table
6. System updated automatically

### 3. Complete Reset (Clean State)

```bash
./scripts/db-reset.sh
```

**What happens:**
1. Confirms with user (data will be lost)
2. Stops all services
3. Deletes PostgreSQL volume
4. Restarts services
5. Fresh database initialized from `docker/init.sql`

## Architecture

### Components

**1. Baseline Schema (`docker/init.sql`)**
- Runs ONLY on first database initialization
- Contains complete current schema (all tables, columns, indexes)
- Creates migration tracking table
- Records baseline as version 001 in tracking table
- This is your "version zero" - everything starts from here

**2. Migration Tracking Table**
```sql
druids_core.schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(255),
  applied_at TIMESTAMP,
  success BOOLEAN
)
```

Populated by `init.sql` with:
- Version 000: Migration tracking system
- Version 001: Baseline schema from init.sql

**3. Migration Files**
- Location: `src/database/migrations/`
- Format: `{version}_{description}.sql`
- **Versions 002+** (000 and 001 reserved for baseline)
- Examples:
  - `002_add_notifications.sql` - Adds notifications system
  - `003_add_audit_log.sql` - Adds audit logging

**3. Migration Service**
- File: `src/services/MigrationService.ts`
- Scans migration directory
- Compares with database version
- Applies pending migrations
- Records results in tracking table

**4. Startup Integration**
- File: `src/index.ts`
- Runs migrations before app starts
- Fails fast if migration errors
- Provides helpful error messages

### Migration Lifecycle

```
App Startup
    ↓
Check schema_migrations table
    ↓
Get current version (e.g., 1)
    ↓
Scan migrations directory
    ↓
Find pending (002, 003, 004)
    ↓
Apply each in order
    ↓
Update tracking table
    ↓
Continue startup
```

## Version-Based Approach

This system is based on proven migration tools:

- **Flyway** (Java ecosystem)
- **Liquibase** (Java ecosystem)
- **Rails migrations** (Ruby ecosystem)
- **Alembic** (Python ecosystem)

### Key Principles

1. **Immutable Migrations**: Never change a migration after it's applied
2. **Sequential Versions**: Each migration has a unique version number
3. **Idempotent Operations**: Use `IF NOT EXISTS` / `IF EXISTS`
4. **Transactional**: Wrap in `BEGIN;` / `COMMIT;`
5. **One Direction**: Migrations move forward, rollbacks are new migrations

### Advantages Over Hardcoded Schema Checks

**Old Approach (Hardcoded):**
```typescript
// Check if specific columns exist
const hasDescription = columns.includes('description');
const hasSpecialization = columns.includes('specialization');
// ... brittle, needs updating with every schema change
```

**New Approach (Version-Based):**
```typescript
// Check version number
const currentVersion = await getCurrentVersion(); // e.g., 5
const pendingMigrations = migrations.filter(m => m.version > currentVersion);
// ... no code changes needed for new schema changes
```

**Benefits:**
- ✅ No code changes when schema evolves
- ✅ Clear history of all schema changes
- ✅ Easy to understand what changed and when
- ✅ Works for any schema evolution (add/remove/modify)
- ✅ Industry-standard approach

## Files Created/Modified

### New Files

1. **`src/database/migrations/000_migration_tracking.sql`**
   - Creates migration tracking table
   - Special case: version 0

2. **`src/database/migrations/001_initial_schema.sql`**
   - Baseline comprehensive schema
   - All current tables and columns

3. **`src/database/migrations/README.md`**
   - Complete migration developer guide
   - Best practices, examples, troubleshooting

4. **`src/services/MigrationService.ts`**
   - Core migration logic
   - Version checking, file scanning, migration execution

5. **`scripts/db-reset.sh`**
   - One-command database reset
   - Interactive confirmation

6. **`docs/DATABASE_SETUP.md`**
   - Comprehensive database management guide
   - First-time setup, reset procedures, troubleshooting

7. **`docs/DATABASE_MIGRATION_SYSTEM.md`** (this file)
   - Architecture overview and rationale

### Modified Files

1. **`docker/init.sql`**
   - Updated to current comprehensive schema
   - Includes all modern columns
   - Serves as baseline for fresh installs

2. **`src/index.ts`**
   - Added migration service call on startup
   - Helpful error messages for migration failures

3. **`CLAUDE.md`**
   - Added first-time setup instructions
   - Added database management section
   - Added migration creation guide

## Developer Workflow

### For New Developers

```bash
# Clone and start - that's it!
git clone <repo>
cd druids
./scripts/dev.sh start
```

Everything works automatically. No manual schema setup needed.

### For Existing Developers

```bash
# Pull changes (may include new migrations)
git pull

# Restart app - migrations run automatically
docker-compose restart druids-app

# Verify in logs
docker logs druids-app | grep Migration
```

### When Schema Breaks

```bash
# Nuclear option - complete reset
./scripts/db-reset.sh

# Or: manually run specific migration
docker-compose exec druids-postgres psql -U druids_user -d druids < src/database/migrations/002_fix.sql
```

### Adding New Schema Changes

```bash
# 1. Create migration file
touch src/database/migrations/002_add_notifications.sql

# 2. Write SQL
cat > src/database/migrations/002_add_notifications.sql << 'EOF'
-- Migration 002: Add notification system

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
EOF

# 3. Test locally
docker-compose restart druids-app
docker logs druids-app | grep "Migration 002"

# 4. Commit and push
git add src/database/migrations/002_add_notifications.sql
git commit -m "Add notification system schema"
git push
```

Other developers will get the migration automatically on next pull + restart.

## Comparison with Other Systems

| Feature | Old System | New System | Industry Standard |
|---------|-----------|------------|-------------------|
| Fresh clone setup | Manual migration | Automatic | ✅ Automatic |
| Schema tracking | None | Version-based | ✅ Version-based |
| Migration application | Manual | Automatic | ✅ Automatic |
| Schema evolution | Code changes needed | Just add SQL file | ✅ Just add file |
| Reset to clean state | Manual docker commands | One command | ✅ One command |
| Migration history | No tracking | Full history in DB | ✅ Full history |
| Rollback support | Not possible | New migration | ✅ New migration |
| Idempotency | Not guaranteed | Required in migrations | ✅ Required |

## Future Enhancements

### Potential Improvements

1. **Migration Checksum Validation**
   - Detect if applied migration files were modified
   - Warn about schema drift

2. **Dry Run Mode**
   - Test migrations without applying
   - Preview SQL that would run

3. **Migration Generator**
   - CLI tool to generate migration files
   - Auto-increment version numbers

4. **Rollback Migrations**
   - Optional "down" migrations
   - Automatic rollback on failure

5. **Data Migrations**
   - Separate data migrations from schema migrations
   - Long-running operation handling

6. **Migration Locking**
   - Prevent concurrent migrations
   - Database-level locks

### Not Needed Yet

These are **intentionally not implemented** because YAGNI (You Aren't Gonna Need It):

- Complex migration dependencies
- Conditional migrations
- Multi-database support
- Migration branching/merging
- Web UI for migration management

The current system handles 99% of use cases with simplicity and reliability.

## Troubleshooting

See [DATABASE_SETUP.md](./DATABASE_SETUP.md) for comprehensive troubleshooting guide.

Quick reference:

- **"Migration failed"** - Check logs, fix SQL, restart
- **"Column already exists"** - Database ahead of migrations, reset or create catch-up migration
- **"Table doesn't exist"** - Database behind migrations, migrations should fix it automatically
- **"Can't connect to database"** - Check PostgreSQL health: `./scripts/health.sh check`

## Summary

The new migration system ensures that **anyone can clone the repo and start working immediately** with a consistent, up-to-date database schema. No manual steps, no "ask another developer", no hidden knowledge required.

This is how professional database management works, and now Druids has it too.
