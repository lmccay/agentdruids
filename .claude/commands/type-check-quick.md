---
name: type-check-quick
description: Run TypeScript type checking and only report errors
---

Run TypeScript type checking:

```bash
docker-compose exec druids-app npm run type-check
```

Only report:
- Number of errors found (if any)
- The specific error messages
- Do NOT show "Compilation successful" or other verbose output
