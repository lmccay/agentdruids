import { DatabaseService } from './DatabaseService';
import { getEmbeddingProvider } from './EmbeddingProvider';

/**
 * WorldTreeQueryService — the single owner of every SQL statement that powers
 * the read-only WorldTree discovery surface (Phase A).
 *
 * Tools, resources, and REST routes call into this service; they never write
 * SQL themselves. Keeping all WorldTree queries in one file makes the surface
 * auditable and indexable: when a query is slow, there is exactly one place to
 * look.
 *
 * All queries serve from existing tables (coordination_sessions,
 * session_contributions, session_publications, publishing_modes). No new ML,
 * no embeddings, no background jobs — text matching (ILIKE) only.
 *
 * Forward-compatibility with success metrics (Phase F) is honored without a
 * schema change: getSession returns an always-empty `outcomes` array, and
 * worldtreeHealth reports `outcomesAttachedCount: 0`. When session_outcomes
 * lands, these populate via JOIN without changing the contract.
 *
 * See docs/phase-a-worldtree-discovery.md.
 */

/** Default page sizes (see the doc's "Pagination defaults" open question). */
export const DEFAULT_SESSION_LIMIT = 50;
export const DEFAULT_CONTRIBUTION_LIMIT = 100;
export const DEFAULT_DOCUMENT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface SessionSummary {
  sessionId: string;
  status: string;
  coordinatorAgentId: string | null;
  realmId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  participantAgentIds: string[];
}

