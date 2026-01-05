# User-Delegated Identity: Eliminating Service Credential Sprawl

## The Service Credential Problem

In our [previous article](/docs/architectural-advantage), we showed how Druids' in-process agent architecture eliminates 99% of infrastructure identity overhead. But there's another layer to the machine identity crisis: **service credentials**.

When agents need to access services like GitHub, Slack, or AWS, how do they authenticate?

## The Traditional Approach: Per-Agent Credentials

Most multi-agent systems give each agent its own credentials for each service:

```
Traditional Model (100 agents, 10 services):

Agent-1:
  ├─ GitHub service account: "agent-1-github-bot"
  ├─ Slack service account: "agent-1-slack-bot"
  ├─ AWS service account: "agent-1-aws-role"
  └─ ... (10 services = 10 credentials)

Agent-2:
  ├─ GitHub service account: "agent-2-github-bot"
  ├─ Slack service account: "agent-2-slack-bot"
  └─ ... (10 services = 10 credentials)

Result: 100 agents × 10 services = 1,000 service credentials
```

**The problems:**
- ❌ **Credential lifecycle nightmare** - Create, rotate, revoke 1,000 credentials
- ❌ **Shadow identities** - 56% of machine credentials are outside IAM visibility (per industry data)
- ❌ **Lost user attribution** - GitHub sees "agent-bot", not "alice@company.com"
- ❌ **Orphaned credentials** - Credentials outlive deleted agents
- ❌ **Compliance gaps** - Can't prove which human authorized which action

## The Core Insight: Agents Act on Behalf of Users

Druids recognizes that **agents don't have their own agency—they act on behalf of users.**

When alice@company.com asks an agent to review a pull request, it's really alice performing that action through automation. The credential should be alice's, not the agent's.

## The Druids Approach: User-Delegated Identity

Instead of giving agents their own credentials, Druids agents use the credentials of the user who invoked them:

```
Druids Model (100 agents, 50 users, 10 services):

User alice@company.com:
  ├─ Authorizes Druids → GitHub (once)
  ├─ Authorizes Druids → Slack (once)
  └─ Authorizes Druids → AWS (once)
  (One-time OAuth authorization per service)

When alice initiates a coordination:
  ├─ engineering-druid-1 acts as alice
  │  └─ Uses alice's GitHub token (retrieved internally)
  ├─ security-druid-2 acts as alice
  │  └─ Uses alice's GitHub token (same token, reused)
  └─ slack-elemental acts as alice
     └─ Uses alice's Slack token (retrieved internally)

Result: 50 users × 10 services = 500 user OAuth tokens
        (Reused by 100 agents based on which user invoked them)

Traditional would need: 100 agents × 10 services = 1,000 credentials
Druids needs: 50 users × 10 services = 500 credentials

Credential reduction: 50%
```

## How It Works

### 1. One-Time User Authorization

Users authorize Druids to access services on their behalf using standard OAuth:

```
Alice logs into Druids
  ↓
Initiates code review scenario
  ↓
Druids: "This requires GitHub access. Authorize?"
  ↓
Alice clicks [Authorize GitHub]
  ↓
Standard OAuth flow (GitHub shows: "Druids wants to access your repositories")
  ↓
Alice authorizes
  ↓
Druids stores alice's OAuth token (encrypted)
  ↓
Done - Alice never needs to authorize GitHub again
```

### 2. Agents Retrieve Tokens Just-in-Time

When agents need service access, they retrieve the user's token internally:

```typescript
// Agent needs to access GitHub
async function executeGitHubTask(task, userContext) {
  // Retrieve user's token (just-in-time)
  const token = await tokenManager.getAccessToken(
    userContext.userId,    // "alice@company.com"
    "github"
  );

  // Use token for this operation
  const octokit = new Octokit({ auth: token });
  await octokit.rest.pulls.createReview({...});

  // Token not stored by agent (retrieved again next time)
}
```

**Key points:**
- Agents don't store credentials
- Tokens retrieved just-in-time per operation
- Automatic token refresh (OAuth refresh tokens)
- Zero standing privileges

### 3. Full User Attribution Maintained

Services see the real user, not a generic bot:

```
GitHub Audit Log:
  ✅ "alice@company.com (via Druids App) approved PR #456"

Not:
  ❌ "agent-bot approved PR #456"
```

## Eliminating Shadow Identities

**Traditional systems create shadow identities** because developers create credentials outside IAM visibility:

```
Developer creates agent:
  ├─ Generates GitHub PAT (Personal Access Token)
  ├─ Stores in config file or environment variable
  └─ IAM team has no visibility

IAM team sees:
  ✓ Alice has GitHub access (via IDP)
  ✗ Alice's 15 PATs for various agents (invisible)
```

