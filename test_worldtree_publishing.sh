#!/bin/bash

# Test script to verify WorldTree publishing for creative content
# This tests that sequential coordination creates content accessible in the UI

set -e

echo "🧪 Testing WorldTree Creative Content Publishing"
echo "================================================"

# Wait for services to be ready
echo "⏱️  Waiting for services to be ready..."
sleep 10

# Test the sequential coordination scenario
echo "🎭 Starting sequential coordination scenario..."

# Initialize MCP session with gateway
echo "📡 Initializing MCP gateway session..."
SESSION_RESPONSE=$(curl -s -i -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "roots": {
          "listChanged": true
        },
        "sampling": {}
      },
      "clientInfo": {
        "name": "internal-worldtree-test",
        "version": "1.0.0"
      }
    }
  }')

# Extract session ID from header
SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  echo "Response: $SESSION_RESPONSE"
  exit 1
fi

echo "✅ Session ID: $SESSION_ID"

# Start sequential coordination
echo "🚀 Starting sequential multi-realm storytelling coordination..."
COORDINATION_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "coordinate_agents",
      "arguments": {
        "scenario_prompt": "Pierre Robert travels to Newford realm to collaborate with De Lint to collect a story about the Grateful Dead performing a concert in Newford, then travels to Middle Earth and works with Tolkien to write a new song incorporating both realms",
        "coordination_type": "sequential"
      }
    }
  }')

echo "📝 Coordination Response (raw):"
echo "$COORDINATION_RESPONSE"

# Extract the JSON from SSE format (remove "data: " prefix)
COORDINATION_JSON=$(echo "$COORDINATION_RESPONSE" | sed 's/^data: //')

echo "📝 Coordination JSON:"
echo "$COORDINATION_JSON" | jq '.'

# Extract the result task ID
TASK_ID=$(echo "$COORDINATION_JSON" | jq -r '.result.content[0].text' | jq -r '.taskId // empty')

if [ -z "$TASK_ID" ]; then
  echo "❌ No task ID found in response"
  exit 1
fi

echo "⏳ Task ID: $TASK_ID"
echo "Waiting for sequential coordination to complete..."

# Poll for completion
for i in {1..30}; do
  echo "📊 Checking task status (attempt $i/30)..."
  
  STATUS_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $((i + 2)),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"get_async_result\",
        \"arguments\": {
          \"task_id\": \"$TASK_ID\"
        }
      }
    }")
  
  # Extract JSON from SSE format
  STATUS_JSON=$(echo "$STATUS_RESPONSE" | sed 's/^data: //')
  STATUS=$(echo "$STATUS_JSON" | jq -r '.result.content[0].text' | jq -r '.status // "unknown"')
  
  echo "📈 Status: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ Sequential coordination completed!"
    
    # Get the final result
    echo "📚 Final result:"
    echo "$STATUS_JSON" | jq '.result.content[0].text' | jq -r '. | fromjson | .result' | jq '.'
    
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Sequential coordination failed"
    echo "$STATUS_JSON" | jq '.'
    exit 1
  fi
  
  sleep 5
done

echo ""
echo "🌍 Checking WorldTree content storage..."

# Check if content was published to WorldTree
echo "🔍 Looking for published creative content in container..."

# Check filesystem creative content
echo "📁 Filesystem creative content:"
docker exec druids-app-1 find /app/data/published_content -name "*.md" -type f 2>/dev/null | head -5

# Check session content (WorldTree storage)
echo "📚 Session content (WorldTree):"
docker exec druids-app-1 find /app/data/published_content/sessions -name "*.json" -type f 2>/dev/null | head -5

# Look for public WorldTree content
echo "🌍 Public WorldTree content:"
docker exec druids-app-1 find /app/data/published_content -path "*/public-worldtree/*" -type f 2>/dev/null | head -5

# Check if any creative content was stored with public markers
echo "🔍 Checking for creative content with public markers..."
docker exec druids-app-1 find /app/data/published_content -name "*.json" -exec grep -l "isPublicContent" {} \; 2>/dev/null | head -3

echo ""
echo "✅ WorldTree publishing test completed!"
echo "Check the logs above to verify content was published to both filesystem and WorldTree."