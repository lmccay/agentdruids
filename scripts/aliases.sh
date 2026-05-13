#!/bin/bash
# Shell aliases for common Druids development tasks
# These run WITHOUT invoking Claude Code - zero token usage
#
# Usage: Source this file in your shell:
#   source scripts/aliases.sh
# Or add to your ~/.bashrc or ~/.zshrc:
#   source /path/to/druids/scripts/aliases.sh

# Get the project root directory
DRUIDS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Environment management
alias druids-start="cd $DRUIDS_ROOT && ./scripts/dev.sh start"
alias druids-stop="cd $DRUIDS_ROOT && ./scripts/dev.sh stop"
alias druids-restart="cd $DRUIDS_ROOT && ./scripts/dev.sh stop && ./scripts/dev.sh start"

# Health checks
alias druids-health="cd $DRUIDS_ROOT && ./scripts/health.sh check"
alias druids-health-full="cd $DRUIDS_ROOT && ./scripts/health.sh detailed"

# Logs (with follow)
alias druids-logs-app="docker logs druids-app -f"
alias druids-logs-mcp="docker logs druids-mcp -f"
alias druids-logs-ui="docker logs druids-ui -f"
alias druids-logs-all="docker-compose -f $DRUIDS_ROOT/docker-compose.yml logs -f"

# Quick rebuilds
alias druids-rebuild-app="cd $DRUIDS_ROOT && docker-compose build druids-app --no-cache && docker-compose --env-file .env up -d druids-app && docker logs druids-app --tail 20"
alias druids-rebuild-mcp="cd $DRUIDS_ROOT && docker-compose build druids-mcp --no-cache && docker-compose --env-file .env up -d druids-mcp && docker logs druids-mcp --tail 20"
alias druids-rebuild-ui="cd $DRUIDS_ROOT && docker-compose build druids-ui --no-cache && docker-compose --env-file .env up -d druids-ui && docker logs druids-ui --tail 20"
alias druids-rebuild-all="cd $DRUIDS_ROOT && docker-compose build --no-cache && ./scripts/dev.sh start"

# Testing shortcuts
alias druids-test="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-app npm test"
alias druids-test-unit="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-app npm run test:unit"
alias druids-test-integration="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-app npm run test:integration"

# Type checking and linting
alias druids-typecheck="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-app npm run type-check"
alias druids-lint="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-app npm run lint"
alias druids-lint-fix="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-app npm run lint:fix"

# Container management
alias druids-ps="docker-compose -f $DRUIDS_ROOT/docker-compose.yml ps"
alias druids-stats="docker stats druids-app druids-mcp druids-ui druids-redis druids-postgres druids-ollama"
alias druids-shell-app="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-app /bin/sh"
alias druids-shell-mcp="docker-compose -f $DRUIDS_ROOT/docker-compose.yml exec druids-mcp /bin/sh"

# Cleanup
alias druids-clean="cd $DRUIDS_ROOT && docker-compose down -v && docker system prune -f"
alias druids-reset="cd $DRUIDS_ROOT && docker-compose down -v && docker-compose build --no-cache && ./scripts/dev.sh start"

echo "Druids development aliases loaded!"
echo "Examples:"
echo "  druids-start          - Start all services"
echo "  druids-logs-mcp       - Follow MCP server logs"
echo "  druids-rebuild-app    - Rebuild and restart app server"
echo "  druids-test-isolation - Run session protection tests"
echo "  druids-health         - Check service health"
