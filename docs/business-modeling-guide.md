# Modeling a Business in Druids — Guide

**Status:** Guide
**Related:** [design/realm-knowledge-taxonomy-modeling-ux.md](design/realm-knowledge-taxonomy-modeling-ux.md), [design/realm-foundational-context-and-elemental-templates.md](design/realm-foundational-context-and-elemental-templates.md), [cross-realm-research-composition.md](cross-realm-research-composition.md), [realm-grounded-assessment.md](realm-grounded-assessment.md), [in-session-retrieval-rag.md](in-session-retrieval-rag.md)

## 1. Who this is for

You are modeling a real business in Druids: its domains of work, its
specialists, its company knowledge, and the industry literature it must stay
current with. You want agents that draw on the right knowledge without being
told where it lives.

This guide is the practitioner's path through material that is otherwise spread
across five design docs. It answers four questions in order:

1. What are my realms, and which kind is each?
2. Which agents live in them, and which travel?
3. Where does each piece of knowledge go — and how will an agent find it?
4. Where do behavioral rules go, so they apply to exactly the right agents?

It uses one worked multi-realm example throughout (§4). Implementation status is
called out honestly in §10 — some of this runs today, some is designed.

## 2. The primitives

**Realms** are domains of work. They are the unit of knowledge scope: an
agent's available knowledge is a function of which realms it is present in.

Two kinds, and the distinction drives everything downstream:

| | **Activity realm** | **Knowledge realm** |
|---|---|---|
| Holds | Specialists who *produce* | A curated corpus and researchers who *retrieve* |
| Example | Campaign launch, proposal desk | Industry standards, company canon |
| Agents | Channel/craft elementals | Research elementals |
| Reused? | Per line of work | Across many activity realms |
| Runs standalone? | Usually consumed by a workflow | Yes — research is a valid end in itself |

**Elementals** are domain specialists **bound to one realm**. They cannot
travel, and they cannot search outside their realm. That constraint is the
safety property, not a limitation to work around.

**Druids** are coordinators. They travel between realms, carry a directive, and
delegate. A druid is how knowledge legitimately crosses a realm boundary.

**Knowledge realms are not a separate entity type** — they are ordinary realms
whose purpose is to hold a corpus. Do not look for a "knowledge realm" checkbox;
you are choosing a *role* for a realm, which shows up in what you put on its
shelves.

## 3. Model from the work, not the org chart

Resist mirroring departments. Mirror **work that gets done together**, then
factor out knowledge that more than one kind of work needs.

1. **List the recurring jobs.** "Launch a product," "respond to an RFP," "review
   a field report." Each becomes a candidate activity realm.
2. **List the bodies of knowledge those jobs depend on.** "Our service catalog
   and pricing rules," "state and federal testing regulations," "our brand
   voice." Each becomes a candidate knowledge realm.
3. **Factor.** Knowledge needed by two or more activity realms belongs in its
   own knowledge realm, not copied into each. Knowledge needed by exactly one,
   and meaningless outside it, can live in that activity realm.
4. **Cast specialists** into activity realms — one elemental per genuinely
   distinct craft, not one per tool.
5. **Add a coordinator druid** per workflow shape, granted access to the realms
   that workflow spans.

The factoring step in (3) is the one people skip, and skipping it produces the
same document ingested into four realms with four divergent copies.

## 4. Worked example: an environmental testing services company

A company performing lead, asbestos, and water testing for residential and
commercial clients. It markets itself, bids on public contracts, and must stay
current with regulation.

### 4.1 The realm map

**Knowledge realms**

- **`industry-standards`** — federal and state testing regulations, sampling
  protocols, accreditation requirements, industry journals. Sourced externally;
  changes when regulators change it.
- **`company-canon`** — service catalog, pricing rules, SOPs, past reports,
  brand voice, differentiators. Sourced internally; changes when the business
  changes.

**Activity realms**

- **`campaign-launch`** — channel elementals (LinkedIn, Reddit, Hacker News,
  X, plus a positioner) that turn a brief into multi-channel messaging.
- **`proposal-desk`** — elementals for scope drafting, pricing narrative, and
  compliance-matrix assembly.
- **`field-report-qa`** — elementals that review technician reports for
  protocol adherence and defensible language.

**Druids**

- **`campaign-coordinator`** — spans `campaign-launch` + both knowledge realms.
- **`proposal-coordinator`** — spans `proposal-desk` + both knowledge realms.
- **`qa-coordinator`** — spans `field-report-qa` + `industry-standards`.

### 4.2 Why this shape

Both knowledge realms serve **all three** activity realms, which is exactly why
they are separate. A regulation about water sampling is cited by a campaign
claim, a proposal compliance matrix, and a field report review. One corpus,
three consumers, no duplication.

Note also that a single document can associate with **more than one realm** —
realm association is many-to-many, so an accreditation standard can serve both
`industry-standards` and `company-canon` without being copied. An item is in
scope if *any* of its associated realms is in scope.

The activity realms stay ignorant of each other. A campaign elemental has no
path to proposal pricing logic, and that is deliberate.

