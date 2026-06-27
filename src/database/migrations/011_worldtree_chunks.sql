-- Migration 011: Polymorphic chunk layer (worldtree_chunks)
--
-- The unified chunk table for retrieval, produced by Docling's HybridChunker.
-- Polymorphic over source so session contributions (Phase B) and ingested
-- documents share ONE chunk table and (later) ONE embedding index — see
-- docs/docling-integration-evaluation.md §4.2 and docs/phase-b-embeddings.md.
--
-- Rung #2 (chunking) creates the chunk rows only. Embeddings (chunk_embeddings +
-- pgvector) are rung #4 (Phase B) and are NOT part of this migration.
--
-- source_id is a VARCHAR (not a hard FK) because it references two tables
-- polymorphically (session_contributions.id or worldtree_documents.id);
-- referential integrity is enforced at the service layer.
--
-- Rollback:
--   DROP TABLE druids_core.worldtree_chunks;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.worldtree_chunks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type   VARCHAR(16) NOT NULL,
  source_id     VARCHAR(255) NOT NULL,
  chunk_index   INTEGER NOT NULL DEFAULT 0,
  text          TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT worldtree_chunks_source_check
    CHECK (source_type IN ('contribution', 'document')),
  CONSTRAINT worldtree_chunks_unique
    UNIQUE (source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_worldtree_chunks_source
  ON druids_core.worldtree_chunks(source_type, source_id);

-- Trigram index for lexical chunk search (rung #3); pg_trgm is enabled in init.sql.
CREATE INDEX IF NOT EXISTS idx_worldtree_chunks_text_trgm
  ON druids_core.worldtree_chunks USING gin (text gin_trgm_ops);

COMMENT ON TABLE druids_core.worldtree_chunks IS
  'Retrieval chunks (Docling HybridChunker). Polymorphic: source_type in (contribution, document). One table for earned + seeded knowledge; the shared base for the Phase B embedding index.';
COMMENT ON COLUMN druids_core.worldtree_chunks.text IS
  'Contextualized chunk text (Docling chunk.text) — heading/caption-enriched, embed-ready.';
COMMENT ON COLUMN druids_core.worldtree_chunks.metadata IS
  'headings, captions, page_numbers, num_tokens, and raw_text (uncontextualized).';

COMMIT;
