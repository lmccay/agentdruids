# Quick Start: Host File Access

## TL;DR

Agents run inside Docker and can't access your host files by default. Here's how to fix that:

### 1. Create Host Directories

```bash
mkdir -p ~/druids-data/{input,output,reports,config}
```

### 2. Add Volume Mounts

Edit `docker-compose.yml` and uncomment/add these lines under `druids-app` volumes:

```yaml
services:
  druids-app:
    volumes:
      # ... existing volumes ...
      - ~/druids-data/input:/app/host/input:ro
      - ~/druids-data/output:/app/host/output:rw
      - ~/druids-data/reports:/app/host/reports:rw
      - ~/druids-data/config:/app/host/config:ro
```

**OR** copy the example configuration:

```bash
cp docker-compose.host-access-example.yml docker-compose.override.yml
# Edit docker-compose.override.yml to customize paths
```

### 3. Restart Containers

```bash
docker-compose down
docker-compose --env-file .env up -d
```

### 4. Verify Mounts

```bash
docker exec druids-main ls -la /app/host
```

You should see: `config`, `input`, `output`, `reports`

### 5. Create Agent with Permissions

Via UI (http://localhost:3004):
1. Create/edit an agent
2. Scroll to "Resource Access (File & URL Tools)"
3. Enter allowed locations (one per line):
   ```
   file:///app/host/input/**/*
   file:///app/host/output/**/*
   file:///app/host/reports/**/*
   file:///app/host/config/**/*
   ```

### 6. Test It

Create test files on your host:

```bash
echo "Hello from host!" > ~/druids-data/input/test.txt
echo '{"version": "1.0"}' > ~/druids-data/config/settings.json
```

Use agent tools:

```javascript
// Read host file
const data = await read_file({
  file_url: "file:///app/host/input/test.txt"
});

// Write to host
await write_file({
  file_url: "file:///app/host/output/result.txt",
  content: "Processed: " + data.content
});
```

Check the output on your host:

```bash
cat ~/druids-data/output/result.txt
# Should see: "Processed: Hello from host!"
```

## Common Use Cases

### Use Case 1: Process Documents

**Setup:**
```yaml
volumes:
  - ~/Documents:/app/host/documents:ro
  - ~/processed:/app/host/processed:rw
```

**Agent Permission:**
```
file:///app/host/documents/**/*
file:///app/host/processed/**/*
```

**Usage:**
```javascript
// Read PDF from Documents
const pdf = await read_file({ file_url: "file:///app/host/documents/report.pdf" });

// Write summary to processed folder
await write_file({
  file_url: "file:///app/host/processed/summary.txt",
  content: "Summary of report..."
});
```

### Use Case 2: Web Scraping + Local Storage

**Setup:**
```yaml
volumes:
  - ~/scraped-data:/app/host/scraped:rw
```

**Agent Permission:**
```
file:///app/host/scraped/**/*
https://example.com/**
```

**Usage:**
```javascript
// Fetch from web
const response = await fetch_url({ url: "https://example.com/data" });

// Save to host
await write_file({
  file_url: "file:///app/host/scraped/data.json",
  content: JSON.stringify(response.data)
});
```

### Use Case 3: Config-Driven Automation

**Setup:**
```yaml
volumes:
  - ~/automation/config:/app/host/config:ro
  - ~/automation/output:/app/host/output:rw
```

**Agent Permission:**
```
file:///app/host/config/**/*
file:///app/host/output/**/*
https://api.service.com/**
```

**Usage:**
```javascript
// Read config
const config = await read_file({ file_url: "file:///app/host/config/tasks.json" });
const tasks = JSON.parse(config.content);

// Execute tasks
for (const task of tasks) {
  const result = await fetch_url({ url: task.url });
  await write_file({
    file_url: `file:///app/host/output/${task.name}.json`,
    content: JSON.stringify(result)
  });
}
```

## Troubleshooting

### "Permission denied" when reading/writing

Fix file permissions on host:
```bash
chmod -R +r ~/druids-data/input   # Make readable
chmod -R +w ~/druids-data/output  # Make writable
```

### "ENOENT: no such file or directory"

1. Check mount exists: `docker exec druids-main ls /app/host`
2. Verify host directory exists: `ls ~/druids-data`
3. Ensure you restarted containers after adding mounts

### "Access denied: Agent X does not have permission"

Check agent's `resourceAccess.allowedLocations` includes the file path.

## Security Notes

- **Use :ro for sensitive data** - Prevents agents from modifying files
- **Never mount:** `/`, `/etc`, `/usr`, `~/.ssh`, `~/.aws`
- **Use specific patterns** - `file:///app/host/data/config.json` is better than `file:///app/host/**/*`

## Full Documentation

- **Complete Guide:** `docs/HOST_FILE_ACCESS.md`
- **Tool Reference:** `docs/RESOURCE_ACCESS_TOOLS.md`
- **Example Config:** `docker-compose.host-access-example.yml`
