# OpenAI API Integration Guide

## Overview

The Druids Multi-Agent System now supports both Ollama (local models) and OpenAI API (cloud models) as LLM providers. This gives you flexibility to use:

- **Ollama**: Local models (qwen2.5:1.5b, llama2, etc.) for privacy and offline operation
- **OpenAI**: Powerful cloud models (GPT-4, GPT-3.5-turbo) for maximum capability

## Configuration

### 1. Environment Variables

Add these variables to your `.env` file or set them in your environment:

```bash
# Required: Your OpenAI API key
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional: Organization ID (if you belong to multiple orgs)
OPENAI_ORGANIZATION=org-your-organization-id-here

# Optional: Custom API endpoint (default: https://api.openai.com/v1)
OPENAI_BASE_URL=https://api.openai.com/v1

# Optional: Default model (default: gpt-4)
OPENAI_DEFAULT_MODEL=gpt-4

# Optional: Request timeout in milliseconds (default: 60000)
OPENAI_TIMEOUT=60000
```

### 2. Getting Your OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in to your account
3. Click "Create new secret key"
4. Copy the key (it starts with `sk-`)
5. Add it to your `.env` file

### 3. Docker Configuration

For Docker deployments, set environment variables in your shell or `.env.local`:

```bash
# Create a local environment file for secrets
echo "OPENAI_API_KEY=sk-your-actual-key-here" > .env.local

# Start containers with environment variables
docker-compose --env-file .env.local up -d
```

Or directly in docker-compose:

```bash
export OPENAI_API_KEY="sk-your-actual-key-here"
docker-compose up -d
```

## Creating Agents with Different Providers

### OpenAI Agent (GPT-4)

```javascript
const openaiAgent = {
  name: "gpt4-analyst",
  type: "druid",
  description: "Advanced financial analyst using GPT-4",
  llmConfig: {
    provider: "openai",
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: "You are an expert financial analyst..."
  }
}
```

### Ollama Agent (Local)

```javascript
const ollamaAgent = {
  name: "local-analyst", 
  type: "druid",
  description: "Local financial analyst using Qwen",
  llmConfig: {
    provider: "ollama",
    model: "qwen2.5:1.5b",
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "You are a helpful financial analyst..."
  }
}
```

## Available Models

### OpenAI Models
- `gpt-4` - Most capable, best for complex analysis
- `gpt-4-turbo` - Faster GPT-4 variant
- `gpt-3.5-turbo` - Fast and cost-effective
- `gpt-3.5-turbo-16k` - Extended context window

### Ollama Models
- `qwen2.5:1.5b` - Fast, lightweight (default)
- `llama2` - General purpose
- `mistral` - Good balance of speed/capability
- `codellama` - Specialized for code

## Cost Considerations

### OpenAI Pricing (approximate)
- GPT-4: ~$0.03-0.06 per 1K tokens
- GPT-3.5-turbo: ~$0.001-0.002 per 1K tokens

### Ollama Pricing
- **Free** - Runs locally on your hardware
- Only costs electricity and hardware

## Usage Examples

### MCP Client Usage

```bash
# Create OpenAI agent
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: your-session-id" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "agent_create",
      "arguments": {
        "name": "gpt4-expert",
        "type": "druid",
        "description": "Expert analyst using GPT-4",
        "llmConfig": {
          "provider": "openai",
          "model": "gpt-4",
          "temperature": 0.7
        }
      }
    }
  }'

# The intelligent async detection works with both providers!
# Complex queries automatically use async mode regardless of provider
```

## Benefits by Provider

### OpenAI Advantages
- ✅ Extremely capable models (GPT-4)
- ✅ Fast response times
- ✅ Large context windows
- ✅ Reliable uptime
- ✅ No local hardware requirements

### Ollama Advantages  
- ✅ Complete privacy (no data sent to cloud)
- ✅ No API costs
- ✅ Works offline
- ✅ No rate limits
- ✅ Full control over models

## Intelligent Async Detection

The intelligent async detection system works seamlessly with both providers:

- **Complex queries** → Automatic async mode (prevents timeouts)
- **Simple queries** → Immediate sync responses
- **Works with any provider** → OpenAI, Ollama, or future providers

Example complex query (triggers async):
```
"Please conduct a comprehensive market analysis for AI companies, including stock performance, earnings trends, competitive positioning, and provide detailed investment recommendations with risk assessment."
```

This will automatically switch to async mode whether using GPT-4 or Qwen2.5!

## Error Handling

The system gracefully handles:
- Missing API keys (falls back to Ollama)
- Network issues
- Model unavailability
- Rate limiting (OpenAI)
- Timeout protection (both providers)

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for all secrets
3. **Rotate API keys** regularly
4. **Monitor usage** on OpenAI dashboard
5. **Use least-privilege** organization settings

## Troubleshooting

### OpenAI Issues
```bash
# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check container logs
docker logs druids-mcp-server
```

### Ollama Issues
```bash
# Test Ollama connection
curl http://localhost:11434/api/tags

# Check model availability
ollama list
```

Ready to use both local and cloud LLMs with intelligent async detection! 🚀