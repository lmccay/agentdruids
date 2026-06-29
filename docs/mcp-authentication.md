# MCP Authentication — ingress identity & egress credentials

**Status:** Design
**Builds on:** `identity-and-access-control.md` (the foundation: OIDC, principal model, assume/delegation gates), `mcp-oauth-integration.md` and `machine-identity-solution.md` (earlier outbound-credential research — superseded here for the credential-model decision)
**Scope:** Authentication for the two distinct MCP surfaces — **ingress** (external MCP clients calling Druids) and **egress** (elementals calling external MCP servers) — and how the authenticated user identity flows into coordination. This is the design for "slice H" of the identity program.

## Two surfaces, two problems

The MCP layer has two independent surfaces that are often conflated. They authenticate differently and must not be designed as one thing.

```
   external client (Goose)                         elemental
        │                                               │
        ▼  INGRESS                                       ▼  EGRESS
   SimpleMCPServer :3003   ───▶  main app :3000     routeToolThroughMCPGateway (in-process)
   (OAuth resource server)      (coordination)      ───▶  external MCP server (e.g. GitHub)
```

- **Ingress** — *who is the client, and on whose behalf?* A Goose-type client calls the Druids MCP server (`SimpleMCPServer`, `:3003`). Today this is **fully open**: no credential check; `Mcp-Session-Id` is a bare in-memory UUID with no identity; and the server's `apiCall` to the main app sends **no** auth header at all. This is what slice H fixes.
- **Egress** — *how does an elemental authenticate to an external MCP server?* `AgentService.routeToolThroughMCPGateway` is a **generic, config-driven** MCP client (`config/mcp-servers.json` + per-realm bindings; `HttpMCPClient`/`SSEMCPClient`). It already authenticates with a per-server credential. GitHub is just one config row (`https://api.githubcopilot.com/mcp/`, bearer `GITHUB_TOKEN`); there is no GitHub-specific code.

**The `druids-mcp-gateway` container (`:3001`) is, today, a redundant second copy of `SimpleMCPServer`** — it does *not* perform egress; egress is in-process in `AgentService`. Promoting `:3001` to a real egress proxy is a separate, trigger-driven refactor (see *Egress*), out of scope for slice H.

## Ingress: OAuth 2.1 resource-server model

The Druids MCP server becomes an OAuth 2.1 **resource server** per the MCP Authorization spec. The client obtains a **user** access token from the deployment's IdP and presents it as `Authorization: Bearer …`; the server validates it, resolves the human principal, and binds it to the MCP session.

**It must be a *user* token, not a shared service key.** Slice H only pays off if the token carries the human's identity (`sub`) — that is what lets the existing assume/delegation rules scope per user. A single shared key would authenticate the connection but flatten identity, defeating slices D–G. Goose Desktop is per-user, so it authenticates *as the human using it*.

**Acquisition: full OAuth flow (Authorization Code + PKCE).** Goose runs the flow against the IdP, gets a short-lived, refresh-backed token bound to the user. This is the standards-correct path and deliberately doubles as the **first real test case for KnoxIDF** when it replaces Dex as the issuer.

### What the resource server must implement (ours to build)

1. **Protected Resource Metadata** (RFC 9728) at `/.well-known/oauth-protected-resource` on `:3003`, pointing clients to the authorization server; and a `WWW-Authenticate: Bearer` challenge on 401 so clients discover where to authenticate.
2. **Bearer-token validation** — verify the JWT against the IdP's `jwks_uri` (signature, `iss`, `exp`, and audience as available), then resolve `sub`/`email` → a Druids user via `IdentityService`. This is the access-token validator the app layer currently lacks (`resolvePrincipal` only accepts the session cookie and an exact-match `INTERNAL_SERVICE_TOKEN`). Build it **once as a shared capability** — the MCP server is the primary resource server, but the same validator lets the REST API accept bearer tokens too.
3. **Session binding** — attach the resolved principal to the `Mcp-Session-Id` at `initialize`; require a valid token on every call.
4. **Identity propagation inward** — the MCP server's `apiCall` gains the `INTERNAL_SERVICE_TOKEN` (not currently in its container env) **plus an asserted `userId`**. The app trusts the asserted user *only* when it arrives with the valid service token (so external callers can never spoof it). This extends the principal model: a service-authenticated call may now carry a `userId`, where today a service principal has `userId: null`.
5. **Coordination threading** — thread that `requesterId` into `CoordinationService`. The coordinate flow executes planned steps *directly* (not via the `delegate_task` tool), so slice G's tool-layer enforcement does not cover it; this is where the user-scoped delegation constraint finally fires on the **primary, MCP-driven** coordination path. CONSTITUTIONAL: thread as a parameter, never as shared service state — session isolation preserved (same discipline as slice G).
6. **Pre-registered client + metadata shim** — see *Dex findings*.

