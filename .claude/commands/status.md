---
name: status
description: Show comprehensive status of Druids services
allowed-tools:
  - Bash
---

Here's the current status of the Druids system:

**Docker Services:**
!`docker-compose ps`

**Service Health:**
!`./scripts/health.sh check`

**Recent Logs (last 5 lines from MCP):**
!`docker logs druids-mcp --tail 5`

Summarize this information in 3-4 bullet points, highlighting any issues.
