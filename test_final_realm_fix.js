// Final test to verify the frontend realm assignment fix works
const axios = require('axios');

async function testFrontendRealmAssignmentFix() {
  const baseURL = 'http://localhost:3004/api';
  
  try {
    console.log('🧪 Testing the final frontend realm assignment fix...\n');
    
    // Test updating Colleen (Druid) using the new realmAccess format that frontend now sends
    console.log('1. Testing Colleen (Druid) realm assignment with new frontend format...');
    const colleenUpdatePayload = {
      realmAccess: {
        accessibleRealms: ['realm-1760738977729', 'realm-1760741728225'],
        boundRealmId: 'default'
      }
    };
    
    console.log('Sending update with realmAccess payload:', colleenUpdatePayload);
    const colleenResponse = await axios.put(`${baseURL}/agents/colleen`, colleenUpdatePayload);
    console.log('✅ Colleen update successful, returned realmAccess:', colleenResponse.data.realmAccess);
    
    // Test updating Tolkien (Elemental) using the new format
    console.log('\n2. Testing Tolkien (Elemental) realm assignment with new frontend format...');
    const tolkienUpdatePayload = {
      realmAccess: {
        boundRealmId: 'realm-1760741728225' // Change to different realm
      }
    };
    
    console.log('Sending update with realmAccess payload:', tolkienUpdatePayload);
    const tolkienResponse = await axios.put(`${baseURL}/agents/tolkien`, tolkienUpdatePayload);
    console.log('✅ Tolkien update successful, returned realmAccess:', tolkienResponse.data.realmAccess);
    
    // Verify the changes persisted
    console.log('\n3. Verifying persistence by fetching agents again...');
    const agentsResponse = await axios.get(`${baseURL}/agents`);
    const agents = agentsResponse.data;
    
    const colleen = agents.find(a => a.name === 'Colleen');
    const tolkien = agents.find(a => a.name === 'Tolkien');
    
    console.log('Final state:');
    console.log('Colleen realmAccess:', colleen?.realmAccess);
    console.log('Tolkien realmAccess:', tolkien?.realmAccess);
    
    // Validate the expected results
    const expectedColleenRealms = ['realm-1760738977729', 'realm-1760741728225'];
    const actualColleenRealms = colleen?.realmAccess?.accessibleRealms || [];
    const expectedTolkienRealm = 'realm-1760741728225';
    const actualTolkienRealm = tolkien?.realmAccess?.boundRealmId;
    
    console.log('\n4. Validation:');
    console.log(`Colleen accessible realms: Expected ${JSON.stringify(expectedColleenRealms)}, Got ${JSON.stringify(actualColleenRealms)}`);
    console.log(`Match: ${JSON.stringify(expectedColleenRealms) === JSON.stringify(actualColleenRealms)}`);
    console.log(`Tolkien bound realm: Expected "${expectedTolkienRealm}", Got "${actualTolkienRealm}"`);
    console.log(`Match: ${expectedTolkienRealm === actualTolkienRealm}`);
    
    if (JSON.stringify(expectedColleenRealms) === JSON.stringify(actualColleenRealms) && 
        expectedTolkienRealm === actualTolkienRealm) {
      console.log('\n🎉 SUCCESS! Frontend realm assignment is working perfectly!');
    } else {
      console.log('\n❌ FAILED! Results do not match expectations');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testFrontendRealmAssignmentFix();