#!/bin/bash

# Test coordinator concurrency tracking
set -e

echo "🧪 Testing Coordinator Concurrency Tracking"
echo "============================================"

# Start Docker environment
echo "📦 Starting Docker environment..."
docker-compose up -d --build >/dev/null 2>&1

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 10

# Function to get session ID from response headers
get_session_id() {
  local response_file="$1"
  grep -i "mcp-session-id:" "$response_file" | cut -d' ' -f2 | tr -d '\r\n'
}

# Function to start coordination and capture session ID
start_coordination() {
  local scenario="$1"
  local temp_file=$(mktemp)
  
  curl -i -s -X POST "http://localhost:3003/mcp" \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/call",
      "params": {
        "name": "coordinate_agents",
        "arguments": {
          "coordinator_id": "coord-001",
          "participant_ids": ["Pierre Robert", "De Lint"],
          "scenario_prompt": "'"$scenario"'"
        }
      }
    }' > "$temp_file"
  
  echo "$temp_file"
}

# Test 1: Start multiple concurrent sessions
echo "🎯 Test 1: Starting multiple concurrent sessions"

echo "  📝 Starting session 1..."
session1_file=$(start_coordination "Test scenario 1: Analyze travel trends")
session1_id=$(get_session_id "$session1_file")
echo "    Session 1 ID: $session1_id"

echo "  📝 Starting session 2..."
session2_file=$(start_coordination "Test scenario 2: Research destinations")
session2_id=$(get_session_id "$session2_file")
echo "    Session 2 ID: $session2_id"

echo "  📝 Starting session 3..."
session3_file=$(start_coordination "Test scenario 3: Plan itinerary")
session3_id=$(get_session_id "$session3_file")
echo "    Session 3 ID: $session3_id"

# Test 2: Check concurrency metrics
echo "🔍 Test 2: Checking concurrency metrics"

# Create a simple MCP client to get metrics
curl -s -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_coordination_status",
      "arguments": {
        "session_id": "'"$session1_id"'"
      }
    }
  }' | jq '.result.content[0].text' || echo "  ⚠️ Session status check failed"

# Test 3: Try to exceed concurrency limits
echo "🚫 Test 3: Testing concurrency limits (should start failing after 10 sessions)"

for i in {4..12}; do
  echo "  📝 Starting session $i..."
  session_file=$(start_coordination "Test scenario $i: Load test session")
  
  # Check if we get an error response
  if grep -q "maximum concurrent sessions" "$session_file"; then
    echo "    ✅ Concurrency limit enforced at session $i"
    break
  else
    session_id=$(get_session_id "$session_file")
    echo "    Session $i ID: $session_id"
  fi
done

# Test 4: Check Docker logs for concurrency messages
echo "📋 Test 4: Checking Docker logs for concurrency tracking"
echo "Recent concurrency-related log messages:"
docker logs druids-main --tail 20 2>/dev/null | grep -E "(🎯|🏁|session|concurrent)" | tail -10

# Cleanup
echo "🧹 Cleaning up test files..."
rm -f "$session1_file" "$session2_file" "$session3_file" 2>/dev/null

echo ""
echo "✅ Coordinator concurrency tracking test completed!"
echo "   Check the logs above for concurrency enforcement messages"