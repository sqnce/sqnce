# spec: async writes recompute against the latest run (stale-closure fix)

## Current behavior

The shell's content mutations all flow through one callback, `setRun(next)` in
`packages/react/src/Sqnce.jsx` (lines 278-289). Each handler computes the next run
from the render-time, closed-over `run` value and hands the finished run to `setRun`,
which stores it verbatim after re-checking that the entry is still active (the
documented archive/delete guard) and running the load-path reconcile hook. The
handlers are:

- `writeOutput` (432): `coreSetOutput(run, ...)`
- `toggleDone` (436): `setCheckedDone(run, ...)`
- `reopen` (440): `reopenStep(run, ...)`
- `toggleSkip` (446): `skipSubStage`/`unskipSubStage(run, subs, ...)`
- `doAdvance` (369): writes `coreAdvance(run, subs, ...).run` after checking `advanced`
- `resetRun` (525): `makeInitialRun(activeId)`

The two draft/file paths also write through `writeOutput`:

- `generate` (455) writes its result only after `await generateDraft(...)`, a full LLM
  round trip.
- `onFile` (508) writes its result only after `FileReader.onload` fires.

## Problem

For a synchronous handler nothing can interleave between capturing `run` and the
`setRun` write, so the closed-over value is current. The two asynchronous paths resolve
long after their closure was captured. During that window only the generating step's own
button is disabled (`RolodexView.jsx`, `disabled={generating === step.id || readOnly}`);
there is no global edit lock, by design, because the point is that the user can keep
working during a slow generation. So the user can mark other steps done, edit other
outputs, or toggle skips, and each of those lands synchronously through `setRun`.

When the async write finally resolves, it calls `writeOutput`, which computes
`coreSetOutput(staleRun, ...)` from the closure. That stale run carries only the
generated or attached output plus the OLD state of every other step, so the concurrent
edits are silently overwritten. Last write wins, with no error and no warning. This is
the one confirmed finding in the project review with user-visible data loss in normal
use.

## Change

Give every content write a functional form so the change is recomputed against the
store's current run at the moment it lands, not the run captured when the handler ran.
The engine mutators are already pure `(run) => newRun`, so they compose cleanly. The
work is in `packages/react`; core is untouched.

### A pure, testable store-write helper

The React package has no component-rendering test setup: every test exercises a pure
helper module, and there is no react-dom, jsdom, or test renderer. So the fix is lifted
out of the component into a pure helper that can be unit-tested directly. This also seeds
the `useRunStore` extraction that issue #114 anticipates, without doing #114's work.

New module `packages/react/src/runWrite.js` exports:

```js
export function applyRunWrite(store, entryId, arg, { reconcileRun, def, now }) {
  const e = store.entries[entryId];
  if (!(e && e.status === "active")) return store;
  const next = typeof arg === "function" ? arg(e.run) : arg;
  const reconciled = applyReconcile(reconcileRun, next, { def, runId: entryId });
  return updateRunState(store, entryId, reconciled, now);
}
```

It imports `applyReconcile` from `./reconcile.js` and `updateRunState` from
`@sqnce/core`. It resolves `arg` against the entry's CURRENT run (`e.run`), so a function
captured earlier composes onto whatever the store holds now. It keeps the existing
active-status guard (a write onto an archived or deleted run is dropped) and the
load-path reconcile. It takes `now` as an argument instead of calling `Date.now()`
itself, so it stays pure and testable, matching how the engine threads time in.

### setRun becomes a thin wrapper

`setRun` keeps its `!entry || readOnly` guard and delegates the store update:

```js
const setRun = useCallback(
  (arg) => {
    if (!entry || readOnly) return;
    setStore((s) => applyRunWrite(s, entry.id, arg, { reconcileRun, def, now: Date.now() }));
  },
  [entry, readOnly, reconcileRun, def]
);
```

It now accepts either a value or a function, the standard React setState contract. The
inline comment about the active re-check moves to `runWrite.js`.

### Content mutators pass functions

Each composing mutator passes `(prev) => coreFn(prev, ...)` so it recomputes against the
latest run:

- `writeOutput`: `setRun((prev) => coreSetOutput(prev, stepId, outputId, value, opts))`
- `toggleDone`: `setRun((prev) => setCheckedDone(prev, stepId, checked))`
- `reopen`: `setRun((prev) => reopenStep(prev, stepId))`
- `toggleSkip`: `setRun((prev) => skipped ? unskipSubStage(prev, subs, subStageId) : skipSubStage(prev, subs, subStageId))`

