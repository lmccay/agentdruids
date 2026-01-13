-- Initialize Druids database schema
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

-- Create tables for core entities
CREATE TABLE IF NOT EXISTS druids_core.agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    realm_id UUID,
    configuration JSONB NOT NULL DEFAULT '{}',
    capabilities JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP
);

CREATE TABLE IF NOT EXISTS druids_core.realms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    security_level VARCHAR(50) NOT NULL DEFAULT 'standard',
    configuration JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

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

CREATE TABLE IF NOT EXISTS druids_scenarios.scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    realm_id UUID REFERENCES druids_core.realms(id),
    configuration JSONB NOT NULL DEFAULT '{}',
    phases JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_type ON druids_core.agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_status ON druids_core.agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_realm_id ON druids_core.agents(realm_id);
CREATE INDEX IF NOT EXISTS idx_realms_security_level ON druids_core.realms(security_level);
CREATE INDEX IF NOT EXISTS idx_namespaces_realm_id ON druids_knowledge.namespaces(realm_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_realm_id ON druids_scenarios.scenarios(realm_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_status ON druids_scenarios.scenarios(status);

-- Create full-text search indexes
CREATE INDEX IF NOT EXISTS idx_agents_name_trgm ON druids_core.agents USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_realms_name_trgm ON druids_core.realms USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_namespaces_name_trgm ON druids_knowledge.namespaces USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_scenarios_name_trgm ON druids_scenarios.scenarios USING gin(name gin_trgm_ops);

-- Insert sample data for development
INSERT INTO druids_core.realms (id, name, description, security_level, created_by) VALUES
    ('550e8400-e29b-41d4-a716-446655440000', 'Development Realm', 'Default realm for development', 'standard', 'system')
ON CONFLICT (id) DO NOTHING;

INSERT INTO druids_core.agents (id, name, type, realm_id, configuration) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Dev Druid Alpha', 'druid', '550e8400-e29b-41d4-a716-446655440000', '{"domain": "development", "capabilities": ["coordination", "knowledge_management"]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO druids_knowledge.namespaces (id, name, description, realm_id) VALUES
    ('550e8400-e29b-41d4-a716-446655440002', 'Dev Knowledge Base', 'Development knowledge namespace', '550e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;