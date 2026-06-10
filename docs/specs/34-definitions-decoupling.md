# spec: definitions decoupling (core test fixtures, ownership decision, artifact removal)

Issues: #34 (engine tests depend on demo definition content), #35 (definitions ownership decision), #10 (remove the claude-artifact example).

Batch 1 of the spec series. This PR is parked at the spec-approval gate; implementation follows approval.

## Why these three together

All three resolve the same coupling: demo content edits rippling into framework surfaces. #10 deletes the duplicated artifact copy of the engine, UI, and four definitions. #34 removes the core test suite's dependency on presales content. #35 records who owns `definitions/` once those two land.

## Sequencing

Within the implementation: #10 first (delete the artifact and its living-doc references), then #34 (decouple the tests), then #35 (record the decision against the now-true state). One PR, ordered commits.

## #10: remove examples/claude-artifact

### Scope

- Delete `examples/claude-artifact/` entirely.
- `CLAUDE.md`: remove architecture layer 4 (the artifact example) and its sync mandate ("When engine or UI behavior changes, update this file to match"). Layers 1 to 3 stay as they are.
- `README.md`: remove the `/examples/claude-artifact` row from the Packages table.
- CI is unaffected: no workflow references the artifact.
- `examples/demo/src/seeds.js` stays as is. It holds seeded run state (`{ idx, frontier, stepState }`), not definition copies, per the issue.

### Decision: historical specs stay as written

`docs/specs/1-demo-app.md`, `11-run-management.md`, `28-presales-render-hints.md`, `29-active-card-expansion.md`, and `docs/superpowers/specs/2026-06-09-output-rendering-design.md` mention the artifact or its sync rule. They are records of merged work and stay untouched; scrubbing them would falsify history without helping any current reader. The issue's "docs, specs, or READMEs that reference the artifact are updated or removed" criterion is read as applying to living documents (README, CLAUDE.md).

### Acceptance

- `examples/claude-artifact/` no longer exists.
- CLAUDE.md lists three architecture layers and contains no artifact sync rule.
- README contains no artifact reference.
- No file in the repo inlines a copy of a workflow definition; `definitions/*.json` is the single source of truth.
- `npm test` and `npm run build -w examples/demo` pass.

## #34: core-owned test fixture

### Scope

- New fixture definition owned by core, in `packages/core/test/fixtures/`, exported from a plain JS module (no JSON parse step, comments allowed). Chosen over inlining in the test file to keep `engine.test.js` readable; both options were allowed by the issue.
- Fixture coverage floor, so test coverage does not shrink relative to presales-based tests:
  - at least 2 main stages and 3 sub-stages (browse and advance tests need a frontier of 2 or more),
  - both gate types (`hybrid` and `strict`),
  - all five output types (`text`, `fields`, `file`, `link`, `data`),
  - at least one `render` hint,
  - a `subject` config with `field` and `fallback`,
  - at least one required step, one checklist step (no outputs), and one `aiPrompt`.
- Rewrite the engine behavior tests (flatten, gates, gateProgress, browse/jumpTo/advance, resolveSubject, buildContext, buildDraftPrompt, serializeStep) against fixture content. Tests that already construct minimal inline definitions (validateDefinition cases, hasValue, serializeStep capping) stay as they are.
- The "all bundled definitions validate" test discovers `definitions/*.json` by reading the directory instead of hardcoding eight filenames, and asserts the glob found at least one file, so a broken path fails loudly instead of passing over an empty list.

### Acceptance (from the issue)

- `engine.test.js` no longer reads `definitions/presales.json` for behavior tests; no assertion references demo content ("the client", "Ironclad Industries", presales stage names).
- The bundled-definitions validation test globs `definitions/` rather than naming files.
- Editing or adding a definition cannot break engine behavior tests; only the validate test can fail, and only if the definition is invalid.
- `npm test` passes.

## #35: definitions ownership, option (a)

Decision (pre-made by the owner, recorded here): `definitions/` stays the shared single content library. No split, no file moves.

### Scope

- CLAUDE.md records the decision:
  - `definitions/` is the single content library, shared by the README quickstart, the demo (which imports all eight via relative paths), and core's validation test.
  - The framework's relationship to it is validate-only after #34: core never behavior-tests against bundled content.
  - Revisit a split (option b: neutral canonical definitions at root, demo-flavored ones under `examples/demo/definitions/`) if demo-specific tuning keeps accreting.
  - The demo-repo split is deferred until after #2 (npm publish): a separate repo has nothing to import pre-publish, and the demo build is currently the only real-consumer CI signal. Cheaper intermediate once published: a CI job that runs `npm pack` on both packages and installs the tarballs into the demo build.
- README: no change. Under option (a) its description of `/definitions` as bundled examples stays accurate.

### Acceptance (from the issue)

- The ownership decision is recorded in CLAUDE.md.
- All three consumers (README, demo, core tests) are aligned with it, which after #34 they are by construction.
- The demo-split revisit point (after #2) is part of the recorded decision.

## Assumes merged

Nothing. This is the first batch; it builds on current main.

## Open questions for approval

1. Historical specs keep their artifact references (decision above). Say so if you want them scrubbed or annotated instead.
