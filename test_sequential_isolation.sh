#!/bin/bash

echo "🧪 Testing Session-Scoped Agent State Isolation (Sequential)"
echo "============================================================="

# Function to test a single session
test_single_session() {
  local session_num=$1
  local target_realm=""
  
  case $session_num in
    1) target_realm="Newford" ;;
    2) target_realm="Middle Earth" ;;
    3) target_realm="Default" ;;
  esac
  
  echo "📡 Testing session $session_num targeting $target_realm..."
  
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
  echo "   ✅ MCP Session ID: $session_id"
  
  # Start coordination
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
  
  coord_session=$(echo "$coord_response" | jq -r '.result.content[0].text' 2>/dev/null | jq -r '.session_id' 2>/dev/null)
  echo "   🎯 Coordination Session: $coord_session"
  
  # Wait for completion and check status
  echo "   ⏳ Waiting for completion..."
  sleep 8
  
  if [[ "$coord_session" != "null" && -n "$coord_session" ]]; then
    status_response=$(curl -s -X POST "http://localhost:3003/mcp" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -H "Mcp-Session-Id: $session_id" \
      -d '{
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": "get_coordination_session", "arguments": {"session_id": "'$coord_session'"}},
        "id": 3
      }')
    
    status=$(echo "$status_response" | jq -r '.result.content[0].text' 2>/dev/null | jq -r '.status' 2>/dev/null)
    echo "   📊 Final Status: $status"
    
    if [[ "$status" == "completed" ]]; then
      echo "   ✅ Session $session_num completed successfully targeting $target_realm"
    else
      echo "   ❌ Session $session_num failed or incomplete"
    fi
  else
    echo "   ❌ Session $session_num failed to start"
  fi
  
  echo ""
}

# Test each session sequentially
for i in 1 2 3; do
  test_single_session $i
  echo "---"
done

echo "🏁 Sequential isolation test complete!"
echo ""
echo "✅ SUCCESS INDICATORS:"
echo "   - All sessions should complete independently"
echo "   - Each should target different realms successfully"
echo "   - No interference between sessions"