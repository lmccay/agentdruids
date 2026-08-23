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
-- 'default' is never stored as a realm reference — it is the sentinel meaning
-- "no realm" — so it cannot appear here and needs no special case.
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

UPDATE druids_core.agents a
SET realm_access = a.realm_access - 'boundRealmId'
WHERE a.realm_access ? 'boundRealmId'
  AND a.realm_access->>'boundRealmId' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM druids_core.realms r WHERE r.slug_id = a.realm_access->>'boundRealmId'
  );

UPDATE druids_core.agents a
SET realm_access = a.realm_access - 'currentRealmId'
WHERE a.realm_access ? 'currentRealmId'
  AND a.realm_access->>'currentRealmId' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM druids_core.realms r WHERE r.slug_id = a.realm_access->>'currentRealmId'
  );

-- accessibleRealms[]: map each entry through realms, dropping unresolvable ones.
UPDATE druids_core.agents a
SET realm_access = a.realm_access || jsonb_build_object(
      'accessibleRealms',
      COALESCE(
        (
          SELECT jsonb_agg(DISTINCT r.slug_id ORDER BY r.slug_id)
          FROM jsonb_array_elements_text(a.realm_access->'accessibleRealms') AS ref(value)
          JOIN druids_core.realms r
            ON r.id::text = ref.value OR r.slug_id = ref.value
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

COMMIT;
