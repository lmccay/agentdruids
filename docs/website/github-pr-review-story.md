# Your First Druids Collaboration: Automated PR Review

## The Scenario

You maintain open source projects and want help reviewing pull requests. You provide explicit instructions for which specialist to use, where to send them, and what tools they need—then Druids orchestrates everything.

**What you say:**

```
"Direct code-reviewer-druid-1 to travel to oss-realm and collaborate
with github-elemental-1 to review open pull requests in the druids repository"
```

**What happens:** The coordinator validates your request, deploys the code-review specialist to your OSS workspace, and the druid examines pull requests using GitHub integration—all under your GitHub identity.

## The Key Insight: Session-Specific Orchestration

Unlike traditional systems where agents have hardcoded destinations and tools, Druids agents are **reusable specialists** that receive session-specific instructions.

**Traditional approach (rigid):**
```
Code-Reviewer Bot:
  - Always works in OSS realm
  - Always uses GitHub
  - Can't be reused elsewhere
```

**Druids approach (flexible):**
```
Code-Reviewer Druid:
  - Session 1: "Go to oss-realm, use github-elemental-1"
  - Session 2: "Go to enterprise-realm, use gitlab-elemental-2"
  - Session 3: "Go to partner-realm, use bitbucket-elemental-3"
```

Same specialist, different contexts. This is the power of dynamic orchestration.

## The Agents

### Built-in Coordinator (Global Orchestrator)

The coordinator receives your explicit instructions and orchestrates efficiently:

```
You: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
      to review open PRs in druids repo"

Coordinator parses your command:
  → druid: code-reviewer-druid-1
  → realm: oss-realm
  → collaborators: github-elemental-1
  → goal: review open PRs

Coordinator validates (one efficient call):
  → prepare_druid_orchestration(...)
  ✓ Druid exists
  ✓ Realm exists
  ✓ Elemental exists in that realm
  ✓ Ready to execute

Coordinator executes:
  → execute_druid_orchestration(...)
  → Deploys druid with instructions
```

**Efficiency advantage:** The coordinator uses specialized MCP tools that validate everything in one call—68% fewer tokens than making multiple list/get requests.

### Code-Reviewer Druid (Reusable Specialist)

A druid that specializes in code review, but doesn't know where it's going until you tell it:

```
Druid receives instructions:
  "Travel to oss-realm, collaborate with github-elemental-1,
   review open pull requests in druids repository"

Druid executes:
  1. Travels to oss-realm
  2. Discovers github-elemental-1
  3. Coordinates with elemental to review PRs
  4. Reports completion
```

**Key point:** The druid has no hardcoded knowledge of realms or elementals. You specify these per session, making the druid reusable across your entire organization.

### GitHub Elemental (Realm-Bound Tool Interface)

An elemental bound to the OSS Realm that interfaces with GitHub through the Model Context Protocol (MCP):

- **Lists** open pull requests
- **Fetches** PR details and file contents
- **Posts** review comments
- **Maintains** your GitHub identity (all actions appear as you)

Elementals don't leave their realm—they're the local experts on specific tools.

## The Flow

```
1. You → Coordinator
   "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
    to review open PRs in druids repository"

2. Coordinator Parses Command (LLM)
   Extracts:
     druidId: "code-reviewer-druid-1"
     realmId: "oss-realm"
     collaboratorIds: ["github-elemental-1"]
     goal: "review open pull requests"

3. Coordinator → MCP Tool (ONE efficient call)
   prepare_druid_orchestration({
     druidId: "code-reviewer-druid-1",
     realmId: "oss-realm",
     collaboratorIds: ["github-elemental-1"],
     goal: "review open pull requests in druids repository"
   })

   → Validates: ✓ Druid exists, ✓ Realm exists, ✓ Elemental in realm
   → Returns: { valid: true, orchestration: {...} }

4. Coordinator → MCP Tool
   execute_druid_orchestration({...})
   → Creates coordination session
   → Instructs druid with session-specific parameters

5. Druid Receives Instructions
   "Travel to oss-realm, collaborate with github-elemental-1, goal: review PRs"
   [No hardcoded behavior - all session-specific]

6. Druid → OSS Realm
   [Travels to realm]

7. Druid → GitHub Elemental (multiple coordinations)
   • "List open pull requests"
   • "Get PR details"
   • "Get changed files"
   • [Analyzes code with LLM]
   • "Post review comments"

8. GitHub Elemental → GitHub (via MCP)
   [Uses existing GitHub MCP Server]
   [Authenticates with your GitHub token]

9. Druid → Coordinator
   "Reviewed PR #123. Posted 3 comments."

10. Coordinator → You
    "✓ Reviewed 1 PR. See comments on GitHub."
```

## The GitHub Integration

Druids doesn't reimplement GitHub integration—it uses the **existing GitHub MCP Server** provided by the Model Context Protocol ecosystem.

### What is MCP?

The Model Context Protocol (MCP) is an open standard for connecting AI agents to tools and data sources. Think of it like USB for AI agents—a universal connector.

