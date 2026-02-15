# System Prompt Architecture Design

## Executive Summary

This document describes a flexible, externalized system prompt architecture that supports:

- **Multi-deployment**: Global prompt repositories shared across multiple Druids deployments
- **Layered composition**: Base → Realm-specific → Agent-specific inheritance
- **Flexible storage**: HTTPS endpoints, S3/GCS/Azure Blob, local files, Git repositories
- **Hot reloading**: Dynamic prompt updates without service restarts
- **Versioning**: Explicit version control with rollback capability
- **Caching**: Performance optimization with configurable TTL

## Design Principles

1. **Storage Agnostic**: URL-based abstraction supports any retrievable resource
2. **Composition over Concatenation**: Structured prompt assembly with override points
3. **Human-Friendly Format**: Markdown for natural prompt writing, not config files
4. **Fail-Safe**: Local fallbacks when remote sources are unavailable
5. **Observable**: Audit trail of prompt resolution and composition
6. **Secure**: Authentication for protected prompt repositories
7. **Testable**: Prompt effectiveness validation framework

## Why Markdown Over YAML?

**Prompts are prose, not configuration.** They're long-form natural language instructions written by humans for AI agents. The format should reflect this reality.

### The Problem with YAML

```yaml
# This is painful to write and maintain:
prompt:
  domain_expertise: |
    You are THE GitHub expert in the Engineering realm.

    Your specializations:
    - Pull request review and analysis
    - Code quality assessment

    When reviewing PRs:
    1. Check security first
    2. Assess code quality
    3. Verify tests are present
```

**Issues:**
- ❌ Unnatural for writing prose
- ❌ Requires YAML escaping for special characters
- ❌ Difficult to scan and review
- ❌ Poor Git diffs (structure noise obscures content changes)
- ❌ Not suitable for non-technical prompt engineers

### The Markdown Advantage

```markdown
---
version: "1.0.0"
name: "GitHub Elemental Prompt"
extends: "elemental-base"
override_points: ["domain_expertise"]
---

# Domain Expertise

You are **THE GitHub expert** in the Engineering realm.

## Your Specializations

- Pull request review and analysis
- Code quality assessment
- Repository management

## Review Process

When reviewing PRs:
1. Check security first
2. Assess code quality
3. Verify tests are present
```

**Benefits:**
- ✅ Natural for writing prose
- ✅ Better readability (formatted text, code blocks, emphasis)
- ✅ Clean Git diffs (content-focused changes)
- ✅ Universal format (everyone knows Markdown)
- ✅ Rich formatting without escaping
- ✅ Documentation-ready (renders beautifully)
- ✅ Structured metadata via YAML frontmatter

### Best of Both Worlds

Markdown with YAML frontmatter gives us:
- **Frontmatter**: Structured metadata (version, composition rules)
- **Body**: Natural prose for the actual prompt
- **Sections**: H1 headings define composable sections
- **Formatting**: Rich text, code blocks, lists, emphasis

This is the same pattern used by:
- Jekyll, Hugo, and other static site generators
- Obsidian and other note-taking apps
- MDX (Markdown with React components)
- Many technical documentation systems

---

## Architecture Overview

### Layered Prompt Model

```
┌─────────────────────────────────────────────────────┐
│  Agent-Specific Prompt (Highest Priority)           │
│  "You are GitHub-Elemental. Focus on PR reviews..." │
└──────────────────────┬──────────────────────────────┘
                       │ extends/overrides
┌──────────────────────┴──────────────────────────────┐
│  Realm-Specific Prompt (Medium Priority)            │
│  "In Engineering realm, prioritize code quality..." │
└──────────────────────┬──────────────────────────────┘
                       │ extends/overrides
┌──────────────────────┴──────────────────────────────┐
│  Agent Type Base Prompt (Low Priority)               │
│  "You are an Elemental agent specialized in..."     │
└──────────────────────┬──────────────────────────────┘
                       │ extends
┌──────────────────────┴──────────────────────────────┐
│  Global Base Prompt (Lowest Priority)                │
│  "You are part of the Druids multi-agent system..." │
└─────────────────────────────────────────────────────┘
```

### Prompt Resolution Flow

```
Agent Initialization
  ↓
1. Resolve prompt sources from agent configuration
  ↓
2. Fetch prompts from URL-based sources (with caching)
  ↓
3. Compose prompts using inheritance model
  ↓
4. Apply agent-specific overrides
  ↓
5. Inject runtime context (realm, session, user)
  ↓
Final System Prompt → LLM
```

---

## Prompt Repository Structure

### Example Directory Layout

```
prompts-repository/
├── README.md                           # Repository documentation
├── .version                            # Current prompt version (1.2.0)
│
├── base/
│   ├── global.md                       # Global base prompt (all agents)
│   └── security-policy.md              # Optional: Security policies
│
├── agent-types/
│   ├── druid.md                        # Base prompt for all Druids
│   ├── elemental.md                    # Base prompt for all Elementals
│   ├── gaia.md                         # Base prompt for Gaia agents
│   └── worldtree.md                    # Base prompt for WorldTree
│
├── realms/
│   ├── engineering.md                  # Engineering realm context
│   ├── legal.md                        # Legal realm context
│   ├── marketing.md                    # Marketing realm context
│   ├── finance.md                      # Finance realm context
│   └── security.md                     # Security realm context
│
├── agents/
│   ├── github-elemental.md             # GitHub-specific elemental
│   ├── aws-elemental.md                # AWS-specific elemental
│   ├── slack-elemental.md              # Slack-specific elemental
│   ├── datadog-elemental.md            # Datadog-specific elemental
│   ├── engineering-druid.md            # Engineering-focused druid
│   └── security-druid.md               # Security-focused druid
│
├── examples/
│   └── custom-agent-template.md        # Template for new agents
│
└── tests/
    └── prompt-validation.test.ts       # Automated prompt tests
```

### File Naming Conventions

