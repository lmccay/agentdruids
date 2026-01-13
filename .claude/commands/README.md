# Custom Slash Commands for Druids Project

This directory contains custom slash commands that provide shortcuts for common development tasks.

## Available Commands

### `/rebuild-mcp`
Rebuilds and restarts the MCP server with environment variables. Only reports errors or confirmation.

### `/test-isolation`
Runs session isolation protection tests. Only shows summary and failures.

### `/quick-health`
Quick health check of all Docker services. Summarized output only.

### `/type-check-quick`
Runs TypeScript type checking. Only reports errors if found.

## Token Efficiency

Each command includes instructions to filter output and only report:
- Errors or issues
- Summaries instead of full output
- Confirmations when successful

This minimizes token usage while still providing useful feedback.

## How They Work

1. Slash commands are Markdown files with frontmatter
2. The `name` field determines the slash command (e.g., `/rebuild-mcp`)
3. The `description` helps Claude know when to suggest the command
4. The body contains instructions to Claude about what to run and what to report

## Usage

Simply type the command in Claude Code:
```
/rebuild-mcp
```

Claude will execute the commands and follow the filtering instructions to minimize token usage.

## Adding New Commands

Create a new `.md` file in this directory:

```markdown
---
name: your-command
description: Brief description
---

Your instructions here, including:
- Commands to run
- What output to filter/summarize
- What to report back
```

## Alternative: Shell Aliases

For truly non-model shortcuts that don't need Claude at all, consider adding aliases to your `.bashrc` or `.zshrc`:

```bash
alias druids-rebuild-mcp='cd /path/to/druids && docker-compose build druids-mcp --no-cache && docker-compose --env-file .env up -d druids-mcp'
alias druids-health='cd /path/to/druids && ./scripts/health.sh check'
alias druids-logs-mcp='docker logs druids-mcp -f'
```

These run instantly without any model invocation.
