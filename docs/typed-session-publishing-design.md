# Typed Session Publishing

**Status:** Shipped
**Scope:** `CoordinationService`, `SessionContentManager`, `WorldTree` namespace, migrations 006 + 007

## Problem

A coordination session today produces two kinds of value:

1. The **coordinator's synthesized result** — a single integrated summary.
2. The **individual contributions** from each participating agent — the raw work product.

The pre-corpus publish path wrote only (1) to the WorldTree. (2) survived only as per-step JSON files inside a Docker named volume at `/app/data/published_content/sessions/{sessionId}/`. Two consequences:

- A `down -v` or `db-reset.sh` wiped every contribution that had ever been produced.
- Even within retention, the queryable WorldTree only saw the summary. The detail needed for downstream analysis — comparing how each agent handled the same task, building feedback loops, assembling datasets — was gone the moment synthesis happened.

The goal: results that are **durable**, **detailed**, and **shaped to their consumer**.

## Modes

A session can request one or more publishing modes. Modes are catalogued in `druids_core.publishing_modes` (DB-driven, not a TypeScript enum) so new modes can be added without code changes.

| Mode | Includes | Format | Retention | Intended consumer |
|---|---|---|---|---|
| `summary` | synthesis only | markdown | 30d | quick human review |
| `raw` | contributions only | markdown | 90d | reviewers comparing individual outputs |
| `report` | synthesis + contributions appendix | markdown | 180d | default human-facing artifact |
| `dataset` | contributions + transcript, structured | jsonl | indefinite | offline analysis, training corpora |
| `transcript` | full event stream incl. tool calls | jsonl | indefinite | replay, debugging, audit |
| `creative` | extracted creative content (story/poem/song) with title and minimal metadata | markdown | indefinite | reusable creative deliverables for the WorldTree's creative namespace |

The session request carries `publishAs: ["report", "dataset"]`. Multiple modes per session are supported and composable; each materializes as its own row in `druids_core.session_publications` with its own `content_uri`. Default when omitted is `["report"]`.

## Data model

Migration `006_session_publishing.sql` introduces four tables in `druids_core`:

- **`publishing_modes`** — catalog. Seeded with the first five modes.
- **`coordination_sessions`** — durable session record (formerly in-memory only).
- **`session_contributions`** — one row per (session, step). Holds the verbatim agent output, format, agent type, action type, optional token/duration metrics. Never synthesized, never dropped.
- **`session_publications`** — one row per (session, mode). Holds `content_uri`, status, retention timestamps.

Migration `007_sub_contributions.sql` adds finer-grained per-collaborator capture:

