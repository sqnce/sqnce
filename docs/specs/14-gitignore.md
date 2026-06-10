# spec: gitignore graphify-out/ and .claude/ (issue #14)

## Goal

Keep local tool artifacts out of git. `graphify-out/` (knowledge graph
artifacts) and `.claude/` (Claude Code worktrees and local session state)
are untracked but not ignored, so they clutter `git status` and a broad
`git add` would commit them.

## Change

Add two entries to `.gitignore`:

```
graphify-out/
.claude/
```

Both directories are fully untracked today, so no `git rm` is needed and
no tracked file changes ignore status.

## Verification

- `git status` shows no untracked `graphify-out/` or `.claude/` entries.
- `git check-ignore graphify-out .claude` matches both.
