# spec: ci actions Node 24 migration (issue #9)

## Problem

GitHub Actions will force all actions to Node 24 by default starting 2026-06-16 and remove Node 20 support on 2026-09-16. The Pages deploy workflow currently produces a deprecation warning from `actions/deploy-pages@v4` running on Node 20.

## Acceptance criteria

A Pages deploy run (and CI run) completes with no Node deprecation warnings.

## Scope

Two workflow files: `.github/workflows/pages.yml` and `.github/workflows/ci.yml`.

## Proposed changes

### `.github/workflows/pages.yml`

1. Set `node-version: 24` in the `actions/setup-node` step (build job).
2. Add top-level `env: FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` so all actions in the workflow use the Node 24 runtime. This covers `actions/deploy-pages@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, and `actions/checkout@v4` without requiring a version pin hunt for each.

### `.github/workflows/ci.yml`

1. Set `node-version: 24` in the `actions/setup-node` step.
2. Add top-level `env: FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` for the same reason.

## Why env var instead of bumping action versions

The env var approach is the forward-safe path GitHub documents for this migration window. The alternative (hunting specific Node-24-native action tags) risks pinning to pre-release or unreleased tags. Changing `node-version: 20` to `24` in both files also ensures the build and test environment matches the runtime the actions use, keeping the two in sync and removing a second deprecation vector.

## Out of scope

- Pinning any action to a new version tag (unnecessary given the env var)
- Changes to application code or tests
