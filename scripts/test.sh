#!/bin/bash

# Druids Testing Environment Management Script
# Usage: ./scripts/test.sh [command] [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
COMPOSE_TEST_FILE="$PROJECT_ROOT/docker-compose.test.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Check if docker-compose is available
check_compose() {
    if ! command -v docker-compose >/dev/null 2>&1; then
        if ! docker compose version >/dev/null 2>&1; then
            log_error "docker-compose or 'docker compose' is not available."
            exit 1
        fi
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
}

# Run unit tests
run_unit_tests() {
    log_info "Running unit tests..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Build test image
    $COMPOSE_CMD -f "$COMPOSE_FILE" build druids-app
    
    # Run unit tests
    $COMPOSE_CMD -f "$COMPOSE_FILE" run --rm druids-app npm run test:unit
    
    log_success "Unit tests completed!"
}

# Run integration tests
run_integration_tests() {
    log_info "Running integration tests..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Start dependencies (Redis, PostgreSQL, Ollama)
    log_info "Starting test dependencies..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d druids-redis druids-postgres druids-ollama
    
    # Wait for dependencies
    log_info "Waiting for dependencies to be ready..."
    sleep 10
    
    # Run integration tests
    $COMPOSE_CMD -f "$COMPOSE_FILE" run --rm \
        -e NODE_ENV=test \
        -e DATABASE_URL=postgresql://druids_user:druids_pass_dev@druids-postgres:5432/druids \
        -e REDIS_URL=redis://druids-redis:6379 \
        -e OLLAMA_URL=http://druids-ollama:11434 \
        druids-app npm run test:integration
    
    # Stop dependencies
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    
    log_success "Integration tests completed!"
}

# Run contract tests
run_contract_tests() {
    log_info "Running contract tests..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Build test image
    $COMPOSE_CMD -f "$COMPOSE_FILE" build druids-app
    
    # Run contract tests
    $COMPOSE_CMD -f "$COMPOSE_FILE" run --rm druids-app npm run test:contract
    
    log_success "Contract tests completed!"
}

# Run all tests
run_all_tests() {
    log_info "Running all tests..."
    
    run_unit_tests
    run_contract_tests
    run_integration_tests
    
    log_success "All tests completed successfully!"
}

# Run tests with coverage
run_tests_with_coverage() {
    log_info "Running tests with coverage..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Start dependencies for integration tests
    log_info "Starting test dependencies..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d druids-redis druids-postgres druids-ollama
    
    # Wait for dependencies
    sleep 10
    
    # Run all tests with coverage
    $COMPOSE_CMD -f "$COMPOSE_FILE" run --rm \
        -e NODE_ENV=test \
        -e DATABASE_URL=postgresql://druids_user:druids_pass_dev@druids-postgres:5432/druids \
        -e REDIS_URL=redis://druids-redis:6379 \
        -e OLLAMA_URL=http://druids-ollama:11434 \
        druids-app npm run test:coverage
    
    # Stop dependencies
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    
    log_success "Tests with coverage completed!"
}

# Lint code
run_lint() {
    log_info "Running code linting..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Build image
    $COMPOSE_CMD -f "$COMPOSE_FILE" build druids-app
    
    # Run linting
    $COMPOSE_CMD -f "$COMPOSE_FILE" run --rm druids-app npm run lint
    
    log_success "Linting completed!"
}

# Type check
run_type_check() {
    log_info "Running TypeScript type checking..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Build image
    $COMPOSE_CMD -f "$COMPOSE_FILE" build druids-app
    
    # Run type checking
    $COMPOSE_CMD -f "$COMPOSE_FILE" run --rm druids-app npm run type-check
    
    log_success "Type checking completed!"
}

# Run security audit
run_security_audit() {
    log_info "Running security audit..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Build image
    $COMPOSE_CMD -f "$COMPOSE_FILE" build druids-app
    
    # Run security audit
    $COMPOSE_CMD -f "$COMPOSE_FILE" run --rm druids-app npm audit
    
    log_success "Security audit completed!"
}

