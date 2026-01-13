---
name: quick-health
description: Quick health check of all services
---

Check the health of all Docker services:

```bash
./scripts/health.sh check
docker-compose ps
```

Summarize in 2-3 lines:
- Which services are running/stopped
- Any health issues
- Do NOT show detailed output unless there are problems