- **Lowercase with hyphens**: `github-elemental.md` (not `GitHub_Elemental.md`)
- **Descriptive names**: `engineering-realm.md` (not `realm1.md`)
- **Consistent extensions**: Always `.md` for Markdown
- **Version in frontmatter**: Not in filename (no `prompt-v1.0.md`)

### Git Repository Best Practices

```bash
# Repository structure for version control
git://company.com/druids-prompts
├── main                    # Stable prompts for production
├── develop                 # Development/testing prompts
├── feature/new-agent       # Feature branches for new prompts
└── release/v1.2.0          # Release tags

# Deployment references specific versions
url: "git://company.com/druids-prompts@v1.2.0/base/global.md"
```

---

## URL-Based Storage Abstraction

### Supported URL Schemes

| Scheme | Description | Example | Use Case |
|--------|-------------|---------|----------|
| `https://` | Public/private HTTPS endpoints | `https://prompts.example.com/base.md` | Centralized multi-deployment repository |
| `s3://` | AWS S3 buckets | `s3://druids-prompts/base.md` | Cloud-native storage with versioning |
| `gs://` | Google Cloud Storage | `gs://druids-prompts/base.md` | GCP deployments |
| `az://` | Azure Blob Storage | `az://druids-prompts/base.md` | Azure deployments |
| `file://` | Local filesystem | `file:///etc/druids/prompts/base.md` | On-premise deployments |
| `git://` | Git repository | `git://github.com/org/prompts@main/base.md` | Version-controlled prompts |

### Prompt Source Configuration

```yaml
# config/prompt-sources.yaml
prompt_sources:
  global_base:
    url: "https://prompts.druids.cloud/v1/base/global.md"
    fallback: "file:///etc/druids/prompts/base-fallback.md"
    cache_ttl: 3600  # 1 hour
    version: "1.2.0"
    auth:
      type: "bearer"
      token_env: "PROMPT_REPO_TOKEN"

  agent_types:
    druid:
      url: "https://prompts.druids.cloud/v1/agent-types/druid.md"
      fallback: "file:///etc/druids/prompts/druid-fallback.md"
      cache_ttl: 3600

    elemental:
      url: "https://prompts.druids.cloud/v1/agent-types/elemental.md"
      fallback: "file:///etc/druids/prompts/elemental-fallback.md"
      cache_ttl: 3600

    gaia:
      url: "https://prompts.druids.cloud/v1/agent-types/gaia.md"
      fallback: "file:///etc/druids/prompts/gaia-fallback.md"
      cache_ttl: 3600

  realm_specific:
    # Realm prompts can be stored per-deployment or centrally
    base_url: "file:///var/druids/prompts/realms"
    pattern: "{realmId}.md"  # e.g., engineering.md, legal.md
    cache_ttl: 1800  # 30 minutes

  agent_specific:
    # Agent-specific prompts stored locally per deployment
    base_url: "file:///var/druids/prompts/agents"
    pattern: "{agentId}.md"  # e.g., github-elemental-01.md
    cache_ttl: 600  # 10 minutes
    optional: true  # OK if not found

# Alternative: S3-based centralized repository
# global_base:
#   url: "s3://druids-prompts-prod/base/global.md"
#   region: "us-west-2"
#   auth:
#     type: "iam"  # Use IAM role
```

---

## Prompt File Format

### Markdown with YAML Frontmatter

Prompts are written as **Markdown documents** with structured metadata in YAML frontmatter. This combines:
- **Human-friendly prose**: Markdown for the actual prompt content
- **Structured metadata**: YAML frontmatter for versioning, composition rules, etc.
- **Git-friendly**: Clean diffs in version control
- **Universal format**: Everyone knows Markdown

### Format Benefits

✅ **Natural for writing**: Prompt engineers write prose, not config
✅ **Better readability**: Easy to scan and understand
✅ **Git-friendly**: Meaningful diffs in pull requests
✅ **Rich formatting**: Code blocks, emphasis, lists work naturally
✅ **Documentation-ready**: Can render directly in docs sites
✅ **Frontmatter**: Still has structured metadata via YAML header

### Example Prompts

```markdown
<!-- global-base.md -->
---
version: "1.2.0"
metadata:
  name: "Druids Global Base Prompt"
  description: "Foundation prompt for all Druids agents"
  author: "Druids Platform Team"
  last_updated: "2025-02-08"
  tags: ["base", "global", "core"]

override_points:
  - "core_identity"
  - "collaboration"

extension_points:
  - "specialized_capabilities"
  - "realm_context"
  - "agent_personality"
---

# Preamble

You are part of the Druids multi-agent system, a sophisticated platform where specialized agents collaborate to solve complex problems.

# Core Identity

Your responses should be:
- **Precise and actionable**
- **Contextually aware** of your role and realm
- **Collaborative** with other agents when needed
- **Security-conscious** and privacy-respecting

# Security Guidelines

**CRITICAL SECURITY RULES:**
- Never expose credentials or tokens in responses
- Validate all user inputs before processing
- Report suspicious activities to monitoring systems
- Respect realm boundaries and access controls

# Tool Usage

When using tools:
- Always check tool availability before invocation
- Handle tool failures gracefully
- Log tool usage for audit trails
- Respect rate limits and quotas

# Collaboration

When working with other agents:
- Clearly state your capabilities and limitations
- Request delegation when tasks exceed your scope
- Share relevant context without over-sharing
- Acknowledge contributions from other agents
```

