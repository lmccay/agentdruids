# Identity & Access Control — the foundation layer

**Status:** Design
**Builds on / is the foundation for:** `machine-identity-solution.md`, `mcp-oauth-integration.md`, `third-party-credentials-architecture.md` (those describe the *outbound* tier — agents using per-user service tokens at GitHub/Slack/etc.; **all three presuppose a `userContext.userId` that does not yet exist**). This doc defines that missing foundation.
**Scope:** Who a request is, what they may do, and the boundary between *managing the system* and *running it*. Establishes human authentication, the user/role model, the **control-plane vs. data-plane** split, and how a user's reach is *derived* from the druids they may assume. Outbound credential delegation (the existing three docs) sits on top of this and is out of scope here except where it connects.

## Why now

Today there is **no identity at all**: the REST API is unauthenticated, the MCP `Mcp-Session-Id` is a routing token (not a credential), and anyone who can reach the port can create agents, define realms, or write the `global` knowledge scope. Every "admin-only" feature we have deferred — operator-only ingest into `global`, the Ingest/operator console, SSRF allowlist management, dismissing knowledge gaps — is blocked on the same missing thing: **a way to tell an operator from everyone else, and a user from the druids they drive.**

## The organizing idea: two planes

Authorization splits cleanly along the line between *defining the system* and *using it*. This is the load-bearing decision in this design.

| | **Control plane** | **Data plane** |
|---|---|---|
| What | Define and govern the system | Run coordination sessions |
| Operations | Create/modify/delete agents (druids, elementals), realms, models; manage SSRF allowlists; ingest into `global`; resolve/dismiss knowledge gaps; assign users their assumable druids | Start a coordination session; assume a druid; let it travel its realms and call its tools; read scoped WorldTree |
| Who | **admin** role | **user** role |
| Authorization question | "Is this caller an admin?" | "May this user assume *this* druid?" — everything else is *derived* |

