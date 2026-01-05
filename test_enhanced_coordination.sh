#!/bin/bash
# test_enhanced_coordination.sh - Test the enhanced coordination system with content integration

BASE_URL="http://localhost:3003"

# Function to initialize session and get session ID
get_session_id() {
  local response=$(curl -i -s -X POST "$BASE_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "method": "initialize",
      "id": 1,
      "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test-client", "version": "1.0.0"}
      }
    }')
  
  echo "$response" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n'
}

# Function to make MCP tool call
mcp_call() {
  local session_id="$1"
  local tool_name="$2"
  local args="$3"
  local id="$4"
  
  curl -s -X POST "$BASE_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Mcp-Session-Id: $session_id" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"tools/call\",
      \"id\": $id,
      \"params\": {
        \"name\": \"$tool_name\",
        \"arguments\": $args
      }
    }"
}

echo "🚀 Enhanced Coordination Test Script"
echo "==================================="

# Step 1: Initialize session
echo "📡 Initializing MCP session..."
SESSION_ID=$(get_session_id)

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to initialize session"
  exit 1
fi

echo "✅ Session ID: $SESSION_ID"

# Step 2: Create coordinator
echo "🎭 Creating coordinator..."
COORD_RESPONSE=$(mcp_call "$SESSION_ID" "create_coordinator" '{
  "name": "Enhanced Test Coordinator",
  "description": "Coordinator for testing enhanced content integration",
  "llm_provider": "openai",
  "coordination_style": "collaborative"
}' 2)

COORD_ID=$(echo "$COORD_RESPONSE" | jq -r '.result.content[0].text | fromjson | .id' 2>/dev/null)

if [ -z "$COORD_ID" ] || [ "$COORD_ID" = "null" ]; then
  echo "❌ Failed to create coordinator"
  echo "$COORD_RESPONSE"
  exit 1
fi

echo "✅ Coordinator ID: $COORD_ID"

# Step 3: Use existing test agents (no need to create new ones)
echo "👥 Using existing test agents..."

# Use the existing agent IDs - include the druid for orchestration
DRUID_ID="pierre-robert"      # Druid agent (traveling coordinator)
AUTHOR_ID="luna-nightweaver"  # Elemental agent
POLITICAL_ID="dr-marcus-stratford"  # Elemental agent
MYSTICAL_ID="elena-cypher"    # Elemental agent

echo "✅ Using agents:"
echo "   Druid: $DRUID_ID"
echo "   Author: $AUTHOR_ID"
echo "   Political: $POLITICAL_ID"
echo "   Mystical: $MYSTICAL_ID"

# Step 4: Activate agents (they should already be available)
echo "🔧 Checking agent availability..."

# Step 5: Test enhanced coordination
echo "🎯 Starting enhanced coordination test..."

COORDINATION_RESPONSE=$(mcp_call "$SESSION_ID" "start_coordination" "{
  \"coordinator_id\": \"$COORD_ID\",
  \"participant_ids\": [\"$DRUID_ID\", \"$AUTHOR_ID\", \"$POLITICAL_ID\", \"$MYSTICAL_ID\"],
  \"scenario_prompt\": \"ENHANCED COORDINATION TEST: Create ONE complete urban fantasy short story about magical politics in a modern city. The druid coordinator should travel between realms and direct the specialists: Urban Fantasy Author to write story content, Political Expert to integrate political themes, and Mystical Expert to add magical elements. The result should be ONE FINAL INTEGRATED STORY.\",
  \"publish_to\": [\"stories/enhanced_test\"],
  \"timeout_minutes\": 8
}" 9)

SESSION_ID_RESULT=$(echo "$COORDINATION_RESPONSE" | jq -r '.result.content[0].text | fromjson | .session_id' 2>/dev/null)

if [ -z "$SESSION_ID_RESULT" ] || [ "$SESSION_ID_RESULT" = "null" ]; then
  echo "❌ Failed to start coordination"
  echo "$COORDINATION_RESPONSE"
  exit 1
fi

echo "✅ Coordination started: $SESSION_ID_RESULT"
echo "⏳ Waiting for completion..."

# Step 6: Monitor coordination progress
for i in {1..20}; do
  sleep 10
  STATUS_RESPONSE=$(mcp_call "$SESSION_ID" "get_coordination_session" "{\"session_id\": \"$SESSION_ID_RESULT\"}" $((10+i)))
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text | fromjson | .status' 2>/dev/null)
  
  echo "📊 Status check $i: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "🎉 Coordination completed!"
    
    # Get final result
    FINAL_RESULT=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text | fromjson | .finalResult.integratedContent' 2>/dev/null)
    
    if [ "$FINAL_RESULT" != "null" ] && [ -n "$FINAL_RESULT" ]; then
      echo "📚 Enhanced coordination SUCCESS - Integrated content created!"
      echo "Content length: $(echo "$FINAL_RESULT" | wc -c) characters"
      echo "First 200 chars: $(echo "$FINAL_RESULT" | head -c 200)..."
    else
      echo "⚠️ Coordination completed but no integrated content found"
      echo "$STATUS_RESPONSE" | jq '.'
    fi
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Coordination failed"
    echo "$STATUS_RESPONSE" | jq '.'
    break
  fi
done

echo "🏁 Enhanced coordination test complete!"