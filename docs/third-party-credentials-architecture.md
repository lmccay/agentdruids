# Third-Party Service Credentials Architecture

## Problem Statement

**Challenge:** How do we acquire and manage credentials for external services (GitHub, AWS, Slack, Snowflake, etc.) so that elementals can perform operations on behalf of authenticated users while maintaining user attribution in audit trails?

**Requirements:**
1. **User Attribution:** GitHub audit shows `alice@company.com via Druids App`, not a service account
2. **SSO Experience:** User logs in once to Druids, then authorizes each service once
3. **Secure Storage:** Credentials encrypted at rest, minimal exposure
4. **Token Refresh:** Handle expired access tokens transparently
5. **Scoped Access:** Tokens have minimal permissions needed for operations
6. **Revocation:** User can revoke Druids' access to services
7. **Per-User, Per-Service:** Each user has their own credentials for each service

## Research Findings (2025-01-01)

**Key Insight:** You can achieve per-user tokens with attribution, but **only through explicit user delegation**, not by magically converting SSO tokens.

**The Pattern (Validated):**
- **User-Delegated OAuth** - Each user authorizes Druids to act on their behalf with each service
- **SSO token ≠ Service token** - SSO token proves user identity to Druids; service tokens are separate
- **GitHub Apps "on behalf of user"** - Uses "user-to-server" tokens with full attribution
- **RFC 8693 Token Exchange** - Optional: mint down-scoped agent tokens with actor claims
- **Dual Attribution** - Preserved in both Druids logs AND service platform logs

**GitHub Specifically:**
When using GitHub App user-to-server tokens:
- GitHub UI shows: User's avatar + app badge
- Audit logs show: User as actor, with fields indicating access via GitHub App
- Example: `alice@company.com via Druids App reviewed PR #123`

**Sources:**
- [GitHub Apps: Authenticating on behalf of a user](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)
- [RFC 8693: OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [OAuth AI Agents on Behalf of User (Draft)](https://www.ietf.org/archive/id/draft-oauth-ai-agents-on-behalf-of-user-01.html)

---

## Architecture Options

### Option 1: OAuth App Registrations (Recommended for MVP)

**Concept:** Druids registers as OAuth application with each service. Users authorize Druids to act on their behalf.

#### Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Authentication                                          │
│    User → Druids (OAuth/OIDC) → Master Token                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Service Authorization (First Time Only)                      │
│    User initiates session requiring GitHub                      │
│    Druids detects: No GitHub token for this user                │
│    Druids redirects: "Authorize Druids to access GitHub"        │
│    User → GitHub OAuth → Authorizes Druids                      │
│    GitHub → Druids: Refresh token + Access token                │
│    Druids stores: Encrypted refresh token for alice@company.com │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Token Exchange (Subsequent Uses)                             │
│    Druid needs GitHub access for alice@company.com              │
│    Token Service:                                               │
│      - Retrieves encrypted refresh token                        │
│      - Exchanges for fresh access token (if expired)            │
│      - Returns scoped access token to elemental                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Elemental Uses Token                                         │
│    GitHub-Elemental receives alice's access token               │
│    Calls GitHub API with token                                  │
│    GitHub audit log shows: alice@company.com (via Druids app)   │
└─────────────────────────────────────────────────────────────────┘
```

#### Implementation

**1. Service Registration (Admin Task)**

Register Druids as OAuth app with each service:

```yaml
# GitHub OAuth App
github:
  client_id: "druids-github-client-id"
  client_secret: "encrypted-client-secret"
  redirect_uri: "https://druids.company.com/oauth/github/callback"
  scopes: ["repo", "read:user", "write:discussion"]

# AWS (via AWS SSO / Identity Center)
aws:
  client_id: "druids-aws-client-id"
  client_secret: "encrypted-client-secret"
  redirect_uri: "https://druids.company.com/oauth/aws/callback"
  scopes: ["read", "write"]

# Slack OAuth App
slack:
  client_id: "druids-slack-client-id"
  client_secret: "encrypted-client-secret"
  redirect_uri: "https://druids.company.com/oauth/slack/callback"
  scopes: ["chat:write", "channels:read", "users:read"]
```

**2. User Authorization Flow (First Time)**

```typescript
// User initiates session requiring GitHub
POST /api/coordination/sessions
{
  "scenarioId": "code-review",
  "druids": ["engineering-druid-1"]
}

// Druids checks: Does alice@company.com have GitHub token?
const githubToken = await getServiceToken("alice@company.com", "github");

if (!githubToken) {
  // Return 401 with authorization URL
  return {
    statusCode: 401,
    error: "SERVICE_AUTHORIZATION_REQUIRED",
    service: "github",
    authorizationUrl: "https://druids.company.com/oauth/github/authorize?user=alice@company.com"
  };
}

// User clicks link, redirected to GitHub
// GitHub OAuth flow:
//   1. User sees: "Druids wants to access your GitHub repositories"
//   2. User clicks "Authorize"
//   3. GitHub redirects back to Druids with authorization code

// Druids callback handler
app.get('/oauth/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = decodeState(state); // "alice@company.com"

  // Exchange code for tokens
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    body: {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI
    }
  });

  const { access_token, refresh_token, expires_in } = tokenResponse;

  // Store encrypted tokens
  await storeServiceTokens({
    userId: userId,
    service: "github",
    accessToken: encrypt(access_token),
    refreshToken: encrypt(refresh_token),
    expiresAt: Date.now() + (expires_in * 1000),
    scopes: ["repo", "read:user", "write:discussion"],
    authorizedAt: Date.now()
  });

  // Redirect back to Druids UI
  res.redirect('/coordination/sessions/resume');
});
```

**3. Token Storage**

```typescript
interface ServiceToken {
  userId: string; // "alice@company.com"
  service: string; // "github", "aws", "slack"
  accessToken: string; // Encrypted
  refreshToken: string; // Encrypted
  expiresAt: Timestamp;
  scopes: string[];
  authorizedAt: Timestamp;
  lastRefreshedAt?: Timestamp;
  revokedAt?: Timestamp;
}

