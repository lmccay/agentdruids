-- Migration 021: rewrite stored realm references from surrogate UUIDs to slugs
--
-- Migration 020 gave realms a stable slug and constrained it. This converts the
-- references that point at realms, so the application can speak slugs
-- end-to-end. It must land with the code change that flips realm identity:
-- comparisons like accessibleRealms.includes(realmId) are exact, so references
-- and identity have to move together or presence and travel checks silently
-- fail.
--
-- Two reference sites hold realm ids:
--
--   agents.realm_access        jsonb: boundRealmId, currentRealmId,
--                              accessibleRealms[]
--   worldtree_item_scopes      scope_ref where scope_type = 'realm'
--
-- coordination_sessions.realm_id is also a realm reference but is empty, so it
-- is left alone; new sessions will record slugs.
--
-- THE RISK. worldtree_item_scopes drives realm-scoped retrieval. If a scope_ref
-- fails to convert, the affected corpus silently leaves every search scope and
-- surfaces as a knowledge gap rather than an error. So conversion is done by
-- joining to realms rather than by string manipulation, unconvertible values
-- are left untouched rather than guessed at, and the migration reports counts
-- for both.
--
-- 'default' IS stored as a realm reference, in realmAccess.currentRealmId, and
-- means "not present in any realm". It deliberately has no realm row, so it
-- resolves to nothing and must be excluded from the unresolvable-reference
-- cleanup below — removing it would relocate the agent rather than tidy it up.
--
-- Dangling references are dropped, not carried over. accessibleRealms on the
-- coordinator druid contains 'realm-1780166130971', which matches no realm and
-- never has; preserving it would only require the normaliser to keep a
-- pass-through path for garbage.
--
-- Rollback: restore from backup. The surrogate UUIDs are not recoverable from
-- the slugs alone once agents.realm_access has been rewritten, because the
-- unconvertible entries are dropped in the process.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Backfill any realm still missing a slug — BEFORE anything joins on it
-- ---------------------------------------------------------------------------
--
-- Migration 020 left slug_id nullable so realm creation kept working while only
-- the schema half was deployed. A realm created in that window has no slug, and
-- every join below is `... WHERE r.slug_id IS NOT NULL`, so such a realm would
-- be skipped silently: its grants would be dropped as unresolvable and its
-- corpus scopes would stay UUIDs, pointing at a realm the application can no
-- longer address.
--
-- Backfilling first closes that hole. If a derived slug collides with an
-- existing one, or resolves to the reserved sentinel, the constraints from
-- migration 020 reject it and this migration aborts — which is the outcome we
-- want. A migration that stops with a constraint violation is repairable; one
-- that leaves an unaddressable realm behind is not.
UPDATE druids_core.realms
SET slug_id = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
WHERE slug_id IS NULL;

-- ---------------------------------------------------------------------------
-- 1. worldtree_item_scopes.scope_ref  (realm-scoped corpus)
-- ---------------------------------------------------------------------------

UPDATE druids_core.worldtree_item_scopes s
SET scope_ref = r.slug_id
FROM druids_core.realms r
WHERE s.scope_type = 'realm'
  AND s.scope_ref = r.id::text
  AND r.slug_id IS NOT NULL;

DO $$
DECLARE
  unconverted integer;
BEGIN
  SELECT count(*) INTO unconverted
  FROM druids_core.worldtree_item_scopes s
  WHERE s.scope_type = 'realm'
    AND NOT EXISTS (
      SELECT 1 FROM druids_core.realms r WHERE r.slug_id = s.scope_ref
    );

  IF unconverted > 0 THEN
    RAISE WARNING 'migration 021: % realm-scoped item scope(s) reference a realm that does not exist and were left unchanged; that corpus is out of every realm search scope until repaired', unconverted;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. agents.realm_access  (boundRealmId, currentRealmId, accessibleRealms)
-- ---------------------------------------------------------------------------

-- Scalar fields: convert when the UUID resolves, drop the key when it does not.
UPDATE druids_core.agents a
SET realm_access = a.realm_access
      || jsonb_build_object('boundRealmId', r.slug_id)
FROM druids_core.realms r
WHERE a.realm_access->>'boundRealmId' = r.id::text
  AND r.slug_id IS NOT NULL;

UPDATE druids_core.agents a
SET realm_access = a.realm_access
      || jsonb_build_object('currentRealmId', r.slug_id)
FROM druids_core.realms r
WHERE a.realm_access->>'currentRealmId' = r.id::text
  AND r.slug_id IS NOT NULL;

