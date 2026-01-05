#!/usr/bin/env node

/**
 * Coordination Demo Script
 * 
 * This script demonstrates the new Coordinator entity and coordinated multi-agent collaboration:
 * 1. Lists available coordinators
 * 2. Lists available agents for participation
 * 3. Starts a coordination session
 * 4. Monitors the coordination progress
 */

const BASE_URL = 'http://localhost:3000';

async function makeRequest(method, path, data = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${result.error || result.message || 'Unknown error'}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Request failed: ${method} ${path}`, error.message);
    throw error;
  }
}

async function demonstrateCoordination() {
  console.log('🎯 DRUIDS COORDINATION SYSTEM DEMONSTRATION');
  console.log('==========================================\n');

  try {
    // Step 1: List available coordinators
    console.log('📋 Step 1: Checking available coordinators...');
    const coordinators = await makeRequest('GET', '/coordinators');
    console.log(`Found ${coordinators.length} coordinators:`);
    coordinators.forEach(coord => {
      console.log(`  - ${coord.name} (${coord.id}): ${coord.coordination.coordinationStyle} style`);
    });
    
    if (coordinators.length === 0) {
      throw new Error('No coordinators available. Please ensure the system is properly initialized.');
    }
    
    const coordinator = coordinators[0];
    console.log(`\n🎯 Selected coordinator: ${coordinator.name}\n`);

    // Step 2: List available agents for participation
    console.log('📋 Step 2: Checking available participant agents...');
    const agents = await makeRequest('GET', '/agents');
    const eligibleAgents = agents.filter(agent => 
      agent.id !== coordinator.id && 
      agent.status === 'active' &&
      agent.type !== 'worldtree' // Worldtree agents are knowledge repositories, not participants
    );
    
    console.log(`Found ${eligibleAgents.length} eligible participant agents:`);
    eligibleAgents.slice(0, 5).forEach(agent => {
      console.log(`  - ${agent.name} (${agent.id}): ${agent.type} - ${agent.specialization?.domain || 'general'}`);
    });
    
    if (eligibleAgents.length < 2) {
      throw new Error('Need at least 2 participant agents for coordination demo.');
    }
    
    // Select 2-3 participants for the demo
    const participants = eligibleAgents.slice(0, Math.min(3, eligibleAgents.length)).map(agent => agent.id);
    console.log(`\n👥 Selected participants: ${participants.join(', ')}\n`);

    // Step 3: Start coordination session
    console.log('🚀 Step 3: Starting coordination session...');
    const coordinationRequest = {
      scenarioPrompt: `
🎯 COLLABORATION SCENARIO: Multi-Agent Analysis

Please work together to analyze the current state of renewable energy adoption globally and provide recommendations for accelerating the transition to sustainable energy systems.

Each participant should contribute their unique perspective:
- Technical analysis of current technologies
- Economic feasibility assessments  
- Policy and regulatory considerations
- Environmental impact evaluations

The coordinator should synthesize these perspectives into actionable recommendations for policymakers, businesses, and individuals.
      `.trim(),
      participantIds: participants,
      timeoutMinutes: 15,
      coordinationStyle: 'collaborative'
    };

    const coordinationResult = await makeRequest('POST', `/coordinators/${coordinator.id}/coordinate`, coordinationRequest);
    console.log(`✅ Coordination session started: ${coordinationResult.sessionId}`);
    console.log(`   Coordination style: ${coordinationResult.coordination_style || 'collaborative'}`);
    console.log(`   Participants: ${coordinationResult.participant_count}`);
    console.log(`   Timeout: ${coordinationResult.timeout_minutes} minutes\n`);

    // Step 4: Monitor coordination progress
    console.log('📊 Step 4: Monitoring coordination progress...');
    const sessionId = coordinationResult.sessionId;
    let attempts = 0;
    const maxAttempts = 30; // Monitor for up to 5 minutes (30 * 10 seconds)
    
    while (attempts < maxAttempts) {
      try {
        const session = await makeRequest('GET', `/coordination/sessions/${sessionId}`);
        
        console.log(`🔄 Status: ${session.status} (attempt ${attempts + 1}/${maxAttempts})`);
        
        if (session.participantTasks && session.participantTasks.length > 0) {
          const completedTasks = session.participantTasks.filter(task => task.status === 'completed').length;
          const totalTasks = session.participantTasks.length;
          console.log(`   Task progress: ${completedTasks}/${totalTasks} participants completed`);
        }
        
        if (session.status === 'completed') {
          console.log('\n🎉 COORDINATION COMPLETED SUCCESSFULLY!');
          console.log('=====================================');
          
          if (session.finalResult) {
            console.log('\n📊 FINAL RESULT:');
            console.log('----------------');
            console.log('Summary:', session.finalResult.summary);
            
            console.log('\n🧮 Coordinator Analysis:');
            console.log(session.finalResult.coordinatorAnalysis);
            
            console.log('\n📝 Recommendations:');
            session.finalResult.recommendations.forEach((rec, index) => {
              console.log(`${index + 1}. ${rec}`);
            });
            
            console.log('\n👥 Participant Contributions:');
            session.finalResult.participantContributions.forEach(contrib => {
              console.log(`\n${contrib.agentId}:`);
              console.log(contrib.contribution.substring(0, 200) + '...');
            });
          }
          
          break;
        } else if (session.status === 'failed') {
          console.log('\n❌ COORDINATION FAILED');
          console.log('======================');
          console.log('The coordination session encountered an error.');
          break;
        }
        
        // Wait 10 seconds before next check
        if (attempts < maxAttempts - 1) {
          console.log('   Waiting 10 seconds before next check...\n');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
      } catch (error) {
        console.error(`❌ Error checking coordination status:`, error.message);
        break;
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⏰ COORDINATION MONITORING TIMEOUT');
      console.log('=================================');
      console.log('Coordination is still in progress. Check back later or increase timeout.');
    }

  } catch (error) {
    console.error('\n❌ DEMONSTRATION FAILED');
    console.error('========================');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure the Druids server is running on http://localhost:3000');
    console.error('2. Check that test coordinators and agents are initialized');
    console.error('3. Verify AgentService dependency is properly wired to CoordinationService');
  }
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ with built-in fetch support');
  console.error('   Alternatively, run: npm install node-fetch');
  process.exit(1);
}

// Run the demonstration
demonstrateCoordination().then(() => {
  console.log('\n🎯 Coordination demonstration completed.');
}).catch(error => {
  console.error('\n❌ Demonstration failed:', error.message);
  process.exit(1);
});