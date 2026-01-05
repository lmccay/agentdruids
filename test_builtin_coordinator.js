#!/usr/bin/env node

const axios = require('axios');

async function testBuiltInCoordinator() {
  try {
    console.log('🔍 Testing with built-in-coordinator...');
    
    const response = await axios.post('http://localhost:3000/api/coordinators/built-in-coordinator/coordinate', {
      participantIds: ['pierre-robert', 'de-lint'], // Include druid (pierre-robert) + elemental (de-lint)
      scenarioPrompt: 'Test coordination with built-in coordinator - Pierre should travel to collaborate with De Lint on a literary analysis task',
      metadata: { title: 'Built-in Coordinator Test with Druid + Elemental' }
    });
    
    console.log('Coordination response:', response.data);
    
    // Wait and check status
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const statusResponse = await axios.get(`http://localhost:3000/api/coordinators/sessions/${response.data.sessionId}`);
    console.log('\nSession status:', {
      status: statusResponse.data.status,
      duration: statusResponse.data.completedAt 
        ? new Date(statusResponse.data.completedAt) - new Date(statusResponse.data.startedAt) + 'ms'
        : 'still running',
      hasResults: statusResponse.data.results?.length > 0,
      hasOutput: statusResponse.data.output?.length > 0
    });
    
    if (statusResponse.data.results?.length > 0) {
      console.log('Results found:', statusResponse.data.results.length);
    }
    
  } catch (error) {
    console.error('Test error:', error.response?.data || error.message);
  }
}

testBuiltInCoordinator();