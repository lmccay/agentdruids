#!/usr/bin/env node

// Simple test to identify the coordination failure point
const axios = require('axios');

async function testCoordinationStep() {
  try {
    console.log('🔍 Testing coordination failure point...');
    
    // First, test if the agent exists
    console.log('\n1. Testing agent lookup...');
    const agentResponse = await axios.get('http://localhost:3000/api/agents/pierre-robert');
    console.log('Coordinator agent found:', agentResponse.data.name);
    
    const participantResponse = await axios.get('http://localhost:3000/api/agents/de-lint');
    console.log('Participant agent found:', participantResponse.data.name);
    
    // Start coordination but monitor server logs separately
    console.log('\n2. Starting coordination (check server logs)...');
    
    const response = await axios.post('http://localhost:3000/api/coordinators/pierre-robert/coordinate', {
      participantIds: ['de-lint'],
      scenarioPrompt: 'Simple test prompt',
      metadata: { title: 'Minimal Test' }
    });
    
    console.log('Coordination response:', response.data);
    
    // Wait and check status
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const statusResponse = await axios.get(`http://localhost:3000/api/coordinators/sessions/${response.data.sessionId}`);
    console.log('\nSession status:', statusResponse.data.status);
    console.log('Session duration:', 
      new Date(statusResponse.data.completedAt) - new Date(statusResponse.data.startedAt), 'ms');
    
  } catch (error) {
    console.error('Test error:', error.response?.data || error.message);
  }
}

testCoordinationStep();