# Session Corpus: From Logs to Living Knowledge

**Status:** Vision / design discussion
**Builds on:** `typed-session-publishing-design.md`, migrations 006 + 007

## What we have now

Every completed coordination session writes a structured corpus to Postgres and to the host filesystem:

- `coordination_sessions` — session metadata (prompt, coordinator, realm, participants, duration)
- `session_contributions` — every step and every sub-contribution, raw, never synthesized away. Each row carries `agent_id`, `agent_role` (`coordinator` | `elemental` | …), `action_type` (`delegate_task`, `message_agent`, `travel_and_collaborate`, …), `step_number`, `sub_step_number`, full `content`, `duration_ms`
- `session_publications` — typed renderings (`report`, `raw`, `dataset`, `transcript`, `summary`) of each session, addressable by URI
- Host artifacts at `~/druids-data/sessions/{sessionId}/` survive every kind of reset

This is a meaningful change in what the system is. Before: each session was a one-shot, with the Druid's summary as the only durable artifact. Now: every Elemental's raw work product accumulates session over session, queryable, queryable by role, queryable across coordinators. The corpus *is* the knowledge base.

This document is the vision for what to build on top of it.

## The opportunity, in one paragraph

A coordination system that has run thousands of sessions is no longer an LLM-routing layer — it is an institution with memory. The same positioner-elemental that wrote 200 launch positioning analyses has, embedded in those analyses, a working definition of "good positioning" specific to this system's domain. The same druid that has coordinated 50 multi-channel campaigns has, in its synthesis history, an implicit playbook for what to delegate to whom in what order. Surfacing that institutional knowledge to future sessions — without re-running the LLM work that produced it — is the path to a system that gets cheaper, faster, and better with use.

## Four capability tracks

### 1. Retrieval-augmented coordination

The most immediate win. Before a new session executes, query the corpus for relevant past contributions and inject them as context. Specifics:

- **Per-elemental retrieval.** When a session is about to delegate to `positioner-elemental`, pull that elemental's last *N* contributions on similar prompts. Prepend as "prior analyses." The Elemental's LLM call now starts from a much more refined position than zero-shot.
- **Per-druid playbook retrieval.** When a Druid plans a new orchestration, retrieve the orchestration plans of past similar sessions (`stepNumber`, `actionType`, target agents). Hints in the planning prompt: "in 12 prior launch campaigns, the standard sequence was Positioner → channel-specific elementals → integration."
- **Per-prompt-shape retrieval.** Embed session prompts; on a new session, find the *k* most similar past prompts and surface their final reports as exemplars.

Implementation cost is low: contributions already structured, agent_id and agent_role are already indexed. The missing piece is semantic similarity, which a small local embedding model handles cheaply.

### 2. Local-first reasoning to reduce token spend

Today, every session pays full LLM cost. As the corpus grows, many session subgoals can be answered without an LLM call at all, or with a much smaller model.

- **Skip the LLM when the corpus already answers.** For a new task like "write a Show HN draft for a CLI tool launch," a quick corpus search may surface five highly-rated past Show HN drafts from the hackernews-elemental. A small local model can adapt the closest match in milliseconds; the elemental's full LLM call becomes a fallback rather than the default.
- **Distill role-specific small models.** Each elemental's contribution stream is a fine-tuning corpus tailored to that role's voice and output structure. After enough volume, swap the elemental's general-purpose LLM call for an inference against a small role-specialized model. Local. Fast. Cheap. The Druid keeps the bigger model.
- **Two-tier inference.** Small local model does retrieval, ranking, and first-draft. Large remote model only invoked for synthesis or when local confidence is low. The corpus is what makes the local tier credible.
- **Cache by orchestration shape.** Reuse the *plan* even when the content differs. Plan-shape is a coarse fingerprint; if a previous session matched the same shape, skip the planning LLM call entirely and re-execute against the cached plan.

These savings compound. A system processing 100 sessions/day where 60% of subgoals are answered from corpus is paying 40% of the LLM bill it would have paid without one.

### 3. Self-assessment and improvement loop

The system already has agents that can critique work — they're the ones doing the work. Turn them on past sessions.

- **Scored rubrics.** Define rubrics per content type (positioning analysis, HN post, launch report). A critic-elemental scores past contributions against the rubric, storing scores in `session_contributions.metadata`. The corpus becomes labeled.
- **Outcome attachment.** When external outcomes are knowable (a HN post's score, a launch's stargazers), attach them to the session. The corpus becomes labeled with ground truth, not just rubric scores.
- **Promotion patterns.** Identify which kinds of prompts, plans, and delegations produce highly-scored contributions. Surface those patterns to the coordinator at planning time: "campaigns scored highest when Positioner ran before all channel agents in parallel, not sequentially."
- **Negative feedback.** Failed or low-scoring sessions are equally valuable. The corpus should preserve them, marked. Future plans can explicitly exclude patterns associated with low-scoring outcomes.

The closed loop is: do work → score work → mine patterns → adjust future work. Each pass narrows the distribution toward higher-quality outputs without any human-in-the-loop labeling.

### 4. Interactive discovery via MCP

The corpus is queryable; an MCP-speaking agent should be able to converse with it. This turns the system from an action-execution platform into an exploration partner.

Concrete MCP surface:

