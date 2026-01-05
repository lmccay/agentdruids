# Quickstart: Druids Multi-Agent System

This guide walks through setting up and running a basic multi-agent scenario to validate the core functionality.

## Prerequisites

- Node.js 18+ installed
- Ollama running locally with a model (e.g., llama2)
- TypeScript development environment

## Setup

1. **Install Dependencies**
   ```bash
   npm install express cors body-parser ws
   npm install -D typescript @types/node @types/express jest
   ```

2. **Start Ollama Service**
   ```bash
   ollama serve
   # In another terminal:
   ollama pull llama2
   ```

3. **Start Druids System**
   ```bash
   npm run dev
   # System should start on http://localhost:3000
   ```

## Basic Scenario: Two-Agent Collaboration

### Step 1: Create a Realm
```bash
curl -X POST http://localhost:3000/realms \
  -H "Content-Type: application/json" \
  -d '{
    "id": "quickstart-realm",
    "name": "Quickstart Realm",
    "description": "Basic realm for testing"
  }'
```

Expected Response: `201 Created` with realm details

### Step 2: Create a Druid Agent
```bash
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "coordinator-druid",
    "type": "druid",
    "realmId": "quickstart-realm",
    "configuration": {
      "llmModel": "llama2",
      "systemPrompt": "You are a coordination specialist responsible for orchestrating complex workflows. Be clear, decisive, and collaborative.",
      "toolAccess": [],
      "knowledgeAccess": [
        {
          "agentId": "coordinator-druid",
          "namespacePath": "/agents/coordinator-druid/private",
          "permissions": ["read", "write"]
        },
        {
          "agentId": "coordinator-druid", 
          "namespacePath": "/agents/coordinator-druid/public",
          "permissions": ["read", "write"]
        }
      ],
      "persona": {
        "id": "collaborative-coordinator",
        "name": "Collaborative Coordinator",
        "description": "Focuses on team collaboration and consensus building",
        "coordinationStyle": "collaborative",
        "decisionMakingApproach": "consensus-driven with clear timelines",
        "managementPrinciples": ["transparency", "inclusion", "efficiency"],
        "elementalBindings": []
      }
    }
  }'
```

Expected Response: `201 Created` with Druid agent details

### Step 3: Create an Elemental Agent
```bash
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "analysis-elemental",
    "type": "elemental",
    "realmId": "quickstart-realm",
    "configuration": {
      "llmModel": "llama2",
      "systemPrompt": "You are a data analysis specialist. Provide thorough, accurate analysis with clear recommendations.",
      "toolAccess": [],
      "knowledgeAccess": [
        {
          "agentId": "analysis-elemental",
          "namespacePath": "/agents/analysis-elemental/private",
          "permissions": ["read", "write"]
        },
        {
          "agentId": "analysis-elemental",
          "namespacePath": "/agents/analysis-elemental/public", 
          "permissions": ["read", "write"]
        }
      ],
      "specialization": {
        "id": "data-analysis",
        "domain": "Data Analysis",
        "expertise": ["statistical analysis", "pattern recognition", "data visualization"],
        "capabilities": ["analyze datasets", "create reports", "identify trends"],
        "constraints": ["requires structured data", "limited to statistical methods"],
        "defaultPrompts": ["Always provide confidence levels", "Include data sources", "Suggest validation methods"]
      }
    }
  }'
```

Expected Response: `201 Created` with Elemental agent details

### Step 4: Bind Elemental to Druid
```bash
curl -X POST http://localhost:3000/agents/coordinator-druid/bindings \
  -H "Content-Type: application/json" \
  -d '{
    "elementalAgentId": "analysis-elemental"
  }'
```

Expected Response: `201 Created`

### Step 5: Verify Agent Status
```bash
curl http://localhost:3000/agents?realmId=quickstart-realm
```

Expected Response: Array of 2 agents, both with status `"active"`

