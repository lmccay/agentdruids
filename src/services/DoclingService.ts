import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './DatabaseService';

/**
 * DoclingService — thin PoC front-end for document ingestion via the
 * druids-docling (docling-serve) container.
 *
 * One round-trip: fetch+convert a remote source through docling-serve, write
 * the requested renderings to disk (bytes-on-disk pattern), and catalog one
 * `worldtree_documents` row + its `document_renderings`. No chunking or
 * embeddings yet (Phase B), no realm/scope association yet
 * (realm-grounded-assessment.md). docling-serve is stateless; this service owns
 * all persistence.
 *
 * SECURITY (PoC): URL ingestion is an SSRF surface. This PoC does NOT yet gate
 * source URLs. Before any non-PoC use, route `url` through Druids'
 * `resourceAccess.allowedLocations` allowlist (see docs/docling-integration-evaluation.md §7).
 *
 * See docs/docling-integration-evaluation.md.
 */

const DOCLING_SERVICE_URL = process.env['DOCLING_SERVICE_URL'] || 'http://druids-docling:5001';
const DOCUMENTS_BASE_DIR = process.env['DOCUMENT_STORE_DIR'] || '/app/data/documents';
const CONVERT_TIMEOUT_MS = Number(process.env['DOCLING_CONVERT_TIMEOUT_MS'] || 300000);

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

export interface IngestOptions {
  toFormats?: DoclingFormat[];
  namespace?: string;
  accessLevel?: 'public' | 'private' | 'restricted';
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

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Serialize a docling-serve content field to a string (json_content is an object). */
function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  // json_content and friends arrive as objects
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

/** URL-extension fallback — only a plausible alphabetic extension (avoids e.g. an arxiv version "09869"). */
function inferSourceFormatFromUrl(url: string): string | null {
  try {
    const ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
    return /^[a-z]{2,5}$/.test(ext) ? ext : null;
  } catch {
    return null;
  }
}

/** Prefer Docling's detected mimetype (authoritative); fall back to the URL extension. */
function deriveSourceFormat(jsonObj: Record<string, unknown> | null, url: string): string | null {
  const origin = jsonObj?.['origin'];
  const mimetype = origin && typeof origin === 'object' ? (origin as Record<string, unknown>)['mimetype'] : undefined;
  if (typeof mimetype === 'string') {
    if (MIME_TO_FORMAT[mimetype]) return MIME_TO_FORMAT[mimetype];
    const sub = mimetype.split('/').pop()?.split('+')[0];
    if (sub && /^[a-z0-9.\-]{1,12}$/.test(sub)) return sub;
  }
  return inferSourceFormatFromUrl(url);
}

export class DoclingService {
  private db: DatabaseService;

  constructor(db?: DatabaseService) {
    this.db = db ?? DatabaseService.getInstance();
  }

  /**
   * Convert a remote source via docling-serve and catalog it. Synchronous
   * docling-serve endpoint (fine for the PoC; large/slow inputs should move to
   * the /async endpoint + Druids' async-result pattern later).
   */
  async ingestUrl(url: string, options: IngestOptions = {}): Promise<IngestedDocument> {
    const toFormats = options.toFormats?.length ? options.toFormats : DEFAULT_FORMATS;
    const namespace = options.namespace ?? 'worldtree://public/documents';
    const accessLevel = options.accessLevel ?? 'public';

    // 1. Convert through docling-serve (stateless).
    // docling-serve /v1/convert/source expects `sources` with a discriminated
    // `kind` ('http' | 'file'); the `http_sources` shorthand in some docs is not
    // accepted by this server version.
    const resp = await axios.post(
      `${DOCLING_SERVICE_URL}/v1/convert/source`,
      { sources: [{ kind: 'http', url }], options: { to_formats: toFormats } },
      { timeout: CONVERT_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );

    const data = resp.data ?? {};
    if (data.status && data.status !== 'success' && data.status !== 'partial_success') {
      const errs = Array.isArray(data.errors) ? data.errors.join('; ') : 'unknown error';
      throw new Error(`docling-serve conversion failed (${data.status}): ${errs}`);
    }
    const doc = data.document ?? {};

    // 2. Derive provenance. Canonical artifact = lossless JSON when present.
    const jsonObj =
      doc[FORMAT_FIELD.json] && typeof doc[FORMAT_FIELD.json] === 'object'
        ? (doc[FORMAT_FIELD.json] as Record<string, unknown>)
        : null;
    const jsonText = asText(doc[FORMAT_FIELD.json]);
    const canonical = jsonText ?? asText(doc[FORMAT_FIELD.md]);
    const checksum = canonical ? sha256(canonical) : null;
    const title = (jsonObj?.['name'] as string | undefined) ?? null;
    const sourceFormat = deriveSourceFormat(jsonObj, url);
    // NO DEDUP / IDEMPOTENCY (PoC): each ingest mints a fresh document id and its
    // own /app/data/documents/{id}/ directory, so files never overwrite across
    // runs — but re-ingesting the SAME source ACCUMULATES duplicate documents
    // rather than replacing. idx_worldtree_documents_source (migration 008) is in
    // place to make a future dedup/upsert (on source_uri or checksum) cheap.
    // Follow-up: upsert-on-source_uri | dedup-on-checksum | versioned documents.
    const id = uuidv4();
    const fetchedAt = new Date();

    // 3. Write each requested, non-empty rendering to disk (bytes-on-disk).
    const docDir = path.join(DOCUMENTS_BASE_DIR, id);
    await fs.mkdir(docDir, { recursive: true });
    const renderings: RenderingRecord[] = [];
    const textByFormat: Partial<Record<DoclingFormat, string>> = {};
    for (const format of toFormats) {
      const text = asText(doc[FORMAT_FIELD[format]]);
      if (text == null) continue;
      textByFormat[format] = text;
      // Stable basename + real extension. The format is recorded in the DB
      // (document_renderings.format), so the filename need not repeat it —
      // avoids redundant names like md.md / json.json.
      const filename = `content.${FORMAT_EXT[format]}`;
      const filePath = path.join(docDir, filename);
      await fs.writeFile(filePath, text, 'utf-8');
      renderings.push({
        format,
        contentUri: `file://${filePath}`,
        contentSizeBytes: Buffer.byteLength(text, 'utf-8'),
        checksum: sha256(text),
      });
    }

    // Primary readable text for lexical search/read (markdown preferred).
    const contentText =
      textByFormat.md ?? textByFormat.text ?? textByFormat.html ?? textByFormat.doctags ?? null;

    // 4. Catalog the document + renderings (one transaction).
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO druids_core.worldtree_documents
           (id, source_uri, title, source_format, namespace, access_level, checksum, fetched_at, content_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, url, title, sourceFormat, namespace, accessLevel, checksum, fetchedAt, contentText]
      );
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
      sourceUri: url,
      title,
      sourceFormat,
      namespace,
      accessLevel,
      checksum,
      fetchedAt: fetchedAt.toISOString(),
      renderings,
    };
  }

}

let singleton: DoclingService | null = null;
export function getDoclingService(): DoclingService {
  if (!singleton) singleton = new DoclingService();
  return singleton;
}
