#!/usr/bin/env node

/**
 * Test the async system with a real agent interaction
 * This tests the full flow from async request to agent completion
 */

const { AsyncResultManager } = require('./build/AsyncResultManager');

// Mock AgentService for testing (simulates real agent behavior)
class MockAgentService {
  constructor() {
    this.agents = new Map();
    // Create a test agent
    this.agents.set('test-writer-001', {
      id: 'test-writer-001',
      name: 'Test Writer',
      type: 'druid',
      status: 'active',
      personality: {
        traits: ['creative', 'focused'],
        communicationStyle: 'formal',
        decisionMaking: 'analytical'
      }
    });
  }
  
  async getAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent;
  }
  
  async executeAgentPrompt(agentId, request) {
    // Simulate agent processing time
    const processingTime = Math.random() * 3000 + 1000; // 1-4 seconds
    
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Generate a response based on the prompt
    let response = '';
    if (request.prompt.includes('story')) {
      response = 'Once upon a time, in a mysterious winter garden, Elena discovered an ancient golden compass hidden beneath the frozen fountain. The compass pointed not north, but toward secrets long forgotten, leading her on an adventure that would change her destiny forever.';
    } else if (request.prompt.includes('haiku')) {
      response = 'Code flows like a stream\nBugs dance in shadows of logic\nTests bring clarity';
    } else {
      response = `I understand you're asking about: "${request.prompt}". Let me provide a thoughtful response based on my creative writing expertise and analytical approach.`;
    }
    
    return {
      response,
      usage: {
        promptTokens: 50,
        completionTokens: response.split(' ').length,
        totalTokens: 50 + response.split(' ').length
      },
      executionTime: processingTime
    };
  }
}

async function testAsyncAgentIntegration() {
  console.log('🔧 Testing Async Agent Integration...\n');
  
  const asyncManager = new AsyncResultManager();
  const agentService = new MockAgentService();
  
  // Simulate the background processing function (similar to what would be in SimpleMCPServer)
  async function processAsyncAgentRequest(requestId, request) {
    try {
      console.log(`🔄 Starting async processing for request ${requestId}`);
      
      // Update status to processing
      await asyncManager.updateResultStatus(requestId, 'processing');
      
      // Add conversation context if provided
      let fullPrompt = request.message;
      if (request.conversationContext) {
        fullPrompt = `Previous conversation context: ${request.conversationContext}\n\nCurrent message: ${request.message}`;
      }
      
      // Execute the agent prompt (this is the long-running operation)
      const result = await agentService.executeAgentPrompt(request.agentId, {
        prompt: fullPrompt,
        temperature: 0.7
      });
      
      // Complete the async request with the result
      await asyncManager.completeAsyncRequest(requestId, result.response);
      
      console.log(`✅ Completed async processing for request ${requestId}`);
      
    } catch (error) {
      console.error(`❌ Async processing failed for request ${requestId}:`, error);
      
      // Fail the async request with the error
      await asyncManager.failAsyncRequest(
        requestId, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
  
  // Test 1: Start multiple async requests
  console.log('🚀 Test 1: Starting multiple async agent requests');
  
  const requests = [
    {
      agentId: 'test-writer-001',
      message: 'Write a short story about a mysterious treasure in a winter garden',
      estimatedDuration: 5000
    },
    {
      agentId: 'test-writer-001', 
      message: 'Write a haiku about programming',
      estimatedDuration: 3000
    },
    {
      agentId: 'test-writer-001',
      message: 'Explain the importance of creativity in problem solving',
      estimatedDuration: 4000
    }
  ];
  
  const responses = [];
  for (const request of requests) {
    const response = await asyncManager.createAsyncRequest(request);
    responses.push(response);
    console.log(`📝 Created request: ${response.requestId}`);
    
    // Start processing in background (don't await)
    processAsyncAgentRequest(response.requestId, request);
  }
  
  // Test 2: Monitor progress
  console.log('\n⏳ Test 2: Monitoring progress...');
  
  let allCompleted = false;
  let attempts = 0;
  const maxAttempts = 20; // 20 seconds max
  
  while (!allCompleted && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    attempts++;
    
    console.log(`\n📊 Check ${attempts}:`);
    let pendingCount = 0;
    
    for (const response of responses) {
      const result = await asyncManager.getResult(response.requestId);
      console.log(`  ${response.requestId}: ${result?.status || 'unknown'}`);
      
      if (result?.status === 'pending' || result?.status === 'processing') {
        pendingCount++;
      }
    }
    
    if (pendingCount === 0) {
      allCompleted = true;
    }
  }
  
  // Test 3: Get final results
  console.log('\n✅ Test 3: Final Results:');
  
  for (const response of responses) {
    const result = await asyncManager.getResult(response.requestId);
    console.log(`\n📄 ${response.requestId}:`);
    console.log(`   Status: ${result?.status}`);
    console.log(`   Duration: ${result?.metadata.actualDuration}ms`);
    
    if (result?.result) {
      const preview = result.result.length > 100 ? 
        result.result.substring(0, 100) + '...' : 
        result.result;
      console.log(`   Result: ${preview}`);
    }
    
    if (result?.error) {
      console.log(`   Error: ${result.error}`);
    }
  }
  
  // Test 4: Get agent statistics
  console.log('\n📈 Test 4: Statistics:');
  const stats = await asyncManager.getStatistics();
  console.log('Statistics:', {
    total: stats.total,
    byStatus: stats.byStatus,
    averageDuration: Math.round(stats.averageDuration)
  });
  
  console.log('\n🎉 Integration test completed!');
}

// Run the integration test
testAsyncAgentIntegration().catch(console.error);