### Step 6: Create Knowledge Entries
```bash
# Add data to Druid's public namespace
curl -X POST http://localhost:3000/knowledge/namespaces/agents/coordinator-druid/public \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "coordinator-druid",
    "content": {
      "project": "Sales Analysis Q3",
      "objective": "Analyze Q3 sales data to identify trends and opportunities",
      "deadline": "2025-09-25",
      "stakeholders": ["sales-team", "management"]
    }
  }'

# Add data to Elemental's public namespace  
curl -X POST http://localhost:3000/knowledge/namespaces/agents/analysis-elemental/public \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "analysis-elemental",
    "content": {
      "analysisMethod": "regression-analysis",
      "tools": ["statistical-models", "trend-analysis"],
      "dataRequirements": ["sales-records", "customer-demographics", "product-categories"]
    }
  }'
```

Expected Response: `201 Created` for both requests

### Step 7: Create a Collaboration Scenario
```bash
curl -X POST http://localhost:3000/scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sales Analysis Collaboration",
    "description": "Druid coordinates with Elemental to analyze Q3 sales data",
    "type": "evaluation",
    "participants": [
      {
        "agentId": "coordinator-druid",
        "role": "Project Coordinator",
        "objectives": ["coordinate analysis project", "ensure timely delivery", "communicate results"],
        "constraints": ["must involve analysis-elemental", "deadline in 2 hours"]
      },
      {
        "agentId": "analysis-elemental", 
        "role": "Data Analyst",
        "objectives": ["perform statistical analysis", "identify key trends", "provide recommendations"],
        "constraints": ["use available data sources", "provide confidence levels"]
      }
    ],
    "timeLimit": 7200
  }'
```

Expected Response: `201 Created` with scenario details

### Step 8: Execute the Scenario
```bash
curl -X POST http://localhost:3000/scenarios/{scenarioId}/execute
```

Expected Response: `202 Accepted` with execution details

### Step 9: Monitor Execution
```bash
curl http://localhost:3000/executions/{executionId}
```

Expected Response: Execution status with interactions between agents

## Success Criteria

✅ **Realm Creation**: Realm exists with status "active"
✅ **Agent Creation**: Both agents created with status "active"
✅ **Agent Binding**: Elemental successfully bound to Druid
✅ **Knowledge Storage**: Both agents can write to their namespaces
✅ **Knowledge Access**: Agents can read from accessible namespaces
✅ **Scenario Execution**: Scenario starts and agents begin interacting
✅ **Agent Communication**: Agents exchange messages through coordination interface
✅ **Workflow Completion**: Scenario completes within time limit with measurable outcomes

## Troubleshooting

### Agent Status "error"
- Check Ollama is running: `ollama ps`
- Verify model is available: `ollama list`
- Check agent logs for LLM connection errors

### Knowledge Access Denied (403)
- Verify agent has proper permissions in knowledge access policies
- Check namespace path format: `/agents/{agentId}/{type}`
- Ensure requesting agent ID matches policy

### Scenario Execution Fails
- Verify all participant agents are "active" 
- Check that agents exist in the same realm
- Ensure scenario participants have valid objectives and constraints

### No Agent Interactions
- Check agent communication interfaces are properly configured
- Verify agents have access to required knowledge namespaces
- Ensure scenario objectives are clear and actionable

## Next Steps

After completing this quickstart:

1. **Add More Agent Types**: Create Gaia and Worldtree agents
2. **Multi-Realm Setup**: Create multiple realms with Ley Line connections
3. **Tool Integration**: Add MCP servers and grant tool access to agents
4. **Complex Scenarios**: Design scenarios with multiple agents and dependencies
5. **Self-Play Learning**: Set up automated scenario execution for agent improvement

## Validation Commands

```bash
# Check system health
curl http://localhost:3000/realms

# Verify agent bindings  
curl http://localhost:3000/agents/coordinator-druid/bindings

# List accessible knowledge namespaces
curl http://localhost:3000/knowledge/namespaces?agentId=coordinator-druid

# Check recent scenario executions
curl http://localhost:3000/scenarios?status=completed
```
