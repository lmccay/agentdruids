-- Database schema for Druids system entities

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agents table
CREATE TABLE IF NOT EXISTS druids_core.agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  description TEXT,
  capabilities JSONB DEFAULT '[]',
  specialization JSONB DEFAULT '{}',
  personality JSONB DEFAULT '{}',
  mcp_tools JSONB DEFAULT '[]',
  tool_permissions JSONB DEFAULT '{}',
  llm_config JSONB DEFAULT '{}',
  resource_limits JSONB DEFAULT '{}',
  bindings JSONB DEFAULT '[]',
  realm_access JSONB DEFAULT '{}',
  deployment JSONB DEFAULT '{}',
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_modified_by VARCHAR(255),
  version INTEGER DEFAULT 1,
  
  CONSTRAINT agents_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'error', 'maintenance'))
);

-- Realms table
CREATE TABLE IF NOT EXISTS druids_core.realms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  configuration JSONB DEFAULT '{}',
  agents JSONB DEFAULT '[]',
  agent_limits JSONB DEFAULT '{}',
  ley_line_connections JSONB DEFAULT '[]',
  usage JSONB DEFAULT '{}',
  health JSONB DEFAULT '{}',
  security JSONB DEFAULT '{}',
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  parent_realm_id UUID REFERENCES druids_core.realms(id),
  child_realm_ids JSONB DEFAULT '[]',
  lifecycle JSONB DEFAULT '{}',
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_modified_by VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  
  CONSTRAINT realms_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'maintenance', 'error'))
);

-- Scenarios table (for coordination scenarios)
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

-- Knowledge entries table (for WorldTree namespace storage)
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

-- Async results table (for long-running operations)
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_agents_type ON druids_core.agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_status ON druids_core.agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_realm_access ON druids_core.agents USING GIN (realm_access);
CREATE INDEX IF NOT EXISTS idx_agents_tags ON druids_core.agents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON druids_core.agents(created_at);

CREATE INDEX IF NOT EXISTS idx_realms_type ON druids_core.realms(type);
CREATE INDEX IF NOT EXISTS idx_realms_status ON druids_core.realms(status);
CREATE INDEX IF NOT EXISTS idx_realms_agents ON druids_core.realms USING GIN (agents);
CREATE INDEX IF NOT EXISTS idx_realms_parent ON druids_core.realms(parent_realm_id);
CREATE INDEX IF NOT EXISTS idx_realms_created_at ON druids_core.realms(created_at);

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

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_agents_updated_at ON druids_core.agents;
CREATE TRIGGER update_agents_updated_at 
    BEFORE UPDATE ON druids_core.agents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_realms_updated_at ON druids_core.realms;
CREATE TRIGGER update_realms_updated_at 
    BEFORE UPDATE ON druids_core.realms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scenarios_updated_at ON druids_core.scenarios;
CREATE TRIGGER update_scenarios_updated_at 
    BEFORE UPDATE ON druids_core.scenarios 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_updated_at ON druids_knowledge.entries;
CREATE TRIGGER update_knowledge_updated_at 
    BEFORE UPDATE ON druids_knowledge.entries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data for testing
INSERT INTO druids_core.agents (id, name, type, description, created_by, last_modified_by) 
VALUES 
  ('550e8400-e29b-41d4-a716-446655440000', 'System Coordinator', 'druid', 'Primary system coordination agent', 'system', 'system'),
  ('550e8400-e29b-41d4-a716-446655440001', 'Knowledge Specialist', 'elemental', 'Specialized in knowledge management', 'system', 'system')
ON CONFLICT (id) DO NOTHING;

INSERT INTO druids_core.realms (id, name, type, description, created_by, last_modified_by) 
VALUES 
  ('660e8400-e29b-41d4-a716-446655440000', 'Default Realm', 'collaborative', 'Default system realm for general operations', 'system', 'system')
ON CONFLICT (id) DO NOTHING;