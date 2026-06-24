# Phase B: Curated Embeddings & Semantic Discovery

**Status:** Design
**Builds on:** `phase-a-worldtree-discovery.md` (shipped), `worldtree-vision.md`, migrations 006 + 007
**Scope:** Add semantic retrieval over the WorldTree — but as a *curated* index, not a blanket embed-everything job. Vectorization becomes an explicit, reviewed promotion. Local embedding model only; no remote calls.

## The reframe: retention is not retrievability

The roadmap (`worldtree-vision.md`) describes Phase B as "a background job computes embeddings for **every** contribution and session prompt." That wording quietly conflates two concerns that must stay separate:

- **Retention** — keep everything that happened. Source of truth, audit trail, future training corpora. Phase A already delivers this; nothing is ever dropped.
- **Retrievability** — what semantic search is allowed to surface *as an exemplar*. This must be a curated subset.

Embedding-on-completion collapses the two, and the failure mode is not hypothetical. The system's most common usage pattern is **iterative prompt refinement**: a user runs the same coordination prompt many times, tuning it, until a late run finally lands. A real, observed instance: a developer-tooling launch campaign refined across **seven** sessions sharing one prompt, evolving from rough positioning to finished, ready-to-publish assets.

If all seven embed, the early, half-baked runs are not random noise — they are **adversarially close noise**. They share the topic and nearly the prompt of the good final run, so they sit right next to it in vector space and are maximally confusable. Any future query similar to that intent retrieves a cluster dominated by superseded, lower-fidelity variants. The one accurate run is surrounded by paste copies of itself, and retrieval precision dies exactly where it mattered most. As the user put it: *while you fine-tune a prompt you poison the well with bad info, and by the time you reach the right answer, the accurate run has less meaning than it should.*

**Decision: vectorization is an explicit promotion gated by review — not an automatic side effect of a session completing.** The raw data is retained regardless (Phase A); promotion decides only what enters the retrievable index.

## What two probe experiments established

Before committing to an autonomous gate, we used the shipped Phase A MCP surface to test whether an LLM (driven via an external MCP client) could make the promote/skip call reliably. Two findings shape this design:

1. **It is not a recency heuristic.** Asked to curate the seven-session cluster, the model kept the newest session and the *third*-newest, and **excluded the second-newest** as low-effort. A recency sort cannot produce that pattern — the model was reading content, not timestamps.

2. **Reliability depends on structure, not on the model being "smart."** In a free-form pass the model excluded the second-newest session for "only 2 contributions" — a *volume proxy*, the wrong reason for a right answer. Re-run with a forced **requirement-by-requirement checklist** derived from the session prompt, it reached the same conclusion via a defensible reason: the two finalists tied on six of seven requirements, and the loser had **omitted a required deliverable** (it produced strategy and summaries but zero actual content assets). Its own self-check confirmed the verdict would not change if lengths were equal.

The lesson is the load-bearing design constraint: **a free-form LLM judgment is proxy-prone (length, recency, contribution count); a structured checklist judgment is sound.** The gate must impose the structure.

### What this validates — and what it does not

- **Validated:** detecting *presence/absence of required deliverables* — exactly the incompleteness/iteration-burst failure mode the system actually hits. The gate can be autonomous for this.
- **Not validated:** ranking two complete-and-correct runs by subtle quality or voice; catching content that is complete but **factually wrong** (a hallucinated feature would pass a presence/absence checklist). These are deferred to Phase D's rubric scoring or to human review.

## Goals

1. Semantic retrieval over a **curated** slice of the WorldTree, served via MCP alongside the Phase A text tools (which remain).
2. Vectorization is an explicit, auditable promotion action gated by a structured requirement-checklist evaluation.
3. Promotion granularity is **per-contribution**, not only per-session — a superseded session may still contain one promotable contribution.
4. A first-class `supersedes` / `superseded_by` relation so iteration bursts collapse to their best survivor without losing the lineage.
5. Local embedding model (Ollama already runs locally); no remote calls; no data leaves the deployment.
6. Forward-compatible with Phase D: the gate's ephemeral, prompt-derived checklist is a lightweight cousin of Phase D's persistent rubrics. Phase B does not block on Phase D.

## Schema (migration 008 — next available)

> Note: the Phase A doc sketched a `session_outcomes` table as a speculative "008" for Phase F. That label was illustrative. Implementation order puts Phase B first, so Phase B takes 008; Phase F takes whatever number is next when it is built.

