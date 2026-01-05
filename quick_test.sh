#!/bin/bash

# Quick Publishing Test
echo "🚀 Quick Publishing Test"

# Initialize session
SESSION_ID=$(curl -s -i http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session: $SESSION_ID"

# Request simple coordination  
echo "Requesting: 'Write a tagline for sustainable coffee cups'"

RESULT=$(curl -s http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Write a tagline for sustainable coffee cups"
      }
    },
    "id": 2
  }')

echo "Started coordination..."
COORD_SESSION=$(echo "$RESULT" | jq -r '.result.content[0].text' | grep -o 'session-[^`]*' | head -1)
echo "Coordination session: $COORD_SESSION"

echo "Waiting 45 seconds for completion..."
sleep 45

echo "Checking for published content..."
ls -la data/published_content/
if [ "$(ls -A data/published_content/ 2>/dev/null)" ]; then
  echo "✅ Content found!"
  LATEST_FILE=$(ls -t data/published_content/ | head -1)
  echo "Latest: $LATEST_FILE"
  echo "Preview:"
  head -10 "data/published_content/$LATEST_FILE"
else
  echo "❌ No content published yet"
fi