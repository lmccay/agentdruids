---
name: Bug report
about: Report something that doesn't work the way it should
title: ''
labels: bug
assignees: ''
---

## What happened

A clear description of the bug. What did you do, what did you expect, what did you get instead?

## Reproduction

Steps to reproduce the behavior. The more specific, the faster we can confirm.

1. ...
2. ...
3. ...

If the bug is in the MCP server, a `curl` command that reproduces it is gold.

## Environment

- Druids commit SHA: `git rev-parse HEAD`
- Host OS: (macOS / Linux distro / Windows)
- Docker version: `docker --version`
- LLM provider: (Ollama / OpenAI)
- Which service is affected: (druids-app / druids-mcp / druids-ui / druids-postgres / druids-redis / druids-ollama)

## Logs

Relevant excerpts from:

```
docker logs druids-app --tail 200
docker logs druids-mcp --tail 200
```

Please scrub API keys and secrets before pasting.

## Additional context

Anything else useful — recent changes you made, related issues, screenshots, etc.
