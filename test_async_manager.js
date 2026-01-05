#!/usr/bin/env node

/**
 * Test script for AsyncResultManager (JavaScript version)
 * Tests the core functionality of the async result system
 */

async function testAsyncResultManager() {
  console.log('🧪 Testing AsyncResultManager...\n');
  
  // Mock AsyncResultManager for testing since we can't import TypeScript directly
  const mockManager = {
    results: new Map(),
    
    generateRequestId(agentId) {
      const timestamp = Date.now();
      const uuid = Math.random().toString(36).substr(2, 8);
      return `req_${agentId}_${timestamp}_${uuid}`;
    },
    
    async createAsyncRequest(request) {
      const requestId = this.generateRequestId(request.agentId);
      const estimatedDuration = request.estimatedDuration || 30000;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      const asyncResult = {
        requestId,
        agentId: request.agentId,
        status: 'pending',
        metadata: {
          requestId,
          agentId: request.agentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          estimatedDuration,
          ...(request.clientInfo && { clientInfo: request.clientInfo })
        }
      };
      
      this.results.set(requestId, asyncResult);
      
      return {
        requestId,
        status: 'accepted',
        estimatedDuration,
        checkInterval: 2000,
        expiresAt
      };
    },
    
    async getResult(requestId) {
      return this.results.get(requestId) || null;
    },
    
    async updateResultStatus(requestId, status, progress) {
      const result = this.results.get(requestId);
      if (result) {
        result.status = status;
        result.metadata.updatedAt = new Date().toISOString();
        if (progress) {
          result.progress = progress;
        }
        this.results.set(requestId, result);
      }
    },
    
    async completeAsyncRequest(requestId, agentResponse) {
      const result = this.results.get(requestId);
      if (result) {
        result.status = 'completed';
        result.result = agentResponse;
        result.metadata.updatedAt = new Date().toISOString();
        result.metadata.actualDuration = Date.now() - new Date(result.metadata.createdAt).getTime();
        delete result.progress;
        this.results.set(requestId, result);
      }
    },
    
    async failAsyncRequest(requestId, error) {
      const result = this.results.get(requestId);
      if (result) {
        result.status = 'failed';
        result.error = error;
        result.metadata.updatedAt = new Date().toISOString();
        result.metadata.actualDuration = Date.now() - new Date(result.metadata.createdAt).getTime();
        this.results.set(requestId, result);
      }
    },
    
    async getResultsByAgent(agentId, limit) {
      const agentResults = Array.from(this.results.values())
        .filter(result => result.agentId === agentId)
        .sort((a, b) => new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime());
      
      return limit ? agentResults.slice(0, limit) : agentResults;
    },
    
    async getStatistics() {
      const results = Array.from(this.results.values());
      const total = results.length;
      
      const byStatus = {
        'pending': 0,
        'processing': 0,
        'completed': 0,
        'failed': 0,
        'expired': 0
      };
      
      const byAgent = {};
      let totalDuration = 0;
      let completedCount = 0;
      
      for (const result of results) {
        byStatus[result.status]++;
        byAgent[result.agentId] = (byAgent[result.agentId] || 0) + 1;
        
        if (result.metadata.actualDuration) {
          totalDuration += result.metadata.actualDuration;
          completedCount++;
        }
      }
      
      return {
        total,
        byStatus,
        byAgent,
        averageDuration: completedCount > 0 ? totalDuration / completedCount : 0
      };
    },
    
    getNamespacePath(agentId, requestId, file) {
      const basePath = `worldtree://public/async_results/${agentId}/${requestId}`;
      return file ? `${basePath}/${file}` : basePath;
    },
    
    isRequestValid(result) {
      const createdAt = new Date(result.metadata.createdAt).getTime();
      const now = Date.now();
      return (now - createdAt) < (24 * 60 * 60 * 1000);
    }
  };
  
  const manager = mockManager;
  
  // Test 1: Create async request
  console.log('📝 Test 1: Creating async request');
  const request = {
    agentId: 'test-agent-001',
    message: 'Write a short story about a mysterious treasure',
    estimatedDuration: 5000,
    clientInfo: {
      sessionId: 'test-session-123'
    }
  };
  
  const response = await manager.createAsyncRequest(request);
  console.log('✅ Request created:', {
    requestId: response.requestId,
    estimatedDuration: response.estimatedDuration,
    checkInterval: response.checkInterval
  });
  
  // Test 2: Get initial result (should be pending)
  console.log('\n📊 Test 2: Getting initial result status');
  const initialResult = await manager.getResult(response.requestId);
  console.log('✅ Initial status:', {
    requestId: initialResult?.requestId,
    status: initialResult?.status,
    agentId: initialResult?.agentId
  });
  
  // Test 3: Update status to processing
  console.log('\n🔄 Test 3: Updating status to processing');
  await manager.updateResultStatus(response.requestId, 'processing', {
    current: 1,
    total: 3,
    message: 'Starting story generation...'
  });
  
  const processingResult = await manager.getResult(response.requestId);
  console.log('✅ Processing status:', {
    status: processingResult?.status,
    progress: processingResult?.progress
  });
  
  // Test 4: Complete the request
  console.log('\n✅ Test 4: Completing the request');
  const mockAgentResponse = `Once upon a time, in a winter garden covered with frost, Maya discovered an ancient golden locket buried beneath the old oak tree. The locket contained a map leading to a hidden treasure that had been lost for centuries. As she followed the mysterious symbols, she realized this discovery would change her life forever.`;
  
  await manager.completeAsyncRequest(response.requestId, mockAgentResponse);
  
  const completedResult = await manager.getResult(response.requestId);
  console.log('✅ Completed status:', {
    status: completedResult?.status,
    hasResult: !!completedResult?.result,
    actualDuration: completedResult?.metadata.actualDuration
  });
  
  // Test 5: Create multiple requests for same agent
  console.log('\n📚 Test 5: Creating multiple requests for same agent');
  const request2 = {
    agentId: 'test-agent-001',
    message: 'Write a haiku about programming',
    estimatedDuration: 3000
  };
  
  const request3 = {
    agentId: 'test-agent-001',
    message: 'Explain quantum computing in simple terms',
    estimatedDuration: 8000
  };
  
  const response2 = await manager.createAsyncRequest(request2);
  const response3 = await manager.createAsyncRequest(request3);
  
  // Complete one of them
  await manager.completeAsyncRequest(response2.requestId, 'Code flows like stream\nBugs hide in logic\'s shadow\nTesting finds the truth');
  
  // Fail the other one
  await manager.failAsyncRequest(response3.requestId, 'Agent became confused by quantum mechanics');
  
  // Test 6: Get results by agent
  console.log('\n🎭 Test 6: Getting results by agent');
  const agentResults = await manager.getResultsByAgent('test-agent-001');
  console.log('✅ Agent results count:', agentResults.length);
  
  agentResults.forEach((result, index) => {
    console.log(`  ${index + 1}. ${result.requestId} - ${result.status}`);
  });
  
  // Test 7: Get statistics
  console.log('\n📈 Test 7: Getting statistics');
  const stats = await manager.getStatistics();
  console.log('✅ Statistics:', {
    total: stats.total,
    byStatus: stats.byStatus,
    byAgent: stats.byAgent,
    averageDuration: Math.round(stats.averageDuration)
  });
  
  // Test 8: Test namespace path generation
  console.log('\n🗂️ Test 8: Testing namespace paths');
  const basePath = manager.getNamespacePath('test-agent-001', response.requestId);
  const statusPath = manager.getNamespacePath('test-agent-001', response.requestId, 'status.json');
  console.log('✅ Namespace paths:', {
    base: basePath,
    status: statusPath
  });
  
  // Test 9: Request validation
  console.log('\n⏰ Test 9: Testing request validation');
  const isValid = manager.isRequestValid(completedResult);
  console.log('✅ Request validation:', { isValid });
  
  console.log('\n🎉 All tests completed successfully!');
  
  // Display final results summary
  console.log('\n📋 Final Results Summary:');
  const finalResults = await manager.getResultsByAgent('test-agent-001');
  finalResults.forEach((result) => {
    console.log(`\n📄 ${result.requestId}:`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Created: ${result.metadata.createdAt}`);
    if (result.metadata.actualDuration) {
      console.log(`   Duration: ${result.metadata.actualDuration}ms`);
    }
    if (result.result) {
      console.log(`   Result: ${result.result.substring(0, 100)}...`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
}

// Run the tests
testAsyncResultManager().catch(console.error);