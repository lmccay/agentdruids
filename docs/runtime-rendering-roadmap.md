# Runtime session rendering — roadmap

**Status:** Draft
**Last updated:** 2026-05-21
**Owner:** maintainers

## Summary

Druids will emit **structured session events** as a first-class output of the core agent infrastructure. A separate translation layer — provisionally named `druids-a2ui` — will subscribe to those events and render them via Google's [A2UI](https://github.com/google/a2ui) protocol so that any A2UI-compatible host can show live, interactive visualizations of in-flight coordination sessions.

Consumers include:

- The existing Druids management console at port 3004 (new "Live Session" view in the Coordination tab)
- A Goose plugin / extension (Goose users drive Druids coordination from inside Goose, render results in Goose)
- Claude Code or any other MCP-aware client
- Third-party A2UI hosts

The session-event stream is the *foundation*; A2UI is the *first renderer*; the bridge service is the *factoring* that keeps Druids' core honest and the rendering layer swappable.

## Why now

The existing management console at port 3004 surfaces system counts (total agents, active realms, completed scenarios) and triggers (Start Coordination, Execute Scenario). It does not surface **what is happening inside a running session.** Operators have no way to see, in real time, which agents are doing what, which messages are passing between them, which knowledge namespaces are being read or written, or how the task graph is unfolding.

That gap is increasingly load-bearing:

1. **Demos and research artifacts.** Druids' interesting properties — constitutional session isolation, the realm/elemental/druid layering, namespace-based knowledge access — are *invisible* until something can render them. Research-funded projects that can't be seen tend not to get cited or adopted.

2. **Goose integration.** The natural integration path is: Goose user triggers a Druids coordination from inside Goose → live session view renders inside Goose → user never leaves. That requires Druids to *emit* a session feed that Goose can render, regardless of what Druids' own UI does.

3. **Multi-client by construction.** If session rendering is a separable layer that any MCP-aware client can drive, Druids stops being "a UI plus an MCP server" and becomes "an agent service whose runtime is observable from any compliant client." That's a stronger architectural claim — and the right one for a service-shaped agent platform.

4. **Lesson from prior art.** OpenClaw (github.com/openclaw/openclaw) initially built A2UI-based UI ("Canvas") directly inside their core, then refactored it out into `extensions/canvas` after determining that rendering belongs in a separable layer. Their own postmortem (`docs/refactor/canvas.md`) reads as a cautionary tale: "Canvas is low-use and experimental. Treat it as a bundled plugin, not a core feature." Druids can start factored and skip the refactor tax.

## Architecture

```
┌─────────────────────────────────────────┐
│         Druids core                     │
│  - MCP server                           │
│  - Agent fleet, realms, sessions        │
│  - Worldtree                            │
│  - Emits structured session events ◄────┼── new responsibility, narrow
└─────────────────────┬───────────────────┘
                      │ session events (over MCP notifications)
                      ▼
┌─────────────────────────────────────────┐
│  druids-a2ui (separate bridge service)  │
│  - Subscribes to Druids' event stream   │
│  - Translates events to A2UI components │
│  - Serves A2UI to subscribed hosts      │
└───┬─────────────────┬───────────────┬───┘
    │                 │               │
    ▼                 ▼               ▼
┌─────────┐      ┌─────────┐    ┌────────────┐
│ Druids  │      │ Goose   │    │ Other A2UI │
│ console │      │ plugin  │    │ hosts (CC, │
│ :3004   │      │         │    │ third-     │
│ (new    │      │         │    │ party)     │
│ Live    │      │         │    │            │
│ Session │      │         │    │            │
│ view)   │      │         │    │            │
└─────────┘      └─────────┘    └────────────┘
```

### Responsibility split

**Druids core owns:**

- The session-event taxonomy (TypeScript types for each event kind)
- Emitting events at the right points in coordination flow (`CoordinationService`, `SessionAgentManager`, `TaskQueueManager`, `SessionContentManager`)
- Exposing events to subscribers (initially via MCP notifications on existing session resources; potentially via a dedicated SSE/WebSocket channel later if MCP notifications prove inadequate)
- The session-isolation guarantees from the constitutional architecture continue to apply unchanged — events are scoped to a session and are only emitted to subscribers authorized for that session

**`druids-a2ui` bridge owns:**

- Subscribing to one or more Druids instances
- Mapping session events to A2UI component trees
- Serving A2UI to hosts that want to render
- Keeping the rendering protocol contained — Druids must never depend on A2UI types

**Hosts (console / Goose / others) own:**

- Initiating the A2UI rendering session against the bridge
- Presenting the rendered components to the user
- Forwarding user interactions back to the bridge (and onward to Druids) as the A2UI spec defines

### Why a separate service rather than a plugin framework

OpenClaw built a plugin framework because they have many separable surfaces (Canvas, channels, skills). Druids today has one rendering surface, the A2UI bridge. **A separate service achieves the architectural separation without the upfront cost of a plugin framework.** If Druids later acquires multiple separable surfaces (alternative renderers, audit feeds, observability exports), revisit the plugin-framework question then — guided by at least two real consumers, never speculative.

