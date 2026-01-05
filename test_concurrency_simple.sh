#!/bin/bash

echo "🧪 Testing Coordinator Concurrency Tracking"
echo "==========================================="

# Function to start a coordination session
start_coordination() {
  local session_num=$1
  echo "📡 Starting coordination session $session_num..."
  
  # Initialize MCP session
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
        "clientInfo": {"name": "concurrency-test-'$session_num'", "version": "1.0.0"}
      }
    }')
  
  session_id=$(echo "$session_response" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
  echo "   ✅ MCP Session: $session_id"
  
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
          "scenario_prompt": "Concurrency test session '$session_num': Pierre should work with Luna on a collaborative task."
        }
      },
      "id": 2
    }')
  
  coord_session=$(echo "$coord_response" | jq -r '.result.content[0].text' 2>/dev/null | jq -r '.session_id' 2>/dev/null)
  echo "   🎯 Coordination: $coord_session"
  
  echo "$session_id|$coord_session"
}

echo "🚀 Testing coordinator concurrency limits..."

# Test rapid session creation
echo ""
echo "📍 Starting multiple coordination sessions rapidly..."

session1_info=$(start_coordination 1) &
session2_info=$(start_coordination 2) &
session3_info=$(start_coordination 3) &

wait

echo ""
echo "📊 Results:"
echo "   Session 1: $session1_info"
echo "   Session 2: $session2_info" 
echo "   Session 3: $session3_info"

echo ""
echo "🏁 Concurrency test complete!"
echo ""
echo "✅ SUCCESS INDICATORS:"
echo "   - Multiple sessions should start successfully"
echo "   - Coordinator should track and limit concurrent sessions"
echo "   - Session isolation should prevent conflicts"