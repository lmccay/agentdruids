#!/bin/bash

# Druids Development Environment Management Script
# Usage: ./scripts/dev.sh [command] [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

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

# Start development environment
start_dev() {
    log_info "Starting Druids development environment..."
    check_docker
    check_compose
    
    cd "$PROJECT_ROOT"
    
    # Pull latest images
    log_info "Pulling latest Docker images..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" pull
    
    # Build application image
    log_info "Building Druids application..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" build druids-app
    
    # Start services
    log_info "Starting all services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be ready..."
    wait_for_health
    
    # Check and pull Ollama model
    log_info "Checking Ollama model availability..."
    check_ollama_model
    
    log_success "Development environment started successfully!"
    show_status
}

# Stop development environment
stop_dev() {
    log_info "Stopping Druids development environment..."
    check_compose
    
    cd "$PROJECT_ROOT"
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    
    log_success "Development environment stopped."
}

# Restart development environment
restart_dev() {
    log_info "Restarting Druids development environment..."
    stop_dev
    start_dev
}

# Show status of all services
show_status() {
    check_compose
    cd "$PROJECT_ROOT"
    
    echo -e "\n${BLUE}=== Service Status ===${NC}"
    $COMPOSE_CMD -f "$COMPOSE_FILE" ps
    
    echo -e "\n${BLUE}=== Service URLs ===${NC}"
    echo -e "🚀 Main API:       ${GREEN}http://localhost:3000${NC}"
    echo -e "🔗 MCP Gateway:    ${GREEN}http://localhost:3001${NC}"
    echo -e "💾 Redis:          ${GREEN}localhost:6379${NC}"
    echo -e "🐘 PostgreSQL:     ${GREEN}localhost:5432${NC}"
    echo -e "🤖 Ollama:         ${GREEN}http://localhost:11434${NC}"
    echo -e "📊 Prometheus:     ${GREEN}http://localhost:9090${NC}"
    echo -e "📈 Grafana:        ${GREEN}http://localhost:3002${NC} (admin:druids_admin)"
    
    echo -e "\n${BLUE}=== Health Checks ===${NC}"
    health_check "Main API" "http://localhost:3000/health"
    health_check "MCP Gateway" "http://localhost:3001/health"
    health_check "Ollama" "http://localhost:11434/api/tags"
}

# Wait for services to be healthy
wait_for_health() {
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "Health check attempt $attempt/$max_attempts..."
        
        if health_check_silent "http://localhost:3000/health"; then
            log_success "Main API is healthy"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_warning "Some services may not be fully ready yet"
            break
        fi
        
        sleep 5
        ((attempt++))
    done
}

# Health check helper
health_check() {
    local service_name="$1"
    local url="$2"
    
    if curl -s -f "$url" >/dev/null 2>&1; then
        echo -e "  ✅ ${service_name}: ${GREEN}Healthy${NC}"
    else
        echo -e "  ❌ ${service_name}: ${RED}Unhealthy${NC}"
    fi
}

# Silent health check
health_check_silent() {
    local url="$1"
    curl -s -f "$url" >/dev/null 2>&1
}

# View logs
view_logs() {
    local service="${1:-}"
    check_compose
    cd "$PROJECT_ROOT"
    
    if [ -z "$service" ]; then
        log_info "Showing logs for all services..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" logs -f
    else
        log_info "Showing logs for service: $service"
        $COMPOSE_CMD -f "$COMPOSE_FILE" logs -f "$service"
    fi
}

# Execute command in container
exec_cmd() {
    local service="$1"
    shift
    local cmd="$*"
    
    check_compose
    cd "$PROJECT_ROOT"
    
    log_info "Executing command in $service: $cmd"
    $COMPOSE_CMD -f "$COMPOSE_FILE" exec "$service" $cmd
}

# Clean up everything
cleanup() {
    log_warning "This will remove all containers, volumes, and images. Are you sure? (y/N)"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        check_compose
        cd "$PROJECT_ROOT"
        
        log_info "Stopping all services..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" down -v --remove-orphans
        
        log_info "Removing images..."
        docker rmi $(docker images "druids*" -q) 2>/dev/null || true
        
        log_success "Cleanup completed."
    else
        log_info "Cleanup cancelled."
    fi
}

