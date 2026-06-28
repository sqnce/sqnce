# Spec: bundled project-review cleanup (#109, #111, #112, #113, #114, #115)

Status: design. This document is the design artifact for the spec-approval gate. It
defines what changes and why. It does not contain implementation: the bite-sized TDD
steps, exact code, and commands live in the later plan (`docs/plans/...`), written only
after this spec is approved. No code is written at the spec stage by design.

## Origin

All six issues came out of one adversarially-verified project review. They are siblings by
origin, not by code: they touch the load path, the engine, the renderer and UI layer,
performance, internal structure, and test coverage. The owner chose to address them as one
bundled change (one spec, one branch, one draft PR, one squash subject ending
`(#109) (#111) (#112) (#113) (#114) (#115) (#PR)`).

## Layering (must hold)

The repo's three layers stay separate. The pure JSON definitions are untouched. The engine
(`@sqnce/core`) stays pure and dependency-free: no UI, no provider coupling, state in and
new state out. All rendering stays in `@sqnce/react`. Renderers and validators only ever
enter core as arguments, never as imports.

## Section A: #109 load-path totality (the P2)

### Problem

`applyReconcileToStore` in `packages/react/src/reconcile.js` (lines 50-67) must be total on
the load path, as its own docstring states, so a thrown hook cannot escape into the
`Sqnce.jsx` load `catch`, where the autosave effect would then write the placeholder store
over every saved run (data loss). The single-run `applyReconcile` honors this with a
`try/catch` and a non-object guard. The store-level function does not: it dereferences
`store.entries`, each `entry.workflowId`, `entry.run`, `entry.id`, and each `w.id` with no
guard. A malformed persisted entry (for example `entries: { e1: null }`), a non-object
store, a missing `entries` map, or a `null` element in `workflows` throws a `TypeError`.
The version guard in `Sqnce.jsx` only checks `version`, `entries`, and `activeRunByWorkflow`,
not entry shape, so the throw reaches the load `catch` and the placeholder is saved over the
user's runs. The throw path only appears once a consumer actually supplies `reconcileRun`,
because an absent prop returns early.

### Fix

Make `applyReconcileToStore` total to match its docstring:

- If `store` is not a non-null object, or `store.entries` is not a non-null object, return
  `store` unchanged (the same reference, as the absent-prop path already does).
- When building the workflow lookup, skip any element of `workflows` that is not a non-null
  object with a string `id`, so a `null` element cannot throw on `w.id`.
- For each entry, if the entry is not a non-null object, pass it through into the output
  unchanged (do not attempt to reconcile it, and do not drop it). Preserving a malformed
  entry rather than dropping it keeps the function non-destructive even on garbage input,
  which is the whole point of totality here.
- The per-entry `run` continues to flow through the already-total `applyReconcile`.

The input store is never mutated; store shape and entry metadata (including `updatedAt`,
which a load-time projection must not bump) are preserved, exactly as today.

### Worked example

A saved store `{ version: 3, entries: { e1: <valid>, e2: null }, activeRunByWorkflow: {...} }`
with a consumer `reconcileRun` present. Today: the loop dereferences `null.workflowId`,
throws, the load `catch` swallows it, `setStore` is skipped, and autosave overwrites every
saved run with the placeholder store. After the fix: `e1` is reconciled, `e2` is preserved
as-is, nothing throws, and the real store loads.

### Tests (`packages/react/test/reconcile.test.js`)

A `null` entry, a non-object entry (a string and a number), a missing `entries` map, a
non-object `store`, a `null` element in `workflows`, and a workflow without an `id`. Each
asserts no throw and that valid entries are preserved and reconciled while the malformed
ones pass through unchanged.

## Section B: #111 scoped draft validation

### Problem

