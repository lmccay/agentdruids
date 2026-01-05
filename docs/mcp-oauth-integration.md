# MCP + OAuth Integration Architecture

## The Core Question

**Can MCP servers consume OAuth tokens from our user-delegated OAuth flow?**

We've validated that we can get per-user OAuth tokens (GitHub Apps "on behalf of user" pattern). The remaining question is: **How do these tokens flow to MCP tools?**

---

## Research Findings (2025-01-01)

**Key Insight:** MCP servers can use OAuth tokens, but these are the MCP server's own authentication tokens, NOT user identity tokens.

**Two Separate OAuth Flows:**

1. **MCP Server Authentication** (if SaaS-based MCP server)
   - MCP server itself may use OAuth to authenticate with its backend
   - This is the MCP server's credential, not the user's
   - Doesn't provide user attribution

2. **User Authorization for Remote Services** (separate flow)
   - User explicitly authorizes Druids to act on their behalf with each service
   - One-time OAuth flow produces: `access_token` + `refresh_token`
   - Druids persists these tokens (encrypted) mapped to user
   - Future operations: Druids retrieves user's tokens and acts on their behalf
   - Token refresh happens transparently using stored refresh token

**Critical Distinction:**
- ❌ **Wrong**: Pass user's SSO token to MCP server → MCP server uses it to access GitHub
- ❌ **Wrong**: MCP server's OAuth token provides user attribution
- ✅ **Right**: User authorizes Druids → Druids stores user's service tokens → Druids uses them internally

**Validated Architecture:**
1. **Internal Druids Agents**: Bypass MCP, call service APIs directly with user's OAuth tokens (Strategy A)
2. **External Agents**: Druids can host OAuth-aware MCP servers that internally retrieve user's tokens (Strategy B)
3. **User PATs**: Alternative for services/MCP servers that don't fit OAuth model (Strategy C)

**User Authorization is Required:** Users must explicitly authorize Druids to access each service (GitHub, Slack, AWS) via OAuth. This authorization happens once per service, resulting in stored credentials for future use.

---

## MCP Authentication Models

### Model 1: Static Token at Startup (Common)

**How most MCP servers work today:**

```bash
# MCP server configured with static token
GITHUB_TOKEN=ghp_staticPAT123 mcp-github-server

# Or passed as CLI arg
mcp-github-server --token ghp_staticPAT123
```

**Characteristics:**
- Token configured once when server starts
- Same token used for all requests
- No per-user, no per-request auth
- No token refresh capability

**Problem for us:**
- Can't use different tokens per user
- Can't use short-lived OAuth tokens (no refresh)
- Loses user attribution

---

### Model 2: Per-Request Auth (Ideal, Uncertain)

**What we'd need:**

```typescript
// MCP call with auth per request
await mcpClient.callTool({
  tool: "github",
  method: "review_pr",
  auth: {
    type: "oauth",
    token: userOAuthToken // Different per user
  },
  params: { prNumber: 123 }
});
```

**Question:** Does MCP protocol support per-request auth headers?

**Answer (2025-01-01):** MCP servers have their own authentication (potentially OAuth-based for SaaS MCP servers), but this is separate from user identity.

**For user attribution:** Druids must manage user service tokens internally. When an MCP server (or Druids-internal component) needs to act on behalf of a user, Druids retrieves that user's stored OAuth tokens and uses them to call the target service. The MCP server itself doesn't need to know about individual user tokens.

---

## Integration Strategies

### Strategy A: Druids Bypasses MCP for OAuth Services (Pragmatic)

**Pattern:** Direct API calls for services with OAuth, skip MCP

```typescript
// For GitHub operations: Call API directly with OAuth token
class GitHubElemental {
  async executeTask(task, userContext) {
    // Get user's OAuth token
    const token = await tokenManager.getAccessToken(
      userContext.userId,
      "github"
    );

    // Call GitHub API directly (not via MCP)
    const octokit = new Octokit({ auth: token });
    await octokit.rest.pulls.createReview({
      owner: 'company',
      repo: 'backend',
      pull_number: 123,
      body: task.reviewComment
    });

    // GitHub logs: alice@company.com via Druids App ✅
  }
}
```

**Pros:**
- ✅ Full OAuth support (per-user tokens, refresh, attribution)
- ✅ No MCP server limitations
- ✅ Direct control over API calls

**Cons:**
- ❌ Doesn't leverage MCP ecosystem for major services
- ❌ Druids must implement API clients (GitHub, Slack, etc.)
- ❌ Can't use existing open-source MCP servers

**When to use:**
- Internal Druids agents (always)
- Services where attribution is critical (GitHub, Slack)
- Services with good SDK support (Octokit, Slack SDK)

