#!/bin/bash

echo "🔧 Checking Available MCP Tools"
echo "==============================="

# Initialize session
echo "📡 Initializing MCP session..."
SESSION_RESPONSE=$(curl -s -i -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}}, "id": 1}')

SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "✅ Session ID: $SESSION_ID"

# List available tools
echo ""
echo "🛠️ Listing available tools..."
TOOLS_RESPONSE=$(curl -s -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }')

echo "Available Tools:"
echo "$TOOLS_RESPONSE" | jq '.result.tools[] | {name: .name, description: .description}'

echo ""
echo "🏁 Tool list complete!"