// Stored in secure database with encryption at rest
// Access tokens: Short-lived (1 hour)
// Refresh tokens: Long-lived (no expiration or ~90 days)
```

**4. Token Exchange Service**

```typescript
class ServiceTokenManager {
  async getAccessToken(userId: string, service: string): Promise<string> {
    // Retrieve stored token
    const storedToken = await this.db.getServiceToken(userId, service);

    if (!storedToken) {
      throw new ServiceAuthorizationRequiredError(service);
    }

    if (storedToken.revokedAt) {
      throw new ServiceTokenRevokedError(service);
    }

    // Check if expired
    if (Date.now() >= storedToken.expiresAt) {
      // Refresh token
      return await this.refreshAccessToken(userId, service, storedToken);
    }

    // Return valid access token
    return decrypt(storedToken.accessToken);
  }

  private async refreshAccessToken(
    userId: string,
    service: string,
    storedToken: ServiceToken
  ): Promise<string> {
    const serviceConfig = this.getServiceConfig(service);

    // Exchange refresh token for new access token
    const response = await fetch(serviceConfig.tokenEndpoint, {
      method: 'POST',
      body: {
        grant_type: 'refresh_token',
        refresh_token: decrypt(storedToken.refreshToken),
        client_id: serviceConfig.clientId,
        client_secret: serviceConfig.clientSecret
      }
    });

    const { access_token, refresh_token, expires_in } = response;

    // Update stored token
    await this.db.updateServiceToken(userId, service, {
      accessToken: encrypt(access_token),
      refreshToken: refresh_token ? encrypt(refresh_token) : storedToken.refreshToken,
      expiresAt: Date.now() + (expires_in * 1000),
      lastRefreshedAt: Date.now()
    });

    return access_token;
  }
}
```

**5. Elemental Token Usage**

```typescript
// When elemental needs GitHub access
async function delegateToGitHubElemental(task: Task, userContext: UserContext) {
  // Get user's GitHub access token
  const githubToken = await serviceTokenManager.getAccessToken(
    userContext.userId,
    "github"
  );

  // Pass to elemental
  const result = await githubElemental.execute({
    task: task,
    userContext: {
      userId: userContext.userId,
      assumedDruid: userContext.assumedDruid
    },
    serviceTokens: {
      github: githubToken // Short-lived access token
    }
  });

  return result;
}

