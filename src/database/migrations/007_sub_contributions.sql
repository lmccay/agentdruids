-- Migration 007: Finer-grained capture for per-collaborator contributions
--
-- Today session_contributions stores one row per orchestration plan step. When a
-- coordinator (Druid) collaborates with multiple Elementals inside a single step,
-- each Elemental's raw output is discarded — only the coordinator's summarized
-- step output survives.
--
-- This migration adds sub_step_number and agent_role so we can record each
-- Elemental contribution as its own row, linked back to the parent orchestration
-- step. Existing rows (orchestration steps) get sub_step_number = 0.
--
-- Rollback:
--   ALTER TABLE druids_core.session_contributions
--     DROP COLUMN sub_step_number,
--     DROP COLUMN agent_role;

BEGIN;

ALTER TABLE druids_core.session_contributions
  ADD COLUMN IF NOT EXISTS sub_step_number INTEGER NOT NULL DEFAULT 0;

ALTER TABLE druids_core.session_contributions
  ADD COLUMN IF NOT EXISTS agent_role VARCHAR(32);

-- Replace the old (session_id, step_number) unique constraint with one that
-- distinguishes the orchestration step row (sub_step=0) from its sub-contributions.
ALTER TABLE druids_core.session_contributions
  DROP CONSTRAINT IF EXISTS session_contributions_unique_step;

ALTER TABLE druids_core.session_contributions
  ADD CONSTRAINT session_contributions_unique_position
  UNIQUE(session_id, step_number, sub_step_number);

CREATE INDEX IF NOT EXISTS idx_contributions_role
  ON druids_core.session_contributions(agent_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contributions_substep
  ON druids_core.session_contributions(session_id, step_number, sub_step_number);

COMMENT ON COLUMN druids_core.session_contributions.sub_step_number IS
  '0 = the orchestration plan step itself (parent). >0 = a sub-contribution captured during that step (e.g., an Elemental responding to a Druid delegation).';
COMMENT ON COLUMN druids_core.session_contributions.agent_role IS
  'Agent type for cross-session analytics: druid, elemental, gaia, worldtree, coordinator, etc. Stable across sessions.';

COMMIT;
