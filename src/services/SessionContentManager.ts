/**
 * Session-Isolated Content Storage Manager Implementation
 * 
 * Provides session-scoped content storage to prevent conflicts
 * between concurrent coordination sessions.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  SessionContent,
  SessionContentManager,
  ContentStorageOptions
} from '../models/SessionContentState';

export class SessionContentManagerImpl implements SessionContentManager {
  private options: ContentStorageOptions;
  private sessionContentCache: Map<string, Map<string, SessionContent>> = new Map();
  private maintenanceInterval: NodeJS.Timeout | null = null;

  constructor(options?: Partial<ContentStorageOptions>) {
    this.options = {
      baseDirectory: './data/published_content',
      useSessionDirectories: true,
      maxContentSize: 10 * 1024 * 1024, // 10MB
      retentionTimeMs: 24 * 60 * 60 * 1000, // 24 hours
      ...options
    };

    // Start maintenance interval
    this.startMaintenance();
  }

  async storeStepContent(
    sessionId: string,
    stepId: string,
    stepData: any,
    agentId?: string
  ): Promise<string> {
    const contentId = `step-${stepId}`;
    const content: SessionContent = {
      contentId,
      sessionId,
      contentType: 'step',
      data: stepData,
      metadata: {
        createdAt: new Date(),
        ...(agentId && { agentId }),
        ...(stepData.stepNumber && { stepNumber: stepData.stepNumber })
      }
    };

    await this.storeContent(content);
    return contentId;
  }

  async storeFinalResult(sessionId: string, result: any): Promise<string> {
    const contentId = `final-result-${Date.now()}`;
    const content: SessionContent = {
      contentId,
      sessionId,
      contentType: 'final_result',
      data: result,
      metadata: {
        createdAt: new Date()
      }
    };

    await this.storeContent(content);
    return contentId;
  }

  async publishToSessionWorldTree(
    sessionId: string,
    content: string,
    publishPaths: string[],
    metadata?: any
  ): Promise<void> {
    // Check for conflicts with other sessions
    const conflicts = await this.checkContentConflicts(sessionId, publishPaths);
    if (conflicts.length > 0) {
      console.warn(`⚠️  Publishing conflicts detected for session ${sessionId}:`, conflicts);
    }

    for (const publishPath of publishPaths) {
      const contentId = `publication-${publishPath.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}`;
      const sessionContent: SessionContent = {
        contentId,
        sessionId,
        contentType: 'publication',
        data: {
          content,
          originalPublishPath: publishPath,
          metadata
        },
        metadata: {
          createdAt: new Date(),
          publishPath: this.getSessionAwarePublishPath(sessionId, publishPath)
        }
      };

      await this.storeContent(sessionContent);
      console.log(`📚 Published to session-isolated path: ${sessionContent.metadata.publishPath}`);
    }
  }

  async getSessionContent(sessionId: string, contentId: string): Promise<SessionContent | null> {
    // Check cache first
    const sessionCache = this.sessionContentCache.get(sessionId);
    if (sessionCache?.has(contentId)) {
      return sessionCache.get(contentId) || null;
    }

    // Load from disk
    try {
      const filePath = this.getContentFilePath(sessionId, contentId);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const content: SessionContent = JSON.parse(fileContent);
      
      // Cache it
      this.cacheContent(content);
      return content;
    } catch (error) {
      return null;
    }
  }

  async listSessionContent(sessionId: string): Promise<SessionContent[]> {
    const sessionDir = this.getSessionContentPath(sessionId);
    
    try {
      const files = await fs.readdir(sessionDir);
      const contentList: SessionContent[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(sessionDir, file);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const content: SessionContent = JSON.parse(fileContent);
            contentList.push(content);
          } catch (error) {
            console.warn(`Failed to read content file ${file}:`, error);
          }
        }
      }

      return contentList.sort((a, b) => 
        a.metadata.createdAt.getTime() - b.metadata.createdAt.getTime()
      );
    } catch (error) {
      return [];
    }
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionContentPath(sessionId);
    
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      this.sessionContentCache.delete(sessionId);
      console.log(`🧹 Cleaned up session content: ${sessionId}`);
    } catch (error) {
      console.warn(`Failed to cleanup session ${sessionId}:`, error);
    }
  }

  async performMaintenance(): Promise<void> {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - this.options.retentionTimeMs);

    try {
      const baseDir = this.options.baseDirectory;
      if (this.options.useSessionDirectories) {
        const sessionsDir = path.join(baseDir, 'sessions');
        const sessionDirs = await fs.readdir(sessionsDir).catch(() => []);

        for (const sessionDir of sessionDirs) {
          const sessionPath = path.join(sessionsDir, sessionDir);
          const stats = await fs.stat(sessionPath).catch(() => null);
          
          if (stats && stats.mtime < cutoffTime) {
            await this.cleanupSession(sessionDir);
          }
        }
      }
    } catch (error) {
      console.warn('Content maintenance error:', error);
    }
  }

  getSessionContentPath(sessionId: string): string {
    if (this.options.useSessionDirectories) {
      return path.join(this.options.baseDirectory, 'sessions', sessionId);
    } else {
      return this.options.baseDirectory;
    }
  }

  async checkContentConflicts(_sessionId: string, publishPaths: string[]): Promise<string[]> {
    const conflicts: string[] = [];

    for (const publishPath of publishPaths) {
      // Check if any other sessions are using similar paths
      // In a full implementation, this would check WorldTree namespace conflicts
      // For now, we'll check for file system conflicts
      try {
        const conflictPath = path.join(this.options.baseDirectory, 'global', 
          publishPath.replace(/[^a-zA-Z0-9]/g, '_') + '.json');
        await fs.access(conflictPath);
        conflicts.push(publishPath);
      } catch {
        // No conflict found
      }
    }

    return conflicts;
  }

  private async storeContent(content: SessionContent): Promise<void> {
    // Validate content size
    const contentSize = JSON.stringify(content).length;
    if (contentSize > this.options.maxContentSize) {
      throw new Error(`Content size ${contentSize} exceeds maximum ${this.options.maxContentSize}`);
    }

    // Ensure session directory exists
    const sessionDir = this.getSessionContentPath(content.sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    // Store to disk
    const filePath = this.getContentFilePath(content.sessionId, content.contentId);
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf8');

    // Cache it
    this.cacheContent(content);

    console.log(`💾 Stored session content: ${content.sessionId}/${content.contentId}`);
  }

  private getContentFilePath(sessionId: string, contentId: string): string {
    const sessionDir = this.getSessionContentPath(sessionId);
    return path.join(sessionDir, `${contentId}.json`);
  }

  private getSessionAwarePublishPath(sessionId: string, originalPath: string): string {
    // Transform global paths to session-scoped paths
    if (originalPath.startsWith('worldtree://public/')) {
      return originalPath.replace('worldtree://public/', `worldtree://sessions/${sessionId}/`);
    }
    return `worldtree://sessions/${sessionId}/${originalPath}`;
  }

  private cacheContent(content: SessionContent): void {
    if (!this.sessionContentCache.has(content.sessionId)) {
      this.sessionContentCache.set(content.sessionId, new Map());
    }
    this.sessionContentCache.get(content.sessionId)!.set(content.contentId, content);
  }

  private startMaintenance(): void {
    this.maintenanceInterval = setInterval(() => {
      this.performMaintenance().catch(error => {
        console.error('Session content maintenance error:', error);
      });
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Clean shutdown
   */
  shutdown(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
  }
}