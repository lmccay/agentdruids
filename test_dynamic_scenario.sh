#!/bin/bash

echo "🧪 Testing Dynamic Scenario Agent Assignment"

# Create MCP session
SESSION_ID=$(curl -s -i -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "✅ Session ID: $SESSION_ID"

# Step 1: Create agents via coordination
echo "🔄 Step 1: Creating agents via coordination..."
COORD_RESULT=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Test agent creation for dynamic scenarios"
      }
    },
    "id": 2
  }')

echo "Coordination started to create agents"
sleep 15

# Step 2: Create a new scenario
echo "🔄 Step 2: Creating dynamic scenario..."
SCENARIO_CREATE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "scenario_create",
      "arguments": {
        "name": "Test Dynamic Scenario",
        "objective": "Test if dynamic scenarios can find coordination-created agents"
      }
    },
    "id": 3
  }')

SCENARIO_ID=$(echo "$SCENARIO_CREATE" | jq -r '.result.content[0].text' | jq -r '.scenario.id')
echo "📊 Created scenario: $SCENARIO_ID"

# Step 3: Execute the dynamic scenario
echo "🔄 Step 3: Executing dynamic scenario..."
EXEC_RESULT=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"scenario_execute\",
      \"arguments\": {
        \"scenarioId\": \"$SCENARIO_ID\"
      }
    },
    \"id\": 4
  }")

echo "📊 Execution result:"
echo "$EXEC_RESULT" | jq '.result.content[0].text' | jq .

echo "✅ Test complete!"