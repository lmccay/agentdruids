# GitHub PR Review Scenario: Integration Outline

## Overview

A simple collaboration session demonstrating Druids orchestration with the existing GitHub MCP Server to discover and review pull requests.

**Key Principle:** The user provides explicit orchestration instructions. The coordinator validates and executes using efficient MCP coordination tools.

## User Command Structure

The user specifies all orchestration details:

```
"Direct code-reviewer-druid-1 to travel to oss-realm and collaborate
with github-elemental-1 to review open pull requests in the druids repository"
```

**Parsed components:**
- **Druid**: `code-reviewer-druid-1` (which specialist to deploy)
- **Realm**: `oss-realm` (destination)
- **Collaborators**: `github-elemental-1` (which agents to work with)
- **Goal**: "review open pull requests in druids repository" (objective)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Druids Platform                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            Coordination Layer (Global)                   │  │
│  │                                                          │  │
│  │  Built-in Coordinator (with MCP coordination tools)      │  │
│  │    1. Parses user command (LLM)                          │  │
│  │    2. Calls: prepare_druid_orchestration()               │  │
│  │       → Validates all components in one call             │  │
│  │    3. Calls: execute_druid_orchestration()               │  │
│  │       → Starts orchestration                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                     │                                           │
│  ┌──────────────────▼──────────────────────────────────────┐  │
│  │              OSS Realm                                   │  │
│  │                                                          │  │
│  │  Code-Reviewer Druid (traveling agent)                   │  │
│  │    • Receives instructions: travel to oss-realm          │  │
│  │    • Collaborate with: github-elemental-1                │  │
│  │    • Goal: review pull requests                          │  │
│  │              │                                           │  │
│  │              └──► Coordinates GitHub Elemental           │  │
│  │                            │                             │  │
│  │  GitHub Elemental (realm-bound)                          │  │
│  │    MCP Client binding to GitHub MCP Server               │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │ MCP Protocol
                              │ (stdio/HTTP)
┌─────────────────────────────▼───────────────────────────────────┐
│              GitHub MCP Server (External)                       │
│              https://github.com/modelcontextprotocol/servers    │
│                                                                 │
│  Available Tools:                                               │
│    • list_pull_requests                                         │
│    • get_pull_request                                           │
│    • create_review_comment                                      │
│    • get_file_contents                                          │
│    • search_repositories                                        │
│                                                                 │
│  Requires: GitHub OAuth token (user-delegated)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Integration Requirements

### 1. GitHub MCP Server Configuration

**External Dependency:** GitHub's public MCP server
- **Source:** https://github.com/modelcontextprotocol/servers/tree/main/src/github
- **Installation:** npm install @modelcontextprotocol/server-github
- **Protocol:** MCP stdio transport or HTTP
- **Authentication:** Expects GitHub OAuth token (PAT or OAuth app token)

**What We Need to Integrate:**
```typescript
// MCP client configuration for GitHub Elemental
interface GitHubMCPBinding {
  serverPath: string;           // Path to GitHub MCP server executable
  transport: "stdio" | "http";  // Communication protocol
  authentication: {
    type: "oauth";
    tokenSource: "user-delegated"; // Use alice's GitHub token
    scopes: ["repo", "read:user"];
  };
}
```

### 2. OSS Realm Configuration

```yaml
realm:
  id: "oss-realm"
  name: "Open Source Development"
  description: "Realm for managing open source repositories and contributions"

  elementals:
    - id: "github-elemental-1"
      name: "GitHub Interface"
      type: "github"
      mcpBinding:
        server: "@modelcontextprotocol/server-github"
        transport: "stdio"
        # Authentication handled by user-delegated token at runtime

      capabilities:
        - list_pull_requests
        - get_pull_request
        - create_review_comment
        - get_file_contents
        - search_repositories
```

### 3. Code-Reviewer Druid Definition

**Important:** Druid does NOT hardcode realm destinations. It receives instructions per session.

```yaml
druid:
  id: "code-reviewer-druid-1"
  name: "Code Review Specialist"
  type: "druid"

  capabilities:
    - code_analysis
    - security_review
    - style_checking
    - comment_generation

  llm_config:
    model: "gpt-4"
    temperature: 0.3
    system_prompt: |
      You are a code reviewer. Analyze pull requests for:
      - Code quality and maintainability
      - Security vulnerabilities
      - Best practices adherence
      - Test coverage
      Provide constructive, specific feedback.

  # NO hardcoded realm or elemental assignments
  # Receives destination and collaborators via coordinator instructions
```

