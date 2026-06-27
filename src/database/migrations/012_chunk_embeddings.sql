-- Migration 012: Chunk embeddings (pgvector) — the default vector store
--
-- Enables semantic retrieval (rung #4 / Phase B). One embedding per chunk per
-- model. The column dimension is fixed at 384 to match the default embedding
-- model (sentence-transformers/all-MiniLM-L6-v2, which also aligns with the
-- chunker's default tokenizer). Switching to a model with a different dimension
-- is a deliberate re-embed into a new space (a new migration) — see
-- docs/phase-b-embeddings.md (embedding-space principle).
--
-- This is the PgVectorStore default; external stores (Pinecone, etc.) plug in
-- behind the VectorStore seam and would not use this table.
--
-- Requires the pgvector-enabled Postgres image (pgvector/pgvector:pg15).
--
-- Rollback:
--   DROP TABLE druids_core.chunk_embeddings;
--   -- (leave the `vector` extension; harmless)

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS druids_core.chunk_embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id      UUID NOT NULL
                REFERENCES druids_core.worldtree_chunks(id) ON DELETE CASCADE,
  embedding     vector(384),
  model_name    VARCHAR(128) NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chunk_embeddings_unique UNIQUE (chunk_id, model_name)
);

-- HNSW index for cosine-distance ANN search.
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_vec
  ON druids_core.chunk_embeddings USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE druids_core.chunk_embeddings IS
  'Vector embeddings for worldtree_chunks (default PgVectorStore). Populated only when an embedding provider is configured; absent it, retrieval is lexical.';
COMMENT ON COLUMN druids_core.chunk_embeddings.embedding IS
  'vector(384) — pinned to the default embedding space (all-MiniLM-L6-v2). A different-dim model is a new space / new migration.';

COMMIT;
