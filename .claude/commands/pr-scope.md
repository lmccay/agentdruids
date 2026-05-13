---
description: Report the scope of the current working-tree diff and flag anything that looks out of scope. Run this before opening a PR.
---

You are producing a concise scope report for the current working tree. The user is preparing a PR and wants to verify the diff is focused before pushing. This is a **read-only audit** — do not edit any files, run tests, or rebuild anything.

## Steps

1. Run `git status --short` to enumerate changes.
2. Run `git diff --stat HEAD` to see the working-tree shape.
3. If on a feature branch, also run `git diff --stat upstream/main...HEAD` (or `origin/main...HEAD` if no upstream remote exists) to see the cumulative branch diff.
4. Produce the report described below.

## Report format

Keep the output under 30 lines total. Structure:

```
Scope report — <branch-name>

Files changed: <count>
  src/        <count>
  frontend/   <count>
  tests/      <count>
  docs/       <count>
  other       <count>

Lines: +<added> / -<removed>

New files (<count>):
  - <path>
  - <path>  ← ⚠ stray markdown (outside docs/, specs/, .github/, .claude/, root whitelist)

Deleted files (<count>):
  - <path>

Potentially out of scope:
  - <path> — <one-line reason>

Verdict: <focused | scattered | cannot determine>
```

## Flagging rules

- **Stray markdown:** any `*.md` file being created outside `docs/`, `specs/`, `.github/`, `.claude/`, or the project root whitelist (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CLAUDE.md`, `CHANGELOG.md`, `LICENSE`, `CODE_OF_CONDUCT.md`).
- **Out-of-scope candidates:** any edited file that does not obviously belong to the stated task. If the user has not stated a task description, ask once for it before flagging. If they decline or can't summarize the task in one sentence, that itself is a signal the scope may be unclear — list everything you'd flag if you knew the task and say so.
- **Verdict:**
  - `focused` — all changes are in one logical area and no stray files
  - `scattered` — touches multiple unrelated areas, or stray markdown is present
  - `cannot determine` — no task description and the diff spans multiple areas

Do not invent context. If a flagged file might actually be in scope, say "uncertain" rather than guessing.