**Resources** (read-only, addressable by URI):
- `corpus://sessions/{sessionId}` → the session manifest
- `corpus://sessions/{sessionId}/{mode}` → a specific published artifact
- `corpus://agents/{agentId}/contributions?since=...` → an agent's contribution stream
- `corpus://realms/{realmId}/sessions` → all sessions in a realm

**Tools** (queries that return data, not actions):
- `find_similar_sessions(prompt, k)` — semantic neighbors
- `summarize_agent(agentId, since, until)` — what has agent X been doing
- `compare_sessions(sessionIdA, sessionIdB)` — diff
- `aggregate_contributions(filter, groupBy)` — counts, durations, content-length stats
- `score_session(sessionId, rubricId)` — apply rubric on-demand
- `search_content(query, agentRole?, mode?)` — full-text or semantic search across contribution content

**Prompts** (pre-canned analyses an MCP client can offer):
- "What has positioner-elemental been writing about lately?"
- "Show me my five highest-quality launch campaigns and what they shared."
- "Compare how the Druid handled task X this quarter vs last quarter."

An MCP client connected to this surface is doing interactive corpus archaeology. It can be a chat UI, a CLI, another agent — anything that speaks MCP. The corpus stops being a passive log and becomes an active conversational partner.

## What the data actually supports today (without further work)

Before building, recognize what's already possible against the current schema:

- Full-text search of contributions: `SELECT … WHERE content ILIKE '%…%'` works now.
- Per-agent activity stream: `idx_contributions_agent` is already in place.
- Per-role analytics: `idx_contributions_role` is already in place.
- Session timing distributions: `started_at`, `completed_at`, `duration_ms` are all populated.
- Content-length and action-type distributions: trivial SQL.

The simplest first MCP server could expose just these and already deliver meaningful insight. Embeddings, scoring, and retrieval-augmented generation are subsequent layers, not blockers.

## Phased roadmap

A reasonable sequencing, designed so each phase produces value standalone:

**Phase A — MCP read-only surface** (smallest viable step)
- Stand up an MCP server that exposes `corpus://` resources and the basic query tools listed above.
- Backed entirely by existing tables, no embeddings, no new ML.
- Outcome: any MCP client can browse and query the corpus interactively.

**Phase B — Embeddings layer**
- Background job computes embeddings for every contribution and session prompt. Stored in a `contribution_embeddings` table (pgvector extension is the obvious choice).
- Expose `find_similar_sessions` and `search_content` (semantic mode) via MCP.
- Local embedding model — no remote calls.

**Phase C — Retrieval-augmented coordination**
- CoordinationService consults the corpus before planning and before each delegation.
- New session metadata field: `retrieved_context_uris` lists what the session learned from.
- Reduces token spend immediately; produces measurably better outputs.

**Phase D — Scoring and labeled corpus**
- Per-role rubrics defined in DB (extending the `publishing_modes` catalog pattern).
- Background scorer applies rubrics to past contributions, writes scores to `metadata`.
- Coordinator planning prompts consult high-scoring exemplars by default.

**Phase E — Role-specialized small models**
- Per-elemental contribution streams exported via `dataset` mode become training corpora.
- Fine-tune small open models on those corpora.
- ModelRegistryService gains role→model affinity: positioner-elemental routes to a positioner-specialized small model by default; falls back to the general LLM for low-confidence cases.

**Phase F — Closed self-improvement loop**
- Outcome attachment hooks for sessions whose results have observable external metrics.
- Periodic mining of plan-shapes, delegation orderings, and content patterns associated with high outcomes.
- Surfaced to coordinators as advisory context at planning time.

Phases A–C are weeks of work, modest model requirements. D and E require some training infrastructure but no external dependencies. F is open-ended and refines indefinitely.

## Design principles to preserve as this grows

A few non-negotiables that the corpus should respect:

- **Raw is sacred.** Never overwrite or summarize away a contribution. Synthesis lives in publications; the source of truth is the contribution row. Derived data goes in `metadata`, not `content`.
- **DB-catalogued, not hardcoded.** New modes, rubrics, scoring schemes go in DB tables that mirror `publishing_modes`. Future me will want to add a mode at runtime without a code change.
- **Local-first by default.** Embeddings, search, scoring, retrieval all run inside the deployment. The corpus is too valuable to scatter across third-party services.
- **Sessions stay isolated.** Session isolation (per the concurrent-session constitution) means cross-session retrieval is *read* against the corpus, never mutation of a sibling session.
- **Cheap to query, expensive to ignore.** Index aggressively. The whole value proposition is fast retrieval; if a query is slow, the corpus stops being a planning aid and becomes a curiosity.

## Open questions for discussion

- **Cross-session visibility for private namespaces.** The Worldtree distinguishes `worldtree://public/...` from `worldtree://private/{agentId}/...`. How should the corpus respect that boundary at query time?
- **Retention vs. analytics.** Contributions are currently retained indefinitely. As the corpus grows large, do we tier (hot/warm/cold) or shard by realm?
- **Externally-attached outcomes.** What's the smallest API that lets a user say "session X led to outcome Y" without coupling the corpus to any specific external system?
- **Critic-vs-creator separation.** Should the same elemental that wrote a contribution be allowed to score it later (familiarity bias), or should scoring always come from a different agent class?
- **Versioning the schema for `dataset` mode.** As we add fields, downstream consumers (fine-tuners, analytics) pin to a schema version. How do we evolve the corpus without breaking existing consumers?

These are not blockers — they are the conversations that get easier to have once a meaningful corpus actually exists. That part is now true.