GitHub provides an official MCP server that exposes their API as standard MCP tools:
- `list_pull_requests` - Find open PRs
- `get_pull_request` - Get PR details
- `create_review_comment` - Post review comments
- `get_file_contents` - Read changed files

Druids' GitHub Elemental is an **MCP client** that communicates with this server.

### The Architecture

```
┌─────────────────────────────────────────┐
│         Druids Platform                 │
│                                         │
│  Coordinator → (MCP tools validate)     │
│              ↓                          │
│  Druid (receives instructions)          │
│              ↓                          │
│  GitHub Elemental (MCP client)          │
│              ↓                          │
└──────────────┼──────────────────────────┘
               │ MCP Protocol
               ↓
┌─────────────────────────────────────────┐
│       GitHub MCP Server (External)      │
│    (Provided by MCP ecosystem)          │
│              ↓                          │
└──────────────┼──────────────────────────┘
               │ GitHub REST API
               ↓
┌─────────────────────────────────────────┐
│              GitHub.com                 │
│    (Your repositories and PRs)          │
└─────────────────────────────────────────┘
```

**Key point:** Druids orchestrates agents. The GitHub MCP Server handles GitHub API details. Clean separation of concerns.

## Efficient Coordination via MCP Tools

Traditional multi-agent systems waste tokens making multiple discovery calls. Druids uses specialized coordination MCP tools:

### Without Coordination Tools (Wasteful)

```
1. LLM parses command                    → 650 tokens
2. Tool: agent_list() (50 agents)        → 2000 tokens
3. Tool: realm_list() (10 realms)        → 500 tokens
4. Tool: get_elementals_in_realm()       → 300 tokens
5. LLM synthesizes validation            → 3550 tokens

TOTAL: ~7000 tokens, 5 round-trips
```

### With Coordination Tools (Efficient)

```
1. LLM parses command                        → 700 tokens
2. Tool: prepare_druid_orchestration()       → 400 tokens
   (validates druid, realm, elementals - ONE call)
3. LLM executes orchestration                → 1050 tokens
4. Tool: execute_druid_orchestration()       → 100 tokens

TOTAL: ~2250 tokens, 4 round-trips

SAVINGS: 68% fewer tokens, 20% fewer round-trips
```

**Why this matters:** At scale, this efficiency compounds. Orchestrating 100 tasks uses 225K tokens instead of 700K tokens.

## User-Delegated Identity

When the Code-Reviewer Druid posts comments on GitHub, **GitHub sees you, not a bot**.

### First Time: One-Click Authorization

```
You: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1..."
Druids: "This requires GitHub access. Authorize?"
You: [Click "Authorize GitHub"]
→ Standard OAuth flow (like "Sign in with GitHub")
→ GitHub asks: "Druids wants to access your repositories"
You: [Approve]
Druids: [Stores your OAuth token securely]
→ Workflow continues
```

### Every Time After: Automatic

```
You: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1..."
→ Druids retrieves your GitHub token (already authorized)
→ Workflow executes immediately
→ GitHub audit log shows: "alice@company.com (via Druids App)"
```

**What this means:**
- ✅ No bot accounts to manage
- ✅ No API keys to rotate
- ✅ Full audit trail showing real users
- ✅ Permissions match yours (no privilege escalation)
- ✅ Revoke access by revoking the OAuth app (standard GitHub settings)

## Druid Reusability: The Killer Feature

Because druids receive session-specific instructions (not hardcoded destinations), you can reuse the same specialist across your entire organization:

### Same Druid, Different Contexts

```
Alice (Monday):
"Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
 to review PRs in alice/druids"
→ Uses Alice's GitHub token
→ Reviews Alice's repository

Bob (Tuesday):
"Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
 to review PRs in bob/myproject"
→ Uses Bob's GitHub token
→ Reviews Bob's repository

Carol (Wednesday):
"Direct code-reviewer-druid-1 to enterprise-realm with gitlab-elemental-2
 to review merge requests in carol/internal-tool"
→ Uses Carol's GitLab token
→ Reviews Carol's GitLab project
```

**Same specialist, different:**
- Users (Alice, Bob, Carol)
- Repositories (druids, myproject, internal-tool)
- Realms (oss-realm, enterprise-realm)
- Tools (GitHub, GitLab)

This is impossible with traditional systems where agents have hardcoded configurations.

## The Hierarchy in Action

This scenario demonstrates Druids' three-tier hierarchy:

### Coordinators (Global, Strategic)
- Parse natural language commands
- Validate requests using efficient MCP coordination tools
- Issue session-specific instructions to druids
- Monitor execution and report results
- Example: Built-in Coordinator orchestrates the entire flow

### Druids (Mobile, Specialized)
- Have specific expertise (code review, security audit, etc.)
- Receive session-specific instructions (where to go, who to work with)
- Travel between realms to access tools
- Coordinate multiple elementals for complex tasks
- Example: Code-Reviewer Druid reviews PRs (no hardcoded destinations)

