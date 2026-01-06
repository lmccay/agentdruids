-- Migration 002: Add MCP server bindings to realms and agents
-- Purpose: Store which MCP servers each realm has access to, and which tools each agent can use

-- Add mcp_servers column to realms table
-- Stores array of MCP server IDs that this realm has access to
ALTER TABLE druids_core.realms
ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]'::jsonb;

-- Add mcp_tools column to agents table
-- Stores array of tool patterns (with wildcards) that this agent can use
-- Example: ["github:*", "jira:create_issue", "slack:send_*"]
ALTER TABLE druids_core.agents
ADD COLUMN IF NOT EXISTS mcp_tools JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN druids_core.realms.mcp_servers IS 'Array of MCP server IDs available to this realm. Example: ["github", "jira", "slack"]';
COMMENT ON COLUMN druids_core.agents.mcp_tools IS 'Array of MCP tool patterns with wildcard support. Example: ["github:*", "jira:create_issue"]';

-- Create index for faster queries on mcp_servers
CREATE INDEX IF NOT EXISTS idx_realms_mcp_servers ON druids_core.realms USING GIN (mcp_servers);

-- Create index for faster queries on mcp_tools
CREATE INDEX IF NOT EXISTS idx_agents_mcp_tools ON druids_core.agents USING GIN (mcp_tools);