---

### Strategy B: Druids OAuth-Aware MCP Proxy (Future)

**Pattern:** Druids hosts MCP servers that consume OAuth tokens

```
External Goose Agent (or other MCP client)
  ↓ (standard MCP call)
Druids OAuth-Aware MCP Gateway
  ↓ (looks up user's OAuth token)
  ↓ (calls GitHub API with user's token)
GitHub API
```

**Architecture:**

```typescript
// Druids-hosted GitHub MCP Server
class DruidsGitHubMCPServer implements MCPServer {

  async handleToolCall(call: MCPToolCall, context: RequestContext) {
    // Extract user from request context
    const userId = context.authenticated.userId; // From session/token

    // Get user's OAuth token
    const githubToken = await tokenManager.getAccessToken(userId, "github");

    // Execute tool with user's token
    const octokit = new Octokit({ auth: githubToken });

    switch (call.method) {
      case "review_pr":
        return await octokit.rest.pulls.createReview({
          owner: call.params.owner,
          repo: call.params.repo,
          pull_number: call.params.prNumber,
          body: call.params.comment
        });
      // ... other methods
    }
  }
}

// External agents connect to Druids' MCP endpoint
// http://druids.company.com:3003/mcp
```

**Pros:**
- ✅ Standard MCP interface for external agents
- ✅ OAuth handled internally by Druids
- ✅ User attribution maintained
- ✅ External agents don't manage tokens

**Cons:**
- ❌ Druids must host and maintain MCP servers
- ❌ Infrastructure burden (availability, scaling)
- ❌ Can't use vanilla open-source MCP servers
- ❌ Tight coupling (external agents depend on Druids MCP)

**When to use:**
- External Goose agents need OAuth services
- Want standard MCP interface
- Can commit to hosting infrastructure

---

### Strategy C: User PATs for MCP (Backward Compatible)

**Pattern:** Users provide Personal Access Tokens for MCP servers

```typescript
// User configuration
{
  userId: "alice@company.com",

  // OAuth tokens (for Druids-direct API calls)
  oauthTokens: {
    github: { accessToken: "...", refreshToken: "..." },
    slack: { accessToken: "...", refreshToken: "..." }
  },

  // PATs (for MCP servers that need them)
  servicePATs: {
    github: "ghp_alicePersonalToken", // Encrypted
    aws: { accessKey: "...", secretKey: "..." },
    custom_tool: "api_key_xyz"
  }
}
```

**Flow:**

```
1. Alice authorizes Druids via OAuth (for Druids-internal operations)
2. Alice also creates GitHub PAT and provides to Druids
3. Internal operations: Druids uses OAuth token ✅
4. External MCP calls: Druids passes Alice's PAT ✅
```

