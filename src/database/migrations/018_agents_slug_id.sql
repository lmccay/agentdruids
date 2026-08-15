-- Migration 018: agents.slug_id — give the runtime's identity a column and a constraint
--
-- Migration 016 already established the decision: "the system identifies agents
-- by their slug id (e.g. 'campaign-coordinator-druid') everywhere it matters —
-- REST routes (:agentId), AgentService's in-memory registry, mcpTools ... The
-- UUID PK in druids_core.agents is a separate identity space the runtime does
-- not key on."
--
-- The problem is that this identity has never been *stored*. AgentService
-- recomputes it on every load by slugifying the display name:
--
--   dbAgent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
--
-- Three consequences follow, all live today:
--   1. Renaming an agent silently changes its identity, orphaning every
--      reference held elsewhere (session_contributions.agent_id,
--      worldtree_item_scopes.item_id, user_assumable_druids.druid_id — all
--      non-FK VARCHAR slugs).
--   2. Distinct names can collide: 'Foo Bar', 'foo-bar' and 'foo_bar' all
--      slugify to 'foo-bar'.
--   3. Nothing prevents two rows from being the same logical agent. Three
--      duplicate 'facebook-elemental' rows were created 66 seconds apart, and
--      the loader resolved them last-wins, leaving two rows unreachable but
--      still present and still counted.
--
-- This migration stores the slug and constrains it to be unique. The UUID PK is
-- unchanged and stays a deployment-local surrogate that never surfaces in any
-- API, UI, or descriptor.
--
-- The backfill mirrors the JS derivation EXACTLY rather than improving on it
-- (e.g. it does not trim trailing separators), because the running application
-- computes the unimproved form. Diverging here would break lookups for any
-- agent whose name does not round-trip.
--
-- slug_id is intentionally left NULLable. Making it NOT NULL now would break
-- agent creation until the service is taught to populate it, which is the
-- follow-up change. Postgres permits multiple NULLs under a unique index, so
-- this migration protects existing agents and rows created through the load
-- path; enforcement for newly created agents arrives with the service change.
--
-- Rollback:
--   DROP INDEX IF EXISTS druids_core.uq_agents_slug_id;
--   ALTER TABLE druids_core.agents DROP COLUMN IF EXISTS slug_id;

BEGIN;

ALTER TABLE druids_core.agents
  ADD COLUMN IF NOT EXISTS slug_id VARCHAR(255);

-- Mirror of AgentService.loadAgentsFromDatabase's derivation.
UPDATE druids_core.agents
SET slug_id = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
WHERE slug_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_slug_id
  ON druids_core.agents (slug_id);

COMMENT ON COLUMN druids_core.agents.slug_id IS
  'Stable runtime identity for this agent (see migration 016). Immutable once set; "name" is a display label and may change freely. Referenced as a plain VARCHAR by session_contributions.agent_id, worldtree_item_scopes.item_id and user_assumable_druids.druid_id. The id UUID is a deployment-local surrogate and must never appear in an API, UI or descriptor.';

COMMIT;
