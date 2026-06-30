# Domain Bundles — export, registry, licensing, import

**Status:** Design
**Builds on:** `identity-and-access-control.md` (export/import are admin/operator actions; secrets-exclusion mirrors the per-user/credential boundaries), the realm/agent model, `config/mcp-servers.json` (egress integrations).
**Scope:** Package a business domain — a **realm** plus its **elementals** and the **druids** that travel to it — into a shareable **bundle**, distribute it through an app-store-style **registry**, and gate use with **per-license encryption** and a **runtime subscription lease**. No single shared key that can be copied and replayed.

## Concepts

- **Domain bundle** — a portable, **definitions-only** description of a realm and its agents (no secrets, no runtime state). The shareable unit.
- **Requirements manifest** — part of the bundle: a declared list of everything the *importing* deployment must supply for the domain to function (external MCP credentials, model mappings, etc.). Produced by interrogation at export, satisfied by a wizard at import.
- **Registry** — the catalog + publishing + licensing service ("appstore"). Runs **hosted** (public subscription) and **self-hosted** (private/internal sharing); a deployment may use several.
- **Deployment identity** — each Druids deployment has a keypair; its public key is registered with a registry and bound to its licenses. The private key never leaves the deployment.
- **License + lease** — a license grants a deployment entitlement to a bundle (terms: expiry, seats, subscription period). A **lease** is a short-lived, registry-signed token the deployment renews on a heartbeat; an expired/revoked lease **disables the domain at runtime**.

## What's in a bundle (definitions only)

```
bundle/
  manifest.json          # id, version, author, schema version, content hash, signature
  realm.json             # the realm definition (relative ids)
  agents/                # elementals + travel-capable druids
    *.json               #   type, persona/prompts, specialization, capabilities,
                         #   realmAccess (relative refs), resourceAccess patterns,
                         #   model-config references BY NAME, mcpTools bindings BY NAME
  requirements.json      # what the importer must provide (see below)
```

**Explicitly excluded** (never in a bundle): secrets/credentials/API keys, OAuth/service tokens, per-user grants (`user_assumable_druids`), users/sessions, runtime coordination state, and deployment-specific absolute ids. A bundle is a *template*, not a clone — the importer supplies its own secrets and data.

**WorldTree knowledge is not bundled.** Domain knowledge is deployment- and workflow-specific (which messaging platforms, which business specifics differ per company). The bundle may carry optional **references/pointers** an importer *can* choose to populate, but it ships no content.

### The requirements manifest

The heart of "interrogate on export, gather on import." For each external dependency the agents reference, the manifest declares what the importer must provide:

```json
{
  "mcpIntegrations": [
    { "server": "github", "requiredEnv": ["GITHUB_TOKEN"],
      "transport": "sse", "configurable": ["baseUrl"], "usedBy": ["pr-reviewer-elemental"] }
  ],
  "modelConfigs": [
    { "referencedAs": "fast-summarizer", "suggestedProvider": "ollama", "required": true } ],
  "realms":  [ { "referencedAs": "engineering", "role": "bound" } ],
  "knowledgeRefs": [ { "topic": "code-review-standards", "optional": true } ]
}
```

## Export (interrogation)

An admin selects a realm. The exporter:
1. Gathers the realm + its bound elementals + druids that can travel to it, and their definitions.
2. **Interrogates dependencies** — scans each agent for: `mcpTools` bindings → looks up `config/mcp-servers.json` for the server's required `envVar`/auth/transport; model-config references; `resourceAccess` locations; realm references. Builds `requirements.json`.
3. Rewrites absolute ids to relative refs, computes a content hash, and **signs** the bundle (author/registry key).

## Import (the gathering wizard)

The importer (admin) runs a wizard that reads `requirements.json` and **collects what the bundle needs before instantiating**:
- For each MCP integration → prompts for the credential (e.g. `GITHUB_TOKEN`) and any config; these are stored in the importer's **own secret store**, never in the bundle.
- Maps referenced model-config names → local model configs (or accepts bundled defaults).
- Remaps realm/agent ids to avoid collisions.
- Optionally wires knowledge references the importer chooses to populate.

Only once requirements are satisfied does it instantiate the realm + agents (inactive until the operator activates / the license lease is valid).

## Encryption & licensing mechanics (no shared, replayable key)

Envelope encryption + **per-deployment key wrapping** + a renewable lease. The ciphertext is identical for everyone; the *unlock material is unique per deployment*.