```markdown
<!-- elemental-type.md -->
---
version: "1.0.0"
metadata:
  name: "Elemental Agent Type Prompt"
  description: "Base prompt for all Elemental agents"
  author: "Druids Platform Team"
  last_updated: "2025-02-08"
  tags: ["elemental", "agent-type"]

extends: "global-base"

override_points:
  - "core_identity"
  - "specialized_capabilities"

extension_points:
  - "realm_context"
  - "domain_expertise"
  - "tool_specialization"
---

# Core Identity

You are an **Elemental agent** - a specialized expert bound to a specific realm. You have deep expertise in your domain and direct access to realm-specific tools.

## Your Role

- Execute technical tasks within your specialization
- Provide expert insights to Druid coordinators
- Maintain and optimize your domain's operations
- Stay within your realm boundaries

# Specialized Capabilities

As an Elemental, you have:
- **Direct access** to MCP tools within your realm
- **Deep domain knowledge** in your specialization
- **Autonomous operations** capability
- **Domain health responsibility**

# Constraints

You **CANNOT**:
- Travel to other realms (you are bound to your home realm)
- Create or modify other agents
- Access tools outside your granted permissions
- Override coordinator decisions
```

```markdown
<!-- realm-engineering.md -->
---
version: "1.0.0"
metadata:
  name: "Engineering Realm Context"
  realm_id: "engineering"
  description: "Prompt extensions for Engineering realm agents"
  author: "Engineering Team"
  last_updated: "2025-02-08"
  tags: ["engineering", "realm"]

extends: "elemental-type"

extension_points:
  - "domain_expertise"
  - "tool_specialization"
---

# Realm Context

You operate in the **ENGINEERING** realm, which focuses on:
- Software development and code quality
- CI/CD pipelines and deployments
- Infrastructure and cloud resources
- Developer productivity tools

## Engineering Realm Priorities

1. **Code quality and security**
2. **System reliability and uptime**
3. **Developer experience**
4. **Technical debt management**

# Security Guidelines Extension

**Engineering-specific security rules:**
- Always review code for vulnerabilities before deployment
- Flag potential security issues in PRs
- Ensure secrets are never committed to repositories
- Validate infrastructure changes for security implications

# Available Tools

Common tools in Engineering realm:
- **GitHub**: PR review, issue management, code search
- **AWS**: EC2, S3, Lambda, CloudWatch
- **Datadog**: Monitoring, alerts, dashboards
- **PagerDuty**: Incident management
```

```markdown
<!-- agent-github-elemental.md -->
---
version: "1.0.0"
metadata:
  name: "GitHub Elemental Agent Prompt"
  agent_id: "github-elemental-01"
  description: "Specialized GitHub operations agent"
  author: "Engineering Team"
  last_updated: "2025-02-08"
  tags: ["github", "elemental", "code-review"]

extends: "realm-engineering"

override_points:
  - "domain_expertise"

extension_points:
  - "agent_personality"
  - "review_guidelines"
---

# Domain Expertise

You are **THE GitHub expert** in the Engineering realm.

## Your Specializations

- Pull request review and analysis
- Code quality assessment
- Repository management
- GitHub Actions workflows
- Security scanning and vulnerability detection

# Tool Specialization

You have mastered these GitHub MCP tools:

- `github:list_repositories`
- `github:get_pull_request`
- `github:review_pull_request`
- `github:create_issue`
- `github:search_code`

## Tool Usage Patterns

You use these tools to:
- Review PRs for code quality, security, and best practices
- Identify related issues and link them to PRs
- Search codebase for patterns and anti-patterns
- Create issues for discovered problems

# Agent Personality

**Communication style:**
- Technical and precise
- Constructive and encouraging in code reviews
- Proactive about security concerns
- Collaborative with other Engineering agents

**You prefer:**
- Showing code examples in feedback
- Linking to documentation and best practices
- Explaining "why" not just "what"
- Celebrating good code ✨

# Review Guidelines

When reviewing pull requests, follow this process:

1. **Security First**: Check for vulnerabilities
2. **Code Quality**: Assess maintainability and patterns
3. **Testing**: Verify tests are present and meaningful
4. **Performance**: Consider performance implications
5. **Documentation**: Ensure docs are updated
6. **Conventions**: Validate commit messages

## Review Tone

- Start with positive observations
- Frame suggestions as questions when appropriate
- Be explicit about blocking vs. non-blocking issues
- Offer to help or pair program on complex changes
```

---

## Prompt Composition Engine

### Markdown Parsing

Prompts are parsed using standard Markdown libraries with YAML frontmatter support:

```typescript
import matter from 'gray-matter';  // Parse YAML frontmatter
import { marked } from 'marked';   // Parse Markdown to sections

interface MarkdownPrompt {
  frontmatter: {
    version: string;
    metadata: PromptMetadata;
    extends?: string;
    override_points?: string[];
    extension_points?: string[];
  };
  sections: Map<string, string>;  // H1 heading → Markdown content
  raw: string;                     // Original Markdown body
}

function parseMarkdownPrompt(content: string): MarkdownPrompt {
  // Parse frontmatter and body
  const { data, content: body } = matter(content);

  // Parse H1 sections from Markdown
  const sections = new Map<string, string>();
  const tokens = marked.lexer(body);

  let currentSection = '';
  let currentTokens: marked.Token[] = [];

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 1) {
      // Save previous section
      if (currentSection) {
        sections.set(
          currentSection,
          marked.parser(currentTokens)
        );
      }
      // Start new section
      currentSection = token.text;
      currentTokens = [];
    } else {
      currentTokens.push(token);
    }
  }

  // Save final section
  if (currentSection) {
    sections.set(currentSection, marked.parser(currentTokens));
  }

  return {
    frontmatter: data,
    sections,
    raw: body
  };
}
```

### Composition Strategy

```typescript
interface PromptLayer {
  version: string;
  metadata: PromptMetadata;
  sections: Map<string, string>;  // H1 heading → Markdown content
  override_points?: string[];      // Sections that can be replaced
  extension_points?: string[];     // Sections that can be appended
  source_url: string;
  loaded_at: Date;
}

interface ComposedPrompt {
  agent_id: string;
  realm_id?: string;
  agent_type: string;
  layers: PromptLayer[];
  final_prompt: string;
  composition_log: CompositionStep[];
  timestamp: Date;
  cache_key: string;
  ttl: number;
}

interface CompositionStep {
  layer: string;
  action: 'include' | 'override' | 'extend' | 'skip';
  section: string;
  source_url: string;
  reason?: string;
}
```

