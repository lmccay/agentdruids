-- Migration 016: assumable-druid grants key on the agent slug id, not a UUID FK
--
-- Migration 015 modelled user_assumable_druids.druid_id as a UUID referencing
-- druids_core.agents(id). In practice the system identifies agents by their
-- slug id (e.g. 'campaign-coordinator-druid') everywhere it matters — REST
-- routes (:agentId), AgentService's in-memory registry, mcpTools — and the
-- data-plane assume-gate checks that slug. The UUID PK in druids_core.agents is
-- a separate identity space the runtime does not key on.
--
-- So the grant must store the slug. Convert druid_id to VARCHAR and drop the FK
-- (mirrors worldtree_item_scopes.item_id, which is also a non-FK VARCHAR id).
-- The table is empty in any deployment, so the type change is safe.
--
-- Rollback:
--   ALTER TABLE druids_core.user_assumable_druids ALTER COLUMN druid_id TYPE UUID USING druid_id::uuid;

BEGIN;

ALTER TABLE druids_core.user_assumable_druids
  DROP CONSTRAINT IF EXISTS user_assumable_druids_druid_id_fkey;

ALTER TABLE druids_core.user_assumable_druids
  ALTER COLUMN druid_id TYPE VARCHAR(255);

COMMENT ON COLUMN druids_core.user_assumable_druids.druid_id IS
  'Agent slug id (as used by AgentService/REST routes), not the agents.id UUID.';

COMMIT;
