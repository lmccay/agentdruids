-- Add async_results table to store async request results persistently
CREATE TABLE IF NOT EXISTS async_results (
    request_id VARCHAR(255) PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    result_data JSONB,
    error_message TEXT,
    progress JSONB,
    metadata JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Index for efficient agent-based queries
CREATE INDEX IF NOT EXISTS idx_async_results_agent_id ON async_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_async_results_status ON async_results(status);
CREATE INDEX IF NOT EXISTS idx_async_results_created_at ON async_results(created_at);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_async_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_async_results_updated_at
    BEFORE UPDATE ON async_results
    FOR EACH ROW
    EXECUTE FUNCTION update_async_results_updated_at();