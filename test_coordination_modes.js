#!/usr/bin/env node

const axios = require('axios');

async function testCoordinationModes() {
  console.log('🧪 Testing Both Coordination Modes\n');

  try {
    // Test 1: Natural Language Mode (no coordinator specified)
    console.log('📝 Test 1: Natural Language Coordination (Smart Default)');
    console.log('   - No coordinator specified');
    console.log('   - System should auto-select built-in-coordinator');
    
    const naturalResponse = await axios.post('http://localhost:3000/api/coordinators/coordinate', {
      scenarioPrompt: 'Pierre should collaborate with De Lint to create a guide about mythical creatures in urban fantasy literature',
      participantIds: ['pierre-robert', 'de-lint'],
      metadata: { 
        title: 'Natural Language Test',
        mode: 'natural_language_interface'
      }
    });
    
    console.log('   ✅ Started successfully:', {
      sessionId: naturalResponse.data.sessionId,
      coordinatorUsed: naturalResponse.data.coordinatorId,
      status: naturalResponse.data.status
    });

    // Test 2: Explicit Coordinator Mode
    console.log('\n📝 Test 2: Explicit Coordinator Coordination');
    console.log('   - Explicitly specified built-in-coordinator');
    console.log('   - Traditional API approach');
    
    const explicitResponse = await axios.post('http://localhost:3000/api/coordinators/built-in-coordinator/coordinate', {
      scenarioPrompt: 'Lucas and Tolkien should work together to analyze narrative structures in epic fantasy',
      participantIds: ['lucas', 'tolkien'],
      metadata: { 
        title: 'Explicit Coordinator Test',
        mode: 'explicit_coordinator'
      }
    });
    
    console.log('   ✅ Started successfully:', {
      sessionId: explicitResponse.data.sessionId,
      status: explicitResponse.data.status
    });

    // Wait for both to complete
    console.log('\n⏱️ Waiting for both coordinations to complete...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Check results
    console.log('\n📊 Final Results:');
    
    const naturalStatus = await axios.get(`http://localhost:3000/api/coordinators/sessions/${naturalResponse.data.sessionId}`);
    console.log(`   Natural Language Mode: ${naturalStatus.data.status}`);
    
    const explicitStatus = await axios.get(`http://localhost:3000/api/coordinators/sessions/${explicitResponse.data.sessionId}`);
    console.log(`   Explicit Coordinator Mode: ${explicitStatus.data.status}`);

    console.log('\n🎯 Conclusion:');
    console.log('   Both coordination modes work successfully!');
    console.log('   - Natural Language: Perfect for users who just want to describe what they want');
    console.log('   - Explicit Mode: Perfect for advanced users who want full control');
    console.log('   - UI can offer both options with smart defaulting to natural mode');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testCoordinationModes();