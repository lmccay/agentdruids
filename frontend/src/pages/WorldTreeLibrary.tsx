import React, { useState, useEffect, useCallback } from 'react';
import { Library, Search, FileText, AlertCircle, ExternalLink, RefreshCw, X, Upload, Check, Trash2 } from 'lucide-react';
import {
  worldtreeApi,
  authApi,
  type WorldtreeDocument,
  type ChunkResult,
  type KnowledgeGap,
  type IngestRun,
} from '../services/api';

type Mode = 'documents' | 'search' | 'gaps' | 'ingest';

const parseRealms = (s: string) => s.split(',').map((r) => r.trim()).filter(Boolean);

export default function WorldTreeLibrary() {
  const [mode, setMode] = useState<Mode>('documents');
  const [isAdmin, setIsAdmin] = useState(false);

  // Documents
  const [documents, setDocuments] = useState<WorldtreeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selected, setSelected] = useState<WorldtreeDocument | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [docAction, setDocAction] = useState<string | null>(null);

  // Search (semantic corpus)
  const [query, setQuery] = useState('');
  const [realms, setRealms] = useState('');
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Knowledge gaps
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loadingGaps, setLoadingGaps] = useState(false);

  // Ingest (admin)
  const [urlInput, setUrlInput] = useState('');
  const [urlScope, setUrlScope] = useState('');
  const [dirInput, setDirInput] = useState('');
  const [dirScope, setDirScope] = useState('');
  const [busy, setBusy] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [run, setRun] = useState<IngestRun | null>(null);

  useEffect(() => {
    authApi.getMe().then((u) => setIsAdmin(!!u?.roles.includes('admin')));
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const { data } = await worldtreeApi.listDocuments({ limit: 100 });
      setDocuments(data.documents);
    } catch {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const loadGaps = useCallback(async () => {
    setLoadingGaps(true);
    try {
      const { data } = await worldtreeApi.listKnowledgeGaps('open');
      setGaps(data.gaps);
    } catch {
      setGaps([]);
    } finally {
      setLoadingGaps(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'documents') void loadDocuments();
    if (mode === 'gaps') void loadGaps();
  }, [mode, loadDocuments, loadGaps]);

  // Poll a directory ingest run until it finishes.
  useEffect(() => {
    if (!run || run.status === 'completed' || run.status === 'failed') return;
    const t = setTimeout(async () => {
      try {
        const { data } = await worldtreeApi.getIngestRun(run.id);
        setRun(data.run);
      } catch { /* keep last state */ }
    }, 2000);
    return () => clearTimeout(t);
  }, [run]);

  const openDocument = async (doc: WorldtreeDocument) => {
    setSelected(doc);
    setContent(null);
    setDocAction(null);
    setLoadingContent(true);
    try {
      const { data } = await worldtreeApi.readDocument(doc.id);
      setContent(data.contentText ?? '(no readable text)');
    } catch {
      setContent('(failed to load content)');
    } finally {
      setLoadingContent(false);
    }
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const { data } = await worldtreeApi.searchCorpus(query.trim(), parseRealms(realms));
      setResults(data.chunks);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const submitUrlIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setBusy(true);
    setIngestMsg(null);
    try {
      const { data } = await worldtreeApi.ingestUrl(urlInput.trim(), { scopeRealms: parseRealms(urlScope) });
      setIngestMsg({ ok: true, text: `Ingested: ${data.document.title || data.document.sourceUri}` });
      setUrlInput('');
      void loadDocuments();
    } catch (err: any) {
      setIngestMsg({ ok: false, text: err?.response?.data?.details || err?.response?.data?.error || 'Ingest failed' });
    } finally {
      setBusy(false);
    }
  };

  const submitDirIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirInput.trim()) return;
    setBusy(true);
    setIngestMsg(null);
    setRun(null);
    try {
      const { data } = await worldtreeApi.ingestDirectory(dirInput.trim(), { scopeRealms: parseRealms(dirScope) });
      const { data: r } = await worldtreeApi.getIngestRun(data.runId);
      setRun(r.run);
      setIngestMsg({ ok: true, text: `Started ingest of ${data.totalFiles} file(s) — run ${data.runId.slice(0, 8)}` });
    } catch (err: any) {
      setIngestMsg({ ok: false, text: err?.response?.data?.details || err?.response?.data?.error || 'Directory ingest failed' });
    } finally {
      setBusy(false);
    }
  };

  const resolveGap = async (id: string, status: 'addressed' | 'dismissed') => {
    try {
      await worldtreeApi.resolveKnowledgeGap(id, status);
      await loadGaps();
    } catch { /* leave list as-is */ }
  };

  const docOp = async (op: 'chunk' | 'embed') => {
    if (!selected) return;
    setDocAction('working');
    try {
      if (op === 'chunk') {
        const { data } = await worldtreeApi.chunkDocument(selected.id);
        setDocAction(`Chunked: ${data.chunks} chunk(s), ${data.embedded} embedded`);
      } else {
        const { data } = await worldtreeApi.embedDocument(selected.id);
        setDocAction(`Embedded: ${data.embedded} chunk(s)`);
      }
    } catch (err: any) {
      setDocAction(err?.response?.data?.details || 'Operation failed');
    }
  };

  const tab = (m: Mode, label: string, Icon: typeof Library) => (
    <button
      onClick={() => setMode(m)}
      className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium ${
        mode === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Library className="h-6 w-6 mr-2 text-blue-600" /> WorldTree Library
              </h1>
              <p className="text-gray-600">Browse, search, and read the ingested knowledge corpus</p>
            </div>
            <div className="flex items-center space-x-2">
              {tab('documents', 'Documents', FileText)}
              {tab('search', 'Search', Search)}
              {tab('gaps', 'Knowledge Gaps', AlertCircle)}
              {isAdmin && tab('ingest', 'Ingest', Upload)}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* DOCUMENTS */}
        {mode === 'documents' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">{documents.length} documents</h2>
                <button onClick={() => void loadDocuments()} className="text-gray-400 hover:text-gray-600">
                  <RefreshCw className={`h-4 w-4 ${loadingDocs ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => void openDocument(doc)}
                  className={`w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition ${
                    selected?.id === doc.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">{doc.title || doc.sourceUri}</div>
                  <div className="text-xs text-gray-500 truncate">{doc.sourceUri}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.sourceFormat && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">{doc.sourceFormat}</span>
                    )}
                    {doc.formats.map((f) => (
                      <span key={f} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{f}</span>
                    ))}
                  </div>
                </button>
              ))}
              {!loadingDocs && documents.length === 0 && (
                <p className="text-sm text-gray-500">No documents ingested yet.</p>
              )}
            </div>
            <div className="lg:col-span-2">
              {selected ? (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{selected.title || 'Document'}</h2>
                      <a
                        href={selected.sourceUri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 hover:underline inline-flex items-center"
                      >
                        {selected.sourceUri} <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                      <div className="text-xs text-gray-500 mt-1">
                        {selected.sourceFormat} · ingested {new Date(selected.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => void docOp('chunk')} disabled={docAction === 'working'}
                        className="text-xs px-2 py-1 border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50">Re-chunk</button>
                      <button onClick={() => void docOp('embed')} disabled={docAction === 'working'}
                        className="text-xs px-2 py-1 border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50">Re-embed</button>
                      {docAction && docAction !== 'working' && <span className="text-xs text-gray-500">{docAction}</span>}
                      {docAction === 'working' && <span className="text-xs text-gray-400">working…</span>}
                    </div>
                  )}
                  {loadingContent ? (
                    <p className="text-gray-500">Loading content…</p>
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 max-h-[60vh] overflow-auto bg-gray-50 p-4 rounded">
                      {content}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                  Select a document to read its content.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SEARCH */}
        {mode === 'search' && (
          <div className="space-y-6">
            <form onSubmit={runSearch} className="bg-white rounded-lg shadow p-6 space-y-3">
              <label className="block text-sm font-medium text-gray-700">Semantic corpus search</label>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask the corpus a question…"
                  className="flex-1 border rounded-md px-3 py-2"
                />
                <button type="submit" disabled={searching} className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50">
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <input
                value={realms}
                onChange={(e) => setRealms(e.target.value)}
                placeholder="Optional: scope to realms (comma-separated)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </form>
            <div className="space-y-3">
              {results.map((c, i) => (
                <div key={`${c.documentId}-${c.chunkIndex}-${i}`} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span className="truncate">{c.title || c.sourceUri}</span>
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">rank {c.rank.toFixed(3)}</span>
                  </div>
                  {Array.isArray(c.headings) && c.headings.length > 0 && (
                    <div className="text-xs text-gray-400 mb-1">{(c.headings as string[]).join(' › ')}</div>
                  )}
                  <p className="text-sm text-gray-800 line-clamp-4">{c.text}</p>
                </div>
              ))}
              {searched && !searching && results.length === 0 && (
                <p className="text-sm text-gray-500">No matching passages in scope.</p>
              )}
            </div>
          </div>
        )}

        {/* KNOWLEDGE GAPS */}
        {mode === 'gaps' && (
          <div className="bg-white rounded-lg shadow divide-y">
            <div className="p-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">{gaps.length} open knowledge gaps</h2>
              <button onClick={() => void loadGaps()} className="text-gray-400 hover:text-gray-600">
                <RefreshCw className={`h-4 w-4 ${loadingGaps ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {gaps.map((g) => (
              <div key={g.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-gray-900">{g.query}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    realms: {g.realms.length ? g.realms.join(', ') : 'global'} · seen {g.hitCount}× · last {new Date(g.lastSeenAt).toLocaleString()}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => void resolveGap(g.id, 'addressed')} title="Mark addressed"
                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800"><Check className="h-4 w-4" /> Addressed</button>
                    <button onClick={() => void resolveGap(g.id, 'dismissed')} title="Dismiss"
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"><Trash2 className="h-4 w-4" /> Dismiss</button>
                  </div>
                )}
              </div>
            ))}
            {!loadingGaps && gaps.length === 0 && (
              <p className="p-4 text-sm text-gray-500">No open gaps — the corpus has answered everything asked of it.</p>
            )}
          </div>
        )}

        {/* INGEST (admin) */}
        {mode === 'ingest' && isAdmin && (
          <div className="space-y-6 max-w-3xl">
            {ingestMsg && (
              <div className={`p-3 rounded text-sm ${ingestMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{ingestMsg.text}</div>
            )}

            <form onSubmit={submitUrlIngest} className="bg-white rounded-lg shadow p-6 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Ingest from URL</h2>
              <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://… (document or page to ingest)"
                className="w-full border rounded-md px-3 py-2" />
              <input value={urlScope} onChange={(e) => setUrlScope(e.target.value)}
                placeholder="Scope to realms (comma-separated; blank = global)"
                className="w-full border rounded-md px-3 py-2 text-sm" />
              <button type="submit" disabled={busy || !urlInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50">
                <Upload className="h-4 w-4" /> {busy ? 'Ingesting…' : 'Ingest URL'}
              </button>
            </form>

            <form onSubmit={submitDirIngest} className="bg-white rounded-lg shadow p-6 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Ingest a staged directory</h2>
              <p className="text-xs text-gray-500">Path under the configured staging root (operator drops files there first). Runs in the background.</p>
              <input value={dirInput} onChange={(e) => setDirInput(e.target.value)}
                placeholder="e.g. my-corpus  (relative to the staging root)"
                className="w-full border rounded-md px-3 py-2" />
              <input value={dirScope} onChange={(e) => setDirScope(e.target.value)}
                placeholder="Scope to realms (comma-separated; blank = global)"
                className="w-full border rounded-md px-3 py-2 text-sm" />
              <button type="submit" disabled={busy || !dirInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50">
                <Upload className="h-4 w-4" /> {busy ? 'Starting…' : 'Start directory ingest'}
              </button>
            </form>

            {run && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-700">Ingest run <span className="font-mono text-xs">{run.id.slice(0, 8)}</span></h2>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    run.status === 'completed' ? 'bg-green-50 text-green-700' :
                    run.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                  }`}>{run.status}{run.status !== 'completed' && run.status !== 'failed' ? '…' : ''}</span>
                </div>
                <div className="text-sm text-gray-700">
                  {run.ingested} ingested · {run.skipped} skipped · {run.failed} failed · of {run.totalFiles} file(s)
                </div>
                {run.error && <div className="mt-2 text-sm text-red-600">{run.error}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
