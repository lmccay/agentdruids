# The Research-Clerk Pattern — retrieve once, share grounded findings

**Status:** Design (pattern/convention; no seeded agent)
**Builds on:** `in-session-retrieval-rag.md`, `realm-grounded-assessment.md`, `operator-ingestion-flow.md`, deterministic references (PR #42), default-available `search_worldtree` (PR #41)
**Scope:** A coordination convention in which one agent does the WorldTree retrieval for a session and its **cited findings flow to the others** through the existing delegation + step-context mechanism — so every agent doesn't independently re-query the corpus.

## The problem it solves

`search_worldtree` is now a default-available built-in (PR #41): any agent *can* retrieve. Left unstructured, that pushes toward the opposite failure mode — N agents in a session each issuing their own (overlapping, possibly divergent) corpus queries, multiplying retrieval cost and producing inconsistent grounding across the team. A coordination session usually wants **one authoritative read of the corpus**, shared.

There is also a quieter cost: retrieval is a tool round-trip inside each agent's agentic loop. Doing it once and reusing the result is strictly cheaper than doing it per-agent.

## The pattern

Designate one agent in the session as the **research clerk**. The coordinator delegates the retrieval task to it *first*, before the agents that will reason over the findings:

1. **Coordinator delegates to the clerk** via `delegate_task` / `assign_simple_task` with a retrieval-shaped task ("gather what the corpus says about X, scoped to this session's realms").
2. **The clerk calls `search_worldtree`** in its agentic loop. Because of PR #42, its response carries a deterministic `## References` block and a structured `references` field reflecting **what was actually retrieved** — provenance included (source, format, ingest date, checksum).
3. **The clerk's output becomes a coordination step.** Downstream agents receive it the same way they receive any prior contribution — injected as step context and/or pulled explicitly with `get_step_content`.
4. **Reasoning agents work from the shared findings** instead of each re-querying. They may still call `search_worldtree` for a targeted follow-up, but the baseline read is done once and is consistent across the team.

No new plumbing: this is `delegate_task` + step-context (`get_step_content`) + the references already produced by PR #42, arranged in a deliberate order.

## Why a convention, not a seeded agent (for now)

The clerk is **a role, not a special agent type.** Any Elemental can play it; what makes it a clerk is the coordinator delegating retrieval to it first and the others consuming its findings. We deliberately do **not** ship a built-in `research-clerk` Elemental yet:

- The retrieval task is realm- and domain-specific. A generic clerk prompt is unlikely to beat a domain Elemental that already understands the session's subject.
- Seeding a default agent commits us to one prompt and one scope posture before we have evidence about what clerks actually need.

**Revisit trigger:** if operators keep authoring clerks that converge on the *same* generic retrieval prompt, that repetition is the signal to promote the pattern into a seeded `research-clerk` Elemental (and/or a coordinator affordance that designates a clerk phase). Until then, the pattern lives as convention.

## How grounding propagates

This is the same data the realm-grounded support gate consumes (`session_claim_evidence` in `realm-grounded-assessment.md`), seen once more: the clerk's `references` are the per-session evidence base. Claims made by downstream agents can be checked against the chunks the clerk retrieved, because those chunks (and their provenance) are in the shared step context — not locked inside one agent's private loop. Retrieve-once also means **one** evidence set to audit per session rather than N divergent ones.

## Scoping

The clerk retrieves under the session's realm scope (`global ∪ traversed realms`) — identical to any `search_worldtree` call (rung 5a). The clerk does not widen scope; it does not see documents outside the session's realms. If a session needs broader coverage, that is a realm-access decision, not a clerk capability.

## What this is not

- **Not automatic retrieval-augmented coordination (Phase C).** Phase C has the *coordinator* auto-retrieve and inject before planning, with no agent in the loop. The clerk pattern keeps an agent in the loop and reuses delegation; it is the lighter, build-nothing precursor. The two can coexist — Phase C could later subsume the clerk's role.
- **Not a guarantee.** It is a coordinator behavior. If a session prompt doesn't establish a clerk, agents fall back to retrieving individually (still correct, just less efficient and less consistent).

## Open questions

- **Who designates the clerk** — the session/coordinator prompt, or a future coordinator affordance?
- **Refresh** — does the clerk retrieve once per session, or re-run when a downstream agent surfaces a new sub-topic the initial read didn't cover?
- **Hand-off shape** — is the raw clerk response (prose + References) the right downstream payload, or should the structured `references` be passed as discrete evidence the gate can consume directly?