For a forked definition, every gate, completion, status, and draft-context validator call in
core runs against a sanitized relation-set run (the shared spine plus the step's own track)
via the internal `scopeValidatorRun` (`packages/core/src/index.js` line 887), so cross-track
state never leaks into a validator's `ctx.run`. The draft-generation path is the one place
that validates a value without that scoping: after `parseDraft` succeeds, the `Sqnce.jsx`
generate handler (lines 497-498) calls the target validator with the component's full,
unscoped `run`. Because `scopeValidatorRun` is internal, the React layer cannot reproduce
the scoping. A validator that relates steps via `getStepEntry(ctx.run, ...)` can therefore
see a sibling track's data at draft time but not at gate time, so the same value can pass
draft validation and later fail the boundary gate.

### Fix

Export a focused validate helper from `@sqnce/core` that validates one output value using
the same spine-plus-own-track relation set the gate uses, built on the existing internal
`scopeValidatorRun`. The helper takes the value, the output spec, the flat sub-stages, the
run, the current flat sub-stage index, and the validators map, and returns the validator
message string or `null`. Exporting the higher-level validate helper (rather than the raw
scoping primitive) keeps all scoping and validation semantics in core; the React draft path
calls the helper instead of resolving and invoking the validator against the unscoped run.
The helper is a no-op for linear definitions, because `scopeValidatorRun` returns the run
unchanged when no stage carries a `track`.

### Worked example

A forked definition whose target validator relates its step to a sibling-track step via
`getStepEntry`. Today a draft value can pass at draft time (the validator sees the sibling
track in the unscoped run) yet fail the boundary gate (which scopes the sibling track out).
After the fix, draft and gate use the same scoped run, so the draft-time message matches the
gate.

### Tests (`packages/core/test/` engine suite)

A forked definition with a cross-track-referencing validator: a value that passes against
the unscoped run but fails the scoped run (the draft-time message now matches the gate), and
a linear definition where the helper is a pass-through.

## Section C: #112 six UI correctness fixes (UI only, none touch core)

1. Bare-URL autolink keeps a balanced trailing `)`: only strip a trailing `)` when there is
   no unmatched `(` in the URL (the CommonMark and GitHub rule), in `markdownInline.js`.
   This fixes `https://en.wikipedia.org/wiki/Foo_(bar)` losing its final paren. Explicit
   `[text](href)` links are unaffected.
2. `resolveGeneratedBadge` returns the trimmed value in `badge.js`: visibility is already
   decided with `out.trim()`, but the untrimmed padded `out` is currently rendered; return
   the trimmed value, matching the sibling `runStatus.js`.
3. The output fullscreen overlay blocks deck arrow-keys: a shared overlay-open guard that
   mirrors `overviewOpen` so Left and Right no longer browse the deck behind the overlay
   (which can tear the card and overlay out from under the reader). This lifts the overlay's
   open state from `OutputView` up to the shell, the same way `OverviewModal` is already
   guarded.
4. Modal overlays trap focus: the `OutputView` overlay and `OverviewModal` move focus into
   the dialog on open, cycle focus within the dialog's focusable elements so Tab and
   Shift+Tab wrap at the last and first element rather than reaching the deck or sidebar
   controls behind the portal, and restore focus to the previously focused element on close.
   Both already set `role="dialog" aria-modal="true"`; a real trap (not just initial focus)
   is what closes the accessibility gap that claim advertises.
5. `DataTable` discovers columns over all rows: drop the `.slice(0, 50)` on the column
   discovery pass (the body already renders all rows), so a key that first appears at row
   50+ still gets a cell.
6. `ReadingView` falls back to the first readable stage: when the centered stage from
   `run.idx` is not in the `readable` set, render the first readable stage instead of an
   unchecked one. This is practically unreachable today (reading view only mounts for
   complete runs) but closes the gap.

## Section D: #114 engine consolidation and shell decomposition (built before E)

A pure internal refactor. It preserves the documented behavior and the linear
byte-identical guarantee: a linear definition's run state stays byte-identical through the
engine, and the read aggregates return identical results.

### Engine (`packages/core/src/index.js`)

Introduce one internal flat-list-derived topology object, computed once from the definition,
holding the flattened sub-stage list, the spine-end index, each track's range (first index,
terminal index, optional flag), and the fork-open readiness check. Route the duplicated
derivations through shared helpers off that object:

- The spine-end index re-derived inline in five places (in `reachableFlat`, `normalizeFlat`,
  `advanceForked`, `buildContext`, `buildDraftPrompt`), all parallel to `lastSpineIndex`.
- The "fork is open" readiness check re-implemented in three read paths (`reachableFlat`,
  `isRunComplete`, `trackStatus`).
- The per-track range derivation (first, terminal, optional) duplicated against `trackMap`
  (in `reachableFlat` and `advanceForked`).
- The gate-commit sequence written three times across `advance` and `advanceForked`.
- The skip-mutator preamble (normalize, locate, check skippable, check reachable) copied
  across `skipSubStage`, `unskipSubStage`, and `autoSkipSubStage`.

### Shell (`packages/react/src/Sqnce.jsx`, currently 1316 lines)

- Extract the 560-line CSS template literal to its own module.
- Extract a `useRunStore` hook for the run-store lifecycle (persistence, routing, repair),
  today spread across four effects and many handlers.
- Extract the draft-generation handler (the 50-line async block).
- Group the wide `RolodexView` prop set (34 props) into cohesive objects.
- De-duplicate the mark-done and reopen handler that is written twice within a step, and
  split the largest nested JSX blocks (the deck card and step rows, and the stage rail).

