#!/bin/bash
# test_mcp_session.sh - Test MCP session initialization and get session ID

BASE_URL="http://localhost:3001"

echo "🚀 Testing MCP Session Initialization..."

# Initialize session and capture headers
RESPONSE=$(curl -i -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1,
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }')

# Extract session ID from headers
SESSION_ID=$(echo "$RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  echo "Response:"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ Session ID: $SESSION_ID"

# Test a simple tool call with the session ID
echo "🔧 Testing tool call with session..."
curl -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 2,
    "params": {
      "name": "agent_list",
      "arguments": {}
    }
  }' | jq '.'

echo "📋 Session ID for future use: $SESSION_ID"