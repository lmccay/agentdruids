# Buzz Integration — Design

**Status:** Draft / proposal
**Related:** [realm-foundational-context-and-elemental-templates.md](realm-foundational-context-and-elemental-templates.md), [realm-knowledge-taxonomy-modeling-ux.md](realm-knowledge-taxonomy-modeling-ux.md), [mcp-server-registry-and-gateway.md](mcp-server-registry-and-gateway.md), [../identity-and-access-control.md](../identity-and-access-control.md), [../typed-session-publishing-design.md](../typed-session-publishing-design.md), [../goose-integration-architecture.md](../goose-integration-architecture.md)

## 1. Purpose & scope

Buzz is an open-source, agent-native collaboration product: chat-shaped
channels in which humans and agents are both first-class members, built on
Nostr for identity and transport, with agents supplied by locally installed
agent harnesses (its own bundled harness, or Claude Code / Codex / Goose via
their respective harness adapters).

This document identifies the single highest-value Druids↔Buzz integration
point, specifies a staged implementation path, and names the cross-cutting
design problems that must be solved for the integration to be usable in
business settings rather than only in developer demos.

Out of scope: Buzz's internal event schema (undocumented and changing
frequently — see §8), and any change to the coordination session isolation
model.

## 2. Current state

What Druids already has that this integration can stand on:

- **MCP server** (`src/mcp/SimpleMCPServer.ts`) exposing ~40 tools covering
  coordination, realms, agents, scenarios, and async results, with OAuth
  bearer-token ingress and RFC 9728 protected-resource metadata.
- **REST coordination API** (`src/api/coordinators.ts`) with
  `requireAssumableAgent` gating on the `coordinate` / `orchestrate` paths.
- **Async result system** (`ask_agent_async`, `check_async_ready`,
  `get_async_result`) for work that outlives a request.
- **Session publication pipeline** (`SessionPublicationService` plus the
  transcript / summary / report / dataset publishers) — the outbound half of
  turning session work into durable artifacts.
- **Identity layer** — OIDC, groups, user-scoped delegation, MCP OAuth ingress.

What does not exist today:

- No ACP implementation, no Nostr client, no A2A implementation.
- `Agent.networkInfo` is declared on the model but referenced nowhere else; the
  "external agent" concept is a field, not a feature.
- Coordination emits no push events — no webhooks, no event emitter. Progress
  is observable only by polling.

## 3. Protocol landscape — and why A2A is not the answer

A2A is the intuitive first guess for "let Druids talk to another multi-agent
system," and it is the wrong one for Buzz. Buzz does not speak A2A. Three other
protocols define its surface:

| Protocol | Role in Buzz | Druids status |
|---|---|---|
| **Nostr** | Identity (keypairs), channels, message transport | Not implemented |
| **ACP** | How Buzz launches and drives a local agent runtime | Not implemented |
| **MCP** | How an agent running under Buzz reaches external tools | Implemented |

ACP is the contract that matters for participation: an agent becomes available
in Buzz by being an ACP harness discoverable on `PATH`. MCP is the contract
that matters for capability, and Druids already satisfies it.

A2A remains relevant to the broader federation direction (cross-deployment
research and realm federation), but it should be justified on those grounds. It
buys nothing here.

## 4. The structural mapping

Buzz and Druids are complementary in an unusually direct way. Buzz's stated
limitations each correspond to something Druids already models:

| Buzz limitation | Druids answer |
|---|---|
| A shared agent works only while its owner's machine is online | Server-side hosted agents |
| Granting agent access grants arbitrary access to the owner's machine | `PolicyEngine`, `resourceAccess` allowlists, OIDC identity |
| Agent activity traces are private and cannot be shared | Session transcripts and the publication pipeline |
| Channels are short-lived by design; context is discarded with them | Realms — durable foundational context and reference corpus |

The core concepts line up nearly one-to-one:

- **Buzz channel** ≈ **coordination session** — ephemeral, task-scoped, a
  convened team.
- **Buzz channel template** ≈ **realm** — default context plus a default team.
- **Buzz agent member** ≈ **elemental** — a domain specialist invoked by name.

Buzz supplies the real-time, multi-human surface that Druids lacks and would be
expensive to build. Druids supplies durability, governance, and memory, which
Buzz's architecture cannot provide on its own.

## 5. The integration point

**Druids as a Buzz agent runtime: a realm-backed participant that can be
invoked in a channel, whose outcomes are promoted back into realm knowledge.**

The valuable direction is Buzz channels drawing on Druids — as their agent
supply and as their memory — not Druids calling Buzz as a tool.

The loop this creates:

1. A channel is convened for a specific piece of work, with humans and a realm
   agent as members.
2. The realm agent participates with its foundational context and corpus
   already loaded — it does not need to be briefed.
3. Work happens in the open, with humans and other agents reviewing.
4. The channel is archived. The **outcome persists** as promoted realm
   knowledge.
5. The next channel in that domain starts from a better baseline.

Step 4 is the differentiator. Buzz alone discards everything at archive time;
short-lived channels are an explicit best practice there. A realm turns that
throughput into accumulated capability.

## 6. Staged implementation

### Phase 0 — Validate with zero Druids code

Create a Buzz agent using Goose as its runtime and configure the Druids MCP
server (`/mcp`) as an extension. OAuth ingress already ships, so this is
configuration only.