## 5. The two shelves

Every realm has exactly two shelves. Getting an artifact onto the wrong one is
the most common and most costly modeling error, because the shelf determines
whether an agent can ever *use* the thing.

### Shelf 1 — "What agents know" (Knowledge)

Ingested material. Three tiers, distinguished by *how the agent encounters it*:

| Tier | Agent encounters it | Use for |
|---|---|---|
| **Reference corpus** | Looked up by semantic search when the query is topically close | Facts, catalogs, regulations, specs, past reports |
| **Foundational context** | Always in mind while present in the realm | How work is done here — craft, voice, method, standards |
| **Promoted outcomes** | Accumulated from completed sessions, with provenance | Learnings the business earned rather than authored |

### Shelf 2 — "How agents work here" (Behavior)

Authored configuration, composed into the system prompt. Not ingested, not
searched. See §6 for which layer.

### The load-bearing distinction

**Semantic similarity governs findability only.** It has no effect on whether a
model can use text already in its context.

So a document explaining *how to write for this channel* placed in the reference
corpus will essentially never be retrieved — during a campaign about water
testing, the queries are about water testing, and the embedding of a
craft-guidance document sits nowhere near them. It is present, indexed, and
invisible.

That single fact is why the shelves exist. Route by **when the agent should
encounter it**, never by what kind of file it is.

### Decision table

| The artifact | Shelf | Mechanism |
|---|---|---|
| State lead-abatement regulation (PDF) | Knowledge — reference | Chunked, embedded, retrieved by query |
| Service catalog with pricing tiers | Knowledge — reference | Chunked, embedded |
| Past inspection reports | Knowledge — reference | Chunked, embedded |
| "How we write for regulators" | Knowledge — **foundational** | Distilled to a brief, injected on presence |
| Brand voice and prohibited claims | Knowledge — **foundational** | Distilled, injected on presence |
| "What good positioning looks like here" | Knowledge — **foundational** | Distilled, injected on presence |
| Realm priorities and house standards | Behavior — realm layer | Composed into every agent present |
| "Elementals produce and stop under delegation" | Behavior — **agent-type layer** | Composed into every elemental everywhere |
| This elemental's channel expertise | Behavior — agent extension | Composed into that agent only |
| A finding from last quarter's launch | Knowledge — promoted outcome | Promoted from session, provenance retained |

## 6. The prompt layers, and the scope rule

Behavior composes in four fixed layers, in order:

| Layer | Source | Reaches | Put here |
|---|---|---|---|
| 1 Global base | `prompts/base/global.md` | Every agent | System-wide baseline |
| 2 Agent type | `prompts/agent-types/{type}.md` | Every agent **of that type**, in all realms | How a *type* behaves — e.g. the elemental delegation contract |
| 3 Realm context | `realm.configuration.promptLayer` | Every agent **present in the realm**, including visiting Druids | Domain priorities, house voice and standards |
| 4 Agent extension | `agent.promptConfig.agentExtension` | That one agent | Its specialization |

An agent opts out of Layer 3 with `disableRealmPrompt` or
`baseTemplate: 'minimal'`. Layer 2 has **no per-agent opt-out** — it loads from
the agent's type, so whatever you put there reaches every agent of that type.
(A type with no prompt file simply contributes nothing; only `elemental.md`
exists today.)

### The rule that is easy to get wrong

**Layer 3 reaches every agent present in the realm, including travelling
Druids.** So agent-type behavior must never go in the realm layer.

The concrete failure: the elemental delegation contract says "produce and stop;
do not call `delegate_task`; you are not a coordinator." Put that in a realm
layer and the coordinator druid that travels into the realm receives an
instruction forbidding the exact tool its role depends on. If the section is
marked immutable, the composer additionally blocks the druid's own extension
from correcting it and logs a `security_violation`.

This is not hypothetical — it happened in this codebase and was corrected by
moving that text into the elemental agent-type layer, where it reaches every
elemental in every realm and no other type.

Ask: **"which population needs this — a type, a place, or one agent?"** Type →
Layer 2. Place → Layer 3. Agent → Layer 4.

### Immutability

Sections named in a layer's `immutable_sections` frontmatter cannot be
overridden by a later layer; attempts surface as `security_violations`. Sections
named in `extension_points` can be appended to.

Two mechanical constraints worth knowing before you author:

- **Sections are H1 only.** The parser extracts sections at `#` depth 1. An
  `##` heading is not a section and cannot be enforced as immutable.
- **Immutable section names must match a real H1** in the same document, or
  validation fails.

## 7. How retrieval scoping actually works

This is what makes the multi-realm model safe, and it is worth understanding
before you draw realm boundaries.

`global` is always implicit. Beyond that, scope is assembled from three sources,
each intersected with the agent's grants:

1. **Session research realms** — the realms this session was told to research.
2. **Current presence** — an elemental's bound realm, or wherever a druid has
   travelled.
3. **Explicitly requested realms** — passed on the `search_worldtree` call.

