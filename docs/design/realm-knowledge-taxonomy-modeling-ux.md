# Realm Knowledge Taxonomy — Modeling & Management UX — Design

**Status:** Draft / proposal
**Related:** [realm-foundational-context-and-elemental-templates.md](realm-foundational-context-and-elemental-templates.md), [../implementation/phase-1-elemental-templates.md](../implementation/phase-1-elemental-templates.md), [../operator-ingestion-flow.md](../operator-ingestion-flow.md), [../in-session-retrieval-rag.md](../in-session-retrieval-rag.md)

## 1. Purpose & scope

The knowledge taxonomy (reference corpus, foundational context, promoted
outcomes, and behavioral templates) is coherent as a *storage/delivery* model.
Its risk is entirely in the UX: it exposes four mechanisms to a person who
thinks in **business domains**, not vector stores. If the interface asks the
modeler to name storage types, the model collapses into "everything is a
document I paste somewhere," and the reference/foundational distinction — which
governs whether an agent can ever *use* a piece of knowledge — is lost.

This document specifies the **modeling and management experience** an
administrator/business-modeler uses to build and maintain a realm's knowledge
taxonomy. It is a UX-layer companion to the storage design; it does **not**
change the taxonomy or the composition engine. It exists to lock the mental
model and interaction surface *before* the P1 implementation touches the UI.

Out of scope: storage schemas, distillation internals, and composition-engine
wiring (all covered by the related docs).

## 2. The mental model to instill

The modeler should never learn the internal tier names. They should internalize
**three questions**, in order:

1. **What domain am I modeling, and how is work done in it?** → a **Realm**.
2. **For each thing I give an agent — is it something it should *know*, or a
   rule for how it should *act*?** → **knowledge vs. configuration**. This is
   the one load-bearing distinction; the UI teaches it *physically* (§4).
3. **When should the agent encounter this?** → *always in mind* (standing),
   *looked up when relevant* (searchable), or *how it must behave* (composed
   into instructions).

A fourth concept is absorbed implicitly: **presence scopes everything.** An
agent receives a realm's knowledge and rules *because it is operating in that
realm*. Elementals are bound to one realm; Druids travel and pick up each
realm's context as they go. The UI makes this visible (§8) rather than
documenting it.

Everything else — chunking, embeddings, distillation, `prompt_config`,
composition layers — is mechanism the UI must never make the modeler name. The
modeler expresses **intent and role**; the system chooses the store.

## 3. Modeling approach — top-down, domain-first

The interaction sequences the modeler through a natural order of operations. A
first-run **"model your domain"** wizard walks the sequence for a new realm;
a freeform **realm blueprint** editor (§8) exposes the same surface for ongoing
management.

1. **Declare the realm.** Name it (e.g. "Product Launch Visibility") and answer
   one open prompt: *"Describe how work is done in this domain."*
2. **Split the description.** The wizard asks the modeler to separate what they
   just wrote into *rules everyone must follow* (→ operating discipline, §5) and
   *background everyone should carry* (→ foundational knowledge, §6). This split
   is where the modeler first *feels* the knowledge/config distinction without
   being lectured on it.
3. **Populate knowledge** — intent-first ingest (§6).
4. **Cast specialists** — create elementals that inherit the house rules and
   supply only their specialization (§5).
5. **Preview & validate** — "show me what a specialist actually receives" (§7).
6. **Curate outcomes** *(later / P3)* — promote session learnings back into
   realm knowledge; earned, not authored.

## 4. Two shelves: teaching knowledge vs. configuration

The realm management screen is organized into exactly two regions, labeled in
domain language, not system language:

- **"What agents know"** (Knowledge) — the reference corpus, the foundational
  briefs, and (later) promoted outcomes.
- **"How agents work here"** (Behavior) — the operating discipline template and
  the roster of specialists cast into it.

This separation is the primary pedagogy. A "how we write for this channel"
document belongs on the *Knowledge* shelf (as foundational, not searchable);
a "how you must behave under delegation" contract belongs on the *Behavior*
shelf (as config). Misfiling should *feel* wrong because the shelves are
distinct.

## 5. Behavioral templates — introduced, selected, realized

### 5.1 Introduced (realm level)
The realm carries an **Operating Discipline** editor that surfaces the
composition engine's section model honestly, with three visually distinct region
kinds:

- 🔒 **Locked / immutable** — the correctness-critical contract
  (produce-and-stop, forbidden `message_agent` / `delegate_task`, fail-loudly on
  missing context). Non-editable at the elemental level. *"Enforced for every
  specialist in this realm."*
- ➕ **Extension points** — labeled placeholders ("Channel expertise",
  "When-asked drafting steps") each specialist fills.
- ✎ **Override points** — sections a specialist *may replace* rather than merely
  extend (used sparingly).

The discipline is authored **once**. Mental model: *"I'm writing the rulebook
for this domain and leaving blanks for each role to complete."*

### 5.2 Selected (elemental level)
Creating/editing an elemental **in that realm** shows a single toggle, ON by
default:

> ☑ **Inherit this realm's operating discipline**

- **On** → the elemental is a *cast role*: locked sections show
  greyed-out-and-inherited (visible, not editable here); only the realm's
  extension points are editable.
