/**
 * WorldTree read-only resources for the MCP surface (Phase A).
 *
 * Resources are addressable URIs under the `worldtree://` scheme that return
 * JSON. This module parses the discovery URI patterns and dispatches each to
 * the main app's /api/worldtree REST routes via the injected `apiCall`.
 *
 * Only the discovery second-segments are claimed here: `sessions`, `agents`,
 * `realms`, `modes`. Anything else (e.g. the existing `worldtree://public/...`
 * content-storage paths) returns null so the caller can fall through to its
 * existing resource handling.
 *
 * See docs/phase-a-worldtree-discovery.md.
 */

import type { ApiCall } from './worldtreeTools';

const PREFIX = 'worldtree://';

/** Concrete, enumerable roots advertised in `resources/list`. */
export const WORLDTREE_RESOURCE_DEFINITIONS = [
  {
    uri: 'worldtree://sessions',
    name: 'WorldTree Sessions',
    description: 'Index of all coordination sessions. Append /{sessionId} for a full record.',
    mimeType: 'application/json',
  },
  {
    uri: 'worldtree://modes',
    name: 'WorldTree Publishing Modes',
    description: 'Catalog of publishing modes (summary, raw, report, dataset, transcript).',
    mimeType: 'application/json',
  },
];

interface ParsedUri {
  segments: string[];
  query: URLSearchParams;
}

function parseWorldTreeUri(uri: string): ParsedUri | null {
  if (!uri.startsWith(PREFIX)) return null;
  const rest = uri.slice(PREFIX.length);
  const [pathPart, queryPart] = rest.split('?');
  const segments = (pathPart ?? '')
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
  return { segments, query: new URLSearchParams(queryPart ?? '') };
}

function pagedQuery(query: URLSearchParams, keys: string[]): string {
  const search = new URLSearchParams();
  for (const key of keys) {
    const value = query.get(key);
    if (value !== null && value !== '') search.append(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

/**
 * Resolve a worldtree:// discovery URI to its backing REST endpoint, or null if
 * the URI is not a discovery resource this module owns.
 */
function resolveEndpoint(parsed: ParsedUri): string | null {
  const { segments, query } = parsed;
  const [first, second, third, fourth] = segments;

  switch (first) {
    case 'sessions':
      if (segments.length === 1) {
        return `/worldtree/sessions${pagedQuery(query, ['status', 'coordinatorId', 'realmId', 'since', 'until', 'limit', 'offset'])}`;
      }
      if (segments.length === 2 && second) {
        // Full record per design: include contributions and publications.
        return `/worldtree/sessions/${encodeURIComponent(second)}?includeContributions=true&includePublications=true`;
      }
      if (segments.length === 3 && second && third === 'contributions') {
        return `/worldtree/sessions/${encodeURIComponent(second)}/contributions`;
      }
      if (segments.length === 3 && second && third === 'publications') {
        return `/worldtree/sessions/${encodeURIComponent(second)}/publications`;
      }
      if (segments.length === 4 && second && third === 'publications' && fourth) {
        return `/worldtree/sessions/${encodeURIComponent(second)}/publications/${encodeURIComponent(fourth)}`;
      }
      return null;

    case 'agents':
      if (segments.length === 3 && second && third === 'contributions') {
        return `/worldtree/agents/${encodeURIComponent(second)}/contributions${pagedQuery(query, ['limit', 'offset'])}`;
      }
      if (segments.length === 3 && second && third === 'summary') {
        return `/worldtree/agents/${encodeURIComponent(second)}/summary`;
      }
      return null;

    case 'realms':
      if (segments.length === 3 && second && third === 'sessions') {
        return `/worldtree/realms/${encodeURIComponent(second)}/sessions${pagedQuery(query, ['limit', 'offset'])}`;
      }
      return null;

    case 'modes':
      if (segments.length === 1) return '/worldtree/modes';
      return null;

    default:
      return null;
  }
}

/**
 * Read a worldtree:// discovery resource. Returns the MCP resource payload, or
 * null if the URI is not one this module owns (caller should fall through).
 */
export async function readWorldTreeResource(
  uri: string,
  apiCall: ApiCall
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | null> {
  const parsed = parseWorldTreeUri(uri);
  if (!parsed) return null;
  const endpoint = resolveEndpoint(parsed);
  if (!endpoint) return null;

  const data = await apiCall(endpoint);
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/** Whether a URI is a worldtree discovery resource this module can serve. */
export function isWorldTreeResource(uri: string): boolean {
  const parsed = parseWorldTreeUri(uri);
  return parsed !== null && resolveEndpoint(parsed) !== null;
}
