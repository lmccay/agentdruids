-- Migration 003: Add prompt_config column for externalized system prompts

BEGIN;

-- Add prompt_config column to agents table
ALTER TABLE druids_core.agents
  ADD COLUMN IF NOT EXISTS prompt_config JSONB DEFAULT NULL;

-- Add index for prompt_config queries
CREATE INDEX IF NOT EXISTS idx_agents_prompt_config
  ON druids_core.agents USING gin (prompt_config);

-- Add comment
COMMENT ON COLUMN druids_core.agents.prompt_config IS
  'Prompt composition configuration: baseTemplate, agentExtension, disableRealmPrompt';

COMMIT;