export interface SessionContribution {
  sessionId: string;
  stepNumber: number;
  subStepNumber: number;
  agentId: string;
  agentRole: string | null;
  agentType: string | null;
  actionType: string | null;
  description: string | null;
  content: string;
  contentFormat: string;
  tokenCount: number | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface DocumentScope {
  scopeType: string;       // 'global' | 'realm' | 'agent' | 'session'
  scopeRef: string | null; // realm/agent/session id; null for global
}

export interface DocumentSummary {
  id: string;
  sourceUri: string;
  title: string | null;
  sourceFormat: string | null;
  namespace: string;
  accessLevel: string;
  checksum: string | null;
  fetchedAt: Date | null;
  createdAt: Date;
  formats: string[];
  scopes?: DocumentScope[];
}

export interface DocumentRendering {
  format: string;
  contentUri: string;
  contentSizeBytes: number | null;
  checksum: string | null;
}

export interface WorldTreeChunk {
  chunkIndex: number;
  text: string;
  metadata: Record<string, unknown>;
}

export interface ChunkSearchResult {
  documentId: string;
  sourceUri: string;
  title: string | null;
  chunkIndex: number;
  text: string;
  headings: unknown;
  rank: number;
  // Provenance (for citations / deterministic references)
  sourceFormat: string | null;
  fetchedAt: Date | null;
  checksum: string | null;
}

/** Realm scope for retrieval: in-scope = global ∪ these realms. Omit for no filter. */
export interface ScopeFilter {
  realms: string[];
}

export type ScopeAssoc = { scopeType: 'global' | 'realm' | 'agent' | 'session'; scopeRef?: string | null };

export interface KnowledgeGap {
  id: string;
  query: string;
  realms: string[];
  agentId: string | null;
  sessionId: string | null;
  hitCount: number;
  status: string;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface SessionPublication {
  id: string;
  sessionId: string;
  modeName: string;
  status: string;
  contentUri: string;
  contentSizeBytes: number | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
}

// Input DTOs are loose bags assembled from query strings / tool args, so every
// optional field may be explicitly undefined (exactOptionalPropertyTypes).
export interface ListSessionsFilters {
  status?: string | undefined;
  coordinatorId?: string | undefined;
  realmId?: string | undefined;
  since?: string | undefined;
  until?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  /** Phase F: filter to sessions that have attached outcome metrics. Validated, ignored in Phase A. */
  hasOutcomes?: boolean | undefined;
}

export interface SearchContributionsFilters {
  text?: string | undefined;
  agentId?: string | undefined;
  agentRole?: string | undefined;
  actionType?: string | undefined;
  sessionId?: string | undefined;
  since?: string | undefined;
  until?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export type AggregateGroupBy = 'agent_id' | 'agent_role' | 'action_type' | 'day';

const AGGREGATE_COLUMNS: Record<AggregateGroupBy, string> = {
  agent_id: 'agent_id',
  agent_role: 'agent_role',
  action_type: 'action_type',
  day: "DATE_TRUNC('day', created_at)",
};

interface SessionRow {
  session_id: string;
  status: string;
  coordinator_agent_id: string | null;
  realm_id: string | null;
  prompt: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  participant_agent_ids: string[] | null;
  metadata: Record<string, unknown> | null;
}

interface ContributionRow {
  session_id: string;
  step_number: number;
  sub_step_number: number;
  agent_id: string;
  agent_role: string | null;
  agent_type: string | null;
  action_type: string | null;
  description: string | null;
  content: string;
  content_format: string;
  token_count: number | null;
  duration_ms: number | null;
  created_at: Date;
}

interface PublicationRow {
  id: string;
  session_id: string;
  mode_name: string;
  status: string;
  content_uri: string;
  content_size_bytes: string | number | null;
  published_at: Date | null;
  expires_at: Date | null;
}

interface DocumentRow {
  id: string;
  source_uri: string;
  title: string | null;
  source_format: string | null;
  namespace: string;
  access_level: string;
  checksum: string | null;
  fetched_at: Date | null;
  created_at: Date;
}

function mapDocumentRow(r: DocumentRow & { formats?: string[] | null; scopes?: DocumentScope[] | null }): DocumentSummary {
  return {
    id: r.id,
    sourceUri: r.source_uri,
    title: r.title,
    sourceFormat: r.source_format,
    namespace: r.namespace,
    accessLevel: r.access_level,
    checksum: r.checksum,
    fetchedAt: r.fetched_at,
    createdAt: r.created_at,
    formats: r.formats ?? [],
    scopes: r.scopes ?? [],
  };
}

interface ChunkSearchRow {
  source_id: string;
  chunk_index: number;
  text: string;
  metadata: Record<string, unknown> | null;
  source_uri: string;
  title: string | null;
  rank: number;
  source_format: string | null;
  fetched_at: Date | null;
  checksum: string | null;
}

// EXISTS clause restricting a document to the in-scope set (global ∪ realms).
const SCOPE_EXISTS = (realmsParam: string): string =>
  `EXISTS (SELECT 1 FROM druids_core.worldtree_item_scopes s
            WHERE s.item_type = 'document' AND s.item_id = d.id::text
              AND (s.scope_type = 'global'
                   OR (s.scope_type = 'realm' AND s.scope_ref = ANY(${realmsParam}::text[]))))`;

function mapChunkSearchRow(r: ChunkSearchRow): ChunkSearchResult {
  return {
    documentId: r.source_id,
    sourceUri: r.source_uri,
    title: r.title,
    chunkIndex: r.chunk_index,
    text: r.text,
    headings: (r.metadata ?? {})['headings'] ?? null,
    rank: Number(r.rank),
    sourceFormat: r.source_format,
    fetchedAt: r.fetched_at,
    checksum: r.checksum,
  };
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit == null || Number.isNaN(limit)) return fallback;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
}

function clampOffset(offset: number | undefined): number {
  if (offset == null || Number.isNaN(offset) || offset < 0) return 0;
  return Math.floor(offset);
}

function mapSessionRow(r: SessionRow): SessionSummary {
  return {
    sessionId: r.session_id,
    status: r.status,
    coordinatorAgentId: r.coordinator_agent_id,
    realmId: r.realm_id,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    participantAgentIds: r.participant_agent_ids ?? [],
  };
}

function mapContributionRow(r: ContributionRow): SessionContribution {
  return {
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
  };
}

function mapPublicationRow(r: PublicationRow): SessionPublication {
  return {
    id: r.id,
    sessionId: r.session_id,
    modeName: r.mode_name,
    status: r.status,
    contentUri: r.content_uri,
    contentSizeBytes: r.content_size_bytes == null ? null : Number(r.content_size_bytes),
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
  };
}

export class WorldTreeQueryService {
  private db: DatabaseService;

  constructor(db?: DatabaseService) {
    this.db = db ?? DatabaseService.getInstance();
  }

  /** Paginated index of sessions, newest first, with optional filters. */
  async listSessions(filters: ListSessionsFilters = {}): Promise<{ sessions: SessionSummary[]; limit: number; offset: number }> {
    const limit = clampLimit(filters.limit, DEFAULT_SESSION_LIMIT);
    const offset = clampOffset(filters.offset);
    const { rows } = await this.db.query<SessionRow>(
      `SELECT session_id, status, coordinator_agent_id, realm_id, prompt,
              started_at, completed_at, participant_agent_ids, metadata
         FROM druids_core.coordination_sessions
        WHERE ($1::varchar IS NULL OR status = $1::varchar)
          AND ($2::varchar IS NULL OR coordinator_agent_id = $2::varchar)
          AND ($3::varchar IS NULL OR realm_id = $3::varchar)
          AND ($4::timestamptz IS NULL OR started_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR started_at <= $5::timestamptz)
        ORDER BY started_at DESC
        LIMIT $6 OFFSET $7`,
      [
        filters.status ?? null,
        filters.coordinatorId ?? null,
        filters.realmId ?? null,
        filters.since ?? null,
        filters.until ?? null,
        limit,
        offset,
      ]
    );
    // Note: filters.hasOutcomes is intentionally not applied — Phase F (see docs).
    return { sessions: rows.map(mapSessionRow), limit, offset };
  }

