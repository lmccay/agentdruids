#!/bin/bash

# Druids Health Check and Availability Script
# Usage: ./scripts/health.sh [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
MAIN_API_URL="http://localhost:3000"
MCP_GATEWAY_URL="http://localhost:3001"
MCP_SERVER_URL="http://localhost:3003"
REDIS_HOST="localhost"
REDIS_PORT="6379"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
OLLAMA_URL="http://localhost:11434"
PROMETHEUS_URL="http://localhost:9090"
GRAFANA_URL="http://localhost:3002"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

log_header() {
    echo -e "\n${CYAN}=== $1 ===${NC}"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check HTTP endpoint health
check_http_health() {
    local name="$1"
    local url="$2"
    local timeout="${3:-10}"
    
    if curl -s -f --max-time "$timeout" "$url" >/dev/null 2>&1; then
        echo -e "  ✅ ${name}: ${GREEN}Healthy${NC} (${url})"
        return 0
    else
        echo -e "  ❌ ${name}: ${RED}Unhealthy${NC} (${url})"
        return 1
    fi
}

# Check TCP port
check_tcp_port() {
    local name="$1"
    local host="$2"
    local port="$3"
    local timeout="${4:-5}"
    
    if command_exists nc; then
        if nc -z -w "$timeout" "$host" "$port" >/dev/null 2>&1; then
            echo -e "  ✅ ${name}: ${GREEN}Accessible${NC} (${host}:${port})"
            return 0
        else
            echo -e "  ❌ ${name}: ${RED}Inaccessible${NC} (${host}:${port})"
            return 1
        fi
    else
        log_warning "netcat (nc) not available, skipping TCP check for $name"
        return 1
    fi
}

# Get service response time
get_response_time() {
    local url="$1"
    local timeout="${2:-10}"
    
    if command_exists curl; then
        curl -s -o /dev/null -w "%{time_total}" --max-time "$timeout" "$url" 2>/dev/null || echo "timeout"
    else
        echo "N/A"
    fi
}

# Check service detailed health
check_service_details() {
    local name="$1"
    local url="$2"
    
    echo -e "\n${BLUE}--- $name Details ---${NC}"
    
    # Response time
    local response_time=$(get_response_time "$url")
    if [ "$response_time" != "timeout" ] && [ "$response_time" != "N/A" ]; then
        echo -e "  Response time: ${GREEN}${response_time}s${NC}"
    else
        echo -e "  Response time: ${RED}${response_time}${NC}"
    fi
    
    # Get detailed health info if available
    if curl -s -f --max-time 10 "$url" >/dev/null 2>&1; then
        local health_data=$(curl -s --max-time 10 "$url" 2>/dev/null)
        
        # Parse common health fields
        if command_exists jq && echo "$health_data" | jq . >/dev/null 2>&1; then
            echo -e "  Status: ${GREEN}$(echo "$health_data" | jq -r '.status // "unknown"')${NC}"
            echo -e "  Uptime: ${GREEN}$(echo "$health_data" | jq -r '.uptime // "unknown"')s${NC}"
            
            # Memory usage if available
            local memory_used=$(echo "$health_data" | jq -r '.memory.heapUsed // empty' 2>/dev/null)
            local memory_total=$(echo "$health_data" | jq -r '.memory.heapTotal // empty' 2>/dev/null)
            if [ -n "$memory_used" ] && [ -n "$memory_total" ]; then
                local memory_mb_used=$((memory_used / 1024 / 1024))
                local memory_mb_total=$((memory_total / 1024 / 1024))
                echo -e "  Memory: ${GREEN}${memory_mb_used}MB / ${memory_mb_total}MB${NC}"
            fi
        else
            echo -e "  Raw response: ${YELLOW}$(echo "$health_data" | head -c 100)...${NC}"
        fi
        
        # Special handling for Ollama
        if [[ "$url" == *"ollama"* ]] && [[ "$url" == *"/api/tags" ]]; then
            echo -e "\n  ${BLUE}Available Models:${NC}"
            local models=$(echo "$health_data" | jq -r '.models[]?.name // empty' 2>/dev/null)
            if [ -n "$models" ]; then
                echo "$models" | while read -r model; do
                    if [[ "$model" == *"qwen2.5:1.5b"* ]]; then
                        echo -e "    ✅ $model ${GREEN}(Primary Model)${NC}"
                    else
                        echo -e "    📦 $model"
                    fi
                done
            else
                echo -e "    ${YELLOW}No models found${NC}"
            fi
        fi
    fi
}

# Check all services
check_all_services() {
    local all_healthy=true
    
    log_header "Service Health Check"
    
    # Main API
    if ! check_http_health "Main API" "$MAIN_API_URL/health"; then
        all_healthy=false
    fi
    
    # MCP Gateway
    if ! check_http_health "MCP Gateway" "$MCP_GATEWAY_URL/health"; then
        all_healthy=false
    fi
   
    # MCP Server 
    if ! check_http_health "MCP Server" "$MCP_SERVER_URL/health"; then
        all_healthy=false
    fi
 
    # Redis
    if ! check_tcp_port "Redis" "$REDIS_HOST" "$REDIS_PORT"; then
        all_healthy=false
    fi
    
    # PostgreSQL
    if ! check_tcp_port "PostgreSQL" "$POSTGRES_HOST" "$POSTGRES_PORT"; then
        all_healthy=false
    fi
    
    # Ollama
    if ! check_http_health "Ollama" "$OLLAMA_URL/api/tags"; then
        all_healthy=false
    else
        # Additional check for qwen2.5:1.5b model
        local models_response=$(curl -s "$OLLAMA_URL/api/tags" 2>/dev/null || echo '{"models":[]}')
        if echo "$models_response" | grep -q "qwen2.5:1.5b"; then
            echo -e "  ✅ qwen2.5:1.5b Model: ${GREEN}Available${NC}"
        else
            echo -e "  ⚠️  qwen2.5:1.5b Model: ${YELLOW}Not found${NC}"
        fi
    fi
    
    # Prometheus (optional)
    check_http_health "Prometheus (optional)" "$PROMETHEUS_URL/api/v1/query?query=up" >/dev/null 2>&1 || true
    
    # Grafana (optional)
    check_http_health "Grafana (optional)" "$GRAFANA_URL/api/health" >/dev/null 2>&1 || true
    
    return $all_healthy
}

# Detailed health check
detailed_health_check() {
    log_header "Detailed Health Information"
    
    # Main API details
    check_service_details "Main API" "$MAIN_API_URL/health"
    
    # MCP Gateway details (if available)
    if curl -s -f --max-time 5 "$MCP_GATEWAY_URL/health" >/dev/null 2>&1; then
        check_service_details "MCP Gateway" "$MCP_GATEWAY_URL/health"
    fi
    
    # System information
    echo -e "\n${BLUE}--- System Information ---${NC}"
    echo -e "  Docker: $(docker --version 2>/dev/null || echo 'Not available')"
    echo -e "  Docker Compose: $(docker-compose --version 2>/dev/null || docker compose version 2>/dev/null || echo 'Not available')"
    echo -e "  Curl: $(curl --version 2>/dev/null | head -1 || echo 'Not available')"
    echo -e "  JQ: $(jq --version 2>/dev/null || echo 'Not available')"
    echo -e "  Netcat: $(nc -h 2>&1 | head -1 || echo 'Not available')"
}

# Check Docker containers
check_docker_containers() {
    log_header "Docker Container Status"
    
    if command_exists docker; then
        local containers=$(docker ps -a --filter "name=druids" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)
        
        if [ -n "$containers" ]; then
            echo "$containers"
        else
            echo -e "  ${YELLOW}No Druids containers found${NC}"
        fi
    else
        echo -e "  ${RED}Docker not available${NC}"
    fi
}

# Performance check
performance_check() {
    log_header "Performance Check"
    
    # API response times
    echo -e "${BLUE}Response Times:${NC}"
    local main_api_time=$(get_response_time "$MAIN_API_URL/health")
    local mcp_time=$(get_response_time "$MCP_GATEWAY_URL/health")
    local ollama_time=$(get_response_time "$OLLAMA_URL/api/tags")
    
    echo -e "  Main API: ${GREEN}${main_api_time}s${NC}"
    echo -e "  MCP Gateway: ${GREEN}${mcp_time}s${NC}"
    echo -e "  Ollama: ${GREEN}${ollama_time}s${NC}"
    
    # Load test (simple)
    echo -e "\n${BLUE}Simple Load Test (10 requests):${NC}"
    if command_exists curl; then
        local start_time=$(date +%s.%N)
        for i in {1..10}; do
            curl -s -f --max-time 5 "$MAIN_API_URL/health" >/dev/null 2>&1 || true
        done
        local end_time=$(date +%s.%N)
        local total_time=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "N/A")
        
        if [ "$total_time" != "N/A" ]; then
            local avg_time=$(echo "scale=3; $total_time / 10" | bc -l 2>/dev/null || echo "N/A")
            echo -e "  Total time: ${GREEN}${total_time}s${NC}"
            echo -e "  Average per request: ${GREEN}${avg_time}s${NC}"
        else
            echo -e "  ${YELLOW}Could not calculate load test metrics${NC}"
        fi
    else
        echo -e "  ${YELLOW}Curl not available for load testing${NC}"
    fi
}

