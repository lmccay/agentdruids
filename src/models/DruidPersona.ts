import { Timestamp, BaseEntity } from './Types';

/**
 * Communication style preferences and patterns
 */
export interface CommunicationStyle {
  formality: 'formal' | 'casual' | 'technical' | 'adaptive';
  verbosity: 'concise' | 'detailed' | 'verbose' | 'adaptive';
  tone: 'professional' | 'friendly' | 'analytical' | 'supportive' | 'directive';
  responsePattern: 'immediate' | 'thoughtful' | 'collaborative' | 'confirmatory';
  languagePreferences?: {
    technicalTerms: boolean;
    analogies: boolean;
    examples: boolean;
    stepByStepExplanations: boolean;
  };
}

/**
 * Decision-making patterns and preferences
 */
export interface DecisionMakingStyle {
  approach: 'analytical' | 'intuitive' | 'consensus-seeking' | 'independent' | 'rule-based' | 'optimization-focused';
  riskTolerance: 'conservative' | 'moderate' | 'aggressive' | 'calculated';
  timeOrientation: 'immediate' | 'deliberative' | 'long-term' | 'adaptive';
  informationProcessing: 'comprehensive' | 'focused' | 'iterative' | 'pattern-based';
  conflictResolution: 'collaborative' | 'accommodating' | 'competing' | 'compromising' | 'avoiding';
}

/**
 * Learning and adaptation preferences
 */
export interface LearningStyle {
  primaryMode: 'experiential' | 'observational' | 'analytical' | 'social' | 'kinesthetic';
  feedbackPreference: 'immediate' | 'periodic' | 'milestone-based' | 'self-directed';
  adaptationSpeed: 'rapid' | 'moderate' | 'gradual' | 'stable';
  knowledgeRetention: 'episodic' | 'semantic' | 'procedural' | 'meta-cognitive';
  mentoring: {
    providesGuidance: boolean;
    seeksGuidance: boolean;
    teachingStyle?: 'directive' | 'socratic' | 'collaborative' | 'supportive';
  };
}

/**
 * Collaboration patterns and team dynamics
 */
export interface CollaborationStyle {
  teamRole: 'leader' | 'coordinator' | 'specialist' | 'supporter' | 'facilitator' | 'challenger';
  workPreference: 'autonomous' | 'collaborative' | 'guided' | 'parallel' | 'sequential';
  communicationFrequency: 'constant' | 'regular' | 'as-needed' | 'milestone-based';
  knowledgeSharing: 'proactive' | 'responsive' | 'selective' | 'comprehensive';
  conflictStyle: 'direct' | 'diplomatic' | 'mediating' | 'escalating' | 'avoiding';
  trustBuilding: {
    trustLevel: 'high' | 'moderate' | 'cautious' | 'verification-required';
    trustIndicators: string[];
    trustViolationResponse: 'forgiving' | 'cautious' | 'strict' | 'escalating';
  };
}

/**
 * Emotional intelligence and social awareness patterns
 */
export interface EmotionalIntelligence {
  empathy: 'high' | 'moderate' | 'low' | 'analytical';
  emotionalExpression: 'expressive' | 'measured' | 'reserved' | 'contextual';
  socialAwareness: 'highly-aware' | 'moderately-aware' | 'task-focused' | 'self-focused';
  motivationalFactors: string[];
  stressResponse: {
    indicators: string[];
    coping: 'problem-solving' | 'seeking-support' | 'self-regulation' | 'delegation';
    communication: 'transparent' | 'filtered' | 'minimal' | 'coded';
  };
}

/**
 * Core personality traits that define agent behavior
 */
export interface PersonalityTraits {
  core: string[];
  secondary: string[];
  situational: {
    [situation: string]: string[];
  };
  behavioral: {
    punctuality: 'early' | 'prompt' | 'flexible' | 'relaxed';
    attention: 'detail-oriented' | 'big-picture' | 'balanced' | 'context-dependent';
    persistence: 'highly-persistent' | 'moderately-persistent' | 'adaptive' | 'efficient';
    innovation: 'innovative' | 'adaptive' | 'traditional' | 'balanced';
    autonomy: 'highly-autonomous' | 'semi-autonomous' | 'guided' | 'directive-following';
  };
}

