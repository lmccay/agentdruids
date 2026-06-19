export interface PublishingMode {
  id: string;
  name: string;
  description: string;
  outputFormat: 'markdown' | 'json' | 'jsonl' | 'csv' | 'text';
  includesSynthesis: boolean;
  includesContributions: boolean;
  includesTranscript: boolean;
  defaultRetentionDays: number | null;
  enabled: boolean;
}

export interface SessionRecord {
  sessionId: string;
  coordinatorAgentId: string | null;
  realmId: string | null;
  prompt: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  participantAgentIds: string[];
  metadata: Record<string, unknown>;
  synthesis: string | null;
}

export interface ContributionRecord {
  sessionId: string;
  stepNumber: number;
  /** 0 = the orchestration step itself; >0 = a sub-contribution within that step. */
  subStepNumber: number;
  agentId: string;
  /** Stable agent type for cross-session analytics: druid, elemental, etc. */
  agentRole: string | null;
  agentType: string | null;
  actionType: string | null;
  description: string | null;
  content: string;
  contentFormat: 'markdown' | 'json' | 'text';
  tokenCount: number | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface RenderedArtifact {
  content: string;
  contentFormat: PublishingMode['outputFormat'];
  fileExtension: string;
}

export interface PublicationRecord {
  id: string;
  sessionId: string;
  modeId: string;
  modeName: string;
  status: 'pending' | 'published' | 'expired' | 'archived' | 'failed';
  contentUri: string;
  contentSizeBytes: number | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
}
