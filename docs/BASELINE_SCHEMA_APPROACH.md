# Baseline Schema Approach

## Decision: init.sql as Baseline

Since there are **no production deployments yet**, we're treating `docker/init.sql` as the **baseline schema** (version 001). This simplifies the migration system and avoids conflicts.

## How It Works

### Fresh Clone
```bash
git clone <repo>
cd druids
./scripts/dev.sh start
```

1. PostgreSQL starts for first time
2. `docker/init.sql` runs automatically (PostgreSQL feature)
3. **Creates complete schema** with all tables and columns
4. **Creates migration tracking table** (`druids_core.schema_migrations`)
5. **Records baseline as version 001**
6. App starts, checks migrations → version 001, no pending migrations
7. Ready to use!

### Future Schema Changes
```bash
# Developer creates migration
touch src/database/migrations/002_add_notifications.sql

# Write SQL
cat > src/database/migrations/002_add_notifications.sql << 'EOF'
-- Migration 002: Add notifications

BEGIN;

CREATE TABLE druids_core.notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
EOF

# Commit and push
git add src/database/migrations/002_add_notifications.sql
git commit -m "Add notifications table"
git push
```

**Other developers:**
```bash
git pull  # Gets new migration file
docker-compose restart druids-app  # Migration runs automatically
```

## Version Allocation

| Version | Name | Location | Description |
|---------|------|----------|-------------|
| 000 | Migration tracking | `docker/init.sql` | Creates schema_migrations table |
| 001 | Baseline schema | `docker/init.sql` | Complete current schema (all tables) |
| 002+ | Future changes | `src/database/migrations/*.sql` | Your migrations go here |

## Why This Approach?

### ✅ Advantages

1. **No Conflicts**: `init.sql` and migration files don't overlap
2. **Clean Start**: Every fresh clone gets correct schema immediately
3. **Simple**: Only one source of truth for baseline (`init.sql`)
4. **Standard Practice**: Common in pre-production projects
5. **Future-Ready**: Migration system ready for version 002+

### ❌ What We Avoided

**Alternative: Put baseline in migrations**
```
migrations/
  000_migration_tracking.sql
  001_initial_schema.sql  ← Would conflict with init.sql!
```

**Problem:** Both `init.sql` and `001_initial_schema.sql` would try to create the same tables. Even with `IF NOT EXISTS`, it's confusing and error-prone.

**Our Approach:**
```
docker/init.sql                  ← Creates everything + records version 001
migrations/
  README.md                      ← Documents the system
  (empty, ready for 002+)
```

**Result:** Clean separation, no conflicts.

## Implementation Details

### docker/init.sql

At the end, it:
1. Creates the schema_migrations table
2. Records two entries:
   ```sql
   INSERT INTO druids_core.schema_migrations (version, name, success)
   VALUES
     (0, '000_migration_tracking', true),
     (1, '001_baseline_from_init_sql', true);
   ```
3. This tells the migration system: "baseline is version 001, start from 002"

### MigrationService.ts

When scanning for migrations:
1. Reads `src/database/migrations/*.sql`
2. Validates versions ≥ 2 (rejects 000 or 001)
3. Compares with current version from database (initially 001)
4. Runs pending migrations (002, 003, 004...)

### Protection

If someone accidentally creates `001_something.sql`:
```bash
docker-compose restart druids-app
# ERROR: Migration version 1 is reserved for baseline.
#        Migrations must start from version 002.
```

The system prevents mistakes.

## Migration Creation Example

```bash
# Check current version
docker-compose exec druids-postgres psql -U druids_user -d druids \
  -c "SELECT version, name FROM druids_core.schema_migrations ORDER BY version;"

# Output:
#  version |            name
# ---------+----------------------------
#        0 | 000_migration_tracking
#        1 | 001_baseline_from_init_sql
# (2 rows)

# Create first migration
cat > src/database/migrations/002_add_api_keys.sql << 'EOF'
-- Migration 002: Add API keys table

BEGIN;

CREATE TABLE druids_core.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_api_keys_user ON druids_core.api_keys(user_id);
CREATE INDEX idx_api_keys_expires ON druids_core.api_keys(expires_at);

COMMIT;
EOF

# Restart app
docker-compose restart druids-app

# Check logs
docker logs druids-app | grep Migration
# 🔄 Checking for pending database migrations...
# 📊 Current schema version: 1
# 📁 Found 1 migration files
# 🔧 Applying 1 pending migrations...
#   📝 Applying migration 2: add_api_keys...
#   ✅ Migration 2 completed in 45ms
# ✅ All migrations applied successfully

# Verify
docker-compose exec druids-postgres psql -U druids_user -d druids \
  -c "SELECT version, name FROM druids_core.schema_migrations ORDER BY version;"

# Output:
#  version |            name
# ---------+----------------------------
#        0 | 000_migration_tracking
#        1 | 001_baseline_from_init_sql
#        2 | add_api_keys
# (3 rows)
```

## When to Use This vs Full Migrations

### Use Baseline Approach (What We Did)

**Conditions:**
- ✅ No production deployments
- ✅ All developers can reset to clean state
- ✅ Database schema is stable enough
- ✅ Team is small/coordinated

**Benefit:** Simple, clean, no legacy baggage

### Use Full Migration History

**Conditions:**
- Production databases exist
- Can't reset production data
- Need to upgrade from old versions
- Large team with different environments

**Example:**
```
migrations/
  001_initial_users.sql     (June 2024)
  002_add_roles.sql         (July 2024)
  003_add_teams.sql         (Aug 2024)
  ...
  025_add_notifications.sql (Jan 2026)
```

You'd need all 25 migrations to rebuild from scratch, or separate "baseline" and "migration" approaches.

## Summary

**Druids uses the baseline approach because:**
1. No production deployments to upgrade
2. Simpler mental model: init.sql = version 001, start from 002
3. Cleaner codebase: no redundant migration files
4. Future-ready: system works perfectly for version 002+

**The rule:** `docker/init.sql` is sacred. It's the baseline. Migrations start from 002.

**If you need to change baseline in the future:**
1. Update `docker/init.sql` with new schema
2. Create migration (e.g., 002) with the SAME changes
3. Existing systems get migration, new systems get init.sql
4. Both end up at same schema

But for now, we're pre-production, so init.sql is the source of truth.