- **Off** → full-custom escape hatch: the elemental keeps its own complete
  system prompt (backward-compatible; the honest exit for a specialist that
  genuinely doesn't fit the house style).

### 5.3 Realized / overridden
The elemental supplies its **specialization** (its `agentExtension`) into the
extension points. The governing rule: **the modeler edits only the blanks.**
They can *see* the inherited discipline (to understand full behavior) but must
go to the realm to change it — which is exactly what enforces
single-source-of-truth and eliminates the drift/cruft the taxonomy is trying to
solve.

Two guardrails make this trustworthy:
- **Missing-required flag.** If the realm template later adds a required slot,
  every elemental that hasn't filled it shows **"needs attention"** — no silent
  gaps.
- **De-dup nudge.** If a specialization restates guidance already in the
  discipline: *"This already appears in the realm's operating discipline —
  remove it here?"* Teaches the layering; prevents double-injection.

## 6. Adding knowledge — corpus vs. foundational, by intent

One entry point: **"Add knowledge."** The modeler never picks a storage type.
The only structural question is phrased as a **use**, not a mechanism:

> **How should agents use this?**
> ○ **Reference** — agents *look this up* when a task is relevant.
>   *(facts, catalogs, specs, docs)*
> ○ **Foundational** — agents *always keep this in mind* while working here.
>   *(how we work, voice, method, standards)*

Behind the curtain: Reference → convert → chunk → embed → searchable;
Foundational → convert → distill → store → inject on presence. The modeler sees
none of that. The **confirmation** differs in a way that keeps them in control:

- **Reference** confirms: *"Indexed — N searchable chunks. Agents will find this
  when their task matches."*
- **Foundational** confirms with a **review step**: *"Here's the standing
  instruction we'll give every agent in this realm. Edit if we lost anything
  important."* The modeler reviews/edits the actual injected brief, which links
  back to the source document (provenance + checksum) and offers **Re-distill**
  when the source changes.

**Misfile nudge (the highest-value teaching moment).** If someone chooses
**Reference** for a document that reads like process/voice guidance, detect it
and ask: *"This looks like how-we-work guidance — should it be Foundational
instead? Reference knowledge only surfaces when a query is topically similar, so
process guidance often never gets retrieved."* This one sentence conveys the
most counterintuitive fact in the system — that embedding similarity governs
**findability only**.

**Promoted outcomes (P3)** appear on the Knowledge shelf but are not *added*
here — they arrive from completed sessions, tagged with their originating
session as provenance.

## 7. The screen that makes it click: "What will this agent see?"

Invisible layering is where mental models die. The highest-leverage artifact is
a **live composed-prompt preview** on each elemental (and Druid):
*"Preview what this specialist actually receives."* It renders the assembled
prompt with each layer **color-coded by source**:

1. Base identity
2. 🔒 Operating discipline *(from realm)*
3. 🌱 Foundational context *(distilled briefs, injected by presence)*
4. ✎ Specialization *(this elemental's extension)*
5. Tools
6. Session / collaboration context *(runtime)*

This single view teaches the layering, the de-dup value, presence-scoping, and
the token reality (templating saves *authoring*, not per-call baseline) at once.
The modeler sees that a specialist's prompt is mostly shared house rules ("change
this at the realm"), a band of injected foundational guidance ("from the 'How we
write' brief"), and a small band of genuinely-unique specialization.

For a **Druid**, a realm switcher on the preview shows the prompt *recomposing as
it travels* — making presence-scoping intuitive rather than a doc footnote.

## 8. The realm blueprint (ongoing management)

After first-run, the realm's home is a **blueprint** view — one screen showing
the whole domain as a coherent picture:

- the two shelves (§4) with counts (corpus size, # foundational briefs,
  # promoted outcomes);
- the operating discipline summary with edit access;
- the roster of specialists, each with inherit-status and a "needs attention"
  badge if required slots are unfilled;
- a presence indicator: which agents currently operate here (and, for Druids,
  that they are visiting).

Provenance is surfaced everywhere: foundational briefs link to source doc +
checksum; inherited template sections show "inherited from realm"; promoted
outcomes show their originating session.

## 9. Designing against the predictable smells

The model succeeds only if the UI actively resists the four ways it degrades:

| Smell | Where | Defense |
|---|---|---|
| "How we work" dumped into searchable corpus → never retrieved | Ingest | Intent-first choice + "looks foundational" misfile nudge (§6) |
| Operating discipline copy-pasted into every specialist → drift/cruft | Elemental editing | Inherited sections locked + de-dup nudge (§5.3) |
| Distillation silently drops a load-bearing rule | Foundational ingest | Mandatory review-the-brief step + re-distill (§6) |
| "Why did the agent ignore my document?" | Runtime confusion | Composed-prompt preview + "why wasn't this retrieved?" explainer (topical distance) (§7) |

## 10. The one-sentence journey

*"I name a domain and describe how work is done here; the system helps me split
that into rules everyone follows and background everyone carries; I add knowledge
by saying whether agents should look it up or always keep it in mind; I cast
specialists who inherit the house rules and fill in only what's unique to them;
and at any point I can see exactly what any agent will receive."*

## 11. Open questions

Not blocking, but to settle before the UI implementation plan:

1. **Wizard vs. freeform for v1.** Is the "model your domain" wizard (§3) worth
   building for the first release, or is the freeform blueprint editor (§8)
   sufficient, with the wizard deferred? *(Lean: ship the blueprint editor first;
   the wizard is an onboarding layer over the same primitives and can follow.)*
2. **Foundational review — mandatory or opt-in.** Is the distilled-brief review
   step (§6) a required gate on every foundational ingest, or opt-in with a
   sensible default? *(Lean: mandatory on first ingest of a source; skippable on
   re-distill of an already-approved source.)*
3. **Foundational audience.** Do foundational briefs inject for every in-realm
   agent or coordinator-only? (Mirrors the same open question in the storage
   design; UX should reflect whatever that resolves to.)
