-- Migration 013: Many-to-many scope association (worldtree_item_scopes)
--
-- The unit of knowledge scope (rung #5a). A WorldTree item (document, and later
-- contribution/chunk) associates with one or more scopes:
--   global              — always in scope, every session (universal truths)
--   realm:<realmId>      — in scope when that realm is in the session's set
--   agent:<agentId>      — agent-private
--   session:<sessionId>  — session-isolated
-- In-scope evidence for a session = global UNION (realms traversed).
-- See docs/realm-grounded-assessment.md §2.0 / §7.
--
-- Existing documents are backfilled to `global` so retrieval is unchanged until
-- realms are used. Scopes are written with replace-semantics by the service.
--
-- Rollback:
--   DROP TABLE druids_core.worldtree_item_scopes;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.worldtree_item_scopes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_type     VARCHAR(16) NOT NULL,
  item_id       VARCHAR(255) NOT NULL,
  scope_type    VARCHAR(16) NOT NULL,
  scope_ref     VARCHAR(255),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT item_scope_type_check
    CHECK (scope_type IN ('global', 'realm', 'agent', 'session')),
  CONSTRAINT item_scope_global_ref
    CHECK (scope_type <> 'global' OR scope_ref IS NULL),
  CONSTRAINT item_scope_nonglobal_ref
    CHECK (scope_type = 'global' OR scope_ref IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_item_scopes_lookup
  ON druids_core.worldtree_item_scopes(scope_type, scope_ref);
CREATE INDEX IF NOT EXISTS idx_item_scopes_item
  ON druids_core.worldtree_item_scopes(item_type, item_id);

-- One global row per item (scope_ref is NULL for global, so a partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_scopes_global
  ON druids_core.worldtree_item_scopes(item_type, item_id)
  WHERE scope_type = 'global';
-- One row per (item, scope_type, ref) for non-global scopes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_scopes_ref
  ON druids_core.worldtree_item_scopes(item_type, item_id, scope_type, scope_ref)
  WHERE scope_ref IS NOT NULL;

COMMENT ON TABLE druids_core.worldtree_item_scopes IS
  'M:N scope association for WorldTree items. In-scope set for a session = global UNION traversed realms. global is the highest-trust tier (see realm-grounded-assessment.md §2.0.1).';

-- Backfill: every existing document is globally scoped (retrieval unchanged).
INSERT INTO druids_core.worldtree_item_scopes (item_type, item_id, scope_type)
  SELECT 'document', id::text, 'global' FROM druids_core.worldtree_documents
  ON CONFLICT DO NOTHING;

COMMIT;
