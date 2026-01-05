# How MCP Clients Like Goose Get Final Results from Druids

## Quick Answer

MCP clients like Goose Desktop retrieve final results using the **`get_coordination_session`** tool, which returns the complete coordination session including the final synthesized content.

## Step-by-Step Process

### 1. Initialize MCP Session
```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "1.0",
    "capabilities": {},
    "clientInfo": {"name": "goose", "version": "1.0"}
  }
}
```
Returns `Mcp-Session-Id` header for subsequent requests.

### 2. Start Coordination
```json
{
  "jsonrpc": "2.0", 
  "method": "tools/call",
  "params": {
    "name": "coordinate_project",
    "arguments": {
      "request": "Your natural language request here",
      "max_agents": 3,
      "timeout_minutes": 10
    }
  }
}
```
Returns a `session_id` for the coordination.

### 3. Monitor Progress & Get Results
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call", 
  "params": {
    "name": "get_coordination_session",
    "arguments": {
      "session_id": "session-12345"
    }
  }
}
```

## Result Structure

The response contains:

```json
{
  "session_id": "session-12345",
  "status": "completed",
  "final_result": {
    "integratedContent": "THE ACTUAL WORK PRODUCT HERE",
    "summary": "Executive summary",
    "participantContributions": [...],
    "publishedTo": [...]
  },
  "participant_count": 3,
  "tasks_completed": 3
}
```

## Key Properties for Goose

- **`final_result.integratedContent`** - The main deliverable (full content)
- **`final_result.summary`** - Executive summary
- **`status`** - "in_progress", "completed", "failed"
- **`tasks_completed`** - Progress indicator

## Additional Result Retrieval Tools

I've also added enhanced tools for result retrieval:

- **`get_published_content`** - Retrieve published coordination results
- **`list_published_content`** - Browse all available published content
- **`get_scenario_execution_result`** - Get detailed scenario execution results

## Async Handling

For long-running tasks, the system automatically:
- Switches to async mode for complex requests
- Stores results in WorldTree namespace
- Provides progress tracking via `get_coordination_session`

## Error Handling

If coordination fails:
- `status` will be "failed"
- `final_result` may be null or contain partial results
- Check individual `participant_tasks` for specific failures

## Example in Practice

```bash
# Start coordination
response=$(curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"coordinate_project","arguments":{"request":"Analyze market trends"}}}')

session_id=$(echo "$response" | jq -r '.result.content[0].text' | jq -r '.session_id')

# Monitor until complete
while true; do
  status=$(curl -X POST http://localhost:3003/mcp \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_coordination_session\",\"arguments\":{\"session_id\":\"$session_id\"}}}")
  
  if [ "$(echo "$status" | jq -r '.result.content[0].text' | jq -r '.status')" = "completed" ]; then
    # Get final result
    final_content=$(echo "$status" | jq -r '.result.content[0].text' | jq -r '.final_result.integratedContent')
    echo "$final_content"
    break
  fi
  sleep 10
done
```

## Summary

**For Goose Desktop users**: The `get_coordination_session` tool is your primary method to get final results. It contains the actual work products that agents produced in `final_result.integratedContent`.