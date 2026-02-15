# Remote Access Implementation Summary

## Problem Statement

The Druids web interface required the browser and server to be on the same machine because:

1. **Hardcoded localhost URLs**: Frontend services used `http://localhost:3000` and `http://localhost:3003` directly
2. **Restrictive CORS**: Backend only allowed localhost origins
3. **Host validation**: MCP server rejected non-localhost host headers

## Solution: Hybrid Configuration System

Implemented a flexible configuration system that works across multiple environments:

### 1. Frontend Dynamic URL Configuration

**New file**: `frontend/src/config/api-config.ts`

- Automatically detects environment (development, production, remote)
- Uses relative URLs in development (Vite proxies)
- Uses environment variables when provided (remote access)
- Falls back to window.location for production builds
- Logs configuration in browser console for debugging

**Updated files**:
- `frontend/src/services/coordinationApi.ts` - Uses `apiConfig.mcpBaseURL`
- `frontend/src/services/coordinationRestApi.ts` - Uses `apiConfig.apiBaseURL`
- `frontend/src/services/contentApi.ts` - Uses `apiConfig.apiBaseURL`

### 2. Backend CORS Configuration

**Updated file**: `src/app.ts`

- Dynamic CORS origin validation
- Accepts origins from `ALLOWED_ORIGINS` environment variable
- Allows all ports on `SERVER_HOST` hostname
- Maintains localhost support for development
- Rejects unknown origins for security

### 3. MCP Server Host Validation

**Updated file**: `src/mcp/SimpleMCPServer.ts`

- Checks both localhost and `SERVER_HOST` environment variable
- Allows remote access when `SERVER_HOST` is configured
- Maintains security by validating host header

### 4. Docker Compose Integration

**Updated file**: `docker-compose.yml`

- Added `SERVER_HOST` environment variable (defaults to localhost)
- Made `ALLOWED_ORIGINS` configurable via environment
- Passes configuration to both druids-app and druids-mcp services

### 5. Environment Variable Support

**Updated file**: `.env.example`

Added new configuration options:
- `SERVER_HOST` - Server's IP or hostname for remote access
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

### 6. Automation Script

**New file**: `scripts/setup-remote-access.sh`

Automated setup script that:
- Detects server IP address automatically
- Updates `.env` configuration
- Rebuilds and restarts services
- Verifies health
- Provides access URLs and testing instructions

### 7. Comprehensive Documentation

**New file**: `docs/REMOTE_ACCESS.md`

Complete guide covering:
- Quick start for local network access
- Advanced configuration options (reverse proxy, SSL)
- Security best practices
- Troubleshooting common issues
- Multiple deployment scenarios with examples
- Testing procedures

## Usage

### Quick Setup (Automated)

```bash
./scripts/setup-remote-access.sh
```

### Manual Setup

```bash
# 1. Find your server IP
ifconfig | grep "inet "  # macOS/Linux
# Example: 192.168.1.100

# 2. Update .env
echo "SERVER_HOST=192.168.1.100" >> .env
echo "ALLOWED_ORIGINS=http://192.168.1.100:3004" >> .env

# 3. Rebuild and restart
./scripts/dev.sh stop
docker-compose build --no-cache
./scripts/dev.sh start

# 4. Access from any device
# http://192.168.1.100:3004
```

## Architecture Benefits

### Environment Detection Flow

```
Frontend Initialization
└─> Check for VITE_API_URL/VITE_MCP_URL
    ├─> If present: Use explicit URLs (Remote Mode)
    │   └─> Used for: Production builds with specific server
    │
    ├─> If DEV mode: Use relative URLs (Development Mode)
    │   └─> Vite proxies /api → druids-main:3000/api
    │   └─> Vite proxies /mcp → druids-mcp:3003/mcp
    │   └─> Used for: Local development with docker-compose
    │
    └─> Otherwise: Use window.location (Production Mode)
        └─> Constructs: http://<hostname>:3000/api
        └─> Used for: Production deployment on same host
```

### CORS Validation Flow

```
Backend CORS Middleware
└─> Incoming request from origin: http://192.168.1.100:3004
    │
    ├─> Check 1: Is origin in ALLOWED_ORIGINS env var?
    │   └─> Yes → Allow request
    │
    ├─> Check 2: Is origin hostname same as SERVER_HOST?
    │   └─> Yes → Allow request (any port)
    │
    ├─> Check 3: Is origin localhost/127.0.0.1?
    │   └─> Yes → Allow request (development)
    │
    └─> None matched → Reject with CORS error
```

## Security Considerations

### What's Enabled
- ✅ Local network access (192.168.x.x, 10.x.x.x)
- ✅ Host validation (prevents DNS rebinding attacks)
- ✅ CORS origin checking
- ✅ Development/production mode separation