```sql
-- pgvector for similarity search.
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings live ONLY for promoted (curated) content. Absence of a row means
-- "retained but not retrievable" — the default state for everything.
CREATE TABLE druids_core.contribution_embeddings (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contribution_id    UUID NOT NULL
                     REFERENCES druids_core.session_contributions(id)
                     ON DELETE CASCADE,
  embedding          vector(768),          -- dimension pinned to the chosen model
  model_name         VARCHAR(128) NOT NULL,-- which embedding model produced this
  chunk_index        INTEGER NOT NULL DEFAULT 0, -- >0 for chunked long contributions
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(contribution_id, chunk_index, model_name)
);

CREATE INDEX idx_contribution_embeddings_vec
  ON druids_core.contribution_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Curation state: the explicit promotion record. One row per reviewed candidate.
CREATE TABLE druids_core.curation_decisions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contribution_id    UUID NOT NULL
                     REFERENCES druids_core.session_contributions(id)
                     ON DELETE CASCADE,
  decision           VARCHAR(16) NOT NULL,  -- 'promoted' | 'excluded' | 'pending'
  superseded_by      VARCHAR(255)           -- session_id of the surviving run, if any
                     REFERENCES druids_core.coordination_sessions(session_id),
  rubric             JSONB DEFAULT '{}'::jsonb, -- the requirement checklist + per-item verdicts
  reviewer           VARCHAR(64) NOT NULL,  -- 'gate:llm' | 'human:<id>' | 'rule:<name>'
  confidence         VARCHAR(8),            -- 'high' | 'medium' | 'low'
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT curation_decision_check
    CHECK (decision IN ('promoted', 'excluded', 'pending'))
);

CREATE INDEX idx_curation_decision ON druids_core.curation_decisions(decision);
CREATE INDEX idx_curation_superseded ON druids_core.curation_decisions(superseded_by);
```

The `rubric` JSONB preserves the structured checklist and per-requirement verdicts behind every decision — so a promotion is always auditable, and a low-confidence one can be routed to a human. The `reviewer` field records *who or what* decided, so an autonomous-gate decision is distinguishable from a human one at query time.

## The curation gate

