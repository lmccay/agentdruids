# Realm-Grounded Assessment & the Support Gate

**Status:** Design
**Builds on:** `worldtree-vision.md` (Phases C/D/F), `phase-b-embeddings.md`, `docling-integration-evaluation.md`, the realm-travel model (CLAUDE.md §6)
**Scope:** Treat the realm as the unit of knowledge scope; make a Druid's available WorldTree context realm-relative and travel-aware; and add a *second* gate — distinct from Phase B curation — that assesses whether a session's conclusion was actually supported by the realm WorldTree context in scope. The high-leverage output is a **knowledge-gap demand signal** that drives Docling ingestion, closing the self-improvement loop.

## 1. Two gates, different jobs

These must not be conflated:

| Gate | Question | Decides | Phase |
|---|---|---|---|
| **Curation gate** | "Is this output worth promoting into the retrievable index?" (quality, completeness, supersession) | *retrievability* | B |
| **Support gate** (this doc) | "Did the realm WorldTree context in scope actually support this conclusion?" | *trust in the conclusion* | C/D-class |

They answer different questions and fail for different reasons. They **compose** (§6) but are not the same mechanism.

## 2. The realm as the unit of knowledge scope

Today the realm is primarily *where an agent sits*. This design elevates it to *the scope of knowledge in play*: a realm's **context** = its WorldTree slice (sessions + contributions + ingested documents) under that realm's namespace.

Realm-scoped retrieval is **Phase C with a realm filter**: when planning or delegating inside realm R, the coordinator's retrieval is scoped to R's slice.

### 2.0 Scope is a tier, and associations are many-to-many

Two properties the naive "one document, one realm" model can't express:

- **Knowledge associates with multiple realms.** A statistics document serves a "data science" realm *and* a "research methods" realm; curriculum content crosses domains routinely. So realm association is **many-to-many**, not a single FK. (This supersedes the single `worldtree_documents.realm_id` in `docling-integration-evaluation.md` — see §7.) An item is *in scope* if **any** of its associated realms is in the in-scope set.
- **Some knowledge is universal.** Not everything is realm-specific. Scope is therefore a **tier**, not just a realm membership:

  | Scope tier | In scope when | Trust posture |
  |---|---|---|
  | `global` | **always** (every session, regardless of travel) | highest-trust *and* highest-danger — strictest gate |
  | `realm:{id}` | the realm is in the session's traversed set | earned knowledge accepted more freely |
  | `agent:{id}` | the owning agent (private/public per access_level) | per-agent |
  | `session:{id}` | within that session only (existing isolation) | ephemeral |

  The **in-scope evidence pool for a session = `global` ∪ (realms traversed)**. Global maps onto the existing `worldtree://public/` namespace; realm-scoped knowledge lives under realm namespaces.

  Model global as a *scope tier*, **not** a "magic realm" row: a global realm isn't a place agents inhabit, realms carry types (forest/mountain/…), and an always-in-scope realm would be special-cased anyway. Scope-as-dimension keeps it clean.

### 2.0.1 Global is the dangerous tier — govern promotion to it hardest

Because `global` is *always* in scope and grounds every conclusion everywhere, a wrong "universal truth" poisons every realm at once. Therefore promotion **to** global is the strictest gate: **seed-only or human-approved — never auto-promoted earned conclusions.** Global ≈ heavily-vetted seeded truth; realms can absorb earned knowledge more freely. This is the earned-vs-seeded distinction sharpening into a **scope hierarchy of trust**: the higher the scope's reach, the higher the bar to enter it.

### 2.1 Active vs. cumulative context (travel)

A Druid can travel between realms (`realmAccess.currentRealmId`, `allowRealmTravel`). Two context notions, both needed:

- **Active context** — what the coordinator can query *right now* = `global` ∪ the current realm's slice. The realm part swaps on transition; `global` is always present.
- **Cumulative context** — `global` ∪ the **union of realms traversed during the session**. The session's *conclusion* rests on this, not just the final realm.

The support gate (§4) must judge against the **cumulative** set. Otherwise a Druid that learned the decisive fact in realm A but concludes in realm B fails spuriously.

### 2.2 Carried context has provenance

Travel is not amnesia: a Druid carries forward what it *derived* in A even when A's raw WorldTree is no longer directly queryable from B. Carried knowledge is tagged with its **source realm**. This yields a clean **access boundary**: a conclusion may only be grounded in `global` knowledge or in realms the Druid actually visited — grounding in a realm never entered is a leak the gate should flag. `global` is always in bounds (never a leak); a multi-realm item is in bounds if *any* of its realms was traversed. Realm isolation thus extends naturally from agents to knowledge.