-- Dropping an unresolvable reference must not drop the sentinel. 'default'
-- means "not present in any realm" and is deliberately not a realm row, so it
-- matches nothing above. Deleting it would silently relocate an agent: with the
-- key gone, resolveCurrentRealm falls through to boundRealmId, so an agent that
-- had explicitly left its realm would appear to be back inside it. Compared
-- case-insensitively, matching the runtime.
UPDATE druids_core.agents a
SET realm_access = a.realm_access - 'boundRealmId'
WHERE a.realm_access ? 'boundRealmId'
  AND a.realm_access->>'boundRealmId' IS NOT NULL
  AND lower(a.realm_access->>'boundRealmId') <> 'default'
  AND NOT EXISTS (
    SELECT 1 FROM druids_core.realms r WHERE r.slug_id = a.realm_access->>'boundRealmId'
  );

UPDATE druids_core.agents a
SET realm_access = a.realm_access - 'currentRealmId'
WHERE a.realm_access ? 'currentRealmId'
  AND a.realm_access->>'currentRealmId' IS NOT NULL
  AND lower(a.realm_access->>'currentRealmId') <> 'default'
  AND NOT EXISTS (
    SELECT 1 FROM druids_core.realms r WHERE r.slug_id = a.realm_access->>'currentRealmId'
  );