  /** Full session record, optionally with contributions and/or publications. */
  async getSession(
    sessionId: string,
    opts: { includeContributions?: boolean; includePublications?: boolean } = {}
  ): Promise<
    | (SessionSummary & {
        prompt: string | null;
        metadata: Record<string, unknown>;
        synthesis: string | null;
        outcomes: never[];
        contributions?: SessionContribution[];
        publications?: SessionPublication[];
      })
    | null
  > {
    const { rows } = await this.db.query<SessionRow>(
      `SELECT session_id, status, coordinator_agent_id, realm_id, prompt,
              started_at, completed_at, participant_agent_ids, metadata
         FROM druids_core.coordination_sessions
        WHERE session_id = $1::varchar`,
      [sessionId]
    );
    const row = rows[0];
    if (!row) return null;

    const metadata = row.metadata ?? {};
    const synthesis = typeof metadata['synthesis'] === 'string' ? (metadata['synthesis'] as string) : null;
    const base = {
      ...mapSessionRow(row),
      prompt: row.prompt,
      metadata,
      synthesis,
      // Forward-compat (Phase F): always empty in Phase A, populated by JOIN later.
      outcomes: [] as never[],
    };

    const result: typeof base & { contributions?: SessionContribution[]; publications?: SessionPublication[] } = base;
    if (opts.includeContributions) {
      result.contributions = await this.getSessionContributions(sessionId);
    }
    if (opts.includePublications) {
      result.publications = await this.getSessionPublications(sessionId);
    }
    return result;
  }

  /** All contribution rows for a session, ordered by position. */
  async getSessionContributions(sessionId: string): Promise<SessionContribution[]> {
    const { rows } = await this.db.query<ContributionRow>(
      `SELECT session_id, step_number, sub_step_number, agent_id, agent_role,
              agent_type, action_type, description, content, content_format,
              token_count, duration_ms, created_at
         FROM druids_core.session_contributions
        WHERE session_id = $1::varchar
        ORDER BY step_number, sub_step_number`,
      [sessionId]
    );
    return rows.map(mapContributionRow);
  }

  /** Publication rows for a session, joined to mode names. */
  async getSessionPublications(sessionId: string): Promise<SessionPublication[]> {
    const { rows } = await this.db.query<PublicationRow>(
      `SELECT p.id, p.session_id, m.name AS mode_name, p.status, p.content_uri,
              p.content_size_bytes, p.published_at, p.expires_at
         FROM druids_core.session_publications p
         JOIN druids_core.publishing_modes m ON m.id = p.mode_id
        WHERE p.session_id = $1::varchar
        ORDER BY m.sort_order`,
      [sessionId]
    );
    return rows.map(mapPublicationRow);
  }

  /** A single publication for a session by mode name. */
  async getSessionPublicationByMode(sessionId: string, modeName: string): Promise<SessionPublication | null> {
    const { rows } = await this.db.query<PublicationRow>(
      `SELECT p.id, p.session_id, m.name AS mode_name, p.status, p.content_uri,
              p.content_size_bytes, p.published_at, p.expires_at
         FROM druids_core.session_publications p
         JOIN druids_core.publishing_modes m ON m.id = p.mode_id
        WHERE p.session_id = $1::varchar AND m.name = $2::varchar`,
      [sessionId, modeName]
    );
    return rows[0] ? mapPublicationRow(rows[0]) : null;
  }

  /** Sessions whose prompt matches the text (ILIKE). */
  async findSessionsByPrompt(text: string, limit?: number): Promise<SessionSummary[]> {
    const lim = clampLimit(limit, DEFAULT_SESSION_LIMIT);
    const { rows } = await this.db.query<SessionRow>(
      `SELECT session_id, status, coordinator_agent_id, realm_id, prompt,
              started_at, completed_at, participant_agent_ids, metadata
         FROM druids_core.coordination_sessions
        WHERE prompt ILIKE '%' || $1::text || '%'
        ORDER BY started_at DESC
        LIMIT $2`,
      [text, lim]
    );
    return rows.map(mapSessionRow);
  }

