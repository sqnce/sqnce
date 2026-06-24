# SETUP.md, new-machine and new-worktree bootstrap for sqnce

The environment this repo needs to build and test. Everything here is portable fact (no
secrets), so it lives in the repo and travels with the checkout. The genuinely
machine-local pieces are listed at the bottom and are the only things a new machine has to
supply by hand.

## 1. Install

`npm install` at the repo root. This is an npm workspaces monorepo (`packages/*` and
`examples/demo`). `@sqnce/core` has no build step and no dependencies; `@sqnce/react` and
the demo build with the workspace toolchain. sqnce is the upstream: unlike the sibling
`presales-sqnce`, it has no `link:` dependency on another local checkout, so a fresh clone
plus `npm install` is enough.

## 2. Running tests and build inside a feature worktree

Feature work happens in a git worktree (see `.claude/dev-workflow.md`). A worktree does not
get its own `node_modules`, so either run `npm install` inside it or symlink the primary
tree's modules: `ln -sfn <primary-checkout>/node_modules <worktree>/node_modules`. Repo
gates: `npm test` (Node's built-in runner over the engine tests), `npm run build -w
examples/demo` (the demo build CI runs on every PR), and `npm run types` (regenerate the
`.d.ts`; CI checks they are committed; `tsc` may not be installed locally, in which case
confirm the diff touches no exported signature and let CI run the real check).

## 3. Plugins this workflow assumes

- **superpowers**, the methodology layer for the lifecycle:
  `/plugin install superpowers@claude-plugins-official`.
- **codex**, the independent second-model review loop: run `/codex:setup` to confirm the
  local Codex CLI is ready (the stop-time gate stays off unless you turn it on).
- **graphify** (optional, deferred): sqnce has no committed graph at `graphify-out/` yet.
  The graphify orientation (step 2) and post-merge refresh (step 11) are off until one is
  generated. To turn them on, confirm `graphify` is on PATH and generate a committed graph,
  then commit `graphify-out/graph.json` and `GRAPH_REPORT.md`.

## 4. What stays machine-local (supply per machine, never commit)

- **GitHub credentials and token scope**, auth for `gh` and `git`. Push access is technical
  permission only; changes still go via a feature branch, a PR, and the owner's merge gate.
- **Personal global Claude config**, `~/.claude/CLAUDE.md` and anything it imports. These
  are per-user, per-machine. Durable process rules must live in the repo (this file and
  `CLAUDE.md`, which imports `.claude/dev-workflow.md`), not in global config or memory.
- **`.claude/settings.local.json`**, gitignored local overrides.
- **Per-project auto-memory**, `~/.claude/projects/<derived-path>/memory/`. The directory
  name is derived from the checkout path, so it differs per machine and does not travel.