### 4. Built-in Coordinator Configuration

```yaml
coordinator:
  id: "builtin-coordinator"
  name: "Default Coordinator"
  type: "builtin"

  capabilities:
    - task_orchestration
    - agent_validation
    - natural_language_parsing

  mcp_tools:
    # Efficient coordination tools (see coordination-mcp-tools.md)
    - prepare_druid_orchestration
    - execute_druid_orchestration
    - validate_coordination_request

  behavior:
    # Parse natural language → call MCP coordination tools
    # NOT: Generate JSON with hardcoded logic
```

## Workflow: User Command to PR Comment

### User Story

Alice (authenticated user) provides explicit orchestration command:

```
"Direct code-reviewer-druid-1 to travel to oss-realm and collaborate
with github-elemental-1 to review open pull requests in the druids repository"
```

### Step-by-Step Flow

```
1. User Command → Built-in Coordinator
   User: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
          to review open PRs in druids repo"
   ↓
   Built-in Coordinator receives natural language command

2. Coordinator LLM Parses Command
   Coordinator's LLM extracts:
     druidId: "code-reviewer-druid-1"
     realmId: "oss-realm"
     collaboratorIds: ["github-elemental-1"]
     goal: "review open pull requests in druids repository"
   ↓
   Parsed parameters ready for validation

3. Coordinator → MCP Tool: prepare_druid_orchestration
   Coordinator calls MCP tool (ONE call, validates everything):
     prepare_druid_orchestration({
       druidId: "code-reviewer-druid-1",
       realmId: "oss-realm",
       collaboratorIds: ["github-elemental-1"],
       goal: "review open pull requests in druids repository",
       userContext: { userId: "alice", sessionId: "..." }
     })
   ↓
   MCP tool validates:
     ✓ Druid exists and is type "druid"
     ✓ Realm exists
     ✓ Elemental exists and is bound to oss-realm
     ✓ Elemental has GitHub MCP binding
   ↓
   Returns: { valid: true, orchestration: {...} }

4. Coordinator → MCP Tool: execute_druid_orchestration
   Coordinator calls:
     execute_druid_orchestration({
       druidId: "code-reviewer-druid-1",
       realmId: "oss-realm",
       collaboratorIds: ["github-elemental-1"],
       goal: "review open pull requests in druids repository",
       userContext: { userId: "alice", sessionId: "..." }
     })
   ↓
   Creates coordination session with explicit instructions

5. Coordinator → Druid: Travel Instructions
   Coordinator instructs code-reviewer-druid-1:
     "Travel to oss-realm, collaborate with github-elemental-1,
      goal: review open pull requests in druids repository"
   ↓
   Druid receives session-specific instructions (NOT hardcoded)

6. Druid Travels to OSS Realm
   Code-Reviewer Druid → oss-realm
   ↓
   Druid now has access to realm's elementals

7. Druid → Elemental: List PRs
   Code-Reviewer Druid → GitHub Elemental:
     "List open PRs for druids repository"
   ↓
   GitHub Elemental translates to MCP tool call

8. Elemental → GitHub MCP Server: Tool Call
   GitHub Elemental → GitHub MCP Server (via MCP):
     Tool: list_pull_requests
     Params: { owner: "alice", repo: "druids", state: "open" }
     Auth: alice's GitHub OAuth token (user-delegated)
   ↓
   MCP Server executes GitHub API call

9. GitHub MCP Server → GitHub API
   GitHub MCP Server → GitHub REST API:
     GET /repos/alice/druids/pulls?state=open
     Authorization: token <alice's-token>
   ↓
   GitHub returns: [ { number: 123, title: "Add feature X", ... } ]

10. Response Chain: GitHub → MCP → Elemental → Druid
    GitHub API → MCP Server → GitHub Elemental → Code-Reviewer Druid
    ↓
    Druid receives: List of open PRs

11. Druid Reviews First PR (PR #123)
    Code-Reviewer Druid:
      a) Requests PR details via GitHub Elemental
         → MCP: get_pull_request(123)

      b) Requests changed files via GitHub Elemental
         → MCP: get_file_contents(files...)

      c) Analyzes code using LLM (druid's internal capability)
         → Generates review comments

      d) Posts review via GitHub Elemental
         → MCP: create_review_comment(123, comments)

12. Druid → Coordinator: Completion Report
    Code-Reviewer Druid → Built-in Coordinator:
      "Reviewed PR #123. Posted 3 comments."
    ↓
    Coordinator receives completion

13. Coordinator → User: Final Report
    Coordinator → User:
      "✓ Reviewed 1 PR. See comments on GitHub."
```