  /** Search contributions with AND-combined filters. */
  async searchContributions(
    filters: SearchContributionsFilters = {}
  ): Promise<{ contributions: SessionContribution[]; limit: number; offset: number }> {
    const limit = clampLimit(filters.limit, DEFAULT_CONTRIBUTION_LIMIT);
    const offset = clampOffset(filters.offset);
    const { rows } = await this.db.query<ContributionRow>(
      `SELECT session_id, step_number, sub_step_number, agent_id, agent_role,
              agent_type, action_type, description, content, content_format,
              token_count, duration_ms, created_at
         FROM druids_core.session_contributions
        WHERE ($1::varchar IS NULL OR agent_id = $1::varchar)
          AND ($2::varchar IS NULL OR agent_role = $2::varchar)
          AND ($3::varchar IS NULL OR action_type = $3::varchar)
          AND ($4::varchar IS NULL OR session_id = $4::varchar)
          AND ($5::text    IS NULL OR content ILIKE '%' || $5::text || '%')
          AND ($6::timestamptz IS NULL OR created_at >= $6::timestamptz)
          AND ($7::timestamptz IS NULL OR created_at <= $7::timestamptz)
        ORDER BY created_at DESC
        LIMIT $8 OFFSET $9`,
      [
        filters.agentId ?? null,
        filters.agentRole ?? null,
        filters.actionType ?? null,
        filters.sessionId ?? null,
        filters.text ?? null,
        filters.since ?? null,
        filters.until ?? null,
        limit,
        offset,
      ]
    );
    return { contributions: rows.map(mapContributionRow), limit, offset };
  }

  /** Grouped contribution counts, total duration, total content length. */
  async aggregateContributions(
    groupBy: AggregateGroupBy,
    filters: {
      agentId?: string | undefined;
      agentRole?: string | undefined;
      actionType?: string | undefined;
      sessionId?: string | undefined;
    } = {}
  ): Promise<Array<{ group: unknown; contributionCount: number; totalContentChars: number; avgDurationMs: number | null; distinctSessions: number }>> {
    const column = AGGREGATE_COLUMNS[groupBy];
    if (!column) {
      throw new Error(`Invalid groupBy: ${groupBy}`);
    }
    const { rows } = await this.db.query<{
      group: unknown;
      contribution_count: string;
      total_content_chars: string | null;
      avg_duration_ms: string | null;
      distinct_sessions: string;
    }>(
      `SELECT ${column} AS group,
              COUNT(*) AS contribution_count,
              SUM(LENGTH(content)) AS total_content_chars,
              AVG(duration_ms) AS avg_duration_ms,
              COUNT(DISTINCT session_id) AS distinct_sessions
         FROM druids_core.session_contributions
        WHERE ($1::varchar IS NULL OR agent_id = $1::varchar)
          AND ($2::varchar IS NULL OR agent_role = $2::varchar)
          AND ($3::varchar IS NULL OR action_type = $3::varchar)
          AND ($4::varchar IS NULL OR session_id = $4::varchar)
          AND ${column} IS NOT NULL
        GROUP BY ${column}
        ORDER BY contribution_count DESC`,
      [filters.agentId ?? null, filters.agentRole ?? null, filters.actionType ?? null, filters.sessionId ?? null]
    );
    return rows.map((r) => ({
      group: r.group,
      contributionCount: Number(r.contribution_count),
      totalContentChars: r.total_content_chars == null ? 0 : Number(r.total_content_chars),
      avgDurationMs: r.avg_duration_ms == null ? null : Number(r.avg_duration_ms),
      distinctSessions: Number(r.distinct_sessions),
    }));
  }

  /** Side-by-side comparison of two sessions: prompts, per-role counts, contribution totals. */
  async compareSessions(sessionIdA: string, sessionIdB: string): Promise<{
    a: { session: SessionSummary & { prompt: string | null }; rolesByCount: Record<string, number>; contributionCount: number } | null;
    b: { session: SessionSummary & { prompt: string | null }; rolesByCount: Record<string, number>; contributionCount: number } | null;
  }> {
    const [a, b] = await Promise.all([this.sessionComparisonSide(sessionIdA), this.sessionComparisonSide(sessionIdB)]);
    return { a, b };
  }

  private async sessionComparisonSide(sessionId: string) {
    const { rows } = await this.db.query<SessionRow>(
      `SELECT session_id, status, coordinator_agent_id, realm_id, prompt,
              started_at, completed_at, participant_agent_ids, metadata
         FROM druids_core.coordination_sessions
        WHERE session_id = $1::varchar`,
      [sessionId]
    );
    const row = rows[0];
    if (!row) return null;
    const roleRows = await this.db.query<{ agent_role: string | null; count: string }>(
      `SELECT agent_role, COUNT(*) AS count
         FROM druids_core.session_contributions
        WHERE session_id = $1::varchar
        GROUP BY agent_role`,
      [sessionId]
    );
    const rolesByCount: Record<string, number> = {};
    let contributionCount = 0;
    for (const rr of roleRows.rows) {
      const n = Number(rr.count);
      contributionCount += n;
      rolesByCount[rr.agent_role ?? 'unknown'] = n;
    }
    return { session: { ...mapSessionRow(row), prompt: row.prompt }, rolesByCount, contributionCount };
  }

  /** All contributions an agent made across sessions, paginated. */
  async agentContributions(
    agentId: string,
    pagination: { limit?: number | undefined; offset?: number | undefined } = {}
  ): Promise<{ contributions: SessionContribution[]; limit: number; offset: number }> {
    return this.searchContributions({ agentId, limit: pagination.limit, offset: pagination.offset });
  }