A new `CurationService` (in `src/services/`, sole owner of the gate's SQL and prompts) runs a candidate contribution — or a clustered set of iterations — through:

1. **Cluster** by near-identical prompt within a window (the iteration-burst detector). Mechanical, cheap; collapses the obvious duplicates before any LLM call.
2. **Extract requirements** from the session prompt into a discrete checklist (deliverables, targets, tone, technical specifics, channel constraints, …).
3. **Score each candidate per requirement** — `fully met` / `partially met` / `missing`, with an evidence snippet for each `fully met`. The scoring rules forbid rewarding length, word count, or contribution count: a candidate loses a requirement only by *omitting or getting it wrong*, never for being terser while still satisfying it.
4. **Promote** candidates that fully satisfy the *deliverable* requirements; mark the rest `excluded` with `superseded_by` pointing at the survivor. Promotion writes the `curation_decisions` row and enqueues the contribution for embedding.
5. **Route low-confidence decisions to human review** (`decision = 'pending'`) rather than guessing.

Steps 2–3 are the structured-checklist evaluation the probe proved is necessary. They use the existing `AgentService.executeAgentPrompt()` LLM path. The checklist generated here is an ephemeral rubric; Phase D will let rubrics be persisted, per-role, and reused — at which point the gate consults them instead of regenerating per call.

**Option 1 vs Option 2.** This design gates at promotion time (Option 1): only promoted content is embedded, keeping the index small and the well clean. Because Phase A already retains all raw data, the alternative (embed everything, filter at query time using Phase D scores — Option 2, useful for negative exemplars) remains available later without re-ingesting anything. We start with Option 1 because it is cheaper and directly answers the poisoning concern.

## The embedding pipeline

- **Model:** a local embedding model served by the existing Ollama container (e.g. `nomic-embed-text`, 768-dim). The dimension pins the `vector(768)` column; changing models requires a re-embed pass keyed by `model_name`.
- **Trigger:** embedding is driven by promotion, not by session completion. A promotion enqueues the contribution; a worker (the first dedicated background worker in this area — the Phase A retention sweeper is the only existing one) computes and stores the vector.
- **Backfill:** a one-shot script in the spirit of `scripts/republish-session.ts` walks already-curated contributions. Nothing embeds until it has been promoted.
- **Chunking:** long contributions are split (chunk_index > 0) so a single oversized contribution does not dominate similarity. Strategy is an open question below.

## MCP surface additions

Phase A's MCP surface is read-only. Phase B keeps the *query* surface read-only and puts the *promotion* action behind the main app's REST API (consistent with the Phase A data path: the MCP container has no DB; it calls `/api/worldtree/*` via `apiCall`).

### New read-only tools / resources (semantic)

| Tool | Arguments | Returns |
|---|---|---|
| `find_similar_sessions` | `{ text \| sessionId, limit? }` | sessions whose curated content is semantically nearest |
| `search_content` (semantic mode) | `{ text, limit?, minScore? }` | promoted contributions ranked by cosine similarity |

These join against `contribution_embeddings`, so by construction they only ever surface promoted content. The Phase A `find_sessions_by_prompt` (ILIKE) stays; the `find_similar_work` prompt graduates from text-match to semantic retrieval with no client-facing contract change.

### Promotion (write) — REST, not an open MCP tool

- `POST /api/worldtree/sessions/{sessionId}/curate` — run the gate over a session's contributions (and its prompt cluster), writing `curation_decisions` and enqueuing embeddings.
- `POST /api/worldtree/contributions/{id}/promote` and `/exclude` — explicit human override.
- `GET /api/worldtree/curation/pending` — the human-review queue (low-confidence decisions).

Keeping promotion off the open MCP tool surface preserves the Phase A invariant that the MCP surface is read-only; an interactive client curates by calling these REST endpoints deliberately, not as an incidental tool call.

## Relationship to Phase D

The gate's checklist evaluation and Phase D's rubric scorer are the same machinery at different levels of persistence:

- **Phase B (now):** ephemeral rubric, generated from the session prompt per evaluation. Trustworthy for *deliverable presence/absence* — the validated case.
- **Phase D (later):** persistent, per-role rubrics. Handles the judgments Phase B's gate explicitly cannot: ranking complete-and-correct runs, and catching complete-but-wrong content. When D lands, the gate consults stored rubrics instead of regenerating, and `curation_decisions.rubric` records which rubric version applied.

This is a clean dependency: B ships an autonomous gate for the common case and degrades gracefully (human review) on the hard case; D upgrades the hard case. B does not wait on D.

## What Phase B does NOT include (explicitly)

- No embed-everything background job. Only promoted content is vectorized.
- No remote embedding calls. Local model only.
- No persistent per-role rubrics or critic agents (Phase D).
- No retrieval-augmented coordination — `CoordinationService` does not yet consult the index at planning time (Phase C).
- No automated quality ranking among complete-and-correct runs, and no factual-correctness checking. The gate detects missing deliverables, not subtle wrongness.
- No change to the Phase A read-only text tools; they sit alongside the new semantic tools.

## Test plan

- **Gate unit tests** — feed the seven-session refinement cluster (and synthetic equivalents): assert the complete run is promoted, the incomplete run is excluded with `superseded_by` set, and a terse-but-complete run ties a verbose-but-complete one (the volume guardrail).
- **Granularity test** — a session that fails the deliverable requirement but contains one strong contribution: assert the session is not promoted wholesale yet the good contribution is.
- **Embedding pipeline** — promotion enqueues exactly one embedding per promoted chunk; nothing un-promoted is embedded.
- **Semantic retrieval** — `find_similar_sessions` returns only promoted content; an excluded near-duplicate never appears.
- **Empty-index behavior** — semantic tools return empty results without error before anything is promoted.

## Open questions

- **Embedding model & dimension.** `nomic-embed-text` (768) is the default assumption; pins the column type and HNSW params. Confirm before the migration.
- **Gate autonomy threshold.** What confidence routes to human review vs. auto-promotes? The probe suggests presence/absence calls are high-confidence; subtle calls are not.
- **Chunking strategy.** Fixed-size, semantic-paragraph, or contribution-as-unit. Affects both retrieval quality and the `chunk_index` cardinality.
- **Cluster detection.** Exact-prompt match is trivial; near-duplicate prompts need a threshold (string similarity now, or bootstrap from the prompt embedding once it exists).
- **Index type.** HNSW (assumed) vs IVFFlat — a recall/build-time/memory trade-off at the corpus sizes Phase A targets (~10⁵ contributions).
- **Re-promotion on prompt edits.** If a user later improves a prompt and re-runs, does the new survivor automatically supersede the old promoted one, or require re-curation?

## Estimated effort

- Migration 008 + pgvector wiring: half a day.
- `CurationService` (clustering, checklist evaluation, decision persistence): two days — the gate is the substance of Phase B.
- Embedding worker + backfill script: one day.
- Semantic query methods in `WorldTreeQueryService` + REST routes + MCP tools: one day.
- Promotion REST endpoints + human-review queue: half a day.
- Tests: one day.

≈ 6 working days. The embedding mechanics are routine; the gate and its guardrails are where the care goes.
