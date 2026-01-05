-- Migration to update existing Druids database schema to match new comprehensive models
-- This migration will alter existing tables and add new ones while preserving data

-- Start transaction
BEGIN;

-- Add new columns to agents table
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
ALTER COLUMN status TYPE VARCHAR(20),
DROP CONSTRAINT IF EXISTS agents_status_check,
ADD CONSTRAINT agents_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'error', 'maintenance'));

-- Update timestamps to use timezone
ALTER TABLE druids_core.agents 
ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE,
ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE;

-- Migrate realm_id to realm_access for existing agents
UPDATE druids_core.agents 
SET realm_access = jsonb_build_object('boundRealmId', realm_id::text, 'accessibleRealms', '[]'::jsonb)
WHERE realm_id IS NOT NULL AND realm_access = '{}';

-- Add new columns to realms table  
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

-- Update timestamps to use timezone
ALTER TABLE druids_core.realms
ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE,
ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE;

-- Migrate security_level to configuration for existing realms
UPDATE druids_core.realms 
SET configuration = jsonb_set(
  COALESCE(configuration, '{}'), 
  '{securityLevel}', 
  to_jsonb(security_level)
)
WHERE security_level IS NOT NULL;

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

-- Create new indexes for better query performance on new columns
CREATE INDEX IF NOT EXISTS idx_agents_realm_access ON druids_core.agents USING GIN (realm_access);
CREATE INDEX IF NOT EXISTS idx_agents_tags ON druids_core.agents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_agents_specialization ON druids_core.agents USING GIN (specialization);
CREATE INDEX IF NOT EXISTS idx_agents_last_modified_by ON druids_core.agents(last_modified_by);

CREATE INDEX IF NOT EXISTS idx_realms_agents ON druids_core.realms USING GIN (agents);
CREATE INDEX IF NOT EXISTS idx_realms_parent ON druids_core.realms(parent_realm_id);
CREATE INDEX IF NOT EXISTS idx_realms_type ON druids_core.realms(type);
CREATE INDEX IF NOT EXISTS idx_realms_status ON druids_core.realms(status);
CREATE INDEX IF NOT EXISTS idx_realms_tags ON druids_core.realms USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_scenarios_coordinator ON druids_core.scenarios(coordinator_agent_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_realm ON druids_core.scenarios(realm_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_status ON druids_core.scenarios(status);
CREATE INDEX IF NOT EXISTS idx_scenarios_created_at ON druids_core.scenarios(created_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_namespace ON druids_knowledge.entries(namespace);
CREATE INDEX IF NOT EXISTS idx_knowledge_namespace_key ON druids_knowledge.entries(namespace, key);
CREATE INDEX IF NOT EXISTS idx_knowledge_owner ON druids_knowledge.entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_access_level ON druids_knowledge.entries(access_level);
CREATE INDEX IF NOT EXISTS idx_knowledge_expires_at ON druids_knowledge.entries(expires_at);

CREATE INDEX IF NOT EXISTS idx_async_results_request_id ON druids_core.async_results(request_id);
CREATE INDEX IF NOT EXISTS idx_async_results_agent_id ON druids_core.async_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_async_results_status ON druids_core.async_results(status);
CREATE INDEX IF NOT EXISTS idx_async_results_expires_at ON druids_core.async_results(expires_at);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Update existing triggers to work with new schema
DROP TRIGGER IF EXISTS update_agents_updated_at ON druids_core.agents;
CREATE TRIGGER update_agents_updated_at 
    BEFORE UPDATE ON druids_core.agents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_realms_updated_at ON druids_core.realms;
CREATE TRIGGER update_realms_updated_at 
    BEFORE UPDATE ON druids_core.realms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenarios_updated_at 
    BEFORE UPDATE ON druids_core.scenarios 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_updated_at 
    BEFORE UPDATE ON druids_knowledge.entries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing data to match new schema expectations

-- Set default values for new agent columns based on existing data
UPDATE druids_core.agents SET 
  description = COALESCE(description, 'Migrated from legacy schema'),
  specialization = COALESCE(specialization, jsonb_build_object('domain', type, 'expertise', '[]')),
  personality = COALESCE(personality, jsonb_build_object('communicationStyle', 'professional', 'decisionMaking', 'analytical')),
  llm_config = COALESCE(llm_config, jsonb_build_object('provider', 'ollama', 'model', 'llama2', 'temperature', 0.7)),
  resource_limits = COALESCE(resource_limits, jsonb_build_object('maxMemoryMB', 1024, 'maxCpuPercent', 50)),
  deployment = COALESCE(deployment, jsonb_build_object('status', status, 'lastHeartbeat', updated_at)),
  last_modified_by = COALESCE(last_modified_by, 'migration-script')
WHERE description IS NULL OR specialization = '{}' OR personality = '{}' OR llm_config = '{}';

-- Set default values for new realm columns
UPDATE druids_core.realms SET
  health = COALESCE(health, jsonb_build_object(
    'status', 'healthy',
    'lastHealthCheck', updated_at,
    'uptime', jsonb_build_object('current', 100, 'availability', 99.9)
  )),
  security = COALESCE(security, jsonb_build_object(
    'securityScore', 85,
    'lastSecurityScan', updated_at,
    'vulnerabilities', '[]'
  )),
  usage = COALESCE(usage, jsonb_build_object(
    'agentCount', 0,
    'activeAgents', 0,
    'resourceUtilization', jsonb_build_object('memoryUsedMB', 0, 'cpuUsedPercent', 0)
  )),
  lifecycle = COALESCE(lifecycle, jsonb_build_object(
    'created', created_at,
    'lastModified', updated_at
  ))
WHERE health = '{}' OR security = '{}' OR usage = '{}' OR lifecycle = '{}';

-- Insert sample data for new tables to ensure they work
INSERT INTO druids_core.scenarios (id, name, type, description, created_by, last_modified_by) 
VALUES 
  ('770e8400-e29b-41d4-a716-446655440000', 'Default Coordination', 'coordination', 'Default multi-agent coordination scenario', 'system', 'system')
ON CONFLICT (id) DO NOTHING;

INSERT INTO druids_knowledge.entries (namespace, key, value, created_by, last_modified_by) 
VALUES 
  ('worldtree://public/system', 'migration_status', '{"migrated": true, "version": "2.0", "timestamp": "' || NOW() || '"}'::jsonb, 'system', 'system'),
  ('worldtree://public/config', 'default_settings', '{"llm_provider": "ollama", "default_model": "llama2"}'::jsonb, 'system', 'system')
ON CONFLICT (namespace, key) DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = CURRENT_TIMESTAMP,
  last_modified_by = EXCLUDED.last_modified_by;

-- Commit transaction
COMMIT;

-- Verify migration success with summary queries
SELECT 'AGENTS' as table_name, COUNT(*) as row_count FROM druids_core.agents
UNION ALL
SELECT 'REALMS' as table_name, COUNT(*) as row_count FROM druids_core.realms  
UNION ALL
SELECT 'SCENARIOS' as table_name, COUNT(*) as row_count FROM druids_core.scenarios
UNION ALL
SELECT 'KNOWLEDGE' as table_name, COUNT(*) as row_count FROM druids_knowledge.entries
UNION ALL
SELECT 'ASYNC_RESULTS' as table_name, COUNT(*) as row_count FROM druids_core.async_results;