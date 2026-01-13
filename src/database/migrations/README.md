## Database Migrations

This directory contains versioned database migrations that are automatically applied on application startup.

### Migration System

The migration system uses a **version-based approach** similar to Flyway/Liquibase:

1. Each migration has a numeric version (e.g., `001`, `002`, `003`)
2. Database tracks which migrations have been applied in `druids_core.schema_migrations`
3. On startup, the system runs all pending migrations in order
4. Migrations are transactional - if one fails, it rolls back

### Migration File Naming

Format: `{version}_{description}.sql`

**IMPORTANT:** Migrations start from version 002. Versions 000 and 001 are reserved:
- Version 000: Migration tracking table (created by `docker/init.sql`)
- Version 001: Baseline schema (created by `docker/init.sql`)
- Version 002+: Your migrations start here

Examples:
- `002_add_user_preferences.sql` - Adds user preferences table
- `003_add_audit_logging.sql` - Adds audit logging columns
- `004_add_notifications.sql` - Adds notifications system

**Rules:**
- Version must be 3 digits with leading zeros (002, 003, etc.)
- Description uses underscores for spaces
- Always use `.sql` extension
- Versions must be sequential
- First migration you create will be 002

### Creating a New Migration

1. **Determine next version number:**
   ```bash
   ls src/database/migrations/*.sql 2>/dev/null | sort | tail -1
   # If directory is empty, start with 002
   # If last is 002_add_feature.sql, next is 003
   ```

2. **Create migration file:**
   ```bash
   # First migration will be 002
   touch src/database/migrations/002_add_feature_x.sql
   ```

3. **Write migration SQL:**
   ```sql
   -- Migration 002: Add feature X
   -- Description of what this migration does

   BEGIN;

   -- Your schema changes here
   ALTER TABLE druids_core.agents ADD COLUMN new_field TEXT;
   CREATE INDEX idx_agents_new_field ON druids_core.agents(new_field);

   COMMIT;
   ```

4. **Test migration:**
   ```bash
   # Restart app - migrations run automatically
   docker-compose restart druids-app

   # Check logs
   docker logs druids-app -f
   ```

### Migration Best Practices

#### ✅ DO:
- Use transactions (`BEGIN;` ... `COMMIT;`)
- Add descriptive comments at the top
- Use `IF NOT EXISTS` for idempotent operations
- Keep migrations small and focused
- Test migrations on a copy of production data
- Include rollback instructions in comments

#### ❌ DON'T:
- Don't modify existing migration files after they're applied
- Don't delete migration files
- Don't skip version numbers
- Don't put data migrations and schema migrations in the same file
- Don't use database-specific features if possible

### Migration Template

```sql
-- Migration {VERSION}: {SHORT_DESCRIPTION}
-- {LONGER_DESCRIPTION_IF_NEEDED}
--
-- Rollback: {HOW_TO_ROLLBACK}

BEGIN;

-- Add your changes here
ALTER TABLE druids_core.agents
  ADD COLUMN IF NOT EXISTS new_column TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_new_column
  ON druids_core.agents(new_column);

COMMIT;
```

### Checking Migration Status

**View applied migrations:**
```bash
docker-compose exec druids-postgres psql -U druids_user -d druids -c "SELECT * FROM druids_core.schema_migrations ORDER BY version;"
```

**Check current version:**
```bash
docker-compose exec druids-postgres psql -U druids_user -d druids -c "SELECT MAX(version) FROM druids_core.schema_migrations WHERE success = true;"
```

**View migration history in app:**
```typescript
import { migrationService } from './services/MigrationService';

const history = await migrationService.getMigrationHistory();
console.log(history);
```

### Troubleshooting

#### Migration Failed During Startup

**Symptom:** App won't start, shows migration error

**Solution:**
```bash
# Check which migration failed
docker logs druids-app | grep "Migration"

# Check migration status
docker-compose exec druids-postgres psql -U druids_user -d druids -c "SELECT * FROM druids_core.schema_migrations WHERE success = false;"

# Fix the migration file, then restart
docker-compose restart druids-app
```

#### Manual Migration Execution

If you need to run migrations manually:

```bash
# Run specific migration
docker-compose exec druids-postgres psql -U druids_user -d druids < src/database/migrations/002_add_feature.sql

# Mark as applied manually
docker-compose exec druids-postgres psql -U druids_user -d druids -c "INSERT INTO druids_core.schema_migrations (version, name, success) VALUES (2, 'add_feature', true);"
```

#### Rolling Back a Migration

Migrations don't have automatic rollback. To roll back:

1. Write a new migration that undoes the changes
2. Apply the new migration

Example:
```sql
-- Migration 003: Rollback feature X from migration 002

BEGIN;

DROP INDEX IF EXISTS idx_agents_new_field;
ALTER TABLE druids_core.agents DROP COLUMN IF EXISTS new_field;

COMMIT;
```

### Migration Lifecycle

```
┌─────────────────────┐
│  App Startup        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check Migration     │
│ Tracking Table      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get Current Version │
│ (MAX from table)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Scan Migration Dir  │
│ for .sql Files      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Filter Pending      │
│ (version > current) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Apply Each in Order │
│ (001, 002, 003...)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Update Tracking     │
│ Table with Results  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Continue Startup    │
└─────────────────────┘
```

### Examples

#### Adding a New Column

```sql
-- Migration 002: Add agent email notifications

BEGIN;

ALTER TABLE druids_core.agents
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT false;

COMMIT;
```

#### Creating a New Table

```sql
-- Migration 003: Add audit log table

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  user_id VARCHAR(255),
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_entity ON druids_core.audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON druids_core.audit_log(created_at);

COMMIT;
```

#### Data Migration

```sql
-- Migration 004: Migrate old status values to new format

BEGIN;

-- Update status values
UPDATE druids_core.agents
  SET status = 'inactive'
  WHERE status = 'stopped';

UPDATE druids_core.agents
  SET status = 'maintenance'
  WHERE status = 'paused';

COMMIT;
```

## See Also

- [Database Setup Guide](../../docs/DATABASE_SETUP.md) - Complete database setup documentation
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines
