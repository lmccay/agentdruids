-- Simple migration to add missing columns to existing tables
-- This avoids the JSON syntax issues in the full migration

BEGIN;

-- Add missing columns to agents table
ALTER TABLE druids_core.agents
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS specialization JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS personality JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mcp_tools JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tool_permissions JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS llm_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resource_limits JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bindings JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS realm_access JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deployment JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Update agents table constraints
ALTER TABLE druids_core.agents
  DROP CONSTRAINT IF EXISTS agents_status_check,
  ADD CONSTRAINT agents_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'error', 'maintenance'));

-- Add missing columns to realms table
ALTER TABLE druids_core.realms
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'collaborative',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS agents JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS agent_limits JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ley_line_connections JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS usage JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS health JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS security JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parent_realm_id UUID REFERENCES druids_core.realms(id),
  ADD COLUMN IF NOT EXISTS child_realm_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS lifecycle JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Update realms table constraints
ALTER TABLE druids_core.realms
  DROP CONSTRAINT IF EXISTS realms_status_check,
  ADD CONSTRAINT realms_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'maintenance', 'error'));

-- Create scenarios table if it doesn't exist
CREATE TABLE IF NOT EXISTS druids_core.scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  coordinator_agent_id UUID REFERENCES druids_core.agents(id),
  participant_agent_ids JSONB DEFAULT '[]',
  realm_id UUID REFERENCES druids_core.realms(id),
  configuration JSONB DEFAULT '{}',
  execution_history JSONB DEFAULT '[]',
  results JSONB DEFAULT '{}',
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  last_modified_by VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,

  CONSTRAINT scenarios_status_check CHECK (status IN ('draft', 'active', 'completed', 'failed', 'cancelled'))
);

-- Create knowledge entries table if it doesn't exist
CREATE TABLE IF NOT EXISTS druids_knowledge.entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  namespace VARCHAR(500) NOT NULL,
  key VARCHAR(500) NOT NULL,
  value JSONB NOT NULL,
  content_type VARCHAR(100) DEFAULT 'application/json',
  access_level VARCHAR(20) DEFAULT 'public',
  owner_id UUID,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  last_modified_by VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,

  CONSTRAINT knowledge_namespace_key_unique UNIQUE (namespace, key),
  CONSTRAINT knowledge_access_level_check CHECK (access_level IN ('public', 'private', 'restricted'))
);

-- Create async results table if it doesn't exist
CREATE TABLE IF NOT EXISTS druids_core.async_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id VARCHAR(255) NOT NULL UNIQUE,
  agent_id UUID REFERENCES druids_core.agents(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',

  CONSTRAINT async_results_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT async_results_progress_check CHECK (progress >= 0 AND progress <= 100)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agents_realm_access ON druids_core.agents USING GIN (realm_access);
CREATE INDEX IF NOT EXISTS idx_agents_tags ON druids_core.agents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_realms_agents ON druids_core.realms USING GIN (agents);
CREATE INDEX IF NOT EXISTS idx_realms_parent ON druids_core.realms(parent_realm_id);
CREATE INDEX IF NOT EXISTS idx_realms_type ON druids_core.realms(type);
CREATE INDEX IF NOT EXISTS idx_realms_status ON druids_core.realms(status);
CREATE INDEX IF NOT EXISTS idx_scenarios_coordinator ON druids_core.scenarios(coordinator_agent_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_realm ON druids_core.scenarios(realm_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_status ON druids_core.scenarios(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_namespace ON druids_knowledge.entries(namespace);
CREATE INDEX IF NOT EXISTS idx_knowledge_namespace_key ON druids_knowledge.entries(namespace, key);
CREATE INDEX IF NOT EXISTS idx_async_results_request_id ON druids_core.async_results(request_id);
CREATE INDEX IF NOT EXISTS idx_async_results_agent_id ON druids_core.async_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_async_results_status ON druids_core.async_results(status);

COMMIT;

SELECT 'Migration completed successfully!' as status;
