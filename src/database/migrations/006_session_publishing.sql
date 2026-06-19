-- Migration 006: Durable session records, contributor preservation, and typed publishing modes
--
-- Establishes three concerns that today are either ephemeral or lossy:
--   1. coordination_sessions: durable session metadata (today: in-memory only)
--   2. session_contributions: per-step raw contributor output (today: container-volume JSON files)
--   3. session_publications + publishing_modes: typed, DB-catalogued result publishing
--      (today: single hardcoded synthesis-only publish path)
--
-- Publishing modes are DB-driven (not a TypeScript enum) so additional modes
-- can be registered without code changes.
--
-- Rollback:
--   DROP TABLE druids_core.session_publications;
--   DROP TABLE druids_core.session_contributions;
--   DROP TABLE druids_core.coordination_sessions;
--   DROP TABLE druids_core.publishing_modes;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.publishing_modes (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                     VARCHAR(64) NOT NULL UNIQUE,
  description              TEXT NOT NULL,
  output_format            VARCHAR(16) NOT NULL,
  includes_synthesis       BOOLEAN NOT NULL DEFAULT false,
  includes_contributions   BOOLEAN NOT NULL DEFAULT false,
  includes_transcript      BOOLEAN NOT NULL DEFAULT false,
  default_retention_days   INTEGER,
  enabled                  BOOLEAN NOT NULL DEFAULT true,
  sort_order               INTEGER NOT NULL DEFAULT 100,
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT publishing_modes_format_check
    CHECK (output_format IN ('markdown', 'json', 'jsonl', 'csv', 'text'))
);

COMMENT ON TABLE  druids_core.publishing_modes IS
  'Catalog of session publishing modes. DB-driven so new modes can be added without code changes.';
COMMENT ON COLUMN druids_core.publishing_modes.default_retention_days IS
  'NULL means the artifact is retained indefinitely (e.g., dataset/transcript modes).';

CREATE TABLE IF NOT EXISTS druids_core.coordination_sessions (
  session_id              VARCHAR(255) PRIMARY KEY,
  coordinator_agent_id    VARCHAR(255),
  realm_id                VARCHAR(255),
  prompt                  TEXT,
  status                  VARCHAR(32) NOT NULL DEFAULT 'pending',
  started_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at            TIMESTAMP WITH TIME ZONE,
  participant_agent_ids   TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata                JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT coordination_sessions_status_check
    CHECK (status IN ('pending', 'running', 'in_progress', 'completed', 'failed', 'cancelled', 'timeout'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON druids_core.coordination_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started
  ON druids_core.coordination_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_coordinator
  ON druids_core.coordination_sessions(coordinator_agent_id);

COMMENT ON TABLE druids_core.coordination_sessions IS
  'Durable record of every coordination session. Survives container restarts.';

CREATE TABLE IF NOT EXISTS druids_core.session_contributions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      VARCHAR(255) NOT NULL
                  REFERENCES druids_core.coordination_sessions(session_id)
                  ON DELETE CASCADE,
  step_number     INTEGER NOT NULL,
  agent_id        VARCHAR(255) NOT NULL,
  agent_type      VARCHAR(64),
  action_type     VARCHAR(64),
  description     TEXT,
  content         TEXT NOT NULL,
  content_format  VARCHAR(16) NOT NULL DEFAULT 'markdown',
  token_count     INTEGER,
  duration_ms     INTEGER,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT session_contributions_unique_step
    UNIQUE(session_id, step_number),
  CONSTRAINT session_contributions_format_check
    CHECK (content_format IN ('markdown', 'json', 'text'))
);

CREATE INDEX IF NOT EXISTS idx_contributions_session
  ON druids_core.session_contributions(session_id, step_number);
CREATE INDEX IF NOT EXISTS idx_contributions_agent
  ON druids_core.session_contributions(agent_id, created_at DESC);

COMMENT ON TABLE druids_core.session_contributions IS
  'Per-step raw output from each contributing agent. Source of truth — never synthesized, never dropped on publish.';

CREATE TABLE IF NOT EXISTS druids_core.session_publications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          VARCHAR(255) NOT NULL
                      REFERENCES druids_core.coordination_sessions(session_id)
                      ON DELETE CASCADE,
  mode_id             UUID NOT NULL
                      REFERENCES druids_core.publishing_modes(id),
  status              VARCHAR(32) NOT NULL DEFAULT 'pending',
  content_uri         TEXT NOT NULL,
  content_size_bytes  BIGINT,
  checksum            VARCHAR(64),
  published_at        TIMESTAMP WITH TIME ZONE,
  expires_at          TIMESTAMP WITH TIME ZONE,
  archived_at         TIMESTAMP WITH TIME ZONE,
  metadata            JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT session_publications_unique
    UNIQUE(session_id, mode_id),
  CONSTRAINT session_publications_status_check
    CHECK (status IN ('pending', 'published', 'expired', 'archived', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_publications_session
  ON druids_core.session_publications(session_id);
CREATE INDEX IF NOT EXISTS idx_publications_status_expiry
  ON druids_core.session_publications(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_publications_mode
  ON druids_core.session_publications(mode_id);

COMMENT ON TABLE druids_core.session_publications IS
  'Published artifacts per session per mode. Multiple modes can coexist for the same session.';
COMMENT ON COLUMN druids_core.session_publications.content_uri IS
  'Where the artifact lives: worldtree://..., file://..., https://..., etc.';

INSERT INTO druids_core.publishing_modes
  (name, description, output_format,
   includes_synthesis, includes_contributions, includes_transcript,
   default_retention_days, sort_order)
VALUES
  ('summary',
   'Coordinator''s synthesized summary only. Suitable for quick human review.',
   'markdown', true, false, false, 30, 10),

  ('raw',
   'Each contributor''s output preserved verbatim, no synthesis.',
   'markdown', false, true, false, 90, 20),

  ('report',
   'Synthesis followed by a full contributor appendix. Default human-facing artifact.',
   'markdown', true, true, false, 180, 30),

  ('dataset',
   'Structured per-contribution records suitable for offline analysis or training corpora.',
   'jsonl', false, true, true, NULL, 40),

  ('transcript',
   'Full event stream including coordinator decisions, tool calls, and intermediate steps.',
   'jsonl', true, true, true, NULL, 50)
ON CONFLICT (name) DO NOTHING;

COMMIT;
