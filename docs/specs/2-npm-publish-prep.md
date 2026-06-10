# spec: npm publish prep and TypeScript declarations evaluation

Issues: #2 (prepare @sqnce/core and @sqnce/react for npm), #6 (evaluate generated TypeScript declarations from JSDoc).

Batch 3 of the spec series. This PR is parked at the spec-approval gate; implementation follows approval. #6 is an evaluation ticket: the options and recommendation below are the discussion; spec approval is the decision point, and the decision gets recorded back on the issue.

## Assumes merged

Batches 1 and 2 (PRs #38, #39). In particular, the step entry's optional `reopened` and `generated` fields from #39 belong in any published types, and there is no claude-artifact example.

## #2: publish prep

Get both packages to where the owner can run `npm publish` manually. Nothing publishes from CI or a PR; the owner verifies the `sqnce` org name on npmjs.com first.

### Scope

Current state, both packages: `files: ["src"]`, `main`/`exports` point at `src/index.js`, `repository` with `directory` is set, no `publishConfig`, no `homepage`/`bugs`, no per-package LICENSE, and `@sqnce/react` depends on `"@sqnce/core": "0.1.0"` (exact).

Changes:

- Add `publishConfig: { "access": "public" }` to both packages.
- Add `homepage` (`https://github.com/sqnce/sqnce#readme`) and `bugs` (`https://github.com/sqnce/sqnce/issues`) to both.
- Copy the Apache-2.0 `LICENSE` into each package directory. npm only auto-includes a LICENSE that lives in the package folder; the root copy does not ship.
- Loosen the react package's core dependency to `"^0.1.0"` so a core patch release does not force a lockstep react release. Workspace linking still resolves it during development.
- Tarball verification (manual, recorded in the PR, no committed scratch project):
  - `npm pack` both packages; inspect the file lists. Expected contents: `src/`, `README.md`, `LICENSE`, `package.json`, nothing else (no `test/`).
  - Node smoke test of the core tarball: install into a scratch project, import `createRun`, `flattenSubStages`, `advance`, exercise one gate cycle.
  - Vite scratch app: install both tarballs, render `ProcessRolodex` with a bundled definition, confirm `@sqnce/react` resolves `@sqnce/core` by version from the registry tarball rather than workspace linking.
- The CI npm-pack-and-install job idea from #35 stays future work; not in this batch.

### Decision to make: raw JSX in the published @sqnce/react

`src/index.js` re-exports `.jsx` files. Published as-is, the package is bundler-only, and bundlers differ:

- Vite and esbuild consumers work out of the box (`.jsx` in `node_modules` is transformed by extension).
- webpack and Next.js consumers typically do not transpile `node_modules`; they need `transpilePackages: ["@sqnce/react"]` (Next) or an explicit babel-loader include.

Options:

- (a) Document the constraint. Ship raw JSX; add an install note to the react README and the root README quickstart naming the Vite default and the webpack/Next escape hatch. No build step, no new devDependency, the demo keeps importing workspace source unchanged.
- (b) Precompile at prepack. esbuild as a devDependency, a `prepack` script emitting plain-JS `dist/`, `exports` pointing at `dist/`. Removes the consumer footgun, but adds a build pipeline to a so-far build-free repo and complicates development: with `exports` aimed at `dist/`, the workspace demo needs `dist` built (or conditional exports), and the published artifact diverges from the source the demo exercises.

Recommendation: (a) for the 0.1.0 publish. Pre-launch, with the demo as the only real consumer signal, documenting beats building. Revisit (b) at the first real webpack/Next consumer report; the escape hatch is one documented config line in the meantime.

### Acceptance (from the issue)

- `npm pack` output for both packages contains only intended files.
- A scratch project using the packed tarballs renders `ProcessRolodex`.
- Both package.json files carry `publishConfig: { "access": "public" }`.
- The raw-JSX decision is recorded on issue #2.

## #6: TypeScript declarations, evaluation

Both packages are plain ESM JavaScript and stay that way. The question is whether TypeScript consumers get types, and how.

### Constraint

`@sqnce/core` stays dependency-free with no runtime build step. Any `typescript` involvement is a devDependency used at pack or CI time only.

### What the types would cover

Typedefs for `Definition`, `MainStage`, `SubStage`, `Step`, `OutputSpec`, `RenderHint`, `Run`, `StepEntry` (including `reopened` and `generated` from #39), `GateProgress`, `RunStore`, `RunEntry`, plus the `ProcessRolodex` props and the renderer contract (`{ spec, value, onChange, context }`). Today's JSDoc is prose-heavy; typedefs would need writing for most of the public surface.

### Options

- (a) Generate from JSDoc at pack time. `typescript` devDependency; `tsc` with `allowJs`, `checkJs`, `declaration`, `emitDeclarationOnly` in a `prepack` step; `types` field pointing at the emitted files; nothing checked in. A CI step runs the same emit on PRs touching `packages/`, so a JSDoc regression fails fast and drift is impossible by construction. tsc handles `.jsx` with `jsx: "preserve"`. The typedefs double as in-editor documentation for JS consumers.
- (b) Hand-written `index.d.ts` checked into each package. Most precise for the React props, no generation pipeline, but a second source of truth that drifts unless CI compares it against the source, which is the harder tooling problem.
- (c) Defer. Publish 0.1.0 untyped; revisit at the first TypeScript consumer request.

Recommendation: (a), implemented in this batch after #2's package.json work. One source of truth, no checked-in artifacts, and the JSDoc investment pays off for every editor user, not just TS consumers. (c) is the fallback if the JSDoc tightening turns out larger than expected during implementation; the spec treats scope blowup there as a reason to come back, not to grind.

### Acceptance

- The decision (chosen option) is recorded on issue #6.
- If (a) is approved: `npm pack` tarballs for both packages contain `.d.ts` files resolving for a TS consumer importing `createRun` and `ProcessRolodex`; CI runs the declaration emit; `npm test` still passes with zero runtime dependencies in core.

## Sequencing

#2 first (manifest fields, LICENSE, verification), then #6 (declaration emit hooks into the same `prepack` surface).

## Out of scope

- Actually publishing either package.
- Converting any source to TypeScript.
- CI npm-pack consumer job (future work noted in #35).
- Changing the demo to consume tarballs.

## Open questions for approval

1. Raw JSX: recommend (a) document the constraint. Approve or pick (b) precompile at prepack.
2. Declarations: recommend (a) generate from JSDoc at pack time. Approve or pick (b) hand-written / (c) defer.
3. Loosening the core dependency to `^0.1.0`: flag if you want lockstep exact pinning kept instead.
