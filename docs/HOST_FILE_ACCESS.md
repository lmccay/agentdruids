# Host File Access from Docker Containers

## Problem

When agents run inside Docker containers, `file:///` paths reference the **container's filesystem**, not your host machine. To grant agents access to host files, you must mount host directories as volumes.

## Solution: Volume Mounts

### 1. Update docker-compose.yml

Add volume mounts to the `druids-app` service to expose host directories:

```yaml
services:
  druids-app:
    volumes:
      - .:/app                          # Project directory (already present)
      - /app/node_modules               # Node modules (already present)
      - druids-data:/app/data           # Named volume (already present)

      # ADD YOUR HOST MOUNTS HERE:
      - ~/Documents:/app/host/documents:ro    # Read-only mount
      - ~/Downloads:/app/host/downloads:rw    # Read-write mount
      - /tmp:/app/host/tmp:rw                 # Temp directory
```

**Mount Options:**
- `:ro` - Read-only (agents can use `read_file` but not `write_file`)
- `:rw` - Read-write (agents can use both `read_file` and `write_file`)
- No suffix - Defaults to read-write

### 2. Configure Agent Permissions

When creating an agent, grant access to the **container paths** (not host paths):

**Example:**
```json
{
  "resourceAccess": {
    "allowedLocations": [
      "file:///app/host/documents/**/*",     // Access all documents
      "file:///app/host/downloads/*.pdf",    // Only PDF files in downloads
      "file:///app/host/tmp/**/*"            // Full access to temp
    ]
  }
}
```

### 3. Restart Containers

After updating `docker-compose.yml`:

```bash
docker-compose down
docker-compose --env-file .env up -d
```

## Complete Example

### Host Machine Setup

Assume you want agents to:
1. Read configuration files from `~/config`
2. Write reports to `~/reports`
3. Process data from `~/data/input` and write to `~/data/output`

### Step 1: Update docker-compose.yml

```yaml
services:
  druids-app:
    volumes:
      - .:/app
      - /app/node_modules
      - druids-data:/app/data

      # Host directory mounts
      - ~/config:/app/host/config:ro           # Read-only configs
      - ~/reports:/app/host/reports:rw         # Write reports here
      - ~/data/input:/app/host/input:ro        # Read input data
      - ~/data/output:/app/host/output:rw      # Write processed data
```

### Step 2: Create Agent with Permissions

Via API:
```bash
curl -X POST http://localhost:3000/api/agents/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Report Generator",
    "type": "elemental",
    "description": "Generates reports from data",
    "capabilities": ["data-processing"],
    "resourceAccess": {
      "allowedLocations": [
        "file:///app/host/config/**/*",
        "file:///app/host/input/**/*",
        "file:///app/host/output/**/*",
        "file:///app/host/reports/**/*"
      ]
    }
  }'
```

