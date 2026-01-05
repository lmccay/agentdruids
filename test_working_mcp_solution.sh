#!/bin/bash

echo "🎉 FIXED MCP Coordination Workflow - Working Solution"
echo "=" | head -c 60; echo ""

MCP_URL="http://localhost:3003"
SESSION_ID=""

# Function to call MCP method
call_mcp() {
    local method="$1"
    local params="$2"
    
    echo ""
    echo "🔧 Calling MCP method: $method"
    
    # Include session ID header if we have one
    local headers="-H Content-Type:application/json"
    if [[ -n "$SESSION_ID" ]]; then
        headers="$headers -H Mcp-Session-Id:$SESSION_ID"
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
        echo "🎯 Session ID: $SESSION_ID"
    fi
    
    echo "✅ Response received"
    return 0
}

# Function to extract latest agent IDs with specific purpose
get_latest_agent_ids() {
    local purpose="$1"
    local count="$2"
    
    response=$(curl -s -X POST "$MCP_URL/mcp" \
        -H "Content-Type: application/json" \
        -H "Mcp-Session-Id: $SESSION_ID" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": \"list-$(date +%s)\",
            \"method\": \"tools/call\",
            \"params\": {
                \"name\": \"agent_list\",
                \"arguments\": {}
            }
        }")
    
    # Extract agent IDs that match our purpose (most recent ones)
    local agent_ids=$(echo "$response" | jq -r '.result.content[0].text' | jq -r ".[] | select(.specialization == \"$purpose\") | .id" | tail -n $count | tr '\n' ' ')
    echo "$agent_ids"
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
        "name": "fixed-workflow-client",
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

# Step 2: Get the agent IDs that were just created
echo ""
echo "🔍 Step 2: Retrieving created agent IDs..."
AGENT_IDS_RAW=$(get_latest_agent_ids "writing a collaborative article on AI in Healthcare" 3)
AGENT_IDS_ARRAY=($AGENT_IDS_RAW)

if [[ ${#AGENT_IDS_ARRAY[@]} -eq 0 ]]; then
    echo "❌ No agents found with the specified purpose"
    exit 1
fi

echo "🎯 Found ${#AGENT_IDS_ARRAY[@]} agent IDs: ${AGENT_IDS_ARRAY[*]}"

# Step 3: Create coordinator
echo ""
echo "🧠 Step 3: Creating coordinator..."
call_mcp "tools/call" '{
    "name": "create_coordinator",
    "arguments": {
        "name": "Healthcare Article Coordinator",
        "description": "A collaborative coordinator for creating comprehensive articles about AI applications in healthcare",
        "coordination_style": "collaborative"
    }
}'

# Extract coordinator ID from response
COORDINATOR_ID=$(echo "$response" | jq -r '.result.content[0].text' | jq -r '.id // empty' 2>/dev/null)

if [[ -z "$COORDINATOR_ID" || "$COORDINATOR_ID" == "null" ]]; then
    echo "❌ Failed to extract coordinator ID"
    exit 1
fi

echo "🎯 Coordinator ID: $COORDINATOR_ID"

# Step 4: Start coordination with the actual agent IDs
echo ""
echo "🚀 Step 4: Starting coordination..."

# Build the participant IDs JSON array
PARTICIPANTS_JSON="["
for i in "${!AGENT_IDS_ARRAY[@]}"; do
    if [[ $i -gt 0 ]]; then
        PARTICIPANTS_JSON="$PARTICIPANTS_JSON,"
    fi
    PARTICIPANTS_JSON="$PARTICIPANTS_JSON\"${AGENT_IDS_ARRAY[$i]}\""
done
PARTICIPANTS_JSON="$PARTICIPANTS_JSON]"

echo "🔄 Using participant IDs: $PARTICIPANTS_JSON"

call_mcp "tools/call" "{
    \"name\": \"start_coordination\",
    \"arguments\": {
        \"coordinator_id\": \"$COORDINATOR_ID\",
        \"participant_ids\": $PARTICIPANTS_JSON,
        \"scenario_prompt\": \"Collaborate to write a comprehensive 1500-word article about AI in Healthcare. Include sections on: current applications, benefits and challenges, future prospects, and ethical considerations. Each agent should contribute their expertise while the coordinator ensures coherence and quality.\"
    }
}"

# Extract coordination session ID
COORD_SESSION_ID=$(echo "$response" | jq -r '.result.content[0].text' | jq -r '.session_id // empty' 2>/dev/null)

if [[ -n "$COORD_SESSION_ID" && "$COORD_SESSION_ID" != "null" ]]; then
    echo ""
    echo "🎉 SUCCESS! Full coordination workflow completed!"
    echo "Summary:"
    echo "- MCP Session ID: $SESSION_ID"
    echo "- Agent IDs: ${AGENT_IDS_ARRAY[*]}"
    echo "- Coordinator ID: $COORDINATOR_ID"  
    echo "- Coordination Session ID: $COORD_SESSION_ID"
    echo ""
    echo "✅ The agent ID mismatch issue has been RESOLVED!"
    echo "✅ MCP coordination workflow is fully functional!"
    echo ""
    echo "🎯 Users can now:"
    echo "   1. Create agent teams with create_agent_team"
    echo "   2. Get agent IDs using agent_list"
    echo "   3. Create coordinators with create_coordinator"
    echo "   4. Start coordination with start_coordination"
    echo ""
    echo "📖 See MCP_WRITING_TEAM_GUIDE.md for user instructions"
else
    echo "❌ Failed to start coordination - check coordination response"
    echo "Response: $response"
fi

# Cleanup
rm -f /tmp/mcp_headers.txt