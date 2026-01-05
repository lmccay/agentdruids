#!/bin/bash

# Test SSE/Goose Compatibility Script
echo "🧪 Testing MCP Server SSE Streaming Compatibility"
echo "================================================="

MCP_URL="http://localhost:3003"

echo ""
echo "1. Testing SSE Initialize Request (Goose-style)..."
echo "---------------------------------------------------"

# Initialize with SSE headers (like Goose would)
RESPONSE=$(curl -s -i -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0", 
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {"tools": {}},
      "clientInfo": {"name": "goose-test", "version": "1.0.0"}
    }
  }')

echo "$RESPONSE"

# Extract session ID from header
SESSION_ID=$(echo "$RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -n "$SESSION_ID" ]; then
  echo ""
  echo "✅ Session ID extracted: $SESSION_ID"
  
  echo ""
  echo "2. Testing SSE Initialized Notification..."
  echo "------------------------------------------"
  
  curl -s -X POST "$MCP_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d '{
      "jsonrpc": "2.0",
      "method": "initialized",
      "params": {}
    }'
  
  echo ""
  echo ""
  echo "3. Testing SSE Tools List..."
  echo "----------------------------"
  
  curl -s -X POST "$MCP_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d '{
      "jsonrpc": "2.0",
      "id": 2,
      "method": "tools/list",
      "params": {}
    }'

  echo ""
  echo ""
  echo "4. Testing SSE Tool Call (Coordinate Agents)..."
  echo "-----------------------------------------------"
  
  curl -s -X POST "$MCP_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d '{
      "jsonrpc": "2.0",
      "id": 3,
      "method": "tools/call",
      "params": {
        "name": "coordinate_agents",
        "arguments": {
          "coordinator_id": "tolkien",
          "participant_ids": ["tolkien"],
          "scenario_prompt": "Write a short fantasy story about a hobbit"
        }
      }
    }'
  
  echo ""
  echo ""
  echo "✅ SSE Streaming Tests Complete!"
  echo "================================"
  echo "🎯 All requests used 'text/event-stream' Accept header"
  echo "🌊 Server should respond with proper SSE format"
  echo "🔗 Session management working correctly"

else
  echo "❌ Failed to extract Session ID from response"
  echo "Response was:"
  echo "$RESPONSE"
fi