# Performance tests
run_performance_tests() {
    log_info "Running performance tests..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Start full environment
    log_info "Starting test environment..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    
    # Wait for services
    log_info "Waiting for services to be ready..."
    sleep 30

    # Stop environment
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
}

# Validate environment
validate_environment() {
    log_info "Validating test environment..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Start services
    log_info "Starting services for validation..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    
    # Wait for services
    sleep 20
    
    # Check service health
    local all_healthy=true
    
    echo -e "\n${BLUE}=== Service Health Validation ===${NC}"
    
    if health_check_service "Main API" "http://localhost:3000/health"; then
        echo -e "  ✅ Main API: ${GREEN}Healthy${NC}"
    else
        echo -e "  ❌ Main API: ${RED}Unhealthy${NC}"
        all_healthy=false
    fi
    
    if health_check_service "PostgreSQL" "localhost:5432"; then
        echo -e "  ✅ PostgreSQL: ${GREEN}Healthy${NC}"
    else
        echo -e "  ❌ PostgreSQL: ${RED}Unhealthy${NC}"
        all_healthy=false
    fi
    
    if health_check_service "Redis" "localhost:6379"; then
        echo -e "  ✅ Redis: ${GREEN}Healthy${NC}"
    else
        echo -e "  ❌ Redis: ${RED}Unhealthy${NC}"
        all_healthy=false
    fi
    
    if health_check_service "Ollama" "http://localhost:11434/api/tags"; then
        echo -e "  ✅ Ollama: ${GREEN}Healthy${NC}"
    else
        echo -e "  ❌ Ollama: ${RED}Unhealthy${NC}"
        all_healthy=false
    fi
    
    # Stop services
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    
    if [ "$all_healthy" = true ]; then
        log_success "Environment validation passed!"
        return 0
    else
        log_error "Environment validation failed!"
        return 1
    fi
}

# Health check helper
health_check_service() {
    local service_name="$1"
    local endpoint="$2"
    
    if [[ "$endpoint" == http* ]]; then
        curl -s -f "$endpoint" >/dev/null 2>&1
    else
        # For non-HTTP services, use nc to check port
        local host=$(echo "$endpoint" | cut -d':' -f1)
        local port=$(echo "$endpoint" | cut -d':' -f2)
        nc -z "$host" "$port" >/dev/null 2>&1
    fi
}

# Clean test artifacts
clean_test_artifacts() {
    log_info "Cleaning test artifacts..."
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Remove test containers and volumes
    $COMPOSE_CMD -f "$COMPOSE_FILE" down -v --remove-orphans
    
    # Remove test coverage files
    if [ -d "coverage" ]; then
        rm -rf coverage
        log_info "Removed coverage directory"
    fi
    
    # Remove test reports
    if [ -d "test-reports" ]; then
        rm -rf test-reports
        log_info "Removed test reports directory"
    fi
    
    log_success "Test artifacts cleaned!"
}

# Show help
show_help() {
    echo -e "${BLUE}Druids Testing Environment Manager${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  unit               Run unit tests"
    echo "  integration        Run integration tests"
    echo "  contract           Run contract tests"
    echo "  all                Run all tests"
    echo "  coverage           Run tests with coverage report"
    echo "  lint               Run code linting"
    echo "  type-check         Run TypeScript type checking"
    echo "  security           Run security audit"
    echo "  performance        Run performance tests"
    echo "  validate           Validate test environment"
    echo "  clean              Clean test artifacts"
    echo "  help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 all             # Run all tests"
    echo "  $0 coverage        # Run tests with coverage"
    echo "  $0 validate        # Check if environment is working"
    echo ""
}

# Main command dispatcher
case "${1:-}" in
    unit)
        run_unit_tests
        ;;
    integration)
        run_integration_tests
        ;;
    contract)
        run_contract_tests
        ;;
    all)
        run_all_tests
        ;;
    coverage)
        run_tests_with_coverage
        ;;
    lint)
        run_lint
        ;;
    type-check)
        run_type_check
        ;;
    security)
        run_security_audit
        ;;
    performance)
        run_performance_tests
        ;;
    validate)
        validate_environment
        ;;
    clean)
        clean_test_artifacts
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac