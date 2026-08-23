-- Migration 020: realms.slug_id — give realms a stable, human-meaningful identity
--
-- Companion to migration 018, which did the same for agents. This is the schema
-- half only: nothing reads slug_id yet, so this migration changes no behaviour.
--
-- Why realms need it. Unlike agents — where migration 016 had already
-- established the slug as the runtime identity and 018 merely stored it — realm
-- identity today *is* the surrogate UUID, and it leaks:
--
--   GET /api/agents -> agent.realmAccess.boundRealmId
--                      = "6825f24b-7d51-41cf-9cd2-91a55cf4fd99"  (launch-visibility)
--                      accessibleRealms[] = [ ...more UUIDs... ]
--
-- A deployment-local surrogate is therefore a durable, user-visible identifier
-- that would end up in any descriptor, export or declarative configuration.
-- There is also no unique constraint on realms.name, so two realms may share a
-- name (none do today, so there is no cleanup prerequisite).
--
-- The follow-up change flips realm identity to the slug and rewrites the stored
-- references (agents.realm_access, worldtree_item_scopes.scope_ref). Those must
-- land together, because code compares realm ids directly — for example
-- accessibleRealms.includes(realmId) — so returning slugs while references still
-- hold UUIDs would silently break presence and travel checks. Splitting the
-- schema out keeps that behavioural change reviewable on its own.
--
-- The backfill uses the same derivation as migration 018 and must not be
-- "improved" for the same reason: the follow-up code derives slugs identically,
-- and any divergence would stop resolving already-backfilled realms.
--
--   ETS               -> ets
--   Open Source Realm -> open-source-realm
--   launch-visibility -> launch-visibility
--
-- slug_id is left NULLable so realm creation keeps working until the service is
-- taught to populate it. Postgres permits multiple NULLs under a unique index,
-- so existing realms are protected now and newly created realms are covered by
-- the follow-up.
--
-- Note: 'default' is a reserved sentinel meaning "not present in any realm"
-- (see AgentService.resolveCurrentRealm and searchScope). It is not a realm and
-- must never be created as one, so the sentinel is enforced by a CHECK rather
-- than left to convention: a realm whose slug resolved to 'default' would be
-- read as "no realm" by presence and retrieval scoping, silently emptying that
-- realm's search scope.
--
-- Consequence worth knowing: this rejects a realm named "Default" (or "default",
-- "DEFAULT", …), since the slug derivation would collide with the sentinel. That
-- is the intended outcome. The follow-up change should catch it earlier with a
-- comprehensible message rather than surfacing a raw constraint violation.
--
-- Rollback:
--   ALTER TABLE druids_core.realms DROP CONSTRAINT IF EXISTS realms_slug_id_not_sentinel;
--   ALTER TABLE druids_core.realms DROP CONSTRAINT IF EXISTS realms_slug_id_lowercase;
--   DROP INDEX IF EXISTS druids_core.uq_realms_slug_id;
--   ALTER TABLE druids_core.realms DROP COLUMN IF EXISTS slug_id;

BEGIN;

ALTER TABLE druids_core.realms
  ADD COLUMN IF NOT EXISTS slug_id VARCHAR(255);

UPDATE druids_core.realms
SET slug_id = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
WHERE slug_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_realms_slug_id
  ON druids_core.realms (slug_id);

-- Slugs are canonically lowercase. The derivation above already lowercases, so
-- this only constrains explicitly supplied slugs — but without it two problems
-- open up: the unique index is case-sensitive, so 'Ets' and 'ets' could coexist
-- as distinct realms, and an uppercase slug could evade the sentinel check.
ALTER TABLE druids_core.realms
  DROP CONSTRAINT IF EXISTS realms_slug_id_lowercase;

ALTER TABLE druids_core.realms
  ADD CONSTRAINT realms_slug_id_lowercase
  CHECK (slug_id IS NULL OR slug_id = lower(slug_id));

-- The sentinel is reserved, not merely documented, and is compared
-- case-insensitively to match the runtime, which lowercases before testing it:
--
--   AgentService.ts:871   currentRealm.toLowerCase() !== 'default'
--   AgentService.ts:2575  sessionRealm.toLowerCase() !== 'default'
--
-- A realm stored as 'Default' would satisfy a case-sensitive check and then be
-- read as "no realm" at runtime, silently collapsing its own presence and search
-- scope. Belt and braces with the lowercase constraint above: either alone
-- closes the hole, and each reports a specific reason.
--
-- NULL is still permitted so realm creation keeps working until the service
-- populates slug_id.
ALTER TABLE druids_core.realms
  DROP CONSTRAINT IF EXISTS realms_slug_id_not_sentinel;

ALTER TABLE druids_core.realms
  ADD CONSTRAINT realms_slug_id_not_sentinel
  CHECK (slug_id IS NULL OR lower(slug_id) <> 'default');

COMMENT ON COLUMN druids_core.realms.slug_id IS
  'Stable identity for this realm. Immutable once set; "name" is a display label and may change freely. The id UUID is a deployment-local surrogate and must not appear in an API, UI or descriptor. Reserved: "default" is a sentinel meaning no realm, never a stored realm.';

COMMIT;
