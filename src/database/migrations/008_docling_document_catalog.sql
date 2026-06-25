-- Migration 008: Docling document catalog (thin PoC)
--
-- Establishes the document lineage for externally-ingested sources (via the
-- druids-docling / docling-serve container), parallel to the session lineage.
-- Mirrors the session storage pattern: DB holds catalog + metadata + a
-- content_uri pointer; the rendered bytes live on disk under
-- /app/data/documents/{id}/.
--
-- Scope (PoC): catalog + typed renderings only. Deliberately NOT included yet:
--   - chunks / embeddings (Phase B: worldtree_chunks + chunk_embeddings)
--   - many-to-many realm/scope association (realm-grounded-assessment.md:
--     worldtree_item_scopes). A document is globally visible by default until
--     scoping lands.
-- See docs/docling-integration-evaluation.md.
--
-- Rollback:
--   DROP TABLE druids_core.document_renderings;
--   DROP TABLE druids_core.worldtree_documents;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.worldtree_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_uri      TEXT NOT NULL,
  title           TEXT,
  source_format   VARCHAR(32),
  namespace       VARCHAR(500) NOT NULL DEFAULT 'worldtree://public/documents',
  access_level    VARCHAR(20) NOT NULL DEFAULT 'public',
  checksum        VARCHAR(64),
  fetched_at      TIMESTAMP WITH TIME ZONE,
  license         VARCHAR(128),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT worldtree_documents_access_check
    CHECK (access_level IN ('public', 'private', 'restricted'))
);

CREATE INDEX IF NOT EXISTS idx_worldtree_documents_source
  ON druids_core.worldtree_documents(source_uri);
CREATE INDEX IF NOT EXISTS idx_worldtree_documents_created
  ON druids_core.worldtree_documents(created_at DESC);

COMMENT ON TABLE druids_core.worldtree_documents IS
  'Catalog of externally-ingested documents (Docling). Bytes live on disk; this row carries provenance and points at renderings.';
COMMENT ON COLUMN druids_core.worldtree_documents.checksum IS
  'SHA-256 of the canonical (lossless JSON) artifact, for provenance / reproducibility.';

CREATE TABLE IF NOT EXISTS druids_core.document_renderings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id         UUID NOT NULL
                      REFERENCES druids_core.worldtree_documents(id)
                      ON DELETE CASCADE,
  format              VARCHAR(16) NOT NULL,
  content_uri         TEXT NOT NULL,
  content_size_bytes  BIGINT,
  checksum            VARCHAR(64),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT document_renderings_format_check
    CHECK (format IN ('md', 'json', 'html', 'text', 'doctags')),
  CONSTRAINT document_renderings_unique
    UNIQUE(document_id, format)
);

CREATE INDEX IF NOT EXISTS idx_document_renderings_doc
  ON druids_core.document_renderings(document_id);

COMMENT ON TABLE druids_core.document_renderings IS
  'Typed renderings per document (md/json/html/text/doctags), mirroring session_publications: status + content_uri to bytes-on-disk.';

COMMIT;
