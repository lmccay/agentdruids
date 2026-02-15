# Remote Access Configuration Guide

This guide explains how to access the Druids web interface from remote browsers (different machines on your network or internet).

## Overview

By default, Druids is configured for localhost-only access. The hybrid configuration system now supports:

1. **Local Development**: Access from the same machine (localhost)
2. **Local Network**: Access from other devices on your LAN (e.g., 192.168.1.x)
3. **Internet**: Access from anywhere via domain name or public IP

## Architecture

The Druids frontend uses **dynamic URL configuration** that adapts to different environments:

- **Development Mode**: Uses Vite dev server proxies (`/api`, `/mcp`)
- **Production Mode**: Uses environment variables or window.location
- **Remote Mode**: Uses explicitly configured server URLs

## Quick Start: Local Network Access

### 1. Find Your Server's IP Address

```bash
# On macOS/Linux:
ifconfig | grep "inet "

# On Windows:
ipconfig

# Look for your local IP (usually starts with 192.168.x.x or 10.x.x.x)
```

Example output: `192.168.1.100`

### 2. Update Environment Configuration

Edit your `.env` file:

```bash
# Set your server's IP or hostname
SERVER_HOST=192.168.1.100

# Optional: Add specific allowed origins
ALLOWED_ORIGINS=http://192.168.1.100:3004,http://192.168.1.101:3004
```

### 3. Rebuild and Restart Services

```bash
# Stop services
./scripts/dev.sh stop

# Rebuild with new configuration
docker-compose build --no-cache

# Start with new environment
./scripts/dev.sh start
```

### 4. Access from Remote Browser

Open your browser on **any device on the same network**:

```
http://192.168.1.100:3004
```

Replace `192.168.1.100` with your actual server IP.

## Advanced Configuration

### Option 1: Environment Variables Only (Backend)

This approach sets environment variables on the server side. The frontend will automatically detect the server location.

**In `.env` file:**

```bash
SERVER_HOST=192.168.1.100
ALLOWED_ORIGINS=http://192.168.1.100:3004
```

**Frontend Behavior:**
- Detects it's running in production mode
- Uses `window.location.hostname` to find the server
- Constructs API URLs: `http://<hostname>:3000/api` and `http://<hostname>:3003/mcp`

### Option 2: Frontend Build-Time Variables

For production builds with specific server URLs:

**Create `.env.local` in `frontend/` directory:**

```bash
VITE_API_URL=http://192.168.1.100:3000/api
VITE_MCP_URL=http://192.168.1.100:3003/mcp
VITE_UI_URL=http://192.168.1.100:3004
```

**Build frontend:**

```bash
cd frontend
npm run build
```

### Option 3: Reverse Proxy (Recommended for Production)

Use a reverse proxy (nginx, Apache, Traefik) to serve all services on a single domain:

**Example nginx configuration:**

```nginx
server {
    listen 80;
    server_name druids.example.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Main API
    location /api {
        proxy_pass http://localhost:3000/api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # MCP Server
    location /mcp {
        proxy_pass http://localhost:3003/mcp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Required for SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
}
```

With reverse proxy, frontend uses relative URLs automatically.

## Security Considerations

### Development vs Production

**Development Mode (default):**
- CORS allows localhost origins
- Host validation only checks localhost
- ⚠️ **DO NOT expose development mode to the internet**

**Production Mode (with SERVER_HOST set):**
- CORS allows configured origins
- Host validation checks SERVER_HOST
- Still requires proper security measures

### Recommended Security Practices

1. **Use Reverse Proxy**: Don't expose raw ports (3000, 3003, 3004) to internet
2. **Enable HTTPS**: Use Let's Encrypt or similar for SSL certificates
3. **Firewall Rules**: Only expose port 80/443, block direct access to service ports
4. **Authentication**: Add authentication layer (not included in base Druids)
5. **Rate Limiting**: Implement rate limiting on API endpoints
6. **ALLOWED_ORIGINS**: Explicitly list allowed origins, don't use wildcards in production

### Network Security

**Local Network Only:**
```bash
# Firewall: Only allow connections from local network
sudo ufw allow from 192.168.1.0/24 to any port 3004
```

**Internet Access with Reverse Proxy:**
```bash
# Only expose reverse proxy port
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to service ports
sudo ufw deny 3000/tcp
sudo ufw deny 3003/tcp
sudo ufw deny 3004/tcp
```

## Troubleshooting

### Issue: "CORS Error" in Browser Console

**Symptoms:**
```
Access to fetch at 'http://192.168.1.100:3000/api/...' from origin
'http://192.168.1.100:3004' has been blocked by CORS policy
```

**Solution:**
1. Ensure `SERVER_HOST=192.168.1.100` is set in `.env`
2. Rebuild services: `docker-compose build --no-cache`
3. Restart: `./scripts/dev.sh start`
4. Check logs: `docker logs druids-app -f`

### Issue: "Invalid host header" Error

**Symptoms:**
```json
{"error": "Invalid host header"}
```

**Solution:**
- Set `SERVER_HOST` in `.env` to match the hostname/IP you're accessing
- Restart MCP server: `docker-compose restart druids-mcp`

### Issue: Frontend Shows "Failed to fetch"

**Symptoms:**
- Network tab shows failed requests
- Requests go to wrong URL

