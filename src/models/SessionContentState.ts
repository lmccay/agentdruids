/**
 * Session-Isolated Content Storage Manager
 * 
 * Manages content storage with session isolation to prevent
 * conflicts between concurrent coordination sessions.
 */

export interface SessionContent {
  contentId: string;
  sessionId: string;
  contentType: 'step' | 'final_result' | 'publication';
  data: any;
  metadata: {
    createdAt: Date;
    agentId?: string;
    stepNumber?: number;
    publishPath?: string;
  };
}

export interface ContentStorageOptions {
  /** Base directory for content storage */
  baseDirectory: string;
  /** Whether to use session-specific subdirectories */
  useSessionDirectories: boolean;
  /** Maximum content size in bytes */
  maxContentSize: number;
  /** Content retention time in milliseconds */
  retentionTimeMs: number;
}

export interface SessionContentManager {
  /**
   * Store step content for a specific session
   */
  storeStepContent(
    sessionId: string,
    stepId: string,
    stepData: any,
    agentId?: string
  ): Promise<string>;

  /**
   * Store final coordination result for a session
   */
  storeFinalResult(
    sessionId: string,
    result: any
  ): Promise<string>;

  /**
   * Publish content to session-isolated WorldTree paths
   */
  publishToSessionWorldTree(
    sessionId: string,
    content: string,
    publishPaths: string[],
    metadata?: any
  ): Promise<void>;

  /**
   * Retrieve content by session and content ID
   */
  getSessionContent(
    sessionId: string,
    contentId: string
  ): Promise<SessionContent | null>;

  /**
   * List all content for a session
   */
  listSessionContent(sessionId: string): Promise<SessionContent[]>;

  /**
   * Clean up content for completed sessions
   */
  cleanupSession(sessionId: string): Promise<void>;

  /**
   * Perform maintenance: clean old sessions, check disk usage
   */
  performMaintenance(): Promise<void>;

  /**
   * Get session content directory path
   */
  getSessionContentPath(sessionId: string): string;

  /**
   * Check if content conflicts with other sessions
   */
  checkContentConflicts(
    sessionId: string,
    publishPaths: string[]
  ): Promise<string[]>;
}