The two planes map 1:1 onto roles, and that is deliberate: the control plane is rare, high-trust, and coarse (a handful of admins); the data plane is common, per-user, and fine-grained but **derives its fine grain from data that already exists** (each druid's `realmAccess` / `resourceAccess`).

## Identity model

```
User ──(may assume)──> Druid ──(realmAccess)──> Realms
                          │
                          └──(resourceAccess + realm tooling)──> Tools / external services
```

- **User** — a human principal (authenticated via OIDC; see below). Has one or more **roles**. Owns nothing in the data plane directly; reaches it only through assumable druids.
- **Role** — at minimum `admin` and `user` for Phase 1; the persisted `Role`/`Permission` types already sketched in `src/models/AccessControl.ts` are the extension path to finer RBAC later. Roles are additive.
- **Assumable-druids relation** — an explicit grant: user U *may assume* druid D. This is the **only** new per-user authorization decision in the data plane.
- **Derived realm & tool access** — a user does **not** get realms or tools granted directly. When U assumes D, U's reach for that session **is** D's existing `realmAccess` (which realms D may travel) and `resourceAccess` + realm tooling (which tools D may call). Union across the druids U may assume = U's total reachable surface.

**Why derivation matters:** we do not re-plumb realm/tool enforcement per user. We add *one* gate ("is D in U's assumable set?") and let the agent-scoped access model that already exists in `Agent.ts` do the rest. It also means admins govern reach in one place — by shaping druids — rather than maintaining a parallel per-user grant matrix.

### "Assuming a druid" is delegation

When a user assumes a druid, they are temporarily acting *as* that druid — the session runs with the druid's identity and access, attributed to the user. Phase 1 does this **in-process** (the session carries `{ userId, assumedDruidId }`). The same concept scales out later to **OAuth 2.0 Token Exchange (RFC 8693)**: assuming a druid across a federation boundary, or letting a druid call an external MCP tool, becomes *minting a scoped, exchanged token that represents "user U acting as druid D."* The in-process assume and the cross-deployment exchange are the same idea at two scales — Phase 1 should keep the session-context shape compatible with that future so we don't re-model it.

## Authentication

**Humans authenticate via OIDC** (external IdP / OAuth). Rationale (per the chosen direction): it avoids password storage, aligns with how the outbound-credential docs already assume an enterprise IdP, and — critically — puts human auth on the same OAuth substrate as the token-exchange/A2A/MCP delegation future, so human SSO and agent delegation share one trust fabric rather than two.

- **Humans:** OIDC Authorization Code + PKCE → Druids session (the React console logs in; the session establishes `userId`).
- **Programmatic / MCP callers:** bearer access tokens validated as an OAuth resource server. MCP's own authorization spec is OAuth-based, so the same IdP can issue tokens that the MCP endpoint accepts — closing the current gap where `Mcp-Session-Id` carries no identity.
- **Agent → agent / agent → external tool (future):** RFC 8693 token exchange, as above.

What this layer must add that doesn't exist today: an authentication middleware on the Express app and the MCP endpoint that resolves a verified `userId` + roles onto the request, replacing today's open access and the unvalidated `x-requester-id` header.

## How it connects to what exists

- **Agent `realmAccess` / `resourceAccess`** (`src/models/Agent.ts`): stored today but **not enforced** at the session layer. This design makes them load-bearing — they become the *source* of a user's derived reach. Phase 1 must therefore turn on enforcement during session execution, not just add the assume-gate.
- **WorldTree scopes** (`worldtree_item_scopes`): the `global` scope becomes a control-plane write (admin only); `realm`/`agent`/`session` scopes continue to be governed by the derived realm reach. This directly delivers the deferred operator-only-ingest rule.
- **`created_by` / `last_modified_by`** audit columns: currently unvalidated strings; become the attribution sink for the authenticated `userId`, giving us the audit chain (User → Druid → Elemental → action) the outbound docs assume.
- **`AccessControl.ts` types** (`Permission`, `Role`, `AccessControlEntry`, `AuditEntry`): the persistence target when Phase 1's two roles grow into finer RBAC.

## Phasing

**Phase 1 — foundation + the control/data split (the thin slice):**
1. `users` + `roles` + `user_assumable_druids` tables; OIDC login establishing a session `userId` + roles.
2. Auth middleware on REST + MCP resolving `{ userId, roles }`; reject unauthenticated mutating calls.
3. **Control-plane gate:** admin-only on agent/realm/model definition, SSRF allowlist, `global`-scope ingest, knowledge-gap resolution.
4. **Data-plane gate:** a session may only assume a druid in the caller's assumable set; **enforce the assumed druid's `realmAccess`/`resourceAccess`** for the session's realm travel and tool calls (turning on dormant enforcement).
5. Attribution: stamp `userId` (and assumed druid) onto audit columns and coordination records.

This unblocks every deferred admin-only feature without building full RBAC or the outbound token vault.

**Phase 2 — finer RBAC & console:** promote the two roles into `AccessControl.ts`-backed roles/permissions; operator console for managing users ↔ assumable druids; richer per-operation permissions.

**Phase 3 — outbound credential delegation:** the existing three docs — per-user service tokens, the OAuth-aware MCP proxy, PAT fallback. Now well-defined because `userId` and the delegation chain finally exist.

**Phase 4 — federation / token exchange:** RFC 8693 for cross-deployment "assume" and external-tool delegation; A2A. The Phase-1 session-context shape (`user acting as druid`) is the seed.

## Open questions

- **IdP choice & dev story** — which OIDC provider for development (a local/dev IdP in Docker) vs. production; do we ship a default?
- **Assume granularity** — may a user assume *several* druids within one session (union of reach), or one druid per session?
- **Coordinator vs. assumed druid** — a coordination session has a coordinator that delegates to druids. Does the user assume the *coordinator*, the *druids*, or both? (Likely: user assumes druids; the coordinator is an admin-defined orchestrator constrained to the user's assumable set.)
- **Service-to-service today** — until token exchange exists, how do the MCP gateway and internal services authenticate to the main API? (A bootstrap service credential, scoped to control-plane-exempt internal calls.)
- **Break-glass / first admin** — how is the initial admin established on a fresh deployment (env-seeded admin subject vs. first-login claim)?
