-- Migration 010: Ingest runs + dedup-on-source_uri
--
-- Turns directory ingestion into a tracked, idempotent operation:
--   * ingest_runs: one row per batch ingest (status + counts + target scope).
--   * worldtree_documents.ingest_run_id: which run produced/last-touched a doc.
--   * UNIQUE(source_uri): enables upsert — re-ingesting a source replaces its
--     catalog row instead of accumulating duplicates.
--
-- Existing duplicates (from the no-dedup PoC) are collapsed to the newest row
-- per source_uri before the unique constraint is added (dependent renderings
-- of removed rows cascade away).
--
-- See docs/operator-ingestion-flow.md.
--
-- Rollback:
--   ALTER TABLE druids_core.worldtree_documents DROP CONSTRAINT worldtree_documents_source_uri_unique;
--   ALTER TABLE druids_core.worldtree_documents DROP COLUMN ingest_run_id;
--   DROP TABLE druids_core.ingest_runs;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.ingest_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_dir      TEXT NOT NULL,
  namespace       VARCHAR(500) NOT NULL DEFAULT 'worldtree://public/documents',
  status          VARCHAR(16) NOT NULL DEFAULT 'pending',
  total_files     INTEGER NOT NULL DEFAULT 0,
  ingested        INTEGER NOT NULL DEFAULT 0,
  skipped         INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  triggered_by    VARCHAR(128),
  error           TEXT,
  results         JSONB DEFAULT '[]'::jsonb,
  started_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP WITH TIME ZONE,
  CONSTRAINT ingest_runs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_status
  ON druids_core.ingest_runs(status, started_at DESC);

COMMENT ON TABLE druids_core.ingest_runs IS
  'One row per batch (directory) ingest: status, counts, target scope, per-file results.';

ALTER TABLE druids_core.worldtree_documents
  ADD COLUMN IF NOT EXISTS ingest_run_id UUID
    REFERENCES druids_core.ingest_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_worldtree_documents_run
  ON druids_core.worldtree_documents(ingest_run_id);

-- Collapse pre-existing duplicates (no-dedup PoC) to the newest row per source_uri.
DELETE FROM druids_core.worldtree_documents a
  USING druids_core.worldtree_documents b
 WHERE a.source_uri = b.source_uri
   AND (a.created_at < b.created_at
        OR (a.created_at = b.created_at AND a.id < b.id));

ALTER TABLE druids_core.worldtree_documents
  ADD CONSTRAINT worldtree_documents_source_uri_unique UNIQUE (source_uri);

COMMENT ON COLUMN druids_core.worldtree_documents.ingest_run_id IS
  'The batch ingest run that produced or last upserted this document (NULL for single ingest_url calls).';

COMMIT;
