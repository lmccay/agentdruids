#!/bin/bash

echo "🚀 Testing Fixed MCP Coordination Workflow with Session Management"
echo "=" | head -c 60; echo ""

MCP_URL="http://localhost:3003"

# Function to call MCP tool
call_mcp() {
    local method="$1"
    local params="$2"
    
    echo ""
    echo "🔧 Calling MCP method: $method"
    echo "📋 Params: $params"
    
    response=$(curl -s -X POST "$MCP_URL/mcp" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": \"test-$(date +%s)\",
            \"method\": \"$method\",
            \"params\": $params
        }")
    
    echo "✅ Response:"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
    
    # Extract specific values for next steps
    if [[ "$method" == "tools/call" ]]; then
        local tool_name=$(echo "$params" | jq -r '.name')
        if [[ "$tool_name" == "create_agent_team" ]]; then
            AGENT_IDS=$(echo "$response" | jq -r '.result.agent_ids // empty' 2>/dev/null)
            echo "🎯 Extracted Agent IDs: $AGENT_IDS"
        elif [[ "$tool_name" == "create_coordinator" ]]; then
            COORDINATOR_ID=$(echo "$response" | jq -r '.result.coordinator_id // empty' 2>/dev/null)
            echo "🎯 Extracted Coordinator ID: $COORDINATOR_ID"
        elif [[ "$tool_name" == "start_coordination" ]]; then
            SESSION_ID=$(echo "$response" | jq -r '.result.session_id // empty' 2>/dev/null)
            echo "🎯 Extracted Session ID: $SESSION_ID"
        fi
    fi
}

# Check if server is running
echo "🔍 Checking if MCP server is running..."
if ! curl -s "$MCP_URL/health" > /dev/null; then
    echo "❌ MCP server not accessible at $MCP_URL"
    exit 1
fi
echo "✅ MCP server is running"

# Step 0: Initialize MCP session
echo ""
echo "🎬 Step 0: Initializing MCP session..."
call_mcp "initialize" '{
    "protocolVersion": "2025-06-18",
    "capabilities": {
        "tools": {}
    },
    "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
    }
}'

# Step 1: Create agent team
echo ""
echo "📝 Step 1: Creating agent team..."
call_mcp "tools/call" '{
    "name": "create_agent_team",
    "arguments": {
        "team_purpose": "writing a collaborative article on AI in Healthcare",
        "team_size": 3
    }
}'

if [[ -n "$AGENT_IDS" ]]; then
    echo "✅ Successfully created agents with IDs: $AGENT_IDS"
    
    # Step 2: Create coordinator
    echo ""
    echo "🧠 Step 2: Creating coordinator..."
    call_mcp "tools/call" '{
        "name": "create_coordinator",
        "arguments": {
            "name": "Healthcare Article Coordinator",
            "description": "A collaborative coordinator for creating comprehensive articles about AI applications in healthcare",
            "coordination_style": "collaborative"
        }
    }'
    
    if [[ -n "$COORDINATOR_ID" ]]; then
        echo "✅ Successfully created coordinator with ID: $COORDINATOR_ID"
        
        # Convert agent IDs array to JSON format
        AGENT_IDS_JSON=$(echo "$AGENT_IDS" | sed 's/\[//g' | sed 's/\]//g' | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')
        
        echo ""
        echo "🚀 Step 3: Starting coordination..."
        call_mcp "tools/call" "{
            \"name\": \"start_coordination\",
            \"arguments\": {
                \"coordinator_id\": \"$COORDINATOR_ID\",
                \"participant_ids\": [$AGENT_IDS_JSON],
                \"scenario_prompt\": \"Collaborate to write a comprehensive 1500-word article about AI in Healthcare. Include sections on: current applications, benefits and challenges, future prospects, and ethical considerations. Each agent should contribute their expertise while the coordinator ensures coherence and quality.\"
            }
        }"
        
        if [[ -n "$SESSION_ID" ]]; then
            echo ""
            echo "🎉 SUCCESS! Full coordination workflow completed!"
            echo "- Agent IDs: $AGENT_IDS"
            echo "- Coordinator ID: $COORDINATOR_ID"  
            echo "- Session ID: $SESSION_ID"
        else
            echo "❌ Failed to start coordination"
        fi
    else
        echo "❌ Failed to create coordinator"
    fi
else
    echo "❌ Failed to create agent team"
fi