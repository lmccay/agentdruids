import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './DatabaseService';
import { getWorldTreeQueryService } from './WorldTreeQueryService';
import { getEmbeddingProvider } from './EmbeddingProvider';

/**
 * DoclingService — document ingestion via the druids-docling (docling-serve)
 * container. Converts a source (remote URL or local staged file) through
 * docling-serve, writes the requested renderings to disk (bytes-on-disk
 * pattern), and catalogs a `worldtree_documents` row + `document_renderings`.
 * docling-serve is stateless; this service owns all persistence.
 *
 * Dedup: catalog rows are keyed UNIQUE on source_uri (migration 010), so
 * ingestion upserts — re-ingesting a source reuses its document id + directory
 * and replaces its renderings, rather than accumulating duplicates.
 *
 * Directory ingestion (`startDirectoryIngest`) walks a staged tree, ingests
 * each supported file with bounded concurrency, and tracks an `ingest_runs`
 * record. No chunking/embeddings yet (Phase B); no realm/scope association yet
 * (realm-grounded-assessment.md) — documents are global-by-namespace for now.
 *
 * SECURITY: directory ingestion is bounded to the configured staging root
 * (path-containment guard). URL ingestion remains an SSRF surface and is NOT
 * yet allowlist-gated — see docs/docling-integration-evaluation.md §7 and
 * docs/operator-ingestion-flow.md before non-PoC use.
 */

const DOCLING_SERVICE_URL = process.env['DOCLING_SERVICE_URL'] || 'http://druids-docling:5001';
const DOCUMENTS_BASE_DIR = process.env['DOCUMENT_STORE_DIR'] || '/app/data/documents';
const DOCUMENT_STAGING_DIR = process.env['DOCUMENT_STAGING_DIR'] || '/app/data/staging';
const CONVERT_TIMEOUT_MS = Number(process.env['DOCLING_CONVERT_TIMEOUT_MS'] || 300000);
const INGEST_CONCURRENCY = Math.max(1, Number(process.env['INGEST_CONCURRENCY'] || 3));

// Chunking (rung #2). max_tokens / tokenizer should align with the embedding
// model when embeddings land (rung #4 / Phase B); the default is Docling's.
// Re-chunking from stored JSON is cheap, so changing these later is low-cost.
const CHUNK_MAX_TOKENS = Math.max(1, Number(process.env['CHUNK_MAX_TOKENS'] || 512));
const CHUNK_TOKENIZER = process.env['CHUNK_TOKENIZER'] || 'sentence-transformers/all-MiniLM-L6-v2';
const ENABLE_AUTO_CHUNK = (process.env['ENABLE_AUTO_CHUNK'] ?? 'true') !== 'false';

export type DoclingFormat = 'md' | 'json' | 'html' | 'text' | 'doctags';

const DEFAULT_FORMATS: DoclingFormat[] = ['md', 'json'];

const FORMAT_EXT: Record<DoclingFormat, string> = {
  md: 'md',
  json: 'json',
  html: 'html',
  text: 'txt',
  doctags: 'doctags',
};

// Maps our format name → the field in docling-serve's `document` response object.
const FORMAT_FIELD: Record<DoclingFormat, string> = {
  md: 'md_content',
  json: 'json_content',
  html: 'html_content',
  text: 'text_content',
  doctags: 'doctags_content',
};

// Input file extensions Docling can parse; the directory walk filters to these.
const SUPPORTED_INPUT_EXTS = new Set([
  'pdf', 'html', 'htm', 'xhtml', 'docx', 'pptx', 'xlsx', 'md', 'markdown',
  'txt', 'text', 'csv', 'epub', 'adoc', 'asciidoc', 'xml',
]);

export interface IngestOptions {
  toFormats?: DoclingFormat[];
  namespace?: string;
  accessLevel?: 'public' | 'private' | 'restricted';
}

export interface IngestDirectoryOptions extends IngestOptions {
  includeExtensions?: string[];
  triggeredBy?: string;
}