**Solution:**
1. Check browser console for API configuration:
   ```
   🔧 API Configuration: { mode: '...', apiBaseURL: '...', mcpBaseURL: '...' }
   ```
2. Verify URLs point to correct server
3. If using build-time variables, rebuild frontend:
   ```bash
   cd frontend
   npm run build
   docker-compose build druids-ui --no-cache
   docker-compose restart druids-ui
   ```

### Issue: Can't Access from Other Devices

**Checklist:**
- [ ] Server firewall allows ports 3000, 3003, 3004
- [ ] Docker containers bind to `0.0.0.0` (not `127.0.0.1`)
- [ ] `SERVER_HOST` set to server's IP (not localhost)
- [ ] Client device is on same network (for local network access)
- [ ] Server IP hasn't changed (check with `ifconfig`/`ipconfig`)

## Docker Networking

### Host Network Mode (Alternative)

For simpler networking on Linux, use host network mode:

**In `docker-compose.yml`:**

```yaml
services:
  druids-app:
    network_mode: "host"
    # Remove ports mapping (not needed with host mode)
```

**⚠️ Note:** Host network mode doesn't work on Docker Desktop (macOS/Windows).

### Bridge Network (Default)

Default bridge mode with port mapping works across all platforms:

```yaml
services:
  druids-app:
    ports:
      - "3000:3000"  # Maps container:3000 to host:3000
```

Ensure `EXPOSE` directives exist in Dockerfiles.

## Testing Remote Access

### From Server Machine

```bash
# Test API
curl http://192.168.1.100:3000/api/agents

# Test MCP
curl http://192.168.1.100:3003/mcp

# Test UI (should return HTML)
curl http://192.168.1.100:3004
```

### From Remote Machine

```bash
# Replace 192.168.1.100 with your server IP

# Test connectivity
ping 192.168.1.100

# Test API
curl http://192.168.1.100:3000/health

# Test MCP
curl http://192.168.1.100:3003/health

# Open in browser
# http://192.168.1.100:3004
```

## Configuration Reference

### Environment Variables

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `SERVER_HOST` | Server hostname/IP for remote access | `192.168.1.100` | For remote access |
| `ALLOWED_ORIGINS` | Additional CORS origins (comma-separated) | `http://192.168.1.100:3004` | Optional |
| `VITE_API_URL` | Frontend: Override API URL | `http://192.168.1.100:3000/api` | Build-time only |
| `VITE_MCP_URL` | Frontend: Override MCP URL | `http://192.168.1.100:3003/mcp` | Build-time only |
| `VITE_UI_URL` | Frontend: Override UI URL | `http://192.168.1.100:3004` | Build-time only |

### Frontend API Configuration

The frontend automatically detects the environment and builds appropriate URLs:

1. **Has `VITE_API_URL` or `VITE_MCP_URL`?** → Use explicit URLs (Remote Mode)
2. **Running in dev mode?** → Use relative URLs with Vite proxy (Development Mode)
3. **Otherwise** → Use window.location with :3000/:3003 ports (Production Mode)

You can inspect the active configuration in browser console:
```javascript
// The configuration is logged on page load
🔧 API Configuration: {
  mode: "remote",
  apiBaseURL: "http://192.168.1.100:3000/api",
  mcpBaseURL: "http://192.168.1.100:3003/mcp",
  uiBaseURL: "http://192.168.1.100:3004"
}
```

## Examples

### Example 1: Home Network Access

**Scenario:** Access Druids from your laptop/phone while server runs on desktop.

```bash
# On server (.env file):
SERVER_HOST=192.168.1.100
ALLOWED_ORIGINS=http://192.168.1.100:3004

# Restart services
./scripts/dev.sh stop
docker-compose build --no-cache
./scripts/dev.sh start

# On any device (browser):
http://192.168.1.100:3004
```

### Example 2: Remote Development Team

**Scenario:** Multiple developers accessing shared Druids instance.

```bash
# On server (.env file):
SERVER_HOST=dev-server.local
ALLOWED_ORIGINS=http://dev-server.local:3004,http://192.168.1.100:3004

# Each developer accesses:
http://dev-server.local:3004  # Via DNS
# OR
http://192.168.1.100:3004     # Via IP
```

### Example 3: Public Internet Access

**Scenario:** Access Druids from anywhere via domain name.

**Requirements:**
- Domain name pointing to server
- Reverse proxy (nginx)
- SSL certificate (Let's Encrypt)

```bash
# nginx config: /etc/nginx/sites-available/druids
server {
    listen 443 ssl http2;
    server_name druids.example.com;

    ssl_certificate /etc/letsencrypt/live/druids.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/druids.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3004;
    }

    location /api {
        proxy_pass http://localhost:3000;
    }

    location /mcp {
        proxy_pass http://localhost:3003;
        proxy_buffering off;
    }
}

# On server (.env file):
SERVER_HOST=druids.example.com
ALLOWED_ORIGINS=https://druids.example.com

# Access from anywhere:
https://druids.example.com
```

## See Also

- [CLAUDE.md](../CLAUDE.md) - Development workflow and Docker commands
- [README.md](../README.md) - Project overview and setup
- [docker-compose.yml](../docker-compose.yml) - Service configuration
