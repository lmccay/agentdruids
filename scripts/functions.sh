#!/bin/bash
# Shell functions for common Druids development tasks
# These work in BOTH interactive and non-interactive shells
# Perfect for use with Claude Code's Bash tool!
#
# Usage: Source this file in your shell:
#   source scripts/functions.sh
# Or add to your ~/.bashrc or ~/.zshrc:
#   source /path/to/druids/scripts/functions.sh

# Get the project root directory
# Try to detect from various contexts
if [[ -n "${BASH_SOURCE[0]}" ]]; then
  DRUIDS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
elif [[ -f "./scripts/dev.sh" ]]; then
  DRUIDS_ROOT="$(pwd)"
else
  DRUIDS_ROOT="/Users/lmccay/Projects/druids"
fi

# Environment management
druids-start() {
  cd "$DRUIDS_ROOT" && ./scripts/dev.sh start
}

druids-stop() {
  cd "$DRUIDS_ROOT" && ./scripts/dev.sh stop
}

druids-restart() {
  cd "$DRUIDS_ROOT" && ./scripts/dev.sh stop && ./scripts/dev.sh start
}

# Health checks
druids-health() {
  cd "$DRUIDS_ROOT" && ./scripts/health.sh check
}

druids-health-full() {
  cd "$DRUIDS_ROOT" && ./scripts/health.sh detailed
}

# Logs (with follow)
druids-logs-app() {
  docker logs druids-app -f
}

druids-logs-mcp() {
  docker logs druids-mcp -f
}

druids-logs-ui() {
  docker logs druids-ui -f
}

druids-logs-all() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" logs -f
}

# Quick rebuilds
druids-rebuild-app() {
  cd "$DRUIDS_ROOT" && \
  docker-compose build druids-app --no-cache && \
  docker-compose --env-file .env up -d druids-app && \
  docker logs druids-app --tail 20
}

druids-rebuild-mcp() {
  cd "$DRUIDS_ROOT" && \
  docker-compose build druids-mcp --no-cache && \
  docker-compose --env-file .env up -d druids-mcp && \
  docker logs druids-mcp --tail 20
}

druids-rebuild-ui() {
  cd "$DRUIDS_ROOT" && \
  docker-compose build druids-ui --no-cache && \
  docker-compose --env-file .env up -d druids-ui && \
  docker logs druids-ui --tail 20
}

druids-rebuild-all() {
  cd "$DRUIDS_ROOT" && \
  docker-compose build --no-cache && \
  ./scripts/dev.sh start
}

# Testing shortcuts
druids-test() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-app npm test
}

druids-test-unit() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-app npm run test:unit
}

druids-test-integration() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-app npm run test:integration
}

# Type checking and linting
druids-typecheck() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-app npm run type-check
}

druids-lint() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-app npm run lint
}

druids-lint-fix() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-app npm run lint:fix
}

# Container management
druids-ps() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" ps
}

druids-stats() {
  docker stats druids-app druids-mcp druids-ui druids-redis druids-postgres druids-ollama
}

druids-shell-app() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-app /bin/sh
}

druids-shell-mcp() {
  docker-compose -f "$DRUIDS_ROOT/docker-compose.yml" exec druids-mcp /bin/sh
}

# Cleanup
druids-clean() {
  cd "$DRUIDS_ROOT" && \
  docker-compose down -v && \
  docker system prune -f
}

druids-reset() {
  cd "$DRUIDS_ROOT" && \
  docker-compose down -v && \
  docker-compose build --no-cache && \
  ./scripts/dev.sh start
}

echo "Druids development functions loaded!"
echo "Works in both interactive shells AND Claude Code!"
echo ""
echo "Examples:"
echo "  druids-start          - Start all services"
echo "  druids-logs-mcp       - Follow MCP server logs"
echo "  druids-rebuild-app    - Rebuild and restart app server"
echo "  druids-test-isolation - Run session protection tests"
echo "  druids-health         - Check service health"
