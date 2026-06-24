# Docling Integration — Evaluation & Schema-Fit Analysis

**Status:** Evaluation / Design
**Builds on:** `worldtree-vision.md`, `phase-a-worldtree-discovery.md` (shipped), `phase-b-embeddings.md`, migrations 006 + 007
**Scope:** Evaluate [Docling](https://github.com/docling-project/docling) as a document-ingestion front-end for the WorldTree — run as a separate container with an MCP interface — and determine how its outputs (structured documents, renderings, chunks, embeddings) fit the existing schema, or require changes. **Schema fit is the gating question and is settled here before any build.**

## 1. What Docling is

Docling (IBM Research → LF AI & Data, **MIT**) parses heterogeneous documents into one canonical representation, `DoclingDocument`, then serializes that to downstream formats. Pipeline: **parse → DoclingDocument → (export | chunk)**. It handles advanced PDF understanding, OCR, VLM (GraniteDocling), and audio ASR, and runs fully local / air-gapped.

The ecosystem already provides the two pieces we need, so this is integration, not construction:

- **`docling-serve`** — a FastAPI REST server (default `:5001`). Stateless conversion service. This is the container.
- **`docling-mcp`** — a separate MCP server that can convert locally *or* delegate to a `docling-serve` instance (`DOCLING_CONVERSION_MODE=remote`).

## 2. Output formats and what we persist

| Format | Field in serve response | Role for us |
|---|---|---|
| Lossless JSON (DoclingDocument) | `json_content` | **Canonical** stored artifact — full structure, provenance, bbox |
| Markdown | `md_content` | Human/LLM-readable rendering; chunking source |
| HTML | `html_content` | Optional rendering |
| Plain text | `text_content` | Fallback rendering |
| DocTags | `doctags_content` | Structured, training-oriented (VLM/Phase E) |
| Chunks | (via Docling chunkers) | Tokenizer-aligned units for embedding (Phase B) |

`docling-serve` accepts `http_sources` (URLs), uploaded files, or base64, sync or async (`/v1/convert/source[/async]`, poll `/v1/status/poll/{id}`, `/v1/result/{id}`). Native URL loading is the curriculum/research-seeding capability.

## 3. The current schema reality (what we must fit)

Three facts constrain the design:

1. **Storage pattern = catalog + pointer + bytes-on-disk.** `session_publications` stores `content_uri`, `content_size_bytes`, `checksum`, status, and mode; the rendered bytes live in files under `/app/data/sessions/{sessionId}/`. `SessionContentManager` does the same with JSON files. **DB holds metadata and a URI; the filesystem holds content.** Docling outputs must follow this, not stuff large JSON into table columns.

2. **pgvector is absent.** `docker/init.sql` enables only `uuid-ossp` and `pg_trgm`. Embeddings (Phase B *or* Docling) require `CREATE EXTENSION vector` — a confirmed, not-yet-made change.

3. **The legacy KV store is not a foundation — and is being removed.** `druids_knowledge.entries` (a `(namespace, key) → JSONB value` store with access levels) is explicitly commented "legacy / deprecated," and `KnowledgeService` is a stub. We will *not* build Docling storage on it; it is being removed outright (separate cleanup PR, see §9.4). The active corpus is the migration 006/007 lineage.

## 4. Schema-fit analysis (the core)

### 4.1 Docling documents are a parallel lineage, not session contributions

A `session_contribution` is keyed by `(session_id, step_number, sub_step_number)` and is FK-bound to a `coordination_session`. A Docling-ingested document has **no session** — it is external knowledge, not work the system produced. Forcing documents into `session_contributions` would mean fabricating fake sessions and corrupting the contribution semantics. So documents get their **own catalog**, parallel to sessions, reusing the storage *pattern* (catalog + `content_uri` + files) rather than the session *tables*.

### 4.2 The load-bearing decision: unify chunks/embeddings, don't fork them

Phase B's draft proposed `contribution_embeddings(contribution_id → session_contributions.id)`. Document chunks cannot satisfy that FK. Two ways out:

- **Option A — parallel tables:** keep `contribution_embeddings` and add `document_chunk_embeddings`. Simpler migration, but **splits the semantic index in two** — any cross-source "find similar knowledge" query needs a UNION, and the curation/retrieval code doubles.
- **Option B — polymorphic chunk layer (recommended):** one `worldtree_chunks` table keyed by `(source_type, source_id)` where `source_type ∈ {contribution, document}`, and one `chunk_embeddings` FK'd to it. Session contributions and Docling documents chunk into the **same** table → **one embedding index, one semantic search across earned + seeded knowledge.**

**Recommendation: Option B.** It directly serves the "earned vs. seeded, one gate, one index" model from the Phase B discussion. Crucially, **this revises Phase B's migration 008 *before it is built*** — generalizing `contribution_embeddings` into `worldtree_chunks` + `chunk_embeddings` now is cheap; doing it after Phase B ships is a painful migration. This is precisely the "important before we go too far" check.

### 4.3 Provenance, earned-vs-seeded, namespaces

- **Provenance** (required for citeable research/curriculum seeding): the document catalog carries `source_uri`, `fetched_at`, `checksum`, `content_format`, `license`.
- **Earned vs. seeded** reuses Phase B's `curation_decisions` mechanism: seeded documents get `reviewer = 'seed:<source>'` and **bypass the supersession gate** (they are ground truth, not iterative output) while carrying provenance. Session contributions still go through the LLM-checklist gate.
- **Namespace / access / realm**: documents carry `namespace`, `access_level` (`public|private|restricted`, matching the existing convention), and optional `realm_id` — so domain-specific corpora bind to a realm, which is the substrate for domain fine-tuning (Phase E) and realm-scoped retrieval (Phase C).

### 4.4 Proposed tables (DDL sketch)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Catalog of ingested external documents. Bytes live in files; this row points at them.
CREATE TABLE druids_core.worldtree_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_uri      TEXT NOT NULL,                 -- original https:// / file:// source
  title           TEXT,
  source_format   VARCHAR(32),                   -- pdf, docx, html, epub, ...
  namespace       VARCHAR(500) NOT NULL DEFAULT 'worldtree://public/documents',
  access_level    VARCHAR(20) NOT NULL DEFAULT 'public',
  realm_id        VARCHAR(255) REFERENCES druids_core.realms(id),
  checksum        VARCHAR(64),                   -- of the canonical artifact
  fetched_at      TIMESTAMP WITH TIME ZONE,
  license         VARCHAR(128),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT worldtree_documents_access_check
    CHECK (access_level IN ('public','private','restricted'))
);

