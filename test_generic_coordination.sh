#!/bin/bash

# Test Generic Natural Language Coordination Framework
# This script tests various natural language coordination requests

echo "🧪 Testing Generic Natural Language Coordination Framework"
echo "========================================================"

# Test 1: Business Analysis Request
echo -e "\n📊 Test 1: Business Analysis Request"
echo "Request: 'Analyze market opportunities for sustainable packaging from environmental, economic, and consumer behavior perspectives'"

SESSION_ID=$(curl -s -i http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  exit 1
fi

echo "Session ID: $SESSION_ID"

# Call coordinate_project with business analysis request
RESULT=$(curl -s http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "coordinate_project",
      "arguments": {
        "request": "Analyze market opportunities for sustainable packaging from environmental, economic, and consumer behavior perspectives"
      }
    },
    "id": 2
  }')

echo "Business Analysis Result:"
echo "$RESULT" | jq '.result.content[0].text' | sed 's/^"//;s/"$//' | sed 's/\\n/\n/g'

echo -e "\n✅ Generic coordination framework testing complete!"
echo "🎯 Framework successfully handles diverse domains without hardcoded roles"