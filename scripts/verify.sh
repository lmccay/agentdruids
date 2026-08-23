#!/bin/bash

# Druids Pre-Push Verification
#
# Runs the checks that would otherwise only be discovered after a push — or, as
# happened repeatedly, not at all. Every check here corresponds to a defect that
# reached main and survived undetected:
#
#   type-check / unit      the cheap gate
#   production image build the build stage set NODE_ENV=production before
#                          `npm ci`, so tsc was absent and the image could not
#                          be built at all
#   runtime assets         tsc emits only .js, so SQL migrations, prompts/ and
#                          config/ never reached the image; the app then ran
#                          against an unmigrated database and reported success
#   dist layout            with no rootDir, tsc emitted dist/src/index.js while
#                          the Dockerfile ran dist/index.js, and shipped the
#                          test suite into production
#   fresh init.sql         a cast-precedence bug aborted initialisation for
#                          every new deployment
#   migrations applied     the runner silently treated a missing directory as
#                          "no migrations to run"
#
# Usage:
#   ./scripts/verify.sh          # everything
#   ./scripts/verify.sh fast     # type-check + unit tests only, no Docker
#
# Nothing here touches a running dev stack or its data: all containers, volumes
# and networks are uniquely named and removed on exit, including on failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

MODE="${1:-full}"

# Unique names so a developer's running stack is never touched.
STAMP="$$"
IMAGE="druids-verify:${STAMP}"
PG="druids-verify-pg-${STAMP}"
APP="druids-verify-app-${STAMP}"
NET="druids-verify-net-${STAMP}"
PGPASS="verify-only-not-a-secret"

