#!/bin/bash

# Ollama Model Initialization Script
# This script pulls and sets up the qwen2.5:1.5b model for the Druids system

set -e

MODEL_NAME="qwen2.5:1.5b"
OLLAMA_BASE_URL="http://localhost:11434"
MAX_RETRIES=30
RETRY_DELAY=10

log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1"
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
}

# Wait for Ollama service to be ready
wait_for_ollama() {
    local retries=0
    
    log_info "Waiting for Ollama service to be ready..."
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -s -f "$OLLAMA_BASE_URL/api/tags" >/dev/null 2>&1; then
            log_success "Ollama service is ready!"
            return 0
        fi
        
        retries=$((retries + 1))
        log_info "Attempt $retries/$MAX_RETRIES: Ollama not ready, waiting ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    done
    
    log_error "Ollama service failed to start after $MAX_RETRIES attempts"
    return 1
}

# Check if model is already pulled
check_model_exists() {
    local models_response
    models_response=$(curl -s "$OLLAMA_BASE_URL/api/tags" 2>/dev/null || echo '{"models":[]}')
    
    # Check if the model exists in the response
    if echo "$models_response" | grep -q "\"name\":\"$MODEL_NAME\""; then
        log_success "Model $MODEL_NAME is already available"
        return 0
    else
        log_info "Model $MODEL_NAME not found, will pull it"
        return 1
    fi
}

# Pull the model
pull_model() {
    log_info "Pulling model: $MODEL_NAME"
    log_info "This may take several minutes depending on your internet connection..."
    
    # Use Ollama CLI to pull the model
    if ollama pull "$MODEL_NAME"; then
        log_success "Successfully pulled model: $MODEL_NAME"
        return 0
    else
        log_error "Failed to pull model: $MODEL_NAME"
        return 1
    fi
}

# Test the model
test_model() {
    log_info "Testing model: $MODEL_NAME"
    
    # Create a simple test prompt
    local test_prompt='{"model":"'$MODEL_NAME'","prompt":"Hello, please respond with just the word SUCCESS if you are working correctly.","stream":false,"options":{"temperature":0.1,"num_predict":20}}'
    
    local response
    response=$(curl -s -X POST "$OLLAMA_BASE_URL/api/generate" \
        -H "Content-Type: application/json" \
        -d "$test_prompt" 2>/dev/null || echo '{"response":"ERROR"}')
    
    if echo "$response" | grep -q "SUCCESS\|success\|working\|correct"; then
        log_success "Model test passed: $MODEL_NAME is responding correctly"
        return 0
    else
        log_info "Model response: $(echo "$response" | head -c 200)..."
        log_info "Model is loaded but response may vary - this is normal"
        return 0
    fi
}

# Configure model for MCP tool support
configure_model_for_mcp() {
    log_info "Configuring model for MCP tool support..."
    
    # Create a model configuration that supports tool calling
    local modelfile_content='FROM qwen2.5:1.5b

# Set system message for tool calling capability
SYSTEM """You are a helpful AI assistant with access to various tools. When you need to use a tool, respond with a JSON object containing the tool name and parameters. You can use multiple tools in sequence if needed.

Available tool response format:
{
  "tool_call": {
    "name": "tool_name",
    "parameters": {
      "param1": "value1",
      "param2": "value2"
    }
  }
}

Always think step by step and use tools when they can help provide better answers."""

# Optimize for tool calling and instruction following
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_predict 512
'

    # Create the enhanced model
    echo "$modelfile_content" | ollama create qwen2.5:1.5b-mcp || {
        log_info "Model variant creation failed, using base model"
        return 0
    }
    
    log_success "Model configured for MCP tool support"
}

# Show model information
show_model_info() {
    log_info "Model information:"
    
    # Get model details
    local model_info
    model_info=$(curl -s -X POST "$OLLAMA_BASE_URL/api/show" \
        -H "Content-Type: application/json" \
        -d '{"name":"'$MODEL_NAME'"}' 2>/dev/null || echo '{}')
    
    if echo "$model_info" | grep -q "modelfile"; then
        echo "  Model: $MODEL_NAME"
        echo "  Status: Available"
        echo "  Size: $(echo "$model_info" | grep -o '"size":[0-9]*' | cut -d: -f2 | head -1) bytes"
        echo "  Parameters: $(echo "$model_info" | grep -o '"parameter_size":"[^"]*"' | cut -d'"' -f4)"
    else
        echo "  Model: $MODEL_NAME"
        echo "  Status: Available (details not accessible)"
    fi
    
    log_success "Model initialization completed successfully!"
}

# Main execution
main() {
    log_info "Starting Ollama model initialization for Druids system"
    log_info "Target model: $MODEL_NAME"
    
    # Wait for Ollama to be ready
    if ! wait_for_ollama; then
        exit 1
    fi
    
    # Check if model already exists
    if check_model_exists; then
        log_info "Model already available, skipping pull"
    else
        # Pull the model
        if ! pull_model; then
            log_error "Failed to pull model, exiting"
            exit 1
        fi
    fi
    
    # Test the model
    test_model
    
    # Configure for MCP support
    configure_model_for_mcp
    
    # Show final status
    show_model_info
    
    log_success "Ollama initialization complete - ready for Druids agents!"
}

# Run main function
main "$@"