# MCP integration check
check_mcp_integration() {
    log_header "MCP Integration Check"
    
    # Check if MCP gateway is responding
    if curl -s -f --max-time 10 "$MCP_GATEWAY_URL/health" >/dev/null 2>&1; then
        echo -e "  ✅ MCP Gateway: ${GREEN}Available${NC}"
        
        # Check MCP-specific endpoints
        local mcp_endpoints=(
            "/mcp/tools"
            "/mcp/resources" 
            "/mcp/prompts"
        )
        
        for endpoint in "${mcp_endpoints[@]}"; do
            if curl -s -f --max-time 5 "$MCP_GATEWAY_URL$endpoint" >/dev/null 2>&1; then
                echo -e "  ✅ $endpoint: ${GREEN}Available${NC}"
            else
                echo -e "  ⚠️  $endpoint: ${YELLOW}Not available or not implemented${NC}"
            fi
        done
        
        # Test MCP client connection simulation
        echo -e "\n${BLUE}MCP Client Connection Test:${NC}"
        echo -e "  MCP Server URL for external clients: ${CYAN}http://localhost:3001${NC}"
        echo -e "  Protocol: ${CYAN}HTTP/WebSocket${NC}"
        echo -e "  Status: ${GREEN}Ready for MCP client connections${NC}"
        
    else
        echo -e "  ❌ MCP Gateway: ${RED}Not available${NC}"
        echo -e "  ${YELLOW}External MCP clients will not be able to connect${NC}"
    fi
}

