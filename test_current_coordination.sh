#!/bin/bash
cd /Users/lmccay/Projects/druids

echo "🧪 Testing Current Coordination System for Multi-Realm Scenario..."

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
      "clientInfo": {"name": "coordination-test", "version": "1.0.0"}
    }
  }' | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session ID: $SESSION_ID"

# Start coordination with Pierre Robert as coordinator and De Lint & Tolkien as participants
echo "📝 Starting coordination scenario..."
COORDINATION_RESPONSE=$(curl -s -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "start_coordination",
      "arguments": {
        "coordinator_id": "c53fdf4b-4ade-4753-9c90-1e2c5a1cbb3a",
        "scenario_prompt": "Pierre Robert needs to travel to the Newford realm to collaborate with De Lint on creating a story about the Grateful Dead performing in Newford with magical audience members. Then travel to Middle Earth to work with Tolkien on composing a new song for the Dead to perform in the Newford concert.",
        "participant_ids": ["f3c7fa44-1a8e-425b-adba-568743a1ca74", "5fa4d7f4-f93a-4672-9f13-fa5b1bf4d3d6"],
        "timeout_minutes": 15,
        "coordination_style": "collaborative"
      }
    }
  }')

echo "Coordination Response:"
echo "$COORDINATION_RESPONSE" | jq -r '.result.content[0].text' | jq .

echo "✅ Test setup complete!"