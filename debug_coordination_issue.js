#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function debugCoordination() {
  try {
    console.log('🔍 Starting coordination debug...');
    
    // 1. Check available druids
    console.log('\n1. Checking available druids...');
    const druidsResponse = await axios.get(`${BASE_URL}/api/agents?type=druid`);
    console.log('Available druids:', druidsResponse.data.slice(0, 2).map(d => ({ id: d.id, name: d.name })));
    
    // 2. Check available realms
    console.log('\n2. Checking available realms...');
    const realmsResponse = await axios.get(`${BASE_URL}/api/realms`);
    const realms = Array.isArray(realmsResponse.data) ? realmsResponse.data : realmsResponse.data.data || [];
    console.log('Available realms:', realms.slice(0, 2).map(r => ({ id: r.id, name: r.name })));
    
    // 3. Check elementals in a realm
    if (realms.length > 0) {
      // Try Middle Earth first as it has agents
      const realm = realms.find(r => r.name === 'Middle Earth') || realms[0];
    // 3. Check available elementals (not realm-specific for now)
    console.log('\n3. Checking available elementals...');
    const elementalsResponse = await axios.get(`${BASE_URL}/api/agents?type=elemental`);
    const elementals = Array.isArray(elementalsResponse.data) ? elementalsResponse.data : elementalsResponse.data.data || [];
    console.log('Available elementals:', elementals.slice(0, 2).map(e => ({ id: e.id, name: e.name, domain: e.specialization?.domain })));
    
    // 4. Start a minimal coordination test
    if (druidsResponse.data.length > 0 && elementals.length > 0) {
      const druid = druidsResponse.data[0];
      const elemental = elementals[0];
      
      console.log(`\n4. Starting coordination test with druid: ${druid.name} and elemental: ${elemental.name}`);
      
      const coordRequest = {
        coordinatorId: druid.id,
        participantIds: [elemental.id],
        scenarioPrompt: "Create a simple test document about the color blue. This is just a coordination workflow test.",
        metadata: {
          title: "Debug Coordination Test",
          description: "Testing coordination workflow execution"
        }
      };
      
      console.log('Coordination request:', coordRequest);
      
      const coordResponse = await axios.post(`${BASE_URL}/api/coordinators/${druid.id}/coordinate`, coordRequest);
      console.log('\nCoordination response:', {
        success: coordResponse.data.success,
        sessionId: coordResponse.data.sessionId,
        status: coordResponse.data.status
      });
      
      // 5. Wait a bit then check session status
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      if (coordResponse.data.sessionId) {
        console.log('\n5. Checking session status...');
        const statusResponse = await axios.get(`${BASE_URL}/api/coordinators/sessions/${coordResponse.data.sessionId}`);
        console.log('Full session details:', statusResponse.data);
        }
      }
    }
    
  } catch (error) {
    console.error('Debug error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}debugCoordination();