### Composition Algorithm

```
1. Load Global Base Prompt
   - All sections included as foundation
   - Mark override_points and extension_points

2. Load Agent Type Prompt (e.g., Elemental)
   - For each section:
     - If in override_points: REPLACE base section
     - If in extension_points: APPEND to base section
     - If new section: ADD to composition

3. Load Realm-Specific Prompt (e.g., Engineering)
   - For each section:
     - If in override_points: REPLACE current content
     - If in extension_points: APPEND to current content
     - If new section: ADD to composition

4. Load Agent-Specific Prompt (e.g., GitHub-Elemental)
   - For each section:
     - If in override_points: REPLACE current content
     - If in extension_points: APPEND to current content
     - If new section: ADD to composition

5. Inject Runtime Context
   - Add session_id, user_id, realm_id
   - Add current timestamp
   - Add available tools list

6. Render Final Prompt
   - Concatenate all sections in defined order
   - Apply template variables ({{realm_id}}, {{agent_type}})
   - Return complete system prompt string
```

### Section Ordering

```yaml
# Default section order for final prompt rendering
section_order:
  - preamble
  - core_identity
  - domain_expertise
  - realm_context
  - specialized_capabilities
  - tool_specialization
  - security_guidelines
  - security_guidelines_extension
  - constraints
  - collaboration
  - tool_usage
  - agent_personality
  - review_guidelines  # Domain-specific sections last
  - runtime_context    # Always last
```

---

## Implementation Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                 AgentService                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │  executeAgentPrompt(agentId, prompt, context)   │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │                                  │
│                       ↓                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SystemPromptResolver                            │   │
│  │  - resolvePromptForAgent(agentId)                │   │
│  │  - Returns: ComposedPrompt                       │   │
│  └────────────────────┬─────────────────────────────┘   │
└───────────────────────┼──────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────┐
│         PromptCompositionService                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  composePrompt(agentConfig, realmId)             │   │
│  │  - Loads prompts from multiple sources           │   │
│  │  - Applies composition algorithm                 │   │
│  │  - Returns complete system prompt                │   │
│  └────────┬──────────────────────────────────────────   │
│           │                                              │
│           ├─→ PromptSourceResolver                      │
│           │   - resolveUrl(promptSource)                │
│           │   - Returns: PromptLayer                    │
│           │                                              │
│           ├─→ PromptCache                               │
│           │   - get(cacheKey, ttl)                      │
│           │   - set(cacheKey, prompt, ttl)              │
│           │                                              │
│           └─→ PromptComposer                            │
│               - merge(layers, strategy)                 │
│               - render(sections, order)                 │
└─────────────────────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────┐
│         PromptSourceLoaders (Protocol Handlers)          │
│                                                          │
│  HttpsLoader    S3Loader    FileLoader    GitLoader     │
│  - GET request  - S3 SDK    - fs.readFile - git clone   │
│  - Auth header  - IAM auth  - local path  - checkout    │
└─────────────────────────────────────────────────────────┘
```

### Core Interfaces

```typescript
// src/models/SystemPrompt.ts

export interface PromptSourceConfig {
  url: string;
  fallback?: string;
  cache_ttl?: number;
  version?: string;
  auth?: PromptAuthConfig;
  optional?: boolean;
}

export interface PromptAuthConfig {
  type: 'bearer' | 'basic' | 'iam' | 'none';
  token_env?: string;        // Environment variable name
  username_env?: string;
  password_env?: string;
}

export interface PromptMetadata {
  name: string;
  version: string;
  description?: string;
  extends?: string;
  author?: string;
  last_updated?: string;
  tags?: string[];
}

export interface PromptLayer {
  version: string;
  metadata: PromptMetadata;
  prompt: Record<string, string>;
  override_points?: string[];
  extension_points?: string[];
  source_url: string;
  loaded_at: Date;
}

export interface ComposedPrompt {
  agent_id: string;
  realm_id?: string;
  agent_type: string;
  layers: PromptLayer[];
  final_prompt: string;
  composition_log: CompositionStep[];
  timestamp: Date;
  cache_key: string;
  ttl: number;
}

export interface CompositionStep {
  layer: string;
  action: 'include' | 'override' | 'extend' | 'skip';
  section: string;
  source_url: string;
  reason?: string;
}

export interface RuntimePromptContext {
  session_id?: string;
  user_id?: string;
  realm_id?: string;
  timestamp: string;
  available_tools: string[];
  agent_metadata: Record<string, any>;
}
```

### Service Implementation

```typescript
// src/services/PromptCompositionService.ts

export class PromptCompositionService {
  private sourceResolver: PromptSourceResolver;
  private cache: PromptCache;
  private composer: PromptComposer;
  private config: PromptSourcesConfig;

  constructor(
    sourceResolver: PromptSourceResolver,
    cache: PromptCache,
    config: PromptSourcesConfig
  ) {
    this.sourceResolver = sourceResolver;
    this.cache = cache;
    this.composer = new PromptComposer();
    this.config = config;
  }

  /**
   * Compose complete system prompt for an agent
   */
  async composePrompt(
    agentConfig: Agent,
    runtimeContext: RuntimePromptContext
  ): Promise<ComposedPrompt> {
    // Check cache first
    const cacheKey = this.buildCacheKey(agentConfig, runtimeContext);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log(`🎯 Cache HIT for prompt: ${cacheKey}`);
      return cached;
    }

    console.log(`🔄 Composing prompt for agent: ${agentConfig.id}`);

    // Load prompt layers in order
    const layers: PromptLayer[] = [];
    const compositionLog: CompositionStep[] = [];

    // 1. Global Base Prompt
    try {
      const globalBase = await this.sourceResolver.resolveSource(
        this.config.prompt_sources.global_base
      );
      layers.push(globalBase);
      compositionLog.push({
        layer: 'global_base',
        action: 'include',
        section: '*',
        source_url: globalBase.source_url
      });
    } catch (error) {
      console.error('❌ Failed to load global base prompt:', error);
      throw new Error('Global base prompt is required');
    }