## Event taxonomy (initial draft)

The exact taxonomy emerges from building the bridge; this is the starting set, deliberately small. Events are namespaced by lifecycle stage.

### Session lifecycle

- `session.created` — session id, coordinator, participants, scenario prompt, realms in scope, timeout
- `session.started` — first task picked up
- `session.completed` — final result available
- `session.failed` — terminal failure with reason
- `session.cancelled` — operator-initiated cancellation

### Agent lifecycle within a session

- `session.agent.joined` — agent assigned to session
- `session.agent.left` — agent finished participation
- `session.agent.state.changed` — status transition (idle → working → blocked → done)

### Task lifecycle

- `session.task.queued` — task added to queue
- `session.task.started` — task picked up by agent
- `session.task.completed` — task finished, includes result summary
- `session.task.failed` — task errored
- `session.task.dependency.satisfied` — blocking dependency resolved

### Communication

- `session.message.sent` — agent-to-agent or agent-to-coordinator message
- `session.tool.invoked` — agent called a tool
- `session.tool.completed` — tool returned

### Knowledge

- `session.knowledge.read` — namespace + path accessed (subject to access control)
- `session.knowledge.written` — namespace + path written
- `session.knowledge.namespace.created` — new namespace materialized inside the session

### Coordination

- `session.coordinator.decision` — coordinator made a routing or scheduling decision
- `session.coordinator.intervention` — coordinator interrupted or redirected agent work

Each event carries the minimum identifying fields plus a payload appropriate to the event kind. Payloads are bounded — large outputs (e.g., agent message bodies, tool results) are referenced by id and fetched separately, never inlined into the event stream.

## A2UI components (initial draft)

What the bridge renders, mapping from the event taxonomy. Subject to iteration once the bridge is built.

- **Session header** — id, participants, status, elapsed time, realms in scope
- **Agent cards** — one per participant; current task, recent actions, accessible namespaces, status indicator
- **Task timeline / swimlane** — visual flow of queued → in-flight → completed, grouped by agent
- **Message thread** — chronological agent-to-agent communication
- **Tool invocation log** — what tools were called, with arguments and result references
- **Worldtree namespace browser** — namespaces touched by this session, with permission-aware read/write indicators and a live diff view
- **Coordinator panel** — routing decisions, interventions, current scheduling state

## Phasing

Each phase produces a demonstrable artifact. Phases are sequential but small enough to revisit between them.

### Phase 1 — Foundations: session event stream

**Goal:** Druids emits structured session events that an external subscriber can consume end-to-end.

**Scope:**

- Define event types in `src/models/SessionEvent.ts` (or similar). One discriminated union, narrow.
- Emit events from `CoordinationService`, `SessionAgentManager`, `TaskQueueManager`, `SessionContentManager` at the lifecycle points named above. Existing logging points are the natural attachment sites.
- Expose the stream via MCP notifications on session resources. Document the wire format.
- Write a minimal contract test (`tests/contract/sessionEvents.test.ts`) that drives a real session and asserts the expected event sequence appears on the MCP notification channel.
- Documentation: a new `docs/session-events.md` reference doc listing every event type, payload shape, and emission point.

**Out of scope for Phase 1:** any rendering layer, any change to the existing console, any new UI.

**Done when:** an MCP client (curl scripts are sufficient) can subscribe and see events as a session runs.

### Phase 2 — Bridge MVP: `druids-a2ui`

**Goal:** a separate service that consumes the event stream and emits A2UI for at least one component (probably the Session header + Agent cards) end-to-end.

**Scope:**

- Decide repo placement: separate repository under `open-tempest-labs/` or a separate `docker-compose` service alongside the existing Druids stack. Default recommendation: separate repository, because the OpenClaw lesson is about *boundary* and a separate repo enforces it.
- Build the subscriber half: connect to Druids' MCP, subscribe to session events, maintain an in-memory model of session state per subscription.
- Build the emitter half: translate that model into A2UI component trees. Reuse OpenClaw's `extensions/canvas/src/host/a2ui.ts` as a reference for protocol handling (not a code copy — different architecture — but a reference for *what* the protocol expects).
- Deliver one demo: a coordination session that renders end-to-end to an A2UI host, showing at minimum the session header and agent cards updating live.

**Done when:** a manually-triggered Druids coordination session shows a working A2UI render in *some* A2UI host (host choice deferred — could be a standalone test host, the existing console, or a Goose pre-integration shim).

### Phase 3 — Existing console integration

**Goal:** the React management console at port 3004 gains a "Live Session" view in the Coordination tab that renders A2UI components emitted by the bridge.

**Scope:**

- Add A2UI host capability to the existing React frontend. Hosting A2UI is a real piece of work; this phase exists to size and ship it.
- Wire the Coordination tab's per-session detail page to the `druids-a2ui` bridge.
- Validate the bridge's surface against real consumer requirements — what's missing, what's overweight, what doesn't render well.