### Console (the breaking-change piece)

The React console also drives coordination over MCP (`/mcp` via nginx). Turning on required ingress auth breaks it until it sends a token. The console already has a session, so it obtains its token a different way than Goose — either mint a short-lived token from the existing session server-side, or route the console's coordination calls through the app rather than directly at `:3003`. This integration is part of slice H.

## Dex findings (probed v2.46.0) and mitigations

| MCP-spec requirement | Dex | Plan |
|---|---|---|
| Authorization Code + **PKCE (S256)** | ✅ `code_challenge_methods_supported: [S256, plain]` | use as-is |
| Refresh tokens | ✅ `offline_access` / `refresh_token` | short-lived + refresh |
| OIDC discovery | ✅ `/.well-known/openid-configuration` | primary discovery |
| **RFC 8414** AS metadata (`/.well-known/oauth-authorization-server`) | ❌ 404 | rely on OIDC-discovery fallback; serve a tiny 8414-shaped shim if a client requires it |
| **Dynamic Client Registration** (RFC 7591) | ❌ no `registration_endpoint` | **pre-register a `goose` client** in Dex config (one-time, like the existing `druids` client) |
| **Token exchange** (RFC 8693) | ✅ already advertised | not needed for ingress; a free win for *egress* and KnoxIDF |

**Verdict:** Dex covers the core ingress flow (Auth Code + PKCE/S256 + refresh). The two gaps (no 8414 endpoint, no DCR) are handled by a pre-registered client and an optional metadata shim — neither changes the approach. KnoxIDF, when it becomes the issuer, is expected to add DCR and richer exchange, making the ingress path its natural first integration test.

## Egress: credential model (decision)

Egress credentials are **pluggable per server**, deployment-chosen — extending the existing per-server `authentication` block in `config/mcp-servers.json`:

| Strategy | Behavior | User burden | External attribution |
|---|---|---|---|
| **`static-env`** *(default, exists today)* | one deployment API key per server, from env, shared by all callers | none | shared service identity |
| **`token-exchange`** (RFC 8693) | at call time, exchange the *acting user's* token for a scoped, short-lived downstream token | none — reuses their SSO login | per-user |
| `user-pat` (niche fallback) | user supplies a PAT for an OAuth-less service that needs user creds | high | per-user |

**Decisions:**
- **`static-env` is the default** and is already implemented. Per-user *provisioned token vaults are explicitly rejected as the default* — requiring every user of a druid to pre-acquire and store tokens for each external server is too cumbersome.
- **`token-exchange` is the dynamic upgrade**, opt-in per server. It is gated on two prerequisites: (a) the acting user's identity must reach the egress call site — the same user-context plumbing as ingress/coordination; and (b) a configured exchange broker (KnoxIDF) and a downstream resource that accepts exchanged tokens. Servers that only accept static keys stay on `static-env`.
- **Internal attribution is preserved regardless** — Druids audit can record `user → druid → elemental → external call` even when the external service sees a shared identity. `token-exchange` additionally restores *external* attribution.

This makes "static now, token-exchange later" a safe progression, not a correctness compromise; and it is **not** part of slice H.

## Build plan (slice H, ingress)

Sequenced sub-slices, each independently reviewable:

1. **Resource-server metadata + bearer validator** — PRM (RFC 9728) + `WWW-Authenticate`; the shared JWT/JWKS validator resolving `sub` → user. No enforcement flip yet.
2. **MCP session binding + require-auth** — bind principal at `initialize`; reject unauthenticated MCP calls. Pre-registered `goose` Dex client; 8414 shim if needed.
3. **Identity propagation to the app** — service token + asserted `userId` on `apiCall`; extend `resolvePrincipal` to accept it (trusted only with the service token).
4. **Coordination enforcement** — thread `requesterId` into `CoordinationService`; user-scoped delegation now covers the coordinate path.
5. **Console integration** — the React app obtains and sends a token for its MCP calls.

## Open questions

- **Console token acquisition** — mint a short-lived token from the session (needs the IdP to support an appropriate grant), or proxy the console's MCP calls through the app? The latter avoids a second token path.
- **Audience binding** — does Dex set a usable `aud` (RFC 8707 Resource Indicators are not advertised)? Determines how strictly the validator can check audience vs. relying on issuer + client.
- **`:3001` gateway during H** — leave the redundant clone as-is, or give it the same ingress auth so both ingress ports are protected? (It is not the egress path either way.)
- **Unauthenticated grace** — is there any transition period where MCP accepts both authenticated and anonymous calls, or is require-auth a hard cutover (simpler, but a flag day for every MCP client)?