  /** Aggregate stats for one agent. */
  async agentSummary(agentId: string): Promise<{
    agentId: string;
    contributionCount: number;
    totalContentChars: number;
    avgDurationMs: number | null;
    distinctSessions: number;
  }> {
    const { rows } = await this.db.query<{
      contribution_count: string;
      total_content_chars: string | null;
      avg_duration_ms: string | null;
      distinct_sessions: string;
    }>(
      `SELECT COUNT(*) AS contribution_count,
              SUM(LENGTH(content)) AS total_content_chars,
              AVG(duration_ms) AS avg_duration_ms,
              COUNT(DISTINCT session_id) AS distinct_sessions
         FROM druids_core.session_contributions
        WHERE agent_id = $1::varchar`,
      [agentId]
    );
    const r = rows[0];
    return {
      agentId,
      contributionCount: r ? Number(r.contribution_count) : 0,
      totalContentChars: r && r.total_content_chars != null ? Number(r.total_content_chars) : 0,
      avgDurationMs: r && r.avg_duration_ms != null ? Number(r.avg_duration_ms) : null,
      distinctSessions: r ? Number(r.distinct_sessions) : 0,
    };
  }

  /** Timeline of an agent's contributions with summary stats. */
  async agentActivity(
    agentId: string,
    opts: { since?: string | undefined; until?: string | undefined } = {}
  ): Promise<{ summary: Awaited<ReturnType<WorldTreeQueryService['agentSummary']>>; timeline: SessionContribution[] }> {
    const summary = await this.agentSummary(agentId);
    const { contributions } = await this.searchContributions({
      agentId,
      since: opts.since,
      until: opts.until,
      limit: DEFAULT_CONTRIBUTION_LIMIT,
    });
    return { summary, timeline: contributions };
  }

  /** All sessions that ran in a realm, paginated. */
  async realmSessions(
    realmId: string,
    pagination: { limit?: number | undefined; offset?: number | undefined } = {}
  ): Promise<{ sessions: SessionSummary[]; limit: number; offset: number }> {
    return this.listSessions({ realmId, limit: pagination.limit, offset: pagination.offset });
  }

  /** The publishing_modes catalog. */
  async listModes(): Promise<Array<{
    name: string;
    description: string;
    outputFormat: string;
    includesSynthesis: boolean;
    includesContributions: boolean;
    includesTranscript: boolean;
    defaultRetentionDays: number | null;
    enabled: boolean;
  }>> {
    const { rows } = await this.db.query<{
      name: string;
      description: string;
      output_format: string;
      includes_synthesis: boolean;
      includes_contributions: boolean;
      includes_transcript: boolean;
      default_retention_days: number | null;
      enabled: boolean;
    }>(
      `SELECT name, description, output_format, includes_synthesis,
              includes_contributions, includes_transcript, default_retention_days, enabled
         FROM druids_core.publishing_modes
        ORDER BY sort_order`
    );
    return rows.map((r) => ({
      name: r.name,
      description: r.description,
      outputFormat: r.output_format,
      includesSynthesis: r.includes_synthesis,
      includesContributions: r.includes_contributions,
      includesTranscript: r.includes_transcript,
      defaultRetentionDays: r.default_retention_days,
      enabled: r.enabled,
    }));
  }

  /** Sanity-check rollup: session counts, agent activity, mode distribution. */
  async worldtreeHealth(): Promise<{
    sessionCount: number;
    sessionsByStatus: Record<string, number>;
    contributionCount: number;
    distinctAgents: number;
    publicationsByMode: Record<string, number>;
    outcomesAttachedCount: number;
  }> {
    const [statusRes, contribRes, agentRes, modeRes] = await Promise.all([
      this.db.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM druids_core.coordination_sessions GROUP BY status`
      ),
      this.db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM druids_core.session_contributions`),
      this.db.query<{ count: string }>(`SELECT COUNT(DISTINCT agent_id) AS count FROM druids_core.session_contributions`),
      this.db.query<{ mode_name: string; count: string }>(
        `SELECT m.name AS mode_name, COUNT(*) AS count
           FROM druids_core.session_publications p
           JOIN druids_core.publishing_modes m ON m.id = p.mode_id
          GROUP BY m.name`
      ),
    ]);

    const sessionsByStatus: Record<string, number> = {};
    let sessionCount = 0;
    for (const r of statusRes.rows) {
      const n = Number(r.count);
      sessionCount += n;
      sessionsByStatus[r.status] = n;
    }
    const publicationsByMode: Record<string, number> = {};
    for (const r of modeRes.rows) {
      publicationsByMode[r.mode_name] = Number(r.count);
    }
    return {
      sessionCount,
      sessionsByStatus,
      contributionCount: contribRes.rows[0] ? Number(contribRes.rows[0].count) : 0,
      distinctAgents: agentRes.rows[0] ? Number(agentRes.rows[0].count) : 0,
      publicationsByMode,
      // Forward-compat (Phase F): zero until session_outcomes exists.
      outcomesAttachedCount: 0,
    };
  }