- **`session_contributions.sub_step_number`** — `0` = the orchestration plan step itself; `>0` = a sub-contribution captured during that step (e.g., an Elemental responding to a Druid's `delegate_task`).
- **`session_contributions.agent_role`** — stable agent type for cross-session analytics (`coordinator`, `elemental`, etc.).
- Unique constraint relaxed from `(session_id, step_number)` to `(session_id, step_number, sub_step_number)`.

`session_contributions` and `session_publications` cascade-delete on session removal, but retention is normally driven by `expires_at` on the publication, not by deleting the session.

## Publish flow

1. **At session start:** `SessionPublicationService.ensureSessionRecord` writes a `coordination_sessions` row with `status='in_progress'` so any sub-contribution captured mid-execution has a valid FK target.
2. **During execution:** Each delegation tool (`delegate_task`, `message_agent`, `assign_simple_task`) records a sub-contribution as it captures the target agent's response. The active orchestration step is read from `CoordinationService.getActiveStep(sessionId)`.
3. **At session completion:** The existing `FinalCoordinationResult` already contains `participantContributions[]` — that data is captured into `session_contributions` as orchestration-step rows (sub_step_number = 0).
4. **For each mode in the request's `publishAs`:**
   1. A `Publisher` for that mode renders the artifact from the session record + contributions (loaded fresh from DB so sub-contributions are included).
   2. The artifact is written to its target (`worldtree://`, `file://`, host path).
   3. A `session_publications` row is created with `status='published'`, `expires_at = published_at + mode.default_retention_days` (or NULL).
5. **Retention sweep:** A background task running inside `druids-main` scans `session_publications` on a fixed interval, marks rows with `expires_at < now()` as `status='expired'`, and removes the underlying artifact file (Postgres-stored content stays as the source of truth).

## Host persistence

The named Docker volume `druids-data` survives `docker-compose restart` but not `down -v`. Two complementary mechanisms make session data survive any local environment reset:

1. **Postgres-backed contributions.** Once contributions live in `druids_core.session_contributions`, they survive as long as `druids-postgres-data` does. Even when a fresh app container starts up, the historical corpus is intact.
2. **Always-on host bind for published artifacts.** `docker-compose.yml` mounts `~/druids-data/sessions:/app/data/sessions` for both `druids-main` and `druids-mcp-server`. Every publication's `content_uri` for a `file://` target resolves into this bind, so artifacts land on the host filesystem by default — survives any volume reset, can be committed/archived/fed to other tools without `docker cp`.

Postgres holds the canonical record; the host bind holds the rendered artifacts.

## Retention

- Each publication's `expires_at` is derived from its mode's `default_retention_days` at publish time. Mode changes do not retroactively change existing publications.
- A publication can be pinned (`status='archived'`) to skip expiry — useful for sessions worth keeping permanently regardless of mode default.
- Contributions have no expiry. They are the source of truth; publications are derived views.
- **Sweeper** runs in-process inside `druids-main`. No separate worker container. Configurable interval (default 1 hour) via `RETENTION_SWEEP_INTERVAL_MS`. Skipped in test environments.

## Compatibility with current behavior

- The default mode when `publishAs` is omitted is **`report`** (synthesis + contributor appendix). This is a deliberate break from the previous summary-only behavior — the contributor details are exactly what was getting lost, so the new default preserves them.
- Existing `worldtree://public/async_results/...` paths continue to work; the new tables sit alongside them.
- The previous per-step JSON files in `/app/data/published_content/sessions/` remain — they become a write-through cache, not the source of truth.
- The republish-from-DB script (`scripts/republish-session.ts`) can regenerate any past session's artifacts in any modes from the durable contribution rows.

## The `creative` mode — absorbing the previous creative pipeline

Before typed publishing, creative output (story / poem / song / text) was handled by a parallel pipeline in `CoordinationService`:

- `publishCreativeContent()` wrote to `data/published_content/creative/{contentType}/{YYYY-MM-DD}/{contentId}.md`
- `publishCreativeToWorldTree()` populated a special `worldtree://public/creative-sessions/{sessionTitle}/{contentType}/{title}` URI
- `determineContentType()` heuristically classified content as creative

The `creative` mode absorbs this pipeline into the typed system. Migration `008_seed_creative_mode.sql` (not yet written) adds:

```sql
INSERT INTO druids_core.publishing_modes
  (name, description, output_format,
   includes_synthesis, includes_contributions, includes_transcript,
   default_retention_days, sort_order)
VALUES
  ('creative',
   'Creative content (story, poem, song, text) extracted with title and minimal metadata. Indefinite retention.',
   'markdown', false, false, false, NULL, 60)
ON CONFLICT (name) DO NOTHING;
```

A new `CreativePublisher` in `src/services/publishing/` renders the creative artifact in the same shape the legacy pipeline produced (title-prefixed markdown, minimal companion metadata).

**Trigger behavior:**

- Explicit opt-in: `publishAs: ["creative"]` works on any session.
- Auto-include: when `determineContentType` classifies the integrated content as creative, `creative` is added to the effective `publishAs` list before publishers run. The existing detection heuristic stays; only the publish path changes.

**Migration of the old pipeline:**

- `publishCreativeContent()` and `publishCreativeToWorldTree()` are removed once `CreativePublisher` ships.
- The legacy URI pattern (`worldtree://public/creative-sessions/...`) can either be preserved by having `CreativePublisher` write to that path additionally, or retired in favor of the standard `file://{sessionId}/creative.md` location. Decision: retire — one URI scheme is simpler, and corpus discovery (Phase A) treats all modes uniformly anyway.
- The per-content-type and date-bucketed directory structure (`creative/{type}/{YYYY-MM-DD}/`) is replaced by the standard session directory. Discovery happens via `corpus://` queries, not directory walking.

## Open questions

- Should `dataset` schema be versioned (so consumers can pin a schema version)? Probably yes — add `schema_version` to the dataset mode's metadata.
- Should we support custom modes registered at runtime (e.g., a user adds a `csv` mode for spreadsheet workflows)? The catalog table supports this; the `Publisher` plugin point above is where the registration API would hook in.
- Should `auto-include` of `creative` be per-session-opt-out, or always-on? Always-on is the simpler default; opt-out can be added later if needed.