export interface RenderingRecord {
  format: DoclingFormat;
  contentUri: string;
  contentSizeBytes: number;
  checksum: string;
}

export interface IngestedDocument {
  id: string;
  sourceUri: string;
  title: string | null;
  sourceFormat: string | null;
  namespace: string;
  accessLevel: string;
  checksum: string | null;
  fetchedAt: string;
  renderings: RenderingRecord[];
}

export interface IngestRunRecord {
  id: string;
  sourceDir: string;
  namespace: string;
  status: string;
  totalFiles: number;
  ingested: number;
  skipped: number;
  failed: number;
  triggeredBy: string | null;
  error: string | null;
  results: unknown[];
  startedAt: string;
  completedAt: string | null;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Serialize a docling-serve content field to a string (json_content is an object). */
function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  const s = JSON.stringify(value);
  return s === '{}' || s === 'null' ? null : s;
}

const MIME_TO_FORMAT: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/html': 'html',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/epub+zip': 'epub',
};

/** Plausible alphabetic extension from a path/URL (avoids e.g. an arxiv version "09869"). */
function inferSourceFormatFromString(s: string): string | null {
  const ext = path.extname(s.split('?')[0] ?? s).replace('.', '').toLowerCase();
  return /^[a-z]{2,5}$/.test(ext) ? ext : null;
}

/** Prefer Docling's detected mimetype (authoritative); fall back to the source extension. */
function deriveSourceFormat(jsonObj: Record<string, unknown> | null, sourceUri: string): string | null {
  const origin = jsonObj?.['origin'];
  const mimetype = origin && typeof origin === 'object' ? (origin as Record<string, unknown>)['mimetype'] : undefined;
  if (typeof mimetype === 'string') {
    if (MIME_TO_FORMAT[mimetype]) return MIME_TO_FORMAT[mimetype];
    const sub = mimetype.split('/').pop()?.split('+')[0];
    if (sub && /^[a-z0-9.\-]{1,12}$/.test(sub)) return sub;
  }
  return inferSourceFormatFromString(sourceUri);
}

