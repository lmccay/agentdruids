-- Migration 019: agent references are slugs, not surrogate UUIDs
--
-- Two columns still referenced druids_core.agents(id) as UUID foreign keys:
--
--   async_results.agent_id           uuid  FK -> agents(id)
--   scenarios.coordinator_agent_id   uuid  FK -> agents(id)
--
-- Every other agent reference in the schema is already a plain VARCHAR slug
-- with no FK: session_contributions.agent_id, coordination_sessions
-- .coordinator_agent_id, knowledge_gaps.agent_id, user_assumable_druids
-- .druid_id (converted by migration 016), and group_assumable_druids.druid_id
-- (declared as VARCHAR from the outset by migration 017).
--
-- The application identifies agents by slug — migration 016 established this
-- and migration 018 gave the slug a stored, unique column. So these two columns
-- were being handed a slug and rejecting it:
--
--   ERROR: invalid input syntax for type uuid: "facebook-elemental"
--
-- Both tables are empty, so the type change is safe. This mirrors migration
-- 016's reasoning and resolution exactly.
--
-- The baseline schemas (docker/init.sql and src/database/schema.sql) are
-- updated alongside this migration so a freshly initialised database does not
-- recreate the UUID columns and then immediately need converting. Running this
-- migration against such a database is still safe and idempotent: the
-- constraint drop is IF EXISTS, and ALTER COLUMN ... TYPE VARCHAR(255) is a
-- no-op when the column already has that type.
--
-- Rollback (only valid while both tables remain empty):
--   ALTER TABLE druids_core.async_results
--     ALTER COLUMN agent_id TYPE UUID USING agent_id::uuid,
--     ADD CONSTRAINT async_results_agent_id_fkey
--       FOREIGN KEY (agent_id) REFERENCES druids_core.agents(id);
--   ALTER TABLE druids_core.scenarios
--     ALTER COLUMN coordinator_agent_id TYPE UUID USING coordinator_agent_id::uuid,
--     ADD CONSTRAINT scenarios_coordinator_agent_id_fkey
--       FOREIGN KEY (coordinator_agent_id) REFERENCES druids_core.agents(id);

BEGIN;

ALTER TABLE druids_core.async_results
  DROP CONSTRAINT IF EXISTS async_results_agent_id_fkey;

ALTER TABLE druids_core.async_results
  ALTER COLUMN agent_id TYPE VARCHAR(255);

COMMENT ON COLUMN druids_core.async_results.agent_id IS
  'Agent slug id (as used by AgentService/REST routes), not the agents.id UUID.';

ALTER TABLE druids_core.scenarios
  DROP CONSTRAINT IF EXISTS scenarios_coordinator_agent_id_fkey;

ALTER TABLE druids_core.scenarios
  ALTER COLUMN coordinator_agent_id TYPE VARCHAR(255);

COMMENT ON COLUMN druids_core.scenarios.coordinator_agent_id IS
  'Coordinator agent slug id (as used by AgentService/REST routes), not the agents.id UUID.';

COMMIT;
