# Resource Access Tools

## Overview

Built-in file and URL access tools for agents with explicit opt-in permissions and wildcard support.

## Built-In Tools

All agents have access to three foundational resource access tools (when properly configured):

### 1. `read_file`
Read content from files on the filesystem.

**Parameters:**
- `file_url` (string): file:/// URL to read (e.g., `file:///app/data/file.txt`)

**Returns:**
```json
{
  "success": true,
  "file_url": "file:///app/data/file.txt",
  "content": "file contents here",
  "size": 1234
}
```

### 2. `write_file`
Write content to files on the filesystem.

**Parameters:**
- `file_url` (string): file:/// URL to write
- `content` (string): Content to write to file

**Returns:**
```json
{
  "success": true,
  "file_url": "file:///app/data/file.txt",
  "bytes_written": 1234
}
```

### 3. `fetch_url`
Fetch content from HTTP/HTTPS URLs.

**Parameters:**
- `url` (string): HTTP or HTTPS URL to fetch
- `method` (string, optional): HTTP method (GET, POST, PUT, etc.) - default: GET
- `body` (any, optional): Request body for POST/PUT/PATCH
- `headers` (object, optional): Request headers

**Returns:**
```json
{
  "success": true,
  "url": "https://api.example.com/data",
  "status": 200,
  "statusText": "OK",
  "headers": { ... },
  "data": { ... }
}
```

## Configuration

Agents must explicitly opt-in to resource access by configuring `resourceAccess` in their configuration:

```typescript
{
  "resourceAccess": {
    // Option 1: Combined array (recommended)
    "allowedLocations": [
      "file:///app/data/**/*",           // All files in /app/data
      "file:///tmp/*.txt",               // Only .txt files in /tmp
      "https://api.example.com/**",      // All endpoints on this API
      "https://specific.com/endpoint"    // Specific URL only
    ],

    // Option 2: Separate arrays
    "allowedFilePaths": [
      "file:///app/data/**/*"
    ],
    "allowedUrls": [
      "https://api.example.com/**"
    ]
  }
}
```

## Permission Patterns

### File Paths

- **Object-level**: `file:///app/data/specific-file.txt` - exact file only
- **Absolute directory**: `file:///app/data/` - all files in directory (non-recursive)
- **Wildcard single-level**: `file:///app/data/*.txt` - all .txt files in directory
- **Wildcard recursive**: `file:///app/data/**/*` - all files in directory tree

### URLs

- **Exact URL**: `https://api.example.com/v1/endpoint` - specific endpoint only
- **Wildcard path**: `https://api.example.com/v1/**` - all paths under /v1
- **Root wildcard**: `https://api.example.com/**` - all paths on domain
- **Multiple domains**: Can specify different patterns for different domains

## Wildcards

- `*` - Matches any characters except `/` (single path segment)
- `**` - Matches any characters including `/` (multiple path segments)
- `?` - Matches exactly one character

## Security

### Access Control
- Agents without `resourceAccess` configuration cannot use these tools
- Each request is validated against allowed patterns before execution
- Access denied errors include clear messages about missing permissions

### Best Practices
- **Principle of least privilege**: Grant only the minimum access needed
- **Use specific patterns**: Prefer `file:///app/data/config.json` over `file:///**/*`
- **Separate concerns**: Use different patterns for read vs write operations
- **Audit access**: Monitor logs for resource access patterns

## Examples

### Example 1: Configuration Agent with Read-Only Access

```json
{
  "name": "Config Reader",
  "type": "elemental",
  "resourceAccess": {
    "allowedLocations": [
      "file:///app/config/*.json",
      "file:///app/config/*.yaml"
    ]
  }
}
```

**Usage:**
```javascript
// Agent can read config files
await read_file({ file_url: "file:///app/config/settings.json" });

// ❌ This will fail - not in allowed patterns
await read_file({ file_url: "file:///app/secrets/api-keys.json" });
```

### Example 2: Data Processing Agent with Write Access

```json
{
  "name": "Data Processor",
  "type": "elemental",
  "resourceAccess": {
    "allowedLocations": [
      "file:///app/data/input/**/*",     // Read from input
      "file:///app/data/output/**/*"     // Write to output
    ]
  }
}
```

**Usage:**
```javascript
// Read input data
const input = await read_file({ file_url: "file:///app/data/input/data.csv" });

// Process and write output
await write_file({
  file_url: "file:///app/data/output/processed.json",
  content: JSON.stringify(results)
});
```

### Example 3: API Integration Agent

```json
{
  "name": "GitHub API Agent",
  "type": "druid",
  "resourceAccess": {
    "allowedLocations": [
      "https://api.github.com/**"
    ]
  }
}
```

**Usage:**
```javascript
// Fetch repositories
const repos = await fetch_url({
  url: "https://api.github.com/user/repos",
  headers: {
    "Authorization": "Bearer token",
    "Accept": "application/vnd.github.v3+json"
  }
});

// Create an issue
await fetch_url({
  url: "https://api.github.com/repos/owner/repo/issues",
  method: "POST",
  body: {
    title: "Bug report",
    body: "Description"
  },
  headers: {
    "Authorization": "Bearer token"
  }
});
```

### Example 4: Mixed Access Agent

```json
{
  "name": "Report Generator",
  "type": "elemental",
  "resourceAccess": {
    "allowedLocations": [
      "file:///app/reports/**/*",
      "https://data-api.example.com/metrics/**",
      "https://analytics.example.com/**"
    ]
  }
}
```

**Usage:**
```javascript
// Fetch data from APIs
const metrics = await fetch_url({ url: "https://data-api.example.com/metrics/daily" });
const analytics = await fetch_url({ url: "https://analytics.example.com/summary" });

// Generate report
const report = generateReport(metrics, analytics);

// Save to file
await write_file({
  file_url: "file:///app/reports/daily-report.html",
  content: report
});
```

## Error Handling

```javascript
try {
  await read_file({ file_url: "file:///app/data/file.txt" });
} catch (error) {
  // Access denied: Agent agent-123 does not have permission to access file:///app/data/file.txt
  // Configure resourceAccess.allowedLocations to grant access.
}
```

## Implementation Details

### Backend
- `ResourceAccessValidator` service validates all access requests
- Wildcard pattern matching with regex conversion
- Tools implemented as built-in handlers in `AgentService`
- Database column: `resource_access` (JSONB)
- Migration: `004_add_resource_access.sql`

### API
- `POST /api/agents/create` - accepts `resourceAccess` field
- `PUT /api/agents/:id` - accepts `resourceAccess` updates
- `GET /api/agents` - returns `resourceAccess` in agent data

### Frontend
- API types include `resourceAccess` in Agent, CreateAgentRequest, UpdateAgentRequest
- UI components TBD (future enhancement)

## Logging

All resource access operations are logged:

```
📖 Agent agent-123 read file: file:///app/data/file.txt
✍️  Agent agent-123 wrote file: file:///app/data/output.txt (1234 bytes)
🌐 Agent agent-123 fetching URL: GET https://api.example.com/data
```

Access denied attempts are also logged:
```
❌ Agent agent-123 denied access to file:///restricted/file.txt
```
