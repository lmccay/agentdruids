#!/bin/bash

echo "🧪 Real-time Publishing Test"

# Start monitoring logs in background
docker logs druids-mcp-server -f &
LOG_PID=$!

# Initialize session
SESSION_ID=$(curl -s -i http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session: $SESSION_ID"

# Request coordination  
echo "Starting coordination: 'Create a slogan for recycled paper'"

curl -s http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Create a slogan for recycled paper"
      }
    },
    "id": 2
  }' > /dev/null

echo "Waiting 60 seconds..."
sleep 60

# Stop log monitoring
kill $LOG_PID 2>/dev/null

# Check results
echo -e "\n📂 Published content check:"
ls -la data/published_content/
if [ "$(ls -A data/published_content/ 2>/dev/null)" ]; then
  echo "✅ Success! Files found:"
  ls -la data/published_content/
else
  echo "❌ No files found"
fi