## 3. What the session must record for any of this to work

The gate is only possible if coordination logs *what it used as it ran*. Required capture (Phase C territory):

- **Realm-travel path** — the ordered set of realms entered during the session ("involved realms" = the legitimate evidence pool).
- **Per-claim retrieved context** — for each material claim in the conclusion, which WorldTree items it rests on. This is Phase C's `retrieved_context_uris`, but recorded **per claim**, not just per session.

Without per-claim citations, "does the context support the conclusion?" is unverifiable guesswork. With them, it is checkable.

## 4. The support gate's two failure modes

An "unsupported" verdict means two *opposite* things. Classifying which is the gate's core value:

- **Coverage gap** — the in-scope WorldTree (global ∪ traversed realms) was too thin to support the task. The session isn't bad; the scope is underfed. This is a **demand signal** carrying a **target scope**: *"could not ground a conclusion about Y → ingest documents about Y"* — into a specific realm if the gap is domain-local, or into `global` if Y is a universal truth (subject to global's stricter promotion gate, §2.0.1). It drives Docling ingestion and closes the loop:

  > sessions reveal gaps → gaps drive ingestion → ingestion enriches the realm → future sessions are better supported.

- **Over-reach** — the knowledge was available (or should have been) and the conclusion outran it. A quality/hallucination problem → low confidence, human review, do not promote.

Same verdict, opposite remedies (ingest vs. distrust). A gate that emits only "unsupported: 0.4" without classifying *which* is nearly useless.

## 5. What makes it verifiable — and where it is hard

Groundedness assessment is the **Phase D-class "subtle quality / factual correctness"** problem we explicitly found the Phase B gate could *not* do reliably. Three constraints make or break it:

1. **Claim → evidence citations (structure beats free-form).** The validated lesson from the Phase B probes: free-form LLM judgment is proxy-prone; structured judgment is sound. The structured form here is requiring the coordinator to cite the WorldTree items each claim rests on, then verifying each claim against its cited evidence (entailment-style). This is why §3's per-claim capture is mandatory, not optional.

2. **Task-type awareness, or it fails good work.** A research/factual task should demand high groundedness (claims *entailed by* evidence). A *generative* task — e.g. a launch-campaign brief — is creative synthesis that is **not** deductively entailed by realm knowledge, yet can be excellent. The test there is "**consistent with** realm context," not "**entailed by**" it. A one-size faithfulness gate would wrongly fail creative sessions. The gate must read task type to pick the bar.

3. **Cold start and cost.** Early realms are nearly empty; a *blocking* gate would fail everything. So the gate runs **advisory before blocking**, leaning on the coverage-gap path (emit ingestion demand, do not punish the session). And per-claim assessment is many model calls — make it **sampled / triggered** (factual sessions, or on-demand), not universal.

## 6. Composition, and protecting the loop from itself

The two gates compose. The Phase B poisoning concern recurs one level up: if ungrounded conclusions are ingested as "knowledge," future sessions ground on them and error compounds. The support gate is the guard:

- **Seeded** documents (Docling-ingested) are authoritative by **provenance** — trusted on ingest.
- **Earned** conclusions (session output) must **pass the support gate** before being treated as trusted grounding for other sessions.

So: *curation* decides retrievability; *support* decides whether an earned conclusion is trustworthy enough to become grounding for others. This is the earned-vs-seeded distinction doing real work.

## 7. Schema & coordination touchpoints (sketch)

