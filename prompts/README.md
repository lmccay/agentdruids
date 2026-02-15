# Druids System Prompt Repository

This directory contains centralized system prompts for the Druids multi-agent system.

## Directory Structure

```
prompts/
├── base/              # Global base prompts (Layer 1)
├── agent-types/       # Agent type base prompts (Layer 2)
├── realms/            # Realm-specific context prompts (Layer 3)
└── examples/          # Example templates and documentation
```

## Prompt Layers

1. **Global Base** (`base/global.md`) - Foundation for all agents
2. **Agent Type** (`agent-types/{type}.md`) - Base for druid, elemental, gaia, worldtree
3. **Realm Context** (`realms/{realm}.md`) - Realm-specific guidelines
4. **Agent Extension** (Database) - Per-agent customizations (not in this repo)

## File Format

All prompts are written in **Markdown** with **YAML frontmatter**:

```markdown
---
version: "1.0.0"
metadata:
  name: "Prompt Name"
  description: "What this prompt does"

immutable_sections:
  - "Critical Security Rules"

override_points:
  - "Core Identity"

extension_points:
  - "Domain Expertise"
---

# Section Name

Section content in Markdown...
```

## Security

- **Immutable sections**: Cannot be overridden by later layers
- **Protected sections**: Can be extended but not replaced
- **Override points**: Explicitly allowed overrides
- **Extension points**: Can be appended to

See `docs/SYSTEM_PROMPT_ARCHITECTURE.md` for full design.

## Version Control

These prompts are version controlled. To update:

1. Make changes to prompt files
2. Test with sample agents
3. Commit with semantic versioning
4. Deploy - changes take effect on next agent execution (via cache invalidation)

## Testing

Test prompt changes before deploying:

```bash
# Preview composed prompt for an agent
npm run prompt:preview -- --agent-id=github-elemental-01

# Test prompt composition
npm test -- tests/unit/prompt-composition.test.ts
```
