-- Initialize Druids database with current comprehensive schema
-- This runs ONLY on first database initialization
-- If you need to update an existing database, use migrations instead

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create database schemas
CREATE SCHEMA IF NOT EXISTS druids_core;
CREATE SCHEMA IF NOT EXISTS druids_knowledge;
CREATE SCHEMA IF NOT EXISTS druids_scenarios;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA druids_core TO druids_user;
GRANT ALL PRIVILEGES ON SCHEMA druids_knowledge TO druids_user;
GRANT ALL PRIVILEGES ON SCHEMA druids_scenarios TO druids_user;

-- Agents table (CURRENT COMPREHENSIVE SCHEMA)
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

-- Realms table (CURRENT COMPREHENSIVE SCHEMA)
CREATE TABLE IF NOT EXISTS druids_core.realms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'collaborative',
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
  created_by VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_modified_by VARCHAR(255) NOT NULL DEFAULT 'system',
  version INTEGER DEFAULT 1,

  CONSTRAINT realms_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'maintenance', 'error'))
);

-- Scenarios table
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
  created_by VARCHAR(255) NOT NULL DEFAULT 'system',
  last_modified_by VARCHAR(255) NOT NULL DEFAULT 'system',
  version INTEGER DEFAULT 1,

  CONSTRAINT scenarios_status_check CHECK (status IN ('draft', 'active', 'completed', 'failed', 'cancelled'))
);

-- Knowledge entries table
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
  created_by VARCHAR(255) NOT NULL DEFAULT 'system',
  last_modified_by VARCHAR(255) NOT NULL DEFAULT 'system',
  version INTEGER DEFAULT 1,

  CONSTRAINT knowledge_namespace_key_unique UNIQUE (namespace, key),
  CONSTRAINT knowledge_access_level_check CHECK (access_level IN ('public', 'private', 'restricted'))
);

-- Async results table
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

-- Legacy tables for backwards compatibility (deprecated)
CREATE TABLE IF NOT EXISTS druids_knowledge.namespaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    realm_id UUID REFERENCES druids_core.realms(id),
    access_control JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_agents_type ON druids_core.agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_status ON druids_core.agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_realm_access ON druids_core.agents USING GIN (realm_access);
CREATE INDEX IF NOT EXISTS idx_agents_tags ON druids_core.agents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON druids_core.agents(created_at);
CREATE INDEX IF NOT EXISTS idx_agents_name_trgm ON druids_core.agents USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_realms_type ON druids_core.realms(type);
CREATE INDEX IF NOT EXISTS idx_realms_status ON druids_core.realms(status);
CREATE INDEX IF NOT EXISTS idx_realms_agents ON druids_core.realms USING GIN (agents);
CREATE INDEX IF NOT EXISTS idx_realms_parent ON druids_core.realms(parent_realm_id);
CREATE INDEX IF NOT EXISTS idx_realms_created_at ON druids_core.realms(created_at);
CREATE INDEX IF NOT EXISTS idx_realms_name_trgm ON druids_core.realms USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_scenarios_coordinator ON druids_core.scenarios(coordinator_agent_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_realm ON druids_core.scenarios(realm_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_status ON druids_core.scenarios(status);
CREATE INDEX IF NOT EXISTS idx_scenarios_created_at ON druids_core.scenarios(created_at);
CREATE INDEX IF NOT EXISTS idx_scenarios_name_trgm ON druids_core.scenarios USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_knowledge_namespace ON druids_knowledge.entries(namespace);
CREATE INDEX IF NOT EXISTS idx_knowledge_namespace_key ON druids_knowledge.entries(namespace, key);
CREATE INDEX IF NOT EXISTS idx_knowledge_owner ON druids_knowledge.entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_access_level ON druids_knowledge.entries(access_level);
CREATE INDEX IF NOT EXISTS idx_knowledge_expires_at ON druids_knowledge.entries(expires_at);

CREATE INDEX IF NOT EXISTS idx_async_results_request_id ON druids_core.async_results(request_id);
CREATE INDEX IF NOT EXISTS idx_async_results_agent_id ON druids_core.async_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_async_results_status ON druids_core.async_results(status);
CREATE INDEX IF NOT EXISTS idx_async_results_expires_at ON druids_core.async_results(expires_at);

-- Legacy indexes
CREATE INDEX IF NOT EXISTS idx_namespaces_realm_id ON druids_knowledge.namespaces(realm_id);
CREATE INDEX IF NOT EXISTS idx_namespaces_name_trgm ON druids_knowledge.namespaces USING gin(name gin_trgm_ops);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON druids_core.agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_realms_updated_at
    BEFORE UPDATE ON druids_core.realms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenarios_updated_at
    BEFORE UPDATE ON druids_core.scenarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_updated_at
    BEFORE UPDATE ON druids_knowledge.entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for development
INSERT INTO druids_core.realms (id, name, type, description, created_by, last_modified_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655440000', 'Open Source Realm', 'collaborative', 'Default realm for open source development and collaboration', 'system', 'system')
ON CONFLICT (id) DO NOTHING;

INSERT INTO druids_core.agents (id, name, type, description, realm_access, created_at, updated_at, last_modified_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'System Coordinator', 'druid', 'Primary system coordination agent', '{"boundRealmId": "550e8400-e29b-41d4-a716-446655440000"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system')
ON CONFLICT (id) DO NOTHING;

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS druids_core.schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(64),
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT true
);

-- Record that init.sql is the baseline (version 1)
INSERT INTO druids_core.schema_migrations (version, name, execution_time_ms, success)
VALUES
  (0, '000_migration_tracking', 0, true),
  (1, '001_baseline_from_init_sql', 0, true)
ON CONFLICT (version) DO NOTHING;

-- Record schema version in knowledge base
INSERT INTO druids_knowledge.entries (namespace, key, value, created_by, last_modified_by)
VALUES
  ('worldtree://public/system', 'schema_version', '{"version": "2.0", "timestamp": "' || NOW() || '", "source": "init.sql", "migration_version": 1}'::jsonb, 'system', 'system')
ON CONFLICT (namespace, key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = CURRENT_TIMESTAMP,
  last_modified_by = EXCLUDED.last_modified_by;
