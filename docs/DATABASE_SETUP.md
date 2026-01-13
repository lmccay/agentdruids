# Database Setup and Management

This document explains how to set up, reset, and manage the Druids database in Docker.

## Table of Contents

- [First-Time Setup](#first-time-setup)
- [Resetting to Clean State](#resetting-to-clean-state)
- [Database Migrations](#database-migrations)
- [Troubleshooting](#troubleshooting)

## First-Time Setup

When you clone the repository and start services for the first time, the database will be automatically initialized:

```bash
# Clone the repo
git clone <repo-url>
cd druids

# Copy environment template
cp .env.example .env

# Start all services (first time)
./scripts/dev.sh start
```

**What happens on first startup:**

1. PostgreSQL container starts
2. `docker/init.sql` runs automatically (ONLY on first initialization)
3. Database schemas are created (`druids_core`, `druids_knowledge`, `druids_scenarios`)
4. Tables are created with the current comprehensive schema
5. Sample data is inserted (default realm and system coordinator agent)

**IMPORTANT:** The `init.sql` file only runs once. After that, the database state persists in Docker volumes.

## Resetting to Clean State

If you need to reset the database to a clean state (e.g., after pulling schema changes, fixing corruption, or testing fresh install):

### Option 1: Automated Reset Script (Recommended)

```bash
./scripts/db-reset.sh
```

This script will:
- Prompt for confirmation (ALL DATA WILL BE LOST)
- Stop all services
- Remove the PostgreSQL volume
- Restart services with fresh database

### Option 2: Manual Reset

```bash
# Stop all services
docker-compose down

# Remove PostgreSQL volume
docker volume rm druids_druids-postgres-data

# Start services (fresh database will be created)
./scripts/dev.sh start

# Verify schema
docker-compose exec druids-postgres psql -U druids_user -d druids -c "\d druids_core.agents"
```

### Option 3: Nuclear Option (Reset Everything)

```bash
# Stop all services and remove ALL volumes
docker-compose down -v

# Remove all druids-related volumes
docker volume prune

# Rebuild and start fresh
docker-compose build --no-cache
./scripts/dev.sh start
```

## Database Migrations

### When You Need Migrations

- **Fresh clone:** No migration needed - `init.sql` handles it
- **Existing database + schema changes:** Run migrations to update schema

### Running Migrations

#### Automatic Migration (Recommended)

The app will automatically run migrations on startup (if implemented - see [Auto-Migration TODO](#auto-migration-on-startup)).

#### Manual Migration

If automatic migrations aren't working or you need to apply specific migrations:

```bash
# Apply the column addition migration
docker-compose exec druids-postgres psql -U druids_user -d druids < src/database/migration-add-columns.sql

# Or run the migration runner
docker-compose exec druids-app npx ts-node src/database/migration-v2-runner.ts
```

### Available Migration Files

- `docker/init.sql` - **BASELINE SCHEMA** (runs on first startup only, version 001)
- `src/database/migrations/` - **Future migrations** (version 002+, currently empty)
- `src/database/schema.sql` - Full current schema definition (reference only, not used)
- `src/database/migration-add-columns.sql` - Legacy migration (superseded by baseline)

## Checking Database State

### Check Current Schema

```bash
# List all tables
docker-compose exec druids-postgres psql -U druids_user -d druids -c "\dt druids_core.*"

# Describe agents table
docker-compose exec druids-postgres psql -U druids_user -d druids -c "\d druids_core.agents"

# Check schema version
docker-compose exec druids-postgres psql -U druids_user -d druids -c "SELECT * FROM druids_knowledge.entries WHERE namespace='worldtree://public/system' AND key='schema_version';"
```

### Check Data

```bash
# Count agents
docker-compose exec druids-postgres psql -U druids_user -d druids -c "SELECT COUNT(*) FROM druids_core.agents;"

# List all agents
docker-compose exec druids-postgres psql -U druids_user -d druids -c "SELECT id, name, type, status FROM druids_core.agents;"

# List all realms
docker-compose exec druids-postgres psql -U druids_user -d druids -c "SELECT id, name, type, status FROM druids_core.realms;"
```

## Troubleshooting

### Error: "column 'description' does not exist"

**Cause:** You have an old database schema that doesn't include new columns.

**Solution:**
```bash
# Option 1: Reset database (loses data)
./scripts/db-reset.sh

# Option 2: Run migration (preserves data)
docker-compose exec druids-postgres psql -U druids_user -d druids < src/database/migration-add-columns.sql
```

### Error: "database 'druids' does not exist"

**Cause:** Database hasn't been initialized yet.

**Solution:**
```bash
# Restart PostgreSQL to trigger init
docker-compose restart druids-postgres

# Or full restart
./scripts/dev.sh stop
./scripts/dev.sh start
```

### Error: Migration fails with JSON syntax error

**Cause:** The full `migration-v2.sql` has complex JSON that may fail in some scenarios.

**Solution:**
```bash
# Use the simpler column-addition migration instead
docker-compose exec druids-postgres psql -U druids_user -d druids < src/database/migration-add-columns.sql
```

### Database Won't Initialize

**Symptoms:** PostgreSQL starts but tables don't exist.

**Solution:**
```bash
# Check if init.sql ran
docker logs druids-postgres 2>&1 | grep "init.sql"

# If volume exists, init.sql won't run again - reset volume
docker-compose down
docker volume rm druids_druids-postgres-data
./scripts/dev.sh start
```

## Best Practices

### For Development

1. **First clone:** Just run `./scripts/dev.sh start` - everything initializes automatically
2. **After pulling schema changes:** Run `./scripts/db-reset.sh` to get fresh schema
3. **Keep init.sql current:** The `docker/init.sql` file should always match the current schema

### For Production

1. **Never use init.sql in production** - it's for development only
2. **Use proper migration tools** - Consider tools like Flyway or Liquibase
3. **Always backup before migrations** - Test migrations on staging first
4. **Version your migrations** - Track which migrations have been applied

### For Testing Clean State

When someone asks "how do I get to a clean state?":

```bash
# Clean state script
./scripts/db-reset.sh
```

That's it! Simple, documented, one command.

## Auto-Migration on Startup

**TODO:** Currently, migrations don't run automatically on app startup. To implement this:

1. Check schema version in database
2. Compare with expected version
3. Run pending migrations automatically
4. Only fail startup if migrations fail

See `src/database/migration-v2-runner.ts` for migration runner logic.