    // 2. Agent Type Prompt
    const agentTypeSource = this.config.prompt_sources.agent_types[agentConfig.type];
    if (agentTypeSource) {
      try {
        const agentTypeLayer = await this.sourceResolver.resolveSource(agentTypeSource);
        layers.push(agentTypeLayer);
        compositionLog.push({
          layer: 'agent_type',
          action: 'extend',
          section: '*',
          source_url: agentTypeLayer.source_url
        });
      } catch (error) {
        console.warn(`⚠️  Failed to load agent type prompt for ${agentConfig.type}:`, error);
      }
    }

    // 3. Realm-Specific Prompt
    if (runtimeContext.realm_id) {
      const realmSource = this.buildRealmPromptSource(runtimeContext.realm_id);
      try {
        const realmLayer = await this.sourceResolver.resolveSource(realmSource);
        layers.push(realmLayer);
        compositionLog.push({
          layer: 'realm_specific',
          action: 'extend',
          section: '*',
          source_url: realmLayer.source_url
        });
      } catch (error) {
        console.warn(`⚠️  Failed to load realm prompt for ${runtimeContext.realm_id}:`, error);
      }
    }

    // 4. Agent-Specific Prompt
    const agentSource = this.buildAgentPromptSource(agentConfig.id);
    try {
      const agentLayer = await this.sourceResolver.resolveSource(agentSource);
      layers.push(agentLayer);
      compositionLog.push({
        layer: 'agent_specific',
        action: 'extend',
        section: '*',
        source_url: agentLayer.source_url
      });
    } catch (error) {
      // Agent-specific prompts are optional
      console.log(`ℹ️  No agent-specific prompt for ${agentConfig.id}`);
      compositionLog.push({
        layer: 'agent_specific',
        action: 'skip',
        section: '*',
        source_url: agentSource.url,
        reason: 'Not found (optional)'
      });
    }

    // Compose final prompt
    const finalPrompt = this.composer.composeLayers(layers, compositionLog);

    // Inject runtime context
    const finalPromptWithContext = this.injectRuntimeContext(
      finalPrompt,
      runtimeContext
    );

    // Build result
    const composedPrompt: ComposedPrompt = {
      agent_id: agentConfig.id,
      realm_id: runtimeContext.realm_id,
      agent_type: agentConfig.type,
      layers,
      final_prompt: finalPromptWithContext,
      composition_log: compositionLog,
      timestamp: new Date(),
      cache_key: cacheKey,
      ttl: this.config.prompt_sources.global_base.cache_ttl || 3600
    };

    // Cache the result
    await this.cache.set(cacheKey, composedPrompt, composedPrompt.ttl);

    return composedPrompt;
  }

  /**
   * Force refresh prompt (invalidate cache)
   */
  async refreshPrompt(agentId: string): Promise<void> {
    await this.cache.invalidate(`prompt:${agentId}:*`);
    console.log(`🔄 Invalidated prompt cache for agent: ${agentId}`);
  }

  private buildCacheKey(agent: Agent, context: RuntimePromptContext): string {
    return `prompt:${agent.id}:${agent.type}:${context.realm_id || 'none'}:v${agent.updatedAt}`;
  }

  private buildRealmPromptSource(realmId: string): PromptSourceConfig {
    const baseUrl = this.config.prompt_sources.realm_specific.base_url;
    const pattern = this.config.prompt_sources.realm_specific.pattern;
    return {
      url: `${baseUrl}/${pattern.replace('{realmId}', realmId)}`,
      cache_ttl: this.config.prompt_sources.realm_specific.cache_ttl,
      optional: true
    };
  }

  private buildAgentPromptSource(agentId: string): PromptSourceConfig {
    const baseUrl = this.config.prompt_sources.agent_specific.base_url;
    const pattern = this.config.prompt_sources.agent_specific.pattern;
    return {
      url: `${baseUrl}/${pattern.replace('{agentId}', agentId)}`,
      cache_ttl: this.config.prompt_sources.agent_specific.cache_ttl,
      optional: true
    };
  }

  private injectRuntimeContext(
    prompt: string,
    context: RuntimePromptContext
  ): string {
    const contextSection = `

---
RUNTIME CONTEXT:
- Session ID: ${context.session_id || 'none'}
- User ID: ${context.user_id || 'system'}
- Realm ID: ${context.realm_id || 'global'}
- Timestamp: ${context.timestamp}
- Available Tools: ${context.available_tools.join(', ')}
---
`;
    return prompt + contextSection;
  }
}
```

---

## Caching Strategy

### Cache Layers

```
┌──────────────────────────────────────┐
│  In-Memory Cache (LRU, 5 min TTL)    │  ← Fastest
│  - Most recently used prompts        │
│  - Small size (100 entries)          │
└──────────────────┬───────────────────┘
                   │ miss
┌──────────────────┴───────────────────┐
│  Redis Cache (30 min - 1 hour TTL)   │  ← Shared across instances
│  - Composed prompts                  │
│  - Medium size (1000 entries)        │
└──────────────────┬───────────────────┘
                   │ miss
┌──────────────────┴───────────────────┐
│  Source Fetch (HTTP/S3/File)         │  ← Slowest
│  - Original prompt files             │
└──────────────────────────────────────┘
```

### Cache Invalidation

```yaml
# Automatic invalidation triggers:
- Agent updated: Invalidate agent-specific prompt
- Realm updated: Invalidate realm-specific prompt
- Manual refresh: Invalidate all layers
- TTL expiration: Natural expiry based on cache_ttl

