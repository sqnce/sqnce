# Async writes recompute against the latest run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop async draft/file writes from silently discarding concurrent edits by recomputing every content write against the run-store's current run.

**Architecture:** Lift the store-write logic out of the `Sqnce.jsx` component into a pure helper `applyRunWrite` (testable with `node:test`, no DOM), make `setRun` a thin wrapper over it, and route every content mutator through a functional form `(prevRun) => nextRun` so a write resolves against the entry's current run when it lands, not the run captured at render time.

**Tech Stack:** Plain ESM JavaScript, React 18 (peer), `@sqnce/core` engine, Node's built-in test runner (`node:test`, Node 20+).

## Global Constraints

- No em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- `@sqnce/core` stays dependency-free and is NOT modified by this change; all work is in `packages/react`.
- New test files live in `packages/react/test/` (the root `npm test` globs `packages/core/test/*.test.js packages/react/test/*.test.js`); a `*.test.js` under `src/` would never run.
- License headers / file style: match the existing `packages/react/src` modules (plain ESM, JSDoc on exports).
- Conventional commits: `feat(react): ...`, `test(react): ...`.

---

### Task 1: pure `applyRunWrite` store-write helper

**Files:**
- Create: `packages/react/src/runWrite.js`
- Test: `packages/react/test/runWrite.test.js`

**Interfaces:**
- Consumes: `applyReconcile` from `./reconcile.js`; `setOutput`, `updateRunState` from `@sqnce/core`.
- Produces: `applyRunWrite(store, entryId, arg, { reconcileRun, def, now }) -> store`. `arg` is either a run value or a function `(prevRun) => nextRun`. Returns the same store unchanged when the entry is missing or not `active`; otherwise resolves `arg` against the entry's current run, applies the load-path reconcile, and writes with `updateRunState` stamping `updatedAt = now`.

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/runWrite.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setOutput } from "@sqnce/core";
import { applyRunWrite } from "../src/runWrite.js";

const run = (over = {}) => ({ idx: 0, frontier: 0, stepState: {}, ...over });

const store = (entryOver = {}) => ({
  version: 3,
  activeWorkflowId: "w1",
  activeRunByWorkflow: { w1: "e1" },
  entries: {
    e1: { id: "e1", workflowId: "w1", name: "A", status: "active", createdAt: 1, updatedAt: 5, run: run(), ...entryOver },
  },
});

const def = { id: "w1" };
const opts = (over = {}) => ({ reconcileRun: undefined, def, now: 100, ...over });

test("applyRunWrite: value form is written and stamps updatedAt with now", () => {
  const s = store();
  const value = run({ frontier: 2 });
  const out = applyRunWrite(s, "e1", value, opts({ now: 777 }));
  assert.equal(out.entries.e1.run, value);
  assert.equal(out.entries.e1.updatedAt, 777);
});

test("applyRunWrite: functional form resolves against the entry's current run", () => {
  const seeded = store();
  seeded.entries.e1.run = setOutput(run(), "s1", "o", "one");
  const out = applyRunWrite(seeded, "e1", (prev) => setOutput(prev, "s2", "o", "two"), opts());
  assert.equal(out.entries.e1.run.stepState.s1.outputs.o, "one");
  assert.equal(out.entries.e1.run.stepState.s2.outputs.o, "two");
});

test("applyRunWrite: an async functional write keeps edits made during its wait (the bug)", () => {
  const run0 = run();
  let s = store();
  s.entries.e1.run = run0;
  // A sync edit marks step B while the async write is in flight.
  s = applyRunWrite(s, "e1", (prev) => setOutput(prev, "stepB", "o", "B"), opts());
  // The async write lands as a function, recomputing against the current run.
  s = applyRunWrite(s, "e1", (prev) => setOutput(prev, "stepA", "o", "A"), opts());
  assert.equal(s.entries.e1.run.stepState.stepA.outputs.o, "A");
  assert.equal(s.entries.e1.run.stepState.stepB.outputs.o, "B");

  // Contrast: the old value form, computed from the captured run0, drops step B.
  let bug = store();
  bug.entries.e1.run = run0;
  bug = applyRunWrite(bug, "e1", setOutput(run0, "stepB", "o", "B"), opts());
  bug = applyRunWrite(bug, "e1", setOutput(run0, "stepA", "o", "A"), opts());
  assert.equal(bug.entries.e1.run.stepState.stepA.outputs.o, "A");
  assert.equal(bug.entries.e1.run.stepState.stepB, undefined);
});

