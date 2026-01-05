#!/bin/bash

BASE_URL="http://localhost:3003/mcp"

echo "Checking coordination session status..."

# Initialize session
SESSION_ID=$(curl -s -i -X POST "$BASE_URL" \
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
  }' | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session ID: $SESSION_ID"

# Get coordination sessions
echo -e "\nActive coordination sessions:"
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_active_sessions",
      "arguments": {}
    }
  }' | jq '.result.content[0].text' | jq -r '.'

