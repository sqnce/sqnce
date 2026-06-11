# Contributing

Thanks for your interest in sqnce.

- Open an issue before starting significant work so we can align on approach.
- Keep `@sqnce/core` pure and dependency-free: state in, new state out, no UI or provider coupling.
- New workflow definitions belong in `/definitions` and must pass `validateDefinition` (the test suite checks all bundled definitions).
- Run `npm test` before opening a pull request.
- One logical change per pull request.

## Releasing

Status: dormant. Nothing is currently published. 0.1.0 was published and unpublished on 2026-06-11; consumers use local link dependencies (see the README quickstart). The steps below apply only if publishing resumes, and an unpublished version number is burned permanently, so any future publish must use a version never previously published (0.1.0 is unusable).

`@sqnce/core` and `@sqnce/react` publish to npm under the `sqnce` org. Versions are independent: react declares a caret range on core (`^0.1.0`), so a core patch release does not force a react release.

1. Bump `version` in the manifests of the packages being released. When a react release needs new core behavior, release core first and update react's `@sqnce/core` range to match.
2. Verify from a clean tree: `npm test`, `npm run types`, `npm run build -w examples/demo`.
3. Inspect the tarballs of the packages being released: `npm pack -w packages/<pkg>` per package, and check the file lists. Expected: `package.json`, `LICENSE`, `README.md`, `src/`, `types/`. Never `test/`.
4. Publish from the repo root, scoping `-w` to exactly the packages whose versions were bumped: `npm publish -w packages/core -w packages/react` for a lockstep release, or a single `-w` for a one-package release. Never include an unbumped package: republishing an existing version fails and leaves the release partial. `prepack` regenerates `types/`; `publishConfig.access: public` is set in both manifests. Publishing requires npm 2FA: run it from an interactive terminal so the browser passkey prompt can complete (a non-TTY shell fails with `EOTP`).
5. Verify: `npm view @sqnce/core version` and `npm view @sqnce/react version` show the new versions, and a scratch project installs them cleanly (`pnpm add @sqnce/core @sqnce/react` with default settings, no overrides).
6. Tag the release commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. Once the two package versions diverge, switch to per-package tags (`core-vX.Y.Z`, `react-vX.Y.Z`).
