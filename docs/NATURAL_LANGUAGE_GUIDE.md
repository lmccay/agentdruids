# Natural Language Guide for Druids Multi-Agent System

## Overview

This guide shows you how to interact with the Druids multi-agent system using natural language through any MCP-compatible desktop agent (like Goose, Claude Desktop, or other MCP clients).

**No JSON knowledge required!** Just talk to your desktop agent naturally, and it will handle the technical details.

## Prerequisites

1. **Druids System Running**: Ensure the Druids system is running locally on port 3003
2. **MCP-Compatible Desktop Agent**: Have Goose, Claude Desktop, or another MCP client installed
3. **MCP Connection**: Your desktop agent should be configured to connect to `http://localhost:3003/mcp`

## Step-by-Step Instructions

### Step 1: Start Your Desktop Agent Session

Open your MCP-compatible desktop agent and ensure it's connected to the Druids MCP server at `http://localhost:3003/mcp`.

### Step 2: Discover Available Agents

**What to say to your desktop agent:**
> "Show me what agents are available in the Druids system"

**What happens behind the scenes:**
- Your desktop agent calls the `list_available_agents` tool
- You'll see a formatted list of all agents with their types, statuses, and capabilities

**Expected response format:**
```
🤖 **Available Agents**

**Analytics Specialist** (agent_123456789_abc123)
- Type: worldtree
- Status: active
- Capabilities: knowledge, connection, synthesis, insight

**Content Writer** (agent_123456790_def456)
- Type: druid
- Status: active
- Capabilities: wisdom, guidance, problem-solving, communication
```

### Step 3: Create a Specialized Team (Optional)

**What to say to your desktop agent:**
> "Create a team of 3 agents specialized for content creation"

Or for other purposes:
> "Create a team for data analysis"
> "Set up a customer support team"
> "Build a development team of 4 agents"

**What happens behind the scenes:**
- Your desktop agent calls the `create_agent_team` tool
- The system automatically creates optimally configured agents for your specified purpose
- Agent types and capabilities are chosen based on the team purpose

**Expected response format:**
```
✅ Created team of 3 agents for **content creation**

- **content creation Team Member 1** (druid)
- **content creation Team Member 2** (elemental)  
- **content creation Team Member 3** (gaia)

Use 'create_collaboration' to start working with your new team!
```

### Step 4: Start a Collaboration

**What to say to your desktop agent:**
> "Start a collaboration to write a comprehensive guide about AI ethics and best practices"

For urgent tasks:
> "Start an urgent collaboration to analyze this customer feedback data and provide insights"

For specific agent types:
> "Create a collaboration using analytical agents to review our quarterly performance metrics"

**What happens behind the scenes:**
- Your desktop agent calls the `create_collaboration` tool
- The system creates a scenario and automatically assigns appropriate agents
- The scenario is automatically activated and execution begins immediately

**Expected response format:**
```
✅ Collaboration started successfully!

**Task:** Write a comprehensive guide about AI ethics and best practices
**Collaboration ID:** scenario_123456789_xyz789
**Execution ID:** exec_987654321_abc123

Use 'get_collaboration_status' to check progress and get results.
```

### Step 4b: Activate Draft Collaborations (If Needed)

Sometimes collaborations may be created in "draft" status. If you get an error saying a scenario is "not active for execution":

**What to say to your desktop agent:**
> "Activate collaboration scenario_123456789_xyz789"

**What happens behind the scenes:**
- Your desktop agent calls the `activate_collaboration` tool
- The scenario status changes from "draft" to "active"
- You can then execute the collaboration

**Expected response format:**
```
✅ Collaboration activated successfully!

**Collaboration:** Collaboration: Write a comprehensive guide about AI ethics...
**ID:** scenario_123456789_xyz789
**Status:** active

You can now execute this collaboration using 'scenario_execute' or start a new execution.
```

### Step 5: Assign Quick Tasks to Individual Agents

**What to say to your desktop agent:**
> "Ask an agent to summarize the key points from this document: [paste your content]"

With specific context:
> "Have an agent write a product description for our new software tool. Context: It's a project management application for remote teams."

With preferred agent:
> "Ask agent_123456789_abc123 to review this code and suggest improvements"

**What happens behind the scenes:**
- Your desktop agent calls the `assign_task` tool
- The system selects the best available agent automatically (unless you specify one)
- The task is executed immediately and results are returned

**Expected response format:**
```
✅ Task completed by agent **Analytics Specialist**

**Task:** Summarize the key points from this document

**Result:**
Based on the document provided, here are the key points:
1. [Agent's analysis and summary here]
2. [Additional insights]
3. [Conclusions and recommendations]
```

### Step 6: Have Conversations with Agents

**What to say to your desktop agent:**
> "Start a conversation with agent_123456789_abc123 about project planning strategies"

With context from previous conversations:
> "Continue my conversation with the content writer about the blog series we discussed earlier"

**What happens behind the scenes:**
- Your desktop agent calls the `ask_agent` tool
- You can have back-and-forth conversations with individual agents
- Context is preserved across conversation turns

**Expected response format:**
```
🤖 **Content Writer** responds:

I'd be happy to help you with project planning strategies! Based on my experience, I recommend starting with a clear scope definition and stakeholder alignment. What type of project are you planning, and what are your main challenges?
```

### Step 6b: Long-Running Async Conversations (Coming Soon)

For tasks that might take a long time and could timeout:

**What to say to your desktop agent:**
> "Start an async conversation with the agent to write a detailed 5000-word research report"

**What happens behind the scenes:**
- Your desktop agent calls the `ask_agent_async` tool
- You get back a request ID immediately
- The agent processes your request in the background
- You can check for results later without timing out