# Monitor mode (continuous monitoring)
monitor_mode() {
    local interval="${1:-30}"
    
    log_info "Starting continuous monitoring (interval: ${interval}s)"
    log_info "Press Ctrl+C to stop monitoring"
    
    while true; do
        clear
        echo -e "${CYAN}Druids Health Monitor - $(date)${NC}"
        
        if check_all_services; then
            echo -e "\n${GREEN}All core services are healthy!${NC}"
        else
            echo -e "\n${RED}Some services are unhealthy!${NC}"
        fi
        
        echo -e "\n${BLUE}Next check in ${interval} seconds...${NC}"
        sleep "$interval"
    done
}

# Export metrics (for external monitoring)
export_metrics() {
    local output_file="${1:-health_metrics.json}"
    
    log_info "Exporting health metrics to $output_file"
    
    # Collect metrics
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local main_api_healthy=$(curl -s -f --max-time 5 "$MAIN_API_URL/health" >/dev/null 2>&1 && echo "true" || echo "false")
    local mcp_healthy=$(curl -s -f --max-time 5 "$MCP_GATEWAY_URL/health" >/dev/null 2>&1 && echo "true" || echo "false")
    local redis_healthy=$(nc -z -w 5 "$REDIS_HOST" "$REDIS_PORT" >/dev/null 2>&1 && echo "true" || echo "false")
    local postgres_healthy=$(nc -z -w 5 "$POSTGRES_HOST" "$POSTGRES_PORT" >/dev/null 2>&1 && echo "true" || echo "false")
    local ollama_healthy=$(curl -s -f --max-time 5 "$OLLAMA_URL/api/tags" >/dev/null 2>&1 && echo "true" || echo "false")
    
    local main_api_time=$(get_response_time "$MAIN_API_URL/health")
    local mcp_time=$(get_response_time "$MCP_GATEWAY_URL/health")
    local ollama_time=$(get_response_time "$OLLAMA_URL/api/tags")
    
    # Create JSON output
    cat > "$output_file" << EOF
{
  "timestamp": "$timestamp",
  "services": {
    "main_api": {
      "healthy": $main_api_healthy,
      "response_time": "$main_api_time",
      "url": "$MAIN_API_URL"
    },
    "mcp_gateway": {
      "healthy": $mcp_healthy,
      "response_time": "$mcp_time",
      "url": "$MCP_GATEWAY_URL"
    },
    "redis": {
      "healthy": $redis_healthy,
      "host": "$REDIS_HOST",
      "port": "$REDIS_PORT"
    },
    "postgres": {
      "healthy": $postgres_healthy,
      "host": "$POSTGRES_HOST", 
      "port": "$POSTGRES_PORT"
    },
    "ollama": {
      "healthy": $ollama_healthy,
      "response_time": "$ollama_time",
      "url": "$OLLAMA_URL"
    }
  },
  "overall_healthy": $([ "$main_api_healthy" = "true" ] && [ "$mcp_healthy" = "true" ] && [ "$redis_healthy" = "true" ] && [ "$postgres_healthy" = "true" ] && [ "$ollama_healthy" = "true" ] && echo "true" || echo "false")
}
EOF
    
    log_success "Metrics exported to $output_file"
}

