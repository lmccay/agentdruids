# Operator Ingestion Flow — staging, triggering, discovery, and the corpus catalog

**Status:** Design
**Builds on:** `docling-integration-evaluation.md`, `realm-grounded-assessment.md`, migrations 008/009 + Layer 1 (PR #31)
**Scope:** The end-to-end lifecycle by which an admin/operator gets external resources into the WorldTree and finds them again — acquisition (outside Druids), triggering ingest from a staged directory, discovering a run's results, and browsing the full corpus "card catalog." No vectorization required (lexical surface); semantic is a later upgrade.

## Principle: acquisition and ingestion are separate stages

Druids does **not** fetch or crawl. The operator acquires with whatever tool fits (`wget -r`, download-and-unzip, rsync, manual download, an export), and the artifacts land in a **staging directory Druids can see** — a pre-configured, **allowlisted** mount (e.g. `~/druids-data/staging → /app/data/staging`, governed by `resourceAccess.allowedLocations`). The drop zone is that allowlisted root, never arbitrary filesystem. This delegates crawling/politeness to mature tools and keeps Druids focused on ingestion.

## The flow

### 1. Acquire (outside Druids)
Operator mirrors/downloads/extracts into the allowlisted staging dir. For a `wget` mirror, the directory layout encodes the original URL structure (used for provenance, below).

### 2. Trigger the ingest — two front-ends over one async primitive
The underlying capability is one async **ingest job**: *"ingest directory X into scope Y as seeded knowledge."* Two ways to invoke it:

- **Operator UI (primary).** An admin "Ingest documents" action → a modal that browses **within the allowlisted staging roots** (not the whole FS): pick the directory, choose target **scope** (a realm, several realms, or `global`), a **format filter** (html / pdf / all), and **dedup mode**; "Ingest" enqueues the job. Deliberate, visible, admin-controlled, no LLM in the loop — and the **only** path permitted to write to `global`.
- **Druid collaboration session (secondary).** A Druid whose `resourceAccess` includes the staging location can call an `ingest_directory` tool mid-workflow. **Constrained**: only into realms the Druid can reach, **never `global`** without human approval, allowlist-gated. Lower-trust than operator seeding.

This maps "a Druid with permission to access that location" to `resourceAccess.allowedLocations` + the realm/scope it may write.

### 3. The job runs
Async (Druids' existing async-result pattern): walk the staging dir (allowlisted) → filter to supported formats → per file: convert via docling-serve → write renderings to `/app/data/documents/{id}/` → catalog `worldtree_documents` (+ `content_text`, + `worldtree_item_scopes` for the chosen scope, + provenance) → **dedup via upsert-on-`source_uri`**. **Bounded concurrency** (not unbounded fan-out — model loads are CPU/RAM-heavy). Per-file outcomes recorded.

- **Provenance:** reconstruct the original URL from the `wget` mirror layout (or a manifest) so `source_uri` stays citeable, not a local path.

### 4. Discover the run's results
The job is a first-class **ingest-run record**: status, counts (ingested / skipped-as-dup / failed), target scope, source dir, per-file outcomes. The operator sees it as job progress → completion summary (UI + an API/MCP `get_ingest_run`). Documents are tagged with their **`ingest_run_id`**, so "what did this run produce" is a filtered document list. Verification is immediate via Layer 1: `search_documents` for a known term, `read_document` on one.

### 5. Browse the corpus — the card catalog
The Layer 1 read/search surface, promoted to a **"WorldTree Library" UI**: a card/table of every document — title, source/provenance, scope/realm, formats, ingest date, preview — with **filters (scope/realm, format, source, date)**, search, and click-through to the rendered markdown. Filtered by realm, it shows that realm's slice (`global ∪ realm`). Over time it unifies with session/contribution knowledge (already on the WorldTree discovery surface) into one browser spanning **seeded documents + earned session knowledge** — lexical search now, **semantic (Phase B) later** as a search-quality upgrade with no change to the catalog's shape.

## The scope-trust rule (pin this early)

`global` is always in scope and grounds every session, so a wrong "universal truth" poisons everything. Therefore: **only the operator UI (admin-authenticated) may ingest into `global`; agent/session ingestion is realm-scoped and can at most *request* global, gated on human approval.** Operator-seeded documents are "seeded" (trusted, bypass the supersession gate); agent-ingested documents are realm-scoped and lower-trust. (See `realm-grounded-assessment.md` §2.0.1.)

## Build delta

- **Have:** docling-serve, `ingest_url`, document catalog (008/009), Layer 1 `list`/`read`/`search` (REST + MCP).
- **New:**
  - Staging mount + **file:// allowlist enforcement** (`resourceAccess` for paths).
  - **`ingest_directory`** — Druids walks the tree → docling-serve per file (Option C) — behind an **async job** + an **ingest-run record** + `ingest_run_id` on documents.
  - **Scope write** on ingest (`worldtree_item_scopes`) + **earned-vs-seeded** marking; **upsert-dedup** (upsert-on-`source_uri`).
  - **Provenance** path→URL mapping.
  - **UI:** Ingest modal (allowlisted directory picker; scope/format/dedup options), job-progress view, and the **Library / card-catalog page**.
  - **Permissions:** admin for UI ingest (any scope incl. global); Druid `resourceAccess` for agent ingest (realm-scoped, no global).

## Open questions

- **Directory picker scope.** Browse only allowlisted roots — confirm the file-browser API is itself allowlist-bound (no traversal).
- **Provenance source.** Rely on `wget` layout, require a manifest, or accept path-as-source when no mapping exists?
- **Re-ingest semantics.** Upsert-on-`source_uri` replaces; do we keep version history or overwrite? (Ties to the supersession model.)
- **Partial-failure policy.** Abort-on-first-error vs. best-effort with a failure report (default: best-effort).
- **Format coverage.** Which input formats are enabled by default for a bulk run (html/pdf vs. everything Docling supports)?

## Next buildable slice

`ingest_directory` + the ingest-run record + `ingest_run_id` on documents + upsert-dedup — the smallest piece that turns a staged directory into a discoverable corpus. The UI (modal + Library page) and scope-write layer follow.
