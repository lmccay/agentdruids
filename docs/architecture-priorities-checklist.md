# Druids Architecture Priorities Checklist

## Context
This checklist captures architectural decisions and implementation priorities identified during Goose integration planning and core architecture refinement.

---

## 1. Realm Design & Guidance

### Status: 🟡 Needs Design

**Key Decisions:**
- [ ] Document realm granularity principles (business/functional domains, not tool-level)
- [ ] Create realm creation decision tree
  - When to create new realm vs. add elementals to existing
  - Triggers: different user populations, regulatory boundaries, ownership
  - Anti-patterns: avoid realm proliferation
- [ ] Provide realm design examples
  - Enterprise: Engineering, Legal, Marketing, Sales, Fraud, etc.
  - Creative: Music Composition, Image Generation, Creative Writing, etc.
- [ ] Migration guidance (start with fewer realms, split later if needed)

**Examples to Document:**
```
✅ Good: Engineering Realm with GitHub-Elemental, AWS-Elemental, Security-Elemental
❌ Bad: Separate GitHub Realm, AWS Realm, Security Realm (too granular)
```

**Open Questions:**
- How to handle sub-departments? (Legal Contracts vs. Legal Compliance)
- When is a sub-realm justified vs. more elementals?
- How to prevent 100+ realms in large enterprises?

---

## 2. User Authentication & Authorization (SSO)

### Status: 🟡 Architecture Validated, Implementation Needed

**Key Decisions:**
- [ ] User authentication mechanism (OIDC, SAML, OAuth2)
- [ ] Session establishment and lifecycle
- [ ] **Druids as IAM Roles model** (users assume druids like roles)
- [ ] User → Allowed Druids mapping (explicit permission grants)
- [ ] Druid discovery mechanism ("What druids can I use?")
- [ ] Token exchange architecture (master token → realm tokens)
- [ ] Realm token scope and lifecycle
- [ ] Audit trail (all actions logged with user identity)

**Architecture Pattern:**
```
User authenticates
  ↓
Granted list of druids they can "assume"
  ↓
User discovers: "What can each druid do? Where can they go?"
  ↓
User initiates session with druid(s)
  ↓
Druids act on user's behalf with realm-scoped tokens
```

**Components Needed:**
- [ ] Authentication service integration (OAuth/OIDC)
- [ ] User-to-Druid mapping storage (group-based + user-specific)
- [ ] Druid discovery API (UI + API + MCP)
- [ ] Token exchange service (OAuth/OIDC standard)
- [x] **3rd party service credential management** (GitHub, AWS, Slack tokens) - Architecture validated
- [ ] Session management with user context (1 hour default + refresh)
- [ ] Audit logging with user identity

**Answered:**
- ✅ Token exchange: OAuth/OIDC standard (AWS STS for specific elementals later)
- ✅ Session duration: 1 hour default with refresh tokens
- ✅ Grant management: Group-based (scalable), user-specific (small deployments)
- ✅ Conditional access: Not immediate priority, don't preclude architecturally
- ✅ Discovery: UI + API + MCP Server

**Answered:**
- ✅ 3rd party credentials: User-delegated OAuth (see `third-party-credentials-architecture.md` and `mcp-oauth-integration.md`)

**Open Questions:**
- Multi-tenancy considerations?
- Break-glass emergency access?

---

## 3. System Prompt Architecture

### Status: 🟢 Design Complete (See: [SYSTEM_PROMPT_ARCHITECTURE.md](SYSTEM_PROMPT_ARCHITECTURE.md))

**Design Completed:** 2025-02-08

**Key Decisions:**
- [x] URL-based storage abstraction (HTTPS, S3, GCS, Azure, files, Git)
- [x] YAML-based prompt file format with metadata
- [x] Inheritance model: Base → Agent Type → Realm → Agent-specific
- [x] Multi-layer caching strategy (in-memory + Redis)
- [x] Hot reload with file watchers
- [x] Prompt versioning with explicit version pinning
- [x] Composition engine with override_points and extension_points

**Architecture:**
```
Global Base Prompt (https://prompts.druids.cloud/v1/base/global.yaml)
  ↓ extended by
Agent Type Prompt (elemental, druid, gaia, worldtree)
  ↓ extended by
Realm-Specific Prompt (engineering, legal, marketing)
  ↓ extended by
Agent-Specific Prompt (github-elemental-01, aws-elemental-02)
  ↓ composed with
Runtime Context (session_id, user_id, available_tools)
```

**Implementation Plan:**
- [ ] Phase 1: Foundation (FileLoader, HttpsLoader, basic composition)
- [ ] Phase 2: Cloud storage (S3Loader, GCSLoader, AzureLoader)
- [ ] Phase 3: Composition engine (override/extend logic, section ordering)
- [ ] Phase 4: Hot reload & monitoring (PromptWatcher, metrics)
- [ ] Phase 5: UI & management (frontend prompt viewer)
- [ ] Phase 6: Advanced features (GitLoader, A/B testing, effectiveness)