test("applyRunWrite: a write onto a non-active entry returns the store unchanged", () => {
  const s = store({ status: "archived" });
  assert.equal(applyRunWrite(s, "e1", run({ frontier: 9 }), opts()), s);
});

test("applyRunWrite: a write onto a missing entry returns the store unchanged", () => {
  const s = store();
  assert.equal(applyRunWrite(s, "nope", run({ frontier: 9 }), opts()), s);
});

test("applyRunWrite: the load-path reconcile is applied to the written run", () => {
  const s = store();
  const reconcileRun = (rr, ctx) => ({ ...rr, mark: ctx.def.id + ":" + ctx.runId });
  const out = applyRunWrite(s, "e1", run({ frontier: 1 }), opts({ reconcileRun }));
  assert.equal(out.entries.e1.run.mark, "w1:e1");
  assert.equal(out.entries.e1.run.frontier, 1);
});

test("applyRunWrite: a functional write composes with the reconcile", () => {
  const s = store();
  const reconcileRun = (rr) => ({ ...rr, reconciled: true });
  const out = applyRunWrite(s, "e1", (prev) => setOutput(prev, "s1", "o", "x"), opts({ reconcileRun }));
  assert.equal(out.entries.e1.run.reconciled, true);
  assert.equal(out.entries.e1.run.stepState.s1.outputs.o, "x");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/react/test/runWrite.test.js`
Expected: FAIL, cannot find module `../src/runWrite.js` (the helper does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/runWrite.js`:

```js
import { updateRunState } from "@sqnce/core";
import { applyReconcile } from "./reconcile.js";

/*
 * The store-write path for content mutations, lifted out of the Sqnce shell so
 * it is pure and testable under node:test (the react package has no DOM test
 * setup). It resolves the write against the entry's CURRENT run, so an async
 * writer (draft generation, file read) that captured an earlier run does not
 * clobber edits made while it was in flight. The active-status re-check is kept
 * here: a write that lands after the run was archived or deleted is dropped.
 */

/**
 * Apply a content write to one run-store entry.
 * @param {any} store the versioned run store
 * @param {string} entryId the entry to write
 * @param {any | ((prevRun: any) => any)} arg a run value, or a function applied
 *   to the entry's current run to produce the next run
 * @param {{ reconcileRun?: any, def: any, now: number }} options reconcile hook,
 *   the entry's workflow definition (for the reconcile context), and the
 *   timestamp to stamp (passed in so this stays pure)
 * @returns {any} the next store, or the same store unchanged when the entry is
 *   missing or not active
 */
export function applyRunWrite(store, entryId, arg, { reconcileRun, def, now }) {
  const e = store.entries[entryId];
  if (!(e && e.status === "active")) return store;
  const next = typeof arg === "function" ? arg(e.run) : arg;
  const reconciled = applyReconcile(reconcileRun, next, { def, runId: entryId });
  return updateRunState(store, entryId, reconciled, now);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/react/test/runWrite.test.js`
Expected: PASS, all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/runWrite.js packages/react/test/runWrite.test.js
git commit -m "feat(react): add pure applyRunWrite store-write helper (#106)"
```

---

### Task 2: route the shell's content mutators through the functional form

**Files:**
- Modify: `packages/react/src/Sqnce.jsx` (`setRun` ~278-289, `doAdvance` ~369-376, `writeOutput` ~432-435, `toggleDone` ~436-439, `reopen` ~440-443, `toggleSkip` ~446-452, `resetRun` ~525-529)

**Interfaces:**
- Consumes: `applyRunWrite` from `./runWrite.js` (Task 1); existing core mutators already imported in `Sqnce.jsx` (`setOutput as coreSetOutput`, `setCheckedDone`, `reopenStep`, `skipSubStage`, `unskipSubStage`, `advance as coreAdvance`).
- Produces: no new exported surface; behavior change only. `generate` and `onFile` are not edited directly because both already write through `writeOutput`.

This task changes the JSX shell, which has no `node:test` unit coverage; its automated gates are the esbuild syntax check, the full `npm test` (Task 1's helper test is the regression proof), `npm run types`, and the CI demo build. (Locally the worktree's `npm run build -w examples/demo` resolves `@sqnce/react` through the node_modules symlink to the main checkout, so the authoritative demo-build gate for this branch is CI.)

- [ ] **Step 1: Add the import**

In `packages/react/src/Sqnce.jsx`, below the existing `import { applyReconcile, applyReconcileToStore } from "./reconcile.js";` line, add:

```js
import { applyRunWrite } from "./runWrite.js";
```

- [ ] **Step 2: Make `setRun` a thin wrapper**

Replace the `setRun` definition (the comment block at ~274-277 plus the callback at ~278-289):

```js
  /* Content mutations bump updatedAt and are blocked on archived runs.
     The status is re-checked inside the updater with current state:
     an async writer (draft generation, file read) that started while
     the run was live must not land after it is archived or deleted. */
  const setRun = useCallback(
    (next) => {
      if (!entry || readOnly) return;
      setStore((s) => {
        const e = s.entries[entry.id];
        if (!(e && e.status === "active")) return s;
        const reconciled = applyReconcile(reconcileRun, next, { def, runId: entry.id });
        return updateRunState(s, entry.id, reconciled, Date.now());
      });
    },
    [entry, readOnly, reconcileRun, def]
  );
```

with:

```js
  /* Content mutations route through applyRunWrite: it bumps updatedAt, is
     blocked on archived runs, and resolves a functional write against the
     entry's current run so an async writer (draft generation, file read) does
     not clobber edits made while it was in flight. arg is a value or
     (prevRun) => nextRun. */
  const setRun = useCallback(
    (arg) => {
      if (!entry || readOnly) return;
      setStore((s) => applyRunWrite(s, entry.id, arg, { reconcileRun, def, now: Date.now() }));
    },
    [entry, readOnly, reconcileRun, def]
  );
```

- [ ] **Step 3: Convert `doAdvance` to write functionally**

Replace `doAdvance` (~369-376):

```js
  const doAdvance = (force) => {
    if (readOnly) return;
    const result = coreAdvance(run, subs, { force, validators });
    if (result.advanced) {
      clearTransients();
      setRun(result.run);
    }
  };
```

with:

```js
  const doAdvance = (force) => {
    if (readOnly) return;
    /* Decide whether an advance happens and whether to clear transient UI from
       the current render (a blocked advance leaves the expanded step open),
       then write through the functional form so the commit recomputes against
       the latest run. The updater never reads a flag set inside it, so a
       re-invoked updater (StrictMode) is safe. */
    const preview = coreAdvance(run, subs, { force, validators });
    if (!preview.advanced) return;
    clearTransients();
    setRun((prev) => {
      const r = coreAdvance(prev, subs, { force, validators });
      return r.advanced ? r.run : prev;
    });
  };
```

- [ ] **Step 4: Convert `writeOutput`, `toggleDone`, `reopen`, `toggleSkip`**

Replace the four handlers (~432-452):

```js
  const writeOutput = (stepId, outputId, value, opts) => {
    if (readOnly) return;
    setRun(coreSetOutput(run, stepId, outputId, value, opts));
  };
  const toggleDone = (stepId, checked) => {
    if (readOnly) return;
    setRun(setCheckedDone(run, stepId, checked));
  };
  const reopen = (stepId) => {
    if (readOnly) return;
    setRun(reopenStep(run, stepId));
  };
  /* setRun, not setNav: a skip changes gate state, so it bumps
     updatedAt and is blocked on archived runs. */
  const toggleSkip = (subStageId, skipped) => {
    if (readOnly) return;
    setExpanded(null);
    setRun(
      skipped ? unskipSubStage(run, subs, subStageId) : skipSubStage(run, subs, subStageId)
    );
  };
```

with:

```js
  const writeOutput = (stepId, outputId, value, opts) => {
    if (readOnly) return;
    setRun((prev) => coreSetOutput(prev, stepId, outputId, value, opts));
  };
  const toggleDone = (stepId, checked) => {
    if (readOnly) return;
    setRun((prev) => setCheckedDone(prev, stepId, checked));
  };
  const reopen = (stepId) => {
    if (readOnly) return;
    setRun((prev) => reopenStep(prev, stepId));
  };
  /* setRun, not setNav: a skip changes gate state, so it bumps
     updatedAt and is blocked on archived runs. */
  const toggleSkip = (subStageId, skipped) => {
    if (readOnly) return;
    setExpanded(null);
    setRun((prev) =>
      skipped ? unskipSubStage(prev, subs, subStageId) : skipSubStage(prev, subs, subStageId)
    );
  };
```

- [ ] **Step 5: Convert `resetRun`**

Replace `resetRun` (~525-529):

```js
  const resetRun = () => {
    if (readOnly) return;
    clearTransients();
    setRun(makeInitialRun(activeId));
  };
```

with:

```js
  const resetRun = () => {
    if (readOnly) return;
    clearTransients();
    /* A reset is a replace, not a compose, so the function ignores prev; it
       passes a function only to keep one call style for setRun. */
    setRun(() => makeInitialRun(activeId));
  };
```

- [ ] **Step 6: Syntax-check the changed JSX and the new helper**

Run:
```bash
npx esbuild packages/react/src/Sqnce.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
npx esbuild packages/react/src/runWrite.js --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```
Expected: both exit 0 with no output (no syntax errors).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS, every core and react suite green, including `packages/react/test/runWrite.test.js`.

- [ ] **Step 8: Run the types gate**

Run: `npm run types`
Expected: exits 0 (the generated `.d.ts` are gitignored; a clean exit is the gate). `runWrite.js`'s JSDoc generates a declaration without error.

- [ ] **Step 9: Smoke the demo build**

Run: `npm run build -w examples/demo`
Expected: exits 0. (This resolves `@sqnce/react` to the main checkout via the symlink, so it does not compile this branch's `Sqnce.jsx`; the authoritative demo-build gate for the branch is CI. The esbuild check in Step 6 is the local compile check for the changed file.)

- [ ] **Step 10: Commit**

```bash
git add packages/react/src/Sqnce.jsx
git commit -m "feat(react): route content mutators through functional setRun (#106)"
```

---

## Self-Review

**Spec coverage:**
- New `runWrite.js` `applyRunWrite` with the active guard, function-or-value resolution, reconcile, and passed-in `now`: Task 1.
- `setRun` thin wrapper accepting value and function: Task 2 Step 2.
- `writeOutput`, `toggleDone`, `reopen`, `toggleSkip` functional: Task 2 Step 4. `resetRun` replace-via-function: Step 5. `doAdvance` render-time decision plus functional write: Step 3.
- `generate`/`onFile` fixed transitively through `writeOutput`: no direct edit, stated in Task 2 interfaces.
- Tests for value passthrough, functional interleave regression, inactive/missing guard, reconcile: Task 1 Step 1.
- Gates (`npm test`, demo build, `npm run types`): Task 2 Steps 7-9, plus the esbuild check Step 6.
- `setNav` unchanged, no engine change, validator pre-check untouched: out of scope, no task touches them.

**Placeholder scan:** none. Every code step shows the full before/after.

**Type consistency:** `applyRunWrite(store, entryId, arg, { reconcileRun, def, now })` is defined identically in Task 1 (signature, JSDoc, implementation) and called identically in Task 2 Step 2. The functional-form contract `(prevRun) => nextRun` matches every mutator call site.