// GitHub Elemental uses token for API calls
class GitHubElemental {
  async execute({ task, userContext, serviceTokens }) {
    const octokit = new Octokit({
      auth: serviceTokens.github
    });

    // API call shows as alice@company.com
    await octokit.rest.pulls.createReview({
      owner: 'company',
      repo: 'backend-api',
      pull_number: 123,
      body: 'LGTM',
      event: 'APPROVE'
    });

    // GitHub audit log:
    // alice@company.com approved PR #123 via Druids OAuth App
  }
}
```

#### Pros & Cons

**Pros:**
- ✅ True user attribution (GitHub sees alice@company.com)
- ✅ Standard OAuth flow (well-understood, secure)
- ✅ User controls authorization (can revoke via service)
- ✅ Works with most modern services (GitHub, Slack, Google, etc.)
- ✅ Scoped permissions (request only needed scopes)

**Cons:**
- ❌ Initial setup friction (user must authorize each service)
- ❌ Requires OAuth app registration per service (admin burden)
- ❌ Not all services support OAuth (legacy systems)
- ❌ Token management complexity (refresh, expiration, revocation)

---

### Option 2: Enterprise IDP Integration (Long-term Goal)

**Concept:** Enterprise IDP (Okta, Azure AD, Auth0) manages service integrations. User logs into Druids, IDP provides tokens for integrated services.

#### Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Authentication with IDP                                 │
│    User → Druids → IDP (Okta/Azure AD)                          │
│    IDP authenticates user                                       │
│    IDP returns: Master token + service tokens (if available)    │
│      - GitHub token (IDP has GitHub integration)                │
│      - AWS credentials (IDP has AWS SSO)                        │
│      - Slack token (IDP has Slack integration)                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Druids Uses IDP-Provided Tokens                              │
│    Druids stores tokens for session                             │
│    When elemental needs GitHub: use IDP-provided GitHub token   │
│    When elemental needs AWS: use IDP-provided AWS credentials   │
└─────────────────────────────────────────────────────────────────┘
```

#### Requirements

- Enterprise IDP with service integrations (not always available)
- IDP must be configured to include service tokens in auth response
- Services must trust IDP (federated identity)

#### Pros & Cons

**Pros:**
- ✅ True SSO (one login, all services)
- ✅ No separate authorization steps
- ✅ Centralized credential management (IDP handles it)
- ✅ Enterprise-grade security

**Cons:**
- ❌ Requires enterprise IDP (expensive, complex setup)
- ❌ Not all services integrate with all IDPs
- ❌ Less control for individual users (IT manages)
- ❌ Vendor lock-in

---

### Option 3: Service Accounts per Realm (Simplest, Loses Attribution)

**Concept:** Each realm has service accounts with credentials. All users share these credentials via druids.

#### Flow

```
Engineering Realm:
  - GitHub service account: druids-engineering-bot
  - AWS service account: druids-engineering-role
  - All users in Engineering realm use these accounts

When alice@company.com uses engineering-druid-1:
  - GitHub sees: druids-engineering-bot (not alice)
  - AWS sees: druids-engineering-role (not alice)
```

#### Pros & Cons

**Pros:**
- ✅ Simple setup (one service account per realm)
- ✅ No user authorization required
- ✅ Works with all services (even those without OAuth)

