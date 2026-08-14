# Realm Foundational Context & Elemental Prompt Templates — Design

**Status:** Draft / proposal
**Related:** [realm-knowledge-taxonomy-modeling-ux.md](realm-knowledge-taxonomy-modeling-ux.md), [in-session-retrieval-rag.md](../in-session-retrieval-rag.md), [phase-a-worldtree-discovery.md](../phase-a-worldtree-discovery.md), [realm-grounded-assessment.md](../realm-grounded-assessment.md), [operator-ingestion-flow.md](../operator-ingestion-flow.md)

## 1. Motivation

Two problems observed while running realm-scoped coordination:

1. **Domain/craft knowledge is not reachable by semantic search.** Retrieval
   (`search_worldtree`) ranks corpus chunks by embedding similarity to the
   *query*. During a campaign about a specific product or service, the queries
   are about that topic, so a document describing *how to do the realm's
   activity* (e.g.
   channel/positioning craft for the launch-visibility realm) is never
   retrieved — its embedding is far from the topical query. Embedding
   similarity governs **findability only**; it has no effect on whether the LLM
   can *use* the text once it is in context. So craft knowledge must be
   delivered as **standing context**, not via query-time retrieval.

2. **Elemental system prompts duplicate a large "operating discipline"
   boilerplate.** Each platform elemental (Reddit, X, LinkedIn, Hacker News, …)
   carries the same instructions on how to behave under `delegate_task`
   (produce-and-stop, do not call `message_agent`/`delegate_task`, fail loudly
   if context is missing, etc.). This is redundant to author, drifts out of
   sync, and — because each prompt is hand-maintained — accumulates cruft (the
   current HN elemental prompt even contains leftover chat explanation, "Why
   this should fix it…", that leaked into the production system prompt).

Both are forms of **realm-level standing context that shapes agent behavior**,
but they have different natures and therefore different homes.

## 2. Core distinction: knowledge vs. configuration

| | **Knowledge** | **Configuration** |
|---|---|---|
| What | What agents *know* | How agents are *told to behave* |
| Examples | Domain facts, craft guidance, service catalogs | Operating discipline, prompt scaffolding, output contracts |
| Source | Ingested documents | Authored templates |
| Editing | Ingest / re-ingest / distill | Direct edit in the realm config, versioned |
| Provenance | Document + checksum | Author + template version |
| Delivery | Standing context or semantic retrieval | Standing context (composed into the system prompt) |

**Foundational context** (problem 1) is knowledge → document-sourced.
**Elemental prompt templates** (problem 2) are configuration → a first-class,
authored realm field. Conflating them (e.g. treating the operating discipline
as "just another ingested document") is the usability smell to avoid: it forces
a business modeler to understand internal storage mechanics instead of
expressing intent.

## 3. Knowledge taxonomy (three tiers + config)

This design firms up a taxonomy so each kind of knowledge has one home and one
retrieval mode. It sits alongside the structured (`record`) tier explored
elsewhere.

| Tier | Nature | Retrieval | Lifecycle | Home |
|---|---|---|---|---|
| **Reference corpus** | Topical facts | Semantic (vector) match | Ingested, stable | `worldtree_documents` + `chunk_embeddings` (today) |
| **Foundational context** | How the realm operates (craft/voice/method) | Standing injection by presence | Curated, changes rarely | **new** `realm_foundational_context` |
| **Promoted outcomes** | Learnings from completed sessions | Namespace / query assembly | Accumulated, provenance-tracked | `realm.knowledgeNamespaces` / `knowledgeQueries` (reserved) |
| *(config)* **Behavioral templates** | Operating discipline + prompt scaffolding | Composed into system prompt | Authored, versioned | **new** realm field + agent opt-in |

`knowledgeNamespaces` / `knowledgeQueries` are **reserved for promoted
outcomes**, not foundational context — they are semantically different
(*earned/accumulating* vs *authored/standing*) and should not be overloaded.

## 4. Concept 1 — Foundational context

### 4.1 Behavior
When an agent operates in a realm, that realm's foundational briefs are appended
to its system prompt as standing context — regardless of the topical query.
Reuses the existing `generateRealmAwareSystemPrompt` seam (which already injects
`realm.description` and already reads **session-scoped current realm**, so it
composes with presence-scoped retrieval).

### 4.2 Ingest intent (resolves the usability smell)
The ingest flow asks *what is this document for?* rather than making the modeler
choose a storage location:

- **Reference corpus** — searchable facts (current behavior: chunk + embed).
- **Foundational context** — "how this realm operates" (distill + inject).

Intent — a domain-level question — routes storage. The modeler expresses
purpose, not mechanics.

### 4.3 Pipeline (Docling is shared; indexing differs)
Docling only does **conversion** (URL/file → markdown/JSON/text). Chunking and
embedding are a *separable downstream stage* (`maybeChunk`), not part of Docling.
So one conversion, two indexing strategies chosen by intent:

- Reference: convert → chunk → embed → semantic-searchable *(unchanged)*.
- Foundational: convert → **distill** (summarize to a compact brief) → persist
  to `realm_foundational_context`; **skip chunk/embed**. Optionally embed later
  only if searchable access is also wanted.

Distillation runs **once at ingest**, not per turn — the brief is paid on every
in-realm agent turn, so it must stay compact.

**Distillation contract (signal-preserving).** Auto LLM-summarize is used, but
the distillation prompt is explicitly constrained to preserve signal, not
compress it away:
- **Preserve** actionable specifics verbatim-in-substance: explicit rules,
  numbered steps, do/don't lists, named entities, thresholds, timing, formats,
  and output paths.
- **Compress** only connective prose and repetition.
- **Do not generalize** concrete guidance into vague summary (e.g. keep "post
  Tue–Thu 8–10am PT," not "post at good times").
- **Write as standing instructions** ("Operate as follows: …"), not a
  description of the document ("This document discusses …").
- Distillation is **re-runnable** from the stored source when the source drifts
  (checksum change) or the contract itself improves.

### 4.4 Store (sketch)
```
realm_foundational_context(
  id              uuid pk,
  realm_id        uuid not null references realms(id),
  source_document_id uuid references worldtree_documents(id),  -- provenance; re-distillable
  distilled_brief text not null,        -- what gets injected
  source_checksum varchar(64),          -- detect source drift
  created_at, updated_at timestamptz
)
```
Keeps the converted original in `worldtree_documents` for provenance and
re-distillation; injects only `distilled_brief`.

## 5. Concept 2 — Elemental prompt templates

### 5.1 Problem
The example HN elemental prompt has two separable parts:
- **Elemental-specific** — channel expertise, "when asked to draft" steps,
  output path. Genuinely per-elemental.
- **Shared operating discipline** — invoked-via-`delegate_task`, produce-and-stop,
  forbidden tool calls, "Cannot proceed — missing X" contract. **Identical**
  across every elemental in the realm.

Hand-maintaining the shared part in each elemental prompt is the source of
redundancy, drift, and cruft.

### 5.2 Model — realm template + opt-in inheritance
A **realm field** holds an elemental prompt template with the shared operating
discipline written once, plus named slots for per-elemental content:

```
realm.elementalPromptTemplate (string, authored):

  You are a {{channel}} content specialist. {{positioning_note}}

  Your expertise:
  {{expertise}}

  When asked to draft {{channel}} content:
  {{drafting_steps}}

  Write your output to:
    worldtree://session/{session-id}/channels/{{channel_slug}}/drafts.md

  ## Operating discipline
  <shared boilerplate — literal in the template, authored once>
```

Each elemental **opts in** and supplies slot values:
```
agent.promptConfig.inheritRealmTemplate: true
agent.promptConfig.templateValues: {
  channel: "Hacker News",
  channel_slug: "hackernews",
  positioning_note: "HN is the highest-leverage channel …",
  expertise: "- HN culture: technical depth wins …\n- Show HN format: …",
  drafting_steps: "1. Read positioning …\n2. Decide post type …"
}
```

Effective elemental system prompt = realm template rendered with the
elemental's values (`{session-id}` filled at runtime). Opt-out (flag false or
absent) → the elemental keeps its own full `systemPrompt` (backward compatible).

### 5.3 Why a field, not an ingested document
Behavioral scaffolding is **configuration**: it must be directly visible,
diffable, versioned, and governance-critical (the forbidden-tool contract is
correctness-load-bearing). Ingested documents are optimized for
gather/distill/retrieve, not for precise authored control. So the template is a
first-class realm field, edited in the UI.

### 5.4 How an elemental supplies template values

> **SUPERSEDED (2026-07-05).** Investigation found an existing section-based
> composition engine (`PromptCompositionService`), so Phase 1 reconciles onto it
> instead of a `{{named}}`-slot mechanism: the realm layer holds the operating
> discipline as an `immutable_section`, and an elemental supplies its
> specialization as its **`agentExtension`** Markdown (filling `extension_points`)
> — not a `templateValues` map. See
> [../implementation/phase-1-elemental-templates.md](../implementation/phase-1-elemental-templates.md).
> The slot model below is retained only as design rationale.

**Data model.** Values live in the existing agent `prompt_config` jsonb column:
```
agent.promptConfig = {
  inheritRealmTemplate: true,
  templateValues: {
    channel: "Hacker News",
    channel_slug: "hackernews",
    positioning_note: "HN is the highest-leverage channel for technical launches …",
    expertise: "- HN culture: technical depth wins …\n- Show HN format: …",
    drafting_steps: "1. Read positioning, ICP, goal, voice from session context.\n2. …"
  }
}
```
Keys are the realm template's `{{named}}` slots; values are the elemental's
specialization content.

**Slot contract (realm-declared manifest).** The realm carries a slot manifest
alongside the template so authoring is form-driven and validated:
```
realm.elementalTemplateSlots = [
  { name: "channel",        label: "Channel name",              required: true,  multiline: false, example: "Hacker News" },
  { name: "channel_slug",   label: "Channel slug (path-safe)",  required: true,  multiline: false, example: "hackernews" },
  { name: "positioning_note", label: "Positioning note",        required: false, multiline: true },
  { name: "expertise",      label: "Channel expertise",         required: true,  multiline: true },
  { name: "drafting_steps", label: "When-asked drafting steps", required: true,  multiline: true }
]
```
The manifest can be **derived** by parsing `{{named}}` tokens from the template
(keeps them in sync — the minimum), or **authored** for richer
labels/help/required/example (recommended — drives a good form). Parsing is the
source of truth for *which* slots exist; the manifest adds presentation/validation.

**Placeholder convention (disambiguates author slots from runtime vars).**
- `{{name}}` → **elemental-provided** slot, filled from `templateValues` at
  compose time.
- `{{runtime.*}}` → **system-provided** runtime var (e.g. `{{runtime.sessionId}}`,
  `{{runtime.agentId}}`), filled at execution — not authored by the elemental.
  (Replaces the ambiguous single-brace `{session-id}` in the current prompts.)

**Authoring UX.** When an elemental in the realm has `inheritRealmTemplate` on,
the editor renders one field per slot from the manifest (a textarea when
`multiline`), with label/help/example. The modeler fills **only** the
specialization — never the shared operating discipline, which lives once in the
realm template. Opt-out (flag off/absent) → the elemental keeps its own full
`systemPrompt` (backward compatible).

**Validation.**
- *At save:* required slots must be non-empty; unknown keys ignored with a
  warning. If the realm template later adds a slot, elementals missing it are
  flagged "needs attention."
- *At compose (runtime guard):* a missing required slot injects a visible
  `[MISSING: <slot>]` marker and logs a warning — never a silent drop.

**Composition.** Effective elemental system prompt = realm
`elementalPromptTemplate` with `{{slots}}` replaced from `templateValues` and
`{{runtime.*}}` filled at execution, then layered per §6.

### 5.5 Operating-discipline layer — decided: realm-only
The "produce-and-stop / forbidden tool calls" contract is arguably system-wide
coordination protocol, but for now it lives **in the realm template** (simple,
per-realm customizable). If multiple realms converge on identical discipline, a
system-default protocol that realms override is a later refactor — not built now.

## 6. Prompt composition pipeline (integration)

Final system prompt, composed outermost → innermost, with a **de-duplication
rule** (never inject the same guidance twice across layers):

1. **Base identity** — from the rendered elemental template, or
   `You are {name}. {description}` if not templated.
2. **Operating discipline** — realm elemental template (§5) [or system default].
3. **Realm foundational context** — distilled briefs (§4), via
   `generateRealmAwareSystemPrompt`.
4. **Elemental specialization** — the template's filled expertise/steps slots.
5. **Tool information** — existing `toolInformation` append.
6. **Session / collaboration context** — existing.

Integration points already exist: `generateRealmAwareSystemPrompt`
(`AgentService.ts:1607`, realm-scoped, presence-aware) and
`generatePersonaSystemPrompt`. This design extends them; it does not add a
parallel path.

## 7. What this does and does not save (token reality)

Be precise so expectations are right:
- **Authoring / maintenance / consistency:** large win — the operating
  discipline and domain brief are single-source-of-truth; no drift, no cruft.
- **Cross-layer duplication:** real runtime win — the composition de-dup rule
  prevents injecting the same guidance both in an elemental prompt *and* via
  realm context.
- **Per-call baseline tokens:** roughly **unchanged**. Each elemental is a
  separate LLM call and still needs the discipline + brief in its own context.
  Templating does **not** reduce the per-agent baseline (each agent must carry
  its instructions); it removes *redundant authoring* and *accidental bloat*,
  and centralizes tightening.

## 8. Data model changes (summary)

- **New table** `realm_foundational_context` (§4.4).
- **Realm fields:** `elementalPromptTemplate` (text); (foundational context is a
  relation via the new table).
- **Agent `promptConfig`:** `inheritRealmTemplate` (bool),
  `templateValues` (map).
- **Ingest request:** an `intent` / `purpose` field (`reference` |
  `foundational`) routing conversion output.
- `realm.knowledgeNamespaces` / `knowledgeQueries` — left for promoted outcomes;
  untouched here.

## 9. Decisions

Settled 2026-07-05:
1. **Operating-discipline layer — realm-only** (§5.5). System-default+override
   deferred until realms converge.
2. **Slot mechanism — `{{named}}` placeholders** (§5.4), with `{{runtime.*}}`
   reserved for system-filled vars.
3. **Distillation — automatic LLM-summarize** at ingest, under the
   signal-preserving distillation contract (§4.3).
4. **Phasing — P1 elemental templates → P2 foundational context → P3 promoted
   outcomes** (§10).

Still open (not blocking Phase 1):
- **Versioning:** do templates and briefs need explicit versions / change
  history? (Lean: reuse existing agent/realm `version` fields initially.)
- **Migration:** how to lift existing hand-authored elemental prompts into
  `{ template + values }` — a one-time assisted extraction (parse the shared
  boilerplate → realm template; the residue → per-elemental slot values).
- **Foundational-context audience (P2):** coordinator only vs every in-realm
  elemental (drafting elementals likely benefit most).

## 10. Phasing (proposed)

- **Phase 1 — Elemental templates.** Reconciled onto the existing
  `PromptCompositionService` (realm layer = operating discipline as an immutable
  section; elemental `agentExtension` = specialization). Activate composition on
  the coordination path, make the realm layer DB-backed + UI-managed, migrate
  current elementals. Detailed plan:
  [../implementation/phase-1-elemental-templates.md](../implementation/phase-1-elemental-templates.md).
- **Phase 2 — Foundational context.** Ingest-intent routing +
  `realm_foundational_context` + distillation + injection.
- **Phase 3 — Promoted outcomes.** Formalize `knowledgeNamespaces` /
  `knowledgeQueries` for session-outcome promotion (separate design).

## 11. Out of scope

- Promoted-outcome mechanics (Phase 3, separate design).
- Changes to reference-corpus semantic retrieval (presence-scoping already
  landed — see in-session-retrieval-rag / realm-grounded-assessment).
