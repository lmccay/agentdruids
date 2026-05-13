#!/usr/bin/env bash
# Hook: block Claude from creating new *.md files outside designated locations.
# Edits to existing markdown files are always allowed; only NEW file creation is blocked.
#
# Wired up via .claude/settings.example.json (PreToolUse on Write).

set -euo pipefail

# Graceful degradation if jq is missing — log to stderr and let the action through.
if ! command -v jq >/dev/null 2>&1; then
  echo "block-stray-md: jq not installed; hook disabled. brew install jq to enable." >&2
  exit 0
fi

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')

# Only police *.md files.
case "$file_path" in
  *.md) ;;
  *) exit 0 ;;
esac

# If the file already exists, this is an edit/overwrite — allow it through.
if [[ -f "$file_path" ]]; then
  exit 0
fi

# Determine repo root (two levels up from this script).
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
rel=${file_path#"$repo_root/"}

# Allow paths under these directories.
case "$rel" in
  docs/*|specs/*|.github/*|.claude/*) exit 0 ;;
esac

# Allow specific root-level files.
case "$rel" in
  README.md|CONTRIBUTING.md|SECURITY.md|CLAUDE.md|CHANGELOG.md|LICENSE.md|CODE_OF_CONDUCT.md) exit 0 ;;
esac

# Block, with a message Claude sees as context for its next step.
cat >&2 <<EOF
Blocked: creating new markdown files outside docs/, specs/, .github/, .claude/, or the project root whitelist is prohibited by project policy. See CLAUDE.md, section "Working with Claude on this codebase".

Attempted to create: $rel

If this file is genuinely needed:
  - Place it under docs/ (durable documentation) or specs/ (formal specification), or
  - Extend the whitelist in .claude/hooks/block-stray-md.sh and explain in the PR description why.

Reasoning notes belong in the PR description, not in tracked files.
EOF
exit 2
