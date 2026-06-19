# Phase A: Conversational WorldTree Discovery via MCP

**Status:** Design
**Builds on:** `worldtree-vision.md`, migrations 006 + 007
**Scope:** Read-only MCP surface; no new ML; no embeddings; designed forward-compatible with success-metric attachment

## Goals

1. Any MCP-speaking client can browse the WorldTree interactively.
2. All queries served from existing tables (`coordination_sessions`, `session_contributions`, `session_publications`, `publishing_modes`). No background jobs, no new services beyond a thin query layer.
3. The data model leaves space for outcome metrics to be attached later without reshaping anything.
4. Performance: every query returns in < 100 ms for a WorldTree of up to ~10⁴ sessions / ~10⁵ contributions. Indexing is already adequate.

## Where the surface lives

Two options were considered:

- **A.** Extend the existing `druids-mcp-server` (`SimpleMCPServer.ts`) with WorldTree tools alongside coordination tools.
- **B.** Stand up a separate `druids-worldtree-mcp` server on its own port.

**Decision: A.** One MCP endpoint for external clients is simpler to configure and document. WorldTree tools are a natural complement to coordination tools — a client asking "what should I plan for this campaign?" can pull historical context and then trigger a new session in one connection. Separation can come later if scaling demands it.

## Surface inventory

### Resources

Resources are read-only URIs. Each returns JSON. The MCP `resources/list` and `resources/read` methods are the entry points.

| URI | Returns |
|---|---|
| `worldtree://sessions` | Paginated index of all sessions (id, status, started_at, coordinator, realm) |
| `worldtree://sessions/{sessionId}` | Full session record incl. all contributions and publications |
| `worldtree://sessions/{sessionId}/contributions` | Just the contribution rows for that session |
| `worldtree://sessions/{sessionId}/publications` | Just the publication rows |
| `worldtree://sessions/{sessionId}/publications/{mode}` | The rendered artifact content for a specific mode |
| `worldtree://agents/{agentId}/contributions` | All contributions an agent has made, across sessions (paginated) |
| `worldtree://agents/{agentId}/summary` | Aggregate stats for that agent (count, total content, avg duration, distinct sessions) |
| `worldtree://realms/{realmId}/sessions` | All sessions that ran in a realm |
| `worldtree://modes` | The `publishing_modes` catalog |

These sit alongside existing WorldTree URIs (`worldtree://public/async_results/...`, `worldtree://public/creative-sessions/...`) — different second segments, no conflict.

Resources support standard pagination params (`?limit=`, `?offset=`) and a `since`/`until` ISO-8601 filter where time-bounded.

### Tools

Tools are callable, take JSON arguments, return JSON results. These are the conversational query surface — what an MCP client would use to answer open-ended questions.

| Tool | Arguments | Returns |
|---|---|---|
| `list_sessions` | `{ status?, coordinatorId?, realmId?, since?, until?, limit?, offset? }` | array of session summaries |
| `get_session` | `{ sessionId, includeContributions?: bool, includePublications?: bool }` | full session record |
| `find_sessions_by_prompt` | `{ text, limit? }` | sessions whose prompt matches (ILIKE) the text |
| `search_contributions` | `{ text?, agentId?, agentRole?, actionType?, sessionId?, since?, until?, limit?, offset? }` | matching contribution rows |
| `aggregate_contributions` | `{ groupBy: 'agent_id' \| 'agent_role' \| 'action_type' \| 'day', filters? }` | grouped counts, total duration, total content length |
| `compare_sessions` | `{ sessionIdA, sessionIdB }` | side-by-side: prompt diff, contribution counts per role, plan-shape diff |
| `agent_activity` | `{ agentId, since?, until? }` | timeline of an agent's contributions with summary stats |

All tools return `{ content: [{ type: 'text', text: JSON.stringify(data) }] }` per the existing MCP convention (see CLAUDE.md and `SimpleMCPServer.ts`).

### Prompts

MCP "prompts" are pre-canned conversational starters a client can offer the user without them having to compose tool calls.

- **`recap_agent`** — args: `{ agentId, days? }`. Expands to a natural-language query that summarizes that agent's recent work using `agent_activity` and `search_contributions`.
- **`compare_two_sessions`** — args: `{ sessionIdA, sessionIdB }`. Expands to a structured comparison using `compare_sessions`.
- **`find_similar_work`** — args: `{ prompt }`. Expands to a text-match search using `find_sessions_by_prompt`, with instruction to summarize commonalities. (Semantic similarity is Phase B.)
- **`worldtree_health`** — no args. Expands to a summary of session counts, agent activity, mode distribution. Useful for sanity-checking the system.

