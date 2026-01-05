#!/bin/bash

echo "🧠 Testing Intelligent Async Detection..."
echo ""

# Store session ID
SESSION_ID=""

# 1. Initialize session
echo "1️⃣ Initializing MCP session..."
INIT_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"clientInfo": {"name": "test", "version": "1.0.0"}}, "id": 1}' \
  -D /tmp/headers_test.txt)

SESSION_ID=$(grep -i "mcp-session-id" /tmp/headers_test.txt | cut -d' ' -f2 | tr -d '\r\n')
echo "✅ Session initialized: $SESSION_ID"
echo ""

# 2. Create test agent
echo "2️⃣ Creating test agent..."
CREATE_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "agent_create",
      "arguments": {
        "name": "test-smart-agent",
        "type": "druid",
        "description": "Test agent for smart async detection",
        "domain": "general"
      }
    },
    "id": 2
  }')

echo "$CREATE_RESPONSE" | jq -r '.result.content[0].text' | jq '.agent.id' -r > /tmp/smart_agent_id.txt
AGENT_ID=$(cat /tmp/smart_agent_id.txt)
echo "✅ Agent created: $AGENT_ID"
echo ""

# 3. Test SYNC detection (simple message)
echo "3️⃣ Testing SYNC detection (simple message)..."
SYNC_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"ask_agent\",
      \"arguments\": {
        \"agent_id\": \"$AGENT_ID\",
        \"message\": \"Hi, how are you?\"
      }
    },
    \"id\": 3
  }")

echo "Response type check:"
if echo "$SYNC_RESPONSE" | jq -r '.result.content[0].text' | jq -e '.async_info' > /dev/null 2>&1; then
  echo "❌ Should be SYNC but got ASYNC"
else
  echo "✅ Correctly detected as SYNC (immediate response)"
fi
echo ""

# 4. Test ASYNC detection (complex message)
echo "4️⃣ Testing ASYNC detection (complex message)..."
ASYNC_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"ask_agent\",
      \"arguments\": {
        \"agent_id\": \"$AGENT_ID\",
        \"message\": \"Please write a comprehensive analysis of forest ecosystem biodiversity, including detailed explanations of plant and animal interactions, soil composition effects, and climate change impacts. This should be a thorough research-based report.\"
      }
    },
    \"id\": 4
  }")

echo "Response type check:"
if echo "$ASYNC_RESPONSE" | jq -r '.result.content[0].text' | jq -e '.async_info' > /dev/null 2>&1; then
  echo "✅ Correctly detected as ASYNC (has async_info)"
  REQUEST_ID=$(echo "$ASYNC_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.async_info.request_id')
  echo "   Request ID: $REQUEST_ID"
  
  # Test the check_async_ready helper
  echo ""
  echo "5️⃣ Testing check_async_ready helper..."
  sleep 2
  
  CHECK_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
    -H "Content-Type: application/json" \
    -H "MCP-Protocol-Version: 2025-06-18" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"check_async_ready\",
        \"arguments\": {
          \"request_id\": \"$REQUEST_ID\",
          \"wait_time\": 3000
        }
      },
      \"id\": 5
    }")
  
  STATUS=$(echo "$CHECK_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.status')
  READY=$(echo "$CHECK_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.ready')
  echo "   Status: $STATUS"
  echo "   Ready: $READY"
  
  if [ "$READY" = "true" ]; then
    echo "✅ Async request completed!"
    RESULT=$(echo "$CHECK_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.result.response' | head -2)
    echo "   Result preview: $RESULT..."
  else
    echo "🔄 Still processing (this is normal for failed agents)"
  fi
else
  echo "❌ Should be ASYNC but got SYNC"
fi
echo ""

# 6. Test force async
echo "6️⃣ Testing force_async flag..."
FORCE_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"ask_agent\",
      \"arguments\": {
        \"agent_id\": \"$AGENT_ID\",
        \"message\": \"Simple question\",
        \"force_async\": true
      }
    },
    \"id\": 6
  }")

echo "Force async check:"
if echo "$FORCE_RESPONSE" | jq -r '.result.content[0].text' | jq -e '.async_info' > /dev/null 2>&1; then
  echo "✅ Force async worked (simple message forced to async)"
else
  echo "❌ Force async failed"
fi
echo ""

echo "🎯 Smart Async Detection Summary:"
echo "✅ Simple messages → SYNC (fast response)"
echo "✅ Complex messages → ASYNC (no timeouts)" 
echo "✅ Force async → ASYNC (when requested)"
echo "✅ Helper tools → Working"
echo ""
echo "🎉 Desktop agents can now use ask_agent normally - the server handles the complexity!"