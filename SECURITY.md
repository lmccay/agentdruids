# Security Policy

## Supported versions

Druids is in active development and does not yet ship versioned releases. Security fixes are applied to the `main` branch. If you depend on Druids in any production-like setting, track `main` and the [GitHub Security Advisories](../../security/advisories) for this repository.

## Reporting a vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Use GitHub's private vulnerability reporting to send the report to the maintainers:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Provide as much detail as you can:
   - Affected component (e.g. MCP server, REST API, coordination layer, agent tool execution, frontend)
   - Druids version or commit SHA
   - Reproduction steps or proof-of-concept
   - Impact: what an attacker could achieve
   - Suggested remediation if you have one

You can expect:

- An acknowledgement within 5 business days.
- A triage decision and severity assessment within 10 business days.
- A coordinated disclosure timeline once a fix is in progress. We default to a 90-day disclosure window but will adjust based on severity and the complexity of the fix.

## Scope

In scope for security reports:

- The MCP server (`src/mcp/`) — particularly any way to bypass session isolation, escape namespace access controls, or execute tools outside an agent's `resourceAccess` allowlist
- The REST API (`src/api/`) — authentication, authorization, input validation, injection
- The coordination layer (`src/services/Coordination*.ts`, `Session*Manager.ts`) — anything that leaks state across concurrent sessions, since this is a constitutional invariant of the system
- Agent tool execution — particularly `read_file`, `write_file`, `list_files`, `process_files_batch`, `fetch_url`, and any path/URL-traversal escape from the configured `allowedLocations`
- The frontend (`frontend/`) — XSS, CSRF, or any way to elevate privilege through the UI
- Docker configuration that exposes secrets or grants more privilege than documented

Out of scope:

- Issues in third-party dependencies that already have a published CVE — please report those upstream and link the CVE if you'd like us to upgrade.
- Findings that require already-compromised host access, an attacker controlling the LLM provider, or an operator who has knowingly disabled safety controls.
- Default development credentials in `.env.example` — these are intentional and documented; do not deploy them.

## Hardening guidance

Operators deploying Druids should:

- Replace every default credential in `.env` (database password, Redis password, JWT secret, Grafana admin).
- Restrict `resourceAccess.allowedLocations` to the narrowest set of paths and URLs each agent actually needs.
- Run the MCP server behind an authenticated proxy if exposed beyond `localhost`. The MCP server is designed for trusted-network deployment by default.
- Review [docs/HOST_FILE_ACCESS.md](docs/HOST_FILE_ACCESS.md) before mounting host directories into containers.
