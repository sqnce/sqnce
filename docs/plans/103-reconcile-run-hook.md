# Consumer run-reconcile hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `reconcileRun(run, { def, runId }) => run` prop to `ProcessRolodex` so a consumer can post-process the run the rolodex renders (at entry creation, on load, and after each content transition), reflecting policy-derived run state live without a page reload.

**Architecture:** A pure, React-free helper module (`packages/react/src/reconcile.js`) decides when to apply the consumer's function and guards against an absent prop or a bad return; `ProcessRolodex` calls it at the three points where a run first enters the rendered state. The reference consumer (the demo) auto-skips the presales Orals Prep lane from upstream content using the existing auto-skip provenance primitives. No `@sqnce/core` change.

**Tech Stack:** Plain ESM JavaScript, React 18, Node's built-in test runner (`node:test`, Node 20+). No build step in core; the demo builds with Vite.

## Global Constraints

- Never use em dashes anywhere (code, comments, docs, commit messages, UI copy). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Keep `@sqnce/core` dependency-free and unchanged; new work goes in `@sqnce/react` and the demo.
- Renderers and validators (and now this reconcile hook) never enter core except as arguments.
- Absent prop must be a no-op: byte-identical current behavior (helper returns the same store/run reference).
- `reconcileRun` contract (consumer's responsibility, not enforced): pure and idempotent; changes only policy-derived run state; never changes `idx`.
- Per-PR gates, all must pass: `npm test`, `npm run build -w examples/demo`, `npm run types`.
- The generated `.d.ts` files are gitignored, so the types gate is "`npm run types` exits clean", not a committed `.d.ts` diff. `tsc` may be absent locally; if so, confirm the JSDoc change adds only the new optional prop and let CI run the real check.
- JSX syntax check for a single file: `npx esbuild <file> --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`.
- Work happens in the worktree `~/dev/sqnce-worktrees/103-reconcile-run-hook` on branch `103-reconcile-run-hook`. Stage files explicitly (never `git add -A`) so the gitignored `node_modules` symlink stays out of commits.

## File Structure

- Create: `packages/react/src/reconcile.js`: the pure helper. Exports `applyReconcile(reconcileFn, run, context)` and `applyReconcileToStore(reconcileFn, store, workflows)`. One responsibility: decide when to apply the consumer's reconcile and guard the result.
- Create: `packages/react/test/reconcile.test.js`: `node:test` unit test for the helper.
- Modify: `packages/react/src/ProcessRolodex.jsx`: import the helper; add the `reconcileRun` prop (destructure, prop-docs comment, and `ProcessRolodexProps` typedef); wire it at the three call sites (the `newEntryFor` factory, the mount-load effect, the `setRun` transition).
- Modify: `examples/demo/src/App.jsx`: wire a reference `reconcileRun` that auto-skips the presales Orals Prep lane.

---

## Task 1: The pure reconcile helper

**Files:**
- Create: `packages/react/src/reconcile.js`
- Test: `packages/react/test/reconcile.test.js`

**Interfaces:**
- Consumes: nothing (pure, dependency-free).
- Produces:
  - `applyReconcile(reconcileFn: ((run, context) => any) | undefined, run, context?) => run`: returns `run` unchanged (same reference) when `reconcileFn` is not a function; otherwise returns `reconcileFn(run, context)`, except a non-object return degrades to the original `run`.
  - `applyReconcileToStore(reconcileFn, store, workflows) => store`: returns `store` unchanged (same reference) when `reconcileFn` is not a function; otherwise returns a new store with each entry's `run` replaced by `applyReconcile(reconcileFn, entry.run, { def, runId: entry.id })`, where `def` is the entry's workflow resolved from `workflows`; an entry whose workflow is absent keeps its run; entry metadata and store shape are preserved; the input is never mutated.

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/reconcile.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReconcile, applyReconcileToStore } from "../src/reconcile.js";

const run = (over = {}) => ({ idx: 0, frontier: 0, stepState: {}, ...over });

test("applyReconcile: absent fn returns the same run reference", () => {
  const r = run();
  assert.equal(applyReconcile(undefined, r), r);
  assert.equal(applyReconcile(null, r), r);
});

test("applyReconcile: applies the fn and returns its result", () => {
  const r = run();
  const out = run({ frontier: 1 });
  assert.equal(applyReconcile(() => out, r), out);
});

