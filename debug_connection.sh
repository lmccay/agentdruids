#!/bin/bash

# Debug Connection Behavior
echo "🔍 Debugging MCP Connection Issues"
echo "================================="

# Test with netcat to see raw connection behavior
echo ""
echo "1. Testing raw TCP connection behavior..."
echo "---------------------------------------"

# Start netcat in background to capture raw traffic
timeout 10s nc -l 3005 &
NC_PID=$!

echo "Netcat listening on port 3005 (PID: $NC_PID)"

# Test our current server behavior
echo ""
echo "2. Testing current MCP server with timeout..."
echo "--------------------------------------------"

# Use timeout to see if connection hangs
timeout 5s curl -v -X POST "http://localhost:3003/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {"tools": {}},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }'

CURL_EXIT_CODE=$?
echo ""
echo "Curl exit code: $CURL_EXIT_CODE"

if [ $CURL_EXIT_CODE -eq 124 ]; then
  echo "⚠️  Connection timed out - this might indicate hanging connection"
elif [ $CURL_EXIT_CODE -eq 0 ]; then
  echo "✅ Connection completed normally"
else
  echo "❌ Connection failed with code: $CURL_EXIT_CODE"
fi

# Clean up netcat
kill $NC_PID 2>/dev/null || true

echo ""
echo "3. Testing persistent connection simulation..."
echo "--------------------------------------------"

# Test if we can make multiple requests on same connection (HTTP/1.1 keep-alive)
curl -v --http1.1 -X POST "http://localhost:3003/mcp" \
  -H "Connection: keep-alive" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize", 
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {"tools": {}},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }' 2>&1 | grep -E "(Connection|Keep-Alive|Transfer-Encoding)"