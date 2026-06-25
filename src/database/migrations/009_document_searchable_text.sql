-- Migration 009: Searchable text for ingested documents (Layer 1 — "talk to" the corpus)
--
-- Stores the primary readable rendering (markdown) inline so documents can be
-- listed, read, and lexically searched from the DB — without reading files at
-- query time. The large lossless JSON and other renderings stay on disk
-- (document_renderings.content_uri); this is just the readable text for
-- discovery, mirroring how session_contributions keep content inline.
--
-- ILIKE search is accelerated with a pg_trgm GIN index (pg_trgm is already
-- enabled in init.sql). Postgres full-text (tsvector) is a later upgrade.
--
-- Rollback:
--   DROP INDEX druids_core.idx_worldtree_documents_text_trgm;
--   ALTER TABLE druids_core.worldtree_documents DROP COLUMN content_text;

BEGIN;

ALTER TABLE druids_core.worldtree_documents
  ADD COLUMN IF NOT EXISTS content_text TEXT;

CREATE INDEX IF NOT EXISTS idx_worldtree_documents_text_trgm
  ON druids_core.worldtree_documents USING gin (content_text gin_trgm_ops);

COMMENT ON COLUMN druids_core.worldtree_documents.content_text IS
  'Primary readable text (markdown preferred) for lexical search/read. Large/structural renderings (JSON) remain on disk via document_renderings.';

COMMIT;
