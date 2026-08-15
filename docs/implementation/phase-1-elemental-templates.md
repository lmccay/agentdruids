# Phase 1 Implementation Plan — Elemental Templates via the Composition System

**Design:** [../design/realm-foundational-context-and-elemental-templates.md](../design/realm-foundational-context-and-elemental-templates.md)
**Status:** Substantially complete. WS1 done (composition activated on the coordination path, session-scoped realm). WS2 done (realm layer DB-backed via `configuration.promptLayer` + realm prompt editor UI). WS3 resolved as opt-in — no code change required. WS4 done **with a deviation**: the shared operating discipline went to the **agent-type** layer, not the realm layer (see §WS4). WS5 done — no agent extension carries the discipline any more. One WS4 deliverable remains and is partly subsumed by Phase 2 (see §Remaining).

## Reconciliation (supersedes the `{{named}}`-slot design)

Investigation found the system **already has** a layered prompt-composition
engine (`PromptCompositionService` + `PromptComposer` + `PromptSourceResolver`),
section-based with `immutable` / `protected` / `override_points` /
`extension_points` semantics — and the agent-side UI for it already exists. So
Phase 1 **reconciles onto that engine** instead of building a `{{named}}`-slot
mechanism. The design doc's §5.4 (`templateValues` / `{{named}}`) is superseded:
an elemental's specialization is supplied as its **`agentExtension` Markdown**
(filling `extension_points`), and the shared operating discipline is an
**`immutable_section`** of the **agent-type** layer.

> Originally this said "of the realm layer." That was wrong for the reason given
> in §WS4 — the realm layer reaches travelling Druids too.

## Current state at the time of investigation *(historical — superseded by the workstream sections below)*

**Backend — the engine is fully built but dormant:**
- 4 fixed layers, composed in order: **global base** → **agent-type** → **realm
  context** → **agent extension**. (`extends` frontmatter exists but is never
  consumed; layering is the fixed order.)
- Layers 1–3 are **file-sourced** from `prompts/` per `config/prompt-sources.json`
  (`FileLoader` only; `HttpsLoader` is a stub). Layer 4 = `agent.promptConfig.agentExtension`
  (DB string, parsed in-memory).
- `AgentPromptConfig` fields actually read by the composer: `baseTemplate`
  (`'standard'|'minimal'`; `minimal` skips the realm layer), `disableRealmPrompt`
  (skips realm layer), `agentExtension`.
- **Dormant because:** (a) `agent.promptConfig` is never populated (DB default
  NULL; nothing seeds it), and (b) the composition branch (`AgentService.ts:866`)
  is an `else if` after the persona branch (`:849`), and **every** coordination /
  travel / delegation path sets `usePersonaPrompt: true`, so composition is
  always short-circuited. On any failure it falls back to the legacy path.

**Frontend — agent side already wired; realm side absent:**
- Agent form has the composition UI: `usePromptComposition` toggle (defaults ON
  for new agents), `baseTemplate` radio, `agentExtension` Markdown editor,
  `disableRealmPrompt` checkbox ("Disable Realm-Specific Prompts"), and a
  read-only "Composition Layers" info box. Payload sends `promptConfig`.
- `disableRealmPrompt` is the "opt out of parent prompt" artifact — fully
  settable on the frontend; dormant only because the backend never composes on
  coordination paths.
- **No realm-level prompt field anywhere** (`RealmManagement.tsx`, `Realm` type,
  `CreateRealmRequest`). This is the gap for a UI-managed realm layer.

## Workstreams

### WS1 — Activate composition on the coordination path *(core; backend)*
The load-bearing change. Today `usePersonaPrompt` short-circuits composition.
- Restructure the branch in `executeAgentPrompt` (`AgentService.ts:844-917`) so
  that when `promptCompositionService && agent.promptConfig` are present,
  **composition produces the base system prompt even for collaboration calls**,
  and the collaboration context (`generateCollaborationContext`) + tool info are
  **appended after** composition (same way tool info is appended today).
  Persona/legacy remains the fallback when there is no `promptConfig`.
- Pass the **session-scoped current realm** into `composePrompt`: today `realmId`
  is derived from `agent.realmAccess.currentRealmId/boundRealmId` (global,
  `:871-875`). Replace with `resolveCurrentRealm(agent, agent.id, sessionId)` so
  the realm layer reflects in-session travel (consistent with the presence-scoped
  retrieval work).
- Preserve the existing catch → legacy fallback (`:899-908`).
- **Acceptance:** a delegated elemental with `promptConfig` gets composed layers
  (global + type + realm + extension) + collaboration context, realm layer keyed
  to its *current* (traveled) realm.