**Cons:**
- ❌ Loses user attribution (audit shows service account)
- ❌ Coarse-grained permissions (all users share same access)
- ❌ Difficult to revoke individual user access
- ❌ Compliance issues (can't prove who did what)

**Use Case:** Acceptable for non-production realms or where attribution isn't critical.

---

## RFC 8693 Token Exchange (Advanced)

**Optional Enhancement:** Use token exchange to create down-scoped agent tokens.

### Pattern

```
User's SSO Token (subject_token)
  +
Druids' Client Credentials (actor_token)
  ↓ RFC 8693 Token Exchange
Down-scoped Token with:
  - sub: alice@company.com (user)
  - act: { sub: "goose-assistant" } (agent acting on behalf)
  - aud: "druids-github-proxy" (specific audience)
```

### Benefits

**Clear Delegation Chain:**
```json
{
  "sub": "alice@company.com",
  "act": {
    "sub": "engineering-druid-1"
  },
  "aud": "druids-mcp-gateway",
  "scope": "github:read github:write:pr"
}
```

**Audit Trail:**
- Token carries: user = Alice, agent = engineering-druid-1, client = Druids
- Druids logs show: alice@company.com → engineering-druid-1 → github-elemental
- GitHub logs show: alice@company.com via Druids App

**Use Cases:**
- Multiple agents acting on behalf of same user
- Need to track which agent performed which action
- Down-scoping tokens for specific operations

### Implementation

```typescript
// Token Exchange Service
class TokenExchangeService {
  async mintAgentToken(
    userToken: string,      // User's SSO token (subject)
    agentId: string,         // Agent acting on behalf (actor)
    audience: string,        // Target service/resource
    scopes: string[]         // Requested permissions
  ): Promise<string> {

    const response = await fetch(IDP_TOKEN_ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: userToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        actor_token: DRUIDS_CLIENT_TOKEN,
        actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        audience: audience,
        scope: scopes.join(' ')
      })
    });

    const { access_token } = await response.json();
    return access_token; // Down-scoped token with actor claims
  }
}

// Usage
const agentToken = await tokenExchange.mintAgentToken(
  session.userToken,           // alice@company.com's token
  "engineering-druid-1",       // Agent ID
  "druids-github-proxy",       // Audience
  ["github:read", "github:write:pr"]
);

// This token contains:
// - User identity (alice@company.com)
// - Agent identity (engineering-druid-1)
// - Scoped permissions (only PR operations)
// - Short-lived (15 minutes)
```

### When to Use

**Use RFC 8693 when:**
- Multiple agents per user session (need to track which agent did what)
- Need fine-grained audit trails (user + agent attribution)
- Want to down-scope permissions per agent/operation
- IDP supports token exchange (Okta, Auth0, Keycloak, etc.)

**Skip RFC 8693 when:**
- Simple single-agent scenarios
- IDP doesn't support token exchange
- Service tokens are sufficient (GitHub already shows "via App")

## Recommended Approach (Validated)

### Phase 1: OAuth App Registration (MVP)

**For services that support OAuth:**
- GitHub, GitLab, Slack, Google Workspace, etc.
- User authorizes Druids on first use
- True user attribution maintained

**For services that don't:**
- Fallback to service accounts (short-term)
- Document as limitation, plan for upgrade

### Phase 2: Enterprise IDP Integration

**For organizations with enterprise IDP:**
- Integrate with Okta, Azure AD, Auth0
- Leverage existing service integrations
- Provides true SSO experience

**For organizations without:**
- Continue with OAuth app approach

### Phase 3: Advanced Federation

**For custom/internal services:**
- Druids as trusted identity provider
- Services accept Druids-issued tokens
- Requires service-side changes

---

## Implementation Roadmap

### Milestone 1: Core OAuth Infrastructure (P0)

- [ ] OAuth callback endpoints for multiple services
- [ ] Encrypted token storage (database schema + encryption)
- [ ] Token refresh mechanism
- [ ] Service authorization required error handling
- [ ] UI for "authorize service" flow

### Milestone 2: Service Integrations (P1)

- [ ] GitHub OAuth integration
- [ ] Slack OAuth integration
- [ ] AWS SSO integration (if available)
- [ ] Service token manager with refresh logic
- [ ] Token revocation API

### Milestone 3: User Management (P1)

- [ ] User dashboard: "Connected services"
- [ ] Revoke service access UI
- [ ] Re-authorize expired services
- [ ] View service token scopes

### Milestone 4: Enterprise IDP (P2)

- [ ] Okta integration (service token passthrough)
- [ ] Azure AD integration
- [ ] Auth0 integration
- [ ] Configuration for IDP-provided service tokens

---

## Database Schema

```sql
-- Service OAuth Configurations (Admin-managed)
CREATE TABLE service_oauth_configs (
  service_id VARCHAR(255) PRIMARY KEY,
  service_name VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  authorization_endpoint TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  scopes TEXT[], -- Array of default scopes
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User Service Tokens (Encrypted)
CREATE TABLE user_service_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  service_id VARCHAR(255) NOT NULL REFERENCES service_oauth_configs(service_id),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  scopes TEXT[],
  authorized_at TIMESTAMP NOT NULL,
  last_refreshed_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, service_id)
);

-- Index for fast token lookup
CREATE INDEX idx_user_service_tokens_lookup
  ON user_service_tokens(user_id, service_id)
  WHERE revoked_at IS NULL;

-- Service Authorization Audit Log
CREATE TABLE service_authorization_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  service_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'authorized', 'refreshed', 'revoked'
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

## Security Considerations

### 1. Encryption

**At Rest:**
- Service tokens encrypted in database
- Encryption keys stored in secure key management service (AWS KMS, HashiCorp Vault)
- Separate encryption keys per environment (dev, staging, production)

**In Transit:**
- TLS for all API calls
- No tokens logged (redacted in logs)

### 2. Token Lifetime

**Access Tokens:**
- Short-lived (1 hour typical)
- Refreshed automatically as needed
- Minimal exposure window

**Refresh Tokens:**
- Long-lived (90 days or no expiration)
- Encrypted at rest
- Rotated on refresh (if service supports)

### 3. Scopes

Request minimal scopes needed:
```yaml
github:
  read_only_druid: ["repo:read", "user:read"]
  write_druid: ["repo", "user:read", "write:discussion"]
  admin_druid: ["repo", "admin:org", "user:read"]
```

### 4. Revocation

Users can revoke Druids' access:
- Via Druids UI: "Disconnect GitHub"
- Via service UI: "Revoke Druids OAuth App"
- Automatic revocation on token refresh failure

---

## User Experience

### First-Time Authorization

```
1. User logs into Druids (SSO)
2. User initiates code review scenario
3. Druids: "This scenario requires GitHub access"
   [Authorize GitHub] button
4. User clicks → redirected to GitHub
5. GitHub: "Druids wants to access your repositories"
   [Authorize] button
6. User authorizes → redirected back to Druids
7. Druids: "GitHub connected! Resuming scenario..."
8. Scenario executes with user's GitHub credentials
```

### Subsequent Uses

```
1. User logs into Druids
2. User initiates code review scenario
3. Scenario executes immediately (GitHub already authorized)
```

### Token Expiration

```
1. User initiates scenario
2. Druids detects: GitHub token expired
3. Druids: Silently refreshes using refresh token
4. Scenario proceeds (user sees no interruption)

If refresh fails:
5. Druids: "GitHub authorization expired, please re-authorize"
6. User clicks [Re-authorize GitHub]
7. OAuth flow repeats
```

---

## API Endpoints

### Service Authorization

```
GET /api/user/me/connected-services
  → List services user has authorized

POST /api/oauth/{service}/authorize
  → Initiate OAuth flow for service

GET /api/oauth/{service}/callback
  → OAuth callback endpoint (handles service redirect)

DELETE /api/user/me/services/{service}
  → Revoke Druids' access to service

POST /api/user/me/services/{service}/reauthorize
  → Re-initiate OAuth flow (expired token)
```

### Admin APIs

```
GET /api/admin/services
  → List configured OAuth services

POST /api/admin/services
  → Add new service OAuth configuration

PUT /api/admin/services/{service}
  → Update service configuration

GET /api/admin/services/{service}/users
  → List users who have authorized this service
```

---

## Next Steps

1. **Design OAuth callback infrastructure** (endpoints, state management)
2. **Implement encrypted token storage** (database schema + encryption)
3. **Build token refresh mechanism** (background job + on-demand)
4. **Create UI for service authorization** (connect/disconnect services)
5. **Integrate first service (GitHub)** (prove concept end-to-end)
6. **Expand to additional services** (Slack, AWS, etc.)
7. **Document for users** ("How to connect services")

---

**Last Updated:** 2025-01-01

**Status:** 🔴 Critical architectural decision needed
