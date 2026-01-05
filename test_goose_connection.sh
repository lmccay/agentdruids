#!/bin/bash

# Test Goose-style MCP Connection Sequence
echo "🦢 Testing Goose-Style MCP Connection"
echo "===================================="

MCP_URL="http://localhost:3003/mcp"

# Test 1: Initialize with exact Goose headers
echo ""
echo "1. Testing Initialize (Goose-style headers)..."
echo "----------------------------------------------"

INIT_RESPONSE=$(curl -v -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "User-Agent: Goose/1.0.0" \
  -d '{
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {
        "tools": {}
      },
      "clientInfo": {
        "name": "goose",
        "version": "1.0.0"
      }
    }
  }' 2>&1)

echo "$INIT_RESPONSE"

# Extract session ID from verbose output
SESSION_ID=$(echo "$INIT_RESPONSE" | grep -i "mcp-session-id:" | head -1 | cut -d' ' -f3 | tr -d '\r\n')

if [ -n "$SESSION_ID" ]; then
  echo ""
  echo "✅ Session ID: $SESSION_ID"
  
  # Test 2: Send initialized notification
  echo ""
  echo "2. Testing Initialized Notification..."
  echo "-------------------------------------"
  
  INIT_NOTIFY_RESPONSE=$(curl -v -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -H "User-Agent: Goose/1.0.0" \
    -d '{
      "jsonrpc": "2.0",
      "method": "initialized",
      "params": {}
    }' 2>&1)
  
  echo "$INIT_NOTIFY_RESPONSE"
  
else
  echo "❌ Failed to extract session ID"
fi

echo ""
echo "🔍 Testing Connection Behavior..."
echo "================================"
echo "Looking for connection close patterns or errors..."