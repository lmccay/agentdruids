#!/bin/bash

echo "🚀 Testing Fixed MCP Coordination Workflow with Proper Session Management"
echo "=" | head -c 70; echo ""

MCP_URL="http://localhost:3003"
SESSION_ID=""

# Function to call MCP method
call_mcp() {
    local method="$1"
    local params="$2"
    
    echo ""
    echo "🔧 Calling MCP method: $method"
    echo "📋 Params: $params"
    
    # Include session ID header if we have one
    local headers="-H Content-Type:application/json"
    if [[ -n "$SESSION_ID" ]]; then
        headers="$headers -H Mcp-Session-Id:$SESSION_ID"
        echo "🔑 Using Session ID: $SESSION_ID"
    fi
    
    # Make the request and capture both response and headers
    response=$(curl -s -D /tmp/mcp_headers.txt -X POST "$MCP_URL/mcp" \
        $headers \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": \"test-$(date +%s)\",
            \"method\": \"$method\",
            \"params\": $params
        }")
    
    # Extract session ID from response headers if this was an initialize call
    if [[ "$method" == "initialize" ]]; then
        SESSION_ID=$(grep -i "mcp-session-id" /tmp/mcp_headers.txt | cut -d' ' -f2 | tr -d '\r\n')
        echo "🎯 Extracted Session ID: $SESSION_ID"
    fi
    
    echo "✅ Response:"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
    
    # Extract specific values for coordination workflow
    if [[ "$method" == "tools/call" ]]; then
        local tool_name=$(echo "$params" | jq -r '.name')
        if [[ "$tool_name" == "create_agent_team" ]]; then
            # Parse the JSON from the content text field
            local content_text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
            if [[ -n "$content_text" && "$content_text" != "null" ]]; then
                AGENT_IDS=$(echo "$content_text" | jq -r '.agent_ids // empty' 2>/dev/null)
                echo "🎯 Extracted Agent IDs: $AGENT_IDS"
            fi
        elif [[ "$tool_name" == "create_coordinator" ]]; then
            local content_text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
            if [[ -n "$content_text" && "$content_text" != "null" ]]; then
                COORDINATOR_ID=$(echo "$content_text" | jq -r '.coordinator_id // empty' 2>/dev/null)
                echo "🎯 Extracted Coordinator ID: $COORDINATOR_ID"
            fi
        elif [[ "$tool_name" == "start_coordination" ]]; then
            local content_text=$(echo "$response" | jq -r '.result.content[0].text // empty' 2>/dev/null)
            if [[ -n "$content_text" && "$content_text" != "null" ]]; then
                COORD_SESSION_ID=$(echo "$content_text" | jq -r '.session_id // empty' 2>/dev/null)
                echo "🎯 Extracted Coordination Session ID: $COORD_SESSION_ID"
            fi
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

if [[ -z "$SESSION_ID" ]]; then
    echo "❌ Failed to get session ID from initialization"
    exit 1
fi

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

if [[ -n "$AGENT_IDS" && "$AGENT_IDS" != "null" ]]; then
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
    
    if [[ -n "$COORDINATOR_ID" && "$COORDINATOR_ID" != "null" ]]; then
        echo "✅ Successfully created coordinator with ID: $COORDINATOR_ID"
        
        # Convert agent IDs array to properly formatted JSON
        # Remove brackets and quotes, then rebuild as JSON array
        AGENT_IDS_CLEAN=$(echo "$AGENT_IDS" | sed 's/\[//g' | sed 's/\]//g' | sed 's/"//g')
        IFS=',' read -ra AGENT_ARRAY <<< "$AGENT_IDS_CLEAN"
        AGENT_IDS_JSON=""
        for i in "${AGENT_ARRAY[@]}"; do
            if [[ -n "$AGENT_IDS_JSON" ]]; then
                AGENT_IDS_JSON="$AGENT_IDS_JSON,\"$(echo $i | xargs)\""
            else
                AGENT_IDS_JSON="\"$(echo $i | xargs)\""
            fi
        done
        
        echo "🔄 Formatted Agent IDs for coordination: [$AGENT_IDS_JSON]"
        
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
        
        if [[ -n "$COORD_SESSION_ID" && "$COORD_SESSION_ID" != "null" ]]; then
            echo ""
            echo "🎉 SUCCESS! Full coordination workflow completed!"
            echo "Summary:"
            echo "- MCP Session ID: $SESSION_ID"
            echo "- Agent IDs: $AGENT_IDS"
            echo "- Coordinator ID: $COORDINATOR_ID"  
            echo "- Coordination Session ID: $COORD_SESSION_ID"
            echo ""
            echo "✅ The agent ID mismatch issue has been FIXED!"
            echo "✅ MCP coordination workflow is working correctly!"
        else
            echo "❌ Failed to start coordination"
        fi
    else
        echo "❌ Failed to create coordinator"
    fi
else
    echo "❌ Failed to create agent team"
fi

# Cleanup
rm -f /tmp/mcp_headers.txt