# Check Ollama model availability
check_ollama_model() {
    local max_attempts=12
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
            local models_response=$(curl -s http://localhost:11434/api/tags)
            
            if echo "$models_response" | grep -q "qwen2.5:1.5b"; then
                log_success "Model qwen2.5:1.5b is available"
                
                # Test the model
                local test_response=$(curl -s -X POST http://localhost:11434/api/generate \
                    -H "Content-Type: application/json" \
                    -d '{"model":"qwen2.5:1.5b","prompt":"Hello","stream":false,"options":{"num_predict":10}}' \
                    2>/dev/null || echo '{"error":"test failed"}')
                
                if echo "$test_response" | grep -q '"response"'; then
                    log_success "Model qwen2.5:1.5b is responding correctly"
                else
                    log_warning "Model qwen2.5:1.5b loaded but may need warming up"
                fi
                return 0
            else
                log_info "Model qwen2.5:1.5b not found, waiting for initialization..."
            fi
        else
            log_info "Ollama service not ready, waiting..."
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_warning "Model check timed out. You may need to manually pull the model:"
            log_warning "docker exec druids-ollama ollama pull qwen2.5:1.5b"
            break
        fi
        
        sleep 15
        ((attempt++))
    done
}

# Pull Ollama model manually
pull_model() {
    log_info "Manually pulling qwen2.5:1.5b model..."
    check_compose
    cd "$PROJECT_ROOT"
    
    $COMPOSE_CMD -f "$COMPOSE_FILE" exec druids-ollama ollama pull qwen2.5:1.5b
    
    if [ $? -eq 0 ]; then
        log_success "Model qwen2.5:1.5b pulled successfully"
    else
        log_error "Failed to pull model qwen2.5:1.5b"
    fi
}

# Test LLM functionality
test_llm() {
    log_info "Testing LLM functionality..."
    check_compose
    cd "$PROJECT_ROOT"
    
    # Check if Ollama is responding
    if ! curl -s -f http://localhost:11434/api/tags >/dev/null 2>&1; then
        log_error "Ollama service is not responding"
        return 1
    fi
    
    # Test text generation
    log_info "Testing text generation..."
    local response=$(curl -s -X POST http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d '{
            "model": "qwen2.5:1.5b",
            "prompt": "Explain what a multi-agent system is in one sentence.",
            "stream": false,
            "options": {
                "temperature": 0.7,
                "num_predict": 50
            }
        }' 2>/dev/null)
    
    if echo "$response" | grep -q '"response"'; then
        local generated_text=$(echo "$response" | grep -o '"response":"[^"]*"' | cut -d'"' -f4)
        log_success "Text generation working!"
        log_info "Sample response: $generated_text"
    else
        log_error "Text generation failed"
        log_error "Response: $response"
        return 1
    fi
    
    # Test tool calling format
    log_info "Testing tool calling format..."
    local tool_response=$(curl -s -X POST http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d '{
            "model": "qwen2.5:1.5b",
            "prompt": "You have access to a tool called \"search\" that can search the web. Use it to find information about TypeScript. Respond with the tool call in JSON format.",
            "stream": false,
            "options": {
                "temperature": 0.3,
                "num_predict": 100
            }
        }' 2>/dev/null)
    
    if echo "$tool_response" | grep -q '"response"'; then
        log_success "Tool calling test completed"
        local tool_text=$(echo "$tool_response" | grep -o '"response":"[^"]*"' | cut -d'"' -f4)
        log_info "Tool response: $tool_text"
    else
        log_warning "Tool calling test failed, but basic generation works"
    fi
    
    log_success "LLM testing completed!"
}

# Show help
show_help() {
    echo -e "${BLUE}Druids Development Environment Manager${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start              Start the development environment"
    echo "  stop               Stop the development environment"
    echo "  restart            Restart the development environment"
    echo "  status             Show status of all services"
    echo "  logs [service]     View logs (all services or specific service)"
    echo "  exec <service> <cmd>  Execute command in container"
    echo "  pull-model         Manually pull qwen2.5:1.5b model"
    echo "  test-llm           Test LLM functionality"
    echo "  cleanup            Remove all containers, volumes, and images"
    echo "  help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start           # Start all services"
    echo "  $0 logs druids-app # View logs for main application"
    echo "  $0 exec druids-app npm test  # Run tests in container"
    echo ""
}

# Main command dispatcher
case "${1:-}" in
    start)
        start_dev
        ;;
    stop)
        stop_dev
        ;;
    restart)
        restart_dev
        ;;
    status)
        show_status
        ;;
    logs)
        view_logs "${2:-}"
        ;;
    exec)
        if [ $# -lt 3 ]; then
            log_error "Usage: $0 exec <service> <command>"
            exit 1
        fi
        exec_cmd "${2}" "${@:3}"
        ;;
    pull-model)
        pull_model
        ;;
    test-llm)
        test_llm
        ;;
    cleanup)
        cleanup
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