-- Typed renderings per document (md / json / html / doctags), mirroring the
-- session_publications pattern: status + content_uri + size + checksum.
CREATE TABLE druids_core.document_renderings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES druids_core.worldtree_documents(id) ON DELETE CASCADE,
  format          VARCHAR(16) NOT NULL,          -- md | json | html | text | doctags
  content_uri     TEXT NOT NULL,                 -- file:///app/data/documents/{id}/{format}.{ext}
  content_size_bytes BIGINT,
  checksum        VARCHAR(64),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, format)
);

-- Polymorphic chunk layer — the unification point (Phase B revised).
CREATE TABLE druids_core.worldtree_chunks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type     VARCHAR(16) NOT NULL,          -- 'contribution' | 'document'
  source_id       VARCHAR(255) NOT NULL,         -- session_contributions.id or worldtree_documents.id
  chunk_index     INTEGER NOT NULL DEFAULT 0,
  text            TEXT NOT NULL,                  -- contextualized chunk text (Docling chunk.contextualize())
  metadata        JSONB DEFAULT '{}'::jsonb,      -- headings, page, bbox, captions
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT worldtree_chunks_source_check CHECK (source_type IN ('contribution','document')),
  UNIQUE(source_type, source_id, chunk_index)
);
CREATE INDEX idx_worldtree_chunks_source ON druids_core.worldtree_chunks(source_type, source_id);

-- Default vector store (PgVectorStore). Populated ONLY when an embedding
-- provider is configured; otherwise retrieval stays lexical (see §4.6).
-- External stores (Pinecone, etc.) replace this table via the VectorStore seam.
CREATE TABLE druids_core.chunk_embeddings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id        UUID NOT NULL REFERENCES druids_core.worldtree_chunks(id) ON DELETE CASCADE,
  embedding       vector(768),                    -- dim = the deployment's active embedding space (default 768; see §4.6)
  model_name      VARCHAR(128) NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chunk_id, model_name)
);
CREATE INDEX idx_chunk_embeddings_vec
  ON druids_core.chunk_embeddings USING hnsw (embedding vector_cosine_ops);