Because `generate` and `onFile` both write through `writeOutput`, converting it fixes
both async data-loss paths.

Two mutators do not compose a delta and are handled in the only ways that fit their
semantics, while still passing a function for a uniform call style:

- `resetRun`: `setRun(() => makeInitialRun(activeId))`. A reset is a replace, not a
  compose, so the function intentionally ignores `prev`.
- `doAdvance`: it still decides from the current render whether an advance happens and
  whether to clear transient UI (so a blocked advance leaves the expanded step open),
  then writes through the functional form:

  ```js
  const doAdvance = (force) => {
    if (readOnly) return;
    const preview = coreAdvance(run, subs, { force, validators });
    if (!preview.advanced) return;
    clearTransients();
    setRun((prev) => {
      const r = coreAdvance(prev, subs, { force, validators });
      return r.advanced ? r.run : prev;
    });
  };
  ```

  The render-time `preview` drives only the transient-UI decision; the actual write
  recomputes against `prev`. The handler never reads a flag set inside the updater, so
  React re-invoking the updater (for example under StrictMode) is safe. If `preview` says
  advanced but the recompute against `prev` would not advance, the updater returns `prev`
  unchanged, a safe no-op.

`setNav` is unchanged: it is navigation, not a content mutation, writes with the entry's
own timestamp, and stays available on archived runs.

### Data flow after the fix

When an async draft or file write resolves, it calls `setRun` with its function;
`applyRunWrite` applies that function to the entry's current run in the store, which
already reflects any edits made during the wait, so nothing is discarded. The generated
or attached output and the concurrent edits all persist.

## Files

- `packages/react/src/runWrite.js` (new): `applyRunWrite`.
- `packages/react/test/runWrite.test.js` (new): the tests below. It lives under
  `test/`, not `src/`, because the root `npm test` script globs
  `packages/react/test/*.test.js`; a file under `src/` would never run in CI.
- `packages/react/src/Sqnce.jsx`: `setRun` wraps `applyRunWrite`; `writeOutput`,
  `toggleDone`, `reopen`, `toggleSkip`, `resetRun`, and `doAdvance` pass functions.

## Testing

New `packages/react/test/runWrite.test.js` (node:test, pure, no DOM), importing the
helper from `../src/runWrite.js`, using a real `@sqnce/core` definition fixture and real
engine mutators. It lives under `test/` so the root `npm test` script
(`node --test packages/core/test/*.test.js packages/react/test/*.test.js`) runs it:

1. **Value-form passthrough.** A value arg is reconciled and written with the passed-in
   `now` as the entry's `updatedAt`.
2. **Functional-form interleave regression (the bug).** Start from a run, apply a
   synchronous content write to step B to get the store's current state, then apply a
   functional write that adds step A, where the function is the kind an async writer would
   have captured. Assert the result carries BOTH step A and step B. The old value-form
   code, modelled by writing `coreSetOutput(capturedRun, A)` directly, loses step B; the
   functional form keeps it.
3. **Inactive/archived guard.** An entry whose status is not `active`, and a missing
   entry id, both return the store unchanged.
4. **Reconcile applied.** A reconcile hook that transforms the run is applied to the
   written run.

Plus the existing gates: `npm test` (all core and react suites), `npm run build -w
examples/demo`, and `npm run types`.

## Out of scope

- Issue #114's broader `Sqnce.jsx` decomposition (the `useRunStore` hook, the CSS
  extraction, the prop-drill cleanup). This spec extracts only `applyRunWrite`.
- The validator pre-check inside `generate` (line 494) reads the render-time `run`. That
  is a read for an error message, not a write that can clobber state, and gates re-run
  validators anyway, so it is left unchanged.
- Any global edit lock during async writes: rejected, because the report assumes the user
  can keep working during a slow generation.
- Engine changes: none. Core stays dependency-free and untouched.

## Acceptance

- `applyRunWrite` resolves a function arg against the entry's current run, keeps the
  active-status guard and the load-path reconcile, and writes with the passed-in `now`.
- `setRun` delegates to `applyRunWrite` and accepts both a value and a function.
- `writeOutput`, `toggleDone`, `reopen`, `toggleSkip`, `resetRun`, and `doAdvance` pass
  functions; `generate` and `onFile` lose no concurrent edits because they write through
  `writeOutput`.
- `packages/react/test/runWrite.test.js` covers the four cases above, including the
  interleave regression, and runs under `npm test`.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` all pass.