/** Run `fn` over items with at most `limit` in flight. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await fn(items[idx]!, idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
}

export class DoclingService {
  private db: DatabaseService;

  constructor(db?: DatabaseService) {
    this.db = db ?? DatabaseService.getInstance();
  }

  // ── Single-source ingestion ────────────────────────────────────────────────

  /** Convert + catalog a remote URL. Upserts on source_uri. */
  async ingestUrl(url: string, options: IngestOptions = {}): Promise<IngestedDocument> {
    const toFormats = options.toFormats?.length ? options.toFormats : DEFAULT_FORMATS;
    const namespace = options.namespace ?? 'worldtree://public/documents';
    const accessLevel = options.accessLevel ?? 'public';
    const doc = await this.convertSource({ kind: 'http', url }, toFormats);
    const ingested = await this.persistDocument({ sourceUri: url, doc, toFormats, namespace, accessLevel, runId: null });
    await this.maybeChunk(ingested.id);
    return ingested;
  }

  /** Convert + catalog a local file (read → base64 → docling-serve file source). */
  private async ingestFile(
    absPath: string,
    sourceUri: string,
    toFormats: DoclingFormat[],
    namespace: string,
    accessLevel: string,
    runId: string | null
  ): Promise<IngestedDocument> {
    const bytes = await fs.readFile(absPath);
    const doc = await this.convertSource(
      { kind: 'file', base64_string: bytes.toString('base64'), filename: path.basename(absPath) },
      toFormats
    );
    const ingested = await this.persistDocument({ sourceUri, doc, toFormats, namespace, accessLevel, runId });
    await this.maybeChunk(ingested.id);
    return ingested;
  }

  /** POST a single source to docling-serve and return the `document` object. */
  private async convertSource(source: Record<string, unknown>, toFormats: DoclingFormat[]): Promise<Record<string, any>> {
    const resp = await axios.post(
      `${DOCLING_SERVICE_URL}/v1/convert/source`,
      { sources: [source], options: { to_formats: toFormats } },
      { timeout: CONVERT_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
    const data = resp.data ?? {};
    if (data.status && data.status !== 'success' && data.status !== 'partial_success') {
      const errs = Array.isArray(data.errors) ? data.errors.join('; ') : 'unknown error';
      throw new Error(`docling-serve conversion failed (${data.status}): ${errs}`);
    }
    return data.document ?? {};
  }

  /** Derive provenance, write renderings to disk, and upsert the catalog rows. */
  private async persistDocument(params: {
    sourceUri: string;
    doc: Record<string, any>;
    toFormats: DoclingFormat[];
    namespace: string;
    accessLevel: string;
    runId: string | null;
  }): Promise<IngestedDocument> {
    const { sourceUri, doc, toFormats, namespace, accessLevel, runId } = params;

    const jsonObj =
      doc[FORMAT_FIELD.json] && typeof doc[FORMAT_FIELD.json] === 'object'
        ? (doc[FORMAT_FIELD.json] as Record<string, unknown>)
        : null;
    const jsonText = asText(doc[FORMAT_FIELD.json]);
    const canonical = jsonText ?? asText(doc[FORMAT_FIELD.md]);
    const checksum = canonical ? sha256(canonical) : null;
    const title = (jsonObj?.['name'] as string | undefined) ?? null;
    const sourceFormat = deriveSourceFormat(jsonObj, sourceUri);
    const fetchedAt = new Date();

    // Upsert: reuse the existing id (and its directory) if this source was seen
    // before, so files overwrite in place rather than orphaning a stale dir.
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM druids_core.worldtree_documents WHERE source_uri = $1`,
      [sourceUri]
    );
    const id = existing.rows[0]?.id ?? uuidv4();

    const docDir = path.join(DOCUMENTS_BASE_DIR, id);
    await fs.mkdir(docDir, { recursive: true });
    const renderings: RenderingRecord[] = [];
    const textByFormat: Partial<Record<DoclingFormat, string>> = {};
    for (const format of toFormats) {
      const text = asText(doc[FORMAT_FIELD[format]]);
      if (text == null) continue;
      textByFormat[format] = text;
      const filePath = path.join(docDir, `content.${FORMAT_EXT[format]}`);
      await fs.writeFile(filePath, text, 'utf-8');
      renderings.push({
        format,
        contentUri: `file://${filePath}`,
        contentSizeBytes: Buffer.byteLength(text, 'utf-8'),
        checksum: sha256(text),
      });
    }
    const contentText =
      textByFormat.md ?? textByFormat.text ?? textByFormat.html ?? textByFormat.doctags ?? null;

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO druids_core.worldtree_documents
           (id, source_uri, title, source_format, namespace, access_level, checksum, fetched_at, content_text, ingest_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (source_uri) DO UPDATE SET
           title = EXCLUDED.title,
           source_format = EXCLUDED.source_format,
           namespace = EXCLUDED.namespace,
           access_level = EXCLUDED.access_level,
           checksum = EXCLUDED.checksum,
           fetched_at = EXCLUDED.fetched_at,
           content_text = EXCLUDED.content_text,
           ingest_run_id = EXCLUDED.ingest_run_id`,
        [id, sourceUri, title, sourceFormat, namespace, accessLevel, checksum, fetchedAt, contentText, runId]
      );
      // Replace renderings (formats may differ on re-ingest).
      await client.query(`DELETE FROM druids_core.document_renderings WHERE document_id = $1`, [id]);
      for (const r of renderings) {
        await client.query(
          `INSERT INTO druids_core.document_renderings
             (document_id, format, content_uri, content_size_bytes, checksum)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, r.format, r.contentUri, r.contentSizeBytes, r.checksum]
        );
      }
    });

    return {
      id,
      sourceUri,
      title,
      sourceFormat,
      namespace,
      accessLevel,
      checksum,
      fetchedAt: fetchedAt.toISOString(),
      renderings,
    };
  }

  // ── Chunking (rung #2) ──────────────────────────────────────────────────────

  /**
   * Chunk a document's stored DoclingDocument JSON via docling-serve's
   * HybridChunker (json_docling input → no re-conversion of the original) and
   * replace its rows in worldtree_chunks. Returns the chunk count.
   */
  async chunkDocument(documentId: string): Promise<number> {
    const jsonPath = path.join(DOCUMENTS_BASE_DIR, documentId, 'content.json');
    let jsonBytes: Buffer;
    try {
      jsonBytes = await fs.readFile(jsonPath);
    } catch {
      throw new Error(`No JSON rendering on disk to chunk for document ${documentId} (re-ingest with 'json' format)`);
    }

    const resp = await axios.post(
      `${DOCLING_SERVICE_URL}/v1/chunk/hybrid/source`,
      {
        sources: [{ kind: 'file', base64_string: jsonBytes.toString('base64'), filename: 'content.json' }],
        convert_options: { from_formats: ['json_docling'] },
        chunking_options: {
          max_tokens: CHUNK_MAX_TOKENS,
          merge_peers: true,
          include_raw_text: true,
          tokenizer: CHUNK_TOKENIZER,
        },
      },
      { timeout: CONVERT_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );

    const data = resp.data ?? {};
    if (data.status && data.status !== 'success' && data.status !== 'partial_success') {
      const errs = Array.isArray(data.errors) ? data.errors.join('; ') : 'unknown error';
      throw new Error(`docling-serve chunking failed (${data.status}): ${errs}`);
    }
    const chunks: any[] = Array.isArray(data.chunks) ? data.chunks : [];

    await this.db.transaction(async (client) => {
      await client.query(
        `DELETE FROM druids_core.worldtree_chunks WHERE source_type = 'document' AND source_id = $1`,
        [documentId]
      );
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i] ?? {};
        const text = typeof c.text === 'string' ? c.text : '';
        if (!text) continue;
        const chunkIndex = Number.isInteger(c.chunk_index) ? c.chunk_index : i;
        const metadata = {
          headings: c.headings ?? null,
          captions: c.captions ?? null,
          pageNumbers: c.page_numbers ?? null,
          numTokens: c.num_tokens ?? null,
          rawText: typeof c.raw_text === 'string' ? c.raw_text : null,
        };
        await client.query(
          `INSERT INTO druids_core.worldtree_chunks (source_type, source_id, chunk_index, text, metadata)
           VALUES ('document', $1, $2, $3, $4::jsonb)`,
          [documentId, chunkIndex, text, JSON.stringify(metadata)]
        );
      }
    });

    return chunks.length;
  }

  /** Best-effort chunk after ingest: never fails the ingest if chunking errors. */
  private async maybeChunk(documentId: string): Promise<void> {
    if (!ENABLE_AUTO_CHUNK) return;
    try {
      const n = await this.chunkDocument(documentId);
      console.log(`Chunked document ${documentId}: ${n} chunks`);
      await this.maybeEmbed(documentId);
    } catch (e) {
      console.warn(`Auto-chunk failed for ${documentId}:`, e instanceof Error ? e.message : e);
    }
  }

  /**
   * Embed a document's chunks via the configured EmbeddingProvider and store
   * the vectors (PgVectorStore). No-op when no provider is configured
   * (retrieval stays lexical). Returns the number of chunks embedded.
   */
  async embedDocumentChunks(documentId: string): Promise<number> {
    const provider = getEmbeddingProvider();
    if (!provider.isEnabled()) return 0;
    const qs = getWorldTreeQueryService();
    const chunks = await qs.getChunkRowsForSource('document', documentId);
    if (chunks.length === 0) return 0;
    const vectors = await provider.embed(chunks.map((c) => c.text));
    const items: Array<{ chunkId: string; vector: number[] }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const v = vectors[i];
      const chunk = chunks[i];
      if (chunk && Array.isArray(v) && v.length > 0) items.push({ chunkId: chunk.id, vector: v });
    }
    await qs.storeChunkEmbeddings(items, provider.modelName);
    return items.length;
  }

  /** Best-effort embed after chunking: never fails ingest if embedding errors. */
  private async maybeEmbed(documentId: string): Promise<void> {
    try {
      const n = await this.embedDocumentChunks(documentId);
      if (n > 0) console.log(`Embedded ${n} chunks for document ${documentId}`);
    } catch (e) {
      console.warn(`Auto-embed failed for ${documentId}:`, e instanceof Error ? e.message : e);
    }
  }

  // ── Directory (batch) ingestion ─────────────────────────────────────────────

  /**
   * Begin ingesting a staged directory. Validates containment, records an
   * ingest run, and processes files in the background (fire-and-forget) so the
   * caller can poll the run. Returns immediately with the run id.
   */
  async startDirectoryIngest(
    stagingPath: string,
    options: IngestDirectoryOptions = {}
  ): Promise<{ runId: string; totalFiles: number; sourceDir: string }> {
    const absInput = await this.resolveWithinStaging(stagingPath);
    const stat = await fs.stat(absInput);
    if (!stat.isDirectory()) {
      throw new Error('stagingPath must be a directory');
    }

    const includeExts = options.includeExtensions?.length
      ? new Set(options.includeExtensions.map((e) => e.replace('.', '').toLowerCase()))
      : null;
    const files = await this.walkSupportedFiles(absInput, includeExts);

    const toFormats = options.toFormats?.length ? options.toFormats : DEFAULT_FORMATS;
    const namespace = options.namespace ?? 'worldtree://public/documents';
    const accessLevel = options.accessLevel ?? 'public';

    const runId = await this.createRun(absInput, namespace, files.length, options.triggeredBy ?? null);

    // Background processing — do not await; the run row carries progress/result.
    void this.processDirectory(runId, files, toFormats, namespace, accessLevel).catch(async (err) => {
      console.error('Directory ingest run failed:', err);
      await this.failRun(runId, err instanceof Error ? err.message : String(err)).catch(() => {});
    });

    return { runId, totalFiles: files.length, sourceDir: absInput };
  }

  private async processDirectory(
    runId: string,
    files: string[],
    toFormats: DoclingFormat[],
    namespace: string,
    accessLevel: string
  ): Promise<void> {
    // Dedupe by source_uri within the batch (a mirror shouldn't, but be safe).
    const seen = new Set<string>();
    const work = files.filter((f) => {
      const su = this.sourceUriForFile(f);
      if (seen.has(su)) return false;
      seen.add(su);
      return true;
    });

    let ingested = 0;
    let failed = 0;
    const results: Array<Record<string, unknown>> = [];

    await mapPool(work, INGEST_CONCURRENCY, async (file) => {
      const sourceUri = this.sourceUriForFile(file);
      try {
        const docu = await this.ingestFile(file, sourceUri, toFormats, namespace, accessLevel, runId);
        ingested++;
        results.push({ file: sourceUri, status: 'ingested', documentId: docu.id });
      } catch (e) {
        failed++;
        results.push({ file: sourceUri, status: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    });

    const skipped = files.length - work.length;
    await this.completeRun(runId, { ingested, skipped, failed, results });
  }

  /** Stable, structured source identifier: path relative to the staging root. */
  private sourceUriForFile(absFile: string): string {
    const base = path.resolve(DOCUMENT_STAGING_DIR);
    return path.relative(base, path.resolve(absFile)).split(path.sep).join('/');
  }

  /** Resolve a path and assert it is inside the staging root (containment guard). */
  private async resolveWithinStaging(p: string): Promise<string> {
    const base = path.resolve(DOCUMENT_STAGING_DIR);
    const resolved = path.resolve(base, p); // relative inputs resolve under staging
    const real = await fs.realpath(resolved).catch(() => resolved);
    const realBase = await fs.realpath(base).catch(() => base);
    if (real !== realBase && !real.startsWith(realBase + path.sep)) {
      throw new Error(`Path is outside the allowed staging root (${DOCUMENT_STAGING_DIR})`);
    }
    return real;
  }

  private async walkSupportedFiles(dir: string, includeExts: Set<string> | null): Promise<string[]> {
    const out: string[] = [];
    const recur = async (d: string): Promise<void> => {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          await recur(full);
        } else if (e.isFile()) {
          const ext = path.extname(e.name).replace('.', '').toLowerCase();
          if (SUPPORTED_INPUT_EXTS.has(ext) && (!includeExts || includeExts.has(ext))) {
            out.push(full);
          }
        }
      }
    };
    await recur(dir);
    return out.sort();
  }

  // ── Ingest-run records ──────────────────────────────────────────────────────

  private async createRun(sourceDir: string, namespace: string, totalFiles: number, triggeredBy: string | null): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO druids_core.ingest_runs (source_dir, namespace, status, total_files, triggered_by)
       VALUES ($1, $2, 'running', $3, $4) RETURNING id`,
      [sourceDir, namespace, totalFiles, triggeredBy]
    );
    return rows[0]!.id;
  }

  private async completeRun(
    runId: string,
    c: { ingested: number; skipped: number; failed: number; results: unknown[] }
  ): Promise<void> {
    await this.db.query(
      `UPDATE druids_core.ingest_runs
          SET status = 'completed', ingested = $2, skipped = $3, failed = $4,
              results = $5::jsonb, completed_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [runId, c.ingested, c.skipped, c.failed, JSON.stringify(c.results)]
    );
  }

  private async failRun(runId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE druids_core.ingest_runs SET status = 'failed', error = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [runId, error]
    );
  }

  async getIngestRun(id: string): Promise<IngestRunRecord | null> {
    const { rows } = await this.db.query<IngestRunRow>(
      `SELECT id, source_dir, namespace, status, total_files, ingested, skipped, failed,
              triggered_by, error, results, started_at, completed_at
         FROM druids_core.ingest_runs WHERE id = $1::uuid`,
      [id]
    );
    return rows[0] ? mapRunRow(rows[0]) : null;
  }

  async listIngestRuns(limit = 50, offset = 0): Promise<IngestRunRecord[]> {
    const { rows } = await this.db.query<IngestRunRow>(
      `SELECT id, source_dir, namespace, status, total_files, ingested, skipped, failed,
              triggered_by, error, results, started_at, completed_at
         FROM druids_core.ingest_runs ORDER BY started_at DESC LIMIT $1 OFFSET $2`,
      [Math.min(Math.max(1, limit), 200), Math.max(0, offset)]
    );
    return rows.map(mapRunRow);
  }
}

interface IngestRunRow {
  id: string;
  source_dir: string;
  namespace: string;
  status: string;
  total_files: number;
  ingested: number;
  skipped: number;
  failed: number;
  triggered_by: string | null;
  error: string | null;
  results: unknown[] | null;
  started_at: Date;
  completed_at: Date | null;
}

function mapRunRow(r: IngestRunRow): IngestRunRecord {
  return {
    id: r.id,
    sourceDir: r.source_dir,
    namespace: r.namespace,
    status: r.status,
    totalFiles: r.total_files,
    ingested: r.ingested,
    skipped: r.skipped,
    failed: r.failed,
    triggeredBy: r.triggered_by,
    error: r.error,
    results: r.results ?? [],
    startedAt: r.started_at.toISOString(),
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
  };
}

let singleton: DoclingService | null = null;
export function getDoclingService(): DoclingService {
  if (!singleton) singleton = new DoclingService();
  return singleton;
}
