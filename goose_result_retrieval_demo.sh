#!/bin/bash

# Working Demo: How Goose Gets Final Results from Druids
# =====================================================

echo "🔍 How MCP Clients Like Goose Get Final Results"
echo "==============================================="
echo ""

MCP_URL="http://localhost:3003/mcp"

# Initialize session
echo "🔧 1. Initialize MCP session"
echo "----------------------------"
init_response=$(curl -i -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1.0","capabilities":{},"clientInfo":{"name":"goose","version":"1.0"}}}')

session_id=$(echo "$init_response" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "✅ Session established: $session_id"

if [ -z "$session_id" ]; then
    echo "❌ Failed to get session ID"
    exit 1
fi

# Start coordination
echo ""
echo "🚀 2. Start coordination project"  
echo "--------------------------------"
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
                "request":"Create a brief executive summary of AI ethics considerations for enterprise adoption",
                "max_agents":2,
                "timeout_minutes":3
            }
        }
    }')

echo "Coordination response: $coord_response"
coordination_id=$(echo "$coord_response" | jq -r '.result.content[0].text' | jq -r '.session_id' 2>/dev/null)
echo "✅ Coordination started: $coordination_id"

if [ -z "$coordination_id" ]; then
    echo "❌ Failed to start coordination"
    exit 1
fi

# Monitor progress
echo ""
echo "⏳ 3. Monitor coordination progress"
echo "-----------------------------------"
echo "Waiting 60 seconds for coordination to complete..."

for i in {1..6}; do
    sleep 10
    echo "   ⏱️  Checking progress... ($((i*10)) seconds)"
    
    status_response=$(curl -s -X POST "$MCP_URL" \
        -H "Content-Type: application/json" \
        -H "Mcp-Session-Id: $session_id" \
        -d "{
            \"jsonrpc\":\"2.0\",
            \"id\":$((i+3)),
            \"method\":\"tools/call\",
            \"params\":{
                \"name\":\"get_coordination_session\",
                \"arguments\":{
                    \"session_id\":\"$coordination_id\"
                }
            }
        }")
    
    status=$(echo "$status_response" | jq -r '.result.content[0].text' | jq -r '.status' 2>/dev/null)
    tasks_completed=$(echo "$status_response" | jq -r '.result.content[0].text' | jq -r '.tasks_completed' 2>/dev/null)
    
    echo "   📊 Status: $status, Tasks completed: $tasks_completed"
    
    if [ "$status" = "completed" ]; then
        echo "   ✅ Coordination completed!"
        break
    fi
done

# Get final results
echo ""
echo "📋 4. Get final results"
echo "----------------------"
final_response=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Mcp-Session-Id: $session_id" \
    -d "{
        \"jsonrpc\":\"2.0\",
        \"id\":10,
        \"method\":\"tools/call\",
        \"params\":{
            \"name\":\"get_coordination_session\",
            \"arguments\":{
                \"session_id\":\"$coordination_id\"
            }
        }
    }")

echo "📄 FINAL RESULT:"
echo "================"
final_content=$(echo "$final_response" | jq -r '.result.content[0].text' | jq -r '.final_result.integratedContent // .final_result.summary // "Content not yet available"' 2>/dev/null)
echo "$final_content"

echo ""
echo "📊 RESULT METADATA:"
echo "==================="
echo "$final_response" | jq -r '.result.content[0].text' | jq '{
    session_id,
    status,
    participant_count,
    tasks_completed,
    final_result_available: (.final_result != null)
}' 2>/dev/null || echo "Metadata not available"

# Summary for Goose users
echo ""
echo "✅ KEY TAKEAWAYS FOR GOOSE USERS:"
echo "=================================="
echo ""
echo "🎯 Primary Method: Use get_coordination_session"
echo "   • Contains final_result.integratedContent (the actual deliverable)"
echo "   • Contains final_result.summary (executive summary)"  
echo "   • Contains all metadata and status information"
echo ""
echo "🔄 Workflow:"
echo "   1. coordinate_project → start coordination"
echo "   2. get_coordination_session → monitor progress"  
echo "   3. final_result.integratedContent → get deliverable"
echo ""
echo "📦 The final result contains the actual work product that agents produced!"
echo "💡 For long-running tasks, the system automatically handles async processing."