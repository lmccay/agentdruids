import { parseWorldtreeUri, serializeWorldtreeUri } from '../../src/utils/worldtreeUri';
import type { ParsedWorldtreeUri } from '../../src/models/Worldtree';

describe('worldtreeUri', () => {
  describe('parseWorldtreeUri — valid URIs', () => {
    it('parses session URI with path', () => {
      const result = parseWorldtreeUri('worldtree://session/sess-123/scratch/messages.jsonl');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toEqual({ kind: 'session', sessionId: 'sess-123' });
        expect(result.value.path).toBe('scratch/messages.jsonl');
      }
    });

    it('parses session URI without path (scope root)', () => {
      const result = parseWorldtreeUri('worldtree://session/sess-123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toEqual({ kind: 'session', sessionId: 'sess-123' });
        expect(result.value.path).toBe('');
      }
    });

    it('parses agent URI with private visibility', () => {
      const result = parseWorldtreeUri(
        'worldtree://agent/marketing-druid-1/private/observations/twitter.jsonl',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toEqual({
          kind: 'agent',
          agentId: 'marketing-druid-1',
          visibility: 'private',
        });
        expect(result.value.path).toBe('observations/twitter.jsonl');
      }
    });

    it('parses agent URI with public visibility', () => {
      const result = parseWorldtreeUri('worldtree://agent/legal-elemental/public/templates/nda.md');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toEqual({
          kind: 'agent',
          agentId: 'legal-elemental',
          visibility: 'public',
        });
        expect(result.value.path).toBe('templates/nda.md');
      }
    });

    it('parses agent URI without path (visibility root)', () => {
      const result = parseWorldtreeUri('worldtree://agent/a1/private');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.path).toBe('');
      }
    });

    it('parses realm URI with path', () => {
      const result = parseWorldtreeUri('worldtree://realm/marketing/notes/playbook.md');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toEqual({ kind: 'realm', realmId: 'marketing' });
        expect(result.value.path).toBe('notes/playbook.md');
      }
    });

    it('parses realm URI without path', () => {
      const result = parseWorldtreeUri('worldtree://realm/marketing');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.path).toBe('');
      }
    });

    it('parses public URI with path', () => {
      const result = parseWorldtreeUri('worldtree://public/conventions/output-format.md');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toEqual({ kind: 'public' });
        expect(result.value.path).toBe('conventions/output-format.md');
      }
    });

    it('parses bare public scope', () => {
      const result = parseWorldtreeUri('worldtree://public');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scope).toEqual({ kind: 'public' });
        expect(result.value.path).toBe('');
      }
    });
  });

  describe('parseWorldtreeUri — invalid URIs', () => {
    it('rejects URI without scheme', () => {
      const result = parseWorldtreeUri('session/x/y');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('must start with');
    });

    it('rejects URI with wrong scheme', () => {
      const result = parseWorldtreeUri('http://session/x/y');
      expect(result.ok).toBe(false);
    });

    it('rejects URI with empty scope', () => {
      const result = parseWorldtreeUri('worldtree://');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('no scope');
    });

    it('rejects session URI without id', () => {
      const result = parseWorldtreeUri('worldtree://session/');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('session-id');
    });

    it('rejects agent URI without visibility segment', () => {
      const result = parseWorldtreeUri('worldtree://agent/a1');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('visibility');
    });

    it('rejects agent URI with invalid visibility', () => {
      const result = parseWorldtreeUri('worldtree://agent/a1/secret/path');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('private');
    });

    it('rejects realm URI without id', () => {
      const result = parseWorldtreeUri('worldtree://realm/');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('realm-id');
    });

    it('rejects unknown scope', () => {
      const result = parseWorldtreeUri('worldtree://galaxy/somewhere');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('unknown scope');
    });
  });

  describe('serializeWorldtreeUri', () => {
    it('serializes session URI', () => {
      const parsed: ParsedWorldtreeUri = {
        scope: { kind: 'session', sessionId: 'sess-1' },
        path: 'foo/bar',
      };
      expect(serializeWorldtreeUri(parsed)).toBe('worldtree://session/sess-1/foo/bar');
    });

    it('serializes session URI without path', () => {
      const parsed: ParsedWorldtreeUri = {
        scope: { kind: 'session', sessionId: 'sess-1' },
        path: '',
      };
      expect(serializeWorldtreeUri(parsed)).toBe('worldtree://session/sess-1');
    });

    it('serializes agent URI with private visibility', () => {
      const parsed: ParsedWorldtreeUri = {
        scope: { kind: 'agent', agentId: 'a1', visibility: 'private' },
        path: 'x/y',
      };
      expect(serializeWorldtreeUri(parsed)).toBe('worldtree://agent/a1/private/x/y');
    });

    it('serializes realm URI', () => {
      const parsed: ParsedWorldtreeUri = {
        scope: { kind: 'realm', realmId: 'marketing' },
        path: 'notes',
      };
      expect(serializeWorldtreeUri(parsed)).toBe('worldtree://realm/marketing/notes');
    });

    it('serializes bare public URI', () => {
      const parsed: ParsedWorldtreeUri = { scope: { kind: 'public' }, path: '' };
      expect(serializeWorldtreeUri(parsed)).toBe('worldtree://public');
    });

    it('serializes public URI with path', () => {
      const parsed: ParsedWorldtreeUri = {
        scope: { kind: 'public' },
        path: 'a/b/c',
      };
      expect(serializeWorldtreeUri(parsed)).toBe('worldtree://public/a/b/c');
    });
  });

  describe('round-trip', () => {
    const cases = [
      'worldtree://session/s1/path/to/x',
      'worldtree://session/s1',
      'worldtree://agent/a1/private/notes/file.md',
      'worldtree://agent/a1/public',
      'worldtree://realm/r1/x/y/z',
      'worldtree://realm/r1',
      'worldtree://public/a/b',
      'worldtree://public',
    ];
    cases.forEach(uri => {
      it(`round-trips ${uri}`, () => {
        const parsed = parseWorldtreeUri(uri);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(serializeWorldtreeUri(parsed.value)).toBe(uri);
        }
      });
    });
  });
});
