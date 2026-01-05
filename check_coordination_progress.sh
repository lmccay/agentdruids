#!/bin/bash

echo "🔍 Checking coordination session progress..."

# Initialize session and capture session ID
echo "Initializing MCP session..."
SESSION_RESPONSE=$(curl -i -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }')

# Extract session ID from header
SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "Session ID: $SESSION_ID"

# Check the coordination session
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0", 
    "id": 3, 
    "method": "tools/call",
    "params": {
      "name": "get_coordination_session",
      "arguments": {
        "session_id": "session-1762028237437-cd32f4f6"
      }
    }
  }'