test("applyReconcile: a non-object return degrades to a no-op", () => {
  const r = run();
  assert.equal(applyReconcile(() => null, r), r);
  assert.equal(applyReconcile(() => undefined, r), r);
  assert.equal(applyReconcile(() => "nope", r), r);
  assert.equal(applyReconcile(() => 42, r), r);
});

test("applyReconcile: passes the context to the fn", () => {
  const r = run();
  let seen = null;
  const ctx = { def: { id: "w" }, runId: "r1" };
  applyReconcile((_run, c) => { seen = c; return _run; }, r, ctx);
  assert.deepEqual(seen, ctx);
});

test("applyReconcile: an idempotent fn applied twice equals applied once", () => {
  const fn = (rr) => (rr.frontier === 1 ? rr : { ...rr, frontier: 1 });
  const once = applyReconcile(fn, run());
  const twice = applyReconcile(fn, once);
  assert.deepEqual(twice, once);
});

const store = () => ({
  version: 3,
  activeWorkflowId: "w1",
  activeRunByWorkflow: { w1: "e1" },
  entries: {
    e1: { id: "e1", workflowId: "w1", name: "A", status: "active", createdAt: 1, updatedAt: 5, run: run() },
    e2: { id: "e2", workflowId: "w2", name: "B", status: "active", createdAt: 2, updatedAt: 6, run: run({ idx: 2 }) },
  },
});
const workflows = [{ id: "w1" }, { id: "w2" }];

test("applyReconcileToStore: absent fn returns the same store reference", () => {
  const s = store();
  assert.equal(applyReconcileToStore(undefined, s, workflows), s);
});

test("applyReconcileToStore: reconciles every entry's run, preserving store shape and entry metadata", () => {
  const s = store();
  const fn = (rr, ctx) => ({ ...rr, mark: ctx.def.id + ":" + ctx.runId });
  const out = applyReconcileToStore(fn, s, workflows);
  assert.equal(out.version, 3);
  assert.equal(out.activeWorkflowId, "w1");
  assert.deepEqual(out.activeRunByWorkflow, { w1: "e1" });
  assert.equal(out.entries.e1.updatedAt, 5);
  assert.equal(out.entries.e1.name, "A");
  assert.equal(out.entries.e1.run.mark, "w1:e1");
  assert.equal(out.entries.e2.run.mark, "w2:e2");
});

test("applyReconcileToStore: an entry whose workflow is absent keeps its run unchanged", () => {
  const s = store();
  const fn = (rr) => ({ ...rr, mark: true });
  const out = applyReconcileToStore(fn, s, [{ id: "w1" }]);
  assert.equal(out.entries.e2.run, s.entries.e2.run);
  assert.equal(out.entries.e1.run.mark, true);
});

test("applyReconcileToStore: does not mutate the input store", () => {
  const s = store();
  const before = JSON.stringify(s);
  applyReconcileToStore((rr) => ({ ...rr, mark: 1 }), s, workflows);
  assert.equal(JSON.stringify(s), before);
});

