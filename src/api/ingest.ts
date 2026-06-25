import express from 'express';
import { getDoclingService, type DoclingFormat } from '../services/DoclingService';

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
router.post('/url', async (req, res) => {
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

// Reading/listing/searching ingested documents lives on the read-only
// discovery surface (/api/worldtree); this router is write-only (ingest).

export default router;