/**
 * Complete DruidPersona defining agent personality and behavioral patterns
 */
export interface DruidPersona extends BaseEntity {
  id: string;
  name: string;
  description: string;
  personaVersion: string;
  
  // Core personality components
  traits: PersonalityTraits;
  communication: CommunicationStyle;
  decisionMaking: DecisionMakingStyle;
  learning: LearningStyle;
  collaboration: CollaborationStyle;
  emotionalIntelligence: EmotionalIntelligence;
  
  // Contextual adaptations
  contextualAdaptations: {
    [context: string]: Partial<DruidPersona>;
  };
  
  // Evolution and learning
  adaptability: {
    enabled: boolean;
    learningRate: 'slow' | 'moderate' | 'fast' | 'adaptive';
    stabilityFactors: string[];
    evolutionLimits: {
      maxTraitChange: number;
      preservedCharacteristics: string[];
    };
  };
  
  // Usage tracking
  usage: {
    contextsUsed: string[];
    interactionCount: number;
    lastAdaptation?: Timestamp;
    performanceMetrics: {
      effectivenessRating: number;
      userSatisfaction: number;
      taskCompletionRate: number;
    };
  };
  
  // Metadata
  tags: string[];
  category: string;
  isTemplate: boolean;
  parentPersonaId?: string;
  
  // Compatibility and constraints
  compatibility: {
    agentTypes: string[];
    domains: string[];
    unsuitableFor: string[];
  };
}

/**
 * Persona template for creating standardized personalities
 */
export interface PersonaTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  
  // Template definition
  baseTraits: string[];
  recommendedCommunication: Partial<CommunicationStyle>;
  recommendedDecisionMaking: Partial<DecisionMakingStyle>;
  recommendedLearning: Partial<LearningStyle>;
  recommendedCollaboration: Partial<CollaborationStyle>;
  
  // Customization parameters
  parameterization: {
    adjustable: {
      trait: string;
      range: any[];
      impact: string;
      recommendation: string;
    }[];
    required: {
      trait: string;
      value: any;
      reason: string;
    }[];
  };
  
  // Use cases and examples
  useCases: string[];
  examples: {
    scenario: string;
    expectedBehavior: string;
    reasoning: string;
  }[];
  
  // Metadata
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Persona assessment and recommendation
 */
export interface PersonaAssessment {
  agentId: string;
  currentPersona: string;
  assessment: {
    effectiveness: number;
    userSatisfaction: number;
    taskAlignment: number;
    collaborationSuccess: number;
  };
  recommendations: {
    adjustments: {
      trait: string;
      currentValue: any;
      recommendedValue: any;
      reasoning: string;
      impact: 'low' | 'medium' | 'high';
    }[];
    alternativePersonas: {
      personaId: string;
      matchScore: number;
      benefits: string[];
      considerations: string[];
    }[];
  };
  dataPoints: {
    interactionCount: number;
    feedbackEvents: number;
    performanceMetrics: Record<string, number>;
    contextualData: Record<string, any>;
  };
  assessmentDate: Timestamp;
}

/**
 * Request to create a custom persona
 */
export interface CreatePersonaRequest {
  name: string;
  description: string;
  baseTemplateId?: string;
  customizations: {
    traits?: Partial<PersonalityTraits>;
    communication?: Partial<CommunicationStyle>;
    decisionMaking?: Partial<DecisionMakingStyle>;
    learning?: Partial<LearningStyle>;
    collaboration?: Partial<CollaborationStyle>;
    emotionalIntelligence?: Partial<EmotionalIntelligence>;
  };
  targetAgentTypes: string[];
  targetDomains: string[];
  tags?: string[];
}

/**
 * Persona evolution tracking
 */
export interface PersonaEvolution {
  personaId: string;
  agentId: string;
  changes: {
    timestamp: Timestamp;
    trigger: 'performance' | 'feedback' | 'context' | 'manual';
    modifications: {
      trait: string;
      oldValue: any;
      newValue: any;
      confidence: number;
    }[];
    performance: {
      before: Record<string, number>;
      after: Record<string, number>;
    };
  }[];
  stability: {
    coreTraitsStable: boolean;
    adaptationRate: number;
    evolutionDirection: string[];
  };
}
