#!/usr/bin/env node

/**
 * Test script to verify persona-aware system prompt generation
 * This script demonstrates the difference between old and new system prompts
 */

// Mock agent configuration similar to what's created by the system
const testAgent = {
  id: 'test-agent-001',
  type: 'druid',
  name: 'Creative Writing Workshop Team Member 1',
  description: 'Specialized druid for Creative Writing Workshop',
  personality: {
    traits: ['collaborative', 'focused', 'reliable'],
    communicationStyle: 'formal',
    decisionMaking: 'analytical',
    riskTolerance: 'moderate',
    collaborationPreference: 'collaborative'
  },
  specialization: {
    domain: 'Creative Writing Workshop',
    expertise: ['wisdom', 'guidance', 'problem-solving', 'communication'],
    skillLevel: 'expert',
    knowledgeNamespaces: [],
    maxConcurrentTasks: 3
  },
  llmConfig: {
    provider: 'ollama',
    model: 'qwen2.5:1.5b',
    temperature: 0.7,
    maxTokens: 1000,
    systemPrompt: 'You are a druid agent specialized in Creative Writing Workshop.'
  }
};

// Generate behavior guidelines based on personality traits
function generateBehaviorGuidelines(personality) {
  let guidelines = '';
  
  // Communication style guidelines
  switch (personality.communicationStyle) {
    case 'formal':
      guidelines += '- Communicate with professional formality and clear structure\n';
      break;
    case 'casual':
      guidelines += '- Use approachable, friendly communication style\n';
      break;
    case 'technical':
      guidelines += '- Focus on precise, technical language and detailed explanations\n';
      break;
    case 'concise':
      guidelines += '- Keep responses brief and to-the-point\n';
      break;
    case 'verbose':
      guidelines += '- Provide comprehensive, detailed explanations\n';
      break;
  }
  
  // Decision making guidelines
  switch (personality.decisionMaking) {
    case 'analytical':
      guidelines += '- Approach decisions through systematic analysis and data evaluation\n';
      break;
    case 'intuitive':
      guidelines += '- Trust instincts and pattern recognition in decision making\n';
      break;
    case 'consensus-seeking':
      guidelines += '- Seek input and agreement from collaborators before decisions\n';
      break;
    case 'independent':
      guidelines += '- Make autonomous decisions based on available information\n';
      break;
    case 'rule-based':
      guidelines += '- Follow established procedures and guidelines strictly\n';
      break;
    case 'optimization-focused':
      guidelines += '- Always seek the most efficient and optimal solutions\n';
      break;
  }
  
  // Trait-specific guidelines
  personality.traits.forEach(trait => {
    switch (trait.toLowerCase()) {
      case 'collaborative':
        guidelines += '- Actively engage with other agents and seek collaborative solutions\n';
        break;
      case 'focused':
        guidelines += '- Maintain clear focus on objectives and avoid unnecessary distractions\n';
        break;
      case 'reliable':
        guidelines += '- Deliver consistent, dependable results and follow through on commitments\n';
        break;
      case 'creative':
        guidelines += '- Explore innovative approaches and think outside conventional boundaries\n';
        break;
      case 'methodical':
        guidelines += '- Follow systematic, step-by-step approaches to problem-solving\n';
        break;
      case 'adaptive':
        guidelines += '- Adjust strategies based on changing circumstances and feedback\n';
        break;
    }
  });
  
  return guidelines;
}

// Get agent type-specific prompt guidance
function getAgentTypePromptSuffix(agentType) {
  switch (agentType) {
    case 'druid':
      return 'As a druid, you excel at coordination and high-level reasoning. Provide wise guidance, facilitate collaboration, and maintain harmony between different perspectives. Your strength lies in seeing the bigger picture and orchestrating complex multi-agent interactions.';
    case 'elemental':
      return 'As an elemental, you excel at specialized domain tasks with precision and structure. Focus on accurate execution of specific capabilities, maintain consistency in your approach, and deliver reliable results within your area of expertise.';
    case 'gaia':
      return 'As gaia, you excel at system-wide harmony and collaborative nurturing. Foster team dynamics, ensure balanced outcomes, and maintain the overall health of collaborative processes. Your role is to support and sustain the collaborative ecosystem.';
    case 'worldtree':
      return 'As worldtree, you excel at knowledge synthesis and maintaining contextual connections. Provide comprehensive insights that bridge different domains, maintain context across interactions, and serve as a knowledge hub for the collaboration.';
    default:
      return 'Apply your specialized capabilities systematically while maintaining your unique perspective and approach to problem-solving.';
  }
}

