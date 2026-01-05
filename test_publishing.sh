#!/bin/bash

# Test Publishing Functionality
echo "📚 Testing Content Publishing in Coordination Framework"
echo "======================================================="

# Initialize session
SESSION_ID=$(curl -s -i http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  exit 1
fi

echo "Session ID: $SESSION_ID"

# Request a simple creative coordination that should produce content
echo -e "\n🎨 Testing with: 'Create a short marketing message for eco-friendly packaging'"

RESULT=$(curl -s http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Create a short marketing message for eco-friendly packaging"
      }
    },
    "id": 2
  }')

echo "Coordination Result:"
echo "$RESULT" | jq '.result.content[0].text' | sed 's/^"//;s/"$//' | sed 's/\\n/\n/g'

# Extract session ID to check results later
COORD_SESSION=$(echo "$RESULT" | jq -r '.result.content[0].text' | grep -o 'session-[^`]*' | head -1)

if [ -n "$COORD_SESSION" ]; then
  echo -e "\n⏱️  Waiting 30 seconds for coordination to complete..."
  sleep 30
  
  # Check the session status
  echo -e "\n📋 Checking coordination results..."
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
  
  # Check if content was published
  echo -e "\n📂 Checking published content..."
  if [ -d "data/published_content" ]; then
    ls -la data/published_content/
    if [ "$(ls -A data/published_content/)" ]; then
      echo -e "\n📄 Content found! Latest file:"
      LATEST_FILE=$(ls -t data/published_content/ | head -1)
      echo "File: $LATEST_FILE"
      echo "Content preview:"
      head -20 "data/published_content/$LATEST_FILE"
    else
      echo "❌ No published content files found"
    fi
  else
    echo "❌ Published content directory doesn't exist"
  fi
else
  echo "❌ Could not extract coordination session ID"
fi

echo -e "\n✅ Publishing test complete!"