**Answered Questions:**
- ✅ Storage: URL-based abstraction supporting HTTPS, S3, local files, Git
- ✅ Composition: Layered with explicit override_points and extension_points
- ✅ Hot-reload: File watchers + cache invalidation API
- ✅ Versioning: Explicit version pinning with validation
- ✅ Testing: Composition unit tests + integration tests + API endpoint for testing

**Open Questions:**
- Prompt effectiveness measurement metrics?
- Multi-language support for international deployments?
- Prompt marketplace for community contributions?

---

## 4. MCP Tool Groups & Management

### Status: 🟡 Needs Design

**Key Decisions:**
- [ ] Tool grouping mechanism
- [ ] Tool groups → System prompt template mapping
- [ ] Default permissions per tool group
- [ ] Per-elemental permission overrides (keep explicit grants)
- [ ] Tool discovery and registration

**Architecture:**
```
engineering-tools = ["github", "aws", "datadog", "pagerduty"]
  ↓ mapped to
engineering-elemental-prompt-template
  ↓ inherited by
GitHub-Elemental (with specific overrides)
```

**Components Needed:**
- [ ] Tool group definitions
- [ ] Tool group → Prompt template mappings
- [ ] Permission override system
- [ ] Tool registry/catalog

**Open Questions:**
- How to handle tool version updates?
- Tool deprecation strategy?
- Custom vs. standard MCP tools?

---

## 5. Cross-Cutting Concerns (Security Elementals)

### Status: 🟢 Model Decided, Needs Implementation

**Decided Approach:**
- Security Elemental in EACH realm
- Inherits base security prompt
- Extended with realm-specific context
- Prevents permission leakage (Legal security ≠ Engineering security)

**Implementation Needed:**
- [ ] Base security system prompt
- [ ] Realm-specific security extensions
- [ ] Security elemental template
- [ ] Tool access grants per realm

**Pattern Applies To:**
- Security (decided)
- Monitoring/Observability?
- Compliance/Audit?
- Other cross-cutting concerns?

---

## 6. Coordinator Architecture Refinement

### Status: 🟢 Model Decided, Needs Documentation

