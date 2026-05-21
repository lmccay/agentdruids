# Worldtree Specification

**Status:** Draft
**Last updated:** 2026-05-21
**Owner:** maintainers

---

## Summary

The Worldtree is Druids' persistent, scoped, queryable knowledge substrate. It is the place where coordination sessions write their conclusions, where agents accumulate domain expertise across runs, where realms keep shared knowledge for the agents operating in them, and where any MCP client — internal or external — can retrieve what the agent fleet has learned.

The right mental model is a **knowledge filesystem with multiple access modes**, not a RAG pipeline. Files (and records, and embeddings) are addressed by URIs. Search, structured query, and semantic retrieval are alternative indexes on top of that filesystem. Agents pick the access mode that fits the task; they do not have to route every query through one fixed pipeline.

This spec defines: the namespace model, URI scheme, artifact-kind registry, agent-facing interface, access-control rules, storage-tier dispatch, the backend abstraction that makes future federation possible, and how the Worldtree is exposed to MCP clients.

## Why this exists

Current state, audited 2026-05-21:

- `src/models/KnowledgeNamespace.ts` is a 563-line over-specified type definition anticipating vector + full-text + semantic + graph + federation + sync + governance + lifecycle + analytics. None of it is implemented.
- `src/services/KnowledgeService.ts` is a 41-line stub returning hardcoded `"test"` strings.
- `src/api/knowledge.ts` routes either return `[]` or fabricate response objects without persisting anything.
- `druids_knowledge` Postgres schema exists with reasonable tables (`entries`, `namespaces`) and no writer in production code.
- `SessionContentManager` is the one piece that actually works: it persists session content to disk and translates `worldtree://session/{id}/...` ↔ `worldtree://public/...` URIs.
- `worldtree://` URI prefixes appear in five separate files (`SimpleMCPServer`, `AsyncResultManager`, `SessionContentManager`, `CoordinationService`, `api/content.ts`), each handling them with ad-hoc string manipulation.

A central research direction for this project — self-improvement of agent behavior via knowledge that accumulates across coordination sessions — is currently unsupported by code. Vertical applications built on top of Druids (domain-specialized agent fleets for fields such as marketing, legal, or learning) likewise depend on durable, scoped, domain-organized knowledge accumulation as their core competency. Realizing the Worldtree is the keystone that unblocks both.

This spec defines what we are going to build. The implementation lands in PRs sequenced after this one merges.

## Mental model

The Worldtree is *not* a RAG system. It is *not* a vector database. It is *not* an embedding index. It contains all of those as internal mechanisms, but the abstraction agents interact with is a **scoped, addressable, queryable knowledge filesystem** with five primitive operations.

Three claims follow from that frame:

1. **URIs, not opaque IDs.** Every piece of knowledge is addressable by a Worldtree URI. Two different writers describing the same thing should produce the same URI (or a URI that explicitly references the canonical one).
2. **Agents choose the access mode.** Reading a specific known URI is different from listing a prefix, which is different from semantic search. The interface exposes all three; the agent picks.
3. **Storage is an implementation detail.** Documents may live on disk, records may live in Postgres, embeddings may live in pgvector, and one day some of those may live in external services. Agents do not need to know.

## Scopes

Worldtree has four scopes. Every URI belongs to exactly one.

| Scope | Lifetime | Visible to (default) |
|---|---|---|
| `session/{session-id}` | Lives and dies with the coordination session | Agents participating in the session |
| `agent/{agent-id}` | Persists across sessions for as long as the agent exists | The owning agent (private); other agents with explicit grant (public sub-tree) |
| `realm/{realm-id}` | Persists for the life of the realm | Agents currently in the realm, plus realms linked by an active ley-line |
| `public` | Persists for the life of the deployment | All agents in all realms |

Default visibility from an agent's perspective is the union of:

