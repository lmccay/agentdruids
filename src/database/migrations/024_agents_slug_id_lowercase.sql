-- Migration 024: agents.slug_id must be canonically lowercase
--
-- Closes the gap left by migration 018. Realms gained realms_slug_id_lowercase
-- in migration 020; agents never got the equivalent, and the gap is reachable.
--
-- agents carried only agents_pkey and agents_status_check, plus the unique index
-- from 018. Nothing required slug_id to be canonical, and uq_agents_slug_id is
-- case-sensitive, so 'Facebook-Elemental' and 'facebook-elemental' would have
-- been accepted as two distinct agents.
--
-- The derived path could not produce that — slugifyName lowercases — but
-- AgentService.createAgent used an explicitly supplied request.id verbatim. The
-- accompanying service change routes that id through the same derivation, so
-- this constraint is the backstop rather than the primary defence, in the same
-- relationship the realm pair has.
--
-- Severity, honestly: lower than the realm case that prompted it. Realms have a
-- reserved 'default' sentinel that the runtime tests case-insensitively, so a
-- non-canonical realm slug was silently misread as "no realm". Agents have no
-- sentinel, so nothing is misinterpreted — the failure mode is confusing
-- near-duplicates and lookups that miss, since #85 made resolveDbId an exact
-- match against this index. Worth closing anyway: identity that differs only by
-- case is exactly the ambiguity the slug work set out to remove.
--
-- No cleanup prerequisite. All eight agents already hold canonical slugs
-- (campaign-coordinator-druid, facebook-elemental, hackernews-elemental,
-- linkedin-elemental, positioner-elemental, reddit-elemental,
-- system-coordinator, twitter-x-elemental), so the constraint validates against
-- existing rows as written. Deliberately no normalising UPDATE: rewriting a
-- slug_id would change an agent's identity, orphaning every stored reference to
-- it, and there is nothing here to rewrite.
--
-- NULL stays permitted, matching migration 018's reasoning — Postgres allows
-- multiple NULLs under a unique index, and agent creation must keep working for
-- any path that has not populated slug_id.
--
-- Rollback:
--   ALTER TABLE druids_core.agents DROP CONSTRAINT IF EXISTS agents_slug_id_lowercase;

BEGIN;

ALTER TABLE druids_core.agents
  DROP CONSTRAINT IF EXISTS agents_slug_id_lowercase;

ALTER TABLE druids_core.agents
  ADD CONSTRAINT agents_slug_id_lowercase
  CHECK (slug_id IS NULL OR slug_id = lower(slug_id));

COMMENT ON COLUMN druids_core.agents.slug_id IS
  'Stable identity for this agent. Canonically lowercase; immutable once set. "name" is a display label and may change freely. The id UUID is a deployment-local surrogate and must not appear in an API, UI or descriptor.';

COMMIT;