**Done when:** clicking on a running session in the Coordination tab shows live A2UI-rendered progress.

### Phase 4 — Goose plugin

**Goal:** Goose users can kick off Druids coordination from inside Goose and see the live session view in Goose, via the same `druids-a2ui` bridge.

**Scope:** depends on Goose's plugin and A2UI integration surfaces at the time. Likely involves a Goose extension that exposes Druids tools through Goose, plus A2UI hosting in Goose's renderer.

**Done when:** a Goose user can run `goose use druids` (or equivalent) and see a Druids coordination session render in Goose end-to-end.

This phase is the load-bearing grant demo and should be sized accordingly.

### Phase 5 — Iterate the event taxonomy

**Goal:** revise the event taxonomy and component set based on what Phases 2–4 surfaced as missing or wrong.

This phase is open-ended by design. The right taxonomy is the one that emerges from building real renderers, not the one written cold in Phase 1.

## Non-goals

- **Not a redesign of the management console.** The Live Session view is one new view in the existing IA. The rest of the console stays as it is.
- **Not a Druids plugin framework.** A separate service is sufficient until a second separable surface justifies the abstraction.
- **Not a long-running autonomous architecture.** Sessions remain bounded. The case for long-running is a separate roadmap question with its own use cases. (See discussion: rendering bounded sessions is the right scope to build first; long-running can layer on once it exists.)
- **Not a commitment to A2UI as the only rendering protocol.** The session event stream is rendering-protocol-agnostic. A2UI is the first renderer because Goose is the first ecosystem we're integrating with. A TUI renderer, an OpenTelemetry exporter, or a different UI protocol could consume the same event stream later.
- **Not a replacement for any constitutional invariant.** Session isolation, the protected files in [CLAUDE.md](../CLAUDE.md), and the MCP compliance constitution in [docs/MCP_COMPLIANCE_CONSTITUTION.md](MCP_COMPLIANCE_CONSTITUTION.md) all continue to apply. Event emission must preserve session isolation — events from one session must not leak into subscribers authorized only for others.

## Open questions

- **Repo placement of the bridge.** Separate repository (cleaner boundary, enforces independence, OpenClaw's lesson applied) vs. separate docker-compose service in this repo (easier coordination, faster iteration). Decision should be made by start of Phase 2.
- **Event transport.** MCP notifications are the MVP choice. If throughput, latency, or fanout become problems — particularly for high-frequency events like `session.message.sent` — introduce a dedicated SSE or WebSocket channel. Don't predict; measure first.
- **Event payload bounds.** What goes inline in an event vs. what gets referenced by id and fetched separately? Default rule: anything that could exceed ~1 KB gets a reference. Tune from real traffic.
- **Subscription authorization.** Who can subscribe to which sessions' events? Existing access control on the coordination session is the natural model, but the subscription surface needs explicit treatment.
- **A2UI version stability.** A2UI is young. Pin to a specific version, document the version explicitly, plan a deprecation policy when the protocol evolves.
- **Replay vs. live-only.** Should the bridge support replaying a completed session for retrospective rendering, or is live-only sufficient for the first cut? Live-only is the simpler MVP; replay can come if the demand is real.
- **Multi-tenant rendering.** When multiple sessions are in flight, can hosts subscribe to a feed of all sessions, or only to individual sessions? Start with per-session subscription; consider aggregate feeds in Phase 5+.

## References and prior art

- **OpenClaw Canvas refactor** ([github.com/openclaw/openclaw](https://github.com/openclaw/openclaw), `docs/refactor/canvas.md`) — the design rationale OpenClaw wrote down when refactoring their A2UI rendering out of core into a bundled plugin. Read this before starting Phase 2.
- **OpenClaw A2UI implementation** — `extensions/canvas/src/host/a2ui.ts`, `extensions/canvas/src/a2ui-jsonl.ts`, `extensions/canvas/src/host/a2ui-shared.ts`, `extensions/canvas/openclaw.plugin.json`. Useful as protocol-handling reference. Code is MIT-licensed but the architecture differs enough that direct adoption is not the right move.
- **A2UI specification** — [github.com/google/a2ui](https://github.com/google/a2ui). The canonical reference for component semantics and the wire format.
- **CLAUDE.md "Concurrent Session Architecture (CONSTITUTIONAL)"** — the session isolation guarantees this work must preserve.
- **[docs/MCP_COMPLIANCE_CONSTITUTION.md](MCP_COMPLIANCE_CONSTITUTION.md)** — the MCP compliance rules the event-emission surface must satisfy.
- **[docs/goose-integration-roadmap.md](goose-integration-roadmap.md)** — prior thinking about Goose integration that Phase 4 builds on.
- **Existing frontend** — `frontend/src/` — integration target for Phase 3.

## Revision history

- **2026-05-21** — Initial draft. Established the separate-bridge architecture, event taxonomy starting set, phased delivery plan, and references to OpenClaw prior art.
