import { Timestamp, BaseEntity, ResourceLimits } from './Types';

/**
 * Skill level definitions with proficiency indicators
 */
export type SkillLevel = 'novice' | 'intermediate' | 'expert' | 'master';

/**
 * Domain expertise area with specific skills and knowledge
 */
export interface ExpertiseArea {
  name: string;
  level: SkillLevel;
  description: string;
  skills: string[];
  certifications?: string[];
  experienceYears?: number;
  lastUpdated: Timestamp;
  validationRequired?: boolean;
}

/**
 * Tool proficiency and usage patterns
 */
export interface ToolProficiency {
  toolName: string;
  proficiencyLevel: SkillLevel;
  preferredOperations: string[];
  usagePatterns: {
    frequencyOfUse: 'rarely' | 'occasionally' | 'regularly' | 'constantly';
    typicalUseCases: string[];
    performanceMetrics: {
      averageExecutionTime: number;
      successRate: number;
      errorPatterns: string[];
    };
  };
  limitations?: string[];
  lastUsed?: Timestamp;
}

/**
 * Knowledge namespace with access patterns and expertise
 */
export interface KnowledgeNamespaceAccess {
  namespace: string;
  accessLevel: 'read' | 'write' | 'admin';
  expertiseLevel: SkillLevel;
  usagePatterns: {
    queryTypes: string[];
    frequentTopics: string[];
    accessFrequency: 'low' | 'medium' | 'high';
  };
  contributionLevel: {
    canContribute: boolean;
    contributionTypes: string[];
    qualityScore?: number;
  };
  lastAccessed?: Timestamp;
}

/**
 * Capacity and performance characteristics
 */
export interface CapacityProfile {
  maxConcurrentTasks: number;
  optimalTaskLoad: number;
  taskComplexityHandling: {
    simple: number;
    moderate: number;
    complex: number;
    expert: number;
  };
  processingSpeed: {
    averageTaskTime: number;
    taskTimeVariance: number;
    peakPerformanceHours?: string[];
  };
  qualityMetrics: {
    accuracy: number;
    consistency: number;
    reliability: number;
    adaptability: number;
  };
  scalingCharacteristics: {
    scalesLinearly: boolean;
    performanceDegradation: number;
    recoveryTime: number;
  };
}

/**
 * Learning and adaptation capabilities
 */
export interface LearningCapabilities {
  learningEnabled: boolean;
  learningRate: 'slow' | 'moderate' | 'fast' | 'adaptive';
  adaptationMethods: string[];
  knowledgeRetention: {
    shortTerm: 'low' | 'medium' | 'high';
    longTerm: 'low' | 'medium' | 'high';
    transferability: 'low' | 'medium' | 'high';
  };
  feedbackIntegration: {
    acceptsFeedback: boolean;
    feedbackTypes: string[];
    improvementTracking: boolean;
  };
  selfImprovement: {
    identifiesGaps: boolean;
    suggestsTraining: boolean;
    requestsResources: boolean;
  };
}

/**
 * Collaboration patterns and interaction preferences
 */
export interface CollaborationPatterns {
  preferredCollaborationStyle: 'independent' | 'consultative' | 'collaborative' | 'supportive';
  workingRelationships: {
    mentors: boolean;
    mentees: boolean;
    peers: boolean;
    crossDomain: boolean;
  };
  communicationPreferences: {
    synchronous: boolean;
    asynchronous: boolean;
    formal: boolean;
    informal: boolean;
  };
  knowledgeSharing: {
    sharesKnowledge: boolean;
    acceptsKnowledge: boolean;
    contributesToCommunity: boolean;
    requestsHelp: boolean;
  };
  teamDynamics: {
    leadershipRole: boolean;
    followerRole: boolean;
    coordinationRole: boolean;
    specialistRole: boolean;
  };
}

/**
 * Comprehensive specialization profile for agents
 */
export interface SpecializationProfile extends BaseEntity {
  id: string;
  name: string;
  description: string;
  domain: string;
  subDomains: string[];
  
  // Core expertise and skills
  expertiseAreas: ExpertiseArea[];
  toolProficiencies: ToolProficiency[];
  knowledgeNamespaces: KnowledgeNamespaceAccess[];
  
  // Performance and capacity
  capacity: CapacityProfile;
  resourceRequirements: ResourceLimits;
  
  // Learning and adaptation
  learning: LearningCapabilities;
  
  // Collaboration and interaction
  collaboration: CollaborationPatterns;
  
  // Specialization metadata
  maturityLevel: SkillLevel;
  certificationLevel?: string;
  lastValidation?: Timestamp;
  validationFrequency?: 'monthly' | 'quarterly' | 'annually' | 'on-demand';
  
