#!/bin/bash

# Test script for agent-to-agent communication via internal MCP tools
echo "🧪 Testing Agent-to-Agent Communication Tools"

# Check if services are running
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "❌ Main API not available. Please start the development environment first."
    exit 1
fi

echo "📋 Step 1: Creating a test agent with collaboration tools enabled..."

# Create an agent with collaboration tools
ANALYST_RESPONSE=$(curl -s -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Collaboration Test Agent",
    "type": "druid",
    "description": "A test agent that can use collaboration tools to interact with other agents",
    "capabilities": ["analysis", "communication", "collaboration"],
    "specialization": {
      "domain": "collaboration",
      "expertise": ["inter_agent_communication", "task_coordination"],
      "knowledgeNamespaces": ["collaboration_knowledge"],
      "maxConcurrentTasks": 5
    },
    "personality": {
      "traits": ["collaborative", "analytical"],
      "communicationStyle": "technical",
      "decisionMaking": "consensus-seeking"
    },
    "mcpTools": ["discover_agents", "message_agent", "delegate_task", "travel_to_realm"],
    "llmConfig": {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.7,
      "systemPrompt": "You are a collaborative agent that excels at working with other agents to accomplish complex tasks."
    }
  }')

AGENT_ID=$(echo "$ANALYST_RESPONSE" | jq -r '.data.id // .id')

if [ "$AGENT_ID" = "null" ] || [ -z "$AGENT_ID" ]; then
    echo "❌ Failed to create test agent"
    echo "Response: $ANALYST_RESPONSE"
    exit 1
fi

echo "✅ Created collaboration test agent: $AGENT_ID"

echo "📋 Step 2: Starting the agent..."
curl -s -X POST "http://localhost:3000/api/agents/$AGENT_ID/start" > /dev/null

echo "📋 Step 3: Testing agent prompt with tool usage..."

# Test the agent with a prompt that should trigger tool usage
EXECUTION_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/agents/$AGENT_ID/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I need to find other agents who can help me with data analysis tasks. Please discover available agents with analysis capabilities and then send a greeting message to one of them.",
    "temperature": 0.7
  }')

echo "📊 Agent Response:"
echo "$EXECUTION_RESPONSE" | jq -r '.data.response // .response' | head -20

echo ""
echo "🔧 Tool Calls (if any):"
echo "$EXECUTION_RESPONSE" | jq -r '.data.toolCalls // .toolCalls // "No tool calls found"'

echo ""
echo "⏱️  Execution Time:"
echo "$EXECUTION_RESPONSE" | jq -r '.data.executionTime // .executionTime // "Unknown"' | sed 's/$/ms/'

echo ""
echo "🧪 Test completed! The agent should have:"
echo "  1. Enhanced system prompt with collaboration tools"
echo "  2. Ability to call discover_agents tool"
echo "  3. Ability to call message_agent tool"
echo "  4. Tool execution results integrated into response"

echo ""
echo "🔍 Check the response above to see if tool calls were detected and executed."