Prompts are sugar — they compose existing tools. Worth shipping in Phase A because they make the MCP client immediately useful without the user needing to know the tool surface.

## File structure

New code lands in `src/mcp/worldtree/` and `src/services/`:

```
src/
├── services/
│   └── WorldTreeQueryService.ts        # All SQL; the only file that touches the WorldTree tables
├── mcp/
│   ├── SimpleMCPServer.ts              # existing — extended with WorldTree tools/resources
│   └── worldtree/
│       ├── worldtreeResources.ts       # resource URI parser + dispatcher
│       ├── worldtreeTools.ts           # tool name → handler map
│       └── worldtreePrompts.ts         # prompt templates
└── api/
    └── outcomes.ts                     # (stub; ingestion API for Phase F — see below)
```

**`WorldTreeQueryService`** owns every SQL statement. Tools and resources call into it; they don't write SQL themselves. This keeps the query surface auditable and indexable: when a query is slow, there's one file to look at.

**`worldtreeResources.ts`** parses `worldtree://...` URIs (regex + URL parsing) and dispatches to the appropriate `WorldTreeQueryService` method. Returns the standard MCP resource payload. Only the new second-segment patterns (`sessions/...`, `agents/...`, `realms/...`, `modes`) are routed here; existing `worldtree://public/...` and `worldtree://sessions/{id}/` session-isolated paths continue to be handled by `SessionContentManager`.

**`worldtreeTools.ts`** exports a map `{ toolName: handlerFn }`. Each handler validates args, calls `WorldTreeQueryService`, formats the response.

**`worldtreePrompts.ts`** holds the prompt templates as a `{ name, description, arguments[], template }` array. MCP's `prompts/list` and `prompts/get` methods serve from this.

The existing `SimpleMCPServer.ts` gets three small additions:
- Register WorldTree tool handlers in its dispatch map.
- Register WorldTree resource patterns in its resource dispatcher.
- Register WorldTree prompts in its prompt list.

No changes to the JSON-RPC framing, transport, or session-id handling.

## Sketches: the most important queries

**`list_sessions`** with filters:

```sql
SELECT session_id, status, coordinator_agent_id, realm_id,
       started_at, completed_at, participant_agent_ids
  FROM druids_core.coordination_sessions
 WHERE ($1::varchar IS NULL OR status = $1::varchar)
   AND ($2::varchar IS NULL OR coordinator_agent_id = $2::varchar)
   AND ($3::varchar IS NULL OR realm_id = $3::varchar)
   AND ($4::timestamptz IS NULL OR started_at >= $4::timestamptz)
   AND ($5::timestamptz IS NULL OR started_at <= $5::timestamptz)
 ORDER BY started_at DESC
 LIMIT $6 OFFSET $7;
```

**`search_contributions`** — leverage existing indexes:

```sql
SELECT session_id, step_number, sub_step_number, agent_id, agent_role,
       action_type, description, content, duration_ms, created_at
  FROM druids_core.session_contributions
 WHERE ($1::varchar IS NULL OR agent_id = $1::varchar)
   AND ($2::varchar IS NULL OR agent_role = $2::varchar)
   AND ($3::varchar IS NULL OR action_type = $3::varchar)
   AND ($4::varchar IS NULL OR session_id = $4::varchar)
   AND ($5::text    IS NULL OR content ILIKE '%' || $5::text || '%')
   AND ($6::timestamptz IS NULL OR created_at >= $6::timestamptz)
 ORDER BY created_at DESC
 LIMIT $7 OFFSET $8;
```

**`aggregate_contributions`** grouped by agent_role:

```sql
SELECT agent_role,
       COUNT(*) AS contribution_count,
       SUM(LENGTH(content)) AS total_content_chars,
       AVG(duration_ms) AS avg_duration_ms,
       COUNT(DISTINCT session_id) AS distinct_sessions
  FROM druids_core.session_contributions
 WHERE agent_role IS NOT NULL
 GROUP BY agent_role
 ORDER BY contribution_count DESC;
```

These three queries cover ~80% of the conversational discovery patterns. The remaining tools are variations.

## Forward-compatibility: success metrics

The need to attach external success metrics (clicks, GitHub stars, post engagement) to past sessions is real. Phase A doesn't implement this, but the schema and surface are designed so adding it is additive, not breaking.

