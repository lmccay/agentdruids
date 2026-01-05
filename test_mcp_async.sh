#!/bin/bash

echo "🧪 Testing MCP Async Workflow with curl..."
echo ""

# Store session ID
SESSION_ID=""

# 1. Initialize session
echo "1️⃣ Initializing MCP session..."
INIT_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"clientInfo": {"name": "test", "version": "1.0.0"}}, "id": 1}' \
  -D /tmp/headers.txt)

SESSION_ID=$(grep -i "mcp-session-id" /tmp/headers.txt | cut -d' ' -f2 | tr -d '\r\n')
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
        "name": "test-writer-async",
        "type": "druid",
        "description": "Test agent for async workflow",
        "domain": "creative_writing"
      }
    },
    "id": 2
  }')

echo "✅ Agent created:"
echo "$CREATE_RESPONSE" | jq -r '.result.content[0].text' | jq '.agent.id' -r > /tmp/agent_id.txt
AGENT_ID=$(cat /tmp/agent_id.txt)
echo "   Agent ID: $AGENT_ID"
echo ""

# 3. Start async request
echo "3️⃣ Starting async agent conversation..."
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
        \"message\": \"Please write a short story about a magical forest\"
      }
    },
    \"id\": 3
  }")

echo "✅ Async request started:"
echo "$ASYNC_RESPONSE" | jq -r '.result.content[0].text' | jq '.request_id' -r > /tmp/request_id.txt
REQUEST_ID=$(cat /tmp/request_id.txt)
echo "   Request ID: $REQUEST_ID"
echo ""

# 4. Monitor progress
echo "4️⃣ Monitoring async request progress..."
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
      \"id\": $((3 + i))
    }")
  
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.status')
  echo "   Status: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ Request completed!"
    echo ""
    echo "5️⃣ Final Result:"
    echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.result.response' | head -3
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Request failed"
    echo "$STATUS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.error'
    break
  fi
  
  sleep 2
done
echo ""

# 6. List async results
echo "6️⃣ Listing async results for agent..."
LIST_RESPONSE=$(curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"list_async_results\",
      \"arguments\": {
        \"agent_id\": \"$AGENT_ID\"
      }
    },
    \"id\": 20
  }")

echo "✅ Async results count:"
echo "$LIST_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.count'
echo ""

echo "🎉 Async workflow test completed!"