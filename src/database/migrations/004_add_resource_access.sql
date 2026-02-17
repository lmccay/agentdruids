-- Migration 004: Add resource_access column for file and URL access permissions

BEGIN;

-- Add resource_access column to agents table
ALTER TABLE druids_core.agents
  ADD COLUMN IF NOT EXISTS resource_access JSONB DEFAULT NULL;

-- Add index for resource_access queries
CREATE INDEX IF NOT EXISTS idx_agents_resource_access
  ON druids_core.agents USING gin (resource_access);

-- Add comment
COMMENT ON COLUMN druids_core.agents.resource_access IS
  'Resource access configuration: allowedFilePaths, allowedUrls, allowedLocations with wildcard support';

COMMIT;
