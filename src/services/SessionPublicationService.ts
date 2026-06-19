import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DatabaseService } from './DatabaseService';
import type { Publisher } from './publishing/Publisher';
import type {
  ContributionRecord,
  PublicationRecord,
  PublishingMode,
  SessionRecord,
} from './publishing/types';
import { SummaryPublisher } from './publishing/SummaryPublisher';
import { RawPublisher } from './publishing/RawPublisher';
import { ReportPublisher } from './publishing/ReportPublisher';
import { DatasetPublisher } from './publishing/DatasetPublisher';
import { TranscriptPublisher } from './publishing/TranscriptPublisher';

const DEFAULT_MODE = 'report';
const SESSIONS_BASE_DIR = process.env['SESSION_PUBLICATIONS_DIR'] || '/app/data/sessions';

interface ModeRow {
  id: string;
  name: string;
  description: string;
  output_format: PublishingMode['outputFormat'];
  includes_synthesis: boolean;
  includes_contributions: boolean;
  includes_transcript: boolean;
  default_retention_days: number | null;
  enabled: boolean;
}

export class SessionPublicationService {
  private db: DatabaseService;
  private modesByName: Map<string, PublishingMode> = new Map();
  private publishersByMode: Map<string, Publisher> = new Map();
  private modesLoaded = false;

  constructor(db?: DatabaseService) {
    this.db = db ?? DatabaseService.getInstance();
    this.registerBuiltInPublishers();
  }

  registerPublisher(publisher: Publisher): void {
    this.publishersByMode.set(publisher.modeName, publisher);
  }

  private registerBuiltInPublishers(): void {
    [
      new SummaryPublisher(),
      new RawPublisher(),
      new ReportPublisher(),
      new DatasetPublisher(),
      new TranscriptPublisher(),
    ].forEach((p) => this.registerPublisher(p));
  }

  private async loadModes(force = false): Promise<void> {
    if (this.modesLoaded && !force) return;
    const result = await this.db.query<ModeRow>(
      `SELECT id, name, description, output_format,
              includes_synthesis, includes_contributions, includes_transcript,
              default_retention_days, enabled
       FROM druids_core.publishing_modes
       WHERE enabled = true`
    );
    this.modesByName.clear();
    for (const row of result.rows) {
      this.modesByName.set(row.name, {
        id: row.id,
        name: row.name,
        description: row.description,
        outputFormat: row.output_format,
        includesSynthesis: row.includes_synthesis,
        includesContributions: row.includes_contributions,
        includesTranscript: row.includes_transcript,
        defaultRetentionDays: row.default_retention_days,
        enabled: row.enabled,
      });
    }
    this.modesLoaded = true;
  }

  /**
   * Ensure a coordination_sessions row exists for this session. Idempotent —
   * safe to call repeatedly. Used early in session lifecycle so sub-contributions
   * captured during tool execution have a valid FK target.
   */
  async ensureSessionRecord(params: {
    sessionId: string;
    coordinatorAgentId?: string | null;
    realmId?: string | null;
    prompt?: string;
    participantAgentIds?: string[];
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO druids_core.coordination_sessions
         (session_id, coordinator_agent_id, realm_id, prompt, status, started_at, participant_agent_ids, metadata)
       VALUES ($1::varchar, $2, $3, $4, 'in_progress', NOW(), $5, '{}'::jsonb)
       ON CONFLICT (session_id) DO NOTHING`,
      [
        params.sessionId,
        params.coordinatorAgentId ?? null,
        params.realmId ?? null,
        params.prompt ?? '',
        params.participantAgentIds ?? [],
      ]
    );
  }

  async persistSession(session: SessionRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO druids_core.coordination_sessions
         (session_id, coordinator_agent_id, realm_id, prompt, status,
          started_at, completed_at, participant_agent_ids, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (session_id) DO UPDATE SET
         coordinator_agent_id = EXCLUDED.coordinator_agent_id,
         realm_id = EXCLUDED.realm_id,
         prompt = EXCLUDED.prompt,
         status = EXCLUDED.status,
         completed_at = EXCLUDED.completed_at,
         participant_agent_ids = EXCLUDED.participant_agent_ids,
         metadata = EXCLUDED.metadata`,
      [
        session.sessionId,
        session.coordinatorAgentId,
        session.realmId,
        session.prompt,
        session.status,
        session.startedAt,
        session.completedAt,
        session.participantAgentIds,
        JSON.stringify(session.metadata ?? {}),
      ]
    );
  }

