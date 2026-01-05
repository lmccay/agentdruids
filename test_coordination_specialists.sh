#!/bin/bash

# Test script for coordination with properly specialized agents
echo "🎭 Testing Coordination with Specialized Agents"
echo "==============================================="

# Initialize session
echo "📡 Initializing MCP session..."
RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1,
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }')

SESSION_ID=$(echo "$RESPONSE" | grep -o '"Mcp-Session-Id":"[^"]*"' | cut -d'"' -f4)
echo "✅ Session ID: $SESSION_ID"

# Create coordinator
echo "🎭 Creating coordinator..."
COORD_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 3,
    "params": {
      "name": "create_coordinator",
      "arguments": {
        "name": "Master Coordinator",
        "llm_provider": "openai"
      }
    }
  }')

COORD_ID=$(echo "$COORD_RESPONSE" | jq -r '.result.content[0].text | fromjson | .coordinator.id')
echo "✅ Coordinator ID: $COORD_ID"

echo "👥 Creating specialized coordination agents..."

# Create Story Creator (not just urban fantasy author)
AUTHOR_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 4,
    "params": {
      "name": "agent_create",
      "arguments": {
        "name": "Story Creator",
        "type": "elemental",
        "specialization": "story_creation",
        "persona": "creative_writer",
        "llm_provider": "openai",
        "system_prompt": "You are a Story Creator specialized in writing complete narratives. When given a writing task, you always produce full, engaging stories with characters, plot, and dialogue. You never provide outlines or plans - you write actual content."
      }
    }
  }')

AUTHOR_ID=$(echo "$AUTHOR_RESPONSE" | jq -r '.result.content[0].text | fromjson | .agent.id')
echo "✅ Story Creator: $AUTHOR_ID"

# Create Political Integrator  
POLITICAL_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 5,
    "params": {
      "name": "agent_create",
      "arguments": {
        "name": "Political Integrator",
        "type": "elemental",
        "specialization": "political_integration",
        "persona": "analytical_enhancer", 
        "llm_provider": "openai",
        "system_prompt": "You are a Political Integrator who takes existing stories and directly integrates political themes. You rewrite content to include political conflicts, power struggles, corruption, elections, and government dynamics. You never provide analysis - you enhance actual content."
      }
    }
  }')

POLITICAL_ID=$(echo "$POLITICAL_RESPONSE" | jq -r '.result.content[0].text | fromjson | .agent.id')
echo "✅ Political Integrator: $POLITICAL_ID"

# Create Magic Weaver
MYSTICAL_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call", 
    "id": 6,
    "params": {
      "name": "agent_create",
      "arguments": {
        "name": "Magic Weaver",
        "type": "elemental",
        "specialization": "magical_enhancement",
        "persona": "mystical_enhancer",
        "llm_provider": "openai",
        "system_prompt": "You are a Magic Weaver who takes existing stories and directly adds magical elements. You enhance content with spells, magical creatures, mystical conflicts, and supernatural systems. You work with whatever content exists and never ask for drafts - you enhance actual content."
      }
    }
  }')

MYSTICAL_ID=$(echo "$MYSTICAL_RESPONSE" | jq -r '.result.content[0].text | fromjson | .agent.id')
echo "✅ Magic Weaver: $MYSTICAL_ID"

echo "🔧 Activating specialized agents..."
curl -s -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Mcp-Session-Id: $SESSION_ID" -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":7,\"params\":{\"name\":\"agent_start\",\"arguments\":{\"agentId\":\"$AUTHOR_ID\"}}}" > /dev/null
curl -s -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Mcp-Session-Id: $SESSION_ID" -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":8,\"params\":{\"name\":\"agent_start\",\"arguments\":{\"agentId\":\"$POLITICAL_ID\"}}}" > /dev/null  
curl -s -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Mcp-Session-Id: $SESSION_ID" -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":9,\"params\":{\"name\":\"agent_start\",\"arguments\":{\"agentId\":\"$MYSTICAL_ID\"}}}" > /dev/null

echo "🎯 Starting coordination with specialized agents..."
COORDINATION_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"id\": 10,
    \"params\": {
      \"name\": \"start_coordination\",
      \"arguments\": {
        \"coordinator_id\": \"$COORD_ID\",
        \"participant_ids\": [\"$AUTHOR_ID\", \"$POLITICAL_ID\", \"$MYSTICAL_ID\"],
        \"scenario_prompt\": \"SPECIALIST COORDINATION TEST: Create a complete urban fantasy short story about magical politics in a modern city. Story Creator: Write the complete story. Political Integrator: Take the story and integrate political themes directly into it. Magic Weaver: Take the enhanced story and add rich magical elements. Goal: ONE FINAL INTEGRATED STORY with all elements woven together.\",
        \"publish_to\": [\"stories/specialist_test\"],
        \"timeout_minutes\": 8
      }
    }
  }")

SESSION_ID_COORD=$(echo "$COORDINATION_RESPONSE" | jq -r '.result.content[0].text | fromjson | .session_id')
echo "✅ Coordination started: $SESSION_ID_COORD"

echo "⏳ Waiting for completion..."
for i in {1..10}; do
  sleep 5
  STATUS_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
    -H "Content-Type: application/json" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"tools/call\",
      \"id\": $((10+i)),
      \"params\": {
        \"name\": \"get_coordination_status\",
        \"arguments\": {
          \"session_id\": \"$SESSION_ID_COORD\"
        }
      }
    }")
  
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text | fromjson | .status')
  echo "📊 Status check $i: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "🎉 Coordination completed!"
    
    # Check for integrated content
    INTEGRATED_CONTENT=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text | fromjson | .final_result.integratedContent // empty')
    if [ -n "$INTEGRATED_CONTENT" ]; then
      echo "🎭 SUCCESS: Integrated content found!"
      echo "📖 Content preview:"
      echo "$INTEGRATED_CONTENT" | head -c 500
      echo "..."
    else
      echo "⚠️ Coordination completed but no integrated content found"
    fi
    
    echo "$STATUS_RESPONSE" | jq '.result.content[0].text | fromjson'
    break
  fi
  
  if [ "$STATUS" = "failed" ]; then
    echo "❌ Coordination failed"
    echo "$STATUS_RESPONSE" | jq '.result.content[0].text | fromjson'
    break
  fi
done

echo "🏁 Specialist coordination test complete!"