**Pros:**
- ✅ Works with existing MCP servers (no changes needed)
- ✅ User attribution (PAT is Alice's, not service account)
- ✅ Flexible (supports any service, even non-OAuth)
- ✅ User controls PAT scopes and revocation

**Cons:**
- ❌ Not true SSO (user manages both OAuth and PATs)
- ❌ User burden (create, rotate, secure PATs)
- ❌ Two credential stores to manage

**When to use:**
- External agents using standard MCP servers
- Services without OAuth support
- User-managed credentials acceptable
- Quick integration needed

---

### Strategy D: Realm Service Accounts (Simple, No Attribution)

**Pattern:** Each realm has service accounts, MCP servers use those

```typescript
// Realm configuration
{
  realmId: "engineering",
  servicePATs: {
    github: "ghp_engineering_bot_token",
    aws: { /* engineering service account */ },
    slack: "xoxb-engineering-bot-token"
  }
}

// All agents in Engineering realm share these tokens
// GitHub sees: druids-engineering-bot (not alice@company.com)
```

**Pros:**
- ✅ Simplest setup (one token per realm)
- ✅ Works with all MCP servers
- ✅ No user token management

**Cons:**
- ❌ Loses user attribution (major problem)
- ❌ Compliance issues (can't prove who did what)
- ❌ Coarse-grained permissions
- ❌ Audit trail gaps

**When to use:**
- Non-production environments only
- Where attribution isn't critical
- Quick prototyping/testing
- Legacy systems without OAuth

---

## Recommended Hybrid Strategy

### Tier 1: Druids-Internal Agents (OAuth Always)

**For internal Druids agents:**
- Use Strategy A (Direct API calls with OAuth)
- Full user attribution
- Token refresh handled automatically
- No MCP limitations

```typescript
// Internal elemental
class InternalGitHubElemental {
  // Always uses user's OAuth token
  async execute(task, userContext) {
    const token = await tokenManager.getOAuthToken(userContext.userId, "github");
    const octokit = new Octokit({ auth: token });
    // ... direct API calls
  }
}
```

### Tier 2: External Goose Agents (Mixed)

**Option 2a: Critical Services (Strategy B - Druids MCP Proxy)**
- GitHub, Slack, etc. - where attribution matters
- External agents connect to Druids OAuth-aware MCP
- Druids manages OAuth internally

**Option 2b: Non-Critical Services (Strategy C - User PATs)**
- Custom tools, legacy systems
- External agents use standard MCP servers
- Users provide PATs

**Option 2c: Non-Production (Strategy D - Service Accounts)**
- Dev/test environments
- Acceptable to lose attribution
- Simplest setup

### Decision Tree

```
Is this an internal Druids agent?
  YES → Strategy A (Direct OAuth API calls)
  NO → Continue...

Is this a critical service (GitHub, Slack) needing attribution?
  YES → Strategy B (Druids OAuth-aware MCP proxy)
  NO → Continue...

Does the service support OAuth?
  YES → Strategy C (User PATs as fallback)
  NO → Strategy C (User PATs) or D (Service account)

Is this production?
  NO → Strategy D acceptable (Service account)
  YES → Avoid Strategy D (use A, B, or C)
```

---

## Implementation Phases

### Phase 1: Internal OAuth (Now)

- [ ] Implement OAuth app registration (GitHub, Slack)
- [ ] Token storage and refresh
- [ ] Internal elementals use OAuth tokens
- [ ] Direct API calls (Strategy A)

**Deliverable:** Internal Druids agents have full OAuth with attribution

### Phase 2: User PAT Support (Near-term)

- [ ] User PAT storage (encrypted)
- [ ] Pass PATs to external MCP servers
- [ ] UI for "manage service tokens"

**Deliverable:** External Goose agents can use user PATs with MCP

### Phase 3: OAuth-Aware MCP Proxy (Medium-term)

- [ ] Druids hosts GitHub MCP server (OAuth-aware)
- [ ] Druids hosts Slack MCP server (OAuth-aware)
- [ ] External agents connect to Druids MCP gateway
- [ ] Authentication for external MCP clients

**Deliverable:** External agents get OAuth benefits via Druids MCP

### Phase 4: Advanced Federation (Long-term)

- [ ] RFC 8693 token exchange
- [ ] Agent-specific down-scoped tokens
- [ ] Fine-grained audit trails (user + agent)

**Deliverable:** Multi-agent sessions with perfect attribution

---

## Open Questions

### MCP Protocol Questions

- [ ] **Does MCP spec support per-request auth?** (Need to review spec)
- [ ] **Can MCP servers accept OAuth tokens?** (Need to test GitHub MCP)
- [ ] **Is there a standard for passing user context in MCP?** (Research needed)

### Architectural Questions

- [ ] **Should we commit to hosting MCP servers?** (Strategy B infrastructure cost)
- [ ] **Is user PAT management acceptable UX?** (Strategy C friction)
- [ ] **Where is service account acceptable?** (Strategy D boundary)

### Integration Questions

- [ ] **How does Goose handle MCP auth today?** (Learn from Goose patterns)
- [ ] **Do any MCP servers support OAuth natively?** (Survey ecosystem)
- [ ] **Can we extend MCP protocol for OAuth?** (Contribute to standard?)

---

## Next Steps

1. **Investigate MCP protocol** - Review spec for auth patterns
2. **Test GitHub MCP** - Can it accept OAuth tokens?
3. **Prototype Strategy A** - Internal agents with OAuth (proven pattern)
4. **Design Strategy C** - User PAT management UI/API
5. **Evaluate Strategy B** - Cost/benefit of hosting MCP proxy
6. **Engage Goose team** - Learn their MCP auth approach

---

## Summary

**Architecture Validated:** User-delegated OAuth with internal token management is the correct pattern for maintaining attribution.

**Key Decisions:**
1. ✅ **Internal Druids agents** → Strategy A (Direct API calls with user OAuth tokens)
2. 🟡 **External agents** → Strategy B (Druids OAuth-aware MCP proxy) or Strategy C (User PATs)
3. ⚠️ **Non-production only** → Strategy D (Service accounts, loses attribution)

**Critical Implementation:**
- User authorizes Druids once per service (GitHub, Slack, AWS)
- Druids stores encrypted access + refresh tokens mapped to user
- Agents retrieve user's tokens internally when needed
- Token refresh handled transparently

**Next Phase:** Implement OAuth callback infrastructure and encrypted token storage (see `third-party-credentials-architecture.md` for detailed implementation plan)

---

**Status:** 🟢 Architecture validated and documented

**Last Updated:** 2025-01-01
