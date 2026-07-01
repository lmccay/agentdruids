# Teaching an OIDC Provider to Speak MCP: A Discovery-and-Registration Shim for IdPs That Fall Short

Modern AI clients that speak the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) — Goose, Claude Desktop, IDE extensions — increasingly expect to authenticate against a tool server using the **full OAuth 2.1 discovery chain**: find the resource's authorization server, read its metadata, register themselves dynamically, and run Authorization Code + PKCE. Zero manual client setup.

That expectation collides with reality: **many mature, production-grade identity providers implement only *part* of that chain.** They do OpenID Connect discovery, but not the OAuth 2.0 metadata URL forms an MCP client probes; they issue tokens all day, but have no dynamic client registration endpoint.

This article is a blueprint for bridging that gap with a small, honest reverse-proxy shim — filling in *only* the discovery pieces an IdP genuinely lacks, without touching token issuance or trust. We use [Dex](https://dexidp.io) as the worked example because it ships as the out-of-the-box IdP for the [Druids](https://github.com/open-tempest-labs/agentdruids) multi-agent project, but the pattern applies to any OIDC provider caught on the wrong side of this gap.

## The discovery chain an MCP client expects

When an MCP client is told "authenticate to this tool server," a spec-compliant one walks a chain of standards, each pointing to the next:

```
  MCP client                          Tool server / Authorization Server
  ──────────                          ──────────────────────────────────
  1. GET /.well-known/                RFC 9728  Protected Resource Metadata
        oauth-protected-resource   ─▶ "your authorization server is at ISSUER"

  2. GET ISSUER/.well-known/          RFC 8414  Authorization Server Metadata
        oauth-authorization-server ─▶ endpoints + "registration_endpoint": ...

  3. POST registration_endpoint    ─▶ RFC 7591  Dynamic Client Registration
                                      "here is your client_id"

  4. Authorization Code + PKCE     ─▶ RFC 6749 / 7636  → access token
```

Each link is a separate RFC, and a client that follows the chain literally will **fail at the first broken link.** The two links that mature IdPs most often break are #2 and #3.

## Where a capable IdP still falls short

### Gap 1 — the metadata *URL form* (RFC 8414 vs. OIDC Discovery)

OpenID Connect Discovery and OAuth 2.0 Authorization Server Metadata specify **different URL constructions**, and the difference bites whenever your issuer has a path segment (e.g. `https://idp.example.com/dex`):

| Spec | Well-known URL for issuer `https://idp.example.com/dex` |
|------|--------------------------------------------------------|
| OpenID Connect Discovery 1.0 | `https://idp.example.com/dex/.well-known/openid-configuration` (path **appended**) |
| RFC 8414 (OAuth AS Metadata) | `https://idp.example.com/.well-known/oauth-authorization-server/dex` (well-known **inserted** at the root) |

Many IdPs serve **only** the OIDC-appended form. An MCP client built to RFC 8414 probes the inserted/root forms — and gets a 404, even though the metadata "exists" a few characters away. (The MCP TypeScript SDK has [wrestled with exactly this path construction](https://github.com/modelcontextprotocol/typescript-sdk/issues/744); Dex has a long-standing note that its [discovery doc is bound to the issuer path](https://github.com/dexidp/dex/issues/502).)

### Gap 2 — no Dynamic Client Registration (RFC 7591)

The self-registration step is what delivers the "zero manual setup" MCP experience: the client `POST`s its metadata and gets back a `client_id`. A large share of IdPs — Dex among them — have **no DCR endpoint at all**. Clients are provisioned statically (config file) or via a proprietary admin API. A client that insists on self-registering has nowhere to go.

## Do the diligence first: is it *really* missing, or did you miss a setting?

Before writing a single line of shim, prove the gap is real. A blueprint that papers over a missed config toggle is worse than no blueprint. We probed the IdP **directly** (bypassing any proxy) for every URL form and the registration endpoint:

```
# OIDC discovery at the issuer path — the one form the IdP DOES serve
GET  ISSUER/.well-known/openid-configuration            → 200 OK

# RFC 8414 forms an MCP client actually probes
GET  /.well-known/oauth-authorization-server            → 404
GET  /.well-known/oauth-authorization-server/dex        → 404
GET  /.well-known/openid-configuration                  → 404  (root, no path)

# Dynamic Client Registration
POST /register                                          → 404
```

We also checked the IdP's configuration surface for any flag that would enable additional well-known URL forms or a registration endpoint. **There is none** — these are absent *features*, not disabled ones. That verification is what makes the shim defensible: we are adding what the IdP cannot be configured to do, and nothing more.

> **Diligence checklist for your IdP:** curl each well-known form the client expects; curl the registration endpoint; grep the IdP's config reference for `registration` and `metadata`/`well-known`; check the issue tracker for an existing feature request. Only build the shim for what comes back genuinely empty.

## The blueprint: a thin metadata-and-registration shim

The fix is a small reverse proxy placed in front of the IdP. It does three things and nothing else:

```
                         ┌─────────────────────────────────────────┐
   MCP client            │  Discovery shim (reverse proxy)          │
   ─────────             │                                          │
   metadata request  ───▶│  /.well-known/oauth-authorization-server │  synthesized
   (any URL form)        │  (+ every other form the client derives) │  from the IdP's
                         │      → IdP discovery doc + registration  │  own OIDC doc
                         │        _endpoint                         │
                         │                                          │
   POST /register    ───▶│  /register → returns a PRE-PROVISIONED   │  DCR facade
                         │              client (fixed client_id +   │
                         │              redirect_uris)              │
                         │                                          │
   authorize / token / ─▶│  everything else → pass through ────────┼──▶  IdP
   keys / login / etc.   │  UNCHANGED (issuer preserved)            │    (unmodified)
                         └─────────────────────────────────────────┘
```

**1. Serve Authorization Server Metadata at every URL form the client derives.**
Return a JSON document that is the IdP's own discovery doc (same `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `issuer`) **plus** a `registration_endpoint` pointing at the shim. Alias it at *all* the well-known variants a client might try — root, issuer-suffixed, and the OIDC form — so you don't have to guess which construction the client uses.

**2. Answer `/register` with a pre-provisioned client (a DCR *facade*).**
This is deliberately not real dynamic registration. The endpoint returns a client that already exists in the IdP's static config — a fixed `client_id`, `token_endpoint_auth_method: none` (public client + PKCE), and a fixed set of `redirect_uris`. The MCP client believes it registered; in reality it received credentials you provisioned. That is exactly enough to satisfy a client that refuses to proceed without a registration step.

**3. Pass everything else straight through, with the issuer untouched.**
`authorize`, `token`, `keys`/JWKS, the login form, consent — all proxied to the IdP verbatim. **Keeping the issuer identical end-to-end is the load-bearing constraint:** tokens are still minted and signed by the real IdP, and their `iss` matches what every relying party validates against. The shim never sees a private key and never mints a token. It only rewrites *discovery*, not *trust*.

A reverse proxy (nginx, Caddy, Envoy) expresses all three in a few dozen lines: `location` blocks that `alias` a static metadata JSON for the well-known forms, a `location = /register` returning a canned JSON body, and a catch-all `location /` that `proxy_pass`es to the IdP.

## Two gotchas worth stealing

- **The redirect URI must be exact and fixed.** Because the DCR facade hands back a *static* client, its `redirect_uris` must match what the IdP has registered — and IdPs like Dex require an exact match with no wildcard ports. MCP clients often default to a *random* localhost callback port. You must pin the client to a fixed port (Goose, for example, honors `GOOSE_OAUTH_CALLBACK_PORT`) and make the IdP's static client, the facade response, and that port all agree.
- **Persist the IdP's signing keys.** If your dev IdP regenerates its signing keys on every restart, clients holding tokens will suddenly see "failed to verify id token signature." Back the IdP with persistent storage so keys survive restarts. (A discovery shim can't fix a trust root that keeps moving.)

## What this is — and isn't

- ✅ **A discovery bridge**, not a new authorization server. Trust stays with the real IdP.
- ✅ **Minimal and auditable** — it adds only the well-known forms and the registration facade that are provably absent.
- ⚠️ **The `/register` response is a facade.** It works because *you* control which clients may connect and pre-provision them. It is not multi-tenant, open dynamic registration.
- ⚠️ **Best treated as a development/edge convenience.** A production IdP that implements RFC 8414 and RFC 7591 natively (or an MCP client you can hand a static `client_id`) needs no shim at all.

**If you can avoid it, do:** the cleanest options are (a) an MCP client that accepts a pre-configured `client_id` (skipping DCR entirely), (b) an IdP with native RFC 8414 + 7591 support, or (c) contributing those features upstream. The shim is the right tool specifically when you're pinned to an IdP that lacks them and a client that insists on the full auto-discovery chain.

## Generalizing to any IdP — the recipe

1. **Enumerate the chain the client walks** (protected-resource metadata → AS metadata → DCR → code+PKCE) and identify which link 404s.
2. **Verify each gap directly** against the running IdP, and confirm no config enables it. Fill only genuine gaps.
3. **Synthesize AS metadata from the IdP's own discovery doc**, adding `registration_endpoint`; serve it at *every* well-known URL form the client might construct.
4. **Stub DCR with a pre-provisioned client** if — and only if — the client requires registration.
5. **Proxy everything else unchanged and keep the issuer stable** so token signatures and `iss` validation are unaffected.
6. **Reconcile the fixed redirect URI** across IdP config, facade response, and client callback port.

The result is a client that completes a real OAuth 2.1 + PKCE flow against an IdP that, on its own, couldn't quite tell the client how to start — with all trust still anchored where it belongs.

---

*In the Druids project, this shim ships as a dev-only container in front of the bundled Dex IdP so any MCP client can complete OAuth against Druids out of the box; production deployments point at an IdP with native discovery and drop the shim. See the project's MCP client OAuth integration guide for the concrete configuration.*
