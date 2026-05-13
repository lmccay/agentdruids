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

1. **`CLAUDE.md` — "Concurrent Session Architecture (CONSTITUTIONAL)"** — coordination sessions must remain fully isolated. No shared mutable state between sessions; services stay stateless; all session state lives in session-scoped managers. The files listed as "protected" in the same document cannot regress.

2. **[docs/MCP_COMPLIANCE_CONSTITUTION.md](docs/MCP_COMPLIANCE_CONSTITUTION.md)** — the MCP server must remain spec-compliant. All MCP requests use the `/mcp` endpoint, `tools/call` returns `{ content: [{ type: "text", text: "..." }] }`, session IDs come from the `Mcp-Session-Id` response header.

If your change touches coordination, session lifecycle, or the MCP server, please read the relevant constitution first and call out in your PR description how the change preserves its invariants.

## Pull request checklist

Before opening a PR:

- [ ] `docker compose exec druids-app npm run type-check` passes
- [ ] `docker compose exec druids-app npm test` passes
- [ ] You haven't committed `.bak`, `.backup`, `.disabled`, or `.env*` files
- [ ] New behavior is covered by a test in the appropriate category (`tests/unit`, `tests/integration`, `tests/contract`)
- [ ] Public-facing changes (API, MCP tools, config) are reflected in the relevant doc under `docs/`

PR titles should describe the user-visible change in one line. The body should explain the *why* — what motivated the change, what tradeoffs you considered — more than the *what*, since the diff already shows the what.

## Contribution workflow (everyone, including maintainers)

Druids uses a standard fork-and-PR workflow. This applies to **all** contributors, maintainers included — there is no "trusted committer" shortcut to direct pushes on `main`. Branch protection on the canonical repository enforces this.

```text
your fork ──(push branch)──> your fork on GitHub ──(PR)──> open-tempest-labs/agentdruids:main
```

For a typical change:

```bash
# One-time: fork open-tempest-labs/agentdruids on GitHub (UI or `gh repo fork`)
git clone https://github.com/<your-username>/agentdruids.git
cd agentdruids
git remote add upstream https://github.com/open-tempest-labs/agentdruids.git
git branch --set-upstream-to=upstream/main main
git config branch.main.pushRemote origin   # keeps accidental pushes off upstream/main

# Per change:
git checkout main && git pull              # sync from upstream
git checkout -b descriptive-branch-name
# ... make changes, run type-check + tests ...
git commit -m "..."
git push -u origin descriptive-branch-name
gh pr create --base main --repo open-tempest-labs/agentdruids
```

To keep your fork's `main` in sync with upstream's `main`, either use GitHub's "Sync fork" button on your fork page, or:

```bash
gh repo sync <your-username>/agentdruids
```

### Direct pushes to `main` (breakglass only)

A small number of operations bypass the PR flow:

- Tagging a release on a commit that is already on `main`
- Emergency security hotfix when a PR cycle would meaningfully extend exposure
- Repository hygiene that doesn't touch source (e.g. README typo on `main` if branch protection allows)

These are exceptions. If you find yourself reaching for a direct push, ask whether it actually meets one of the criteria above — most things that feel urgent do not.

## Reporting bugs and requesting features

Use GitHub Issues. Templates are provided under `.github/ISSUE_TEMPLATE/`. For security issues, see [SECURITY.md](SECURITY.md) — please do not file public issues for vulnerabilities.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
