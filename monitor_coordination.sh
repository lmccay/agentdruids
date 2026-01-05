#!/bin/bash

echo "🔍 Real-time Coordination Monitoring"

# Start log monitoring in background
docker logs druids-mcp-server -f &
LOG_PID=$!

# Initialize session
SESSION_ID=$(curl -s -i http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session: $SESSION_ID"

# Start coordination
echo "Starting coordination..."
curl -s http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Write a simple tagline: Make it Green!"
      }
    },
    "id": 2
  }' > /dev/null

echo "Monitoring for 60 seconds..."
sleep 60

# Stop monitoring
kill $LOG_PID 2>/dev/null

echo -e "\n📂 Published content check:"
ls -la data/published_content/ 2>/dev/null || echo "No directory found"