# Show help
show_help() {
    echo -e "${BLUE}Druids Health Check and Availability Tool${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  check              Quick health check of all services"
    echo "  detailed           Detailed health information"
    echo "  containers         Show Docker container status"
    echo "  performance        Run performance checks"
    echo "  mcp                Check MCP integration status"
    echo "  monitor [interval] Start continuous monitoring (default 30s)"
    echo "  export [file]      Export metrics to JSON file"
    echo "  help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 check           # Quick health check"
    echo "  $0 detailed        # Detailed health info"
    echo "  $0 monitor 10      # Monitor every 10 seconds"
    echo "  $0 export metrics.json  # Export to custom file"
    echo ""
    echo "Environment Variables:"
    echo "  MAIN_API_URL       Main API URL (default: http://localhost:3000)"
    echo "  MCP_GATEWAY_URL    MCP Gateway URL (default: http://localhost:3001)"
    echo "  REDIS_HOST         Redis host (default: localhost)"
    echo "  REDIS_PORT         Redis port (default: 6379)"
    echo "  POSTGRES_HOST      PostgreSQL host (default: localhost)"
    echo "  POSTGRES_PORT      PostgreSQL port (default: 5432)"
    echo "  OLLAMA_URL         Ollama URL (default: http://localhost:11434)"
    echo ""
}

# Parse environment variables
MAIN_API_URL="${MAIN_API_URL:-http://localhost:3000}"
MCP_GATEWAY_URL="${MCP_GATEWAY_URL:-http://localhost:3001}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

# Main command dispatcher
case "${1:-check}" in
    check)
        if check_all_services; then
            log_success "All services are healthy!"
            exit 0
        else
            log_error "Some services are unhealthy!"
            exit 1
        fi
        ;;
    detailed)
        check_all_services
        detailed_health_check
        ;;
    containers)
        check_docker_containers
        ;;
    performance)
        performance_check
        ;;
    mcp)
        check_mcp_integration
        ;;
    monitor)
        monitor_mode "${2:-30}"
        ;;
    export)
        export_metrics "${2:-health_metrics.json}"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
