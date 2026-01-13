---
name: quick-rebuild
description: Rebuild a service and show only errors or confirmation
allowed-tools:
  - Bash
---

Which service do you want to rebuild? (app, mcp, or ui)

Once you tell me, I'll execute:
```bash
docker-compose build druids-{service} --no-cache
docker-compose --env-file .env up -d druids-{service}
docker logs druids-{service} --tail 20
```

And report back only errors or confirmation that it's running.
