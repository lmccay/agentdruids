#!/bin/bash

echo "🔬 Testing Agent Delegation Directly"
echo "================================="

# Initialize session
echo "📡 Initializing MCP session..."
SESSION_RESPONSE=$(curl -s -i -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}}, "id": 1}')

SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "✅ Session ID: $SESSION_ID"

# Test agent status check
echo ""
echo "🔍 Checking agent statuses..."
for agent in "luna-nightweaver" "dr-marcus-stratford" "elena-cypher" "pierre-robert"; do
  status=$(curl -s "http://localhost:3000/api/agents/$agent" | jq -r '.status')
  echo "   $agent: $status"
done

# Test direct delegation from Pierre to Luna
echo ""
echo "🎯 Testing direct delegation: Pierre -> Luna"
DELEGATION_RESPONSE=$(curl -s -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "delegate_task",
      "arguments": {
        "from_agent_id": "pierre-robert",
        "agent_id": "luna-nightweaver", 
        "task": "Write a short urban fantasy story outline about magical politics in a modern city."
      }
    },
    "id": 2
  }')

echo "Delegation Response:"
echo "$DELEGATION_RESPONSE" | jq '.'

echo ""
echo "🏁 Delegation test complete!"