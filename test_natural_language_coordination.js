#!/usr/bin/env node

const axios = require('axios');

async function testNaturalLanguageCoordination() {
  try {
    console.log('🗣️ Testing natural language coordination (no coordinator specified)...');
    
    // This is how a natural language interface should work - no coordinator specified!
    const response = await axios.post('http://localhost:3000/api/coordinators/coordinate', {
      scenarioPrompt: 'Pierre should work with De Lint to analyze the literary themes in urban fantasy novels and create a comprehensive guide',
      participantIds: ['pierre-robert', 'de-lint'],
      metadata: { 
        title: 'Natural Language Coordination Test',
        source: 'natural_language_interface'
      }
    });
    
    console.log('✅ Coordination started without specifying coordinator:', {
      sessionId: response.data.sessionId,
      coordinatorId: response.data.coordinatorId, // Should be 'built-in-coordinator'
      status: response.data.status,
      message: response.data.message
    });
    
    // Wait and check final status
    console.log('\n⏱️ Waiting for coordination to complete...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    const statusResponse = await axios.get(`http://localhost:3000/api/coordinators/sessions/${response.data.sessionId}`);
    console.log('\n📊 Final session status:', {
      status: statusResponse.data.status,
      duration: statusResponse.data.completedAt 
        ? `${new Date(statusResponse.data.completedAt) - new Date(statusResponse.data.startedAt)}ms`
        : 'still running',
      hasResults: statusResponse.data.results?.length > 0,
      hasOutput: statusResponse.data.output?.length > 0,
      stepsCount: statusResponse.data.steps?.length || 0
    });
    
    if (statusResponse.data.status === 'completed') {
      console.log('\n🎉 Success! Natural language coordination completed successfully');
      console.log('This demonstrates that users don\'t need to specify coordinators - the system defaults to built-in-coordinator automatically.');
    } else {
      console.log('\n⚠️ Coordination still in progress or failed. Check logs for details.');
    }
    
  } catch (error) {
    console.error('❌ Natural language coordination test failed:', error.response?.data || error.message);
  }
}

testNaturalLanguageCoordination();