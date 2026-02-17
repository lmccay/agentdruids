# Tool Calling System

## Overview

Druids uses a **text-based tool calling pattern** where tools are registered via the system prompt and the LLM generates specially formatted text to invoke them.

## How It Works

### 1. Tool Registration

Tools are automatically added to the system prompt in a special section:

```
## Available Tools
You have access to the following tools. To use tools, include one or more TOOL_CALL entries in your response with this exact format:
TOOL_CALL: {"tool": "tool_name", "params": {"param1": "value1", "param2": "value2"}}

Available tools:
- **message_agent**: Send a message to another agent and get their response
  Parameters: agent_id, message
- **read_file**: Read content from a file. Requires file:/// URL with permission.
  Parameters: file_url
- **write_file**: Write content to a file. Requires file:/// URL with permission.
  Parameters: file_url, content
- **fetch_url**: Fetch content from an HTTP/HTTPS URL. Requires URL permission.
  Parameters: url, method, body, headers
```

### 2. Tool Invocation

The LLM includes tool calls in its response:

```
I'll read the file for you.

TOOL_CALL: {"tool": "read_file", "params": {"file_url": "file:///app/data/config.json"}}
```

### 3. Tool Execution

The system:
1. Parses the response using regex: `/TOOL_CALL:\s*(\{(?:[^{}]|{[^{}]*})*\})/g`
2. Extracts the JSON from each match
3. Executes the tool via `executeAgentTool()`
4. Returns results back to the LLM

### 4. Agentic Loop (Iterative Tool Calling)

If agentic loop is enabled, the system:
1. Sends tool results back to the LLM as a new user message
2. LLM can make more tool calls based on results
3. Continues until no more tool calls or max iterations reached

## Built-In Tools

### Communication Tools (All Agents)

1. **`message_agent`** - Send message to another agent
   ```javascript
   TOOL_CALL: {"tool": "message_agent", "params": {"agent_id": "target-agent", "message": "Hello!"}}
   ```

2. **`delegate_task`** - Delegate task to another agent (interactive)
   ```javascript
   TOOL_CALL: {"tool": "delegate_task", "params": {"agent_id": "helper-agent", "task": "Process this data"}}
   ```

3. **`assign_simple_task`** - Assign task to another agent (no interaction)
   ```javascript
   TOOL_CALL: {"tool": "assign_simple_task", "params": {"agent_id": "worker-agent", "task": "Generate report"}}
   ```

4. **`get_step_content`** - Retrieve content from previous coordination step
   ```javascript
   TOOL_CALL: {"tool": "get_step_content", "params": {"content_id": "coordination/session-123-step-1"}}
   ```

### Realm Navigation Tools (Druids Only)

5. **`travel_to_realm`** - Travel to different realm
   ```javascript
   TOOL_CALL: {"tool": "travel_to_realm", "params": {"target_realm": "production-realm"}}
   ```

6. **`get_current_realm`** - Get current realm information
   ```javascript
   TOOL_CALL: {"tool": "get_current_realm", "params": {}}
   ```

7. **`get_realm_elementals`** - List elementals in realm
   ```javascript
   TOOL_CALL: {"tool": "get_realm_elementals", "params": {"realm_id": "dev-realm"}}
   ```

### Resource Access Tools (Opt-In via `resourceAccess`)

8. **`read_file`** - Read file content
   ```javascript
   TOOL_CALL: {"tool": "read_file", "params": {"file_url": "file:///app/data/config.json"}}
   ```

9. **`write_file`** - Write file content
   ```javascript
   TOOL_CALL: {"tool": "write_file", "params": {"file_url": "file:///app/data/output.txt", "content": "Hello World"}}
   ```

10. **`list_files`** - List files and directories in a directory
    ```javascript
    TOOL_CALL: {"tool": "list_files", "params": {"directory_url": "file:///app/data/"}}
    ```

11. **`process_files_batch`** - Process multiple files automatically with iteration
    ```javascript
    TOOL_CALL: {
      "tool": "process_files_batch",
      "params": {
        "input_directory": "file:///app/host/input/training/",
        "output_directory": "file:///app/host/output/training/",
        "file_pattern": "*.md",
        "processing_instructions": "Extract key concepts and create a learning module",
        "output_filename_template": "{basename}_module.md"
      }
    }
    ```

12. **`fetch_url`** - Fetch HTTP/HTTPS URL
    ```javascript
    TOOL_CALL: {"tool": "fetch_url", "params": {"url": "https://api.example.com/data", "method": "GET"}}
    ```

## Tool Availability by Agent Type

| Tool | Druids | Elementals | Gaia | Worldtree |
|------|--------|------------|------|-----------|
| `message_agent` | ✅ | ✅ | ✅ | ✅ |
| `delegate_task` | ✅ | ✅ | ✅ | ✅ |
| `assign_simple_task` | ✅ | ✅ | ✅ | ✅ |
| `get_step_content` | ✅ | ✅ | ✅ | ✅ |
| `travel_to_realm` | ✅ | ❌ | ❌ | ❌ |
| `get_current_realm` | ✅ | ❌ | ❌ | ❌ |
| `get_realm_elementals` | ✅ | ❌ | ❌ | ❌ |
| `read_file` | ✅* | ✅* | ✅* | ✅* |
| `write_file` | ✅* | ✅* | ✅* | ✅* |
| `list_files` | ✅* | ✅* | ✅* | ✅* |
| `process_files_batch` | ✅* | ✅* | ✅* | ✅* |
| `fetch_url` | ✅* | ✅* | ✅* | ✅* |

