/**
 * Worldtree URI parser and serializer.
 *
 * URI form: worldtree://{scope}/{path}
 *
 * Scope forms:
 *   session/{session-id}
 *   agent/{agent-id}/private
 *   agent/{agent-id}/public
 *   realm/{realm-id}
 *   public
 *
 * Path is empty for scope-root URIs. See docs/worldtree-spec.md.
 */

import type { ParsedWorldtreeUri, WorldtreeScope, WorldtreeUri } from '../models/Worldtree';

const SCHEME = 'worldtree://';

export type ParseResult =
  | { readonly ok: true; readonly value: ParsedWorldtreeUri }
  | { readonly ok: false; readonly error: string };

/**
 * Parse a Worldtree URI string into structured components. Returns a
 * discriminated union so callers must handle the failure case.
 */
export function parseWorldtreeUri(uri: string): ParseResult {
  if (!uri.startsWith(SCHEME)) {
    return { ok: false, error: `URI must start with "${SCHEME}"` };
  }
  const rest = uri.slice(SCHEME.length);
  if (rest.length === 0) {
    return { ok: false, error: 'URI has no scope after scheme' };
  }

  if (rest === 'public') {
    return { ok: true, value: { scope: { kind: 'public' }, path: '' } };
  }
  if (rest.startsWith('public/')) {
    return {
      ok: true,
      value: { scope: { kind: 'public' }, path: rest.slice('public/'.length) },
    };
  }

  if (rest.startsWith('session/')) {
    const tail = rest.slice('session/'.length);
    if (tail.length === 0) {
      return { ok: false, error: 'session scope requires a session-id segment' };
    }
    const slash = tail.indexOf('/');
    const sessionId = slash === -1 ? tail : tail.slice(0, slash);
    if (sessionId.length === 0) {
      return { ok: false, error: 'session scope requires a non-empty session-id segment' };
    }
    const path = slash === -1 ? '' : tail.slice(slash + 1);
    return { ok: true, value: { scope: { kind: 'session', sessionId }, path } };
  }

  if (rest.startsWith('agent/')) {
    const tail = rest.slice('agent/'.length);
    const parts = tail.split('/');
    if (parts.length < 2) {
      return {
        ok: false,
        error: 'agent scope requires an agent-id segment and a visibility segment',
      };
    }
    const agentId = parts[0];
    const visibility = parts[1];
    if (agentId === undefined || agentId.length === 0) {
      return { ok: false, error: 'agent scope requires a non-empty agent-id segment' };
    }
    if (visibility !== 'private' && visibility !== 'public') {
      return {
        ok: false,
        error: `agent visibility must be "private" or "public", got "${visibility ?? ''}"`,
      };
    }
    const path = parts.slice(2).join('/');
    return {
      ok: true,
      value: { scope: { kind: 'agent', agentId, visibility }, path },
    };
  }

  if (rest.startsWith('realm/')) {
    const tail = rest.slice('realm/'.length);
    if (tail.length === 0) {
      return { ok: false, error: 'realm scope requires a realm-id segment' };
    }
    const slash = tail.indexOf('/');
    const realmId = slash === -1 ? tail : tail.slice(0, slash);
    if (realmId.length === 0) {
      return { ok: false, error: 'realm scope requires a non-empty realm-id segment' };
    }
    const path = slash === -1 ? '' : tail.slice(slash + 1);
    return { ok: true, value: { scope: { kind: 'realm', realmId }, path } };
  }

  return { ok: false, error: `unknown scope in URI: "${uri}"` };
}

/**
 * Serialize a structured Worldtree URI to its string form.
 */
export function serializeWorldtreeUri(parsed: ParsedWorldtreeUri): WorldtreeUri {
  const { scope, path } = parsed;
  const scopeStr = scopeToString(scope);
  const uri = path.length === 0 ? `${SCHEME}${scopeStr}` : `${SCHEME}${scopeStr}/${path}`;
  return uri as WorldtreeUri;
}

function scopeToString(scope: WorldtreeScope): string {
  switch (scope.kind) {
    case 'session':
      return `session/${scope.sessionId}`;
    case 'agent':
      return `agent/${scope.agentId}/${scope.visibility}`;
    case 'realm':
      return `realm/${scope.realmId}`;
    case 'public':
      return 'public';
  }
}
