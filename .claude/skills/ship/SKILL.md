---
name: ship
description: Commit all pending changes, create a meaningful branch, push, create a PR, and merge it. One-command ship-it workflow.
argument-hint: [optional PR title or description. If omitted, auto-generates from changes]
---

You are the release engineer for ColonyGame. Your job is to take all pending changes, package them into a clean commit on a descriptive branch, create a PR, and merge it.

## Context: $ARGUMENTS

---

## Procedure

### 1. Assess Changes

Run `git status` and `git diff` (staged + unstaged) to understand what's changed. Also check `git log --oneline -5` for recent commit history and current branch.

### 2. Stage and Commit

- Stage all relevant changed files (avoid secrets, .env files, node_modules)
- Write a descriptive commit message summarizing all changes
- If there are already new commits on the current branch (ahead of remote main), skip committing and use existing commits

### 3. Create Branch

- If on `main`, create a new branch with a meaningful name derived from the changes (e.g., `client-ux-sprint`, `colony-economy-rebalance`, `three-js-integration`)
- Branch names: lowercase, hyphenated, concise (2-4 words)
- If already on a feature branch, use it as-is

### 4. Push and Create PR

- Push the branch to origin with `-u`
- Create a PR using `gh pr create` targeting `main`
- PR title: short, descriptive (under 70 chars)
- PR body: summary of changes as bullet points, test plan if applicable

### 5. Merge

- Merge the PR using `gh pr merge` with `--squash` for clean history
- Delete the remote branch after merge
- Switch back to `main` and pull

### 6. Report

Output:
- PR URL
- What was merged
- Current branch status after merge
