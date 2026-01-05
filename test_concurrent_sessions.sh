#!/bin/bash

echo "🔄 Testing Concurrent Sessions"
echo "=============================="

# Function to start a coordination session
start_session() {
  local session_num=$1
  echo "📡 Starting session $session_num..."
  
  # Initialize session
  local session_response=$(curl -s -i -X POST "http://localhost:3003/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "method": "initialize",
      "id": 1,
      "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "concurrent-test-'$session_num'", "version": "1.0.0"}
      }
    }')
  
  local session_id=$(echo "$session_response" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
  echo "✅ Session $session_num ID: $session_id"
  
  # Start coordination
  local coord_response=$(curl -s -X POST "http://localhost:3003/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Mcp-Session-Id: $session_id" \
    -d '{
      "jsonrpc": "2.0",
      "method": "tools/call",
      "params": {
        "name": "start_orchestrated_coordination",
        "arguments": {
          "coordinator_id": "built-in-coordinator",
          "participant_ids": ["pierre-robert", "luna-nightweaver", "dr-marcus-stratford", "elena-cypher"],
          "scenario_prompt": "Session '$session_num': Create a short story about magical politics (Session '$session_num' variant)."
        }
      },
      "id": 2
    }')
  
  local coord_session=$(echo "$coord_response" | jq -r '.result.content[0].text' | jq -r '.session_id')
  echo "🎯 Session $session_num coordination: $coord_session"
  
  # Return both IDs for tracking
  echo "$session_id|$coord_session"
}

# Start multiple concurrent sessions
echo "🚀 Starting 3 concurrent coordination sessions..."

session1_ids=$(start_session 1) &
session2_ids=$(start_session 2) &
session3_ids=$(start_session 3) &

# Wait for all sessions to start
wait

echo ""
echo "📊 Session Status Check:"

# Parse session IDs
session1_mcp=$(echo "$session1_ids" | cut -d'|' -f1)
session1_coord=$(echo "$session1_ids" | cut -d'|' -f2)

session2_mcp=$(echo "$session2_ids" | cut -d'|' -f1)
session2_coord=$(echo "$session2_ids" | cut -d'|' -f2)

session3_mcp=$(echo "$session3_ids" | cut -d'|' -f1)
session3_coord=$(echo "$session3_ids" | cut -d'|' -f2)

# Check status of all sessions
for i in {1..5}; do
  echo "📈 Status check $i:"
  
  # Session 1
  status1=$(curl -s -X POST "http://localhost:3003/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Mcp-Session-Id: $session1_mcp" \
    -d '{
      "jsonrpc": "2.0",
      "method": "tools/call",
      "params": {"name": "get_coordination_session", "arguments": {"session_id": "'$session1_coord'"}},
      "id": 3
    }' | jq -r '.result.content[0].text' | jq -r '.status')
  
  # Session 2
  status2=$(curl -s -X POST "http://localhost:3003/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Mcp-Session-Id: $session2_mcp" \
    -d '{
      "jsonrpc": "2.0",
      "method": "tools/call",
      "params": {"name": "get_coordination_session", "arguments": {"session_id": "'$session2_coord'"}},
      "id": 3
    }' | jq -r '.result.content[0].text' | jq -r '.status')
  
  # Session 3
  status3=$(curl -s -X POST "http://localhost:3003/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Mcp-Session-Id: $session3_mcp" \
    -d '{
      "jsonrpc": "2.0",
      "method": "tools/call",
      "params": {"name": "get_coordination_session", "arguments": {"session_id": "'$session3_coord'"}},
      "id": 3
    }' | jq -r '.result.content[0].text' | jq -r '.status')
  
  echo "   Session 1: $status1"
  echo "   Session 2: $status2" 
  echo "   Session 3: $status3"
  
  # Check if any are still running
  if [[ "$status1" != "completed" && "$status1" != "failed" ]] || 
     [[ "$status2" != "completed" && "$status2" != "failed" ]] || 
     [[ "$status3" != "completed" && "$status3" != "failed" ]]; then
    echo "   ⏳ Waiting 10 seconds..."
    sleep 10
  else
    echo "   ✅ All sessions completed!"
    break
  fi
done

echo ""
echo "🏁 Concurrent session test complete!"
echo "Session 1 ($session1_coord): $status1"
echo "Session 2 ($session2_coord): $status2"
echo "Session 3 ($session3_coord): $status3"