import express from 'express';
import { getDoclingService, type DoclingFormat } from '../services/DoclingService';
import { getWorldTreeQueryService } from '../services/WorldTreeQueryService';
import { requireAdmin } from '../auth/authorize';

/**
 * Document ingestion API (thin PoC) — fetch + convert a remote source through
 * the druids-docling service and catalog it in the WorldTree document lineage.
 *
 * SECURITY (PoC): `POST /url` ingests an arbitrary URL with no allowlist. Before
 * non-PoC use, gate `url` through `resourceAccess.allowedLocations`
 * (docs/docling-integration-evaluation.md §7).
 */

const router = express.Router();

const VALID_FORMATS: DoclingFormat[] = ['md', 'json', 'html', 'text', 'doctags'];

// Ingest a document from a URL.
router.post('/url', requireAdmin, async (req, res) => {
  try {
    const { url, toFormats, namespace, accessLevel } = req.body ?? {};
    if (typeof url !== 'string' || url.length === 0) {
      return res.status(400).json({ error: 'url (string) is required' });
    }

    let formats: DoclingFormat[] | undefined;
    if (Array.isArray(toFormats)) {
      const invalid = toFormats.filter((f: unknown) => !VALID_FORMATS.includes(f as DoclingFormat));
      if (invalid.length) {
        return res.status(400).json({ error: `invalid toFormats: ${invalid.join(', ')}; allowed: ${VALID_FORMATS.join(', ')}` });
      }
      formats = toFormats as DoclingFormat[];
    }

    const opts: Parameters<ReturnType<typeof getDoclingService>['ingestUrl']>[1] = {};
    if (formats) opts.toFormats = formats;
    if (typeof namespace === 'string') opts.namespace = namespace;
    if (accessLevel === 'public' || accessLevel === 'private' || accessLevel === 'restricted') {
      opts.accessLevel = accessLevel;
    }
    if (Array.isArray(req.body?.scopeRealms)) opts.scopeRealms = req.body.scopeRealms.map((r: unknown) => String(r));

    // Validate realm scopes BEFORE fetching/persisting (fail fast, no orphan doc).
    if (opts.scopeRealms?.length) {
      try {
        await getWorldTreeQueryService().assertRealmsExist(opts.scopeRealms);
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid realm scope' });
      }
    }

    const document = await getDoclingService().ingestUrl(url, opts);
    return res.status(201).json({ document });
  } catch (error) {
    console.error('Document ingestion error:', error);
    return res.status(502).json({
      error: 'Failed to ingest document',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Ingest a staged directory (batch). Validates containment to the staging root,
// records an ingest run, and processes files in the background — returns the run
// id immediately; poll GET /runs/:id for progress/results.
//
// SECURITY: bounded to the configured staging root. Scope/permission gating
// (e.g. who may write 'global') is a follow-up (docs/operator-ingestion-flow.md).
router.post('/directory', requireAdmin, async (req, res) => {
  try {
    const { path: stagingPath, toFormats, namespace, accessLevel, includeExtensions, triggeredBy } = req.body ?? {};
    if (typeof stagingPath !== 'string' || stagingPath.length === 0) {
      return res.status(400).json({ error: 'path (string) is required' });
    }
    if (Array.isArray(toFormats)) {
      const invalid = toFormats.filter((f: unknown) => !VALID_FORMATS.includes(f as DoclingFormat));
      if (invalid.length) {
        return res.status(400).json({ error: `invalid toFormats: ${invalid.join(', ')}; allowed: ${VALID_FORMATS.join(', ')}` });
      }
    }

    const opts: Parameters<ReturnType<typeof getDoclingService>['startDirectoryIngest']>[1] = {};
    if (Array.isArray(toFormats)) opts.toFormats = toFormats as DoclingFormat[];
    if (typeof namespace === 'string') opts.namespace = namespace;
    if (accessLevel === 'public' || accessLevel === 'private' || accessLevel === 'restricted') opts.accessLevel = accessLevel;
    if (Array.isArray(includeExtensions)) opts.includeExtensions = includeExtensions.map((e: unknown) => String(e));
    if (typeof triggeredBy === 'string') opts.triggeredBy = triggeredBy;
    if (Array.isArray(req.body?.scopeRealms)) opts.scopeRealms = req.body.scopeRealms.map((r: unknown) => String(r));

    // Validate realm scopes before kicking off the background run.
    if (opts.scopeRealms?.length) {
      try {
        await getWorldTreeQueryService().assertRealmsExist(opts.scopeRealms);
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid realm scope' });
      }
    }

    const run = await getDoclingService().startDirectoryIngest(stagingPath, opts);
    return res.status(202).json(run); // 202 Accepted — processing in background
  } catch (error) {
    console.error('Directory ingestion error:', error);
    return res.status(400).json({
      error: 'Failed to start directory ingest',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Ingest-run status/results.
router.get('/runs/:id', async (req, res) => {
  try {
    const run = await getDoclingService().getIngestRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Ingest run not found' });
    return res.json({ run });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get ingest run', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/runs', async (req, res) => {
  try {
    const limit = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : undefined;
    const offset = typeof req.query['offset'] === 'string' ? Number(req.query['offset']) : undefined;
    const runs = await getDoclingService().listIngestRuns(limit, offset);
    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list ingest runs', details: error instanceof Error ? error.message : String(error) });
  }
});

// (Re)chunk a document on demand — backfill for documents ingested before
// chunking, or to re-chunk after changing chunk settings. New ingests are
// chunked automatically.
router.post('/documents/:id/chunk', requireAdmin, async (req, res) => {
  try {
    const id = req.params['id'] as string;
    const svc = getDoclingService();
    const chunks = await svc.chunkDocument(id);
    const embedded = await svc.embedDocumentChunks(id); // 0 if no provider
    return res.json({ documentId: id, chunks, embedded });
  } catch (error) {
    console.error('Chunking error:', error);
    return res.status(502).json({ error: 'Failed to chunk document', details: error instanceof Error ? error.message : String(error) });
  }
});

// (Re)embed a document's existing chunks — backfill, or re-embed after an
// embedding-model change (no re-chunk). No-op if no provider is configured.
router.post('/documents/:id/embed', requireAdmin, async (req, res) => {
  try {
    const id = req.params['id'] as string;
    const embedded = await getDoclingService().embedDocumentChunks(id);
    return res.json({ documentId: id, embedded });
  } catch (error) {
    console.error('Embedding error:', error);
    return res.status(502).json({ error: 'Failed to embed document', details: error instanceof Error ? error.message : String(error) });
  }
});

// Resolve a knowledge gap (addressed once ingested, or dismissed).
router.post('/knowledge-gaps/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const id = req.params['id'] as string;
    const status = req.body?.status === 'dismissed' ? 'dismissed' : 'addressed';
    const ok = await getWorldTreeQueryService().resolveKnowledgeGap(id, status);
    if (!ok) return res.status(404).json({ error: 'Knowledge gap not found' });
    return res.json({ id, status });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve knowledge gap', details: error instanceof Error ? error.message : String(error) });
  }
});

// Reading/listing/searching ingested documents lives on the read-only
// discovery surface (/api/worldtree); this router is write-only (ingest).

export default router;
