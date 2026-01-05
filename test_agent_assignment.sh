#!/bin/bash

echo "🧪 Testing Agent Assignment Fix"

# Step 1: Create agents via coordination (which creates and activates them)
echo "🔄 Step 1: Creating agents via coordination..."
SESSION_ID=$(curl -s -i -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "✅ Session ID: $SESSION_ID"

# Create agents via coordination
COORD_RESULT=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Simple test to create agents"
      }
    },
    "id": 2
  }')

echo "Coordination started to create agents"

# Wait for coordination to create agents
sleep 15

# Step 2: Test scenario execution (which should now find the active agents)
echo "🔄 Step 2: Testing scenario execution..."

SCENARIO_RESULT=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "scenario_execute",
      "arguments": {
        "scenarioId": "test-scenario-001"
      }
    },
    "id": 3
  }')

echo "📊 Scenario execution result:"
echo "$SCENARIO_RESULT" | jq '.result.content[0].text' | jq .

echo "✅ Test complete!"