```mermaid
sequenceDiagram
    autonumber
    participant A as Author
    participant R as Registry (escrow + license issuer)
    participant D as Deployment (keypair)
    A->>R: publish bundle
    R->>R: encrypt bundle with random CEK (AES-256-GCM); store ciphertext; escrow CEK
    D->>R: register (deployment public key) + subscribe (license for bundle)
    R-->>D: license (terms: expiry/seats/period)
    Note over D,R: PROVISION (online, once)
    D->>R: request bundle (prove license + key possession)
    R-->>D: ciphertext + CEK WRAPPED to D's public key + signed lease
    D->>D: unwrap CEK with private key → decrypt → verify signature → import wizard
    Note over D,R: RUNTIME (subscription enforcement)
    loop heartbeat (e.g. daily)
        D->>R: renew lease (license still valid?)
        alt valid
            R-->>D: fresh lease → domain stays active
        else revoked / lapsed / expired
            R-->>D: refuse → on lease expiry, deployment DISABLES the domain
        end
    end
```

- **One CEK per bundle**, escrowed at the registry, never shipped in clear.
- **Per-deployment wrap:** the registry returns the CEK encrypted to the requesting deployment's public key. A leaked wrapped-CEK is useless without that deployment's private key → **replay across deployments is cryptographically impossible**, and there is no global key to share.
- **Download is license-gated**, and the wrapped CEK is bound to (deployment, bundle, license).
- **Revocation / rotation:** the registry can stop issuing/renewing leases (cuts off runtime use) and can rotate a bundle's CEK + re-wrap for active licensees (cuts revoked ones off from future versions).

### Runtime subscription enforcement ("block at runtime")

Imported domains are marked **license-gated**. The deployment renews its lease on a heartbeat; when the registry refuses (revoked / subscription lapsed / expired) and the current lease expires, the deployment **deactivates the realm and its agents** — they stop being usable in coordination/execution. This is what makes a subscription model enforceable, not just a one-time unlock.

### Threat model — be clear about what crypto buys

- **Strong:** an *unlicensed* party can never import the bundle (no key, and no shared key to leak); a licensee can't pass their unlock material to another deployment (it's bound to their private key).
- **Policy, not unbreakable:** once a *licensed* deployment has decrypted and imported, the **runtime lease check is enforced by the honest deployment** — a determined operator who already holds the plaintext could tamper to bypass the heartbeat. True per-use crypto-enforcement (DRM-grade) is heavier and out of scope. For B2B subscriptions, crypto-gated distribution + a signed lease + audit + the legal license is the standard, sufficient posture; it stops casual copying/replay, which is the stated goal.

### Air-gap

Hybrid suits subscriptions (online heartbeat). For genuinely air-gapped deployments, the registry issues a **perpetual/term license** (no heartbeat) or a **long-lease grace** — trading runtime revocation for offline operation. A deployment chooses its posture per subscription.

## Registry: hosted + self-hostable

- **Hosted (default):** the canonical public appstore — discover/subscribe to globally available bundles; the trust root + license issuer + key escrow you operate.
- **Self-hosted:** enterprises run their own registry to share bundles **internally** (and air-gapped), with their **own** trust root and licensing.
- A deployment may be subscribed to **multiple** registries (an internal one + the public one). Each registry has its own signing/escrow keypair; bundles are signed and verified against the registry that issued them.

## Phasing (so the first release isn't gated on a license server)

1. **Phase 1 — file-based export/import** (targetable for the first release): export a realm+agents to a **signed bundle file**; import on another deployment via the **requirements wizard**. No encryption, no registry — operator-to-operator file sharing. Delivers the core value (share a domain) immediately.
2. **Phase 2 — registry + signing:** the publish/discover/download service (hosted + self-hostable), bundle signing/verification.
3. **Phase 3 — licensing + encryption:** deployment keypair registration, envelope encryption, per-license wrapped CEK, license issuance, the provisioning flow.
4. **Phase 4 — subscription enforcement:** runtime lease/heartbeat, revocation, disable-at-runtime.

**Recommendation:** ship **Phase 1** in/with the first release (it's self-contained and needs only the existing admin model), and treat Phases 2–4 (the registry + licensing service) as a post-1.0 program — it's a substantial new service, not a feature of the core app.

## Relationship to the release

This is independent of the packaging/release work (versioned GHCR images + pinned compose + optional Homebrew CLI). Phase 1 bundles are just files the app reads/writes; the registry (Phases 2–4) would itself be a released, versioned service. The export/import feature can ride the normal release; the registry is its own deliverable with its own lifecycle.

## Open questions

- **Bundle id / versioning & compatibility** — semver for bundles; how an importer handles a bundle built against a newer Druids schema (the manifest's schema version gates this).
- **Signing trust roots** — how a deployment decides which registries/authors to trust (pinned keys, a trust-on-first-use list, an admin allowlist).
- **Paid vs free / payments** — does the hosted registry handle billing, or only entitlements (billing external)? Affects Phase 3 scope.
- **Per-agent MCP specialness** — beyond gathering credentials, do some integrations need the importer to *also* register an OAuth app (e.g. GitHub App) per their org? The manifest may need to capture "register your own OAuth app and provide its client id/secret," not just an API key.
- **Deployment-key lifecycle** — rotation, multiple deployments under one license (seats), and how the keypair relates to the identity/auth layer already built.
