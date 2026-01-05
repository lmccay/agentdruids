#!/bin/bash

# Test coordination with proper status checking

echo "🧪 Testing Fixed Coordination System"

# Get session ID
echo "🔄 Initializing MCP session..."
SESSION_ID=$(curl -s -i -X POST \
  http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
    echo "❌ Failed to get session ID"
    exit 1
fi

echo "✅ Session ID: $SESSION_ID"

# Start coordination
echo "🚀 Starting coordination..."
COORD_RESULT=$(curl -s -X POST \
  http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Create a catchy slogan for eco-friendly products"
      }
    },
    "id": 2
  }')

echo "Initial coordination result:"
echo "$COORD_RESULT" | jq .

# Extract session ID from response
COORD_SESSION_ID=$(echo "$COORD_RESULT" | jq -r '.result.content[0].text' | jq -r '.session_id' 2>/dev/null)

if [ -z "$COORD_SESSION_ID" ] || [ "$COORD_SESSION_ID" = "null" ]; then
    echo "❌ Failed to extract coordination session ID"
    exit 1
fi

echo "📊 Coordination Session ID: $COORD_SESSION_ID"

# Wait and check status multiple times
for i in {1..5}; do
    echo "🔍 Status check $i/5 (after $((i*10)) seconds)..."
    sleep 10
    
    STATUS_RESULT=$(curl -s -X POST \
      http://localhost:3003/mcp \
      -H "Content-Type: application/json" \
      -H "Mcp-Session-Id: $SESSION_ID" \
      -d "{
        \"jsonrpc\": \"2.0\",
        \"method\": \"tools/call\",
        \"params\": {
          \"name\": \"get_coordination_session\",
          \"arguments\": {
            \"session_id\": \"$COORD_SESSION_ID\"
          }
        },
        \"id\": $((i+2))
      }")
    
    echo "Status $i:"
    echo "$STATUS_RESULT" | jq .
    
    # Check if completed
    STATUS=$(echo "$STATUS_RESULT" | jq -r '.result.content[0].text' | jq -r '.status' 2>/dev/null)
    echo "Current status: $STATUS"
    
    if [ "$STATUS" = "completed" ]; then
        echo "✅ Coordination completed!"
        break
    elif [ "$STATUS" = "failed" ]; then
        echo "❌ Coordination failed!"
        break
    fi
done

echo "📂 Checking published content..."
ls -la ./data/published_content/ 2>/dev/null || echo "No published content directory found"

echo "✅ Test complete!"