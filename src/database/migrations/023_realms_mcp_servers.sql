-- Migration 023: realms.mcp_servers — the column the repository already reads and writes
--
-- RealmRepository has always mapped Realm.mcpServers to a `mcp_servers` column
-- on druids_core.realms:
--
--   entityToRow: if (realm.mcpServers !== undefined) row['mcp_servers'] = ...
--   rowToEntity: mcpServers: safeJsonParse(row['mcp_servers'], [])
--
-- That column does not exist. Assigning MCP servers to a realm therefore failed:
--
--   column "mcp_servers" of relation "realms" does not exist
--
-- and the failure was invisible, because RealmService caught it as a warning,
-- had already updated its in-memory map, and returned success. A caller could
-- assign servers, read them straight back from getMCPServers, and see exactly
-- what it wrote — while nothing was persisted and everything was lost on the
-- next restart. Same shape as the async-results defect: a feature that looks
-- functional and is backed by nothing.
--
-- The column is added rather than folding the value into `configuration`
-- because every existing layer already treats it as a first-class field:
-- Realm.mcpServers on the model, a dedicated column in both row mappers, and
-- its own REST routes (GET/POST /realms/:id/mcp-servers). `configuration`
-- holds realm settings (maxAgents, allowExternalAccess, leyLineEndpoint,
-- promptLayer); a list of bound servers is an association, not a setting.
--
-- Nothing has ever been stored, so there is nothing to migrate — the default
-- gives every existing realm an empty list, which is what they effectively had.
--
-- Rollback:
--   ALTER TABLE druids_core.realms DROP COLUMN IF EXISTS mcp_servers;

BEGIN;

ALTER TABLE druids_core.realms
  ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN druids_core.realms.mcp_servers IS
  'MCP server ids available to agents operating in this realm. Read and written by RealmRepository as Realm.mcpServers.';

COMMIT;