### Elementals (Realm-Bound, Tool Interfaces)
- Bound to specific realms (OSS, Legal, Engineering, etc.)
- Interface with external tools via MCP
- Execute concrete actions
- Example: GitHub Elemental fetches PRs and posts comments

**Why this hierarchy matters:**

Traditional multi-agent systems create a flat structure where every agent can access everything. This creates:
- ❌ Permission sprawl (1,000 agents × 10 tools = 10,000 permissions)
- ❌ Security confusion (which agent should access what?)
- ❌ Coordination chaos (agents stepping on each other)
- ❌ Configuration rigidity (hardcoded tool assignments)

Druids' hierarchy creates natural boundaries:
- ✅ Clear delegation chain (coordinator → druid → elemental)
- ✅ Realm-based access control (elementals bound to realms)
- ✅ Specialized expertise (druids have specific skills)
- ✅ Session-specific orchestration (druids receive instructions, not hardcoded)
- ✅ Simplified permissions (elementals interface with tools, not every agent)

## Realm Structure

The OSS Realm is a **business/functional boundary**, not a tool-level partition:

```
OSS Realm (Open Source Development)
  ├─ GitHub Elemental (code repositories)
  ├─ Slack Elemental (community channels)
  ├─ Discourse Elemental (forum management)
  └─ Analytics Elemental (project metrics)

When Code-Reviewer Druid travels here (per your instructions), it can:
  ✓ Coordinate GitHub Elemental (review PRs)
  ✓ Coordinate Slack Elemental (post review summaries)
  ✓ Coordinate Analytics Elemental (track review metrics)
```

**Not** a tool-specific realm:
```
❌ GitHub Realm
❌ Slack Realm
```

Realms represent areas of your organization (Engineering, Legal, Marketing, OSS) where multiple tools work together.

## Extending This Pattern

Once you have the GitHub PR review scenario working, you can extend it:

### More Specialized Druids

```
"Direct security-druid-2 to oss-realm with github-elemental-1
 to scan PR #123 for vulnerabilities"
→ Security-focused review

"Direct documentation-druid-3 to oss-realm with github-elemental-1
 to check if PR #123 updates relevant docs"
→ Documentation compliance check
```

### More Elementals in OSS Realm

```
"Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
 and slack-elemental-2 to review PR #123 and post summary to #engineering"
→ Multi-tool coordination
```

### Cross-Realm Coordination

```
"Direct compliance-coordinator to orchestrate:
  - security-druid-1 to oss-realm with github-elemental-1 (scan for vulnerabilities)
  - legal-druid-2 to legal-realm with license-checker-elemental-1 (check licenses)
  - audit-druid-3 to compliance-realm with audit-log-elemental-1 (record review)
 to review PR #123 for compliance"
→ Multi-druid, multi-realm orchestration
```

## Why This Matters

This simple scenario demonstrates Druids' core advantages:

### 1. Leverages Existing Ecosystem

Druids doesn't reinvent GitHub integration—it uses the GitHub MCP Server. As the MCP ecosystem grows (Slack, Jira, AWS, etc.), Druids gains new capabilities automatically.

### 2. Session-Specific Orchestration

You tell Druids exactly what to do each time:
- Which specialist (druid)
- Where to send them (realm)
- Which tools they need (elementals)
- What to accomplish (goal)

This flexibility means you're not locked into hardcoded agent configurations.

### 3. Efficient Coordination

Specialized MCP coordination tools reduce token usage by 68% compared to traditional multi-step validation approaches.

### 4. User Identity Preserved

When Druids posts a review comment, GitHub sees **you**. Full audit trail, standard permissions, no shadow bot accounts.

### 5. Druid Reusability

The same code-review specialist can work across:
- Different users (Alice's repos vs Bob's repos)
- Different realms (OSS vs Enterprise)
- Different tools (GitHub vs GitLab vs Bitbucket)

All determined by your session-specific instructions.

## Try It Yourself

The GitHub PR review scenario is a perfect starting point for exploring Druids:

1. **Simple to understand** - "Review PRs" is a concrete, relatable task
2. **Demonstrates hierarchy** - Coordinator → Druid → Elemental in action
3. **Shows MCP integration** - Uses existing GitHub MCP Server
4. **Proves user identity** - GitHub audit shows real user, not bot
5. **Illustrates reusability** - Same druid, different contexts
6. **Demonstrates efficiency** - Coordination MCP tools save 68% tokens
7. **Extends naturally** - Add security review, doc checks, cross-repo analysis

Once this works, you'll understand the Druids pattern for orchestrating any multi-agent workflow with session-specific, reusable agents.

---

**Ready to dive deeper?**

- [Architecture Overview: Understanding Druids' Design](/docs/architecture-overview)
- [Implementation Guide: GitHub PR Review](/docs/implementation/github-pr-review-scenario)
- [Coordination MCP Tools: Efficient Orchestration](/docs/implementation/coordination-mcp-tools)
- [User-Delegated Identity: How Authentication Works](/docs/user-delegated-identity)

---

*Last updated: January 3, 2025*