  async persistContributions(contributions: ContributionRecord[]): Promise<void> {
    for (const c of contributions) {
      await this.db.query(
        `INSERT INTO druids_core.session_contributions
           (session_id, step_number, sub_step_number, agent_id, agent_role, agent_type, action_type,
            description, content, content_format, token_count, duration_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (session_id, step_number, sub_step_number) DO UPDATE SET
           content = EXCLUDED.content,
           description = EXCLUDED.description,
           action_type = EXCLUDED.action_type,
           agent_role = EXCLUDED.agent_role,
           agent_type = EXCLUDED.agent_type`,
        [
          c.sessionId,
          c.stepNumber,
          c.subStepNumber,
          c.agentId,
          c.agentRole,
          c.agentType,
          c.actionType,
          c.description,
          c.content,
          c.contentFormat,
          c.tokenCount,
          c.durationMs,
          c.createdAt,
        ]
      );
    }
  }

  /**
   * Record a sub-contribution captured during a parent orchestration step.
   * Auto-allocates the next sub_step_number for (session, parent step) using a
   * single INSERT with a SELECT MAX+1 — works under concurrent inserts because
   * the unique constraint will surface conflicts that we retry.
   */
  async recordSubContribution(params: {
    sessionId: string;
    parentStepNumber: number;
    agentId: string;
    agentRole?: string | null;
    agentType?: string | null;
    actionType?: string | null;
    description?: string | null;
    content: string;
    contentFormat?: 'markdown' | 'json' | 'text';
    durationMs?: number | null;
  }): Promise<void> {
    // Casts on $1::varchar / $2::integer are required because the same params
    // are used both as inserted column values and inside a WHERE comparison
    // inside the COALESCE subquery — without explicit casts, Postgres infers
    // inconsistent types ("text versus character varying", error 42P08).
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.db.query(
          `INSERT INTO druids_core.session_contributions
             (session_id, step_number, sub_step_number, agent_id, agent_role, agent_type,
              action_type, description, content, content_format, duration_ms)
           VALUES (
             $1::varchar, $2::integer,
             COALESCE(
               (SELECT MAX(sub_step_number)
                  FROM druids_core.session_contributions
                 WHERE session_id = $1::varchar AND step_number = $2::integer),
               0
             ) + 1,
             $3, $4, $5, $6, $7, $8, $9, $10
           )`,
          [
            params.sessionId,
            params.parentStepNumber,
            params.agentId,
            params.agentRole ?? null,
            params.agentType ?? null,
            params.actionType ?? null,
            params.description ?? null,
            params.content,
            params.contentFormat ?? 'markdown',
            params.durationMs ?? null,
          ]
        );
        return;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === '23505' && attempt < maxRetries - 1) {
          // Unique violation under concurrency — retry with a re-read MAX
          continue;
        }
        throw err;
      }
    }
  }

  async publish(
    session: SessionRecord,
    contributions: ContributionRecord[],
    requestedModes?: string[]
  ): Promise<PublicationRecord[]> {
    await this.loadModes();

    const modeNames = requestedModes && requestedModes.length > 0
      ? requestedModes
      : [DEFAULT_MODE];

    // Re-load all contributions from DB so publishers see sub-contributions
    // recorded by the tool layer (delegate_task, message_agent) in addition to
    // the orchestration-step rows passed in from CoordinationService.
    const fullContributions = await this.loadContributions(session.sessionId);
    const merged = fullContributions.length > 0 ? fullContributions : contributions;

    const results: PublicationRecord[] = [];
    for (const modeName of modeNames) {
      const result = await this.publishOne(session, merged, modeName);
      results.push(result);
    }
    return results;
  }

  private async loadContributions(sessionId: string): Promise<ContributionRecord[]> {
    interface Row {
      session_id: string;
      step_number: number;
      sub_step_number: number;
      agent_id: string;
      agent_role: string | null;
      agent_type: string | null;
      action_type: string | null;
      description: string | null;
      content: string;
      content_format: 'markdown' | 'json' | 'text';
      token_count: number | null;
      duration_ms: number | null;
      created_at: Date;
    }
    const { rows } = await this.db.query<Row>(
      `SELECT session_id, step_number, sub_step_number, agent_id, agent_role,
              agent_type, action_type, description, content, content_format,
              token_count, duration_ms, created_at
         FROM druids_core.session_contributions
        WHERE session_id = $1::varchar
        ORDER BY step_number, sub_step_number`,
      [sessionId]
    );
    return rows.map((r) => ({
      sessionId: r.session_id,
      stepNumber: r.step_number,
      subStepNumber: r.sub_step_number,
      agentId: r.agent_id,
      agentRole: r.agent_role,
      agentType: r.agent_type,
      actionType: r.action_type,
      description: r.description,
      content: r.content,
      contentFormat: r.content_format,
      tokenCount: r.token_count,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    }));
  }

  private async publishOne(
    session: SessionRecord,
    contributions: ContributionRecord[],
    modeName: string
  ): Promise<PublicationRecord> {
    const mode = this.modesByName.get(modeName);
    if (!mode) {
      return this.recordFailedPublication(session.sessionId, modeName, `Unknown mode: ${modeName}`);
    }
    const publisher = this.publishersByMode.get(modeName);
    if (!publisher) {
      return this.recordFailedPublication(session.sessionId, modeName, `No publisher registered for mode: ${modeName}`);
    }

    try {
      const artifact = publisher.render(session, contributions);

      const sessionDir = path.join(SESSIONS_BASE_DIR, session.sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      const filename = `${modeName}.${artifact.fileExtension}`;
      const filePath = path.join(sessionDir, filename);
      await fs.writeFile(filePath, artifact.content, 'utf-8');

      const checksum = crypto.createHash('sha256').update(artifact.content).digest('hex');
      const sizeBytes = Buffer.byteLength(artifact.content, 'utf-8');
      const publishedAt = new Date();
      const expiresAt = mode.defaultRetentionDays != null
        ? new Date(publishedAt.getTime() + mode.defaultRetentionDays * 24 * 60 * 60 * 1000)
        : null;
      const contentUri = `file://${filePath}`;

      const insert = await this.db.query<{ id: string }>(
        `INSERT INTO druids_core.session_publications
           (session_id, mode_id, status, content_uri, content_size_bytes,
            checksum, published_at, expires_at, metadata)
         VALUES ($1, $2, 'published', $3, $4, $5, $6, $7, $8)
         ON CONFLICT (session_id, mode_id) DO UPDATE SET
           status = 'published',
           content_uri = EXCLUDED.content_uri,
           content_size_bytes = EXCLUDED.content_size_bytes,
           checksum = EXCLUDED.checksum,
           published_at = EXCLUDED.published_at,
           expires_at = EXCLUDED.expires_at,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [
          session.sessionId,
          mode.id,
          contentUri,
          sizeBytes,
          checksum,
          publishedAt,
          expiresAt,
          JSON.stringify({ outputFormat: artifact.contentFormat }),
        ]
      );

      const id = insert.rows[0]?.id ?? '';
      console.log(`📤 Published session ${session.sessionId} as ${modeName} → ${filePath}`);
      return {
        id,
        sessionId: session.sessionId,
        modeId: mode.id,
        modeName,
        status: 'published',
        contentUri,
        contentSizeBytes: sizeBytes,
        publishedAt,
        expiresAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to publish session ${session.sessionId} as ${modeName}:`, message);
      return this.recordFailedPublication(session.sessionId, modeName, message);
    }
  }

  private async recordFailedPublication(
    sessionId: string,
    modeName: string,
    errorMessage: string
  ): Promise<PublicationRecord> {
    const mode = this.modesByName.get(modeName);
    const placeholderUri = `failed://${modeName}`;
    if (mode) {
      try {
        await this.db.query(
          `INSERT INTO druids_core.session_publications
             (session_id, mode_id, status, content_uri, metadata)
           VALUES ($1, $2, 'failed', $3, $4)
           ON CONFLICT (session_id, mode_id) DO UPDATE SET
             status = 'failed',
             metadata = EXCLUDED.metadata,
             updated_at = CURRENT_TIMESTAMP`,
          [sessionId, mode.id, placeholderUri, JSON.stringify({ error: errorMessage })]
        );
      } catch (err) {
        console.error(`Failed to record publication failure for ${sessionId}/${modeName}:`, err);
      }
    }
    return {
      id: '',
      sessionId,
      modeId: mode?.id ?? '',
      modeName,
      status: 'failed',
      contentUri: placeholderUri,
      contentSizeBytes: null,
      publishedAt: null,
      expiresAt: null,
    };
  }

  async sweepExpired(now: Date = new Date()): Promise<Array<{ id: string; contentUri: string }>> {
    const { rows } = await this.db.query<{ id: string; content_uri: string }>(
      `UPDATE druids_core.session_publications
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'published'
         AND expires_at IS NOT NULL
         AND expires_at < $1
       RETURNING id, content_uri`,
      [now]
    );
    return rows.map((r) => ({ id: r.id, contentUri: r.content_uri }));
  }
}

let singleton: SessionPublicationService | undefined;
export function getSessionPublicationService(): SessionPublicationService {
  if (!singleton) singleton = new SessionPublicationService();
  return singleton;
}
