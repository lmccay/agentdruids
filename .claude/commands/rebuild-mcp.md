---
name: rebuild-mcp
description: Rebuild and restart MCP server with environment variables
---

Execute these commands to rebuild the druids-mcp service:

```bash
docker-compose build druids-mcp --no-cache
docker-compose --env-file .env up -d druids-mcp
docker logs druids-mcp --tail 20
```

Only report back:
- If there are any errors in the logs
- Confirmation that the service is running
- Do NOT include successful build output or routine startup logs
