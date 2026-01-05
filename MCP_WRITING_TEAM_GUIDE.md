# Druids Writing Team Coordination Guide

## For MCP Clients (Goose Desktop, Claude Desktop, etc.)

This guide shows how to use the Druids coordination system to create collaborative writing projects with multiple AI agents.

## Simple Writing Team Setup

## Quick Start Guide

**Step 1: Create Writing Team**
```
Create a team of specialized writing agents for your topic:

"create_agent_team team_purpose='writing a collaborative article on AI in Healthcare' team_size=4"
```
*Note the agent IDs returned - you'll need them for Step 3!*

**Step 2: Create Coordinator** 
```
Create a coordination agent to manage the writing collaboration:

"create_coordinator name='Healthcare Article Coordinator' description='A collaborative coordinator for creating comprehensive articles about AI applications in healthcare' coordination_style='collaborative'"
```
*Note the coordinator_id returned for Step 3!*

**Step 3: Start Coordination**
```
Begin the collaborative writing process using the agent IDs from Step 1:

"start_coordination coordinator_id='[coordinator_id_from_step_2]' participant_ids=['agent_id_1','agent_id_2','agent_id_3','agent_id_4'] scenario_prompt='Collaborate to write a comprehensive 2000-word article about AI in Healthcare. Include sections on: current applications, benefits and challenges, future prospects, and ethical considerations. Each agent should contribute their expertise while the coordinator ensures coherence and quality.'"
```

## Advanced Example

For a complete writing session, you can use this narrative approach:

```
I need to create a comprehensive article about AI in Healthcare. 

First, create me a team of 4 specialized writing agents:
"Create a team focused on writing a collaborative article on AI in Healthcare"

Then create a coordinator to manage this writing project:
"Create a coordinator called 'Healthcare Article Coordinator' with collaborative style"

Finally, start the coordination with the agent IDs you created:
"Start coordination with [coordinator_id] using agents [agent_id_1, agent_id_2, agent_id_3, agent_id_4] to write a 2000-word article about AI in Healthcare covering current applications, benefits, challenges, future prospects, and ethics"
```

Please ensure the coordination includes:

**Step 3: Monitor and Retrieve Results**
```
Monitor the coordination session progress and retrieve the final collaborative writing when complete.
```

## Example Usage Scripts

### Blog Post Creation
```
"I need a team of AI writers to collaborate on a blog post about 'The Future of Remote Work'. 

Please coordinate a writing team that will:
- Research current remote work trends
- Draft compelling introduction and conclusion
- Create main body sections covering technology, culture, and economics
- Synthesize everything into a cohesive 1000-word blog post

Use collaborative coordination style with 3-4 participant agents."
```

### Technical Documentation
```
"Coordinate a writing team to create technical documentation for 'Setting up a CI/CD Pipeline'.

The team should collaborate to produce:
- Clear step-by-step instructions
- Code examples and configurations
- Troubleshooting section
- Best practices recommendations

Target audience: intermediate developers. Length: 2000-3000 words."
```

### Creative Story Writing
```
"I want a collaborative creative writing session for a short story about 'AI agents discovering consciousness'.

Please coordinate writers to:
- Develop character profiles and plot outline
- Write different story sections or perspectives
- Create dialogue and descriptive passages
- Synthesize into a cohesive 1500-word short story

Use collaborative style to blend different creative voices."
```

## Advanced Coordination Options

### Specialized Writing Roles
```
"Create a writing coordination with specialized roles:
- Content Strategist: overall structure and messaging
- Technical Writer: accurate technical details
- Copy Editor: style, tone, and flow
- Creative Writer: engaging narrative elements

Topic: '[YOUR TOPIC]'
Output: '[DESIRED FORMAT AND LENGTH]'"
```

### Multi-Format Content
```
"Coordinate a team to create multi-format content about '[TOPIC]':
- Executive summary (200 words)
- Detailed article (1500 words)
- Social media posts (3 variations)
- Key takeaway bullets

Ensure consistent messaging across all formats."
```

## What to Expect

1. **Coordination Setup** (30 seconds): The system finds suitable coordinators and writing agents
2. **Task Delegation** (1-2 minutes): The coordinator analyzes your prompt and assigns specific tasks to each writer
3. **Collaborative Writing** (3-10 minutes): Multiple agents work simultaneously on different aspects
4. **Synthesis** (1-2 minutes): The coordinator combines all contributions into the final piece
5. **Final Output**: You receive a polished, collaborative writing that incorporates multiple AI perspectives

## Tips for Better Results

- **Be specific** about the desired output format, length, and audience
- **Mention tone and style** preferences (formal, casual, technical, creative)
- **Include key points** you want covered if you have specific requirements
- **Specify coordination style**: 
  - "collaborative" for balanced input from all writers
  - "consultative" for coordinator-led with writer input
  - "directive" for coordinator-controlled assignment

## Sample Full Request

```
"Please use the Druids coordination system to create a collaborative article about 'Sustainable Urban Development'. 

I want a team of 3-4 AI writers coordinated by a collaborative coordinator to produce:
- A 2000-word article suitable for urban planning professionals
- Clear sections covering: current challenges, innovative solutions, case studies, and future outlook
- Professional tone with supporting data and examples
- Executive summary at the beginning

Monitor the coordination process and provide me with the final synthesized article when complete."
```

The system will handle all the coordination logistics automatically - you just need to provide the writing prompt and requirements!