If that resolves to nothing, the search is **global-only**. It deliberately does
*not* fall back to everything the agent could reach, which would leak unrelated
realms' corpora into an unrelated query.

The consequences for modeling:

- **An elemental is confined** to `global ∪ its realm ∪ session`. A campaign
  elemental cannot reach the proposal desk's corpus even if misdirected. You do
  not need to build narrow agents to get narrow scope.
- **Capability is a ceiling, not a query scope.** Granting a druid access to six
  realms does not make every query search six realms. Scope comes from the
  session directive. So **one versatile coordinator, scoped per session**, rather
  than a bespoke coordinator per domain combination.
- **Empty results are a signal.** A search with nothing in scope records a
  knowledge gap with its query and target realms — a demand signal for what to
  ingest next, closing the loop between use and curation.

## 8. Cross-realm composition: gather, then produce

Knowledge crosses a realm boundary through a curated hand-off, never by widening
an elemental's access.

1. **Gather.** The coordinator druid, directed at `industry-standards` and
   `company-canon`, researches and produces **cited references**, writing them
   into a session-scoped research namespace.
2. **Produce.** The activity elementals do their work. They retrieve the curated
   session references through ordinary search. They never touch the knowledge
   realms.

The safety properties: only an agent with real access to a source realm may seed
references derived from it; every reference carries provenance; session scope is
per-session so nothing leaks across sessions; and the seeded set is ephemeral and
cleaned up when the session ends.

What the elementals receive is a *curated set*, not a firehose — which is also
why quality is better than granting broad access would produce.

### The example, end to end

A launch campaign for a new water-testing service:

1. `campaign-coordinator` opens a session with research scope
   `[industry-standards, company-canon]`.
2. It gathers: the claims substantiation rules it must not violate, the service's
   actual scope and pricing posture, the brand's prohibited claims. Each cited.
3. It travels into `campaign-launch` and delegates to the positioner, which
   produces positioning grounded in the seeded references.
4. It delegates to each channel elemental. Each carries: the elemental
   delegation contract (Layer 2), `campaign-launch` priorities and house voice
   (Layer 3), its own channel craft (Layer 4), the realm's foundational briefs on
   how campaigns are written here, and the session's cited references via search.
5. Findings worth keeping are promoted into `company-canon` as outcomes, with the
   originating session as provenance. The next campaign starts better informed.

Step 5 is what compounds. Without it every campaign starts from zero.

## 9. Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| Craft guidance in the reference corpus | Never retrieved — topically distant from real queries | Foundational context |
| Same corpus ingested into several realms | Divergent copies, no single source | One knowledge realm, referenced by many |
| Realms mirroring the org chart | Boundaries don't match how work flows | Model recurring jobs |
| Type behavior in the realm layer | Breaks visiting Druids; blocks their overrides | Agent-type layer |
| Operating rules pasted into each elemental | Drifts silently; one copy ends up missing | Author once in the right layer |
| A coordinator per domain combination | Combinatorial explosion of near-identical agents | One coordinator, per-session research scope |
| Granting broad realm access for convenience | Access becomes the query scope in the operator's mind | Grant the ceiling, direct the scope |
| One elemental per tool | Fragments a craft across agents | One per genuinely distinct craft |

## 10. What exists today

Being explicit, because the guide describes a model that is only partly built.

**Working now**

- Realms, elementals, druids, realm travel, and per-session isolation.
- Four-layer prompt composition, with immutable/extension-point enforcement and
  the agent-type layer correctly scoped by type.
- The realm prompt layer (Layer 3), DB-backed and editable in the realm form.
- Directed retrieval scoping — session research realms, presence, and explicit
  realms, all grant-clamped, global-only when empty.
- Knowledge-gap recording on empty results.
- Reference-corpus ingest, chunking, and embedding.

**Designed, not built**

- **Foundational context** as a first-class tier — the distillation pipeline,
  its store, and presence-injection. Today the only way to give a realm standing
  guidance is the Layer 3 prompt field, which files knowledge on the
  configuration shelf. This is the largest gap in the model as described.
- **Promoted outcomes** as a formal tier.
- The composed-prompt preview ("what will this agent see?").
- Intent-first ingest with the misfile nudge.

So if you are modeling today: put reference material in the corpus, and accept
that realm-wide standing guidance goes in the Layer 3 prompt field as an interim
measure. Keep it *authored and short* rather than pasting documents in, so the
eventual migration to foundational context is mechanical.

## 11. Open questions

1. **Foundational audience** — do foundational briefs inject for every in-realm
   agent, or coordinators only? Unresolved in the storage design; the answer
   changes what belongs in a brief.
2. **Knowledge realm without elementals** — is a corpus-only realm with no
   resident agents a legitimate shape, or should every knowledge realm have at
   least one research elemental?
3. **Promotion target** — when a session learning is promoted, which realm
   receives it: the activity realm where it was produced, or the knowledge realm
   it concerns?
4. **Session reference promotion** — should a session-scoped reference that
   proves broadly useful be promotable to realm or global scope, and by whom?
