#!/usr/bin/env node

/**
 * Test MCP Coordination System
 * Demonstrates full coordination support through the MCP Server
 */

const BASE_URL = 'http://localhost:3003'; // MCP Server port
let sessionId = null; // Store session ID for subsequent requests

async function makeRequest(method, endpoint, data) {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  // Add session ID header if we have one
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }
  
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    });

    // Capture session ID from response headers
    const mcpSessionId = response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id');
    if (mcpSessionId) {
      sessionId = mcpSessionId;
      console.log(`   Captured session ID: ${sessionId}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ ${method} ${endpoint} failed:`, error.message);
    throw error;
  }
}

async function mcpCall(tool, args = {}) {
  const request = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: tool,
      arguments: args
    },
    id: Math.random().toString(36).substring(7)
  };

  const response = await makeRequest('POST', '/mcp', request);
  
  if (response.error) {
    throw new Error(`MCP Error: ${response.error.message}`);
  }
  
  // Handle MCP content format
  if (response.result && response.result.content && response.result.content.length > 0) {
    const content = response.result.content[0];
    if (content.type === 'text') {
      try {
        // Try to parse as JSON
        return JSON.parse(content.text);
      } catch (e) {
        // Return as string if not JSON
        return content.text;
      }
    }
  }
  
  // Fallback to raw result
  return response.result;
}