  // ── Ingested documents (Docling) — Layer 1 lexical "talk to" surface ────────

  /** Paginated index of ingested documents (metadata + available rendering formats). */
  async listDocuments(
    filters: { sourceUri?: string | undefined; namespace?: string | undefined; since?: string | undefined; realm?: string | undefined; limit?: number | undefined; offset?: number | undefined } = {}
  ): Promise<{ documents: DocumentSummary[]; limit: number; offset: number }> {
    const limit = clampLimit(filters.limit, DEFAULT_DOCUMENT_LIMIT);
    const offset = clampOffset(filters.offset);
    const { rows } = await this.db.query<DocumentRow & { formats: string[] | null; scopes: DocumentScope[] | null }>(
      `SELECT d.id, d.source_uri, d.title, d.source_format, d.namespace, d.access_level,
              d.checksum, d.fetched_at, d.created_at,
              COALESCE(array_agg(r.format) FILTER (WHERE r.format IS NOT NULL), '{}') AS formats,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object('scopeType', s.scope_type, 'scopeRef', s.scope_ref) ORDER BY s.scope_type)
                  FROM druids_core.worldtree_item_scopes s
                 WHERE s.item_type = 'document' AND s.item_id = d.id::text
              ), '[]'::jsonb) AS scopes
         FROM druids_core.worldtree_documents d
         LEFT JOIN druids_core.document_renderings r ON r.document_id = d.id
        WHERE ($1::text IS NULL OR d.source_uri ILIKE '%' || $1::text || '%')
          AND ($2::varchar IS NULL OR d.namespace = $2::varchar)
          AND ($3::timestamptz IS NULL OR d.created_at >= $3::timestamptz)
          AND ($6::text IS NULL OR EXISTS (
                SELECT 1 FROM druids_core.worldtree_item_scopes s2
                 WHERE s2.item_type = 'document' AND s2.item_id = d.id::text
                   AND s2.scope_type = 'realm' AND s2.scope_ref = $6::text))
        GROUP BY d.id
        ORDER BY d.created_at DESC
        LIMIT $4 OFFSET $5`,
      [filters.sourceUri ?? null, filters.namespace ?? null, filters.since ?? null, limit, offset, filters.realm ?? null]
    );
    return { documents: rows.map(mapDocumentRow), limit, offset };
  }

  /** Full catalog record for one document plus its renderings (pointers, no inline text). */
  async getDocument(id: string): Promise<(DocumentSummary & { renderings: DocumentRendering[] }) | null> {
    const docRes = await this.db.query<DocumentRow>(
      `SELECT id, source_uri, title, source_format, namespace, access_level, checksum, fetched_at, created_at
         FROM druids_core.worldtree_documents WHERE id = $1::uuid`,
      [id]
    );
    const row = docRes.rows[0];
    if (!row) return null;
    const rendRes = await this.db.query<{
      format: string;
      content_uri: string;
      content_size_bytes: string | number | null;
      checksum: string | null;
    }>(
      `SELECT format, content_uri, content_size_bytes, checksum
         FROM druids_core.document_renderings WHERE document_id = $1::uuid ORDER BY format`,
      [id]
    );
    return {
      ...mapDocumentRow({ ...row, formats: rendRes.rows.map((r) => r.format) }),
      renderings: rendRes.rows.map((r) => ({
        format: r.format,
        contentUri: r.content_uri,
        contentSizeBytes: r.content_size_bytes == null ? null : Number(r.content_size_bytes),
        checksum: r.checksum,
      })),
    };
  }

  /** The readable text of a document (the inline markdown), for an agent to reason over. */
  async readDocument(id: string): Promise<{ id: string; title: string | null; sourceUri: string; contentText: string | null } | null> {
    const { rows } = await this.db.query<{ id: string; title: string | null; source_uri: string; content_text: string | null }>(
      `SELECT id, title, source_uri, content_text
         FROM druids_core.worldtree_documents WHERE id = $1::uuid`,
      [id]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, title: row.title, sourceUri: row.source_uri, contentText: row.content_text };
  }

