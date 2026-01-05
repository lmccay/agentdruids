#!/bin/bash

echo "🧪 Testing Coordination Framework"

# Initialize session
SESSION_ID=$(curl -s -i http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session: $SESSION_ID"

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  exit 1
fi

# Request coordination  
echo "Starting simple coordination: 'Create a marketing slogan for recycled materials'"

RESULT=$(curl -s http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Create a marketing slogan for recycled materials"
      }
    },
    "id": 2
  }')

echo "Initial Result:"
echo "$RESULT" | jq '.result.content[0].text' | sed 's/^"//;s/"$//' | sed 's/\\n/\n/g'

# Extract session ID for monitoring
COORD_SESSION=$(echo "$RESULT" | jq -r '.result.content[0].text' | grep -o 'session-[^`]*' | head -1)

if [ -n "$COORD_SESSION" ]; then
  echo -e "\n⏱️  Coordination session: $COORD_SESSION"
  echo "Waiting 45 seconds for completion..."
  sleep 45
  
  # Check the session status
  echo -e "\n📋 Checking final results..."
  STATUS_RESULT=$(curl -s http://localhost:3003/mcp \
    -H "Content-Type: application/json" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d '{
      "jsonrpc": "2.0",
      "method": "tools/call",
      "params": {
        "name": "get_coordination_session",
        "arguments": {
          "session_id": "'$COORD_SESSION'"
        }
      },
      "id": 3
    }')

  echo "Final Status:"
  echo "$STATUS_RESULT" | jq '.result.content[0].text' | sed 's/^"//;s/"$//' | sed 's/\\n/\n/g'
  
  # Check published content
  echo -e "\n📂 Checking published content..."
  if [ -d "data/published_content" ]; then
    ls -la data/published_content/
    if [ "$(ls -A data/published_content/ 2>/dev/null)" ]; then
      echo -e "\n📄 Latest published content:"
      LATEST_FILE=$(ls -t data/published_content/ | head -1)
      echo "File: $LATEST_FILE"
      echo "Preview:"
      head -30 "data/published_content/$LATEST_FILE"
    else
      echo "❌ No published content files found"
    fi
  else
    echo "❌ Published content directory doesn't exist"
  fi
else
  echo "❌ Could not extract coordination session ID"
fi

echo -e "\n✅ Test complete!"