## Section E: #113 performance (consumes D's topology object)

### Engine (`packages/core/src/index.js`)

The read aggregates `runSummary`, `isRunComplete`, and `trackStatus` already accept an `opts`
object as their last argument. Add an optional precomputed-topology field to that `opts` (an
additive, backward-compatible extension) so the UI builds the topology once instead of each
aggregate re-flattening the definition and rebuilding track topology per call. `gateProgress`
and `scopeValidatorRun` reuse the shared maps from Section D rather than rebuilding the
stepId-to-stage map per required step per gate.

### React (`Sqnce.jsx` and `RolodexView.jsx`)

- `useMemo` over the topology derivation, computed once per definition.
- `useCallback` on handlers and `React.memo` on the `RolodexView` boundary, so it stops
  re-rendering unconditionally on every parent render.
- A dependency array on the global keydown effect, which currently has none and re-subscribes
  the window listener every render.
- Memoize rail reachability (recomputed for every main stage every render today), the subject
  name (`resolveSubject(def, run)`), and the per-output renderer context and `onChange`.

The topology object carries no run state, so it is stable per definition and safe to memoize
on `def` alone.

## Section F: #115 test coverage and the throw-guard

- Throw-guard the three consumer render-slot resolvers (`resolveRunStatus`,
  `resolveStageStatus`, `resolveGeneratedBadge`): wrap the consumer call so a throwing
  resolver degrades silently to the built-in default or no slot, with no logging, matching
  the `applyReconcile` precedent and keeping these pure, node-testable helpers free of side
  effects. Add a throwing-resolver test for each.
- Add input-immutability assertions (deep-freeze the input, or before-and-after deep-equal)
  around the engine mutators `setOutput`, `advance`, `skipSubStage`, and `cloneRun`, and the
  other mutators, asserting the engine's "state in, new state out" promise.
- Add a forked validator relation-set scoping test through `buildContext`, not only through
  `gateProgress`.
- Cover the `serializeStep` link and fields branches, including the empty-field-line
  filtering.

## Data flow

The topology object is derived purely from the definition's stage tagging (the shared spine
and the optional tracks). It contains no run state. In the UI it is memoized per definition
and reused across the rail and the deck, and it is passed into the core read aggregates
through their existing `opts` argument. Inside the engine the same single derivation backs
the consolidated helpers from Section D.

## Error handling

Two established philosophies are preserved and extended. Totality on the load path: a
malformed saved store or bad `workflows` prop degrades to a no-op rather than throwing into
the persistence catch (Section A). Degrade-not-crash for consumer hooks: a throwing
render-slot resolver falls back to the default rather than blanking the rolodex (Section F),
matching `applyReconcile` and the renderer fallback. The UI fixes in Section C do not change
error semantics.

## Testing strategy

Test-driven, with the repo gates: `npm test` (all `*.test.js` across `packages/core` and
`packages/react`), `npm run build -w examples/demo`, and `npm run types`. The Section D
engine refactor is guarded by a byte-identical linear assertion: a linear run's serialized
state and every read-aggregate output are identical before and after the refactor. The new
immutability assertions (Section F) guard the mutators during the consolidation. Each
section's behavior change has its own targeted tests as described above.

## Implementation order within the one PR

Section D (the engine topology object) is the foundation; Section E (performance) consumes
it, so D lands before E. Sections A, B, C, and F are independent and slot in around them.
The riskiest part is the Section D refactor of correctness-sensitive engine internals; it is
mitigated by the existing strong suite plus the new immutability and byte-identical guards,
done in small TDD commits.

## Risks

- The Section D engine refactor re-expresses correctness-sensitive invariants through shared
  helpers; a subtle change could shift gating, completion, status, or draft context.
  Mitigation: the byte-identical linear assertion, the new immutability assertions, the
  existing forked-topology suite, and small reviewable commits.
- A large single PR mixing a refactor with bug fixes is harder to review. Mitigation: clear
  per-issue commits, the plan dropped before the code-review so the diff shows only code, and
  the Codex review loop re-reviewing the whole diff fresh each pass.

## Spec self-review

- Placeholder scan: no TBD, TODO, or vague requirements; each section names the files and the
  concrete change.
- Internal consistency: the layering rules, the topology object, and the implementation order
  agree across the architecture, data-flow, and per-section text.
- Scope: large but cohesive as one bundle by owner decision; the implementation order makes
  the dependencies (D before E) explicit, and the plan stage will decompose each section into
  bite-sized steps.
- Ambiguity: the two judgment calls are made explicit, namely preserving (not dropping) a
  malformed entry in Section A, and degrading silently (not logging) in Section F.
