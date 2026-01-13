---
name: git-status
description: Show git status with context for next steps
allowed-tools:
  - Bash
---

Current git state:

**Branch:**
!`git branch --show-current`

**Status:**
!`git status --short`

**Recent commits:**
!`git log --oneline -5`

**Unstaged changes:**
!`git diff --stat`

Based on this, what should I know about the current state of the repository?
