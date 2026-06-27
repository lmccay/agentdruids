-- Migration 014: Knowledge gaps (coverage demand-signal gate, rung #5b)
--
-- When an in-session agent searches the corpus within its scope and the
-- in-scope knowledge (global ∪ its realms) returns nothing, that is a coverage
-- gap — a demand signal for ingestion ("this scope lacked knowledge about X").
-- The cheap, safe half of the support gate (see realm-grounded-assessment.md §4).
--
-- Gaps dedupe on (query, realms): repeats bump hit_count instead of piling up.
-- realms is stored sorted for stable dedup.
--
-- Rollback:
--   DROP TABLE druids_core.knowledge_gaps;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.knowledge_gaps (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query         TEXT NOT NULL,
  realms        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  agent_id      VARCHAR(255),
  session_id    VARCHAR(255),
  hit_count     INTEGER NOT NULL DEFAULT 1,
  status        VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT knowledge_gaps_status_check CHECK (status IN ('open', 'addressed', 'dismissed')),
  CONSTRAINT knowledge_gaps_unique UNIQUE (query, realms)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status
  ON druids_core.knowledge_gaps(status, last_seen_at DESC);

COMMENT ON TABLE druids_core.knowledge_gaps IS
  'Coverage demand signals: an in-scope search that returned nothing → ingest knowledge about `query` into one of `realms` (or global). Deduped on (query, realms).';

COMMIT;
