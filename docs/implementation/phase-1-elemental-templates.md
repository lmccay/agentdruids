# Phase 1 Implementation Plan — Elemental Templates via the Composition System

**Design:** [../design/realm-foundational-context-and-elemental-templates.md](../design/realm-foundational-context-and-elemental-templates.md)
**Status:** In progress — WS1 done (composition activated on the coordination path, session-scoped realm), WS2 done (realm layer DB-backed via `configuration.promptLayer` + realm prompt editor UI). Next: WS3/WS4 (populate `promptConfig`, migrate launch-visibility elementals) + first end-to-end validation.

## Reconciliation (supersedes the `{{named}}`-slot design)

Investigation found the system **already has** a layered prompt-composition
engine (`PromptCompositionService` + `PromptComposer` + `PromptSourceResolver`),
section-based with `immutable` / `protected` / `override_points` /
`extension_points` semantics — and the agent-side UI for it already exists. So
Phase 1 **reconciles onto that engine** instead of building a `{{named}}`-slot
mechanism. The design doc's §5.4 (`templateValues` / `{{named}}`) is superseded:
an elemental's specialization is supplied as its **`agentExtension` Markdown**
(filling `extension_points`), and the realm's shared operating discipline is an
**`immutable_section`** of the realm layer.

## Current state (from investigation)

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

### WS3 — Engage composition for real agents *(backend + migration)*
Composition only runs when `agent.promptConfig` is truthy.
- New agents: the UI already defaults `usePromptComposition` ON, so they send
  `promptConfig`. Confirm `createAgent` preserves it (it does — passthrough).
- Existing/seeded agents: **decision needed** — default `promptConfig`
  (`baseTemplate: 'standard'`) in `createAgent`, and/or a backfill migration for
  agents that should compose. Guard against silently changing agents that rely on
  a legacy `systemPrompt`.
- Activating composition automatically makes the existing `disableRealmPrompt` /
  `baseTemplate: 'minimal'` frontend artifacts functional (already read by the
  composer) — no new UI needed for those.

### WS4 — Migrate existing elemental prompts into layers *(one-time, assisted)*
- Extract the shared **operating discipline** (produce-and-stop, forbidden
  `message_agent`/`delegate_task`, fail-loudly contract) into the **realm layer**
  as an `immutable_section` (`## Operating discipline`) plus scaffold sections
  marked as `extension_points`.
- Move each elemental's **specialization** (expertise, when-asked steps, output
  path) into its **`agentExtension`** (filling the extension-point sections).
- Drop the leaked chat prose ("Why this should fix it…") that ended up in the
  current HN system prompt.
- Deliver the **launch-visibility** realm layer + the 5 channel elementals'
  extensions as the reference implementation and validation case.

### WS5 — De-duplicate across layers
- Once the operating discipline lives in the realm layer, remove it from each
  elemental's extension so it isn't injected twice (the §7 cross-layer de-dup
  win). Composer already blocks override attempts on immutable sections and
  reports them as `security_violations` — surface those in logs during
  migration to catch elementals that still try to restate discipline.

## Data model changes
- **realms:** add `prompt_layer text` (or a `configuration.promptLayer` jsonb
  field — decide in Open items). Migration `NNN_realm_prompt_layer.sql`.
- **agents:** none — reuse the existing `prompt_config` jsonb (`baseTemplate`,
  `agentExtension`, `disableRealmPrompt` already defined and UI-wired).
- **Frontend types/payloads:** add the realm prompt-layer field to `Realm`,
  `CreateRealmRequest`, and the update path.

## Layer semantics (as reconciled)
| Layer | Source | Holds |
|---|---|---|
| 1 Global base | file `prompts/base/global.md` | system-wide baseline (unchanged) |
| 2 Agent-type | file `prompts/agent-types/*.md` | left as-is; **operating discipline stays realm-only** for now (§5.5) |
| 3 Realm context | **NEW: DB via `resolveRealmLayer`** | realm operating discipline (`immutable`) + scaffold (`extension_points`) |
| 4 Agent extension | `promptConfig.agentExtension` | elemental specialization |
| opt-out | `disableRealmPrompt` / `baseTemplate:'minimal'` | skip Layer 3 (now functional) |

## Sequencing (PRs)
1. **PR1 — WS1:** activate composition on the coordination path + session-scoped
   realm. Validate end-to-end with a *file-based* realm prompt (no DB work yet).
   Unblocks everything and is independently testable.
2. **PR2 — WS2:** realm layer DB-backed + realm prompt editor UI.
3. **PR3 — WS3 + WS4 + WS5:** engage composition for the real agents, migrate the
   launch-visibility realm + elementals, de-dup.

## Open items to confirm during implementation
1. **Realm storage:** dedicated `prompt_layer` column vs `configuration` jsonb
   field. (Lean: dedicated column — it's large Markdown, queried/edited on its
   own, mirrors `agents.prompt_config`.)
2. **Existing-agent activation:** default-on `promptConfig` in `createAgent` +
   backfill, vs opt-in. (Risk: flipping composition on for agents that depend on
   a legacy `systemPrompt`.)
3. **Agent-type layer (Layer 2):** leave file-based for now; revisit only if a
   system-wide operating protocol is later factored out of realms (§5.5).
4. **Legacy path:** keep as the fallback for agents without `promptConfig` — do
   not remove in Phase 1.

## Verification
- **Unit:** `composePrompt` with a realm layer (immutable `## Operating
  discipline`) + an agent extension that both fills an extension point and
  *attempts* to override the immutable section → final prompt contains the
  discipline once, the override is blocked and reported in `security_violations`,
  and the specialization is present.
- **Integration:** run a coordination session; confirm (from logs) the elemental
  system prompt shows composed layers with the **session-scoped** realm, and that
  delegation still succeeds through the governed transport.
- **Regression:** an agent with no `promptConfig` still uses the legacy path
  unchanged.