async function demonstrateMCPCoordination() {
  console.log('🎯 MCP COORDINATION SYSTEM DEMONSTRATION');
  console.log('=========================================\n');

  try {
    // Step 0: Initialize MCP session
    console.log('🔧 Step 0: Initializing MCP session...');
    const initRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'coordination-test-client',
          version: '1.0.0'
        }
      },
      id: 1
    };
    
    await makeRequest('POST', '/mcp', initRequest);
    console.log('✅ MCP session initialized\n');

    // Step 1: List available coordinators
    console.log('📋 Step 1: Listing available coordinators...');
    const coordinatorsList = await mcpCall('list_coordinators');
    
    if (coordinatorsList.coordinators && coordinatorsList.coordinators.length > 0) {
      console.log(`Found ${coordinatorsList.total_count} coordinators:`);
      coordinatorsList.coordinators.forEach(coord => {
        console.log(`  - ${coord.name} (${coord.id}): ${coord.coordination_style} style, ${coord.active_scenarios} active scenarios`);
      });
    } else {
      console.log('No coordinators found. Creating a new one...');
      
      // Create a coordinator
      const newCoordinator = await mcpCall('create_coordinator', {
        name: 'MCP Test Coordinator',
        description: 'Test coordinator created via MCP for demonstrating coordination capabilities',
        coordination_style: 'collaborative',
        max_participants: 5
      });
      
      console.log(`✅ Created coordinator: ${newCoordinator.name} (${newCoordinator.id})`);
      coordinatorsList.coordinators = [newCoordinator];
    }

    const coordinator = coordinatorsList.coordinators[0];
    console.log(`\n🎯 Selected coordinator: ${coordinator.name}\n`);

    // Step 2: List available agents
    console.log('📋 Step 2: Listing available participant agents...');
    const agentsList = await mcpCall('agent_list');
    
    if (!agentsList || agentsList.length === 0) {
      throw new Error('No agents available for coordination');
    }
    
    const agents = agentsList;
    const eligibleAgents = agents.filter(agent => 
      agent.status === 'active' && 
      agent.id !== coordinator.id &&
      ['druid', 'elemental'].includes(agent.type)
    );

    console.log(`Found ${eligibleAgents.length} eligible participant agents:`);
    eligibleAgents.slice(0, 5).forEach(agent => {
      console.log(`  - ${agent.name} (${agent.id}): ${agent.type}`);
    });

    if (eligibleAgents.length < 2) {
      throw new Error('Need at least 2 participant agents for coordination demo');
    }

    // Select participants
    const participants = eligibleAgents.slice(0, Math.min(3, eligibleAgents.length)).map(agent => agent.id);
    console.log(`\n👥 Selected participants: ${participants.join(', ')}\n`);

    // Step 3: Start coordination session
    console.log('🚀 Step 3: Starting coordination session via MCP...');
    const coordinationResult = await mcpCall('start_coordination', {
      coordinator_id: coordinator.id,
      scenario_prompt: `
🌟 MCP COORDINATION DEMO: Innovation Strategy

Work together to develop a comprehensive innovation strategy for emerging technologies. Each participant should contribute their unique perspective:

- Market analysis and opportunity assessment
- Technical feasibility and implementation challenges  
- Strategic roadmap and timeline recommendations
- Risk assessment and mitigation strategies

The coordinator should synthesize these contributions into a unified innovation strategy with clear action items and success metrics.
      `.trim(),
      participant_ids: participants,
      timeout_minutes: 15,
      coordination_style: 'collaborative'
    });

    console.log(`✅ Coordination session started: ${coordinationResult.session_id}`);
    console.log(`   Status: ${coordinationResult.status}`);
    console.log(`   Participants: ${coordinationResult.participant_count}`);
    console.log(`   Timeout: ${coordinationResult.timeout_minutes} minutes\n`);

    // Step 4: Monitor coordination progress
    console.log('📊 Step 4: Monitoring coordination progress...');
    const sessionId = coordinationResult.session_id;
    let attempts = 0;
    const maxAttempts = 20; // Monitor for up to 3 minutes (20 * 10 seconds)
    
    while (attempts < maxAttempts) {
      try {
        const session = await mcpCall('get_coordination_session', {
          session_id: sessionId
        });
        
        console.log(`🔄 Status: ${session.status} (attempt ${attempts + 1}/${maxAttempts})`);
        
        if (session.participant_count > 0) {
          console.log(`   Task progress: ${session.tasks_completed}/${session.participant_count} completed, ${session.tasks_in_progress} in progress, ${session.tasks_failed} failed`);
        }
        
        if (session.status === 'completed') {
          console.log('\n🎉 COORDINATION COMPLETED SUCCESSFULLY!');
          console.log('=====================================');
          
          if (session.final_result) {
            console.log('\n📄 Final Results:');
            console.log(`Summary: ${session.final_result.summary || 'Not available'}`);
            
            if (session.final_result.recommendations && session.final_result.recommendations.length > 0) {
              console.log('\n💡 Key Recommendations:');
              session.final_result.recommendations.forEach((rec, index) => {
                console.log(`  ${index + 1}. ${rec}`);
              });
            }
            
            if (session.participant_tasks && session.participant_tasks.length > 0) {
              console.log('\n👥 Participant Contributions:');
              session.participant_tasks.forEach(task => {
                if (task.status === 'completed' && task.result) {
                  console.log(`\n  ${task.agent_id}:`);
                  console.log(`    ${task.result.substring(0, 200)}...`);
                }
              });
            }
          }
          
          console.log('\n✅ MCP coordination demonstration completed successfully!');
          return;
        }
        
        if (session.status === 'failed') {
          console.log('\n❌ COORDINATION FAILED');
          console.log('======================');
          console.log('The coordination session encountered an error.');
          return;
        }
        
        // Wait before next check
        if (attempts < maxAttempts - 1) {
          console.log('   Waiting 10 seconds before next check...\n');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
      } catch (error) {
        console.error(`❌ Error checking session status: ${error.message}`);
        break;
      }
      
      attempts++;
    }
    
    console.log('\n⏰ COORDINATION MONITORING TIMEOUT');
    console.log('=================================');
    console.log('Coordination is still in progress. The session continues in the background.');
    console.log(`You can check status later with session ID: ${sessionId}`);

  } catch (error) {
    console.error('\n❌ DEMONSTRATION FAILED');
    console.error('========================');
    console.error(`Error: ${error.message}`);
    
    console.error('\nTroubleshooting:');
    console.error('1. Ensure the Druids MCP server is running on http://localhost:3003');
    console.error('2. Check that coordinators and agents are properly initialized');
    console.error('3. Verify the CoordinationService is properly wired in the MCP server');
  }
  
  console.log('\n🎯 MCP coordination demonstration completed.');
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the demonstration
demonstrateMCPCoordination().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});