### WS2 — Realm layer: DB-backed + UI-managed *(backend + frontend + migration)*
- **Store:** add a realm prompt-layer field (Markdown with frontmatter —
  `immutable_sections` for operating discipline, `extension_points` for scaffold).
  Decide column vs `configuration` jsonb (see Open items). Migration adds it.
- **Resolve:** add `resolveRealmLayer(realmId)` that fetches the realm's Markdown
  via `RealmService` (already injectable) → `MarkdownPromptParser` → `PromptLayer`,
  and use it in `composePrompt:84-100` instead of `buildRealmPromptSource` (the
  file lookup). Optionally keep the file source as a fallback.
- **UI:** add a realm prompt editor to `RealmManagement.tsx` (Markdown textarea +
  an "Insert operating-discipline template" scaffold button), and add the field
  to the `Realm` type, `CreateRealmRequest`, and the update payload.
- **Acceptance:** edit a realm's prompt layer in the UI → persisted → composed
  into every agent operating in that realm.

### WS3 — Engage composition for real agents — **RESOLVED: opt-in, no code change**
Composition only runs when `agent.promptConfig` is truthy.

**Decision: fully opt-in.** `createAgent` stays pure passthrough
(`AgentService.ts:366`); no server-side default and no backfill migration.
Composition engages only where `promptConfig` is set explicitly — via the UI or
a targeted change.

Why this was the low-risk call: the fleet was already largely converted. Of the
agents present when this was decided, all but one carried `promptConfig` with
real content in `agentExtension`, and every agent's legacy
`llm_config.systemPrompt` was a 21-character placeholder. There was nothing
meaningful to back-fill, and nothing depending on the legacy path.

**Accepted asymmetry, recorded so it is not "fixed" later:** the frontend
defaults `usePromptComposition` ON for new agents, so agents created through the
UI compose, while agents created via API, MCP, or seeding do not. That is
intentional, not an oversight.

Activating composition also makes the existing `disableRealmPrompt` /
`baseTemplate: 'minimal'` frontend artifacts functional (already read by the
composer) — no new UI needed for those.

### WS4 — Migrate existing elemental prompts into layers — **DONE, with a deviation**

**What the plan said:** extract the shared operating discipline into the **realm
layer** as an `immutable_section` plus scaffold `extension_points`.

**What was done:** the discipline went into the **agent-type layer**
(`prompts/agent-types/elemental.md`) as an immutable H1 `# Operating Discipline`.

