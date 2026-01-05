#!/bin/bash

set -e

BASE_URL="http://localhost:3003/mcp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Testing Complete Agent Discovery in Coordination${NC}"
echo "=============================================="

# Initialize session and capture session ID
echo -e "\n${YELLOW}1. Initializing MCP session...${NC}"
RESPONSE=$(curl -s -i -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }')

SESSION_ID=$(echo "$RESPONSE" | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
  echo -e "${RED}Failed to get session ID${NC}"
  echo "Response: $RESPONSE"
  exit 1
fi

echo -e "${GREEN}Session ID: $SESSION_ID${NC}"

# Test coordination scenario with agent name discovery
echo -e "\n${YELLOW}2. Testing coordination with agent discovery...${NC}"
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "start_coordination",
      "arguments": {
        "coordinator_id": "colleen",
        "participant_ids": ["pierre-robert", "lucas"],
        "scenario_prompt": "Create a comprehensive analysis of Jar Jar Binks from Star Wars. Pierre Robert should analyze the character development and narrative impact, while Lucas should focus on the visual design and cinematic techniques. Travel to '\''a galaxy far, far away'\'' realm for this analysis. Each agent should contribute their expertise and then collaborate to create a unified final analysis.",
        "final_output_format": "integrated_analysis",
        "collaboration_style": "delegated"
      }
    }
  }' | jq '.'

echo -e "\n${GREEN}Agent discovery test completed!${NC}"
