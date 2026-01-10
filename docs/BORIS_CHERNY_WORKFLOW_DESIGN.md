# Druids Multi-Project Development Workflow
## Inspired by Boris Cherny's Claude Code Approach

**Version:** 1.0
**Date:** January 2026
**Author:** Druids Architecture Team

---

## Table of Contents

1. [Overview](#overview)
2. [Boris Cherny's Key Principles](#boris-chernys-key-principles)
3. [Druids Architecture Design](#druids-architecture-design)
4. [Implementation Strategy](#implementation-strategy)
5. [Development Workflow](#development-workflow)
6. [Conflict Prevention](#conflict-prevention)
7. [Practical Examples](#practical-examples)
8. [Best Practices](#best-practices)

---

## Overview

This document describes how to implement a Boris Cherny-inspired workflow in the Druids multi-agent system, enabling:

- **Reusable agents** across multiple projects without recreation
- **Parallel execution** of 5-10 agents on different aspects of development
- **Project-specific context** through DRUID.md files
- **Verification loops** with automated testing
- **Conflict-free collaboration** through proper task decomposition

### Key Insight

The critical realization: **Use a single Realm with project subdirectories**, not multiple Realms per project. This allows Elementals (which are bound to one Realm) to work across all projects while maintaining project isolation through the filesystem.

---

## Boris Cherny's Key Principles

From his VentureBeat workflow revelation:

1. **CLAUDE.md File for Memory**
   - Single file maintaining project guidelines and learnings
   - Updated whenever Claude makes mistakes
   - Provides context for all future work

2. **Slash Commands**
   - Custom shortcuts checked into repository
   - Handle complex operations with single keystrokes
   - Example: `/commit-push-pr` used dozens of times daily

3. **Verification Loops**
   - Automated testing of every change
   - Claude tests UI changes in browser
   - Iterates until code works and UX feels good

4. **Parallel Web Agents**
   - 5-10 Claude instances working simultaneously
   - Each handles different aspects of development
   - Coordinated to avoid conflicts

5. **Shared Memory**
   - Knowledge accumulation across sessions
   - Project-specific context maintained
   - Guidelines evolve with project

---

## Druids Architecture Design

### Single Realm, Multiple Projects Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                  Development Realm                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Reusable Agents (All bound to this realm)          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │  │
│  │  │ Druid-1  │  │ GitHub-  │  │ Code-    │          │  │
│  │  │Orchestr. │  │Elemental │  │Reviewer  │          │  │
│  │  └──────────┘  └──────────┘  └──────────┘          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │  │
│  │  │ UI/UX    │  │ Backend  │  │ DevOps   │          │  │
│  │  │Elemental │  │Elemental │  │Elemental │          │  │
│  │  └──────────┘  └──────────┘  └──────────┘          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Filesystem Structure (MCP filesystem server):              │
│  /Users/username/Projects/                                  │
│    ├── ecommerce-frontend/                                  │
│    │   ├── DRUID.md                                         │
│    │   ├── .claude/commands/                                │
│    │   └── src/                                             │
│    ├── admin-dashboard/                                     │
│    │   ├── DRUID.md                                         │
│    │   ├── .claude/commands/                                │
│    │   └── src/                                             │
│    └── mobile-app/                                          │
│        ├── DRUID.md                                         │
│        ├── .claude/commands/                                │
│        └── src/                                             │
│                                                              │
│  Content Storage:                                           │
│  ./data/published_content/                                  │
│    ├── ecommerce-frontend/                                  │
│    ├── admin-dashboard/                                     │
│    └── mobile-app/                                          │
└─────────────────────────────────────────────────────────────┘
```

### Why Single Realm?

**Elementals are bound to a single Realm** (`realmAccess.boundRealmId`). Creating multiple Realms would require:
- Duplicating Elementals for each project
- Managing agent proliferation
- Losing the "reusable agent pool" benefit

**Solution:** One Realm contains all projects. Project isolation happens through:
- Filesystem directories
- DRUID.md project context
- Coordination session scoping

---

## Implementation Strategy

### 1. Realm Configuration

Create one development Realm for all projects:

```typescript
{
  name: "development-workspace",
  type: "development",
  description: "Main development realm for all projects",
  configuration: {
    maxAgents: 20,
    allowExternalAccess: true,
    leyLineEndpoint: "/workspace"
  },
  mcpServers: [
    "filesystem",  // Access to ~/Projects/
    "github",      // All GitHub operations
    "slack",       // Team communication
    "web-browser"  // UI testing
  ]
}
```

### 2. Reusable Agent Pool

Create specialized agents bound to the single Realm:

#### Orchestrator (Druid)

```typescript
{
  name: "dev-orchestrator",
  type: "druid",
  realmAccess: {
    accessibleRealms: ["development-workspace"]
  },
  agenticLoop: {
    enabled: true,
    maxIterations: 15,
    trackCosts: true
  },
  systemPrompt: `
    You coordinate development across multiple projects in a single workspace.

    CRITICAL WORKFLOW:
    1. When given a task, identify the project path
    2. ALWAYS read [project-path]/DRUID.md first
    3. Load project-specific rules and agent instructions
    4. Plan task decomposition to avoid file conflicts
    5. Delegate to appropriate Elementals with project context

    CONFLICT PREVENTION:
    - NEVER assign the same file to multiple agents in parallel
    - Create parallel groups for non-overlapping files
    - Use sequential execution for shared files
    - You handle final integration of parallel work

    Project Structure:
    - All projects in /Users/username/Projects/
    - Each project has DRUID.md with specific guidelines
    - Agents are reusable but must follow per-project rules
  `
}
```

#### Specialized Elementals

```typescript
// GitHub Operations Specialist
{
  name: "github-ops",
  type: "elemental",
  domain: "GitHub Operations",
  realmAccess: {
    boundRealmId: "development-workspace"
  },
  mcpTools: ["github:*"],
  agenticLoop: { enabled: true },
  systemPrompt: `
    Expert in GitHub operations (PRs, issues, reviews, merges).

    ALWAYS:
    1. Check project DRUID.md for repo-specific rules
    2. Follow project's branching strategy
    3. Use project's PR template
    4. Respect approval requirements
  `
}

// Code Quality Reviewer
{
  name: "code-reviewer",
  type: "elemental",
  domain: "Code Quality & Testing",
  realmAccess: {
    boundRealmId: "development-workspace"
  },
  agenticLoop: { enabled: true },
  systemPrompt: `
    Review code for bugs, security, best practices, test coverage.

    ALWAYS:
    1. Read project DRUID.md for coding standards
    2. Run project's test suite
    3. Check for security vulnerabilities
    4. Verify tests cover new code
    5. Focus extra attention on areas marked in DRUID.md
  `
}

// UI/UX Validator
{
  name: "ui-validator",
  type: "elemental",
  domain: "User Interface & Experience",
  realmAccess: {
    boundRealmId: "development-workspace"
  },
  mcpTools: ["web-browser:*"],
  systemPrompt: `
    Verify UI changes work correctly, test user flows, check accessibility.

    ALWAYS:
    1. Check DRUID.md for project-specific UI requirements
    2. Test on required viewports (mobile/desktop)
    3. Verify accessibility standards
    4. Test critical user flows
  `
}

// Backend API Specialist
{
  name: "backend-elemental",
  type: "elemental",
  domain: "Backend API Development",
  realmAccess: {
    boundRealmId: "development-workspace"
  },
  systemPrompt: `
    Backend API development, data validation, business logic.

    Read project DRUID.md for:
    - API patterns and conventions
    - Validation requirements
    - Database interaction patterns
  `
}

// Database Specialist
{
  name: "database-elemental",
  type: "elemental",
  domain: "Database Operations",
  realmAccess: {
    boundRealmId: "development-workspace"
  },
  systemPrompt: `
    Database schema design, migrations, query optimization.

    ALWAYS:
    1. Review migration scripts carefully
    2. Check DRUID.md for database rules
    3. Ensure migrations are reversible
    4. Consider performance implications
  `
}
```

### 3. Recommended Agent Roster

For a complete development workflow:

| Agent Type | Name | Domain | Key Responsibilities |
|------------|------|--------|---------------------|
| Druid | `dev-orchestrator` | Coordination | Plan decomposition, conflict prevention, integration |
| Druid | `qa-lead` | Quality Assurance | Test strategy, quality gates, release criteria |
| Elemental | `github-ops` | GitHub/Git | PRs, issues, merges, branch management |
| Elemental | `code-reviewer` | Code Quality | Code review, security, test coverage |
| Elemental | `ui-validator` | Frontend/UX | UI testing, accessibility, responsiveness |
| Elemental | `backend-elemental` | API Development | Backend logic, data validation, APIs |
| Elemental | `database-elemental` | Database/Schema | Migrations, schema, query optimization |
| Elemental | `security-audit` | Security Review | Security analysis, vulnerability scanning |
| Elemental | `doc-writer` | Documentation | API docs, README, user guides |
| Elemental | `devops-elemental` | CI/CD/Deploy | Build, deployment, infrastructure |

This gives you Boris's "5-10 parallel agents" capability while keeping agents reusable across all projects.

---

## Development Workflow

### Phase 1: Project Bootstrap (One-Time Setup)

When starting a new project:

```typescript
// Initialization coordination session
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Initialize new project: ecommerce-frontend

    Project details:
    - Type: React + TypeScript web app
    - Repository: https://github.com/company/ecommerce-frontend
    - Tech stack: React 18, TypeScript, Tailwind CSS, Stripe
    - Team size: 3 developers
    - Standards: ESLint, Prettier, Jest

    Tasks:
    1. Create directory: /Users/username/Projects/ecommerce-frontend
    2. Create initial DRUID.md with project context
    3. Set up .claude/commands/ directory
    4. Initialize Git repository if needed
    5. Create PR template at .github/pull_request_template.md
    6. Set up package.json with scripts
  `,
  participantIds: ["dev-orchestrator", "github-ops"]
}
```

#### Initial DRUID.md Template

```markdown
# Druids Project Guidelines - E-commerce Frontend

## Project Context
React 18 + TypeScript e-commerce application with Stripe integration.

**Repository:** https://github.com/company/ecommerce-frontend
**Team Size:** 3 developers
**Last Updated:** 2026-01-09

## Tech Stack
- Frontend: React 18, TypeScript 5, Tailwind CSS 3
- Testing: Jest, React Testing Library
- Payment: Stripe
- Build: Vite
- CI/CD: GitHub Actions

## Code Standards
- Run `npm run lint` before committing
- All components require unit tests
- Use TypeScript strict mode
- Minimum 80% test coverage
- Follow existing patterns in src/components/

## Common Mistakes (grows over time)
<!-- This section will be populated as we learn -->
<!-- Anytime agents do something incorrectly, add it here -->

## Agent Instructions

### github-ops
- Require 1 approval for PRs
- Run CI checks before merge
- Use branch naming: feature/, bugfix/, hotfix/
- Auto-merge if CI passes and approved

### code-reviewer
- Focus on type safety and test coverage
- Extra scrutiny on src/payment/ directory
- Ensure error handling for all API calls
- Check for console.log statements

### ui-validator
- Test on desktop (1920x1080) and mobile (375x667)
- Verify WCAG AA accessibility compliance
- Check dark mode if component uses theme
- Test all interactive elements

### backend-elemental
- Validate all inputs at API boundary
- Use existing error handling patterns
- Document API endpoints in README

## Critical Areas
- ⚠️ **Payment Processing** (src/payment/) - Requires security review
- ⚠️ **User Authentication** (src/auth/) - Test thoroughly
- ⚠️ **Checkout Flow** - Must work on mobile and desktop

## Custom Commands
Located in `.claude/commands/`:
- `/commit-push-pr` - Commit, push, create PR
- `/test-e2e` - Run end-to-end tests
- `/deploy-staging` - Deploy to staging environment
```

### Phase 2: Feature Development Flow

The complete workflow for adding a feature:

#### Step 1: Planning Phase (Sequential)

```typescript
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend
    Branch: main
    Read DRUID.md first.

    Feature Request: Add product filtering by category and price range

    PLANNING MODE:
    Analyze and create execution plan:

    1. Which files need changes?
    2. What are the module boundaries?
    3. Which agents should handle which files?
    4. What can run in parallel vs sequential?
    5. Where are potential conflicts?

    Output format:
    - Parallel Group 1: [agents + files, no overlaps]
    - Sequential Group 2: [agents + files, run after Group 1]
    - Final Integration: [your tasks]
  `,
  participantIds: ["dev-orchestrator"],
  metadata: { planMode: true }
}
```

**Example Plan Output:**

```markdown
## Feature Plan: Product Filtering

### Analysis
Files to modify:
- src/api/products.ts (add filter params)
- src/api/filters.ts (new file)
- src/components/FilterPanel.tsx (new file)
- src/components/FilterPanel.test.tsx (new file)
- migrations/add_product_filters.sql (new file)
- src/pages/ProductList.tsx (integrate FilterPanel)
- src/hooks/useProductFilter.ts (new file)

### Execution Plan

**Parallel Group 1** (No file conflicts):
- Agent: backend-elemental
  - Files: src/api/products.ts, src/api/filters.ts
  - Task: Add filtering parameters to product API

- Agent: ui-validator
  - Files: src/components/FilterPanel.tsx, FilterPanel.test.tsx
  - Task: Create filter UI component with tests

- Agent: database-elemental
  - Files: migrations/add_product_filters.sql
  - Task: Create migration for filter indexes

**Sequential Group 2** (After Group 1):
- Agent: code-reviewer
  - Files: ALL from Group 1 (review only)
  - Task: Code review and test validation

**Sequential Group 3** (After review passes):
- Agent: ui-validator
  - Files: src/pages/ProductList.tsx, src/hooks/useProductFilter.ts
  - Task: Integrate FilterPanel into ProductList

**Final Integration** (Orchestrator):
- Merge all changes
- Run full test suite
- Create PR if tests pass
```

#### Step 2: Parallel Execution (Non-Overlapping Files)

```typescript
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend
    Branch: feature/product-filtering (create if needed)

    Execute Parallel Group 1 from plan:

    backend-elemental:
    - Edit ONLY: src/api/products.ts, src/api/filters.ts
    - Add filtering parameters (category, priceMin, priceMax)
    - Ensure proper TypeScript types

    ui-validator:
    - Edit ONLY: src/components/FilterPanel.tsx, FilterPanel.test.tsx
    - Create filter UI with category dropdown and price range sliders
    - Write comprehensive tests

    database-elemental:
    - Edit ONLY: migrations/add_product_filters.sql
    - Add indexes for category and price filtering
    - Ensure migration is reversible

    RULES:
    - Do NOT edit files outside your assignment
    - Do NOT commit yet (orchestrator coordinates)
    - Report completion with file paths modified
  `,
  participantIds: [
    "backend-elemental",
    "ui-validator",
    "database-elemental"
  ]
}
```

#### Step 3: Sequential Execution (Shared Files)

```typescript
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend
    Branch: feature/product-filtering

    Code Review (Sequential after Group 1):

    code-reviewer:
    - Review: src/api/products.ts, src/api/filters.ts
    - Review: src/components/FilterPanel.tsx, FilterPanel.test.tsx
    - Review: migrations/add_product_filters.sql
    - Run: npm test
    - Verify: Test coverage >= 80%
    - Report: Any issues found
  `,
  participantIds: ["code-reviewer"]
}
```

```typescript
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend
    Branch: feature/product-filtering

    Integration (Sequential after review passes):

    ui-validator:
    - Edit: src/pages/ProductList.tsx
    - Import and integrate FilterPanel component
    - Create: src/hooks/useProductFilter.ts for state management
    - Update tests for ProductList with filtering
  `,
  participantIds: ["ui-validator"]
}
```

#### Step 4: Final Integration

```typescript
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend
    Branch: feature/product-filtering

    Final Integration:
    1. Verify no merge conflicts
    2. Run: npm run lint
    3. Run: npm test
    4. Run: npm run build (verify production build)
    5. If all pass: stage all changes
    6. Commit with message: "feat: add product filtering by category and price"
    7. Push branch
    8. Delegate to github-ops: Create PR
  `,
  participantIds: ["dev-orchestrator", "github-ops"]
}
```

#### Step 5: Post-Session Learning

```typescript
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend

    Post-session update:

    During feature development, we discovered:
    - Price filter needs validation (negative prices caused errors)
    - Category filter should handle URL encoding

    Update DRUID.md Common Mistakes:
    - ❌ Always validate numeric inputs (price, quantity, etc.)
    - ❌ URL-encode filter parameters before API calls
  `,
  participantIds: ["dev-orchestrator"]
}
```

### Phase 3: DRUID.md Evolution

The DRUID.md file grows organically:

```markdown
## Common Mistakes
<!-- Added after Session 1 -->
- ❌ Don't modify payment state without validatePayment() check

<!-- Added after Session 5 -->
- ❌ Always validate numeric inputs (price, quantity, etc.)
- ❌ URL-encode filter parameters before API calls

<!-- Added after Session 12 -->
- ❌ Don't use useState for form data, use react-hook-form
- ❌ API errors must be logged to error tracking service
```

---

## Conflict Prevention

### The Core Problem

When multiple agents work in parallel, file conflicts occur if they edit the same files simultaneously.

### Solution: Task Decomposition

The orchestrator must decompose features into non-overlapping work:

#### Good Decomposition ✅

```
Parallel Group:
- Agent A: Edit src/api/products.ts
- Agent B: Edit src/components/FilterPanel.tsx
- Agent C: Edit migrations/add_filters.sql

Result: No conflicts (different files)
```

#### Bad Decomposition ❌

```
Parallel Group:
- Agent A: Edit src/api/products.ts (add filtering)
- Agent B: Edit src/api/products.ts (add sorting)

Result: Merge conflict!
```

### Orchestrator's Conflict Prevention Rules

Embedded in orchestrator's system prompt:

```typescript
CONFLICT PREVENTION RULES:

1. ANALYZE BEFORE EXECUTE
   - List all files that need changes
   - Identify overlapping files

2. CREATE TASK GROUPS
   - Parallel: Tasks with zero file overlap
   - Sequential: Tasks touching same files

3. ASSIGN OWNERSHIP
   - One agent per file in parallel groups
   - One agent at a time for shared files

4. EXECUTE IN ORDER
   - Run parallel groups first
   - Then run sequential groups
   - You handle final integration

5. VERIFICATION
   - Check for conflicts before committing
   - Run tests after each group
```

### Handling Shared Files

When multiple agents need to edit the same file:

**Option 1: Sequential Queue**
```typescript
{
  scenarioPrompt: `
    File: src/config/routes.ts needs 3 updates

    EXECUTE SEQUENTIALLY:
    1. backend-elemental: Add /api/export route
       WAIT FOR COMPLETION
    2. backend-elemental: Add /api/import route
       WAIT FOR COMPLETION
    3. security-elemental: Review auth on new routes
  `,
  participantIds: ["backend-elemental", "security-elemental"],
  coordinationStyle: "directive"
}
```

**Option 2: Single Owner with Requirements**
```typescript
{
  scenarioPrompt: `
    File: src/config/routes.ts

    backend-elemental:
    - Add both /api/export AND /api/import routes
    - Requirements from security-elemental:
      - Both routes require authentication
      - Use rate limiting middleware
      - Log all access attempts
  `,
  participantIds: ["backend-elemental"]
}
```

---

## Practical Examples

### Example 1: Simple Bug Fix (Single Agent)

```typescript
{
  scenarioPrompt: `
    Project: /Users/username/Projects/admin-dashboard
    Read DRUID.md first.

    Bug: User profile validation allows empty email
    File: src/validators/user.ts

    Fix:
    1. Add email format validation
    2. Add test for empty email rejection
    3. Run test suite
    4. Create PR if tests pass
  `,
  participantIds: ["backend-elemental", "github-ops"]
}
```

### Example 2: Multi-Module Feature (Parallel)

```typescript
// First: Planning
{
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend

    Feature: User wishlist functionality

    Create execution plan with:
    - Backend API endpoints
    - Database schema
    - Frontend UI component
    - Integration tests

    Ensure no file conflicts.
  `,
  participantIds: ["dev-orchestrator"]
}

// Then: Execute based on plan
// (Orchestrator creates follow-up sessions automatically)
```

### Example 3: Boris's /commit-push-pr Command

Create as `.claude/commands/commit-push-pr.md`:

```markdown
Execute these steps in sequence:

1. **Stage changes**
   ```bash
   git add .
   ```

2. **Create commit** (follow conventional commits)
   - Read git diff to understand changes
   - Generate descriptive commit message
   - Include scope and breaking changes if applicable

3. **Push branch**
   ```bash
   git push -u origin HEAD
   ```

4. **Create PR**
   - Use project's PR template (see .github/pull_request_template.md)
   - Generate PR description from commits
   - Add appropriate labels
   - Request review from code-reviewer agent

5. **Run CI checks**
   - Wait for CI to complete
   - Report status to user
```

Usage:
```typescript
{
  scenarioPrompt: "/commit-push-pr 'Add user export feature'",
  participantIds: ["github-ops"]
}
```

### Example 4: Verification Loop (Boris's Approach)

```typescript
{
  coordinatorId: "dev-orchestrator",
  scenarioPrompt: `
    Project: /Users/username/Projects/ecommerce-frontend

    Verification Loop for checkout flow:

    1. ui-validator: Test checkout flow in browser
       - Add product to cart
       - Proceed to checkout
       - Enter payment details (use test card)
       - Complete purchase
       - Verify confirmation page

    2. If ANY step fails:
       - ui-validator: Document the failure
       - backend-elemental or ui-validator: Fix the issue
       - REPEAT from step 1

    3. If ALL steps pass:
       - code-reviewer: Review changes
       - github-ops: Merge PR

    MAX 5 iterations, then report to human.
  `,
  participantIds: [
    "ui-validator",
    "backend-elemental",
    "code-reviewer",
    "github-ops"
  ],
  metadata: {
    verificationLoop: true,
    maxIterations: 5
  }
}
```

---

## Best Practices

### 1. DRUID.md Maintenance

**DO:**
- ✅ Update after each session with new learnings
- ✅ Keep format consistent across projects
- ✅ Include project-specific conventions
- ✅ Document critical areas requiring extra attention
- ✅ Specify agent-specific instructions

**DON'T:**
- ❌ Let DRUID.md become outdated
- ❌ Include implementation details (keep high-level)
- ❌ Duplicate information that exists elsewhere
- ❌ Make it too long (aim for scannable sections)

### 2. Agent System Prompts

**DO:**
- ✅ Emphasize reading DRUID.md first
- ✅ Include conflict prevention rules
- ✅ Specify verification requirements
- ✅ Define boundaries (what agent should/shouldn't do)

**DON'T:**
- ❌ Hard-code project-specific details
- ❌ Make agents too specialized (reduces reusability)
- ❌ Skip error handling guidance

### 3. Coordination Sessions

**DO:**
- ✅ Start with planning phase for complex features
- ✅ Specify project path explicitly
- ✅ Include "Read DRUID.md first" in prompts
- ✅ Define clear task boundaries
- ✅ Use parallel execution for non-overlapping work

**DON'T:**
- ❌ Assume agents know project context
- ❌ Allow multiple agents to edit same files in parallel
- ❌ Skip verification steps
- ❌ Forget to update DRUID.md after sessions

### 4. Project Organization

**DO:**
- ✅ Keep all projects under single parent directory
- ✅ Use consistent naming conventions
- ✅ Maintain `.claude/commands/` per project
- ✅ Separate published content by project

**DON'T:**
- ❌ Scatter projects across multiple locations
- ❌ Mix personal and work projects in same realm
- ❌ Forget to initialize DRUID.md for new projects

### 5. Slash Commands

**DO:**
- ✅ Create commands for repetitive workflows
- ✅ Store in `.claude/commands/` per project
- ✅ Document required parameters
- ✅ Handle errors gracefully

**DON'T:**
- ❌ Create commands for one-off tasks
- ❌ Hard-code credentials or secrets
- ❌ Skip validation steps

### 6. When to Use Multiple Realms

Only create separate realms for:

1. **Environment Isolation**
   - Production monitoring (read-only access)
   - Staging vs production

2. **Security Boundaries**
   - PCI-compliant payment processing
   - HIPAA-protected health data

3. **Tech Stack Separation**
   - Mobile development (iOS/Android tools)
   - Data science (Python/Jupyter ecosystem)

4. **Team Boundaries**
   - Frontend team vs Backend team
   - Internal tools vs customer-facing

**Default:** Use single realm for all standard development work.

---

## Appendix: Configuration Examples

### Complete Realm Configuration

```typescript
POST /api/realms
{
  "name": "development-workspace",
  "description": "Main development realm for all projects",
  "type": "development",
  "configuration": {
    "maxAgents": 20,
    "allowExternalAccess": true,
    "leyLineEndpoint": "/workspace"
  },
  "mcpServers": ["filesystem", "github", "web-browser", "slack"]
}
```

### Complete Agent Configuration

```typescript
POST /api/agents/create
{
  "name": "dev-orchestrator",
  "type": "druid",
  "description": "Main development coordinator for multi-project workflows",
  "domain": "Software Development Coordination",
  "realmAccess": {
    "accessibleRealms": ["development-workspace"]
  },
  "capabilities": [
    "task-planning",
    "conflict-prevention",
    "multi-agent-coordination",
    "verification-loops"
  ],
  "expertise": [
    "software-architecture",
    "task-decomposition",
    "quality-assurance"
  ],
  "personalityTraits": [
    "methodical",
    "detail-oriented",
    "collaborative"
  ],
  "communicationStyle": "technical",
  "decisionMaking": "analytical",
  "modelId": "analytical-researcher",
  "agenticLoop": {
    "enabled": true,
    "maxIterations": 15,
    "trackCosts": true
  },
  "systemPrompt": "... (see Implementation Strategy section)"
}
```

### Example Coordination Session

```typescript
POST /api/coordinators/coordinate
{
  "scenarioPrompt": `
    Project: /Users/username/Projects/ecommerce-frontend
    Read DRUID.md first.

    Feature: Add product filtering

    Plan, execute in parallel where possible, and create PR.
  `,
  "participantIds": [
    "dev-orchestrator",
    "backend-elemental",
    "ui-validator",
    "database-elemental",
    "code-reviewer",
    "github-ops"
  ],
  "timeoutMinutes": 60,
  "coordinationStyle": "consultative"
}
```

---

## Conclusion

This workflow design enables a Boris Cherny-style development approach in Druids:

- **Reusable agent pool** across all projects
- **Parallel execution** of specialized agents
- **Project context** via DRUID.md files
- **Conflict-free collaboration** through planning
- **Automated verification** with testing loops
- **Knowledge accumulation** over time

The key insight: **Single Realm, Multiple Projects** provides the right balance of agent reusability and project isolation.

---

## Document Maintenance

**Version History:**
- v1.0 (2026-01-09): Initial design document

**Future Enhancements:**
- Automated plan mode implementation
- DRUID.md template generator
- Conflict detection visualization
- Session execution monitoring dashboard

**Feedback:**
Submit issues or suggestions to the Druids development team.
