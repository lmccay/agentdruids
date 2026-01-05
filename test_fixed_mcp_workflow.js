#!/usr/bin/env node

/**
 * Test the fixed MCP coordination workflow
 * This mimics how an external MCP client would use the system
 */

const fetch = require('node-fetch');

const MCP_SERVER_URL = 'http://localhost:3001';

class MCPClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessionId = null;
  }

  async callTool(name, arguments_obj) {
    console.log(`\n🔧 Calling tool: ${name}`);
    console.log(`📋 Arguments:`, JSON.stringify(arguments_obj, null, 2));
    
    const response = await fetch(`${this.baseUrl}/tools/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.random().toString(36).substr(2, 9),
        method: 'tools/call',
        params: {
          name,
          arguments: arguments_obj
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    
    if (result.error) {
      console.log(`❌ Tool Error:`, result.error);
      return { error: result.error };
    }

    console.log(`✅ Tool Response:`, JSON.stringify(result.result, null, 2));
    return result.result;
  }
}

async function testWorkflow() {
  const client = new MCPClient(MCP_SERVER_URL);

  try {
    console.log('🚀 Testing Fixed MCP Coordination Workflow');
    console.log('=' .repeat(50));

    // Step 1: Create agent team
    console.log('\n📝 Step 1: Creating agent team...');
    const teamResult = await client.callTool('create_agent_team', {
      team_purpose: 'writing a collaborative article on AI in Healthcare',
      team_size: 3
    });

    if (teamResult.error) {
      console.log('❌ Failed to create team');
      return;
    }

    const agentIds = teamResult.agent_ids;
    console.log(`🎯 Agent IDs created: ${agentIds.join(', ')}`);

    // Step 2: Create coordinator
    console.log('\n🧠 Step 2: Creating coordinator...');
    const coordinatorResult = await client.callTool('create_coordinator', {
      name: 'Healthcare Article Coordinator',
      description: 'A collaborative coordinator for creating comprehensive articles about AI applications in healthcare',
      coordination_style: 'collaborative'
    });

    if (coordinatorResult.error) {
      console.log('❌ Failed to create coordinator');
      return;
    }

    const coordinatorId = coordinatorResult.coordinator_id;
    console.log(`🎯 Coordinator ID: ${coordinatorId}`);

    // Step 3: Start coordination with real agent IDs
    console.log('\n🚀 Step 3: Starting coordination...');
    const coordinationResult = await client.callTool('start_coordination', {
      coordinator_id: coordinatorId,
      participant_ids: agentIds,
      scenario_prompt: 'Collaborate to write a comprehensive 1500-word article about AI in Healthcare. Include sections on: current applications, benefits and challenges, future prospects, and ethical considerations. Each agent should contribute their expertise while the coordinator ensures coherence and quality.'
    });

    if (coordinationResult.error) {
      console.log('❌ Failed to start coordination');
      console.log('Error details:', coordinationResult.error);
      return;
    }

    const sessionId = coordinationResult.session_id;
    console.log(`🎯 Coordination Session ID: ${sessionId}`);

    // Step 4: Check session status
    console.log('\n📊 Step 4: Checking coordination session...');
    const sessionResult = await client.callTool('get_coordination_session', {
      session_id: sessionId
    });

    if (sessionResult.error) {
      console.log('❌ Failed to get session status');
      return;
    }

    console.log('✅ Coordination workflow completed successfully!');
    console.log('\n🎉 Summary:');
    console.log(`- Created ${agentIds.length} agents`);
    console.log(`- Created coordinator: ${coordinatorId}`);
    console.log(`- Started coordination session: ${sessionId}`);
    console.log(`- Status: ${sessionResult.status}`);

  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

// Run the test
testWorkflow().catch(console.error);