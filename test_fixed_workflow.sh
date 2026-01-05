#!/bin/bash

echo "🚀 Testing Fixed MCP Coordination Workflow"
echo "=" | head -c 50; echo ""

MCP_URL="http://localhost:3003"

# Function to call MCP tool
call_tool() {
    local tool_name="$1"
    local args="$2"
    
    echo ""
    echo "🔧 Calling tool: $tool_name"
    echo "📋 Arguments: $args"
    
    response=$(curl -s -X POST "$MCP_URL/mcp" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": \"test-$(date +%s)\",
            \"method\": \"tools/call\",
            \"params\": {
                \"name\": \"$tool_name\",
                \"arguments\": $args
            }
        }")
    
    echo "✅ Response:"
    echo "$response" | jq -r '.result.content[0].text // .error // .result' 2>/dev/null || echo "$response"
    
    # Extract specific values for next steps
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
}

# Check if server is running
echo "🔍 Checking if MCP server is running..."
if ! curl -s "$MCP_URL/health" > /dev/null; then
    echo "❌ MCP server not accessible at $MCP_URL"
    exit 1
fi
echo "✅ MCP server is running"

# Step 1: Create agent team
echo ""
echo "📝 Step 1: Creating agent team..."
call_tool "create_agent_team" '{
    "team_purpose": "writing a collaborative article on AI in Healthcare",
    "team_size": 3
}'

# Extract agent IDs for next step (manual for demo)
# In real use, you'd parse the JSON response properly
echo ""
echo "⚠️  Note: For the demo, please manually copy the agent IDs from above"
echo "   and update the next step with the actual IDs returned."

# Step 2: Create coordinator
echo ""
echo "🧠 Step 2: Creating coordinator..."
call_tool "create_coordinator" '{
    "name": "Healthcare Article Coordinator",
    "description": "A collaborative coordinator for creating comprehensive articles about AI applications in healthcare",
    "coordination_style": "collaborative"
}'

echo ""
echo "📋 Next steps (run manually with actual IDs):"
echo "1. Copy the agent IDs from Step 1"
echo "2. Copy the coordinator ID from Step 2" 
echo "3. Run start_coordination with those IDs"
echo ""
echo "Example command:"
echo 'curl -X POST http://localhost:3003/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":\"test\",\"method\":\"tools/call\",\"params\":{\"name\":\"start_coordination\",\"arguments\":{\"coordinator_id\":\"COORDINATOR_ID_HERE\",\"participant_ids\":[\"AGENT_ID_1\",\"AGENT_ID_2\",\"AGENT_ID_3\"],\"scenario_prompt\":\"Collaborate to write a comprehensive 1500-word article about AI in Healthcare.\"}}}"'