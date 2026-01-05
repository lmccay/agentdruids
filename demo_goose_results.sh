#!/bin/bash

# Quick demonstration of result retrieval for MCP clients like Goose

echo "🔍 MCP Result Retrieval Demo for Goose Desktop"
echo "=============================================="

MCP_URL="http://localhost:3003/mcp"

# Initialize session
echo "🔧 Initializing MCP session..."
init_response=$(curl -i -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1.0","capabilities":{},"clientInfo":{"name":"goose-test","version":"1.0"}}}')

session_id=$(echo "$init_response" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "Session ID: $session_id"

if [ -z "$session_id" ]; then
    echo "❌ Failed to get session ID"
    exit 1
fi

# List result retrieval tools
echo ""
echo "📋 Available result retrieval tools:"
echo "-----------------------------------"
curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Mcp-Session-Id: $session_id" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | \
    jq -r '.result[] | select(.name | test("get_|list_")) | "✅ " + .name + " - " + .description'

echo ""
echo "🎯 Key Tools for Getting Results:"
echo ""
echo "1. 📖 get_published_content - Get final results from coordination"
echo "2. 📚 list_published_content - See all available results"  
echo "3. 📊 get_coordination_session - Get session status and results"
echo "4. 🎭 get_scenario_execution_result - Get scenario execution details"

# Start a quick coordination for demo
echo ""
echo "🚀 Starting a quick coordination to demonstrate..."
coord_response=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Mcp-Session-Id: $session_id" \
    -d '{
        "jsonrpc":"2.0",
        "id":3,
        "method":"tools/call",
        "params":{
            "name":"coordinate_project",
            "arguments":{
                "request":"Write a brief one-paragraph summary of the benefits of microservices architecture",
                "max_agents":2,
                "timeout_minutes":3
            }
        }
    }')

coordination_id=$(echo "$coord_response" | jq -r '.result.content[0].text' | jq -r '.session_id' 2>/dev/null)

echo "Coordination started: $coordination_id"

if [ -n "$coordination_id" ]; then
    echo ""
    echo "⏳ Waiting 45 seconds for coordination to complete..."
    sleep 45
    
    echo ""
    echo "📖 Getting final results..."
    result_response=$(curl -s -X POST "$MCP_URL" \
        -H "Content-Type: application/json" \
        -H "Mcp-Session-Id: $session_id" \
        -d "{
            \"jsonrpc\":\"2.0\",
            \"id\":4,
            \"method\":\"tools/call\",
            \"params\":{
                \"name\":\"get_published_content\",
                \"arguments\":{
                    \"session_id\":\"$coordination_id\",
                    \"content_type\":\"coordination\"
                }
            }
        }")
    
    echo "📄 Final Result:"
    echo "=================="
    echo "$result_response" | jq -r '.result.content[0].text' | jq -r '.content // .coordinator_summary // .error'
    
    echo ""
    echo "📋 Session Details:"
    echo "=================="
    session_response=$(curl -s -X POST "$MCP_URL" \
        -H "Content-Type: application/json" \
        -H "Mcp-Session-Id: $session_id" \
        -d "{
            \"jsonrpc\":\"2.0\",
            \"id\":5,
            \"method\":\"tools/call\",
            \"params\":{
                \"name\":\"get_coordination_session\",
                \"arguments\":{
                    \"session_id\":\"$coordination_id\"
                }
            }
        }")
    
    echo "$session_response" | jq -r '.result.content[0].text' | jq '{
        session_id,
        status,
        tasks_completed,
        final_result: .final_result.integratedContent // "No final result yet"
    }'
fi

echo ""
echo "✅ How Goose Can Get Results:"
echo "============================"
echo ""
echo "1. Start coordination with: coordinate_project"
echo "2. Monitor progress with: get_coordination_session"  
echo "3. Get final content with: get_published_content"
echo "4. Browse all results with: list_published_content"
echo ""
echo "🎯 The final results contain the actual work products from the agents!"