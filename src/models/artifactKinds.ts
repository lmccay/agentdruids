/**
 * Worldtree artifact-kind registry.
 *
 * Each kind declares how its artifacts are stored and indexed. The
 * service routes read/write/search calls based on the declared kind;
 * agents specify a kind on every write. See docs/worldtree-spec.md
 * "Artifact kinds".
 *
 * To add a new kind, append to the KINDS array. No other code change
 * is required.
 */

import type { ArtifactKind } from './Worldtree';

const KINDS: readonly ArtifactKind[] = [
  {
    id: 'note',
    storage: 'document',
    schema: 'text/markdown',
    indexing: { fulltext: true, vector: true },
  },
  {
    id: 'observation',
    storage: 'record',
    indexing: { fulltext: true, vector: true, structured: ['domain', 'source'] },
  },
  {
    id: 'evaluation',
    storage: 'record',
    indexing: { structured: ['targetUri', 'criteria'] },
  },
  {
    id: 'lesson',
    storage: 'document',
    schema: 'text/markdown',
    indexing: { fulltext: true, vector: true },
  },
  {
    id: 'source',
    storage: 'document',
    // Multi-MIME; the writer records the specific content-type per artifact.
    indexing: { fulltext: true, vector: true },
  },
  {
    id: 'event-log',
    storage: 'record',
    indexing: { structured: ['eventType', 'timestamp'] },
  },
];

const KIND_INDEX: ReadonlyMap<string, ArtifactKind> = new Map(KINDS.map(k => [k.id, k]));

/** Returns the registered kind for an id, or undefined if not registered. */
export function getArtifactKind(id: string): ArtifactKind | undefined {
  return KIND_INDEX.get(id);
}

/** Returns the full list of registered kinds. */
export function listArtifactKinds(): readonly ArtifactKind[] {
  return KINDS;
}

/** True iff an id is registered. */
export function isRegisteredKind(id: string): boolean {
  return KIND_INDEX.has(id);
}
