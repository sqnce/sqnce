# spec: ci actions Node 24 migration (issue #9)

## Problem

GitHub Actions will force all actions to Node 24 by default starting 2026-06-16 and remove Node 20 support on 2026-09-16. The Pages deploy workflow currently produces a deprecation warning from `actions/deploy-pages@v4` running on Node 20.

GitHub populates the deprecation warning from the `using: node20` declaration in each action's `action.yml`, not from execution. Setting `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` does not remove these warnings; the only fix is bumping to action tags that declare `using: node24`.

## Acceptance criteria

A Pages deploy run (and CI run) completes with no Node deprecation warnings.

## Scope

Two workflow files: `.github/workflows/pages.yml` and `.github/workflows/ci.yml`.

## Proposed changes

Pin each action to the latest stable tag that declares `using: node24` in its `action.yml`. Exact tags are confirmed during the plan phase by checking each action's releases. The actions to audit:

- `actions/checkout` (currently `@v4`)
- `actions/setup-node` (currently `@v4`)
- `actions/configure-pages` (currently `@v5`)
- `actions/upload-pages-artifact` (currently `@v3`)
- `actions/deploy-pages` (currently `@v4`)

In addition, bump `node-version: 20` to `node-version: 24` in both workflows so the build and test environment stays aligned with the action runtime.

## Out of scope

- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var (does not fix the warning source)
- Changes to application code or tests
