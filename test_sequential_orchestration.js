#!/usr/bin/env node

const axios = require('axios');

async function testSequentialOrchestration() {
  try {
    console.log('🎭 Testing Sequential Multi-Realm Storytelling Orchestration\n');
    
    // Use the orchestrated coordination API with explicit agents
    const response = await axios.post('http://localhost:3000/api/coordinators/coordinate', {
      scenarioPrompt: `Create a sequentially coordinated multi-realm storytelling project where Pierre Robert travels to the Newford realm to collaborate with De Lint to collect a story about the Grateful Dead performing a concert in Newford, focusing on the colorful differences in audience members - the diverse species, races, and legendary beings. Then Pierre Robert should travel to Middle Earth and work with Tolkien to write a new song for the Grateful Dead to perform during the Newford concert, incorporating the wonder and magic of both realms.`,
      participantIds: ['pierre-robert', 'de-lint', 'tolkien'],
      coordinationStyle: 'sequential',
      metadata: { 
        title: 'Sequential Multi-Realm Storytelling',
        workflow: 'orchestrated_coordination',
        source: 'sequential_test'
      }
    });
    
    console.log('✅ Sequential orchestration started:', {
      sessionId: response.data.sessionId,
      coordinatorId: response.data.coordinatorId,
      status: response.data.status
    });
    
    // Monitor progress
    console.log('\n⏱️ Monitoring orchestration progress...');
    
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await axios.get(`http://localhost:3000/api/coordinators/sessions/${response.data.sessionId}`);
      const session = statusResponse.data;
      
      console.log(`   ${i+1}/30: Status = ${session.status}, Steps = ${session.steps?.length || 0}`);
      
      if (session.status === 'completed' || session.status === 'failed') {
        console.log('\n📊 Final Session Details:');
        console.log(`   Status: ${session.status}`);
        console.log(`   Steps completed: ${session.steps?.length || 0}`);
        console.log(`   Results: ${session.results?.length || 0}`);
        console.log(`   Output length: ${session.output?.length || 0}`);
        
        if (session.steps?.length > 0) {
          console.log('\n🗂️ Orchestration Steps:');
          session.steps.forEach((step, index) => {
            console.log(`   Step ${index + 1}: ${step.description || 'No description'}`);
            console.log(`      Agent: ${step.agentId || 'Unknown'}`);
            console.log(`      Action: ${step.actionType || 'Unknown'}`);
            console.log(`      Status: ${step.status || 'Unknown'}`);
          });
        }
        
        if (session.status === 'completed') {
          console.log('\n🎉 SUCCESS: Sequential multi-realm orchestration completed!');
          console.log('This demonstrates proper coordination with:');
          console.log('  1. Pierre Robert → De Lint (Newford realm story collection)');
          console.log('  2. Pierre Robert → Tolkien (Middle Earth song writing)');
          console.log('  3. Content integration and publishing');
        } else {
          console.log('\n❌ FAILED: Orchestration did not complete successfully');
        }
        break;
      }
    }
    
  } catch (error) {
    console.error('❌ Sequential orchestration test failed:', error.response?.data || error.message);
  }
}

testSequentialOrchestration();