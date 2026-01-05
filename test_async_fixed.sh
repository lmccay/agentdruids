#!/bin/bash

cd /Users/lmccay/Projects/druids

echo "🚀 Testing MCP Async Request..."

# Initialize session with correct headers
SESSION_ID=$(curl -s -i -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {
        "tools": {}
      },
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }' | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  exit 1
fi

echo "✅ Session ID: $SESSION_ID"

# Create async request
REQUEST_ID=$(curl -s -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "ask_agent_async",
      "arguments": {
        "agent_id": "a11e0491-071e-48d7-b45d-b478d906fd54",
        "message": "What are the benefits of cloud computing? Please provide 3 key benefits."
      }
    }
  }' | jq -r '.result.content[0].text' | jq -r '.requestId')

if [ -z "$REQUEST_ID" ] || [ "$REQUEST_ID" = "null" ]; then
  echo "❌ Failed to get request ID"
  exit 1
fi

echo "✅ Request ID: $REQUEST_ID"

# Wait a moment and check result
echo "⏳ Waiting 5 seconds for processing..."
sleep 5

# Check result
echo "🔍 Checking result..."
curl -s -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 4,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"get_async_result\",
      \"arguments\": {
        \"request_id\": \"$REQUEST_ID\"
      }
    }
  }" | jq -r '.result.content[0].text' | jq .

echo "✅ Test complete!"