```

> Note: `source_id` is a `VARCHAR` (not a hard FK) because it references two different tables polymorphically. Referential integrity is enforced at the service layer; `ON DELETE CASCADE` is handled by the ingest/curation services per source type. (If a hard FK is preferred, split into `contribution_chunks` + `document_chunks` sharing one `chunk_embeddings` via a `chunk_id` — a variant to weigh in review.)

### 4.5 Required changes — summary

| Change | Type | Why |
|---|---|---|
| `CREATE EXTENSION vector` | new | for the default `PgVectorStore`; only when embeddings are enabled |
| `worldtree_documents` + `document_renderings` | new tables | document lineage (catalog + typed renderings) |
| **Generalize Phase B `contribution_embeddings` → `worldtree_chunks` + `chunk_embeddings`** | **revise not-yet-built design** | one unified semantic index across earned + seeded knowledge |
| `curation_decisions` gains a document path (`reviewer='seed:…'`, supersession bypass) | extend Phase B | earned-vs-seeded model |
| Legacy `druids_knowledge.entries` (+ `namespaces`, `KnowledgeService`, `/api/knowledge`) | **removed** (separate cleanup PR) | deprecated, unused by the live system |
| `coordination_sessions` / `session_contributions` / `session_publications` | **no change** | documents are parallel; sessions untouched |
| New on-disk store `/app/data/documents/{id}/` | new (mirror sessions) | bytes-on-disk pattern |
| Pluggable `EmbeddingProvider` + `VectorStore` seams | new (interfaces) | provider/store not hardcoded; embeddings optional (§4.6) |

### 4.6 Embedding provider and vector store are both pluggable

Embeddings split into two independently swappable layers, mirroring how Druids already abstracts generation LLMs (`OllamaClient` / `OpenAIClient`, selected via config):

- **`EmbeddingProvider`** (text → vector): `none` | **TEI** (HuggingFace Text-Embeddings-Inference — the recommended *local* default: purpose-built and far faster than Ollama for embeddings) | OpenAI-compatible API | Ollama. Chosen per deployment.
- **`VectorStore`** (store + ANN search): **`PgVectorStore` (default)** keeps vectors in the `chunk_embeddings` table (§4.4); external stores (Pinecone, Qdrant, Weaviate) implement the same interface, holding only the vector + an id while Postgres keeps the catalog/chunk text and an external reference.

Note these are *different layers*: an embedding provider turns text into a vector; a vector store persists and searches vectors. A SaaS like **Pinecone is primarily a vector store**, not an embedding provider (though it can also host embedding models in "integrated" mode).

Two principles fall out:

1. **Embeddings are optional, with graceful degradation.** Ingestion, curation, and the WorldTree all function with *no* provider configured; only semantic *retrieval* depends on one, and it falls back to the Phase A lexical (ILIKE) search. This is what lets resource-constrained or air-gapped deployments run text-only. Nothing hard-fails because embeddings are absent — and **nothing hard-requires Ollama** (which, in practice, has proven too slow in-container to be a sensible default).
2. **Similarity is scoped to one embedding space.** Cosine distance is meaningful only within a single model's vector space, so `model_name` + dimension are intrinsic to each embedding. A deployment runs **one active embedding space**; its dimension sets the `vector(N)` column at migration/config time (default 768). Switching models or stores is a deliberate **re-embed**, not an in-place change.

`WorldTreeQueryService` owns semantic SQL only for the `PgVectorStore` path; external stores route retrieval through the `VectorStore` implementation. **Recommendation: ship `PgVectorStore` as the only initial implementation** — local-first, atomic with the catalog, and ample at the ~10⁵-chunk target — and design the seam so SaaS stores can be added when scale or a managed tier justifies the egress + dual-write consistency cost (§8).

## 5. Integration architecture

Mirror the Phase A REST-backed pattern (Druids owns persistence; the external service is stateless):

- **Container `druids-docling`**: `docling-serve` (CPU torch, models baked or volume-cached). Reuses the existing **`druids-redis`** for its async job queue.
- **Druids `DoclingService`** (in `src/services/`, sole owner of ingest SQL): calls docling-serve over HTTP, writes renderings to `/app/data/documents/{id}/`, catalogs `worldtree_documents` + `document_renderings`, then chunks via Docling's `HybridChunker`. *When* an embedding provider is configured it writes vectors through the `VectorStore` (default `PgVectorStore` → `chunk_embeddings`); with no provider it stops after chunking and retrieval stays lexical (§4.6).
- **REST routes** `/api/ingest` + **MCP tools** `ingest_url` / `ingest_document` on the existing `SimpleMCPServer` — one MCP endpoint for external clients, MCP container stays dependency-light (`apiCall`).
- **Immediate evaluation path:** run the `docling-serve` container and register `docling-mcp` in Goose (`DOCLING_CONVERSION_MODE=remote`) — evaluate end-to-end with zero Druids code.

docling-serve is **stateless**: it converts and returns; Druids decides what to persist and catalog. Clean separation.

## 6. Pipeline fit with the roadmap

- **Ingestion → WorldTree:** remote/file source → docling-serve → canonical JSON + renderings catalogued as a `worldtree_document`.
- **Phase B (answered):** Docling's `HybridChunker` is tokenizer-aligned to the embedding model and `chunk.contextualize()` emits embed-ready text — this *is* Phase B's chunking layer, now feeding the unified `worldtree_chunks` for documents alongside contributions. Resolves Phase B's open "chunking strategy" question.
- **Phase C (retrieval-augmented coordination):** ingested authoritative docs become retrievable context; one index means a single similarity query spans both system-produced and seeded knowledge.
- **Phase E (domain fine-tuning):** Docling normalizes a domain corpus into consistent chunks/JSON/DocTags → the training-set front-end. Realm-bound documents scope a domain's corpus.

## 7. Remote loading, SSRF, provenance

- Native URL ingestion is the curriculum/seeding capability — but an in-network service fetching arbitrary `http_sources` is an **SSRF surface**. Gate ingestible URLs through Druids' existing `resourceAccess.allowedLocations` allowlist (CLAUDE.md §8); do not let agents ingest unbounded URLs.
- Store provenance (`source_uri`, `fetched_at`, `checksum`, `license`) for citeability and reproducibility of seeded research knowledge.

## 8. Risks

- **Heavy image / model weights** (torch + models, GB-scale, slow cold start) — bake or volume-cache; air-gapped supported.
- **CPU conversion is slow** for large PDFs/VLM — use the async API + poll (and Druids' existing async-result pattern); Redis queue scales it.
- **Model licenses** vary (core MIT, GraniteDocling Apache-2.0; OCR/VLM models differ) — check per model if redistributing the image.
- **Polymorphic `source_id`** trades a hard FK for service-layer integrity — flagged in §4.4 with a hard-FK variant.
- **External vector stores add a dual-write consistency cost.** With `PgVectorStore` a curation exclude/supersede/delete is one transaction; an external store (Pinecone/Qdrant/Weaviate) must fan writes out to both systems and can drift — an orphaned vector keeps surfacing in search after its row is gone. This is the main reason the default is pgvector (§4.6).

## 9. Decisions (resolved)

1. **Unify chunks/embeddings — Option B (decided).** One polymorphic `worldtree_chunks` + one `chunk_embeddings`. Phase B's migration 008 is revised accordingly (no standalone `contribution_embeddings`).
2. **Polymorphic `source_id` — (decided).** `worldtree_chunks.source_id` references `{contribution, document}` polymorphically; referential integrity is enforced at the service layer.
3. **Embedding provider and vector store are both pluggable; embeddings are optional (decided).** See §4.6. Default = `PgVectorStore` (vectors in Postgres) + a pluggable `EmbeddingProvider` (`none` | TEI | OpenAI-compatible | Ollama). With no provider, semantic search degrades to the Phase A lexical search — **Ollama is not required** and is a poor default given its in-container slowness; TEI is the recommended local provider. The reference embedding space is `nomic-embed-text`/768, setting the default `vector(768)` dimension. SaaS vector stores (Pinecone, Qdrant, Weaviate) are anticipated behind the `VectorStore` seam but deferred — pgvector ships first.
4. **Remove the legacy knowledge store (decided).** Drop `druids_knowledge.entries` (and `namespaces`/schema), delete the `KnowledgeService` stub and `/api/knowledge` router. Tracked as a **separate cleanup PR** (see below), not part of the Docling work. The live system does not depend on it (`SimpleMCPServer` is the active MCP server and does not use it; `MCPCompliantServer`, which does, is dead code).

## 10. Next steps

1. Fold the chunk/embedding generalization (§4.2) and the `EmbeddingProvider` + `VectorStore` seams (§4.6) into the Phase B implementation plan so the two land coherently — pgvector as the only initial store, embeddings optional.
2. Thin PoC: `druids-docling` compose service + a single `ingest_url` round-trip that catalogs one `worldtree_document` and its renderings — no chunking/embeddings yet — to validate the container, the storage pattern, and provenance against real sources.
3. Land the legacy `druids_knowledge` removal as its own cleanup PR (§9.4).
