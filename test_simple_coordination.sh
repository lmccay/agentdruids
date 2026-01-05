#!/bin/bash

BASE_URL="http://localhost:3003/mcp"

echo "Testing simple coordination with log monitoring..."

# Initialize session
SESSION_ID=$(curl -s -i -X POST "$BASE_URL" \
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
  }' | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Session ID: $SESSION_ID"

# Test coordination with simpler scenario
echo -e "\nStarting coordination..."
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
        "coordinator_id": "built-in-coordinator",
        "participant_ids": ["colleen", "pierre-robert", "lucas"],
        "scenario_prompt": "Create a comprehensive analysis of Jar Jar Binks from Star Wars. Colleen should coordinate the team and travel to '\''a galaxy far, far away'\'' realm. Pierre Robert should analyze the character development and narrative impact, while Lucas should focus on the visual design and cinematic techniques. All agents should collaborate to create a unified final analysis.",
        "final_output_format": "integrated_analysis"
      }
    }
  }' | jq '.result.content[0].text' | jq -r '.'