# Cache keys:
prompt:composed:{agent_id}:{agent_type}:{realm_id}:{version}
prompt:layer:global_base:{version}
prompt:layer:agent_type:{type}:{version}
prompt:layer:realm:{realm_id}:{version}
prompt:layer:agent:{agent_id}:{version}
```

---

## Security Considerations

### Access Control

```typescript
interface PromptAccessPolicy {
  source_url: string;
  authentication: {
    required: boolean;
    type: 'bearer' | 'basic' | 'iam' | 'mtls';
    credentials_source: 'env' | 'secrets_manager' | 'vault';
  };
  ip_whitelist?: string[];
  rate_limiting?: {
    max_requests: number;
    window_seconds: number;
  };
}
```

### Validation

```typescript
interface PromptValidation {
  // Schema validation
  schema_version: string;
  required_sections: string[];

  // Content validation
  max_prompt_length: number;      // e.g., 10,000 characters
  forbidden_patterns: RegExp[];    // e.g., /eval\(/, /exec\(/

  // Signature validation (optional)
  signature?: {
    algorithm: 'sha256' | 'sha512';
    public_key_url: string;
    signature_header: string;
  };
}
```

### Audit Logging

```typescript
interface PromptAuditLog {
  timestamp: Date;
  agent_id: string;
  event: 'composed' | 'cached' | 'invalidated' | 'failed';
  sources: string[];           // URLs accessed
  composition_log: CompositionStep[];
  user_id?: string;
  session_id?: string;
  error?: string;
}
```

---

## Deployment Scenarios

### Scenario 1: Multi-Deployment SaaS

```yaml
# Centralized prompt repository for all customers
prompt_sources:
  global_base:
    url: "https://prompts.druids.cloud/v1/saas/base.md"
    cache_ttl: 3600

  agent_types:
    elemental:
      url: "https://prompts.druids.cloud/v1/saas/elemental.md"

  realm_specific:
    # Customer-specific realm prompts
    base_url: "https://prompts.druids.cloud/v1/customers/{{customer_id}}/realms"
    pattern: "{realmId}.md"

  agent_specific:
    # Per-deployment agent customizations
    base_url: "file:///var/druids/prompts/agents"
    pattern: "{agentId}.md"
    optional: true
```

**Benefits:**
- Centralized prompt updates across all customers
- Customer-specific realm customizations
- Per-deployment agent overrides for testing

### Scenario 2: On-Premise Enterprise

```yaml
# All prompts stored locally with Git version control
prompt_sources:
  global_base:
    url: "git://internal-git.corp/druids-prompts@v1.2.0/base/global.md"
    cache_ttl: 7200  # 2 hours (stable environment)

  agent_types:
    elemental:
      url: "git://internal-git.corp/druids-prompts@v1.2.0/agent-types/elemental.md"

  realm_specific:
    base_url: "file:///etc/druids/prompts/realms"
    pattern: "{realmId}.md"

  agent_specific:
    base_url: "file:///etc/druids/prompts/agents"
    pattern: "{agentId}.md"
```

**Benefits:**
- No external dependencies
- Version-controlled prompts with Git
- Internal approval process for prompt changes

### Scenario 3: Hybrid Cloud

```yaml
# Base prompts from cloud, customizations local
prompt_sources:
  global_base:
    url: "https://prompts.druids.cloud/v1/base/global.md"
    fallback: "file:///etc/druids/prompts/base-fallback.md"

  agent_types:
    elemental:
      url: "s3://company-druids-prompts/agent-types/elemental.md"
      region: "us-west-2"
      auth:
        type: "iam"

  realm_specific:
    base_url: "s3://company-druids-prompts/realms"
    pattern: "{realmId}.md"

  agent_specific:
    base_url: "file:///var/druids/prompts/agents"
    pattern: "{agentId}.md"
```

**Benefits:**
- Shared base prompts from cloud (always up-to-date)
- Company-specific customizations in S3
- Agent-level testing locally

---

## Hot Reload & Versioning

### Hot Reload Mechanism

```typescript
class PromptWatcher {
  private watchers: Map<string, FSWatcher> = new Map();

  async watchPromptSource(source: PromptSourceConfig): Promise<void> {
    if (source.url.startsWith('file://')) {
      const filePath = source.url.replace('file://', '');
      const watcher = fs.watch(filePath, async (event) => {
        if (event === 'change') {
          console.log(`🔄 Detected change in prompt: ${filePath}`);
          await this.promptCompositionService.invalidateCache(source.url);
          await this.notifyAgentsOfPromptChange(source.url);
        }
      });
      this.watchers.set(source.url, watcher);
    }
  }

  private async notifyAgentsOfPromptChange(sourceUrl: string): Promise<void> {
    // Find all agents using this prompt source
    const affectedAgents = await this.findAgentsUsingPrompt(sourceUrl);

    // Emit event for monitoring
    eventEmitter.emit('prompt:updated', {
      source_url: sourceUrl,
      affected_agents: affectedAgents.map(a => a.id),
      timestamp: new Date()
    });

    // Agents will use new prompt on next invocation
    console.log(`📢 Notified ${affectedAgents.length} agents of prompt update`);
  }
}
```

### Version Management

```yaml
# Explicit version pinning
prompt_sources:
  global_base:
    url: "https://prompts.druids.cloud/v1/base/global.md"
    version: "1.2.0"  # Explicit version
    version_check: true

  agent_types:
    elemental:
      url: "https://prompts.druids.cloud/v1/agent-types/elemental.md"
      version: "latest"  # Always use latest
      version_check: false