```sql
-- Many-to-many scope association for any WorldTree item (supersedes the single
-- worldtree_documents.realm_id in docling-integration-evaluation.md). scope_type
-- 'global' has a NULL scope_ref; 'realm' references a realm.
CREATE TABLE druids_core.worldtree_item_scopes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_type    VARCHAR(16) NOT NULL,             -- 'document' | 'contribution' | 'chunk'
  item_id      VARCHAR(255) NOT NULL,
  scope_type   VARCHAR(16) NOT NULL,             -- 'global' | 'realm' | 'agent' | 'session'
  scope_ref    VARCHAR(255),                     -- realm/agent/session id; NULL for 'global'
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT item_scope_type_check CHECK (scope_type IN ('global','realm','agent','session')),
  CONSTRAINT item_scope_global_ref CHECK (scope_type <> 'global' OR scope_ref IS NULL),
  UNIQUE(item_type, item_id, scope_type, scope_ref)
);
CREATE INDEX idx_item_scopes_lookup ON druids_core.worldtree_item_scopes(scope_type, scope_ref);
CREATE INDEX idx_item_scopes_item   ON druids_core.worldtree_item_scopes(item_type, item_id);

-- Which realms a session traversed (the "involved realms" evidence pool; global is implicit).
CREATE TABLE druids_core.session_realm_path (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   VARCHAR(255) NOT NULL REFERENCES druids_core.coordination_sessions(session_id) ON DELETE CASCADE,
  realm_id     VARCHAR(255) NOT NULL REFERENCES druids_core.realms(id),
  entered_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  step_number  INTEGER,                          -- coordination step at entry
  UNIQUE(session_id, realm_id, entered_at)
);

-- Per-claim evidence: which WorldTree items each material claim rests on.
CREATE TABLE druids_core.session_claim_evidence (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    VARCHAR(255) NOT NULL REFERENCES druids_core.coordination_sessions(session_id) ON DELETE CASCADE,
  claim_ref     VARCHAR(255) NOT NULL,           -- stable id of the claim within the conclusion
  evidence_uri  TEXT NOT NULL,                   -- worldtree:// item the claim cites
  source_realm  VARCHAR(255),                    -- which realm the evidence came from
  UNIQUE(session_id, claim_ref, evidence_uri)
);

-- The support gate's verdict for a session.
CREATE TABLE druids_core.session_assessments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      VARCHAR(255) NOT NULL REFERENCES druids_core.coordination_sessions(session_id) ON DELETE CASCADE,
  task_type       VARCHAR(32),                   -- factual | generative | mixed (sets the bar)
  support_score   NUMERIC,                       -- 0..1 groundedness/consistency
  verdict         VARCHAR(16),                   -- supported | coverage_gap | over_reach | advisory
  per_claim       JSONB DEFAULT '{}'::jsonb,     -- claim_ref -> {supported, evidence, note}
  knowledge_gaps  JSONB DEFAULT '[]'::jsonb,     -- demand signals: {topic, realm_id} -> drives ingestion
  reviewer        VARCHAR(64),                   -- 'gate:llm' | 'human:<id>'
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

- Retrieval (Phase C) must accept a **scope filter** = `global` ∪ (realms traversed), resolved via `worldtree_item_scopes`, and emit the per-claim `evidence_uri`s captured above.
- `session_claim_evidence.source_realm` may be a realm id or `global`.
- `knowledge_gaps` rows are the ingestion demand signals consumed by the Docling pipeline (`ingest_url` into a named realm, or into `global` subject to its stricter gate, §2.0.1).

## 8. Where it lands on the roadmap

Not a Phase B item. It is **Phase C** (realm-scoped retrieval + per-claim citation capture) **+ a Phase D-class assessment gate**, feeding **Phase F** (the closed loop).

**Build order — cheap half first.** The leverage splits unevenly:

1. **Demand-signal half (cheap, safe, build first).** Realm-scoped retrieval + logging + a coarse "was anything relevant even available?" check → emit `coverage_gap` and `knowledge_gaps`. Needs no per-claim entailment, never blocks, and immediately drives useful ingestion.
2. **Groundedness half (expensive, Phase-D-hard, build later).** Per-claim entailment verification, task-type-aware bars, over-reach detection. Gate this behind real rubric/critic work.

Building (1) first delivers the self-improvement loop without taking on the hard, costly part prematurely.

## 9. Open questions

- **Claim extraction.** How are "material claims" identified in a conclusion — coordinator self-annotates as it writes, or a post-hoc extractor? Self-annotation makes per-claim citation natural but trusts the coordinator.
- **Carried-context expiry.** Does derived knowledge from realm A stay valid for the whole session, or decay/expire on further travel?
- **Task-type detection.** Who labels a session factual vs. generative — the prompt, the coordinator, or a classifier? Wrong labels pick the wrong bar.
- **Gap → ingestion automation.** Are `knowledge_gaps` auto-queued for ingestion (with the SSRF allowlist from the Docling doc), or surfaced for human approval?
- **Cost controls.** Which sessions trigger the groundedness half — all factual sessions, a sample, or on-demand only?
- **Promotion to `global`.** What is the exact gate — human approval only, or a sufficiently strong support-gate pass? Who can authorize a "universal truth"?
- **Scope granularity.** Is scope associated per item (document/contribution) or also per chunk? Per-chunk allows a single document to contribute some chunks to a realm and others to global, at higher bookkeeping cost.

## 10. Next steps

1. Land Phase C retrieval with a **realm filter** and **per-claim `retrieved_context_uris`** capture (§3) — the prerequisite for everything here.
2. Build the **demand-signal half** of the support gate (§8.1): coverage detection + `knowledge_gaps` → Docling ingestion. This closes the loop cheaply.
3. Defer the **groundedness half** (§8.2) to the Phase D rubric/critic work; revisit task-type-aware bars then.