- own session scope
- own agent scope (own private + everyone's public sub-tree)
- realms the agent is currently in (full read; write controlled by the agent's role in the realm)
- public

Cross-realm read requires an active **ley-line** — Druids' existing concept for federated realm connection — between the requesting realm and the target realm. Ley-lines are auditable, revocable, and time-bound. The ley-line is the mechanism by which a Marketing realm can read curated Legal-realm artifacts without merging knowledge bases.

Write permissions are stricter than read: agents can always write to their own session and agent-private scopes; agent-public and realm scopes require explicit permission from the realm/agent governance config; public-scope writes are restricted to designated curator agents.

These rules are enforced inside the Worldtree service, not at the API boundary, so they hold uniformly regardless of which surface (MCP, REST, internal agent tool) made the request.

## URI scheme

```
worldtree://{scope}/{path}
```

Where:

- `{scope}` is one of:
  - `session/{session-id}` — UUID
  - `agent/{agent-id}/private`
  - `agent/{agent-id}/public`
  - `realm/{realm-id}`
  - `public`
- `{path}` is a slash-delimited path with no leading slash. Path segments are URL-encoded.

Examples:

```
worldtree://session/3f8b.../scratch/messages.jsonl
worldtree://agent/marketing-druid-1/private/observations/2026-05/twitter-trends.jsonl
worldtree://agent/legal-elemental-2/public/templates/nda-template.md
worldtree://realm/marketing/notes/launch-playbook-v3.md
worldtree://realm/marketing/observations/2026-05-21T14:30:00Z/twitter-thread-1234
worldtree://public/conventions/coordination-session-output-format.md
```

The URI is the canonical identifier. Two writes to the same URI overwrite (with provenance trail); two writes to different URIs are distinct artifacts even if their content is byte-identical.

## Artifact kinds

Worldtree URIs do not exist in isolation — every artifact has a registered **kind** that declares its storage, schema, and indexing properties.

```typescript
interface ArtifactKind {
  id: string                          // e.g. "observation", "note", "research-finding"
  storage: "document" | "record"      // see "Storage tiers" below
  schema?: object                     // JSON schema for record kinds; mime-type for document kinds
  indexing: {
    fulltext?: boolean                // index for text search
    vector?: boolean                  // generate + store embedding
    structured?: string[]             // jsonb paths to index for structured query
  }
  retention?: {
    ttlSeconds?: number
    archiveAfterSeconds?: number
  }
}
```

The artifact kind is part of the URI's metadata, not its path. A writer specifies `kind` when calling `write()`. Read operations include the kind in the returned metadata.

A small set of kinds ship in v1; new kinds can be registered without code changes:

- `note` (document, fulltext + vector)
- `observation` (record, fulltext + vector + structured on `[domain, source]`)
- `evaluation` (record, structured on `[target_uri, criteria]`)
- `lesson` (document, fulltext + vector)
- `event-log` (record, structured on `[event_type, timestamp]`)
- `source` (document, fulltext + vector; an external artifact ingested into the worldtree)

This registry is the mechanism by which the Worldtree stays open-ended without becoming a kitchen-sink type system. New kinds (lesson plans, trend reports, legal templates, etc.) get registered as vertical applications need them.

## Provenance

Every write to the Worldtree is stamped with provenance, automatically by the service. Agents do not opt in.

```typescript
interface Provenance {
  writerAgentId: AgentId
  sessionId?: SessionId               // present if write happened inside a coordination session
  realmId?: RealmId                   // realm the writer was operating in
  timestamp: Timestamp
  sourceUris?: WorldtreeUri[]         // for derivative writes — what informed this
  toolInvocationId?: string           // if the write came from a tool result
  confidence?: number                 // 0..1, optional self-reported by writer
}
```

Provenance is what makes the self-improvement loop work: a future evaluation agent can look back at *who said what under what conditions* and assess whether predictions held, whether sources stayed valid, whether the writer's earlier confidence calibrated. Without provenance, the loop is just storing strings.

Provenance is queryable. `worldtree.search({ writerAgentId: "marketing-druid-1", since: "2026-04-01" })` is a valid query.

## Agent interface

The Worldtree exposes five primitives to agents. Everything else is built on top of these.

```typescript
interface Worldtree {
  read(uri: WorldtreeUri): Promise<Artifact>

  write(
    uri: WorldtreeUri,
    content: string | Buffer | object,
    opts: {
      kind: string                            // ArtifactKind id
      metadata?: Record<string, unknown>      // kind-specific metadata
      sourceUris?: WorldtreeUri[]             // provenance hint
    }
  ): Promise<WriteAck>

  list(uriPrefix: WorldtreeUri): Promise<Entry[]>

  search(
    query: string,
    opts?: {
      scope?: WorldtreeScope[]                // default: all visible
      mode?: "auto" | "fulltext" | "vector" | "structured" | "hybrid"
      kind?: string[]                         // filter by artifact kind
      filters?: Record<string, unknown>       // structured filters
      limit?: number
      since?: Timestamp
    }
  ): Promise<SearchResult[]>

  subscribe(
    uriPrefix: WorldtreeUri,
    opts?: { events?: ("write" | "delete")[] }
  ): AsyncIterable<WorldtreeEvent>
}
```

Notes:

- `read` returns the full artifact: content + kind + provenance + metadata + a stable `etag`.
- `write` is upsert with provenance trail; previous versions are retained according to kind-level retention policy.
- `list` is directory-like; returns shallow entries by default. Add `recursive: true` opt for tree walk (use sparingly on large prefixes).
- `search` mode `"auto"` lets the service pick (fulltext for short keyword queries, vector for natural-language questions, hybrid combining both); explicit modes are available for advanced callers.
- `subscribe` integrates with the session-event stream from [runtime-rendering-roadmap.md](runtime-rendering-roadmap.md) — Worldtree write events become a subset of the session event stream.

Access control is enforced inside every operation. An agent attempting to read a URI outside its scope visibility gets a denied response (and an audit log entry); it does not get an empty result that could be confused with "URI doesn't exist."

## Access control

Worldtree access control is **enforced by Druids**, not by underlying storage. Even when an artifact lives in an external backend (see "Federation"), Druids checks scope/realm/agent permissions before issuing the backend call.

Three checks happen on every operation:

1. **Scope check.** Does the caller's scope visibility include the URI's scope?
2. **Kind check.** Does the caller's role grant permission for this artifact kind? (Some kinds are sensitive — e.g., `evaluation` may be restricted to specific agent roles.)
3. **Ley-line check.** If the URI is in a realm other than the caller's, is there an active ley-line authorizing this read direction?

Writes have a fourth check (role-based write permission in the target scope) and stamp provenance.

Constitutional alignment: the existing session-isolation invariants in `CLAUDE.md` ("Concurrent Session Architecture (CONSTITUTIONAL)") are unaffected. Session-scoped Worldtree entries die with their session as today. Agent and realm scopes extend the model — they always could, the spec just formalizes them.

## Storage architecture

### Storage tiers

Artifacts split into two tiers based on their **shape**, not on quality or importance:

| Tier | Shape | Examples | Backend |
|---|---|---|---|
| **Document** | Long-form, low fan-out, file-shaped | Notes, source documents, lesson plans, templates | Filesystem (`LocalFsBackend` v1; Volumez-S3 later) |
| **Record** | Structured, high fan-out, row-shaped | Observations, evaluations, event logs, embeddings | Postgres jsonb (`LocalPgvectorBackend` v1) |

Why split: documents (low count, occasionally large) play well with a filesystem. Records (high count, small per-item) would hit the FUSE small-file problem if forced onto the filesystem; they belong in a row store. The artifact kind declares which tier it uses.

This split is invisible to agents — they see `worldtree://...` URIs uniformly; the service routes based on the registered kind.

### Backends (v1)

Two backend implementations ship in v1:

- **`LocalFsBackend`** — Documents. Reads/writes files under a configured root path (default `/var/lib/druids/worldtree/`). This is the production refactor of `SessionContentManager`'s existing filesystem logic — pull the working part up into the Worldtree.
- **`LocalPgvectorBackend`** — Records, embeddings, FTS. Backed by existing Druids Postgres with the `pgvector` and standard FTS extensions enabled.

Both ship with the Worldtree implementation PR (PR B in the implementation phasing).

### Backend interface

```typescript
interface WorldtreeBackend {
  capabilities: {
    documents?: boolean
    records?: boolean
    vectorSearch?: boolean
    fulltextSearch?: boolean
    structuredQuery?: boolean
    subscribe?: boolean
  }

  read(uri: WorldtreeUri): Promise<Artifact>
  write(uri: WorldtreeUri, content: unknown, metadata: ArtifactMetadata): Promise<WriteAck>
  list(prefix: WorldtreeUri): Promise<Entry[]>
  search(query: SearchQuery): Promise<SearchResult[]>
  subscribe?(prefix: WorldtreeUri): AsyncIterable<WorldtreeEvent>
  delete(uri: WorldtreeUri): Promise<void>
}
```

Backends declare their `capabilities` honestly. The Worldtree service inspects capabilities before routing a call; if a query requests vector search and the backing namespace's backend doesn't support it, the service either rejects the query or (if `mode: "auto"`) falls back to whatever the backend supports.

### Namespace-to-backend binding

Backends are bound to namespaces by configuration. Defaults:

```
worldtree://session/*           →  LocalFsBackend (small files) + LocalPgvectorBackend (records)
worldtree://agent/*             →  LocalFsBackend + LocalPgvectorBackend
worldtree://realm/*             →  LocalFsBackend + LocalPgvectorBackend
worldtree://public/*            →  LocalFsBackend + LocalPgvectorBackend
```

In deployments that need it (later, post-v1), per-namespace overrides become possible:

```
worldtree://realm/legal/*       →  PineconeBackend(customer-managed-instance)
```

The binding is operator configuration, not agent-facing. Agents always see `worldtree://...` URIs identically.

### Federation pattern (deferred to post-v1)

Federation — backing some namespaces with external services like Pinecone, Weaviate, Qdrant, or others — is **not implemented in v1**. The spec describes it now so the v1 architecture leaves it possible without rework.

The shape of future external backends:

- Each external service gets a `WorldtreeBackend` implementation (e.g., `PineconeBackend`, `WeaviateBackend`).
- A backend implementation maps Worldtree's URIs and access patterns to the external service's API.
- Access control stays in Druids: Druids decides whether a request is allowed before calling the backend.
- Provenance is stored alongside the artifact (in the backend, if it supports metadata) or in Druids' Postgres as a sidecar.
- Cross-backend federated search (`search()` that spans multiple backends) is a Phase-2 feature with explicit cost. v1 `search()` calls target a single backend.

### Sibling-system access (two patterns)

A business running Druids alongside other agentic systems (a custom LangChain agent, a separate research tool, a vertical AI product) can share knowledge through one of two patterns:

1. **Through the external backend.** Knowledge lives in Pinecone; Druids and Other System both call Pinecone. Federated. Druids does not gate access — the backend's own permissions do.
2. **Through Druids' MCP.** Knowledge lives wherever Druids puts it; Other System calls Druids' MCP `worldtree_search` tool. Druids gates and audits every access.

Both patterns will be supported. Deployment chooses based on trust posture: through-MCP for high-trust single-business deployments; through-the-backend for data-sovereignty or multi-tenant scenarios where the customer must own the storage.

## MCP exposure

Worldtree is exposed to MCP clients through two MCP primitives.

### MCP Resources

Every Worldtree URI is an MCP resource. Clients can:

- List resources by scope (`worldtree://realm/marketing/*`)
- Read resources by URI
- Subscribe to resource changes (maps to Worldtree's `subscribe`)

This is the surface for known-URI access — a client that wants to read the latest marketing-playbook can do so directly.

### MCP Tools

Three Worldtree tools are exposed:

- `worldtree_search` — wraps `search()`. Caller provides query, scope filter, mode hint.
- `worldtree_query` — structured query for records by kind, time range, provenance, filters.
- `worldtree_subscribe` — opens a subscription stream to a URI prefix.

These are the surface for discovery — when the client doesn't know the URI but knows what it's looking for.

This split (resources for known-URI access, tools for search) follows the MCP convention and gives external clients the same access pattern that internal Druids agents have. The cross-client value proposition is made concrete: a Goose user querying `worldtree_search("twitter timing patterns")` hits the same accumulated knowledge an LV-realm marketing agent built up.

## Migration from current state

This is a greenfield refactor. **No backward-compatibility shim** for the existing `KnowledgeNamespace` / `KnowledgeService` types or the `druids_knowledge` schema. The current code does not have production users — its outputs are mocks. There is nothing to preserve.

What gets removed:

- `src/models/KnowledgeNamespace.ts` (563-line over-specified types) — replaced by a slim `src/models/Worldtree.ts`.
- `src/services/KnowledgeService.ts` (41-line stub) — replaced by real `src/services/WorldtreeService.ts`.
- `src/api/knowledge.ts` (mocked routes) — replaced or removed; access goes through MCP and a thinner REST surface.

What gets refactored:

- `SessionContentManager`'s filesystem persistence — pulled up into `LocalFsBackend` and reused.
- `SimpleMCPServer`'s ad-hoc `worldtree://...` string construction — routed through `WorldtreeService`.
- `AsyncResultManager`'s `worldtree://public/async_results` paths — same.
- `CoordinationService`'s `worldtree://public/creative-sessions/...` writes — same.

What gets added:

- `druids_knowledge.entries` extended (or replaced) with: `scope`, `realm_id`, `agent_id`, `session_id`, `kind`, `provenance jsonb`, `embedding vector`, `content_text tsvector`.
- pgvector extension enabled.
- FTS configured.

## Non-goals

Explicitly **not** in scope for the Worldtree v1 implementation:

- No external backend implementations (Pinecone, Weaviate, Qdrant, etc.). The backend interface accommodates them; v1 ships only `LocalFsBackend` and `LocalPgvectorBackend`.
- No cross-backend federated search. v1 `search()` calls target a single backend.
- No graph traversal as a first-class access mode (graph queries can be modeled as structured queries on relationship records; dedicated graph backends are deferred).
- No automatic summarization or compaction agents. The retention policy declares lifecycle; consolidation is a separate concern (and a candidate for the self-improvement loop).
- No new database technology. Postgres is the only database; pgvector and FTS extensions are the only additions.
- No replacement of the existing constitutional session-isolation architecture. Worldtree's session scope is built on top of, not in place of, the existing session managers.

## Implementation phasing

Sequential PRs after this spec merges:

**PR B — Core implementation**
Worldtree types and service; URI parsing; scope and access-control enforcement; artifact-kind registry with the v1 kind set; `LocalFsBackend` and `LocalPgvectorBackend`; migration enabling pgvector and FTS; refactor of `SessionContentManager`, `SimpleMCPServer`, `AsyncResultManager`, `CoordinationService` to use the service. Contract tests for URI resolution, scope visibility, write→read round-trips, provenance stamping.

**PR C — MCP exposure**
Worldtree URIs as MCP resources (with subscription); `worldtree_search`, `worldtree_query`, `worldtree_subscribe` MCP tools; documentation in `MCP_CLIENT_CONFIGURATION.md`; optional alignment of built-in `read_file`/`write_file` agent tools to recognize `worldtree://` URIs.

**PR D — Volumez backend (deferred until needed)**
`VolumezBackend` implementation as an alternative to `LocalFsBackend` for documents; docker-compose mounting strategy; macOS Docker Desktop verification or documented workaround. Slot until cross-host shared blobs become a real requirement.

**PR E — First external backend (deferred until customer-driven)**
First federated backend (probably Pinecone, customer-selected). Implements the federation pattern described in this spec.

## Open questions

These decisions are deferred to the relevant implementation PR.

- **Embedding model.** OpenAI `text-embedding-3-small`? `text-embedding-3-large`? A local model via Ollama? Decided in PR B based on cost/latency/quality tradeoffs and what's already configured.
- **pgvector dimensions and distance metric.** Follows from the embedding model choice. Default to cosine distance unless evidence warrants otherwise.
- **Session-scope retention TTL.** How long after a session ends do session-scoped artifacts remain readable? Operational concern; sensible default is "until session record is garbage collected"; configurable per deployment.
- **`agent/*/public` write controls.** Can any agent write to its own public sub-tree, or does it require explicit grant? Default: agent owns its public sub-tree but can grant write to other agents.
- **Search result ranking across modes.** When `mode: "hybrid"` is used, how are vector and FTS scores combined? Default to a simple weighted sum (RRF reciprocal-rank fusion); tune from real traffic in PR C.
- **Artifact kind versioning.** When a kind's schema evolves, how are existing artifacts of that kind handled? Default: versions are explicit (`kind: "observation@v2"`); older versions remain readable indefinitely; new writes go to current version.
- **MCP resource URI format vs. Worldtree URI.** MCP has its own URI conventions; we may need a small adapter. Confirm in PR C.

## References

- [CLAUDE.md](../CLAUDE.md) — "Concurrent Session Architecture (CONSTITUTIONAL)" section; isolation invariants Worldtree must preserve
- [MCP_COMPLIANCE_CONSTITUTION.md](MCP_COMPLIANCE_CONSTITUTION.md) — MCP compliance constraints the resource/tool exposure must satisfy
- [runtime-rendering-roadmap.md](runtime-rendering-roadmap.md) — Companion roadmap; Worldtree write events become a subset of the session event stream described there
- [goose-integration-roadmap.md](goose-integration-roadmap.md) — Goose integration; sibling-system access pattern through-MCP is the primary integration surface for Goose users
- `src/services/SessionContentManager.ts` — Existing filesystem-persistence logic to be pulled into `LocalFsBackend`

## Revision history

- **2026-05-21** — Initial draft. Established four-scope namespace model, URI scheme, artifact-kind registry, agent-facing interface, backend abstraction (federation slot), MCP exposure plan, migration strategy (greenfield, no compat shim), v1 non-goals, and PR phasing.