```

**Version Check Process:**
1. Fetch prompt from URL
2. Parse `version` from YAML frontmatter
3. Compare with `version` in config
4. If mismatch and `version_check: true`:
   - Log warning
   - Use fallback prompt (if configured)
   - Alert monitoring system
5. If match or version_check: false:
   - Use fetched prompt

---

## Migration Plan

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Basic infrastructure without breaking existing functionality

- [ ] Create `PromptSourceResolver` interface
- [ ] Implement `FileLoader` (local files)
- [ ] Implement `HttpsLoader` (HTTPS endpoints)
- [ ] Create `PromptComposer` with basic merge logic
- [ ] Add `PromptCache` using Redis
- [ ] Update `AgentService` to use new prompt resolution (with fallback to old logic)

**Testing:**
- Load prompts from local Markdown files
- Cache validation
- Fallback to existing `agent.llmConfig.systemPrompt`

### Phase 2: Storage Expansion (Weeks 3-4)

**Goal:** Support cloud storage backends

- [ ] Implement `S3Loader` using AWS SDK
- [ ] Implement `GCSLoader` using Google Cloud SDK
- [ ] Implement `AzureLoader` using Azure SDK
- [ ] Add authentication support (bearer tokens, IAM)
- [ ] Create configuration schema (`config/prompt-sources.yaml`)

**Testing:**
- S3 bucket access with IAM roles
- HTTPS with bearer token authentication
- Fallback chain (primary → fallback → hardcoded)

### Phase 3: Composition Engine (Weeks 5-6)

**Goal:** Implement layered prompt composition

- [ ] Add Markdown parsing libraries (`gray-matter`, `marked`)
- [ ] Define Markdown format with YAML frontmatter
- [ ] Implement `override_points` logic
- [ ] Implement `extension_points` logic
- [ ] Create section ordering system (based on H1 headings)
- [ ] Add composition logging for debugging
- [ ] Build prompt management API endpoints

**Testing:**
- Multi-layer composition
- Override vs. extend behavior
- Section ordering validation

### Phase 4: Hot Reload & Monitoring (Weeks 7-8)

**Goal:** Dynamic updates and observability

- [ ] Implement `PromptWatcher` for file-based sources
- [ ] Add cache invalidation API endpoints
- [ ] Create prompt audit logging
- [ ] Add Prometheus metrics for prompt resolution
- [ ] Build Grafana dashboard for prompt usage

**Metrics:**
- Prompt resolution time
- Cache hit/miss ratio
- Composition errors
- Source fetch failures

### Phase 5: UI & Management (Weeks 9-10)

**Goal:** User-friendly prompt management

- [ ] Add prompt management page to frontend
- [ ] Display composition layers for each agent
- [ ] Show prompt source configuration
- [ ] Add "Test Prompt" functionality
- [ ] Implement prompt version comparison

**UI Features:**
- View final composed prompt for any agent
- See composition log (which sources were used)
- Test prompt changes before deployment
- Compare prompt versions side-by-side

### Phase 6: Advanced Features (Weeks 11-12)

**Goal:** Production-ready enhancements

- [ ] Implement `GitLoader` with branch/tag support
- [ ] Add prompt signature validation
- [ ] Create prompt effectiveness testing framework
- [ ] Implement A/B testing for prompts
- [ ] Add prompt drift detection

---

## Testing Strategy

### Unit Tests

```typescript
describe('MarkdownPromptParser', () => {
  it('should parse YAML frontmatter correctly', () => {
    const content = `---
version: "1.0.0"
metadata:
  name: "Test Prompt"
override_points: ["core_identity"]
---

# Core Identity

Test content
`;
    const parsed = parseMarkdownPrompt(content);
    expect(parsed.frontmatter.version).toBe('1.0.0');
    expect(parsed.frontmatter.override_points).toContain('core_identity');
    expect(parsed.sections.get('Core Identity')).toContain('Test content');
  });

  it('should parse multiple H1 sections', () => {
    const content = `# Section 1\nContent 1\n\n# Section 2\nContent 2`;
    const parsed = parseMarkdownPrompt(content);
    expect(parsed.sections.size).toBe(2);
    expect(parsed.sections.get('Section 1')).toContain('Content 1');
    expect(parsed.sections.get('Section 2')).toContain('Content 2');
  });
});

describe('PromptCompositionService', () => {
  it('should compose prompts with correct inheritance', async () => {
    const layers = [
      { sections: new Map([['Core Identity', 'base']]), override_points: [] },
      { sections: new Map([['Core Identity', 'override']]), override_points: ['Core Identity'] }
    ];
    const result = composer.composeLayers(layers);
    expect(result).toContain('override');
    expect(result).not.toContain('base');
  });

  it('should extend sections correctly', async () => {
    const layers = [
      { sections: new Map([['Skills', 'skill1']]), extension_points: ['Skills'] },
      { sections: new Map([['Skills', 'skill2']]), extension_points: [] }
    ];
    const result = composer.composeLayers(layers);
    expect(result).toContain('skill1');
    expect(result).toContain('skill2');
  });

  it('should use fallback on source failure', async () => {
    const source = {
      url: 'https://unreachable.example.com/prompt.md',
      fallback: 'file:///etc/druids/fallback.md'
    };
    const result = await resolver.resolveSource(source);
    expect(result.source_url).toBe('file:///etc/druids/fallback.md');
  });
});
```

### Integration Tests

```typescript
describe('End-to-End Prompt Resolution', () => {
  it('should compose prompt for GitHub elemental in Engineering realm', async () => {
    const agent = await agentService.getAgent('github-elemental-01');
    const context = { realm_id: 'engineering', session_id: 'test-123' };

    const composed = await promptService.composePrompt(agent, context);

    expect(composed.layers).toHaveLength(4);  // global, type, realm, agent
    expect(composed.final_prompt).toContain('GitHub expert');
    expect(composed.final_prompt).toContain('Engineering realm');
    expect(composed.final_prompt).toContain('security');
  });

  it('should cache composed prompts', async () => {
    const agent = await agentService.getAgent('test-agent');
    const context = { realm_id: 'test' };

    const first = await promptService.composePrompt(agent, context);
    const second = await promptService.composePrompt(agent, context);

    expect(first.cache_key).toBe(second.cache_key);
    expect(second.timestamp).toBe(first.timestamp);  // Cached
  });
});
```

### Performance Tests

```typescript
describe('Prompt Resolution Performance', () => {
  it('should resolve cached prompts in <10ms', async () => {
    // Pre-warm cache
    await promptService.composePrompt(agent, context);

    const start = Date.now();
    await promptService.composePrompt(agent, context);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10);
  });

  it('should handle 100 concurrent prompt resolutions', async () => {
    const promises = Array(100).fill(null).map(() =>
      promptService.composePrompt(agent, context)
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    expect(results.every(r => r.final_prompt.length > 0)).toBe(true);
  });
});
```

---

## API Endpoints

### Prompt Management API

```typescript
// GET /api/prompts/sources
// Returns: List of configured prompt sources
{
  "sources": {
    "global_base": {
      "url": "https://prompts.druids.cloud/v1/base/global.yaml",
      "version": "1.2.0",
      "cache_ttl": 3600,
      "status": "healthy"
    },
    // ...
  }
}