### Schema preview (defer to Phase F, but committed-to here)

```sql
-- Sketch; not part of Phase A migration. Phase F will deliver as migration 008.
CREATE TABLE druids_core.session_outcomes (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id                  VARCHAR(255) NOT NULL
                              REFERENCES druids_core.coordination_sessions(session_id)
                              ON DELETE CASCADE,
  metric_name                 VARCHAR(128) NOT NULL,
  metric_value                NUMERIC,
  metric_unit                 VARCHAR(32),
  measured_at                 TIMESTAMP WITH TIME ZONE NOT NULL,
  observation_window_hours    INTEGER,
  source                      VARCHAR(64),
  context                     JSONB DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

Heterogeneous on purpose. `metric_name` is a free-form identifier (`github_stars`, `hn_points`, `npm_weekly_downloads`, `linkedin_impressions`, `click_through_rate`). Each measurement carries its own window and source, so the same session can have many outcome rows accumulating over time.

### Ingestion API surface (stub now, implement later)

`src/api/outcomes.ts` will eventually expose:

- `POST /api/sessions/{sessionId}/outcomes` — record a measurement
- `POST /api/outcomes/batch` — bulk import (CSV from analytics dashboards, etc.)
- Webhook handlers per source — `POST /api/outcomes/webhooks/github`, `/plausible`, etc.

In Phase A we add this file as an empty stub with a TODO comment so the file path is reserved. The MCP surface doesn't expose outcome data yet.

### Forward-compatible touches in Phase A

Three small accommodations now, so Phase F drops in cleanly:

1. **`get_session` result includes an `outcomes: []` field.** Always empty in Phase A; populated by JOIN against `session_outcomes` once that table exists. Clients that build against Phase A won't need to change.
2. **`list_sessions` accepts a `hasOutcomes?: boolean` filter argument.** Validated, ignored, and documented as "Phase F." When the data exists, the filter activates without an API change.
3. **A `worldtree_health` prompt's output schema includes an `outcomes_attached_count` field.** Zero in Phase A.

These are < 10 lines of code combined. They make the contract honest about what's coming.

## What Phase A does NOT include (explicitly)

So the scope is sharp and reviewable:

- No embeddings, no semantic search. Text matching only. (Phase B)
- No outcome ingestion API implementation. (Phase F)
- No rubric scoring or critic agents. (Phase D)
- No write operations from the MCP surface at all — it's read-only.
- No new background workers. The retention sweeper from the typed-publishing work stays; nothing else added.
- No changes to the existing coordination MCP tools. They sit alongside, untouched.

## Test plan

The WorldTree surface is testable end-to-end with curl + the existing session data:

- **Resource read smoke tests** — `resources/read` against each URI pattern with a known sessionId, verify the response schema.
- **Tool happy paths** — `tools/call` for each tool with realistic args, verify counts and field presence.
- **Pagination correctness** — multi-page `list_sessions` and `search_contributions`, verify no duplicates / no gaps.
- **Filter combinations** — `search_contributions` with multiple filters, verify AND semantics.
- **Empty-WorldTree behavior** — against an empty database, every tool returns empty arrays without errors.

Integration tests live in `tests/integration/worldtree-mcp.test.ts` (new file). Contract tests for the JSON-RPC shape live in `tests/contract/worldtree-mcp-contract.test.ts`.

## Estimated effort

- `WorldTreeQueryService` + queries: half a day.
- `worldtreeResources`, `worldtreeTools`, `worldtreePrompts`: half a day each.
- Wiring into `SimpleMCPServer`: a few hours.
- Tests (happy paths + a few edge cases): half a day.
- Forward-compat touches + outcome stub: an hour.

≈ 2.5 working days for an experienced developer. A solid Phase A delivery.

## Open questions

- **Session-isolation read boundary.** The constitution forbids cross-session mutation, but cross-session reads are exactly what conversational discovery is. Confirming the constitution allows what I'm assuming.
- **Pagination defaults.** What's a sensible `limit` default for resource reads? 50 feels right for sessions; 100 for contributions. Worth a decision before implementation.
- **Public vs. private contributions.** Today every contribution is queryable. As the WorldTree grows, do we want a mechanism for marking contributions as private/restricted at query time?
- **MCP prompt argument validation.** MCP's prompt-argument schema is light. Do we want to validate `agentId`, `sessionId` server-side before expanding the prompt template, or trust the client?

None block implementation — these are conversations to have before the build begins.