## Efficiency Analysis: MCP Coordination Tools

### Without Coordination Tools (Old Approach)

```
Coordinator workflow:
1. LLM parses command → 650 tokens
2. Tool: agent_list() → 2000 tokens
3. Tool: realm_list() → 500 tokens
4. Tool: get_elementals_in_realm() → 300 tokens
5. LLM synthesizes validation → 3550 tokens

TOTAL: ~7000 tokens, 5 round-trips
```

### With Coordination Tools (New Approach)

```
Coordinator workflow:
1. LLM parses command → 700 tokens
2. Tool: prepare_druid_orchestration() → 400 tokens (validates ALL)
3. LLM executes → 1050 tokens
4. Tool: execute_druid_orchestration() → 100 tokens

TOTAL: ~2250 tokens, 4 round-trips

SAVINGS: 68% fewer tokens, 20% fewer round-trips
```

## Druid Reusability Across Sessions

**Key advantage:** Same druid, different contexts:

```
Session 1 (Alice):
"Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
 to review PRs in alice/druids"

Session 2 (Bob):
"Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
 to review PRs in bob/myproject"

Session 3 (Carol):
"Direct code-reviewer-druid-1 to enterprise-realm with gitlab-elemental-2
 to review merge requests in carol/internal-tool"
```

Same druid, different users, different realms, different elementals, different repositories.

## User-Delegated Authentication Flow

### First-Time Authorization

```
1. Alice logs into Druids

2. Alice: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1
          to review open PRs in druids repo"

3. Druids detects GitHub access needed:
   "This task requires GitHub access. Authorize?"

4. Alice clicks [Authorize GitHub]

5. OAuth flow:
   Druids → GitHub:
     client_id: druids-app-id
     scope: repo,read:user
     redirect_uri: https://druids.example.com/oauth/callback

6. GitHub shows Alice:
   "Druids wants to access your repositories"

7. Alice approves

8. GitHub → Druids:
   access_token: ghp_abc123...
   refresh_token: ghr_def456...

9. Druids stores (encrypted):
   User: alice@company.com
   Service: github
   Token: ghp_abc123...
   Refresh: ghr_def456...

10. Workflow continues (MCP Server uses alice's token)
```

### Subsequent Requests

```
1. Alice: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1..."

2. Druids retrieves alice's GitHub token (already authorized)

3. Workflow executes immediately (no re-authorization needed)

4. GitHub sees: "alice@company.com (via Druids App)"
```

## Implementation Tasks

### Phase 1: Coordination MCP Tools (PREREQUISITE)

- [ ] **Implement coordination MCP tools** (see `coordination-mcp-tools.md`)
  - prepare_druid_orchestration
  - execute_druid_orchestration
  - validate_coordination_request

- [ ] **Update CoordinationService** to accept pre-validated orchestration
  - Add `orchestration` field to CoordinationRequest
  - Add `createExplicitOrchestrationPlan` method

- [ ] **Update built-in coordinator system prompt** to use MCP tools

### Phase 2: GitHub MCP Server Integration

- [ ] **Install GitHub MCP Server**
  ```bash
  npm install @modelcontextprotocol/server-github
  ```

- [ ] **Create MCP Client Wrapper**
  - Implement stdio transport for MCP protocol
  - Handle tool discovery from MCP server
  - Manage process lifecycle (spawn/kill MCP server)

- [ ] **Token Injection Mechanism**
  - Pass user-delegated GitHub token to MCP server
  - Handle token refresh when expired
  - Secure token storage/retrieval

### Phase 3: GitHub Elemental Implementation

- [ ] **Elemental Agent Class**
  ```typescript
  class GitHubElemental extends Elemental {
    mcpClient: MCPClient;

    async initialize() {
      // Connect to GitHub MCP Server
      this.mcpClient = new MCPClient({
        serverPath: "/path/to/github-mcp-server",
        transport: "stdio",
      });

      // Discover available tools
      const tools = await this.mcpClient.listTools();
    }

    async executeTask(task: Task, userContext: UserContext) {
      // Get user's GitHub token
      const token = await tokenManager.getAccessToken(
        userContext.userId,
        "github"
      );

      // Call MCP tool with user's token
      const result = await this.mcpClient.callTool(
        task.toolName,
        task.params,
        { auth: token }
      );

      return result;
    }
  }
  ```

- [ ] **Register GitHub Elemental in OSS Realm**
  - Add elemental definition to realm configuration
  - Configure MCP binding parameters

