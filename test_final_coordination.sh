#!/bin/bash

echo "🚀 Testing comprehensive Pierre Robert coordination with auto-activation..."

# Initialize session and capture session ID
echo "Initializing MCP session..."
SESSION_RESPONSE=$(curl -i -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }')

# Extract session ID from header
SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "Session ID: $SESSION_ID"

if [ -z "$SESSION_ID" ]; then
    echo "❌ Failed to get session ID"
    echo "Response:"
    echo "$SESSION_RESPONSE"
    exit 1
fi

echo ""
echo "🎯 Starting coordination test..."

# Run the coordination with session
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0", 
    "id": 2, 
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "coordinator_id": "c53fdf4b-4ade-4753-9c90-1e2c5a1cbb3a",
        "participant_ids": ["5fa4d7f4-f93a-4672-9f13-fa5b1bf4d3d6", "f3c7fa44-1a8e-425b-adba-568743a1ca74"],
        "project_prompt": "Create a comprehensive analysis comparing magical worldbuilding approaches in fantasy literature. Focus on how different authors construct their magical systems, from Tolkien deep mythological approach to De Lint urban fantasy integration. This should demonstrate cross-realm collaboration between Middle Earth and Newford perspectives."
      }
    }
  }'