#!/bin/bash

echo "🧪 Testing Complete MCP Async Workflow (with agent activation)..."
echo ""

# Store session ID
SESSION_ID=""

# 1. Initialize session
echo "1️⃣ Initializing MCP session..."
INIT_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"clientInfo": {"name": "test", "version": "1.0.0"}}, "id": 1}' \
  -D /tmp/headers2.txt)

SESSION_ID=$(grep -i "mcp-session-id" /tmp/headers2.txt | cut -d' ' -f2 | tr -d '\r\n')
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
        "name": "test-writer-async-2",
        "type": "druid",
        "description": "Test agent for async workflow",
        "domain": "creative_writing"
      }
    },
    "id": 2
  }')

echo "$CREATE_RESPONSE" | jq -r '.result.content[0].text' | jq '.agent.id' -r > /tmp/agent_id2.txt
AGENT_ID=$(cat /tmp/agent_id2.txt)
echo "✅ Agent created: $AGENT_ID"
echo ""

# 3. Activate agent
echo "3️⃣ Activating agent..."
ACTIVATE_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"agent_start\",
      \"arguments\": {
        \"agent_id\": \"$AGENT_ID\"
      }
    },
    \"id\": 3
  }")

echo "✅ Agent activated"
echo ""

# 4. Start async request
echo "4️⃣ Starting async agent conversation..."
ASYNC_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"ask_agent_async\",
      \"arguments\": {
        \"agent_id\": \"$AGENT_ID\",
        \"message\": \"Write a very short haiku about coding\"
      }
    },
    \"id\": 4
  }")

echo "$ASYNC_RESPONSE" | jq -r '.result.content[0].text' | jq '.request_id' -r > /tmp/request_id2.txt
REQUEST_ID=$(cat /tmp/request_id2.txt)
echo "✅ Async request started: $REQUEST_ID"
echo ""

# 5. Monitor progress
echo "5️⃣ Monitoring async request progress..."
for i in {1..10}; do
  echo "   📊 Check $i/10..."
  
  STATUS_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
    -H "Content-Type: application/json" \
    -H "MCP-Protocol-Version: 2025-06-18" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"get_async_result\",
        \"arguments\": {
          \"request_id\": \"$REQUEST_ID\"
        }
      },
      \"id\": $((4 + i))
    }")
  
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.status')
  echo "   Status: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ Request completed!"
    echo ""
    echo "6️⃣ Final Result:"
    RESPONSE=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.result.response')
    echo "   Response: $RESPONSE"
    
    DURATION=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.metadata.actualDuration')
    echo "   Duration: ${DURATION}ms"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Request failed"
    echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.error'
    break
  fi
  
  sleep 2
done
echo ""

echo "🎉 Complete async workflow test completed!"