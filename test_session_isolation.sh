#!/bin/bash

echo "🧪 Testing Session-Scoped Agent State Isolation"
echo "==============================================="

# Function to start a coordination session and track agent states
test_session_isolation() {
  local session_num=$1
  echo "📡 Testing session $session_num isolation..."
  
  # Initialize session
  session_response=$(curl -s -i -X POST "http://localhost:3003/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "method": "initialize",
      "id": 1,
      "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "isolation-test-'$session_num'", "version": "1.0.0"}
      }
    }')
  
  session_id=$(echo "$session_response" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
  echo "✅ Session $session_num MCP ID: $session_id"
  
  # Start coordination with different realms for each session
  target_realm=""
  case $session_num in
    1) target_realm="Newford" ;;
    2) target_realm="Middle Earth" ;;
    3) target_realm="Default" ;;
  esac
  
  coord_response=$(curl -s -X POST "http://localhost:3003/mcp" \
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
          "participant_ids": ["pierre-robert", "luna-nightweaver"],
          "scenario_prompt": "Session '$session_num': Pierre should travel to '$target_realm' and delegate a task to Luna about writing a story set in that realm."
        }
      },
      "id": 2
    }')
  
  coord_session=$(echo "$coord_response" | jq -r '.result.content[0].text' 2>/dev/null | jq -r '.session_id' 2>/dev/null || echo "error")
  echo "🎯 Session $session_num coordination: $coord_session (target: $target_realm)"
  
  # Return session info for tracking
  echo "$session_id|$coord_session|$target_realm"
}

echo "🚀 Starting 3 concurrent sessions targeting different realms..."

# Start sessions in parallel
session1_info=$(test_session_isolation 1) &
session2_info=$(test_session_isolation 2) &
session3_info=$(test_session_isolation 3) &

# Wait for all sessions to start
wait

echo ""
echo "📊 Monitoring session isolation for 30 seconds..."

# Parse session info
session1_mcp=$(echo "$session1_info" | cut -d'|' -f1 | tail -1)
session1_coord=$(echo "$session1_info" | cut -d'|' -f2 | tail -1)
session1_realm=$(echo "$session1_info" | cut -d'|' -f3 | tail -1)

session2_mcp=$(echo "$session2_info" | cut -d'|' -f1 | tail -1)
session2_coord=$(echo "$session2_info" | cut -d'|' -f2 | tail -1)
session2_realm=$(echo "$session2_info" | cut -d'|' -f3 | tail -1)

session3_mcp=$(echo "$session3_info" | cut -d'|' -f1 | tail -1)
session3_coord=$(echo "$session3_info" | cut -d'|' -f2 | tail -1)
session3_realm=$(echo "$session3_info" | cut -d'|' -f3 | tail -1)

echo "Session 1 ($session1_coord) targeting $session1_realm"
echo "Session 2 ($session2_coord) targeting $session2_realm"
echo "Session 3 ($session3_coord) targeting $session3_realm"

# Monitor for conflicts - check if sessions complete
for i in {1..6}; do
  echo ""
  echo "⏱️  Monitor check $i ($(($i * 5))s):"
  
  # Check all session statuses
  for session_num in 1 2 3; do
    mcp_id=""
    coord_id=""
    realm=""
    case $session_num in
      1) mcp_id="$session1_mcp"; coord_id="$session1_coord"; realm="$session1_realm" ;;
      2) mcp_id="$session2_mcp"; coord_id="$session2_coord"; realm="$session2_realm" ;;
      3) mcp_id="$session3_mcp"; coord_id="$session3_coord"; realm="$session3_realm" ;;
    esac
    
    if [[ "$coord_id" != "error" && "$coord_id" != "null" && -n "$coord_id" ]]; then
      status=$(curl -s -X POST "http://localhost:3003/mcp" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -H "Mcp-Session-Id: $mcp_id" \
        -d '{
          "jsonrpc": "2.0",
          "method": "tools/call",
          "params": {"name": "get_coordination_session", "arguments": {"session_id": "'$coord_id'"}},
          "id": 3
        }' | jq -r '.result.content[0].text' 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unknown")
      
      echo "   Session $session_num ($realm): $status"
    else
      echo "   Session $session_num ($realm): failed to start"
    fi
  done
  
  sleep 5
done

echo ""
echo "🏁 Session isolation test complete!"
echo ""
echo "✅ ISOLATION SUCCESS INDICATORS:"
echo "   - All sessions should complete independently"
echo "   - No realm travel conflicts between Pierre in different sessions"
echo "   - Each session maintains its own agent state"
echo ""
echo "❌ FAILURE INDICATORS:"
echo "   - Sessions failing due to agent state conflicts"
echo "   - Pierre's realm state from one session affecting another"
echo "   - Task delegation errors due to shared state"