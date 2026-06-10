# spec: ci actions Node 24 migration (issue #9)

## Problem

GitHub Actions will force all actions to Node 24 by default starting 2026-06-16 and remove Node 20 support on 2026-09-16. The Pages deploy workflow produces deprecation warnings from actions running on Node 20.

GitHub populates the deprecation warning from the `using: node20` declaration in each action's `action.yml`, not from execution. The only fix is bumping to action tags that declare `using: node24` (or in the composite case, that reference nested actions declaring `using: node24`).

## Acceptance criteria

A Pages deploy run (and CI run) completes with no Node deprecation warnings.

## Scope

Two workflow files: `.github/workflows/pages.yml` and `.github/workflows/ci.yml`.

## Proposed changes

### Direct actions (declare `using: nodeXX` themselves)

Pin each to the latest stable tag that declares `using: node24`:

- `actions/checkout` (currently `@v4`)
- `actions/setup-node` (currently `@v4`)
- `actions/configure-pages` (currently `@v5`)
- `actions/deploy-pages` (currently `@v4`)

Exact tags are confirmed during the plan phase by inspecting each action's releases.

### Composite action: `actions/upload-pages-artifact`

`upload-pages-artifact` uses `runs.using: composite` and does not declare a Node runtime directly. Its Node 20 warning comes from the nested `actions/upload-artifact` it invokes. The plan phase must confirm whether a released tag of `upload-pages-artifact` already references a `node24`-native `upload-artifact`. If no such released tag exists, replace `upload-pages-artifact` with a direct call to `actions/upload-artifact` at a `node24`-native tag, passing `name: github-pages` and `path: <artifact path>`.

### Node version for build steps

Bump `node-version: 20` to `node-version: 24` in both workflows so the build and test environment stays aligned with the action runtime.

## Out of scope

- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var (does not fix the warning source)
- Changes to application code or tests
