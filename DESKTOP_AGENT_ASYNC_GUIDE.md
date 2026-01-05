# 🧠 Intelligent Async Workflow for Desktop Agents

The Druids MCP server now features **intelligent automatic async detection** that solves the desktop agent timeout problem seamlessly.

## 🎯 The Problem Solved

**Before:** Desktop agents had to manually choose between sync/async and manage complex polling workflows  
**After:** Desktop agents just use `ask_agent` normally - the server handles everything automatically!

## ⚡ How It Works

### 1. **Smart Auto-Detection** 
The `ask_agent` tool now automatically detects when to use async mode based on:

- **Message Length**: >500 characters → async
- **Complex Keywords**: "write", "create", "analyze", "comprehensive", etc. → async  
- **Agent Type**: `gaia`, `worldtree` agents → async
- **Large Context**: >200 chars conversation context → async
- **Force Flag**: `force_async: true` → async

### 2. **Seamless Desktop Agent Experience**

**Simple Request (Sync):**
```json
{
  "name": "ask_agent",
  "arguments": {
    "agent_id": "agent_123",
    "message": "What's the weather like?"
  }
}
```
**Response:** Immediate synchronous response

**Complex Request (Auto-Async):**
```json
{
  "name": "ask_agent", 
  "arguments": {
    "agent_id": "agent_123",
    "message": "Write a comprehensive story about a magical forest"
  }
}
```
**Response:** 
```json
{
  "message": "🔄 Processing your request asynchronously...\n\nAgent Forest Guardian is working on: \"Write a comprehensive story about a magical forest\"\n\n⏱️ Estimated completion: 15s\n\n📋 How to get your response:\n1. Use tool: `get_async_result` with request_id: `req_agent_123_456`\n2. Or wait a moment and I'll check automatically",
  "async_info": {
    "request_id": "req_agent_123_456",
    "estimated_duration": 15000,
    "auto_check_in": 5000,
    "status": "processing"
  }
}
```

### 3. **Desktop Agent Workflow Options**

#### **Option A: Auto-Polling (Recommended)**
1. Call `ask_agent` normally
2. If response includes `async_info`, wait `auto_check_in` milliseconds
3. Call `check_async_ready` with the `request_id`
4. If `ready: true`, you have your result!

#### **Option B: Manual Check**
1. Call `ask_agent` normally  
2. If async, use `get_async_result` when convenient

#### **Option C: Wait and Check**
1. Call `ask_agent` normally
2. If async, call `check_async_ready` with `wait_time: 5000` to wait up to 5 seconds

## 🛠️ Available Tools

### Core Tool: `ask_agent`
**Enhanced with auto-async detection**
```json
{
  "name": "ask_agent",
  "arguments": {
    "agent_id": "agent_123",
    "message": "Your message",
    "conversation_context": "Optional previous context",
    "force_async": false  // Optional: force async even for simple tasks
  }
}
```

### Helper Tools:

#### `get_async_result`
Get async result by request ID
```json
{
  "name": "get_async_result",
  "arguments": {
    "request_id": "req_agent_123_456"
  }
}
```

#### `check_async_ready` 
Smart helper that checks if result is ready and returns it
```json
{
  "name": "check_async_ready", 
  "arguments": {
    "request_id": "req_agent_123_456",
    "wait_time": 3000  // Optional: wait up to 3 seconds
  }
}
```
**Returns:**
```json
{
  "ready": true,
  "status": "completed", 
  "result": "The agent's full response...",
  "duration": 12500,
  "message": "✅ Your request completed successfully!"
}
```

#### `list_async_results`
List all async results for an agent
```json
{
  "name": "list_async_results",
  "arguments": {
    "agent_id": "agent_123"
  }
}
```

## 🤖 Desktop Agent Implementation Guide

### Simple Implementation (JavaScript/TypeScript)
```javascript
class DruidsClient {
  async askAgent(agentId, message, context = null) {
    const response = await this.callTool('ask_agent', {
      agent_id: agentId,
      message,
      conversation_context: context
    });
    
    // Check if it went async
    if (response.async_info) {
      console.log(`⏳ Request is processing asynchronously...`);
      
      // Wait suggested time then auto-check
      await this.sleep(response.async_info.auto_check_in);
      
      return await this.getAsyncResult(response.async_info.request_id);
    }
    
    // Synchronous response
    return response;
  }
  
  async getAsyncResult(requestId, maxWaitTime = 5000) {
    const result = await this.callTool('check_async_ready', {
      request_id: requestId,
      wait_time: maxWaitTime
    });
    
    if (result.ready) {
      return result;
    }
    
    // Still processing, could poll again or return progress
    return {
      status: 'still_processing',
      message: result.message,
      progress: result.progress
    };
  }
  
  private sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Advanced Implementation with Auto-Polling
```javascript
class AdvancedDruidsClient {
  async askAgentWithAutoPolling(agentId, message, maxWaitTime = 30000) {
    const response = await this.callTool('ask_agent', {
      agent_id: agentId,
      message
    });
    
    if (!response.async_info) {
      return response; // Sync response
    }
    
    // Auto-poll for async result
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      await this.sleep(response.async_info.auto_check_in || 3000);
      
      const result = await this.callTool('check_async_ready', {
        request_id: response.async_info.request_id
      });
      
      if (result.ready) {
        return result;
      }
      
      console.log(`⏳ ${result.message}`);
    }
    
    return { status: 'timeout', message: 'Request timed out' };
  }
}
```

## 📊 Benefits

### For Desktop Agents:
- ✅ **Zero timeout issues** - no more hanging requests
- ✅ **Automatic optimization** - no manual sync/async decisions  
- ✅ **Simple API** - just use `ask_agent` normally
- ✅ **Backward compatible** - existing code works unchanged
- ✅ **Rich progress feedback** - know what's happening

### For Users:
- ✅ **Faster simple requests** - sync for quick tasks
- ✅ **Reliable complex requests** - async prevents timeouts
- ✅ **Better UX** - clear progress indicators
- ✅ **Consistent experience** - works the same regardless of complexity

## 🎛️ Configuration

### Force Async Mode
For desktop agents that prefer always-async:
```json
{
  "name": "ask_agent",
  "arguments": {
    "agent_id": "agent_123", 
    "message": "Simple question",
    "force_async": true
  }
}
```

### Adjust Detection Sensitivity
The auto-detection logic can be configured by modifying `shouldUseAsyncMode()` in SimpleMCPServer.ts:

```typescript
// Current thresholds:
- Message length: >500 chars
- Complex keywords: ["write", "create", "analyze", ...]
- Agent types: ["gaia", "worldtree"]
- Context size: >200 chars
```

## 🧪 Testing

Test the intelligent async detection:

```bash
# Start server
npm run mcp:server

# Test sync (simple)
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "ask_agent", "arguments": {"agent_id": "agent_123", "message": "Hi"}}, "id": 1}'

# Test async (complex)  
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "ask_agent", "arguments": {"agent_id": "agent_123", "message": "Write a comprehensive analysis of forest ecosystems"}}, "id": 2}'
```

## 🚀 Migration Guide

### Existing Desktop Agents
**No changes required!** Your existing `ask_agent` calls will automatically benefit from intelligent async detection.

### Optional Enhancements
1. **Add auto-polling** for async responses (recommended)
2. **Use `check_async_ready`** for better UX  
3. **Handle `async_info`** in responses for progress updates

---

**Result: Desktop agents now get reliable, timeout-free agent interactions with zero additional complexity!** 🎉