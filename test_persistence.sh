#!/bin/bash
cd /Users/lmccay/Projects/druids

echo "🧪 Testing Database Persistence for Async Results..."

# Initialize MCP session
SESSION_ID=$(curl -s -i -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {"tools": {}},
      "clientInfo": {"name": "persistence-test", "version": "1.0.0"}
    }
  }' | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session ID: $SESSION_ID"

# Create async request
echo "📝 Creating async request..."
REQUEST_ID=$(curl -s -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "ask_agent_async",
      "arguments": {
        "agent_id": "a11e0491-071e-48d7-b45d-b478d906fd54",
        "message": "Write a short haiku about database persistence."
      }
    }
  }' | jq -r '.result.content[0].text' | jq -r '.request_id')

echo "Request ID: $REQUEST_ID"

# Check database directly
echo "🔍 Checking database for the async result..."
docker exec druids-postgres psql -U druids_user -d druids -c "SELECT request_id, agent_id, status, created_at FROM async_results ORDER BY created_at DESC LIMIT 3;"

echo "✅ Test complete!"