FAILURES=0
step()  { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
pass()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

cleanup() {
  docker rm -f "$PG" "$APP" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Type-check and unit tests
# ---------------------------------------------------------------------------
# Prefer host node when dependencies are already installed (fast, and what CI
# does after setup-node); otherwise fall back to a throwaway container so this
# works on a machine with no local toolchain.
run_node() {
  # A node_modules directory is not enough — this repository is Docker-first, so
  # a developer machine often has the directory without the binaries in it.
  # Check for the executables actually needed before trusting the host.
  if command -v npm >/dev/null 2>&1 \
     && [ -x node_modules/.bin/tsc ] && [ -x node_modules/.bin/jest ]; then
    npm "$@"
  elif docker ps --format '{{.Names}}' | grep -qx druids-main; then
    # Reuse the running dev container: it already has devDependencies installed.
    docker exec druids-main npm "$@"
  else
    docker run --rm -v "$PROJECT_ROOT:/app" -w /app node:20-alpine \
      sh -c "npm ci --silent && npm $*"
  fi
}

step "Type-check"
if run_node run type-check >/tmp/verify-tsc.log 2>&1; then
  pass "tsc --noEmit clean"
else
  fail "type-check failed"; tail -20 /tmp/verify-tsc.log
fi

step "Unit tests"
if run_node run test:unit >/tmp/verify-unit.log 2>&1; then
  pass "$(grep -oE 'Tests: +[0-9]+ passed' /tmp/verify-unit.log | tail -1 | tr -s ' ')"
else
  fail "unit tests failed"; tail -30 /tmp/verify-unit.log
fi

if [ "$MODE" = "fast" ]; then
  step "Result"
  [ "$FAILURES" -eq 0 ] && { pass "fast checks passed"; exit 0; } || { fail "$FAILURES check(s) failed"; exit 1; }
fi

# ---------------------------------------------------------------------------
# 2. The production image must build
# ---------------------------------------------------------------------------
step "Build production image"
if docker build --target production -t "$IMAGE" . >/tmp/verify-build.log 2>&1; then
  pass "image builds"
else
  fail "production image does not build"
  tail -25 /tmp/verify-build.log
  step "Result"; fail "$FAILURES check(s) failed"; exit 1
fi

# ---------------------------------------------------------------------------
# 3. Runtime assets must be inside the image
# ---------------------------------------------------------------------------
step "Runtime assets in image"
EXPECTED_MIGRATIONS=$(find src/database/migrations -name '*.sql' | wc -l | tr -d ' ')
IMAGE_MIGRATIONS=$(docker run --rm --entrypoint sh "$IMAGE" -c 'ls dist/database/migrations/*.sql 2>/dev/null | wc -l' | tr -d ' ')
IMAGE_PROMPTS=$(docker run --rm --entrypoint sh "$IMAGE" -c 'find prompts -name "*.md" 2>/dev/null | wc -l' | tr -d ' ')
IMAGE_CONFIG=$(docker run --rm --entrypoint sh "$IMAGE" -c 'ls config/*.json 2>/dev/null | wc -l' | tr -d ' ')
HAS_ENTRY=$(docker run --rm --entrypoint sh "$IMAGE" -c 'test -f dist/index.js && echo yes || echo no')
HAS_TESTS=$(docker run --rm --entrypoint sh "$IMAGE" -c 'test -d dist/tests && echo yes || echo no')

[ "$IMAGE_MIGRATIONS" = "$EXPECTED_MIGRATIONS" ] \
  && pass "migrations: $IMAGE_MIGRATIONS of $EXPECTED_MIGRATIONS present" \
  || fail "migrations: $IMAGE_MIGRATIONS in image, $EXPECTED_MIGRATIONS on disk"
[ "$IMAGE_PROMPTS" -gt 0 ] && pass "prompts: $IMAGE_PROMPTS file(s)" || fail "prompts/ missing — composition would fall back to the legacy path"
[ "$IMAGE_CONFIG" -gt 0 ]  && pass "config: $IMAGE_CONFIG file(s)"  || fail "config/ missing"
[ "$HAS_ENTRY" = "yes" ]   && pass "entrypoint at dist/index.js"    || fail "dist/index.js missing — CMD would fail"
[ "$HAS_TESTS" = "no" ]    && pass "tests excluded from image"      || fail "test suite shipped in production image"

# ---------------------------------------------------------------------------
# 4. A fresh database must initialise from init.sql
# ---------------------------------------------------------------------------
step "Fresh database from init.sql"
docker network create "$NET" >/dev/null 2>&1 || true
docker run -d --name "$PG" --network "$NET" \
  -e POSTGRES_DB=druids -e POSTGRES_USER=druids_user -e POSTGRES_PASSWORD="$PGPASS" \
  -e "POSTGRES_INITDB_ARGS=--encoding=UTF-8 --lc-collate=C --lc-ctype=C" \
  -v "$PROJECT_ROOT/docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  pgvector/pgvector:pg15 >/dev/null

for _ in $(seq 1 45); do
  docker exec "$PG" pg_isready -U druids_user -d druids >/dev/null 2>&1 && break
  sleep 2
done

INIT_ERRORS=$(docker logs "$PG" 2>&1 | grep -cE '^psql.*ERROR' || true)
if docker exec "$PG" pg_isready -U druids_user -d druids >/dev/null 2>&1 && [ "$INIT_ERRORS" -eq 0 ]; then
  pass "init.sql applied with no errors"
else
  fail "init.sql failed ($INIT_ERRORS error(s)) — fresh deployments cannot initialise"
  docker logs "$PG" 2>&1 | grep -E '^psql.*ERROR' | head -3
fi

# ---------------------------------------------------------------------------
# 5. The image must migrate that database
# ---------------------------------------------------------------------------
step "Migrations apply from the image"
docker run -d --name "$APP" --network "$NET" \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://druids_user:${PGPASS}@${PG}:5432/druids" \
  "$IMAGE" node dist/index.js >/dev/null 2>&1 || true

APPLIED=0
for _ in $(seq 1 40); do
  APPLIED=$(docker exec "$PG" psql -U druids_user -d druids -t -A \
    -c "select count(*) from druids_core.schema_migrations where success and version > 1;" 2>/dev/null | tr -d ' ' || echo 0)
  [ "${APPLIED:-0}" -ge "$EXPECTED_MIGRATIONS" ] && break
  sleep 2
done

if [ "${APPLIED:-0}" -ge "$EXPECTED_MIGRATIONS" ]; then
  pass "all $EXPECTED_MIGRATIONS migrations applied"
else
  fail "only ${APPLIED:-0} of $EXPECTED_MIGRATIONS migrations applied"
  docker logs "$APP" 2>&1 | grep -iE 'migration|error' | tail -10
fi

step "Result"
if [ "$FAILURES" -eq 0 ]; then
  pass "all checks passed"
  exit 0
fi
fail "$FAILURES check(s) failed"
exit 1