  // Evolution tracking
  evolution: {
    initialVersion: string;
    currentVersion: string;
    majorChanges: {
      timestamp: Timestamp;
      changeType: 'skill-added' | 'skill-improved' | 'domain-expanded' | 'capacity-increased';
      description: string;
      impact: 'minor' | 'moderate' | 'major';
    }[];
    performanceTrends: {
      period: string;
      metrics: Record<string, number>;
      improvements: string[];
      regressions: string[];
    }[];
  };
  
  // Metadata and classification
  tags: string[];
  category: string;
  isTemplate: boolean;
  parentProfileId?: string;
  
  // Validation and quality
  validation: {
    isValidated: boolean;
    validatedBy?: string;
    validationDate?: Timestamp;
    validationCriteria: string[];
    validationScore?: number;
  };
}

/**
 * Specialization template for creating standardized profiles
 */
export interface SpecializationTemplate {
  id: string;
  name: string;
  description: string;
  domain: string;
  category: string;
  
  // Template structure
  requiredExpertise: string[];
  recommendedTools: string[];
  suggestedKnowledgeNamespaces: string[];
  baseCapacity: Partial<CapacityProfile>;
  
  // Customization options
  parameterization: {
    adjustable: {
      parameter: string;
      type: 'expertise' | 'tool' | 'namespace' | 'capacity';
      options: any[];
      impact: string;
    }[];
    required: {
      parameter: string;
      value: any;
      reason: string;
    }[];
  };
  
  // Progression paths
  progression: {
    novice: Partial<SpecializationProfile>;
    intermediate: Partial<SpecializationProfile>;
    expert: Partial<SpecializationProfile>;
    master: Partial<SpecializationProfile>;
  };
  
  // Usage and examples
  useCases: string[];
  examples: {
    scenario: string;
    requiredCapabilities: string[];
    expectedPerformance: Record<string, number>;
  }[];
  
  // Metadata
  tags: string[];
  compatibleAgentTypes: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Specialization assessment and recommendations
 */
export interface SpecializationAssessment {
  profileId: string;
  agentId: string;
  assessmentDate: Timestamp;
  
  // Performance analysis
  performance: {
    overall: number;
    byExpertiseArea: Record<string, number>;
    byTool: Record<string, number>;
    byNamespace: Record<string, number>;
  };
  
  // Gap analysis
  gaps: {
    missingExpertise: string[];
    underutilizedTools: string[];
    inaccessibleNamespaces: string[];
    capacityBottlenecks: string[];
  };
  
  // Recommendations
  recommendations: {
    skillDevelopment: {
      area: string;
      currentLevel: SkillLevel;
      targetLevel: SkillLevel;
      priority: 'low' | 'medium' | 'high';
      estimatedTime: string;
      resources: string[];
    }[];
    toolTraining: {
      tool: string;
      currentProficiency: SkillLevel;
      targetProficiency: SkillLevel;
      trainingType: string;
      priority: 'low' | 'medium' | 'high';
    }[];
    capacityOptimization: {
      area: string;
      currentValue: number;
      recommendedValue: number;
      benefit: string;
      implementation: string;
    }[];
  };
  
  // Future growth path
  growthPath: {
    nextMilestone: string;
    requiredDevelopment: string[];
    estimatedTimeframe: string;
    expectedBenefits: string[];
  };
}

/**
 * Request to create a specialization profile
 */
export interface CreateSpecializationRequest {
  name: string;
  description: string;
  domain: string;
  subDomains?: string[];
  baseTemplateId?: string;
  customizations: {
    expertiseAreas: Partial<ExpertiseArea>[];
    toolProficiencies: Partial<ToolProficiency>[];
    knowledgeNamespaces: string[];
    capacity?: Partial<CapacityProfile>;
    learning?: Partial<LearningCapabilities>;
    collaboration?: Partial<CollaborationPatterns>;
  };
  targetSkillLevel: SkillLevel;
  tags?: string[];
}

/**
 * Specialization matching for agent assignment
 */
export interface SpecializationMatch {
  profileId: string;
  agentId: string;
  taskRequirements: string[];
  matchScore: number;
  matchDetails: {
    expertiseMatch: number;
    toolMatch: number;
    capacityMatch: number;
    availabilityMatch: number;
  };
  suitabilityFactors: {
    strengths: string[];
    concerns: string[];
    recommendations: string[];
  };
  alternativeProfiles?: {
    profileId: string;
    matchScore: number;
    differentiators: string[];
  }[];
}
