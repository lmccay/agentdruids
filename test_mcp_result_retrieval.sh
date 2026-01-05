#!/bin/bash

# Test script demonstrating how MCP clients like Goose can retrieve final results
# from coordination sessions and scenario executions

echo "🔍 Testing MCP Result Retrieval for External Clients"
echo "====================================================="

# MCP server endpoint
MCP_URL="http://localhost:3003/mcp"

# Function to make MCP calls
make_mcp_call() {
    local method="$1"
    local params="$2"
    local session_id="$3"
    
    local headers="-H 'Content-Type: application/json'"
    if [ -n "$session_id" ]; then
        headers="$headers -H 'Mcp-Session-Id: $session_id'"
    fi
    
    curl -s $headers -X POST "$MCP_URL" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}

echo ""
echo "🔧 Step 1: Initialize MCP session"
echo "--------------------------------"
response=$(make_mcp_call "initialize" '{"protocolVersion":"1.0","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}')
echo "Response: $response"
session_id=$(echo "$response" | grep -o '"Mcp-Session-Id: [^"]*"' | cut -d' ' -f2 | tr -d '"' 2>/dev/null || echo "")
echo "Session ID: $session_id"

echo ""
echo "🛠️  Step 2: List available tools"
echo "-------------------------------"
tools_response=$(make_mcp_call "tools/list" '{}' "$session_id")
echo "Available tools for result retrieval:"
echo "$tools_response" | jq -r '.result[] | select(.name | test("get_|list_")) | "  - " + .name + ": " + .description'

echo ""
echo "📊 Step 3: Start a coordination session to have results to retrieve"
echo "-------------------------------------------------------------------"
coord_response=$(make_mcp_call "tools/call" '{
    "name": "coordinate_project",
    "arguments": {
        "request": "Create a brief technical analysis of cloud migration strategies",
        "max_agents": 3,
        "timeout_minutes": 5
    }
}' "$session_id")

echo "Coordination response: $coord_response"
coordination_session_id=$(echo "$coord_response" | jq -r '.result.content[0].text' | jq -r '.session_id' 2>/dev/null || echo "")
echo "Coordination Session ID: $coordination_session_id"

if [ -z "$coordination_session_id" ]; then
    echo "❌ Failed to start coordination session"
    exit 1
fi

echo ""
echo "⏳ Step 4: Wait for coordination to complete"
echo "-------------------------------------------"
echo "Waiting 60 seconds for coordination to complete..."
sleep 60

echo ""
echo "📋 Step 5: Get coordination session status"
echo "-----------------------------------------"
status_response=$(make_mcp_call "tools/call" "{
    \"name\": \"get_coordination_session\",
    \"arguments\": {
        \"session_id\": \"$coordination_session_id\"
    }
}" "$session_id")

echo "Session status:"
echo "$status_response" | jq '.result.content[0].text' | jq '.'

echo ""
echo "📖 Step 6: Get published content from coordination"
echo "------------------------------------------------"
content_response=$(make_mcp_call "tools/call" "{
    \"name\": \"get_published_content\",
    \"arguments\": {
        \"session_id\": \"$coordination_session_id\",
        \"content_type\": \"coordination\"
    }
}" "$session_id")

echo "Published content:"
echo "$content_response" | jq '.result.content[0].text' | jq '.'

echo ""
echo "📚 Step 7: List all available published content"
echo "----------------------------------------------"
list_response=$(make_mcp_call "tools/call" '{
    "name": "list_published_content",
    "arguments": {
        "content_type": "all",
        "limit": 10
    }
}' "$session_id")

echo "All published content:"
echo "$list_response" | jq '.result.content[0].text' | jq '.'

echo ""
echo "🎭 Step 8: Test scenario execution results"
echo "-----------------------------------------"
echo "First, let's create and execute a test scenario..."

create_scenario_response=$(make_mcp_call "tools/call" '{
    "name": "scenario_create",
    "arguments": {
        "name": "test-result-retrieval",
        "description": "Test scenario for result retrieval demo",
        "type": "collaboration"
    }
}' "$session_id")

echo "Create scenario response: $create_scenario_response"
scenario_id=$(echo "$create_scenario_response" | jq -r '.result.content[0].text' | jq -r '.id' 2>/dev/null || echo "")

if [ -n "$scenario_id" ]; then
    echo "Scenario ID: $scenario_id"
    
    echo "Executing scenario..."
    exec_response=$(make_mcp_call "tools/call" "{
        \"name\": \"scenario_execute\",
        \"arguments\": {
            \"scenarioId\": \"$scenario_id\"
        }
    }" "$session_id")
    
    echo "Execution response: $exec_response"
    execution_id=$(echo "$exec_response" | jq -r '.result.content[0].text' | jq -r '.executionId' 2>/dev/null || echo "")
    
    if [ -n "$execution_id" ]; then
        echo "Execution ID: $execution_id"
        
        echo "Waiting 30 seconds for execution to complete..."
        sleep 30
        
        echo ""
        echo "Getting scenario execution result..."
        exec_result_response=$(make_mcp_call "tools/call" "{
            \"name\": \"get_scenario_execution_result\",
            \"arguments\": {
                \"execution_id\": \"$execution_id\"
            }
        }" "$session_id")
        
        echo "Scenario execution result:"
        echo "$exec_result_response" | jq '.result.content[0].text' | jq '.'
    else
        echo "❌ Failed to get execution ID"
    fi
else
    echo "❌ Failed to create scenario"
fi

echo ""
echo "✅ Result Retrieval Test Complete!"
echo "=================================="
echo ""
echo "📝 Summary for MCP Clients (like Goose):"
echo ""
echo "1. Use 'coordinate_project' to start coordination"
echo "2. Use 'get_coordination_session' to check status and get session results"
echo "3. Use 'get_published_content' to retrieve published coordination content"
echo "4. Use 'list_published_content' to see all available results"
echo "5. Use 'get_scenario_execution_result' to get detailed scenario results"
echo ""
echo "🔗 All results include:"
echo "  - Full content/synthesis"
echo "  - Metadata (timestamps, participants, etc.)"
echo "  - Status information"
echo "  - Published locations"
echo ""
echo "📋 The final results contain the actual deliverables that agents produced!"