import fs from 'fs/promises';
import { SessionPublicationService, getSessionPublicationService } from './SessionPublicationService';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class RetentionSweeperService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly pubService: SessionPublicationService;
  private readonly intervalMs: number;

  constructor(opts?: { pubService?: SessionPublicationService; intervalMs?: number }) {
    this.pubService = opts?.pubService ?? getSessionPublicationService();
    this.intervalMs = opts?.intervalMs ?? this.resolveIntervalFromEnv();
  }

  private resolveIntervalFromEnv(): number {
    const raw = process.env['RETENTION_SWEEP_INTERVAL_MS'];
    if (!raw) return DEFAULT_INTERVAL_MS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
  }

  start(): void {
    if (this.timer) return;
    if (process.env['NODE_ENV'] === 'test') {
      console.log('🧹 RetentionSweeper disabled in test environment');
      return;
    }
    console.log(`🧹 RetentionSweeper started (interval: ${this.intervalMs}ms)`);
    setTimeout(() => void this.tick(), 30_000);
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🧹 RetentionSweeper stopped');
    }
  }

  async tick(): Promise<{ expired: number; filesRemoved: number }> {
    if (this.running) return { expired: 0, filesRemoved: 0 };
    this.running = true;
    try {
      const expired = await this.pubService.sweepExpired();
      let filesRemoved = 0;
      for (const pub of expired) {
        if (pub.contentUri.startsWith('file://')) {
          const filePath = pub.contentUri.slice('file://'.length);
          try {
            await fs.unlink(filePath);
            filesRemoved++;
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
              console.warn(`Failed to remove expired artifact ${filePath}:`, err);
            }
          }
        }
      }
      if (expired.length > 0) {
        console.log(`🧹 Sweeper: expired=${expired.length} filesRemoved=${filesRemoved}`);
      }
      return { expired: expired.length, filesRemoved };
    } catch (err) {
      console.error('🧹 Sweeper tick failed:', err);
      return { expired: 0, filesRemoved: 0 };
    } finally {
      this.running = false;
    }
  }
}

let singleton: RetentionSweeperService | undefined;
export function getRetentionSweeperService(): RetentionSweeperService {
  if (!singleton) singleton = new RetentionSweeperService();
  return singleton;
}
