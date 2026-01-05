#!/usr/bin/env node

/**
 * Test script for MCP async tools workflow
 */

const { v4: uuidv4 } = require('uuid');

let sessionId = null;

async function makeRequest(method, params, id = uuidv4()) {
  const response = await fetch('http://localhost:3003/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
      ...(sessionId && { 'Mcp-Session-Id': sessionId })
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id
    })
  });

  // Get session ID from response headers
  const newSessionId = response.headers.get('Mcp-Session-Id');
  if (newSessionId) {
    sessionId = newSessionId;
  }

  const result = await response.json();
  return result;
}

async function testAsyncWorkflow() {
  console.log('🧪 Testing MCP Async Workflow...\n');

  try {
    // 1. Initialize session
    console.log('1️⃣ Initializing MCP session...');
    const initResult = await makeRequest('initialize', {
      clientInfo: { name: 'async-test-client', version: '1.0.0' }
    });
    console.log('✅ Session initialized:', sessionId);
    console.log('   Protocol version:', initResult.result?.protocolVersion);
    console.log('');

    // 2. Create a test agent
    console.log('2️⃣ Creating test agent...');
    const createResult = await makeRequest('tools/call', {
      name: 'agent_create',
      arguments: {
        name: 'test-writer-async',
        type: 'druid',
        description: 'Test agent for async workflow',
        domain: 'creative_writing'
      }
    });
    console.log('✅ Agent created:');
    console.log('   Result:', JSON.stringify(createResult.result?.content[0]?.text, null, 2));
    
    const agentData = JSON.parse(createResult.result?.content[0]?.text || '{}');
    const agentId = agentData.agent?.id;
    if (!agentId) {
      throw new Error('Failed to get agent ID from creation result');
    }
    console.log('   Agent ID:', agentId);
    console.log('');

    // 3. Start async agent conversation
    console.log('3️⃣ Starting async agent conversation...');
    const asyncResult = await makeRequest('tools/call', {
      name: 'ask_agent_async',
      arguments: {
        agent_id: agentId,
        message: 'Please write a short story about a magical forest'
      }
    });
    console.log('✅ Async request started:');
    console.log('   Result:', JSON.stringify(asyncResult.result?.content[0]?.text, null, 2));
    
    const asyncData = JSON.parse(asyncResult.result?.content[0]?.text || '{}');
    const requestId = asyncData.request_id;
    if (!requestId) {
      throw new Error('Failed to get request ID from async result');
    }
    console.log('   Request ID:', requestId);
    console.log('');

    // 4. Monitor progress
    console.log('4️⃣ Monitoring async request progress...');
    let attempts = 0;
    const maxAttempts = 10;
    let finalResult = null;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`   📊 Check ${attempts}/${maxAttempts}...`);
      
      const statusResult = await makeRequest('tools/call', {
        name: 'get_async_result',
        arguments: { request_id: requestId }
      });
      
      const statusData = JSON.parse(statusResult.result?.content[0]?.text || '{}');
      console.log(`   Status: ${statusData.status}`);
      
      if (statusData.status === 'completed') {
        finalResult = statusData;
        console.log('✅ Request completed!');
        break;
      } else if (statusData.status === 'failed') {
        console.log('❌ Request failed:', statusData.error);
        break;
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log('');

    // 5. Show final result
    if (finalResult) {
      console.log('5️⃣ Final Result:');
      console.log('   Status:', finalResult.status);
      console.log('   Duration:', finalResult.metadata?.actualDuration + 'ms');
      console.log('   Response:');
      console.log('   ', finalResult.result?.response || finalResult.result);
      console.log('');
    }

    // 6. List async results for agent
    console.log('6️⃣ Listing async results for agent...');
    const listResult = await makeRequest('tools/call', {
      name: 'list_async_results',
      arguments: { agent_id: agentId }
    });
    console.log('✅ Async results list:');
    console.log('   Result:', JSON.stringify(listResult.result?.content[0]?.text, null, 2));
    console.log('');

    console.log('🎉 Async workflow test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Run the test
testAsyncWorkflow().catch(console.error);