test("applyReconcileToStore: an idempotent fn applied twice deep-equals once", () => {
  const fn = (rr) => (rr.frontier === 1 ? rr : { ...rr, frontier: 1 });
  const once = applyReconcileToStore(fn, store(), workflows);
  const twice = applyReconcileToStore(fn, once, workflows);
  assert.deepEqual(twice, once);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && node --test packages/react/test/reconcile.test.js`
Expected: FAIL, cannot find module `../src/reconcile.js` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/reconcile.js`:

```js
/*
 * Apply a consumer-supplied run-reconcile function. Pure and React-free so it
 * runs under node:test: ProcessRolodex calls these where a run first enters
 * the rendered state (entry creation, load, and each content transition), so
 * a consumer whose run state is partly derived from policy reflects it live.
 * The reconcile function is the consumer's; this module only decides when to
 * apply it, and guards an absent prop or a bad return so a missing or buggy
 * reconcile degrades to a no-op rather than emptying the deck.
 */

/**
 * Apply reconcile to one run. When reconcileFn is not a function, returns the
 * run unchanged (the absent-prop no-op, same reference). Otherwise returns
 * reconcileFn(run, context); if that returns anything that is not a non-null
 * object (a consumer bug), the original run is returned unchanged.
 * @param {((run: any, context: any) => any) | null | undefined} reconcileFn
 * @param {any} run
 * @param {any} [context]
 * @returns {any}
 */
export function applyReconcile(reconcileFn, run, context) {
  if (typeof reconcileFn !== "function") return run;
  const next = reconcileFn(run, context);
  if (next === null || typeof next !== "object") return run;
  return next;
}

/**
 * Apply reconcile to every entry's run in a versioned run store, resolving
 * each entry's workflow definition from workflows to build the context. When
 * reconcileFn is not a function, returns the store unchanged (same reference),
 * so the load path behaves exactly as today when the prop is absent. The input
 * store is never mutated; store shape and entry metadata (including updatedAt,
 * which a load-time projection must not bump) are preserved. An entry whose
 * workflow is not in workflows keeps its run unchanged, because the context
 * cannot be built.
 * @param {((run: any, context: any) => any) | null | undefined} reconcileFn
 * @param {any} store
 * @param {any[]} workflows
 * @returns {any}
 */
export function applyReconcileToStore(reconcileFn, store, workflows) {
  if (typeof reconcileFn !== "function") return store;
  const defsById = {};
  for (const w of workflows || []) defsById[w.id] = w;
  const entries = {};
  for (const id of Object.keys(store.entries)) {
    const entry = store.entries[id];
    const def = defsById[entry.workflowId];
    const run = def
      ? applyReconcile(reconcileFn, entry.run, { def, runId: entry.id })
      : entry.run;
    entries[id] = run === entry.run ? entry : { ...entry, run };
  }
  return { ...store, entries };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && node --test packages/react/test/reconcile.test.js`
Expected: PASS, all 10 tests pass.

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && npm test 2>&1 | tail -5`
Expected: PASS, total grows from 255 to 265 (the 10 new tests), 0 fail.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/sqnce-worktrees/103-reconcile-run-hook
git add packages/react/src/reconcile.js packages/react/test/reconcile.test.js
git commit -m "feat(react): pure run-reconcile helper (#103)"
```

---

## Task 2: Wire the prop into ProcessRolodex

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

**Interfaces:**
- Consumes: `applyReconcile`, `applyReconcileToStore` from Task 1.
- Produces: the `reconcileRun` prop on `ProcessRolodex`, applied at the `newEntryFor` factory, the mount-load effect, and the `setRun` transition.

There is no DOM render harness in `@sqnce/react`, so this task's gates are: the full test suite stays green (the absent-prop no-op preserves all existing behavior), the file passes the JSX syntax check, and the types regenerate clean. The live behavior is verified by the demo in Task 3.

- [ ] **Step 1: Add the helper import**

In `packages/react/src/ProcessRolodex.jsx`, after the existing local imports (the line `import { resolveStageStatus } from "./stageStatus.js";`), add:

```js
import { applyReconcile, applyReconcileToStore } from "./reconcile.js";
```

- [ ] **Step 2: Add the prop to the documentation comment**

In the prop-documentation block comment (the `/** <ProcessRolodex /> ... */` block), after the `renderStageStatus` paragraph and before the closing `*/`, add:

```
 *  - reconcileRun (optional): (run, { def, runId }) => run, a pure,
 *      idempotent function the component applies to a run before it is used
 *      to select or render a card: to each entry's run on load, to every
 *      newly seeded run at entry creation, and to the run each setRun
 *      transition produces. Use it to reflect run state a consumer derives
 *      from policy (for example an auto-skip computed from upstream content)
 *      live, without a page reload. It must change only policy-derived run
 *      state and must not move navigation (idx). Omit for the current
 *      behavior (no-op).
```

- [ ] **Step 3: Add the prop to the ProcessRolodexProps typedef**

In the `@typedef {Object} ProcessRolodexProps` block, after the `@property ... [renderStageStatus]` line, add:

```js
 * @property {(run: import("@sqnce/core").Run, context: { def: import("@sqnce/core").Definition, runId: string|null }) => import("@sqnce/core").Run} [reconcileRun]
```

- [ ] **Step 4: Destructure the prop**

Change the component signature line from:

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus, renderStageStatus }) {
```

to (append `, reconcileRun` before the closing brace):

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus, renderStageStatus, reconcileRun }) {
```

- [ ] **Step 5: Reconcile seeded runs in the new-entry factory**

Replace the `newEntryFor` callback:

```js
  const newEntryFor = useCallback(
    (s, workflowId) => {
      const first = runsForWorkflow(s, workflowId).length === 0;
      return createRunEntry({
        id: newId(),
        workflowId,
        run: first ? makeInitialRun(workflowId) : createRun(),
        now: Date.now(),
      });
    },
    [makeInitialRun]
  );
```

with:

```js
  const newEntryFor = useCallback(
    (s, workflowId) => {
      const first = runsForWorkflow(s, workflowId).length === 0;
      const id = newId();
      const seed = first ? makeInitialRun(workflowId) : createRun();
      const wf = workflows.find((w) => w.id === workflowId);
      const run = wf ? applyReconcile(reconcileRun, seed, { def: wf, runId: id }) : seed;
      return createRunEntry({ id, workflowId, run, now: Date.now() });
    },
    [makeInitialRun, workflows, reconcileRun]
  );
```

- [ ] **Step 6: Reconcile the loaded store**

In the mount-load effect, replace:

```js
        if (saved && saved.version === 3 && saved.entries && saved.activeRunByWorkflow) {
          setStore(saved);
        }
```

with:

```js
        if (saved && saved.version === 3 && saved.entries && saved.activeRunByWorkflow) {
          setStore(applyReconcileToStore(reconcileRun, saved, workflows));
        }
```

Leave this effect's dependency array as `[]` with its existing `// eslint-disable-next-line react-hooks/exhaustive-deps`: the load runs once on mount and intentionally uses the mount-time `reconcileRun` and `workflows`; live updates come through the transition path.

- [ ] **Step 7: Reconcile the run each setRun transition produces**

Replace the `setRun` callback:

```js
  const setRun = useCallback(
    (next) => {
      if (!entry || readOnly) return;
      setStore((s) => {
        const e = s.entries[entry.id];
        return e && e.status === "active" ? updateRunState(s, entry.id, next, Date.now()) : s;
      });
    },
    [entry, readOnly]
  );
```

with:

```js
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

(`def` and `entry` are both defined above `setRun`, so they are in scope.)

- [ ] **Step 8: JSX syntax check**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output, exit 0 (the file parses and resolves `./reconcile.js`).

- [ ] **Step 9: Run the full suite to confirm no regression**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && npm test 2>&1 | tail -5`
Expected: PASS, 265 tests, 0 fail (the wiring changes nothing for the existing tests; the absent-prop no-op preserves behavior).

- [ ] **Step 10: Regenerate types**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && npm run types 2>&1 | tail -10`
Expected: exits clean (no type errors). If `tsc` is not installed locally, the command fails to start; in that case confirm by inspection that Steps 2 and 3 added only the new optional `reconcileRun` prop and note that CI runs the real types check.

- [ ] **Step 11: Commit**

```bash
cd ~/dev/sqnce-worktrees/103-reconcile-run-hook
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): apply reconcileRun at creation, load, and transition (#103)"
```

---

## Task 3: Wire the reference reconcileRun into the demo

**Files:**
- Modify: `examples/demo/src/App.jsx`

**Interfaces:**
- Consumes: the `reconcileRun` prop from Task 2; the core primitives `flattenSubStages`, `autoSkipSubStage`, `clearAutoSkipSubStage`, `getStepEntry`.
- Produces: a reference `reconcileRun` passed to `ProcessRolodex`, exercised by the demo build.

The demo's presales workflow has the one skippable sub-stage in the bundled content, the Orals Prep lane (`orals`, in the `proposal-demo` main stage). The reference reads the accepted solution-narrative text and auto-skips that lane when the text signals a written-only pursuit, otherwise clears the auto-skip. The auto-skip primitives are no-ops until the lane is reachable and defer to any manual user decision, so the reference both demonstrates the live auto-skip and shows the provenance-correct way to derive one.

- [ ] **Step 1: Extend the core import**

In `examples/demo/src/App.jsx`, change:

```js
import { getStepEntry } from "@sqnce/core";
```

to:

```js
import { getStepEntry, flattenSubStages, autoSkipSubStage, clearAutoSkipSubStage } from "@sqnce/core";
```

- [ ] **Step 2: Add the reference reconcileRun function**

After the `renderStageStatus` function (just before `export default function App()`), add:

```js
/* Reference run-reconcile: on the presales workflow, derive whether the
   Orals Prep lane applies from the accepted solution narrative and reflect it
   live. A narrative that signals a written-only pursuit (mentions "no orals"
   or "written only") auto-skips the Orals Prep lane; otherwise the auto-skip
   is cleared. The auto-skip primitives defer to any manual skip the user set
   and are no-ops until the lane is reachable, so this never overrides a
   person's decision. Other workflows are returned unchanged. */
function reconcileRun(run, { def }) {
  if (def.id !== "presales-pursuit") return run;
  const subs = flattenSubStages(def);
  const e = getStepEntry(run, "solution-narrative");
  const text = e && e.outputs && typeof e.outputs.out === "string" ? e.outputs.out : "";
  const writtenOnly = /no orals|written[- ]only/i.test(text);
  return writtenOnly
    ? autoSkipSubStage(run, subs, "orals")
    : clearAutoSkipSubStage(run, subs, "orals");
}
```

- [ ] **Step 3: Pass the prop to ProcessRolodex**

In the `<ProcessRolodex ... />` element, after the `renderStageStatus={renderStageStatus}` line, add:

```jsx
        reconcileRun={reconcileRun}
```

- [ ] **Step 4: JSX syntax check**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && npx esbuild examples/demo/src/App.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output, exit 0.

- [ ] **Step 5: Build the demo (the CI build gate)**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && npm run build -w examples/demo 2>&1 | tail -8`
Expected: `vite build` completes, no errors, a `dist/` is produced. (Note: the worktree's `node_modules` symlink makes this bundle main's `@sqnce/react`, not the worktree's; this gate confirms the demo compiles and the public API call shape is valid. The runtime behavior is verified by the manual drive in Step 7. CI runs the real build against the branch.)

- [ ] **Step 6: Run the full gates**

Run: `cd ~/dev/sqnce-worktrees/103-reconcile-run-hook && npm test 2>&1 | tail -5 && npm run types 2>&1 | tail -5`
Expected: `npm test` 265 pass, 0 fail; `npm run types` exits clean (or is unavailable locally per the Global Constraints note, deferred to CI).

- [ ] **Step 7: Manual demo verification (record the result)**

This is the only check of the live JSX wiring, since there is no DOM harness. To drive it, alias the demo's `@sqnce/react` to the worktree `src` in `examples/demo/vite.config.*` (so the dev server runs the worktree code, not main's via the symlink), run the demo, switch to the presales workflow, and verify the three wiring points:

- Transition path: in the presales run, open the Solution narrative step, add the text "no orals" to its body, mark or commit it, and confirm the Orals Prep lane shows skipped in the same session without a reload. Remove the text, commit, and confirm the lane returns (the auto-skip clears). Manually skip the Orals Prep lane yourself, then toggle the narrative text again, and confirm your manual skip is left untouched.
- Creation path: start a fresh presales run that already carries "no orals" in its narrative (or Reset after entering it) and confirm the lane shows skipped on first render before any further edit.
- Load path: reload the page and confirm the deck shows the reconciled skip state immediately, with no visible flash of the unreconciled lane.

Record the observed result in the PR thread. If any path misbehaves, stop and debug with `superpowers:systematic-debugging` before proceeding.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/sqnce-worktrees/103-reconcile-run-hook
git add examples/demo/src/App.jsx
git commit -m "feat(demo): reference reconcileRun auto-skips the presales orals lane (#103)"
```

---

## Self-Review

**Spec coverage:**
- `reconcileRun(run, { def, runId }) => run` prop: Task 2 Steps 3, 4.
- Applied at entry creation, on load, after each transition, before selection/render: Task 2 Steps 5, 6, 7.
- Absent prop is a no-op (same reference): Task 1 (helper guards) plus Task 1 tests "absent fn returns the same run/store reference".
- Pure React-free helper with a unit test covering absent no-op, load-time per-entry with shape and metadata preserved, post-transition single run, idempotence, non-object no-op, unknown-workflow entry unchanged: Task 1 Step 1 (all 10 tests) and Step 3 (the helper).
- Demo wires reconcileRun, exercised by the demo build: Task 3.
- `npm test`, `npm run build -w examples/demo`, `npm run types` pass: gated in Task 2 Steps 9, 10 and Task 3 Steps 5, 6.
- Open question 1 (context argument): implemented as `(run, { def, runId })` throughout.
- Open question 2 (archived runs reconciled on load): `applyReconcileToStore` maps over all entries regardless of status, so archived entries' runs are reconciled on load; the transition path never touches archived runs (`setRun` returns early on `readOnly` and the updater checks `status === "active"`).

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to" placeholders; every code step shows complete code.

**Type consistency:** `applyReconcile` and `applyReconcileToStore` names and argument order match between `reconcile.js` (Task 1), its tests (Task 1), and the three call sites (Task 2). The context object `{ def, runId }` is consistent across the typedef, the factory, and `setRun`. The demo `reconcileRun(run, { def })` destructures a subset of the same context.