Result: a Buzz-invokable agent that can start coordination sessions, query
WorldTree, and travel realms. Purpose: confirm the interaction model feels
right before building anything.

**Effort:** ~1 day. **New code:** none.

### Phase 1 — `druids-acp`, the real integration

A thin ACP harness — stdio JSON-RPC implementing `session/new`,
`session/prompt`, and streaming session updates — that proxies to a Druids
deployment over the existing REST and MCP surfaces. Distributed as an
npx-installable package so Buzz's harness installer can find it on `PATH`.

This makes Druids a selectable runtime in Buzz's agent creation flow alongside
the other supported harnesses: first-class placement for modest effort, built
against a documented and stable contract rather than against Buzz internals.

The harness is deliberately thin. It holds no coordination state; session
isolation stays entirely inside Druids, per the constitutional architecture.

**Effort:** ~1–2 weeks. **New code:** new package; no changes to protected
session-management files.

### Phase 2 — Channel → realm promotion

Ingest a Buzz channel transcript as a candidate knowledge artifact and route it
through the promotion review flow. `SessionPublicationService` and the
transcript publisher already cover most of the machinery; what is new is the
inbound path and the human review gate.

This is the phase that produces the compounding effect, and the one that
depends on the realm model — it is not reproducible by a generic harness.

**Effort:** ~2–3 weeks, dependent on the knowledge taxonomy work landing first.

### Phase 3 — Nostr-native participation

Druids holds its own keypair and connects to relays directly, so a realm agent
is genuinely always-on and invocable without any individual's machine being
awake. Highest value and highest risk: it requires working against Buzz's
undocumented, rapidly changing event schema.

**Effort:** unknown until the protocol stabilizes. **Do not start here.**

## 7. Cross-cutting design problems

### 7.1 Turn shape

Buzz turns are chat-latency; Druids coordination runs for minutes across
multiple agents. The async triad (`ask_agent_async` / `check_async_ready` /
`get_async_result`) has the wrong ergonomics to expose directly into a chat
thread — it makes the agent look hung.

ACP's streaming session updates are the right vehicle. The harness should:

1. Acknowledge in-thread immediately, naming the session it started.
2. Stream elemental-level progress as the session advances.
3. Post the synthesized result as the final turn.

This requires no push events from Druids — the harness can poll internally and
present the result as a stream. Native coordination events would be a
worthwhile later optimization, not a prerequisite.

### 7.2 Identity mapping

A Buzz participant is a Nostr public key. For policy enforcement and
attribution to mean anything, that key must resolve to a Druids identity —
otherwise `requireAssumableAgent` has nothing to assume, and the governance
claim that justifies the whole integration collapses at the moment it is
tested.

Options, in increasing order of rigor:

1. **Harness-scoped delegation** — all channel activity is attributed to the
   identity that installed and configured the harness. Simple; correct for
   single-operator use; loses per-participant attribution.
2. **Key binding** — a Druids user record binds one or more Nostr public keys,
   established through an explicit verification step. Preserves attribution.
3. **Full federation** — Nostr keys as a first-class identity provider.
   Only worth considering alongside Phase 3.

Option 1 is the correct starting point, provided the audit trail records that
attribution is harness-scoped rather than silently implying per-user identity.
Option 2 should follow before the integration is used by more than one person
per deployment.

### 7.3 Egress sensitivity

Buzz channels are semi-public by design, and its culture biases toward working
in the open. Realm corpora will contain proprietary material. Without a control
here, no organization will place a realm agent in a Buzz channel.

Required: a per-realm and per-knowledge-item flag governing whether content may
surface in an external channel, enforced at response time rather than at
retrieval time. `PolicyEngine` and `ResourceAccessValidator` are the right
enforcement points.

With this control in place, the confidentiality story becomes a *reason* to use
a Druids agent in Buzz rather than a locally configured one, because a local
harness offers no equivalent boundary.

## 8. Risks

- **Buzz is early and changing daily.** Mitigation: build against ACP and MCP,
  which are documented and stable, and defer everything that requires Buzz
  internals to Phase 3.
- **ACP adapter surface may drift.** Mitigation: keep the harness thin, with
  all behavior in Druids proper and the adapter carrying no state.
- **Phase 2 depends on the knowledge taxonomy.** Mitigation: Phases 0 and 1
  deliver standalone value and can ship independently.
- **Confidentiality failure would be highly visible.** A realm agent leaking
  corpus material into a public channel is a trust-destroying event. §7.3 is a
  prerequisite for any non-experimental use, not an enhancement.

## 9. Recommendation

Run Phase 0 immediately — it costs a day and tests the central assumption.
Commit to Phase 1 only if Phase 0 shows that realm-backed agents feel
materially different in a channel from a locally configured harness. Treat
Phase 2 as the actual strategic deliverable. Revisit Phase 3 once Buzz's
protocol settles.

## 10. Open questions

1. Does Buzz's harness contract track ACP closely enough that a standard
   implementation is discovered without Buzz-specific accommodations?
2. Can a single harness expose multiple realm agents as distinct Buzz members,
   or does each require its own registration?
3. Should a Buzz channel map to one long-lived coordination session, or should
   each invocation open a fresh session? The former preserves conversational
   context; the latter fits the existing isolation model with no changes.
4. What is the minimum viable promotion review UX for Phase 2 — does an
   operator approve a distilled summary, or the raw transcript?