**Decided:**
- Coordinators are globally positioned (don't travel)
- Coordinators delegate ONLY to druids (never elementals)
- Coordinators can be external agents (Goose, etc.)
- Pluggable coordination strategies (hierarchical, consensus, auction)

**Implementation Needed:**
- [ ] Coordinator as separate agent type (not druid)
- [ ] CoordinatorPermissions model (only lists druids)
- [ ] CoordinationStrategy interface
- [ ] Strategy implementations (hierarchical, consensus, auction)
- [ ] External coordinator integration

**Documentation Needed:**
- [ ] Why coordinators don't travel
- [ ] Coordinator → Druid → Elemental hierarchy
- [ ] Benefits: security isolation, permission simplification

---

## 7. Delegation Hierarchy Enforcement

### Status: 🟢 Model Decided, Needs Implementation

**Decided:**
- Coordinators → Druids → Elementals (strict hierarchy)
- Coordinators cannot directly access elementals
- Prevents permission leakage to coordinators

**Implementation Needed:**
- [ ] Permission validation in CoordinationService
- [ ] Error handling for hierarchy violations
- [ ] Audit logging of delegation chains

**Validation Examples:**
```
✅ Coordinator → Druid-A: "Work with GitHub elemental" (allowed)
❌ Coordinator → Elemental-GitHub: "Review PR" (blocked)
```

---

## 8. Goose Integration

### Status: 🟡 Architecture Documented, Needs Implementation

**Completed:**
- [x] Integration architecture document
- [x] Shadow identity pattern
- [x] External agent registration model
- [x] MCP tool specification
- [x] Use cases documented

**Implementation Needed:**
- [ ] ExternalAgentBridge service
- [ ] External agent registration API
- [ ] Health monitoring for external agents
- [ ] MCP communication layer

**Testing Needed:**
- [ ] Register external Goose coordinator
- [ ] Register external Goose druid
- [ ] Register external Goose elemental
- [ ] Cross-realm coordination with external agents

---

## 9. Druid Discovery Mechanism

### Status: 🔴 New Requirement, Needs Design

**Requirement:**
Users need to discover:
- What druids can I use? (IAM role assumption)
- What can each druid do? (capabilities)
- Where can each druid go? (realm access)

**API Needed:**
```
GET /api/user/me/available-druids
GET /api/agents/{druidId}/capabilities
GET /api/agents/{druidId}/realm-access
```

**Components:**
- [ ] Druid discovery API
- [ ] Capability description format
- [ ] Realm access visibility
- [ ] UI for druid selection

**UX Flow:**
```
1. User logs in
2. System shows: "You can use these druids: [druid-1, druid-2, druid-3]"
3. User selects druid-1: "Can access Engineering, AWS realms"
4. User initiates session with druid-1
```

---

## 10. Evolution Framework

### Status: 🟡 Vision Clear, Needs Implementation

**Components:**
- [ ] Self-play scenario framework
- [ ] Performance metrics collection
- [ ] Strategy comparison and analysis
- [ ] Prompt evolution engine
- [ ] Emergent tool generation

**Priority:** Lower (post-core functionality)

---

## 11. WorldTree Integration

### Status: 🟡 Concept Defined, Needs Implementation

**Components:**
- [ ] Knowledge storage system
- [ ] Query interface for agents
- [ ] Knowledge retention across sessions
- [ ] Pattern preservation

**Priority:** Medium (enables learning)

---

## 12. Session Isolation & Concurrency

### Status: 🟢 Architecture Decided, Partially Implemented

**Completed:**
- [x] Session-scoped state management concept
- [x] SessionAgentManager pattern
- [x] SessionContentManager pattern

**Implementation Needed:**
- [ ] Full session isolation validation
- [ ] Concurrent session testing
- [ ] Session cleanup protocols

---

## Priority Ranking (Next 6 Months)

### P0 (Critical - Next 1-2 months)
1. **User Authentication & Authorization** (#2)
   - Foundation for everything else
   - Druids as IAM Roles model
   - Druid discovery mechanism

2. **Druid Discovery API** (#9)
   - Users need to know what they can use
   - Required for practical usability

3. **Delegation Hierarchy Enforcement** (#7)
   - Core security model
   - Prevent permission leakage

### P1 (High - Months 2-4)
4. **System Prompt Architecture** (#3)
   - Enables consistent agent behavior
   - Foundation for prompt evolution

5. **Realm Design Guidance** (#1)
   - Users need clear guidance
   - Prevents architectural mistakes

6. **Coordinator Architecture Refinement** (#6)
   - Core to orchestration model
   - Enables pluggable strategies

### P2 (Medium - Months 4-6)
7. **MCP Tool Groups** (#4)
   - Improves manageability
   - Not blocking for MVP

8. **Goose Integration Implementation** (#8)
   - High value for ecosystem
   - Depends on P0/P1 items

9. **Cross-Cutting Concerns Pattern** (#5)
   - Security elementals per realm
   - Important but can start with manual creation

### P3 (Lower - Post-6 months)
10. **Evolution Framework** (#10)
11. **WorldTree Integration** (#11)
12. **Session Isolation Hardening** (#12)

---

## Decision Log

### 2025-01-01: Realm Granularity
**Decision:** Realms are high-level business/functional domains (Engineering, Legal, Marketing), not tool-level (GitHub Realm, Slack Realm).

**Rationale:**
- Aligns with organizational structure
- Prevents realm proliferation
- Tools become elementals within realms

### 2025-01-01: Coordinators Don't Travel
**Decision:** Coordinators are globally positioned, don't travel between realms.

**Rationale:**
- Don't need realm-specific tools (agents do the work)
- Eliminates ordering complexity
- Can coordinate across realms simultaneously

### 2025-01-01: Delegation Hierarchy
**Decision:** Coordinators → Druids → Elementals (strict hierarchy)

**Rationale:**
- Security isolation (coordinators never access realm tools)
- Permission simplification (coordinators only know about druids)
- Realm encapsulation (internals stay hidden)

### 2025-01-01: Druids as IAM Roles
**Decision:** Users are granted access to druids (like IAM role assumption), realm access is implicit through druids.

**Rationale:**
- Cleaner permission model
- Realm access automatically derived
- Familiar pattern (AWS IAM roles)
- Enables discovery ("What druids can I use?")

---

## Open Questions Needing Resolution

### Answered (2025-01-01)

1. ~~**Token Exchange:**~~ → **ANSWERED:** Use OAuth/OIDC standard. AWS STS may be needed for specific elementals later.

2. ~~**Grant Management:**~~ → **ANSWERED:** Deployment-based. Groups preferred for scalability, user-specific grants fine for small deployments. If no user mapping, IDPs must include groups.

3. ~~**Conditional Access:**~~ → **ANSWERED:** Don't preclude architecturally, but not immediate priority. IDP can handle some of this.

4. ~~**Discovery UX:**~~ → **ANSWERED:** Expose via UI, API, and MCP Server (all three).

5. ~~**Session Duration:**~~ → **ANSWERED:** 1 hour default sounds good. Need refresh tokens for longer coordinations.

6. ~~**3rd Party Service Credentials:**~~ → **ANSWERED:** User-delegated OAuth. Users authorize Druids once per service (GitHub, Slack, AWS). Druids stores encrypted access + refresh tokens mapped to user. Tokens retrieved internally when agents need them. See `third-party-credentials-architecture.md` and `mcp-oauth-integration.md` for complete implementation plan.

### Outstanding Questions

7. **Realm Proliferation:** How many realms is too many? When to split Engineering into Frontend-Engineering + Backend-Engineering?

8. **Multi-Tenancy:** Different organizations sharing Druids instance?

9. **Break-Glass Access:** Emergency access patterns for incidents?

10. **Prompt Testing:** How to validate prompt effectiveness?

11. **Tool Versioning:** Handling MCP tool version updates and deprecation?

12. **Audit Requirements:** SOC2, HIPAA, GDPR implications?

---

## Next Actions

- [ ] Review and prioritize this checklist with team
- [ ] Create detailed design docs for P0 items
- [ ] Prototype druid discovery API
- [ ] Design user authentication flow
- [ ] Document druids-as-IAM-roles pattern

**Last Updated:** 2025-01-01