**Why the plan was wrong.** Nothing in that text is realm-specific — it
describes how *any* elemental behaves under delegation. And Layer 3 composes into
every agent **present** in a realm, including travelling Druids. Putting it in
the realm layer gave the coordinator druid an immutable instruction forbidding
`delegate_task`, the very tool its role depends on, and blocked its own extension
from correcting it (logged as a `security_violation`). This was observed live
before being corrected. This supersedes design §5.5 ("operating discipline —
decided: realm-only"); open item #3 below anticipated the revisit.

**The rule that came out of it:** ask which population needs a rule — a *type*
(Layer 2), a *place* (Layer 3), or one *agent* (Layer 4).

Other WS4 items:
- **Specializations already lived in `agentExtension`** — no move was needed.
- **The leaked chat prose was already gone** before the migration; that item was
  stale.
- **Mechanical gotcha found:** sections are extracted at **H1 only**
  (`MarkdownPromptParser.extractSections`, `token.depth === 1`). The `##
  Operating discipline` heading the elementals used was never a recognized
  section and could not have been enforced as immutable in *any* layer.

The discipline blocks were byte-identical across five elementals (same md5;
exactly 1,077 characters removed from each), so the hoist was mechanical with
nothing to reconcile. `facebook-elemental` had been missing the block entirely —
a real behavioral divergence under delegation — and gained it by inheritance.

### WS5 — De-duplicate across layers — **DONE**
The discipline was removed from all five elemental extensions that carried it, so
it is no longer injected twice. Verified: no `agentExtension` in the database
contains it, and each elemental composes it exactly once from Layer 2. The
coordinator druid receives none of it (no `druid.md` agent-type prompt exists) and
retains its own `delegate_task`-permitting variant.

The composer still blocks override attempts on immutable sections and reports
them as `security_violations`; that remains the mechanism for catching any future
extension that tries to restate the discipline.

**Operational note for any future data-level migration.** The de-dup was applied
as direct SQL, which bypassed the write-through path. `AgentService.getAgent`
checks an in-memory map before falling through to Postgres
(`AgentService.ts:438-455`), and `PromptCompositionService` has its own prompt
cache, so the running app kept serving pre-migration values until it was
restarted. Either go through the REST API (which invalidates properly) or restart
`druids-main` and `druids-mcp-server` after direct SQL.

## Data model changes — as built
- **realms:** no schema change. The layer lives in the existing `configuration`
  jsonb as `configuration.promptLayer`. No migration was needed.
- **agents:** none — reuses the existing `prompt_config` jsonb (`baseTemplate`,
  `agentExtension`, `disableRealmPrompt`, already defined and UI-wired).
- **Frontend types/payloads:** realm prompt-layer field added to `Realm`,
  `CreateRealmRequest`, and the update path.

## Layer semantics (as built)
| Layer | Source | Holds | Reaches |
|---|---|---|---|
| 1 Global base | file `prompts/base/global.md` | system-wide baseline | every agent |
| 2 Agent-type | file `prompts/agent-types/{type}.md` | **the operating discipline** (`immutable`) + type identity | every agent of that type, in all realms |
| 3 Realm context | DB `realm.configuration.promptLayer` | realm-wide standing context: priorities, house standards | every agent **present** in the realm, including visiting Druids |
| 4 Agent extension | `promptConfig.agentExtension` | that agent's specialization | one agent |
| opt-out | `disableRealmPrompt` / `baseTemplate:'minimal'` | skips Layer 3 | — |

Layer 2 has **no per-agent opt-out** — it loads from the agent's type. Only
`elemental.md` exists today; other types are `optional: true` in
`config/prompt-sources.json` and contribute nothing when absent, which is why the
coordinator druid receives no type layer at all.

## Sequencing (as delivered)
1. **WS1** — composition activated on the coordination path + session-scoped
   realm.
2. **WS2** — realm layer DB-backed + realm prompt editor UI.
3. **WS3** — resolved as opt-in; no code change.
4. **WS4 + WS5** — discipline hoisted to the agent-type layer and removed from the
   five elemental extensions, with a follow-up correcting the realm prompt
   editor's "Insert template" scaffold, which had seeded the same layer-scope
   mistake.

## Open items — all resolved
1. **Realm storage:** ~~dedicated `prompt_layer` column vs `configuration` jsonb~~
   → **RESOLVED against the stated lean:** implemented as
   `configuration.promptLayer` (jsonb), not a dedicated column. Read at
   `AgentService.ts:882` and `PromptCompositionService.ts:93`.
2. **Existing-agent activation:** → **RESOLVED: fully opt-in.** No server
   default, no backfill. See §WS3.
3. **Agent-type layer (Layer 2):** → **RESOLVED, and it became load-bearing.**
   The operating discipline now lives here. Still file-based.
4. **Legacy path:** unchanged — retained as the fallback for agents without
   `promptConfig`.

## Remaining

One WS4 deliverable is outstanding: **the launch-visibility realm layer as a
reference implementation.** No realm currently carries a `promptLayer`.

This is deliberately parked rather than pending, because the natural content for
that layer — how campaigns are written here, the house voice, the craft — is
**foundational context**, the Phase 2 knowledge tier that does not exist yet.
Authoring it as a realm prompt layer today would file knowledge on the
configuration shelf, which is the specific misfile the taxonomy design exists to
prevent.

Two ways forward, in preference order:

1. **Wait for Phase 2** and deliver it as foundational context, which is its
   correct home.
2. **Interim measure** — hand-author a short realm layer covering genuine
   realm-wide standing context (priorities, house standards), keeping it authored
   and brief rather than pasting documents in, so the eventual migration to
   foundational context is mechanical.

Either way, Phase 1's mechanism work is complete: the layer exists, is
DB-backed, is editable in the UI, and composes correctly. What is missing is
*content*, and the right tier for that content is Phase 2's job.

## Verification

**Done:**
- **Unit** — 62 unit tests pass, including immutable-section enforcement and
  Layer 3 composition.
- **Template validity** — all three prompt files parse and validate, with
  immutable sections resolving to real H1 sections (`global.md` → Critical
  Security Rules, Access Control Requirements; `elemental.md` → Operating
  Discipline).
- **Composition scoping** — every elemental composes the discipline exactly once
  from Layer 2; the coordinator druid receives none of it and retains its own
  `delegate_task`-permitting variant; no realm carries a `promptLayer`.

**Still outstanding:**
- **Integration** — run a real coordination session and confirm from logs that
  the elemental system prompt shows composed layers with the **session-scoped**
  realm, and that delegation still succeeds through the governed transport. This
  is the "first end-to-end validation" that was pending and remains so; all
  verification to date has been static and unit-level.
- **Regression** — confirm an agent with no `promptConfig` still uses the legacy
  path unchanged.