  /** Lexical (ILIKE) search over ingested document text; returns matches with a short preview. */
  async searchDocuments(
    text: string,
    pagination: { limit?: number | undefined; offset?: number | undefined } = {}
  ): Promise<{ documents: Array<DocumentSummary & { preview: string | null }>; limit: number; offset: number }> {
    const limit = clampLimit(pagination.limit, DEFAULT_DOCUMENT_LIMIT);
    const offset = clampOffset(pagination.offset);
    const { rows } = await this.db.query<DocumentRow & { preview: string | null }>(
      `SELECT id, source_uri, title, source_format, namespace, access_level, checksum, fetched_at, created_at,
              LEFT(content_text, 240) AS preview
         FROM druids_core.worldtree_documents
        WHERE content_text ILIKE '%' || $1::text || '%'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [text, limit, offset]
    );
    return {
      documents: rows.map((r) => ({ ...mapDocumentRow({ ...r, formats: [] }), preview: r.preview })),
      limit,
      offset,
    };
  }

  /** Retrieval chunks for a document (Docling HybridChunker output), ordered. */
  async getDocumentChunks(
    documentId: string,
    pagination: { limit?: number | undefined; offset?: number | undefined } = {}
  ): Promise<{ chunks: WorldTreeChunk[]; total: number; limit: number; offset: number }> {
    const limit = clampLimit(pagination.limit, 200);
    const offset = clampOffset(pagination.offset);
    const [rowsRes, countRes] = await Promise.all([
      this.db.query<{ chunk_index: number; text: string; metadata: Record<string, unknown> | null }>(
        `SELECT chunk_index, text, metadata
           FROM druids_core.worldtree_chunks
          WHERE source_type = 'document' AND source_id = $1
          ORDER BY chunk_index
          LIMIT $2 OFFSET $3`,
        [documentId, limit, offset]
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM druids_core.worldtree_chunks WHERE source_type = 'document' AND source_id = $1`,
        [documentId]
      ),
    ]);
    return {
      chunks: rowsRes.rows.map((r) => ({ chunkIndex: r.chunk_index, text: r.text, metadata: r.metadata ?? {} })),
      total: countRes.rows[0] ? Number(countRes.rows[0].count) : 0,
      limit,
      offset,
    };
  }

  /**
   * Relevance-ranked lexical search over document chunks (Postgres full-text).
   * The retrieval primitive behind in-session RAG (rung #3). Scope is all
   * document chunks for now; realm scoping is rung #5. (On-the-fly tsvector —
   * an FTS GIN index is a perf follow-up.)
   */
  async searchChunks(query: string, limit?: number, scope?: ScopeFilter): Promise<ChunkSearchResult[]> {
    const lim = clampLimit(limit, 5);
    // Semantic when an embedding provider is configured; lexical fallback
    // otherwise (the retriever swaps under the same entry point — the
    // search_worldtree tool and REST route don't change). See phase-b-embeddings.md.
    const provider = getEmbeddingProvider();
    if (provider.isEnabled()) {
      try {
        const [vec] = await provider.embed([query]);
        if (vec && vec.length > 0) {
          return await this.searchChunksByVector(vec, lim, scope);
        }
      } catch (e) {
        console.warn('Semantic search failed, falling back to lexical:', e instanceof Error ? e.message : e);
      }
    }
    return this.searchChunksLexical(query, lim, scope);
  }

  /** Lexical (Postgres full-text) chunk retrieval — the fallback / no-provider path. */
  private async searchChunksLexical(query: string, lim: number, scope?: ScopeFilter): Promise<ChunkSearchResult[]> {
    const scopeClause = scope ? ` AND ${SCOPE_EXISTS('$3')}` : '';
    const params: unknown[] = scope ? [query, lim, scope.realms] : [query, lim];
    const { rows } = await this.db.query<ChunkSearchRow>(
      `SELECT c.source_id, c.chunk_index, c.text, c.metadata,
              d.source_uri, d.title, d.source_format, d.fetched_at, d.checksum,
              ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', $1)) AS rank
         FROM druids_core.worldtree_chunks c
         JOIN druids_core.worldtree_documents d ON d.id = c.source_id::uuid
        WHERE c.source_type = 'document'
          AND to_tsvector('english', c.text) @@ plainto_tsquery('english', $1)${scopeClause}
        ORDER BY rank DESC, c.chunk_index
        LIMIT $2`,
      params
    );
    return rows.map(mapChunkSearchRow);
  }

  /** Semantic (pgvector cosine) chunk retrieval. rank = cosine similarity (1 - distance). */
  async searchChunksByVector(queryVector: number[], limit?: number, scope?: ScopeFilter): Promise<ChunkSearchResult[]> {
    const lim = clampLimit(limit, 5);
    const literal = `[${queryVector.join(',')}]`;
    const scopeClause = scope ? ` AND ${SCOPE_EXISTS('$3')}` : '';
    const params: unknown[] = scope ? [literal, lim, scope.realms] : [literal, lim];
    const { rows } = await this.db.query<ChunkSearchRow>(
      `SELECT c.source_id, c.chunk_index, c.text, c.metadata,
              d.source_uri, d.title, d.source_format, d.fetched_at, d.checksum,
              1 - (ce.embedding <=> $1::vector) AS rank
         FROM druids_core.chunk_embeddings ce
         JOIN druids_core.worldtree_chunks c ON c.id = ce.chunk_id
         JOIN druids_core.worldtree_documents d ON d.id = c.source_id::uuid
        WHERE c.source_type = 'document'${scopeClause}
        ORDER BY ce.embedding <=> $1::vector
        LIMIT $2`,
      params
    );
    return rows.map(mapChunkSearchRow);
  }

  // ── Coverage demand signals (rung #5b) ─────────────────────────────────────

  /** Record a coverage gap (in-scope search returned nothing). Deduped on (query, sorted realms). */
  async recordKnowledgeGap(p: { query: string; realms: string[]; agentId?: string | null; sessionId?: string | null }): Promise<void> {
    const realms = [...new Set(p.realms)].sort();
    await this.db.query(
      `INSERT INTO druids_core.knowledge_gaps (query, realms, agent_id, session_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (query, realms) DO UPDATE SET
         hit_count = druids_core.knowledge_gaps.hit_count + 1,
         last_seen_at = CURRENT_TIMESTAMP,
         status = CASE WHEN druids_core.knowledge_gaps.status = 'dismissed' THEN 'dismissed' ELSE 'open' END`,
      [p.query, realms, p.agentId ?? null, p.sessionId ?? null]
    );
  }

  /** List knowledge gaps (demand signals), newest-seen first. */
  async getKnowledgeGaps(opts: { status?: string | undefined; limit?: number | undefined; offset?: number | undefined } = {}): Promise<KnowledgeGap[]> {
    const limit = clampLimit(opts.limit, 100);
    const offset = clampOffset(opts.offset);
    const { rows } = await this.db.query<{
      id: string; query: string; realms: string[] | null; agent_id: string | null;
      session_id: string | null; hit_count: number; status: string; created_at: Date; last_seen_at: Date;
    }>(
      `SELECT id, query, realms, agent_id, session_id, hit_count, status, created_at, last_seen_at
         FROM druids_core.knowledge_gaps
        WHERE ($1::varchar IS NULL OR status = $1::varchar)
        ORDER BY last_seen_at DESC
        LIMIT $2 OFFSET $3`,
      [opts.status ?? null, limit, offset]
    );
    return rows.map((r) => ({
      id: r.id, query: r.query, realms: r.realms ?? [], agentId: r.agent_id, sessionId: r.session_id,
      hitCount: r.hit_count, status: r.status, createdAt: r.created_at, lastSeenAt: r.last_seen_at,
    }));
  }

  /** Mark a gap addressed or dismissed. */
  async resolveKnowledgeGap(id: string, status: 'addressed' | 'dismissed'): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE druids_core.knowledge_gaps SET status = $2 WHERE id = $1::uuid`,
      [id, status]
    );
    return rowCount > 0;
  }

  /** Set an item's scopes (replace-semantics). global => scope_ref NULL. */
  async setItemScopes(itemType: 'document' | 'contribution' | 'chunk', itemId: string, scopes: ScopeAssoc[]): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `DELETE FROM druids_core.worldtree_item_scopes WHERE item_type = $1 AND item_id = $2`,
        [itemType, itemId]
      );
      for (const s of scopes) {
        await client.query(
          `INSERT INTO druids_core.worldtree_item_scopes (item_type, item_id, scope_type, scope_ref)
           VALUES ($1, $2, $3, $4)`,
          [itemType, itemId, s.scopeType, s.scopeType === 'global' ? null : (s.scopeRef ?? null)]
        );
      }
    });
  }

  /** Chunk rows (id + text) for a source, used to compute embeddings. */
  async getChunkRowsForSource(sourceType: 'document' | 'contribution', sourceId: string): Promise<Array<{ id: string; text: string }>> {
    const { rows } = await this.db.query<{ id: string; text: string }>(
      `SELECT id, text FROM druids_core.worldtree_chunks
        WHERE source_type = $1 AND source_id = $2 ORDER BY chunk_index`,
      [sourceType, sourceId]
    );
    return rows;
  }

  /** Upsert embeddings for chunks (one per chunk per model). */
  async storeChunkEmbeddings(items: Array<{ chunkId: string; vector: number[] }>, modelName: string): Promise<void> {
    if (items.length === 0) return;
    await this.db.transaction(async (client) => {
      for (const it of items) {
        await client.query(
          `INSERT INTO druids_core.chunk_embeddings (chunk_id, embedding, model_name)
           VALUES ($1, $2::vector, $3)
           ON CONFLICT (chunk_id, model_name) DO UPDATE SET embedding = EXCLUDED.embedding`,
          [it.chunkId, `[${it.vector.join(',')}]`, modelName]
        );
      }
    });
  }
}

let singleton: WorldTreeQueryService | null = null;
export function getWorldTreeQueryService(): WorldTreeQueryService {
  if (!singleton) singleton = new WorldTreeQueryService();
  return singleton;
}
