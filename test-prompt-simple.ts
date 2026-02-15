/**
 * Simple test to verify prompt composition works with existing agent
 */

import { AgentService } from './src/services/AgentService';

async function test() {
  console.log('\n🧪 Testing Prompt Composition\n');

  const agentService = new AgentService();
  await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for init

  // Get an existing agent
  const agentId = 'dev-druid-alpha';
  console.log(`📥 Getting agent: ${agentId}`);

  try {
    const agent = await agentService.getAgent(agentId);
    console.log('✅ Agent found:', agent.name);
    console.log('   - Type:', agent.type);
    console.log('   - Has promptConfig:', !!agent.promptConfig);

    // Update agent with promptConfig
    console.log('\n🔄 Adding promptConfig to agent...');

    await agentService.updateAgent(agentId, {
      promptConfig: {
        baseTemplate: 'standard',
        agentExtension: `---
version: 1.0.0
metadata:
  name: "Test Agent Extension"
  description: "Custom instructions for prompt composition testing"
---

# Domain Expertise

I am a test agent verifying prompt composition layers.

# Custom Test Guidelines

- Verify all layers are working
- Report composition success
- Confirm multi-layer prompt composition is active`,
        disableRealmPrompt: false
      }
    });

    console.log('✅ Agent updated with promptConfig');

    // Get agent again to verify
    const updatedAgent = await agentService.getAgent(agentId);
    console.log('✅ Verified promptConfig:', {
      baseTemplate: updatedAgent.promptConfig?.baseTemplate,
      hasExtension: !!updatedAgent.promptConfig?.agentExtension,
      disableRealm: updatedAgent.promptConfig?.disableRealmPrompt
    });

    // Execute a prompt
    console.log('\n🚀 Executing prompt with composition...');

    const result = await agentService.executeAgentPrompt(agentId, {
      prompt: 'Hello! Please confirm you can see your prompt composition layers.',
      sessionId: 'test-session-001'
    });

    console.log('\n✅ SUCCESS! Prompt executed with composition');
    console.log('   - Response length:', result.response.length);
    console.log('   - Execution time:', result.executionTime, 'ms');
    console.log('\n📝 Response preview:\n', result.response.substring(0, 300), '...');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }

  console.log('\n✨ Test complete\n');
  process.exit(0);
}

test().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