### What's NOT Included (Add for Production)
- ❌ Authentication/authorization
- ❌ HTTPS/TLS encryption
- ❌ Rate limiting
- ❌ Input validation middleware
- ❌ API key management
- ❌ WAF (Web Application Firewall)

**For production internet deployment**, see "Example 3: Public Internet Access" in `docs/REMOTE_ACCESS.md`.

## Testing Verification

### From Server Machine

```bash
# Test API
curl http://192.168.1.100:3000/health
# Expected: {"status":"healthy",...}

# Test MCP
curl http://192.168.1.100:3003/health
# Expected: {"status":"healthy",...}

# Test UI
curl -I http://192.168.1.100:3004
# Expected: HTTP/1.1 200 OK
```

### From Remote Device

```bash
# Test connectivity
ping 192.168.1.100

# Test API
curl http://192.168.1.100:3000/api/agents
# Expected: JSON array of agents

# Open in browser
# http://192.168.1.100:3004
# Expected: Druids dashboard loads
```

### Browser Console

```javascript
// Check frontend configuration
// Should see in console:
🔧 API Configuration: {
  mode: "development" | "production" | "remote",
  apiBaseURL: "http://192.168.1.100:3000/api",
  mcpBaseURL: "http://192.168.1.100:3003/mcp",
  uiBaseURL: "http://192.168.1.100:3004"
}
```

## Rollback Procedure

If you need to revert to localhost-only:

```bash
# 1. Update .env
sed -i '' 's/^SERVER_HOST=.*/SERVER_HOST=localhost/' .env
sed -i '' 's/^ALLOWED_ORIGINS=.*/ALLOWED_ORIGINS=/' .env

# 2. Rebuild
./scripts/dev.sh stop
docker-compose build --no-cache
./scripts/dev.sh start

# 3. Access only from localhost
# http://localhost:3004
```

Or simply remove the SERVER_HOST and ALLOWED_ORIGINS lines from `.env`.

## Files Changed

### New Files
- `frontend/src/config/api-config.ts` - Dynamic URL configuration
- `scripts/setup-remote-access.sh` - Automated setup script
- `docs/REMOTE_ACCESS.md` - Comprehensive documentation
- `docs/REMOTE_ACCESS_SUMMARY.md` - This file

### Modified Files
- `frontend/src/services/coordinationApi.ts` - Use dynamic URLs
- `frontend/src/services/coordinationRestApi.ts` - Use dynamic URLs
- `frontend/src/services/contentApi.ts` - Use dynamic URLs
- `src/app.ts` - Dynamic CORS configuration
- `src/mcp/SimpleMCPServer.ts` - Remote host validation
- `docker-compose.yml` - Environment variable passthrough
- `.env.example` - New configuration options

### Unchanged Files
- `frontend/src/services/api.ts` - Already used relative URLs ✅
- `frontend/vite.config.ts` - Proxy configuration already correct ✅
- All other frontend/backend files - No changes needed ✅

## Compatibility

### Works With
- ✅ Docker Desktop (macOS, Windows)
- ✅ Docker on Linux
- ✅ Local network access (192.168.x.x, 10.x.x.x)
- ✅ Multiple concurrent remote users
- ✅ Vite dev server (hot reload preserved)
- ✅ Production builds
- ✅ Reverse proxy deployments

### Known Limitations
- Docker host network mode not supported on macOS/Windows (Docker Desktop limitation)
- Requires firewall configuration for remote access
- No built-in HTTPS (use reverse proxy for SSL)
- No authentication system (add separately for production)

## Next Steps

### For Development
1. Run `./scripts/setup-remote-access.sh`
2. Access from other devices on your network
3. Continue development as usual

### For Production Deployment
1. Set up reverse proxy (nginx, Apache, Traefik)
2. Configure SSL certificates (Let's Encrypt)
3. Implement authentication layer
4. Configure firewall rules
5. Set up rate limiting
6. Enable monitoring/alerting
7. See `docs/REMOTE_ACCESS.md` for full production guide

## Support

- **Documentation**: `docs/REMOTE_ACCESS.md`
- **Issues**: Check firewall, Docker ports, SERVER_HOST configuration
- **Testing**: Use curl commands from remote machine first
- **Logs**: `docker logs druids-app -f` and `docker logs druids-mcp -f`

## Success Criteria

✅ Remote browser can load UI at `http://<server-ip>:3004`
✅ Remote browser can create new coordination sessions
✅ Remote browser can view agents, realms, coordinators
✅ No CORS errors in browser console
✅ No "Invalid host header" errors in server logs
✅ Multiple devices can access simultaneously
✅ Local development still works on localhost

---

**Implementation Date**: 2026-02-08
**Author**: Claude Code (Sonnet 4.5)
**Status**: Complete and Tested
