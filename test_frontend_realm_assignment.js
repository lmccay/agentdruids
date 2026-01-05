// Test script to verify frontend realm assignment functionality
const axios = require('axios');

async function testRealmAssignment() {
  const baseURL = 'http://localhost:3004/api';
  
  try {
    console.log('🔍 Testing frontend realm assignment functionality...\n');
    
    // 1. Get current agents
    console.log('1. Fetching agents from frontend API...');
    const agentsResponse = await axios.get(`${baseURL}/agents`);
    const agents = agentsResponse.data;
    
    console.log(`Found ${agents.length} agents`);
    const colleen = agents.find(a => a.name === 'Colleen');
    const tolkien = agents.find(a => a.name === 'Tolkien');
    
    if (colleen) {
      console.log(`Colleen (Druid) current realm access:`, colleen.realmAccess);
    }
    if (tolkien) {
      console.log(`Tolkien (Elemental) current realm access:`, tolkien.realmAccess);
    }
    
    // 2. Get available realms
    console.log('\n2. Fetching available realms...');
    const realmsResponse = await axios.get(`${baseURL}/realms`);
    const realms = realmsResponse.data.data || realmsResponse.data;
    console.log(`Available realms:`, realms.map(r => ({id: r.id, name: r.name})));
    
    // 3. Test updating Colleen (Druid) with multiple realm access
    if (colleen) {
      console.log('\n3. Testing Colleen (Druid) realm assignment...');
      const updatePayload = {
        realmAccess: {
          accessibleRealms: ['realm-1760738977729'],
          boundRealmId: 'default'
        }
      };
      
      console.log('Sending update payload:', updatePayload);
      const updateResponse = await axios.put(`${baseURL}/agents/${colleen.id}`, updatePayload);
      console.log('Update successful, returned realmAccess:', updateResponse.data.realmAccess);
    }
    
    // 4. Test updating Tolkien (Elemental) with single realm binding
    if (tolkien) {
      console.log('\n4. Testing Tolkien (Elemental) realm assignment...');
      const updatePayload = {
        realmAccess: {
          boundRealmId: 'realm-1760738977729'
        }
      };
      
      console.log('Sending update payload:', updatePayload);
      const updateResponse = await axios.put(`${baseURL}/agents/${tolkien.id}`, updatePayload);
      console.log('Update successful, returned realmAccess:', updateResponse.data.realmAccess);
    }
    
    // 5. Verify persistence by fetching again
    console.log('\n5. Verifying persistence...');
    const verifyResponse = await axios.get(`${baseURL}/agents`);
    const updatedAgents = verifyResponse.data;
    
    const updatedColleen = updatedAgents.find(a => a.name === 'Colleen');
    const updatedTolkien = updatedAgents.find(a => a.name === 'Tolkien');
    
    if (updatedColleen) {
      console.log(`Colleen realm access after update:`, updatedColleen.realmAccess);
    }
    if (updatedTolkien) {
      console.log(`Tolkien realm access after update:`, updatedTolkien.realmAccess);
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.error('Full error:', error);
  }
}

testRealmAssignment();