// Generate persona-aware system prompt
function generatePersonaSystemPrompt(agent, collaborationContext, agentRole) {
  const personality = agent.personality;
  const specialization = agent.specialization;
  const agentTypeGuidance = getAgentTypePromptSuffix(agent.type);
  
  let prompt = `You are a ${agent.type} agent named "${agent.name}"`;
  
  if (collaborationContext) {
    prompt += ` ${collaborationContext}`;
  }
  
  prompt += `.\n\n`;
  
  // Role and Specialization Section
  prompt += `ROLE & SPECIALIZATION:\n`;
  if (agentRole) {
    prompt += `- Role: ${agentRole}\n`;
  }
  prompt += `- Domain: ${specialization.domain}\n`;
  prompt += `- Expertise: ${specialization.expertise.join(', ')}\n`;
  if (specialization.skillLevel) {
    prompt += `- Skill Level: ${specialization.skillLevel}\n`;
  }
  prompt += `\n`;
  
  // Personality Section
  prompt += `PERSONALITY TRAITS:\n`;
  prompt += `- Communication Style: ${personality.communicationStyle}\n`;
  prompt += `- Decision Making: ${personality.decisionMaking}\n`;
  prompt += `- Core Traits: ${personality.traits.join(', ')}\n`;
  if (personality.riskTolerance) {
    prompt += `- Risk Tolerance: ${personality.riskTolerance}\n`;
  }
  if (personality.collaborationPreference) {
    prompt += `- Collaboration Style: ${personality.collaborationPreference}\n`;
  }
  prompt += `\n`;
  
  // Behavior Guidelines Section
  prompt += `BEHAVIOR GUIDELINES:\n`;
  prompt += generateBehaviorGuidelines(personality);
  prompt += `\n`;
  
  // Agent Type Specific Guidance
  prompt += `AGENT TYPE SPECIALIZATION:\n`;
  prompt += agentTypeGuidance;
  prompt += `\n`;
  
  // Task Approach Section
  prompt += `TASK APPROACH:\n`;
  prompt += `- Apply your ${agent.type} capabilities systematically\n`;
  prompt += `- Maintain ${personality.communicationStyle} communication standards\n`;
  prompt += `- Use ${personality.decisionMaking} decision-making approach\n`;
  prompt += `- Demonstrate traits: ${personality.traits.join(', ')}\n`;
  if (specialization.expertise.length > 0) {
    prompt += `- Leverage your expertise in: ${specialization.expertise.join(', ')}\n`;
  }
  
  return prompt;
}

// Test scenarios
console.log('🧪 PERSONA-AWARE SYSTEM PROMPT TESTING');
console.log('=====================================\n');

console.log('📋 TEST AGENT CONFIGURATION:');
console.log(`- Name: ${testAgent.name}`);
console.log(`- Type: ${testAgent.type}`);
console.log(`- Domain: ${testAgent.specialization.domain}`);
console.log(`- Personality: ${testAgent.personality.traits.join(', ')}`);
console.log(`- Communication: ${testAgent.personality.communicationStyle}`);
console.log(`- Decision Making: ${testAgent.personality.decisionMaking}`);
console.log('');

console.log('🔵 OLD BASIC SYSTEM PROMPT:');
console.log('----------------------------');
const oldPrompt = `You are participating in scenario "Write Creative Story". Your role is "lead writer".`;
console.log(oldPrompt);
console.log('');

console.log('🟢 NEW PERSONA-AWARE SYSTEM PROMPT:');
console.log('------------------------------------');
const collaborationContext = 'participating in collaboration "Write Creative Story"';
const newPrompt = generatePersonaSystemPrompt(testAgent, collaborationContext, 'lead writer');
console.log(newPrompt);

console.log('📊 COMPARISON ANALYSIS:');
console.log('------------------------');
console.log(`Old prompt length: ${oldPrompt.length} characters`);
console.log(`New prompt length: ${newPrompt.length} characters`);
console.log(`Persona enrichment: ${((newPrompt.length - oldPrompt.length) / oldPrompt.length * 100).toFixed(1)}% more context`);
console.log('');

console.log('✅ EXPECTED IMPROVEMENTS:');
console.log('- Agent demonstrates formal communication style');
console.log('- Agent uses analytical decision-making approach');
console.log('- Agent shows collaborative, focused, reliable traits');
console.log('- Agent applies druid coordination and wisdom capabilities');
console.log('- Agent leverages creative writing domain expertise');
console.log('- Agent maintains professional formality in responses');