# spec: ci pack-and-install job

Issue: #58. A small well-bounded chore; short spec, no interview. Implements the deferral note recorded in CLAUDE.md under #35 ("once published, a cheaper intermediate is a CI job that packs both packages and installs the tarballs into the demo build"), unblocked by #55 (0.1.0 published 2026-06-11).

Driving need: the packaging surface (the `files` lists, the `exports` maps, `prepack` type generation, and `@sqnce/react` resolving `@sqnce/core` by version rather than workspace link) is exercised only at release time, by hand. The 0.1.0 release caught a declaration-emit failure exactly this way. A regression in any of it between releases is invisible to today's CI, which builds the demo from workspace source.

## The job

A second job, `pack`, in `.github/workflows/ci.yml`, alongside the existing `test` job, same triggers (push to main, every pull request), independent (no `needs`):

1. Checkout, setup-node 24 with npm cache, `npm ci` (same prelude as `test`).
2. `npm pack -w packages/core -w packages/react --pack-destination "$RUNNER_TEMP/tarballs"`. This runs each package's `prepack`, so the declaration emit is exercised through the real packing path (react's `prepack` also runs core's emit).
3. Content assertions on both tarballs via `tar -tzf`: each must contain `package/package.json`, `package/LICENSE`, `package/README.md`, at least one path under `package/src/`, and `package/types/index.d.ts`; neither may contain any path under `package/test/`. A small inline shell step; failure of any assertion fails the job.
4. Scratch consumer in a temp directory outside the repo: `npm init -y`, then `npm install` of both tarballs plus `react`, `react-dom`, and `esbuild`. Installing both tarballs together lets npm satisfy react's `@sqnce/core: ^0.1.0` dependency by version from the core tarball, the registry-shaped resolution a real consumer gets.
5. Consumer checks, both must pass:
   - Engine import: `node -e "import('@sqnce/core').then(m => { if (typeof m.createRun !== 'function') process.exit(1); })"`.
   - Component resolution: an entry file `import { ProcessRolodex } from "@sqnce/react"` bundled with esbuild (`--bundle --format=esm --external:react --external:react-dom`), proving the exports maps and the cross-package resolution work for a bundling consumer.

Nothing publishes; the registry is never touched.

## Decisions

- **Scratch consumer, not the demo app.** The demo intentionally builds from workspace source (its job in CI is the framework build; CLAUDE.md packages table). Pointing it at tarballs would mean mutating its manifest with overrides mid-job. A scratch consumer is simpler, faster, and tests the same packaging surface. The issue title says "into the demo build"; this spec narrows that to a minimal consumer, which is the actual intent (registry-shaped resolution).
- **Version-skew failures are signal, not noise.** If core's version ever moves outside react's declared range without react being updated, step 4 fails. A release cut in that state would break consumers, so the job failing is correct.
- **npm, not pnpm.** The consumer check uses npm; pnpm-specific behaviors are consumer-repo concerns and not part of this repo's contract.

## Out of scope

- Publishing from CI (tokens, provenance, release automation).
- Changing the demo's workspace-source build or the existing `test` job.
- Tarball size or dependency-count budgets.

## Acceptance

Evaluated once the implementation commit lands in this PR (this spec is the PR's first commit; the workflow change follows the spec gate and plan, before merge):

- A `prepack`/declaration-emit failure fails the `pack` job.
- A tarball losing `types/` or `src/`, or gaining `test/`, fails the job.
- A consumer unable to import `@sqnce/core` or bundle `ProcessRolodex` against the tarball install fails the job.
- The `pack` job runs and is green on the implementation push; the existing `test` job is untouched.