-- accessibleRealms[]: map each entry through realms, dropping unresolvable ones.
--
-- The array is polymorphic in practice. RealmAccess types it as objects —
-- { realmId, permissions, grantedAt, grantedBy } — while the rows written to
-- date hold plain id strings. Both forms must survive: an object keeps every
-- field and has only its realmId rewritten, and a string becomes the slug.
-- Flattening with jsonb_array_elements_text would stringify each object, join
-- to nothing, and silently discard the grant along with its permissions.
UPDATE druids_core.agents a
SET realm_access = a.realm_access || jsonb_build_object(
      'accessibleRealms',
      COALESCE(
        (
          SELECT jsonb_agg(
                   CASE
                     WHEN jsonb_typeof(e.value) = 'object'
                       THEN jsonb_set(e.value, '{realmId}', to_jsonb(r.slug_id))
                     ELSE to_jsonb(r.slug_id)
                   END
                   ORDER BY r.slug_id
                 )
          FROM jsonb_array_elements(a.realm_access->'accessibleRealms') AS e(value)
          JOIN druids_core.realms r
            ON r.id::text  = COALESCE(e.value->>'realmId', e.value #>> '{}')
            OR r.slug_id   = COALESCE(e.value->>'realmId', e.value #>> '{}')
          WHERE r.slug_id IS NOT NULL
        ),
        '[]'::jsonb
      )
    )
WHERE jsonb_typeof(a.realm_access->'accessibleRealms') = 'array';

DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM druids_core.agents a
  WHERE a.realm_access::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  IF remaining > 0 THEN
    RAISE WARNING 'migration 021: % agent(s) still contain a UUID-shaped realm reference after conversion', remaining;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. UUID-typed realm reference columns
-- ---------------------------------------------------------------------------
--
-- Three columns still reference realms(id) as UUID foreign keys. Once the
-- application speaks slugs they cannot be written — the same mismatch migration
-- 019 resolved for agent references, and migration 016 before it. Leaving them
-- is not neutral: RealmService's delete path cleans up namespaces.realm_id, so
-- a delete by slug would fail the UUID cast, be misread as "not a database
-- realm", and drop the realm from memory while leaving the row behind.
--
-- All three are unpopulated (scenarios 0, namespaces 0 rows entirely, no realm
-- has a parent), so the type change is safe and reinterprets nothing.

ALTER TABLE druids_core.scenarios
  DROP CONSTRAINT IF EXISTS scenarios_realm_id_fkey;
ALTER TABLE druids_core.scenarios
  ALTER COLUMN realm_id TYPE VARCHAR(255);
COMMENT ON COLUMN druids_core.scenarios.realm_id IS
  'Realm slug id, not the realms.id UUID.';

ALTER TABLE druids_knowledge.namespaces
  DROP CONSTRAINT IF EXISTS namespaces_realm_id_fkey;
ALTER TABLE druids_knowledge.namespaces
  ALTER COLUMN realm_id TYPE VARCHAR(255);
COMMENT ON COLUMN druids_knowledge.namespaces.realm_id IS
  'Realm slug id, not the realms.id UUID.';

ALTER TABLE druids_core.realms
  DROP CONSTRAINT IF EXISTS realms_parent_realm_id_fkey;
ALTER TABLE druids_core.realms
  ALTER COLUMN parent_realm_id TYPE VARCHAR(255);
COMMENT ON COLUMN druids_core.realms.parent_realm_id IS
  'Parent realm slug id, not the realms.id UUID.';

-- Widening the type is not enough: any value already stored is still a UUID
-- string, while every new reference is a slug. These are empty in this
-- deployment, but a populated one would keep references that silently stop
-- matching — a realm delete would miss its namespaces, and parent/scenario
-- lookups would quietly return nothing. Translate them the same way as above,
-- by joining realms rather than manipulating strings.

UPDATE druids_core.scenarios s
SET realm_id = r.slug_id
FROM druids_core.realms r
WHERE s.realm_id = r.id::text AND r.slug_id IS NOT NULL;

UPDATE druids_knowledge.namespaces n
SET realm_id = r.slug_id
FROM druids_core.realms r
WHERE n.realm_id = r.id::text AND r.slug_id IS NOT NULL;

UPDATE druids_core.realms child
SET parent_realm_id = parent.slug_id
FROM druids_core.realms parent
WHERE child.parent_realm_id = parent.id::text AND parent.slug_id IS NOT NULL;

-- ley_line_connections[].targetRealmId is the same class of non-FK JSON realm
-- reference. Leaving it untranslated would mix forms within one array, since
-- new connections are written canonically — so a realm's connections would be
-- half slugs and half surrogates, and only the one read path that compensates
-- would find them.
UPDATE druids_core.realms a
SET ley_line_connections = COALESCE(
      (
        SELECT jsonb_agg(
                 CASE
                   WHEN r.slug_id IS NOT NULL
                     THEN jsonb_set(e.value, '{targetRealmId}', to_jsonb(r.slug_id))
                   ELSE e.value
                 END
               )
        FROM jsonb_array_elements(a.ley_line_connections) AS e(value)
        LEFT JOIN druids_core.realms r
          ON r.id::text = e.value->>'targetRealmId'
         AND e.value->>'targetRealmId' IS NOT NULL
      ),
      '[]'::jsonb
    )
WHERE jsonb_typeof(a.ley_line_connections) = 'array'
  AND jsonb_array_length(a.ley_line_connections) > 0;

-- child_realm_ids is a jsonb array of realm ids, likewise not a foreign key.
UPDATE druids_core.realms a
SET child_realm_ids = COALESCE(
      (
        SELECT jsonb_agg(COALESCE(r.slug_id, e.value #>> '{}') ORDER BY 1)
        FROM jsonb_array_elements(a.child_realm_ids) AS e(value)
        LEFT JOIN druids_core.realms r
          ON r.id::text = e.value #>> '{}' OR r.slug_id = e.value #>> '{}'
      ),
      '[]'::jsonb
    )
WHERE jsonb_typeof(a.child_realm_ids) = 'array'
  AND jsonb_array_length(a.child_realm_ids) > 0;

-- ---------------------------------------------------------------------------
-- 4. Make the NULL-slug state impossible from here on
-- ---------------------------------------------------------------------------
--
-- Every row now has a slug, and RealmService supplies one on create. Enforcing
-- it means the repository never has to decide what to do with a realm that has
-- no identity — previously it derived one from the name, which produced an id
-- that resolveDbId could not look up, so the entity was returned with an id
-- that findById, update and delete would all miss.
--
-- Safe for fresh installs: docker/init.sql seeds its realm before slug_id
-- exists, and migration 020 backfills it, so the column is populated long
-- before this runs.
ALTER TABLE druids_core.realms
  ALTER COLUMN slug_id SET NOT NULL;

DO $$
DECLARE
  stragglers integer;
BEGIN
  SELECT (SELECT count(*) FROM druids_core.scenarios WHERE realm_id ~ '^[0-9a-f]{8}-')
       + (SELECT count(*) FROM druids_knowledge.namespaces WHERE realm_id ~ '^[0-9a-f]{8}-')
       + (SELECT count(*) FROM druids_core.realms WHERE parent_realm_id ~ '^[0-9a-f]{8}-')
    INTO stragglers;

  IF stragglers > 0 THEN
    RAISE WARNING 'migration 021: % realm reference(s) outside agents/item_scopes remain UUID-shaped and could not be resolved', stragglers;
  END IF;
END $$;

COMMIT;
