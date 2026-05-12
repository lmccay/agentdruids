# Contributing to Druids

Thanks for your interest in Druids. This guide covers how to get a development environment running, what to know before opening a pull request, and the architectural rules we treat as non-negotiable.

## Code of conduct

Be civil, assume good faith, and keep discussions focused on the work. Disagreements about technical direction are welcome; personal attacks are not.

## Development setup

Druids is Docker-first. All development, testing, and runtime workflows assume services run in containers. Running individual services with `npm` directly on your host is not supported as a primary workflow because the system depends on Postgres, Redis, and Ollama running alongside the app.

```bash
git clone https://github.com/<owner>/agentdruids.git
cd agentdruids
cp .env.example .env
# edit .env — at minimum set OPENAI_API_KEY if using OpenAI as the LLM provider
docker compose --env-file .env up -d
./scripts/health.sh check
```

See [README.md](README.md) for full setup including access points (UI, MCP, Grafana).

## Iteration loop

```bash
# After changing TypeScript code:
docker compose build druids-app --no-cache
docker compose --env-file .env up -d druids-app
docker logs druids-app -f

# Type-check (always before pushing):
docker compose exec druids-app npm run type-check

# Tests:
docker compose exec druids-app npm test                    # full suite
docker compose exec druids-app npm run test:unit           # fast feedback
docker compose exec druids-app npm run test:integration
docker compose exec druids-app npm run test:contract       # MCP protocol compliance
```

If something is misbehaving in a way that doesn't reproduce in clean state, a full reset usually clears it:

```bash
docker compose down -v
docker compose --env-file .env up -d
```

## Architectural rules (non-negotiable)

Two architectural documents are treated as constitutions. Pull requests that violate them will be asked to change before review.

1. **[CONCURRENT_SESSION_CONSTITUTION.md](CONCURRENT_SESSION_CONSTITUTION.md)** — coordination sessions must remain fully isolated. No shared mutable state between sessions; services stay stateless; all session state lives in session-scoped managers. The files listed as "protected" in `CLAUDE.md` cannot regress.

2. **[docs/MCP_COMPLIANCE_CONSTITUTION.md](docs/MCP_COMPLIANCE_CONSTITUTION.md)** — the MCP server must remain spec-compliant. All MCP requests use the `/mcp` endpoint, `tools/call` returns `{ content: [{ type: "text", text: "..." }] }`, session IDs come from the `Mcp-Session-Id` response header.

If your change touches coordination, session lifecycle, or the MCP server, please read the relevant constitution first and call out in your PR description how the change preserves its invariants.

## Pull request checklist

Before opening a PR:

- [ ] `docker compose exec druids-app npm run type-check` passes
- [ ] `docker compose exec druids-app npm test` passes (or, if you've touched coordination, also `npm run test:session-protection`)
- [ ] You haven't committed `.bak`, `.backup`, `.disabled`, or `.env*` files
- [ ] New behavior is covered by a test in the appropriate category (`tests/unit`, `tests/integration`, `tests/contract`, `tests/performance`)
- [ ] Public-facing changes (API, MCP tools, config) are reflected in the relevant doc under `docs/`

PR titles should describe the user-visible change in one line. The body should explain the *why* — what motivated the change, what tradeoffs you considered — more than the *what*, since the diff already shows the what.

## Reporting bugs and requesting features

Use GitHub Issues. Templates are provided under `.github/ISSUE_TEMPLATE/`. For security issues, see [SECURITY.md](SECURITY.md) — please do not file public issues for vulnerabilities.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