*\* Requires explicit opt-in via `resourceAccess` configuration*

## Example: Full Tool Calling Flow

### 1. Agent Creation with Resource Access

```json
{
  "name": "Data Processor",
  "type": "elemental",
  "promptConfig": {
    "baseTemplate": "standard",
    "agentExtension": "..."
  },
  "resourceAccess": {
    "allowedLocations": [
      "file:///app/data/**/*",
      "https://api.example.com/**"
    ]
  }
}
```

### 2. System Prompt Generated

The agent receives a system prompt that includes:
- Base template (global instructions)
- Agent type specific instructions (if configured)
- Agent extension (custom instructions)
- Realm context (if applicable)
- **Tool availability section** ← Critical for tool calling!

### 3. User Prompt

```
Read the file at file:///app/data/input.txt and count the words.
```

### 4. LLM Response with Tool Call

```
I'll read the file for you and count the words.

TOOL_CALL: {"tool": "read_file", "params": {"file_url": "file:///app/data/input.txt"}}
```

### 5. Tool Execution

System executes `read_file` and returns:
```json
{
  "success": true,
  "file_url": "file:///app/data/input.txt",
  "content": "Hello world this is a test file",
  "size": 33
}
```

### 6. Result Sent Back to LLM (Agentic Loop)

```
Tool execution results:
Tool: read_file
Result: {"success": true, "content": "Hello world this is a test file", "size": 33}
```

### 7. LLM Final Response

```
The file contains 7 words: "Hello", "world", "this", "is", "a", "test", "file".
```

## Configuration

### Enable Agentic Loop (Recommended for Tool Calling)

```json
{
  "llmConfig": {
    "agenticLoop": {
      "enabled": true,
      "maxIterations": 10,
      "trackCosts": true
    }
  }
}
```

Without agentic loop, agents can only make tool calls once per execution.

### Enable Prompt Composition (Recommended)

```json
{
  "promptConfig": {
    "baseTemplate": "standard",
    "agentExtension": "...",
    "disableRealmPrompt": false
  }
}
```

This ensures the tool awareness section is properly added to the system prompt.

## Troubleshooting

### Tools Not Being Called

**Symptoms:**
- Agent doesn't use tools even when appropriate
- Agent says it can't access files/data

**Causes:**
1. Tool awareness section not added to system prompt
2. Agent doesn't have `promptConfig` configured (using legacy prompts)
3. LLM doesn't generate correct `TOOL_CALL` format
4. Agent doesn't have required permissions (`resourceAccess`)

**Solutions:**
1. Ensure agent has `promptConfig` configured (even if just `{"baseTemplate": "standard"}`)
2. Enable agentic loop for iterative tool calling
3. Check logs for tool awareness section: `docker logs druids-main | grep "Available Tools"`
4. Configure `resourceAccess` for file/URL tools

### Tool Calls Not Parsed

**Symptoms:**
- Logs show `No tool calls found`
- Tools aren't executed despite LLM mentioning them

**Cause:**
- LLM generated incorrect format (not exact `TOOL_CALL: {...}` pattern)

**Solution:**
- Check the LLM's response format
- Ensure model is capable of following format instructions (larger models work better)
- Consider using a model fine-tuned for tool calling

### Permission Denied Errors

**Symptoms:**
- `Access denied: Agent X does not have permission to access file:///...`

**Cause:**
- Agent's `resourceAccess.allowedLocations` doesn't include the requested path

**Solution:**
- Add the path pattern to agent's `resourceAccess.allowedLocations`
- Use wildcards: `file:///app/data/**/*` for directory access

## Limitations

### Current Limitations

1. **Text-based parsing** - Fragile if LLM doesn't generate exact format
2. **No native tool calling** - Not using OpenAI's function calling or Ollama's tools API
3. **Model dependency** - Smaller models may struggle with format
4. **Single-shot by default** - Requires agentic loop enabled for iterative tool use

### Future Improvements

1. **Native tool calling** - Use OpenAI Functions and Ollama tools parameter
2. **Structured outputs** - Use JSON mode for more reliable parsing
3. **Tool schemas** - Pass proper JSON schemas to LLM APIs
4. **Automatic tool discovery** - Dynamic tool registration based on permissions

## Best Practices

1. **Always enable agentic loop** for agents that need tools
2. **Use prompt composition** to ensure tool awareness is added
3. **Configure resource access explicitly** - only grant needed permissions
4. **Use larger models** for better tool calling reliability (e.g., GPT-4 vs GPT-3.5)
5. **Test tool calling** before deploying agents in production
6. **Monitor logs** to debug tool calling issues

## Example: Testing Tool Calling

```bash
# Create agent with all tool access
curl -X POST http://localhost:3000/api/agents/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tool Test Agent",
    "type": "elemental",
    "description": "Testing tool calling",
    "capabilities": ["testing"],
    "promptConfig": {
      "baseTemplate": "standard"
    },
    "llmConfig": {
      "agenticLoop": {
        "enabled": true,
        "maxIterations": 5
      }
    },
    "resourceAccess": {
      "allowedLocations": [
        "file:///app/data/**/*",
        "https://api.example.com/**"
      ]
    }
  }'

# Test with a prompt that requires tool calling
curl -X POST http://localhost:3000/api/agents/tool-test-agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Read the file at file:///app/data/test.txt and tell me what it contains."
  }'

# Check logs for tool calling activity
docker logs druids-main | grep -E "TOOL_CALL|🔧"
```