### Phase 4: Code-Reviewer Druid Implementation

- [ ] **Druid Agent Class**
  ```typescript
  class CodeReviewerDruid extends Druid {
    // NO hardcoded realm destinations
    // Receives instructions per session

    async reviewPullRequest(prNumber: number, elemental: GitHubElemental) {
      // 1. Get PR details
      const pr = await elemental.executeTask({
        toolName: "get_pull_request",
        params: { pull_number: prNumber }
      }, this.userContext);

      // 2. Get file contents
      const files = await elemental.executeTask({
        toolName: "get_file_contents",
        params: { files: pr.changed_files }
      }, this.userContext);

      // 3. Analyze with LLM
      const review = await this.analyzeCodeWithLLM(files);

      // 4. Post comments
      await elemental.executeTask({
        toolName: "create_review_comment",
        params: {
          pull_number: prNumber,
          comments: review.comments
        }
      }, this.userContext);

      return { status: "reviewed", comments: review.comments.length };
    }
  }
  ```

- [ ] **LLM Integration for Code Analysis**
  - System prompt for code review
  - Structured output format (file, line, comment)

### Phase 5: OAuth Integration

- [ ] **GitHub OAuth App Registration**
  - Register Druids as GitHub OAuth app
  - Configure callback URL
  - Request scopes: `repo`, `read:user`

- [ ] **Authorization Flow Implementation**
  - OAuth initiation endpoint
  - Callback handler
  - Token storage (encrypted)

- [ ] **Token Management**
  - Token refresh logic (OAuth refresh tokens)
  - Token retrieval for MCP calls
  - Token revocation on user logout

## Testing Plan

### Unit Tests

1. **Coordination MCP Tools**
   - prepare_druid_orchestration validates correctly
   - Returns errors for invalid druid/realm/elemental
   - Checks elemental is in target realm

2. **GitHub MCP Client**
   - Connect to MCP server
   - Discover tools
   - Call tools with parameters
   - Handle errors

3. **GitHub Elemental**
   - Execute MCP tool calls
   - Inject user tokens
   - Handle MCP server failures

4. **Code-Reviewer Druid**
   - Receives session-specific instructions (not hardcoded)
   - Parse PR data
   - Generate review comments
   - Coordinate elemental

### Integration Tests

1. **End-to-End Workflow (Mocked GitHub)**
   - User command → Coordinator parses → MCP tools validate → Execute
   - Verify coordination tool usage
   - Verify user context propagation

2. **Real GitHub Integration (Test Repo)**
   - Create test repository with sample PRs
   - Run full workflow against real GitHub
   - Verify comments appear in GitHub UI

3. **Druid Reusability Test**
   - Same druid used in two different sessions
   - Different realms
   - Different elementals
   - Verify no state leakage between sessions

### Manual Testing

1. **First-Time Authorization**
   - User without GitHub token
   - Verify OAuth redirect
   - Verify token storage

2. **PR Review Scenario**
   - User: "Direct code-reviewer-druid-1 to oss-realm with github-elemental-1..."
   - Verify coordination MCP tools called
   - Verify PRs discovered
   - Verify review comments posted
   - Verify GitHub audit shows "alice via Druids"

3. **Reusability Scenario**
   - Session 1: Alice reviews her repo
   - Session 2: Bob reviews his repo (same druid)
   - Verify druid handles different contexts correctly

## Success Criteria

- [ ] Coordination MCP tools implemented and working
- [ ] Coordinator uses efficient MCP tool calls (not multiple list/get)
- [ ] Token usage reduced by ~68% compared to old approach
- [ ] GitHub MCP Server integrated (stdio transport)
- [ ] User can authorize GitHub once via OAuth
- [ ] Code-Reviewer Druid can discover open PRs
- [ ] Druid can review code and post comments
- [ ] GitHub audit logs show user attribution ("alice via Druids")
- [ ] No GitHub credentials stored except user OAuth tokens
- [ ] Same druid can be used in multiple sessions with different contexts
- [ ] Workflow completes in <30 seconds for single PR
- [ ] Error handling for GitHub rate limits, auth failures

## Website Article

See companion document: `/Users/lmccay/Projects/druids/docs/website/github-pr-review-story.md`

---

**Related:**
- [Coordination MCP Tools Implementation](/docs/implementation/coordination-mcp-tools)
- [Architecture Overview](/docs/architecture-overview)
- [User-Delegated Identity](/docs/user-delegated-identity)

---

*Last updated: January 3, 2025*
