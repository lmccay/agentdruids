-- Migration 005: Add model_configurations table with seed defaults

BEGIN;

-- Persistent storage for model configurations. Defaults are seeded below.
-- All model definitions (built-in and user-added) live in this table; there
-- is no in-code DEFAULT_MODELS fallback. Operators can edit, deactivate, or
-- delete seeded defaults like any other row.

CREATE TABLE IF NOT EXISTS druids_core.model_configurations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  temperature           DOUBLE PRECISION NOT NULL,
  max_tokens            INTEGER NOT NULL,
  top_p                 DOUBLE PRECISION,
  frequency_penalty     DOUBLE PRECISION,
  presence_penalty      DOUBLE PRECISION,
  system_prompt_prefix  TEXT,
  tags                  JSONB NOT NULL DEFAULT '[]',
  is_default            BOOLEAN,
  is_active             BOOLEAN,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT model_configurations_provider_check
    CHECK (provider IN ('ollama', 'openai', 'anthropic', 'local')),
  CONSTRAINT model_configurations_temperature_check
    CHECK (temperature >= 0 AND temperature <= 2)
);

CREATE INDEX IF NOT EXISTS idx_model_configurations_provider
  ON druids_core.model_configurations (provider);

CREATE INDEX IF NOT EXISTS idx_model_configurations_is_active
  ON druids_core.model_configurations (is_active);

CREATE INDEX IF NOT EXISTS idx_model_configurations_tags
  ON druids_core.model_configurations USING gin (tags);

COMMENT ON TABLE druids_core.model_configurations IS
  'Named model configurations (built-in defaults + user-added). Single source of truth; no code fallback.';

-- Seed defaults. ON CONFLICT DO NOTHING so operators who edit a default row
-- and re-run the migration system (which is idempotent on a per-version basis
-- but defensive here anyway) don't lose their edits.
INSERT INTO druids_core.model_configurations (
  id, name, description, provider, model, temperature, max_tokens, top_p,
  tags, is_default, is_active
) VALUES
  (
    'creative-writer',
    'Creative Writer',
    'Optimized for creative writing, storytelling, and imaginative content',
    'ollama', 'qwen2.5:1.5b', 0.9, 4000, 0.9,
    '["creative", "writing", "storytelling"]'::jsonb,
    NULL, TRUE
  ),
  (
    'analytical-researcher',
    'Analytical Researcher',
    'Focused on analysis, research, and fact-based responses',
    'ollama', 'qwen2.5:1.5b', 0.3, 2000, 0.7,
    '["analysis", "research", "factual"]'::jsonb,
    TRUE, TRUE
  ),
  (
    'balanced-assistant',
    'Balanced Assistant',
    'Well-rounded model for general tasks and conversations',
    'ollama', 'qwen2.5:1.5b', 0.7, 2500, 0.8,
    '["general", "balanced", "conversation"]'::jsonb,
    NULL, TRUE
  ),
  (
    'technical-specialist',
    'Technical Specialist',
    'Optimized for technical tasks, coding, and precise instructions',
    'ollama', 'qwen2.5:1.5b', 0.2, 3000, 0.6,
    '["technical", "coding", "precise"]'::jsonb,
    NULL, TRUE
  ),
  (
    'gpt4-premium',
    'GPT-4 Premium',
    'High-quality responses with advanced reasoning (requires OpenAI API)',
    'openai', 'gpt-4', 0.7, 3000, 0.9,
    '["premium", "reasoning", "quality"]'::jsonb,
    NULL, TRUE
  ),
  (
    'gpt4-turbo',
    'GPT-4 Turbo',
    'Fast and efficient GPT-4 variant (requires OpenAI API)',
    'openai', 'gpt-4-turbo-preview', 0.7, 4000, 0.9,
    '["premium", "fast", "efficient"]'::jsonb,
    NULL, FALSE
  ),
  (
    'claude-creative',
    'Claude Creative',
    'Anthropic''s Claude optimized for creative tasks (requires Anthropic API)',
    'anthropic', 'claude-3-sonnet-20240229', 0.8, 3000, 0.9,
    '["creative", "anthropic", "premium"]'::jsonb,
    NULL, FALSE
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
