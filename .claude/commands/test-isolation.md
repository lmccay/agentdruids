---
name: test-isolation
description: Run session isolation protection tests
---

Run the session protection tests in Docker:

```bash
docker-compose exec druids-app npm run test:session-protection
```

Only show me:
- Test summary (passed/failed counts)
- Any failing test details
- Do NOT show passing test output