Via UI (http://localhost:3004):
1. Create new agent
2. Scroll to "Resource Access" section
3. Enter:
   ```
   file:///app/host/config/**/*
   file:///app/host/input/**/*
   file:///app/host/output/**/*
   file:///app/host/reports/**/*
   ```

### Step 3: Use Tools in Agent

The agent can now:

```javascript
// Read host config file
const config = await read_file({
  file_url: "file:///app/host/config/settings.json"
});

// Read input data from host
const inputData = await read_file({
  file_url: "file:///app/host/input/data.csv"
});

// Write report to host
await write_file({
  file_url: "file:///app/host/reports/report-2024.html",
  content: generatedReport
});

// Write processed data to host
await write_file({
  file_url: "file:///app/host/output/processed.json",
  content: JSON.stringify(results)
});
```

## Path Mapping Reference

| Host Path | Container Mount | Agent Permission | Purpose |
|-----------|-----------------|------------------|---------|
| `~/Documents` | `/app/host/documents` | `file:///app/host/documents/**/*` | Access documents |
| `~/Downloads` | `/app/host/downloads` | `file:///app/host/downloads/**/*` | Access downloads |
| `~/config` | `/app/host/config` | `file:///app/host/config/**/*` | Read configs |
| `~/data/input` | `/app/host/input` | `file:///app/host/input/**/*` | Read input data |
| `~/data/output` | `/app/host/output` | `file:///app/host/output/**/*` | Write output data |
| `/tmp` | `/app/host/tmp` | `file:///app/host/tmp/**/*` | Temp files |

## Security Best Practices

### 1. Use Read-Only Mounts When Possible

```yaml
- ~/sensitive-data:/app/host/sensitive:ro    # Read-only
```

This prevents agents from accidentally (or maliciously) modifying sensitive data.

### 2. Mount Specific Directories

**Bad (too broad):**
```yaml
- ~:/app/host/home:rw    # Entire home directory!
```

**Good (specific):**
```yaml
- ~/work/project:/app/host/project:rw
```

### 3. Use Granular Agent Permissions

Even with volume mounts, limit agent access with specific patterns:

```json
{
  "allowedLocations": [
    "file:///app/host/project/data/*.json",    // Only JSON files
    "file:///app/host/project/reports/**/*"    // Only reports directory
  ]
}
```

### 4. Avoid Mounting System Directories

**Never mount these:**
- `/` (root)
- `/etc` (system configs)
- `/usr` (system binaries)
- `/var` (system data)
- `~/.ssh` (SSH keys)
- `~/.aws` (AWS credentials)

## Common Mount Patterns

### Pattern 1: Data Processing

```yaml
volumes:
  - ~/data/raw:/app/host/raw:ro              # Read raw data
  - ~/data/processed:/app/host/processed:rw  # Write processed data
```

Agent permission:
```
file:///app/host/raw/**/*
file:///app/host/processed/**/*
```

### Pattern 2: Configuration + Output

```yaml
volumes:
  - ~/myapp/config:/app/host/config:ro
  - ~/myapp/logs:/app/host/logs:rw
```

Agent permission:
```
file:///app/host/config/**/*
file:///app/host/logs/**/*
```

### Pattern 3: Multiple Projects

```yaml
volumes:
  - ~/projects/project-a:/app/host/project-a:rw
  - ~/projects/project-b:/app/host/project-b:rw
```

Create separate agents for each project with isolated permissions.

## Troubleshooting

### Error: "Permission denied" when reading/writing

**Cause:** File permissions inside container don't match the mounted files.

**Solution:** Ensure host files are readable/writable by the container user (usually running as node/root).

```bash
# On host machine, make files readable
chmod -R +r ~/data/input

# Make directory writable
chmod -R +w ~/data/output
```

### Error: "ENOENT: no such file or directory"

**Cause:** Path doesn't exist or incorrect mount path.

**Solution:**
1. Verify mount exists: `docker exec druids-main ls /app/host`
2. Check agent permission matches mount path
3. Ensure host directory exists before starting containers

### Files written by container are owned by root

**Cause:** Container runs as root by default.

**Solution:** Add user mapping in docker-compose.yml (advanced):

```yaml
services:
  druids-app:
    user: "${UID}:${GID}"  # Use host user ID
```

Then start with: `UID=$(id -u) GID=$(id -g) docker-compose up -d`

## Example: Complete Setup for Mac/Linux

### 1. Create Host Directories

```bash
mkdir -p ~/druids-data/{input,output,reports,config}
```

### 2. Update docker-compose.yml

```yaml
services:
  druids-app:
    volumes:
      - .:/app
      - /app/node_modules
      - druids-data:/app/data
      - ~/druids-data/input:/app/host/input:ro
      - ~/druids-data/output:/app/host/output:rw
      - ~/druids-data/reports:/app/host/reports:rw
      - ~/druids-data/config:/app/host/config:ro
```

### 3. Add Config File

```bash
echo '{"version": "1.0", "mode": "production"}' > ~/druids-data/config/app.json
```

### 4. Restart Containers

```bash
docker-compose down
docker-compose --env-file .env up -d
```

### 5. Test Access

```bash
# Check mounts inside container
docker exec druids-main ls -la /app/host

# You should see: config, input, output, reports
```

### 6. Create Agent with Access

Via UI or API with permissions:
```
file:///app/host/input/**/*
file:///app/host/output/**/*
file:///app/host/reports/**/*
file:///app/host/config/**/*
```

## Windows Notes

On Windows with Docker Desktop, paths use forward slashes:

```yaml
volumes:
  - C:/Users/YourName/Documents:/app/host/documents:rw
```

Or use WSL2 paths:
```yaml
volumes:
  - /mnt/c/Users/YourName/Documents:/app/host/documents:rw
```

## Quick Reference

| Want to... | Add volume mount | Agent permission |
|------------|------------------|------------------|
| Read host files | `~/mydir:/app/host/mydir:ro` | `file:///app/host/mydir/**/*` |
| Write host files | `~/mydir:/app/host/mydir:rw` | `file:///app/host/mydir/**/*` |
| Access specific file | `~/file.txt:/app/host/file.txt:ro` | `file:///app/host/file.txt` |
| Temp storage | `/tmp:/app/host/tmp:rw` | `file:///app/host/tmp/**/*` |