**Druids forces all credentials through standard channels:**

```
All credentials flow through visible channels:
  1. IDP: alice authenticated ✓
  2. OAuth: alice authorized Druids → GitHub ✓
  3. Service: GitHub shows "alice via Druids" ✓

IAM team sees everything using existing tools:
  - IDP: Who has Druids access?
  - GitHub admin: Who authorized Druids OAuth app?
  - GitHub audit: What did each user do?

Result: Zero shadow identities
```

## Eliminating Orphaned Credentials

**Traditional systems:** Credentials outlive agents

```
Agent deleted → Credentials forgotten → Orphaned credentials
(Attacker finds abandoned API key → Breach)
```

**Druids:** Credentials tied to humans, not agents

```
Agent deleted → No orphaned credentials
  (Credentials belong to alice, not the agent)

Alice leaves company → IDP revokes access
  → Druids detects alice inactive
  → Revokes all alice's service tokens
  → All agents using alice's tokens lose access
  → Zero orphaned credentials
```

## Automatic Lifecycle Management

| Event | Traditional | Druids |
|-------|------------|--------|
| **Create credential** | 1,000 service accounts to create | 500 OAuth authorizations (one-time) |
| **Rotate credential** | 1,000 credentials to rotate manually | Automatic via OAuth refresh tokens |
| **Agent added** | +10 new credentials needed | +0 credentials (reuses user tokens) |
| **Agent deleted** | Orphaned credentials (manual cleanup) | No orphaned credentials |
| **User leaves** | Find ~20 agent credentials (manual) | Auto-revoke all user's tokens (seconds) |

## The Scaling Difference

This is the critical architectural advantage:

**Traditional:**
- Add 100 more agents → Need 1,000 more credentials (100 × 10)
- Credential count grows with **agents**

**Druids:**
- Add 100 more agents → Need 0 new credentials (agents reuse existing user tokens)
- Credential count grows with **users**, not agents

As your agent fleet scales from 100 to 1,000 agents, traditional systems grow from 1,000 to 10,000 service credentials. Druids stays at 500 (assuming same 50 users).

## Combined with Architectural Advantage

User-delegated identity provides the second half of Druids' identity solution:

**Layer 1: [Infrastructure Identity](/docs/architectural-advantage) (99% reduction)**
```
Traditional: 100 agents = 100 infrastructure identities
Druids: 100 agents = 1 infrastructure identity
```

**Layer 2: Service Credentials (50% reduction)**
```
Traditional: 100 agents × 10 services = 1,000 credentials
Druids: 50 users × 10 services = 500 credentials
```

**Combined Total:**
```
Traditional: 100 + 1,000 = 1,100 total identities
Druids: 1 + 500 = 501 total identities

Total reduction: 54.5%
```

## Industry Validation

These aren't theoretical problems. According to the [2025 CyberArk Identity Security Landscape](https://www.cyberark.com/resources/threat-research-reports/identity-security-threat-landscape):

- **82:1** - Machine identities outnumber humans
- **88%** - Organizations still define only human identities as "privileged"
- **56%** - Machine identities operate outside IAM visibility (shadow identities)
- **42%** - Machine identities have sensitive access
- **25%** - Predicted enterprise breaches from AI agent abuse by 2028

Druids addresses all of these:
- ✅ Reduces machine identity count (credentials scale with users, not agents)
- ✅ All machine actions governed through human identities
- ✅ Zero shadow identities (all credentials through standard channels)
- ✅ Full audit trail (user attribution maintained)
- ✅ Automatic lifecycle management (no orphaned credentials)

## The Bottom Line

The machine identity crisis comes from treating agents as independent entities with their own credentials. Druids recognizes that **agents are tools used by humans**, and models credentials accordingly.

**Traditional approach:**
> "Each agent needs its own credentials for security isolation."
> Result: 1,000 credentials to manage, 560 shadow identities, lost user attribution

**Druids approach:**
> "Agents act on behalf of users—use the user's credentials."
> Result: 500 credentials, zero shadow identities, full user attribution

This isn't just easier to manage—it's **more secure, more compliant, and scales better** as your agent fleet grows.

---

**Previous:** [Architectural Advantage: Infrastructure Identity Reduction](/docs/architectural-advantage)

**Related:**
- [Machine Identity Crisis: Full Analysis](/docs/machine-identity-crisis)
- [Getting Started with Druids](/docs/getting-started)
- [OAuth Integration Guide](/docs/oauth-integration)

---

*Last updated: January 2, 2025*
