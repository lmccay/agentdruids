#!/bin/bash
# Database Reset Script
# Completely resets the database to a clean state with current schema
#
# WARNING: This will DELETE ALL DATA in the database!
# Only use this for:
# - Fresh development environment setup
# - Resetting to clean state after schema changes
# - Fixing corrupted database state

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}⚠️  Database Reset Script${NC}"
echo "This will:"
echo "  1. Stop all services"
echo "  2. DELETE the PostgreSQL volume (ALL DATA WILL BE LOST)"
echo "  3. Restart services with fresh database"
echo "  4. Database will initialize with current schema from docker/init.sql"
echo ""

# Check if we're in interactive mode
if [ -t 0 ]; then
  read -p "Are you sure you want to continue? (yes/no): " -r
  echo
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${YELLOW}Database reset cancelled${NC}"
    exit 0
  fi
else
  echo -e "${RED}ERROR: This script requires interactive confirmation${NC}"
  echo "If you want to force reset, use: docker-compose down -v"
  exit 1
fi

cd "$PROJECT_ROOT"

echo -e "${YELLOW}🛑 Stopping all services...${NC}"
docker-compose down

echo -e "${YELLOW}🗑️  Removing PostgreSQL volume...${NC}"
docker volume rm druids_druids-postgres-data 2>/dev/null || echo "Volume already removed or doesn't exist"

echo -e "${YELLOW}🚀 Starting services with fresh database...${NC}"
./scripts/dev.sh start

echo ""
echo -e "${GREEN}✅ Database reset complete!${NC}"
echo ""
echo "The database has been initialized with the current schema from docker/init.sql"
echo ""
echo "Next steps:"
echo "  1. Check health: ./scripts/health.sh check"
echo "  2. Verify schema: docker-compose exec druids-postgres psql -U druids_user -d druids -c '\d druids_core.agents'"
echo "  3. Create your agents and realms"
echo ""
