/**
 * Worldtree — core type definitions.
 *
 * See docs/worldtree-spec.md for the design rationale. This file establishes
 * the shape of URIs, scopes, artifacts, provenance, and the interfaces the
 * service implements. No runtime logic lives here.
 */

import type { AgentId, RealmId, Timestamp } from './Types';

/**
 * Branded string type for Worldtree URIs. Use parseWorldtreeUri /
 * serializeWorldtreeUri to convert between branded and structured form.
 *
 * The brand is phantom (type-only); at runtime a WorldtreeUri is just a
 * string. The brand prevents accidental use of arbitrary strings where a
 * worldtree URI is expected.
 */
export type WorldtreeUri = string & { readonly __worldtreeUri: unique symbol };

/**
 * A Worldtree scope identifies which slice of the knowledge tree a URI
 * belongs to. Visibility and access-control rules are determined by the
 * scope kind. See docs/worldtree-spec.md "Scopes".
 */
export type WorldtreeScope =
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'agent'; readonly agentId: AgentId; readonly visibility: 'private' | 'public' }
  | { readonly kind: 'realm'; readonly realmId: RealmId }
  | { readonly kind: 'public' };

/**
 * Result of parsing a Worldtree URI into structured components.
 */
export interface ParsedWorldtreeUri {
  readonly scope: WorldtreeScope;
  /** Path within scope. Empty string for scope root. No leading slash. */
  readonly path: string;
}

/**
 * Provenance stamped automatically on every write to the Worldtree.
 * Without provenance the self-improvement loop is just storing strings;
 * provenance is what lets later evaluation look back at who wrote what
 * under what conditions.
 */
export interface Provenance {
  readonly writerAgentId: AgentId;
  readonly sessionId?: string;
  readonly realmId?: RealmId;
  readonly timestamp: Timestamp;
  /** URIs of artifacts that informed this write. */
  readonly sourceUris?: readonly WorldtreeUri[];
  /** If the write came from a tool result, the tool invocation id. */
  readonly toolInvocationId?: string;
  /** Self-reported confidence, 0..1. */
  readonly confidence?: number;
}

/**
 * Storage tier — how an artifact is physically persisted. The artifact
 * kind declares its tier; agents do not pick one directly. See
 * docs/worldtree-spec.md "Storage tiers".
 */
export type StorageTier = 'document' | 'record';

/**
 * Artifact kind declaration. Registered ahead of use; new kinds can be
 * added by extending the registry without code changes elsewhere.
 */
export interface ArtifactKind {
  readonly id: string;
  readonly storage: StorageTier;
  /**
   * For record kinds, a JSON schema (or any structural descriptor) for
   * the record shape. For document kinds, a MIME type string. May be
   * omitted for kinds that accept arbitrary content.
   */
  readonly schema?: object | string;
  readonly indexing: {
    readonly fulltext?: boolean;
    readonly vector?: boolean;
    /** jsonb paths to index for structured query; record kinds only. */
    readonly structured?: readonly string[];
  };
  readonly retention?: {
    readonly ttlSeconds?: number;
    readonly archiveAfterSeconds?: number;
  };
}

/**
 * Metadata attached to a write or returned with a read.
 */
export interface ArtifactMetadata {
  /** ArtifactKind.id. */
  readonly kind: string;
  /** Caller-supplied content type; defaults from the kind's schema if absent. */
  readonly contentType?: string;
  /** Size in bytes, if known. */
  readonly size?: number;
  readonly provenance: Provenance;
  /** Stable identifier for change detection. */
  readonly etag?: string;
  readonly tags?: readonly string[];
}

/**
 * Read result from worldtree.read().
 */
export interface Artifact {
  readonly uri: WorldtreeUri;
  /** Document body or record value. Concrete type depends on the kind. */
  readonly content: unknown;
  readonly metadata: ArtifactMetadata;
}

/**
 * Acknowledgement returned from worldtree.write().
 */
export interface WriteAck {
  readonly uri: WorldtreeUri;
  readonly etag: string;
  readonly provenance: Provenance;
}

/**
 * Listing entry from worldtree.list().
 */
export interface Entry {
  readonly uri: WorldtreeUri;
  readonly kind: string;
  readonly size?: number;
  readonly lastModified: Timestamp;
}

/**
 * Search modes.
 *
 * - 'auto'       — service picks based on query shape and backend capabilities
 * - 'fulltext'   — symbolic match against indexed text
 * - 'vector'     — embedding-similarity match
 * - 'structured' — match against indexed structured fields
 * - 'hybrid'     — combine fulltext + vector with rank fusion
 */
export type SearchMode = 'auto' | 'fulltext' | 'vector' | 'structured' | 'hybrid';

/**
 * Options for worldtree.search(). All fields are optional; the service
 * picks sensible defaults from the caller's scope visibility and the
 * targeted backend's capabilities.
 */
export interface SearchOptions {
  readonly scope?: readonly WorldtreeScope[];
  readonly mode?: SearchMode;
  readonly kind?: readonly string[];
  readonly filters?: Readonly<Record<string, unknown>>;
  readonly limit?: number;
  readonly since?: Timestamp;
}

/**
 * Search hit from worldtree.search().
 */
export interface SearchResult {
  readonly uri: WorldtreeUri;
  readonly score: number;
  readonly snippet?: string;
  readonly metadata: ArtifactMetadata;
}

/**
 * Event emitted by worldtree.subscribe().
 */
export interface WorldtreeEvent {
  readonly uri: WorldtreeUri;
  readonly event: 'write' | 'delete';
  readonly timestamp: Timestamp;
  readonly provenance?: Provenance;
}