**Expected response format:**
```
🚀 **Async Request Started**

**Agent:** Research Specialist
**Request ID:** req_agent_123_1234567890_abc123
**Estimated Duration:** 60s
**Check Interval:** 5s

Use 'get_async_result' with this request ID to check progress and get results.
```

Then check results:
> "Check async result req_agent_123_1234567890_abc123"

```
📊 **Async Request Status**

**Request ID:** req_agent_123_1234567890_abc123
**Status:** COMPLETED
**Duration:** 45s

**Result:**
[Your detailed research report here...]
```

### Step 7: Monitor Progress and Get Status Updates

**What to say to your desktop agent:**
> "Check the status of my collaborations"

For detailed information:
> "Show me detailed progress on all my ongoing collaborations"

**What happens behind the scenes:**
- Your desktop agent calls the `get_collaboration_status` tool
- You get a summary of all active collaborations with progress information

**Expected response format:**
```
📊 **Collaboration Status**

**Collaboration: Write a comprehensive guide about AI ethics...**
- Status: active
- Type: collaboration
- Created: 2025-09-29T21:30:00Z
- Description: Write a comprehensive guide about AI ethics and best practices
- Execution Count: 1
- Success Rate: 100%

**Collaboration: Analyze customer feedback data...**
- Status: completed
- Type: collaboration  
- Created: 2025-09-29T20:15:00Z
- Execution Count: 1
- Success Rate: 100%
```

## Common Use Cases and Examples

### Content Creation Workflow
1. **"Create a content creation team"**
2. **"Start a collaboration to write a series of blog posts about sustainable technology"**
3. **"Check the progress of my blog post collaboration"**
4. **"Ask the lead writer about the tone and style for the series"**

### Data Analysis Workflow
1. **"Set up an analysis team with 2 agents"**
2. **"Start a collaboration to analyze our sales data and identify trends"**
3. **"Ask the analytics agent to explain the methodology they're using"**
4. **"Get status updates on the data analysis collaboration"**

### Customer Support Workflow
1. **"Create a customer support team"**
2. **"Have an agent draft a response to this customer complaint: [paste complaint]"**
3. **"Ask the support agent to suggest follow-up actions for this case"**

### Development/Technical Workflow
1. **"Build a development team of 4 agents"**
2. **"Start a collaboration to review our codebase and suggest improvements"**
3. **"Ask a technical agent to explain this error message and provide solutions"**

## Tips for Effective Natural Language Interaction

### 1. Be Specific but Natural
- ✅ **Good**: "Create a team for analyzing financial data and generating quarterly reports"
- ❌ **Too vague**: "Make some agents"

### 2. Provide Context When Helpful
- ✅ **Good**: "Ask an agent to write a product description for our project management app targeting remote teams"
- ❌ **Missing context**: "Write a product description"

### 3. Use Urgency Indicators
- **"Start an urgent collaboration to..."** (high priority, 5-minute timeout)
- **"Create a standard collaboration to..."** (medium priority, 10-minute timeout)  
- **"Begin a low-priority collaboration to..."** (low priority, 20-minute timeout)

### 4. Reference Agents by Name or ID
- **"Ask agent_123456789_abc123 about..."**
- **"Continue my conversation with the Content Writer about..."**

### 5. Check Status Regularly
- **"Show me collaboration status"** (quick overview)
- **"Give me detailed progress on all collaborations"** (comprehensive view)

## Troubleshooting Common Issues

### "No agents available"
- **Solution**: Create a team first or check if agents need to be activated
- **Say**: "Create a team for [your purpose]" or "Show me all agents including inactive ones"

### "Agent not responding"
- **Solution**: The agent might be inactive or busy
- **Say**: "Show me available agents" to check status

### "Collaboration failed to start"  
- **Solution**: Try with different urgency level or simpler task description
- **Say**: "Start a low-priority collaboration to [simpler version of task]"

### "Scenario not active for execution"
- **Solution**: The collaboration needs to be activated before execution
- **Say**: "Activate collaboration [scenario_id]" where scenario_id is the ID from the error message

### "Request timeout" or "Agent takes too long to respond"
- **Cause**: LLM processing can take 10-30+ seconds, causing desktop agent timeouts
- **Current Solution**: Try shorter, simpler requests
- **Coming Soon**: Use async agent tools:
  - **Say**: "Start an async conversation with agent to [your long task]"
  - **Then**: "Check async result [request_id]" to get results without timeout

### "I'm sorry, but I can't assist with that request"
- **Cause**: LLM content safety guardrails triggered by certain words
- **Solution**: Rephrase using alternative words:
  - Use "treasure" instead of "secret" 
  - Use "discovery" instead of "secret"
  - Use "ancient artifact" instead of "ancient secret"
- **Example**: Instead of "find an ancient secret", say "find an ancient treasure"

## Advanced Features

### Capability-Based Agent Discovery
> "Show me agents that can help with writing"
> "List agents with analytical capabilities"

### Team Size Optimization
> "Create an optimal-sized team for software development"
> "Build a small team of 2 agents for quick content review"

### Conversation Context Preservation
> "Continue our discussion about the marketing strategy we talked about earlier"

---

## Summary

With these natural language commands, you can:
- ✅ Create specialized agent teams automatically
- ✅ Start multi-agent collaborations with simple descriptions
- ✅ Assign individual tasks to agents instantly  
- ✅ Have conversations with agents about your work
- ✅ Monitor progress and get status updates
- ✅ All without writing any JSON or technical configuration!

The Druids system handles all the complex orchestration behind the scenes while you focus on your actual work through natural conversation with your desktop agent.