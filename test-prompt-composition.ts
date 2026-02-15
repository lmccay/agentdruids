/**
 * Quick test script to verify prompt composition end-to-end
 */

import { AgentService } from './src/services/AgentService';
import { Agent } from './src/models/Agent';

async function testPromptComposition() {
  console.log('\n🧪 Testing Prompt Composition End-to-End\n');

  const agentService = new AgentService();

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create agent request with promptConfig
  const createRequest = {
    id: 'test-prompt-comp-001',
    type: 'elemental',
    name: 'Test Prompt Composition Agent',
    description: 'Agent to test prompt composition',
    status: 'active',
    capabilities: ['testing'],
    specialization: {
      domain: 'testing',
      expertise: ['prompt-testing'],
      knowledgeNamespaces: ['worldtree://test/'],
      maxConcurrentTasks: 5
    },
    personality: {
      traits: ['analytical'],
      communicationStyle: 'technical',
      decisionMaking: 'analytical'
    },
    mcpTools: [],
    toolPermissions: {},
    llmConfig: {
      provider: 'ollama',
      model: 'qwen2.5:1.5b',
      temperature: 0.7
    },
    resourceLimits: {
      maxConcurrentTasks: 5,
      maxMemoryMB: 512,
      maxCpuPercent: 50
    },
    bindings: [],
    realmAccess: {
      boundRealmId: 'default',
      accessibleRealms: [],
      currentRealmId: 'default'
    },
    // The new promptConfig!
    promptConfig: {
      baseTemplate: 'standard',
      agentExtension: `---
version: 1.0.0
metadata:
  name: "Test Agent Extension"
  description: "Custom instructions for prompt composition testing"
---

# Domain Expertise

I specialize in testing prompt composition systems.

# Custom Guidelines

- Always verify multi-layer prompt composition
- Report which layers are active
- Confirm security postamble is present`,
      disableRealmPrompt: false
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log('✅ Created test agent with promptConfig');
  console.log('   - baseTemplate:', testAgent.promptConfig?.baseTemplate);
  console.log('   - has agentExtension:', !!testAgent.promptConfig?.agentExtension);
  console.log('   - disableRealmPrompt:', testAgent.promptConfig?.disableRealmPrompt);

  // Execute a prompt to trigger composition
  console.log('\n🔄 Executing prompt to trigger composition...\n');

  try {
    const result = await agentService.executeAgentPrompt(testAgent.id, {
      prompt: 'Please describe what system prompt layers you are currently using.',
      sessionId: 'test-session-001'
    });

    console.log('✅ Prompt executed successfully!');
    console.log('   - Response length:', result.response.length);
    console.log('   - Execution time:', result.executionTime, 'ms');
    console.log('\n📝 Response:\n', result.response);

  } catch (error) {
    console.error('❌ Error executing prompt:', error);
  }

  console.log('\n✨ Test complete!\n');
  process.exit(0);
}

testPromptComposition().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