// GET /api/prompts/agent/:agentId
// Returns: Composed prompt for specific agent
{
  "agent_id": "github-elemental-01",
  "agent_type": "elemental",
  "realm_id": "engineering",
  "layers": [
    {
      "layer": "global_base",
      "source_url": "https://...",
      "version": "1.2.0"
    },
    // ...
  ],
  "final_prompt": "You are part of the Druids...",
  "composition_log": [...],
  "cached": true,
  "timestamp": "2025-01-15T10:30:00Z"
}

// POST /api/prompts/agent/:agentId/refresh
// Invalidates cache and forces prompt recomposition
{
  "message": "Prompt cache invalidated for agent",
  "agent_id": "github-elemental-01"
}

// POST /api/prompts/test
// Test prompt composition with hypothetical configuration
{
  "agent_type": "elemental",
  "realm_id": "engineering",
  "agent_specific_overrides": {
    "domain_expertise": "Custom expertise..."
  }
}
// Returns: ComposedPrompt (not cached)

// GET /api/prompts/layers/:layer
// Returns raw content of specific prompt layer
// Layers: global_base, agent_type, realm, agent_specific
{
  "layer": "global_base",
  "content": {...},
  "metadata": {...},
  "source_url": "https://...",
  "version": "1.2.0"
}
```

---

## Monitoring & Observability

### Metrics

```yaml
# Prometheus metrics
druids_prompt_resolution_duration_seconds{layer="global_base"}
druids_prompt_resolution_duration_seconds{layer="agent_type"}
druids_prompt_resolution_duration_seconds{layer="realm"}
druids_prompt_resolution_duration_seconds{layer="agent_specific"}

druids_prompt_cache_hits_total{layer="global_base"}
druids_prompt_cache_misses_total{layer="global_base"}

druids_prompt_source_fetch_errors_total{source_url="https://..."}
druids_prompt_composition_errors_total{agent_id="...",reason="..."}

druids_prompt_layer_size_bytes{layer="..."}
druids_prompt_final_size_bytes{agent_type="..."}
```

### Alerting Rules

```yaml
# Alert when prompt sources are unreachable
- alert: PromptSourceUnreachable
  expr: druids_prompt_source_fetch_errors_total > 10
  for: 5m
  annotations:
    summary: "Prompt source {{ $labels.source_url }} unreachable"

# Alert when cache hit rate drops
- alert: PromptCacheHitRateLow
  expr: rate(druids_prompt_cache_hits_total[5m]) / rate(druids_prompt_cache_requests_total[5m]) < 0.8
  for: 10m
  annotations:
    summary: "Prompt cache hit rate below 80%"

# Alert when prompt composition takes too long
- alert: PromptCompositionSlow
  expr: druids_prompt_resolution_duration_seconds > 1.0
  for: 5m
  annotations:
    summary: "Prompt composition taking >1s"
```

---

## Open Questions & Future Enhancements

### Open Questions

1. **Prompt Effectiveness Measurement**
   - How do we measure if a prompt change improves agent performance?
   - Metrics: task success rate, user satisfaction, error rate, etc.

2. **Prompt Versioning Strategy**
   - Should we support multiple prompt versions simultaneously?
   - How to handle gradual rollout of new prompts?

3. **Prompt Templates**
   - Should we support template variables beyond runtime context?
   - Example: `{{company_name}}`, `{{industry}}`, etc.

4. **Multi-Language Support**
   - Should prompts support multiple languages?
   - How to structure language-specific overrides?

5. **Prompt Testing Framework**
   - How to validate prompt quality before deployment?
   - Automated testing with known inputs/outputs?

### Future Enhancements

1. **Prompt Evolution Engine**
   - A/B testing framework for prompt variations
   - Automatic prompt optimization based on success metrics
   - ML-driven prompt suggestion system

2. **Visual Prompt Builder**
   - Drag-and-drop UI for prompt composition
   - Live preview of final prompt
   - Template library with best practices

3. **Prompt Analytics**
   - Track which prompt sections are most effective
   - Identify unused or redundant sections
   - Measure prompt token efficiency

4. **Collaborative Prompt Management**
   - Multi-user prompt editing with version control
   - Review/approval workflow for prompt changes
   - Diff viewer for prompt versions

5. **Prompt Marketplace**
   - Community-contributed prompt templates
   - Industry-specific prompt libraries
   - Best practices repository

---

## Conclusion

This design provides a flexible, scalable system for managing agent prompts across diverse deployment scenarios. The URL-based abstraction enables centralized management while supporting local customization, and the layered composition model allows for maintainable inheritance of prompt logic.

**Key Benefits:**
- ✅ **Flexibility**: Works with any URL-addressable storage
- ✅ **Scalability**: Centralized prompts for multi-deployment
- ✅ **Performance**: Multi-layer caching strategy
- ✅ **Maintainability**: Layered composition with clear override rules
- ✅ **Human-friendly**: Markdown format for natural prompt writing
- ✅ **Git-friendly**: Clean diffs and version control
- ✅ **Security**: Authentication and validation built-in
- ✅ **Observability**: Comprehensive logging and metrics

**Next Steps:**
1. Review this design with stakeholders
2. Prioritize Phase 1 implementation
3. Create sample prompt files for testing
4. Begin development of core infrastructure

---

**Document Version:** 1.0.0
**Last Updated:** 2025-02-08
**Author:** Druids Architecture Team
**Status:** Draft for Review
