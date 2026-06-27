# Bundled project-review cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the six adversarially-verified project-review issues (#109, #111, #112, #113, #114, #115) on one branch: load-path totality, scoped draft validation, six UI correctness fixes, engine consolidation and shell decomposition, read-path performance, and test coverage plus a resolver throw-guard.

**Architecture:** The three layers stay separate. The engine (`@sqnce/core`) stays pure and dependency-free. All rendering stays in `@sqnce/react`. Renderers and validators only enter core as arguments. Where a UI behavior is DOM-dependent (focus, key events), it is verified in the demo, because the react test suite is pure-function only (no jsdom); where logic can be made pure, it is extracted to a testable helper.

**Tech Stack:** Plain ESM JavaScript, no build step in core. Tests use Node's built-in runner (`node:test`, Node 20+). React 18 for the UI package.

## Global Constraints

- Never use em dashes anywhere (code, comments, docs, commit messages, UI copy). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Keep `@sqnce/core` dependency-free; new UI work goes in `@sqnce/react`, never into core.
- `npm test` runs every `*.test.js` across `packages/core` and `packages/react`.
- Per-PR gates that must pass: `npm test`, `npm run build -w examples/demo`, `npm run types`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- Run all commands from the worktree root: `~/dev/sqnce-worktrees/109-111-112-113-114-115-project-review-cleanup`.

## Execution order (with dependencies)

1. **Group A (#109)** load-path totality. Independent.
2. **Group B (#111)** scoped draft validation. Independent.
3. **Group F (#115)** test coverage and resolver throw-guard. Its engine input-immutability tests must land **before** Group D, because they guard the Group D refactor.
4. **Group D (#114)** engine consolidation and shell decomposition. Depends on Group F's immutability tests existing.
5. **Group E (#113)** read-path performance. Depends on Group D (consumes the topology object).
6. **Group C (#112)** six UI correctness fixes. Independent (can run any time).

---

## Group A: #109 load-path totality

**Files:**
- Modify: `packages/react/src/reconcile.js:50-67` (`applyReconcileToStore`)
- Test: `packages/react/test/reconcile.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `applyReconcileToStore(reconcileFn, store, workflows)` becomes total: a non-object `store`, a non-object `store.entries`, a malformed entry, or a malformed `workflows` element never throws.

- [ ] **Step 1: Write the failing tests**

Append to `packages/react/test/reconcile.test.js`:

```js
test("applyReconcileToStore: a non-object store returns it unchanged", () => {
  const fn = (r) => ({ ...r, mark: 1 });
  assert.equal(applyReconcileToStore(fn, null, workflows), null);
  assert.equal(applyReconcileToStore(fn, undefined, workflows), undefined);
  assert.equal(applyReconcileToStore(fn, "nope", workflows), "nope");
});

test("applyReconcileToStore: a store without an entries object returns it unchanged", () => {
  const fn = (r) => ({ ...r, mark: 1 });
  const s1 = { version: 3, activeRunByWorkflow: {} };
  assert.equal(applyReconcileToStore(fn, s1, workflows), s1);
  const s2 = { version: 3, entries: null, activeRunByWorkflow: {} };
  assert.equal(applyReconcileToStore(fn, s2, workflows), s2);
});

test("applyReconcileToStore: a malformed entry is preserved, valid entries still reconcile", () => {
  const s = {
    version: 3,
    activeWorkflowId: "w1",
    activeRunByWorkflow: { w1: "e1" },
    entries: {
      e1: { id: "e1", workflowId: "w1", name: "A", status: "active", createdAt: 1, updatedAt: 5, run: run() },
      e2: null,
      e3: "garbage",
    },
  };
  const fn = (rr) => ({ ...rr, mark: true });
  const out = applyReconcileToStore(fn, s, workflows);
  assert.equal(out.entries.e1.run.mark, true);
  assert.equal(out.entries.e2, null);
  assert.equal(out.entries.e3, "garbage");
});

test("applyReconcileToStore: a malformed workflows element does not throw", () => {
  const s = store();
  const fn = (rr) => ({ ...rr, mark: true });
  const out = applyReconcileToStore(fn, s, [null, { id: "w1" }, "nope", { name: "no id" }]);
  assert.equal(out.entries.e1.run.mark, true); // w1 still resolved
  assert.equal(out.entries.e2.run, s.entries.e2.run); // w2 absent -> unchanged
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/react/test/reconcile.test.js`
Expected: FAIL with a `TypeError` (the malformed-entry and malformed-workflows cases throw today; the non-object-store cases assert a value the current code does not return).

- [ ] **Step 3: Make `applyReconcileToStore` total**

Replace the body of `applyReconcileToStore` in `packages/react/src/reconcile.js`:

```js
export function applyReconcileToStore(reconcileFn, store, workflows) {
  if (typeof reconcileFn !== "function") return store;
  // Totality on the load path: a malformed saved store must degrade to a
  // no-op, never throw into the Sqnce load catch where the placeholder store
  // would be saved over the user's runs.
  if (!store || typeof store !== "object" || !store.entries || typeof store.entries !== "object")
    return store;
  // Null-prototype maps: store ids (workflow id, entry id) are data, so a key
  // like "__proto__" or "toString" must become an own entry, never reach the
  // prototype or be mistaken for an inherited member.
  const defsById = Object.create(null);
  for (const w of workflows || []) {
    if (w && typeof w === "object" && typeof w.id === "string") defsById[w.id] = w;
  }
  const entries = Object.create(null);
  for (const id of Object.keys(store.entries)) {
    const entry = store.entries[id];
    // A malformed entry is preserved unchanged rather than dropped: totality
    // here means non-destructive, even on garbage input.
    if (!entry || typeof entry !== "object") {
      entries[id] = entry;
      continue;
    }
    const def = defsById[entry.workflowId];
    const run = def
      ? applyReconcile(reconcileFn, entry.run, { def, runId: entry.id })
      : entry.run;
    entries[id] = run === entry.run ? entry : { ...entry, run };
  }
  return { ...store, entries };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test packages/react/test/reconcile.test.js`
Expected: PASS (all reconcile tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/reconcile.js packages/react/test/reconcile.test.js
git commit -m "fix(react): make applyReconcileToStore total against malformed saved state (#109)"
```

---

## Group B: #111 scoped draft validation

**Files:**
- Modify: `packages/core/src/index.js` (export a new `validateOutputValue` helper near `scopeValidatorRun` / `gateProgress`)
- Modify: `packages/react/src/Sqnce.jsx:497-501` (use the helper in the draft path) and its `@sqnce/core` import
- Test: `packages/core/test/engine.test.js` (append a forked scoped-draft test)

**Interfaces:**
- Produces: `validateOutputValue(subStages, run, flatIdx, stepId, spec, value, validators) -> string | null`. Returns the validator message when the value is invalid under the same spine-plus-own-track relation set the gate uses, else null (also null when there is no validator). No-op scoping for a linear definition.

- [ ] **Step 1: Write the failing core test**

Append to `packages/core/test/engine.test.js`. Build a small forked definition whose validator on a track step requires a sibling track's output via `getStepEntry(ctx.run, ...)`. This reproduces the exact bug direction from the spec: unscoped (today's draft path) the validator sees the sibling and passes, but scoped (the gate, and now the helper) it cannot see the sibling and fails, so a value that passes at draft time is caught at the gate:

```js
test("validateOutputValue: a forked draft value that passes unscoped fails under the gate's scoping", () => {
  // spine s0; tracks A (a1) and B (b1). The validator on a1 REQUIRES b1's output
  // (cross-track). Unscoped it sees b1 and passes; scoped, a1 never sees track B,
  // so it fails, matching the boundary gate.
  const def = {
    id: "vf", name: "VF",
    tracks: [ { id: "A", name: "A" }, { id: "B", name: "B" } ],
    mainStages: [
      { id: "m0", name: "M0", subStages: [ { id: "s0", name: "S0", gate: { type: "hybrid" }, steps: [ { id: "st0", name: "St0" } ] } ] },
      { id: "mA", name: "MA", track: "A", subStages: [ { id: "a1", name: "A1", gate: { type: "hybrid" }, steps: [ { id: "stA", name: "StA", required: true, outputs: [ { id: "oA", type: "text", validate: "requireSibling" } ] } ] } ] },
      { id: "mB", name: "MB", track: "B", subStages: [ { id: "b1", name: "B1", gate: { type: "hybrid" }, steps: [ { id: "stB", name: "StB", outputs: [ { id: "oB", type: "text" } ] } ] } ] },
    ],
  };
  assert.deepEqual(validateDefinition(def), []);
  const subs = flattenSubStages(def);
  const validators = {
    requireSibling: (_v, _spec, ctx) => (getStepEntry(ctx.run, "stB").outputs.oB ? null : "needs the sibling track"),
  };
  // A run where stB has output and the fork is open at A1.
  const run = {
    idx: subs.findIndex((s) => s.id === "a1"),
    frontier: 0,
    trackFrontier: { A: 1, B: 2 },
    stepState: { stB: { checkedDone: false, outputs: { oB: "x" } } },
  };
  const flatIdx = subs.findIndex((s) => s.id === "a1");
  // Unscoped, the raw validator sees stB and PASSES (this is the latent draft-time bug):
  assert.equal(validators.requireSibling("draft", subs[flatIdx].steps[0].outputs[0], { run, stepId: "stA" }), null);
  // Scoped through the helper, A1 cannot see track B, so it FAILS, as the gate does:
  assert.equal(validateOutputValue(subs, run, flatIdx, "stA", subs[flatIdx].steps[0].outputs[0], "draft", validators), "needs the sibling track");
});

test("validateOutputValue: linear definition is a pass-through (no scoping)", () => {
  const subs = flattenSubStages(FIXTURE); // the linear fixture from ./fixtures/workflow.js
  const spec = { id: "o", type: "text", validate: "nonEmpty" };
  const validators = { nonEmpty: (v) => (v && v.trim() ? null : "empty") };
  const r = createRun();
  assert.equal(validateOutputValue(subs, r, 0, "anyStep", spec, "", validators), "empty");
  assert.equal(validateOutputValue(subs, r, 0, "anyStep", spec, "ok", validators), null);
});
```

Note for the implementer: `FIXTURE` (linear) is already imported in `engine.test.js` from `./fixtures/workflow.js`, and `FORKED` from `./fixtures/forked.js`; reuse them, do not add new fixtures. The forked `def` in the first test above is a small self-contained definition (its own ids `stA`/`stB`/`oA`/`oB`), which is fine because it does not depend on `FORKED`'s shape. Add `validateOutputValue` to the file's existing import from `../src/index.js` (the other names used here, `flattenSubStages`, `getStepEntry`, `createRun`, `validateDefinition`, are already imported).

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/core/test/engine.test.js`
Expected: FAIL with "validateOutputValue is not a function" (or not exported).

- [ ] **Step 3: Export `validateOutputValue` from core**

Add directly after `gateProgress` in `packages/core/src/index.js`:

```js
/**
 * Validate one output value with the same spine-plus-own-track relation-set
 * scoping the gate uses, so a draft-time check matches the boundary gate. For
 * a linear definition the scoping is a pass-through. Returns the validator's
 * message string when invalid, else null (also null when no validator resolves).
 * @param {FlatSubStage[]} subStages
 * @param {Run} run
 * @param {number} flatIdx flat sub-stage index of the drafted step's sub-stage
 * @param {string} stepId
 * @param {OutputSpec} spec
 * @param {any} value
 * @param {Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>} [validators]
 * @returns {string|null}
 */
export function validateOutputValue(subStages, run, flatIdx, stepId, spec, value, validators) {
  const fn = spec && spec.validate && validators && validators[spec.validate];
  if (typeof fn !== "function") return null;
  const forked = subStages.some((s) => s.track !== undefined);
  const evalRun = forked ? scopeValidatorRun(subStages, run, flatIdx) : run;
  const message = fn(value, spec, { run: evalRun, stepId });
  return typeof message === "string" ? message : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the React draft path to the helper**

In `packages/react/src/Sqnce.jsx`, add `validateOutputValue` to the `@sqnce/core` import. Replace lines 497-501 (the inline unscoped validation) with:

```js
      const message = validateOutputValue(subs, run, idx, step.id, target, parsed.value, validators);
      if (typeof message === "string") {
        setGenError({ stepId: step.id, message: `Draft failed validation: ${message}` });
        return;
      }
```

- [ ] **Step 6: Verify the gates pass**

Run: `node --test packages/react/test/*.test.js && npm run build -w examples/demo`
Expected: PASS / build succeeds (the React change is exercised by the demo build; there is no jsdom unit test for the generate handler).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js packages/react/src/Sqnce.jsx
git commit -m "fix(core): scope forked draft-target validation to match the gate (#111)"
```

---

## Group F: #115 test coverage and resolver throw-guard

This group lands **before** Group D so its input-immutability tests guard the refactor.

### Task F1: engine input-immutability assertions

**Files:**
- Test: `packages/core/test/immutability.test.js` (create)

**Interfaces:**
- Consumes: existing exports `createRun`, `flattenSubStages`, `setOutput`, `advance`, `skipSubStage`, `cloneRun`, and the existing run-store under `packages/react`? No: `cloneRun` lives in core's run store. Use the core exports. Confirm exact names from `packages/core/src/index.js` exports before writing.

- [ ] **Step 1: Write the failing immutability tests**

Create `packages/core/test/immutability.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRun,
  flattenSubStages,
  setOutput,
  advance,
  skipSubStage,
} from "../src/index.js";

// Deep-freeze so any in-place write throws in strict mode (ESM is strict).
function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

const linearDef = {
  id: "imm", name: "Imm",
  mainStages: [
    { id: "m0", name: "M0", subStages: [ { id: "s0", name: "S0", skippable: true, gate: { type: "hybrid" }, steps: [ { id: "st0", name: "St0", required: true, outputs: [ { id: "o0", type: "text" } ] } ] } ] },
    { id: "m1", name: "M1", subStages: [ { id: "s1", name: "S1", gate: { type: "hybrid" }, steps: [ { id: "st1", name: "St1" } ] } ] },
  ],
};

test("setOutput does not mutate the input run", () => {
  const subs = flattenSubStages(linearDef);
  const run = deepFreeze(createRun());
  assert.doesNotThrow(() => setOutput(run, "st0", "o0", "hello"));
});

test("advance does not mutate the input run", () => {
  const subs = flattenSubStages(linearDef);
  const run = deepFreeze(setOutput(createRun(), "st0", "o0", "hello"));
  assert.doesNotThrow(() => advance(run, subs, {}));
});

test("skipSubStage does not mutate the input run", () => {
  const subs = flattenSubStages(linearDef);
  const run = deepFreeze(createRun());
  assert.doesNotThrow(() => skipSubStage(run, subs, "s0"));
});
```

Note for the implementer: extend this file to also freeze-test `unskipSubStage`, `autoSkipSubStage`, the done-marking export `setCheckedDone(run, stepId, checkedDone)`, and `cloneRun`. All of these are exported from `packages/core/src/index.js` (one module, no separate run-store file). `cloneRun(store, { fromId, newId, now, definition })` takes a deep-frozen store rather than a run, so deep-freeze the store fixture for that case.

- [ ] **Step 2: Run to verify they pass or surface a real mutation**

Run: `node --test packages/core/test/immutability.test.js`
Expected: PASS (the engine is believed immutable; these assertions lock that in). If any throws, that is a real pre-existing mutation bug to fix in the mutator before proceeding (treat as a finding, fix minimally, keep the test).

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/immutability.test.js
git commit -m "test(core): assert engine mutators do not mutate their input run (#115)"
```

### Task F2: forked scoping through buildContext, and serializeStep branches

**Files:**
- Test: `packages/core/test/engine.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/engine.test.js`:

```js
test("buildContext on a forked run excludes cross-track state", () => {
  // Mirror the existing gate-stage test "a forked validator cannot read a
  // sibling track's output via ctx.run" (engine.test.js, ~1492), but assert
  // through buildContext instead of gateProgress. Same fixture (FORKED), same
  // commitSpine/advance setup, same real step ids (demoScript, respDraft).
  const subsF = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subsF), subsF).run; // fork open
  r = setOutput(r, "demoScript", "s", "SECRET"); // sibling demo-track output
  r = setOutput(r, "respDraft", "d", "ok");       // response-track output
  let sawSibling = false;
  const validators = {
    check: (_v, _s, ctx) => {
      if (JSON.stringify(ctx.run.stepState).includes("SECRET")) sawSibling = true;
      return null;
    },
  };
  const def = clone(FORKED);
  def.mainStages[5].subStages[0].steps[0].outputs[0].validate = "check"; // respDraft
  const dsubs = flattenSubStages(def);
  buildContext(dsubs, r, dsubs.findIndex((s) => s.id === "resp-draft-sub"), undefined, { validators });
  assert.equal(sawSibling, false); // a response validator never sees the demo track via buildContext
});

test("serializeStep renders a link output", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "St", outputs: [ { id: "o", type: "link" } ] };
  const run = { idx: 0, frontier: 0, stepState: { st: { checkedDone: false, outputs: { o: "https://x/y" } } } };
  assert.equal(serializeStep(sub, step, run), "### M / S / St\nLink: https://x/y");
});

test("serializeStep renders fields and drops empty field lines", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "St", outputs: [ { id: "o", type: "fields", fields: [ { key: "a", label: "A" }, { key: "b", label: "B" } ] } ] };
  const run = { idx: 0, frontier: 0, stepState: { st: { checkedDone: false, outputs: { o: { a: "x", b: "" } } } } };
  assert.equal(serializeStep(sub, step, run), "### M / S / St\nA: x");
});
```

Note for the implementer: `commitSpine`, `clone`, `FORKED`, `advance`, `setOutput`, `buildContext`, and `serializeStep` are all already present in `engine.test.js` (`commitSpine` and `clone` are local helpers used by the existing forked tests). Do not add new fixtures or helpers.

- [ ] **Step 2: Run to verify failure then pass**

Run: `node --test packages/core/test/engine.test.js`
Expected: the serializeStep tests describe existing behavior and should PASS immediately (coverage-only); the buildContext scoping test should PASS if scoping is correct. If the buildContext test FAILS, that is a real scoping gap to fix in `buildContext`; otherwise these are pure coverage additions.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/engine.test.js
git commit -m "test(core): cover forked buildContext scoping and serializeStep link/fields (#115)"
```

### Task F3: resolver throw-guard (degrade silently)

**Files:**
- Modify: `packages/react/src/runStatus.js` (`resolveRunStatus`)
- Modify: `packages/react/src/stageStatus.js` (`resolveStageStatus`)
- Modify: `packages/react/src/badge.js` (`resolveGeneratedBadge`)
- Test: `packages/react/test/runStatus.test.js`, `stageStatus.test.js`, `badge.test.js` (append one each)

**Interfaces:**
- Produces: each resolver, when the consumer function throws, degrades to the built-in default or no-slot, exactly as if the consumer returned null. No logging (matches `applyReconcile`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/react/test/runStatus.test.js`:

```js
test("resolveRunStatus: a throwing resolver degrades to null", () => {
  assert.equal(resolveRunStatus(() => { throw new Error("boom"); }, { def: {}, run: {}, runId: null }), null);
});
```

Append to `packages/react/test/stageStatus.test.js`:

```js
test("resolveStageStatus: a throwing render slot degrades to the default word", () => {
  const out = resolveStageStatus({ render: () => { throw new Error("boom"); }, ctx: {}, status: "done" });
  assert.deepEqual(out, { word: "Done" });
});
```

Append to `packages/react/test/badge.test.js`:

```js
test("resolveGeneratedBadge: a throwing resolver degrades to no badge", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver: () => { throw new Error("boom"); } }), null);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test packages/react/test/runStatus.test.js packages/react/test/stageStatus.test.js packages/react/test/badge.test.js`
Expected: FAIL (the throw propagates today).

- [ ] **Step 3: Wrap each consumer call in try/catch**

In `packages/react/src/runStatus.js`, guard the call:

```js
export function resolveRunStatus(resolver, ctx) {
  if (typeof resolver !== "function") return null;
  let out;
  try {
    out = resolver(ctx);
  } catch (e) {
    return null;
  }
  if (typeof out === "string") {
    const word = out.trim();
    return word ? { word } : null;
  }
  if (out && typeof out === "object" && typeof out.word === "string") {
    const word = out.word.trim();
    if (!word) return null;
    return out.tone ? { word, tone: out.tone } : { word };
  }
  return null;
}
```

In `packages/react/src/stageStatus.js`, guard the render call:

```js
export function resolveStageStatus({ render, ctx, status }) {
  if (typeof render === "function") {
    let node;
    try {
      node = render(ctx);
    } catch (e) {
      return { word: defaultStageStatusWord(status) };
    }
    if (node !== null && node !== undefined) return { node };
  }
  return { word: defaultStageStatusWord(status) };
}
```

In `packages/react/src/badge.js`, guard the resolver call (this also carries the #112 trim fix in Group C; if Group C ran first, keep its `out.trim()` return):

```js
export function resolveGeneratedBadge({ generated, lifecycle, spec, resolver }) {
  if (!generated) return null;
  if (resolver) {
    let out;
    try {
      out = resolver(lifecycle, spec);
    } catch (e) {
      return null;
    }
    return typeof out === "string" && out.trim() ? out.trim() : null;
  }
  return defaultGeneratedBadge(lifecycle);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test packages/react/test/runStatus.test.js packages/react/test/stageStatus.test.js packages/react/test/badge.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/runStatus.js packages/react/src/stageStatus.js packages/react/src/badge.js packages/react/test/runStatus.test.js packages/react/test/stageStatus.test.js packages/react/test/badge.test.js
git commit -m "fix(react): degrade a throwing render-slot resolver to the default (#115)"
```

---

## Group D: #114 engine consolidation and shell decomposition

A behavior-preserving refactor. Guarded by Group F's immutability tests plus an explicit byte-identical equivalence test added first. Work in small commits; run the full suite after each.

### Task D0: byte-identical equivalence guard (write before any refactor)

**Files:**
- Test: `packages/core/test/topology-equivalence.test.js` (create)

- [ ] **Step 1: Capture current read-aggregate and navigation outputs as a baseline**

Create `packages/core/test/topology-equivalence.test.js` that exercises a representative linear definition and a representative forked definition through `runSummary`, `isRunComplete`, `trackStatus`, `reachableFlat` (via `browse`/`jumpTo` observable behavior), `advance`, and the skip mutators, asserting concrete expected values (not snapshots of internals). Reuse fixtures already in `engine.test.js`. This locks behavior so the consolidation cannot drift it.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenSubStages, advance, browse, jumpTo, runSummary, isRunComplete, trackStatus, createRun, setOutput, skipSubStage } from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js";   // linear
import { FORKED } from "./fixtures/forked.js";      // two tracks (demo optional, response)
// Assert exact advance results, reachable navigation (browse/jumpTo idx), and the
// runSummary/isRunComplete/trackStatus values for a few representative linear and
// forked runs. Keep assertions on observable outputs only (no internal snapshots).
```

Note for the implementer: `FIXTURE` and `FORKED` are committed fixtures importable from `packages/core/test/fixtures/`. The `commitSpine` helper lives in `engine.test.js`, not a fixture, so either copy its small body into this file or open the fork here by advancing each spine stage. This is a guard, so make the assertions concrete and broad enough that a topology regression in Task D1 would break at least one. Run it green before refactoring.

- [ ] **Step 2: Run to confirm green baseline**

Run: `node --test packages/core/test/topology-equivalence.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/topology-equivalence.test.js
git commit -m "test(core): lock engine topology behavior before consolidation (#114)"
```

### Task D1: extract flat-list topology helpers and route call sites through them

**Files:**
- Modify: `packages/core/src/index.js` (add helpers; replace inline derivations)

**Interfaces:**
- Produces (internal, not exported): `flatSpineEnd(subStages) -> number`, `flatTrackRanges(subStages) -> Map<string,{first,terminal,optional}>`, `allTrackFrontiersInRange(run, ranges) -> boolean`, `flatForkOpen(run, ranges, spineEnd) -> boolean`. These reproduce, byte-for-byte in behavior, the inline logic currently duplicated in `reachableFlat`, `normalizeFlat`, `advanceForked`, `buildContext`, and `buildDraftPrompt`. `allTrackFrontiersInRange` is shared with the definition-based read paths in Task D2 (the `trackMap` entries carry `first`/`terminal`, so the same helper works on either ranges source).

- [ ] **Step 1: Add the helpers**

Add near `reachableFlat` in `packages/core/src/index.js`:

```js
/** Spine end as a main-stage index, derived from the flat annotations. */
function flatSpineEnd(subStages) {
  let spineEnd = -1;
  subStages.forEach((s) => { if (s.track === undefined) spineEnd = Math.max(spineEnd, s.mainIndex); });
  return spineEnd;
}

/** Per-track main-index ranges, derived from the flat annotations. */
function flatTrackRanges(subStages) {
  const ranges = new Map();
  subStages.forEach((s) => {
    if (s.track === undefined) return;
    const e = ranges.get(s.track) || { first: s.mainIndex, terminal: s.mainIndex, optional: !!s.optional };
    e.first = Math.min(e.first, s.mainIndex);
    e.terminal = Math.max(e.terminal, s.mainIndex);
    ranges.set(s.track, e);
  });
  return ranges;
}

/** Every declared track has a valid in-range OWN trackFrontier entry. `ranges`
 * is a Map<id,{first,terminal}> (from flatTrackRanges or trackMap). Own-property
 * read: an inherited key must not count as an opened track. */
function allTrackFrontiersInRange(run, ranges) {
  const tf = run.trackFrontier || {};
  for (const [id, rg] of ranges) {
    const v = hasOwn(tf, id) ? tf[id] : undefined;
    if (!(typeof v === "number" && v >= rg.first && v <= rg.terminal)) return false;
  }
  return true;
}

/** The fork is open only when the spine is committed and every declared track
 * has a valid in-range own trackFrontier entry. Mirrors the inline check. */
function flatForkOpen(run, ranges, spineEnd) {
  return run.frontier >= spineEnd && allTrackFrontiersInRange(run, ranges);
}
```

- [ ] **Step 2: Replace the inline derivations in `reachableFlat`, `normalizeFlat`, `advanceForked`, `buildContext`, `buildDraftPrompt`**

In `reachableFlat`, replace the inline `spineEnd` loop (314-315) with `const spineEnd = flatSpineEnd(subStages);`, the inline `ranges` build (316-322) with `const ranges = flatTrackRanges(subStages);`, and the inline `forkOpen` block (335-341) with `const forkOpen = flatForkOpen(run, ranges, spineEnd);`. Keep the rest of the function identical.

In `normalizeFlat`, replace the inline `spineEnd` loop (362-363) with `const spineEnd = flatSpineEnd(subStages);`.

In `advanceForked`, replace the inline `spineEnd` loop (1110-1111) with `const spineEnd = flatSpineEnd(subStages);` and the inline `ranges` build (1113-1119) with `const ranges = flatTrackRanges(subStages);`. The skipped-set, idx targeting, and gate-commit logic stay identical (the gate-commit consolidation is Task D3).

In `buildContext`, replace the inline `spineEnd` derivation (1300-1301) with `const spineEnd = flatSpineEnd(subStages);`. In `buildDraftPrompt`, replace the inline `spineEnd` derivation (1365-1366) with `const spineEnd = flatSpineEnd(subStages);`. Both already receive the flat `subStages`, so this is a direct substitution; keep the surrounding clamp logic identical.

- [ ] **Step 3: Run the full suite (guarded by D0 and existing forked tests)**

Run: `node --test packages/core/test/*.test.js`
Expected: PASS (topology-equivalence, engine, immutability all green). Any failure means the extraction changed behavior; fix the helper to match the original inline logic exactly.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.js
git commit -m "refactor(core): extract flat-list topology helpers, route call sites (#114)"
```

### Task D2: consolidate the fork-open check across the read paths

**Files:**
- Modify: `packages/core/src/index.js` (`isRunComplete`, `trackStatus`)

**Interfaces:**
- Consumes: `allTrackFrontiersInRange(run, ranges)` from Task D1.

- [ ] **Step 1: Route isRunComplete and trackStatus through the shared helper**

In `isRunComplete`, replace the inline "fork OPENED" loop (the `for (const [id, t] of tm) { ... return false; }` at ~1783-1788) with:

```js
  if (!allTrackFrontiersInRange(r, tm)) return false;
```

In `trackStatus`, replace the inline all-tracks loop (~1828-1832) with:

```js
  if (!allTrackFrontiersInRange(r, tmap)) return "not-open";
```

Leave the surrounding checks unchanged (`r.frontier !== spineEnd` / `!== lastSpineIndex(definition)`, the per-track terminal and gate-met checks): only the duplicated "every track has a valid in-range entry" loop is consolidated. The `trackMap` entries carry `first`/`terminal`, so the Task D1 helper accepts them directly.

- [ ] **Step 2: Run the full suite**

Run: `node --test packages/core/test/*.test.js`
Expected: PASS (topology-equivalence and the forked tests cover open and not-open transitions).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.js
git commit -m "refactor(core): share the fork-open check across read paths (#114)"
```

### Task D3: consolidate the gate-commit sequence

**Files:**
- Modify: `packages/core/src/index.js` (`advance`, `advanceForked`)

**Interfaces:**
- Produces (internal): `evalCommitGate(stageSubs, run, opts, force) -> { ok: true, forced: boolean } | { ok: false, missing: string[] }`. Runs the stage aggregate and the gate-or-force decision shared by all three commit sites; each caller still builds its own next run (`frontier` vs `trackFrontier`) and, when `forced`, records `forces[boundaryIndex]`.

- [ ] **Step 1: Add the helper**

```js
/** The shared gate-commit decision: run the stage aggregate, then decide. ok
 * false means the gate is unmet and not forced (no advance); ok true with
 * forced true means a forced commit past an unmet gate. */
function evalCommitGate(stageSubs, run, opts, force) {
  const progress = aggregateGate(stageSubs, run, opts);
  if (!progress.met && !force) return { ok: false, missing: progress.missing };
  return { ok: true, forced: !progress.met };
}
```

- [ ] **Step 2: Route the three commit sites through it**

In `advance` (linear path, 1088-1093):

```js
    const g = evalCommitGate(subStages.filter((s) => s.mainIndex === r.frontier), r, { validators }, force);
    if (!g.ok) return { run, advanced: false, missing: g.missing };
    /** @type {Run} */
    const next = { ...r, idx: subStages.findIndex((s) => s.mainIndex === r.frontier + 1), frontier: r.frontier + 1 };
    if (g.forced) next.forces = { ...r.forces, [r.frontier]: true };
    return { run: next, advanced: true, missing: [] };
```

In `advanceForked` apply the same shape at both commit sites: the spine path (1129-1133) and the track path (1172-1180) call `evalCommitGate(stageSubs, run, { validators, subStages }, force)`, bail on `!g.ok`, build the site's own `next` (the spine path increments `frontier`; the track path increments `trackFrontier[curTrack]`), and set `next.forces` on `g.forced`. The spine-open path (1137-1158) keeps its own `trackFrontier` initialization but uses `evalCommitGate` for the gate decision (its boundary index is `spineEnd`).

- [ ] **Step 3: Run the full suite**

Run: `node --test packages/core/test/*.test.js`
Expected: PASS. The `forces` recording must stay byte-identical; if any forced-advance test fails, the `g.forced` wiring is wrong.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.js
git commit -m "refactor(core): consolidate the gate-commit sequence (#114)"
```

### Task D4: consolidate the skip-mutator preamble

**Files:**
- Modify: `packages/core/src/index.js` (`skipSubStage`, `unskipSubStage`, `autoSkipSubStage`)

**Interfaces:**
- Produces (internal): `locateReachableSkippable(run, subStages, subStageId) -> { r, idx, sub } | { r, idx: -1, sub: null }`. Runs the shared preamble: `normalizeFlat`, `findIndex`, skippable check, reachable check. Returns the normalized run plus the located sub-stage, or a not-applicable marker (`idx === -1`) for any no-op path.

- [ ] **Step 1: Add the helper and refactor the three mutators**

```js
/** Shared skip-mutator preamble: normalize, locate, check skippable + reachable.
 * Returns { r, idx, sub }; idx === -1 (sub null) on any no-op path, with r the
 * normalized run so callers return r unchanged on a no-op. */
function locateReachableSkippable(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const idx = subStages.findIndex((s) => s.id === subStageId);
  const sub = idx === -1 ? null : subStages[idx];
  if (!sub || !sub.skippable || !reachableFlat(subStages, r).includes(idx)) return { r, idx: -1, sub: null };
  return { r, idx, sub };
}
```

Then in each mutator, replace the first four lines (normalize, findIndex, skippable check, reachable check) with:

```js
  const { r, idx } = locateReachableSkippable(run, subStages, subStageId);
  if (idx === -1) return r;
```

Keep each mutator's distinct tail (the entry-shape decision: user skip vs keep-in vs auto) exactly as today. `clearAutoSkipSubStage` does not use this preamble (it does not check skippable/reachable); leave it unchanged.

- [ ] **Step 2: Run the full suite**

Run: `node --test packages/core/test/*.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.js
git commit -m "refactor(core): consolidate the skip-mutator preamble (#114)"
```

### Task D5: shell decomposition (Sqnce.jsx)

**Files:**
- Create: `packages/react/src/styles.js` (the CSS string)
- Create: `packages/react/src/useRunStore.js` (run-store lifecycle hook)
- Modify: `packages/react/src/Sqnce.jsx` (import the CSS; use the hook; extract the draft handler)
- Modify: `packages/react/src/RolodexView.jsx` (de-duplicate the mark-done/reopen handler; group the prop set)

**Interfaces:**
- Produces: `CSS` string export from `styles.js`; `useRunStore({ persistence, workflows, reconcileRun, ... }) -> { store, setStore, loaded, ... }` from `useRunStore.js`. Exact returned shape is whatever the four current effects and their state need; preserve behavior verbatim.

- [ ] **Step 1: Extract the CSS string**

Move the `const CSS = \`...\`;` literal (currently `Sqnce.jsx:760-1322`) into `packages/react/src/styles.js` as `export const CSS = \`...\`;`. In `Sqnce.jsx`, replace the literal with `import { CSS } from "./styles.js";`. No other change.

- [ ] **Step 2: Verify nothing changed behaviorally**

Run: `npm run build -w examples/demo`
Expected: build succeeds; the `<style>{CSS}</style>` usage is unchanged.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/styles.js packages/react/src/Sqnce.jsx
git commit -m "refactor(react): extract the shell CSS into styles.js (#114)"
```

- [ ] **Step 4: Extract the run-store lifecycle into `useRunStore`**

Move the persistence load effect, the debounced save effect, the startup-route effect, and the repair logic (the run-store cluster around `Sqnce.jsx:216-329` and `401-418`) into `packages/react/src/useRunStore.js` as a `useRunStore(...)` hook returning the same state and handlers the shell consumes. Preserve the load-path totality (this hook calls `applyReconcileToStore`) and the flush-before-generate ordering.

- [ ] **Step 5: Verify**

Run: `node --test packages/react/test/*.test.js && npm run build -w examples/demo`
Expected: PASS / build succeeds. Then manually verify in the demo (vite alias to the worktree src) that a saved run loads, persists, and routes on open exactly as before.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/useRunStore.js packages/react/src/Sqnce.jsx
git commit -m "refactor(react): extract the run-store lifecycle into useRunStore (#114)"
```

- [ ] **Step 7: De-duplicate the mark-done/reopen handler in RolodexView**

In `packages/react/src/RolodexView.jsx`, the mark-done and reopen handler is written twice within a step (around lines 204 and 323). Extract a single handler (a local `const toggleDone = ...` or a small function passed once) and use it in both places. Behavior must be identical.

Run: `node --test packages/react/test/*.test.js && npm run build -w examples/demo`
Expected: PASS / build succeeds.

```bash
git add packages/react/src/RolodexView.jsx
git commit -m "refactor(react): de-duplicate the mark-done/reopen handler (#114)"
```

- [ ] **Step 8: Group the RolodexView prop set**

In `packages/react/src/RolodexView.jsx`, the component receives a wide prop set (around 34 props). Group cohesive props into a small number of objects passed from `Sqnce.jsx` (for example a `nav` object for `doBrowse`/`doAdvance`/`onJump`, a `runOps` object for the skip and done handlers, and a `slots` object for the injected renderers/validators/resolvers). Update both the `Sqnce.jsx` call site and the `RolodexView` destructure together. This is purely structural; observable behavior must not change. Do it last so it sits on top of the other Group D changes, and lean on the demo build plus a manual pass (deck navigation, advance, skip, mark-done, generate) to confirm nothing regressed. If the grouping cannot be done without behavior risk in the time available, stop after Step 7 and record the prop-grouping as an explicit deferral in the PR description with the reason, so #114's status is honest rather than silently partial.

Run: `node --test packages/react/test/*.test.js && npm run build -w examples/demo`
Expected: PASS / build succeeds, then manual demo verification.

```bash
git add packages/react/src/RolodexView.jsx packages/react/src/Sqnce.jsx
git commit -m "refactor(react): group the RolodexView prop set (#114)"
```

---

## Group E: #113 read-path performance (consumes Group D)

**Files:**
- Modify: `packages/core/src/index.js` (read aggregates accept `opts.topology`)
- Modify: `packages/react/src/Sqnce.jsx` and `packages/react/src/RolodexView.jsx` (memoization)
- Test: `packages/core/test/engine.test.js` (append an opts.topology equivalence test)

**Interfaces:**
- Produces: `buildTopology(definition) -> { subs, spineEnd, trackMap, isForked }`, exported from core. `runSummary`, `isRunComplete`, `trackStatus` accept `opts.topology`; when present they skip `flattenSubStages` / `trackMap` / `lastSpineIndex` recomputation and use the provided object. Results are identical with or without the option.

- [ ] **Step 1: Write the failing equivalence test**

Append to `packages/core/test/engine.test.js`:

```js
test("read aggregates accept a precomputed topology and return identical results", () => {
  const subsF = flattenSubStages(FORKED);
  const run = advance(commitSpine(createRun(), subsF), subsF).run; // fork open
  const topology = buildTopology(FORKED);
  assert.deepEqual(runSummary(FORKED, run, { topology }), runSummary(FORKED, run, {}));
  assert.equal(isRunComplete(FORKED, run, { topology }), isRunComplete(FORKED, run, {}));
  for (const t of FORKED.tracks) {
    assert.equal(trackStatus(FORKED, run, t.id, { topology }), trackStatus(FORKED, run, t.id, {}));
  }
});
```

Note for the implementer: `FORKED`, `flattenSubStages`, `advance`, `commitSpine`, and `createRun` are already in `engine.test.js`; add `buildTopology` to the import. Also add one linear case using `FIXTURE` to confirm the linear path is unchanged with and without `{ topology: buildTopology(FIXTURE) }`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test packages/core/test/engine.test.js`
Expected: FAIL ("buildTopology is not a function").

- [ ] **Step 3: Add `buildTopology` and thread `opts.topology`**

Add the exported builder and make each read aggregate prefer `opts.topology`:

```js
/** Precompute the per-definition topology so the UI can build it once and pass
 * it into the read aggregates via opts.topology. Pure, no run state. */
export function buildTopology(definition) {
  return {
    subs: flattenSubStages(definition),
    spineEnd: lastSpineIndex(definition),
    trackMap: trackMap(definition),
    isForked: isForked(definition),
  };
}
```

In `runSummary`, `isRunComplete`, and `trackStatus`, replace the per-call `flattenSubStages(definition)`, `lastSpineIndex(definition)`, and `trackMap(definition)` with reads from `opts.topology` when present, else compute as today. Keep `isForked` consistent with the topology (`topology ? topology.isForked : isForked(definition)`). The `o = { ...opts, subStages: subs }` passed to gateProgress must use the resolved `subs`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test packages/core/test/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit the engine half**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "perf(core): accept a precomputed topology in the read aggregates (#113)"
```

- [ ] **Step 6: Memoize the React boundary**

In `packages/react/src/Sqnce.jsx`: wrap the topology derivation in `useMemo(() => buildTopology(def), [def])` and pass `{ topology }` (merged with `validators`) into the read aggregates; add the missing dependency array to the global keydown effect (currently `Sqnce.jsx:423-433` ends `});` with no deps; close it with the correct dependency list: `[overviewOpen, view, doBrowse]`, and wrap `doBrowse` in `useCallback` so the list is stable); memoize `subjectName`. In `packages/react/src/RolodexView.jsx`: wrap the component in `React.memo`, wrap handler props in `useCallback` at the Sqnce boundary, and memoize the per-output renderer context and `onChange`.

Note for the implementer: do this incrementally with a manual demo check after the keydown-effect change specifically, because a wrong dependency list there silently breaks arrow-key navigation. Memoization must not change observable behavior.

- [ ] **Step 7: Verify**

Run: `node --test packages/react/test/*.test.js && npm run build -w examples/demo`
Expected: PASS / build succeeds. Manually verify arrow-key navigation, overview open, and reading view in the demo.

- [ ] **Step 8: Commit**

```bash
git add packages/react/src/Sqnce.jsx packages/react/src/RolodexView.jsx
git commit -m "perf(react): memoize topology, handlers, and the RolodexView boundary (#113)"
```

---

## Group C: #112 six UI correctness fixes

### Task C1: bare-URL autolink keeps balanced trailing parens

**Files:**
- Modify: `packages/react/src/renderers/markdownInline.js`
- Test: `packages/react/test/markdown.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/react/test/markdown.test.js`:

```js
test("tokenizeInline keeps a balanced trailing paren in a bare URL", () => {
  const toks = tokenizeInline("see https://en.wikipedia.org/wiki/Foo_(bar)");
  const link = toks.find((t) => t.type === "link");
  assert.equal(link.href, "https://en.wikipedia.org/wiki/Foo_(bar)");
});

test("tokenizeInline strips an unbalanced trailing paren and sentence punctuation", () => {
  const a = tokenizeInline("(see https://x/y)").find((t) => t.type === "link");
  assert.equal(a.href, "https://x/y");
  const b = tokenizeInline("see https://x/y.").find((t) => t.type === "link");
  assert.equal(b.href, "https://x/y");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test packages/react/test/markdown.test.js`
Expected: FAIL (the first test loses the closing paren today).

- [ ] **Step 3: Implement the balanced-paren trim**

In `packages/react/src/renderers/markdownInline.js`, add a helper and use it in the bare-URL branch (replace line 56):

```js
// Trim trailing sentence punctuation from a bare URL, but keep a ")" that
// balances a "(" inside the URL (the CommonMark / GitHub autolink rule).
function trimUrlPunct(url) {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (!/[.,;:!?)\]}>"'»]/.test(ch)) break;
    if (ch === ")") {
      const slice = url.slice(0, end);
      const opens = (slice.match(/\(/g) || []).length;
      const closes = (slice.match(/\)/g) || []).length;
      if (closes <= opens) break; // balanced: keep this ")"
    }
    end--;
  }
  return url.slice(0, end);
}
```

Replace `const url = tok.replace(TRAILING_PUNCT, "") || tok;` with `const url = trimUrlPunct(tok) || tok;`. `TRAILING_PUNCT` is no longer used; remove it if nothing else references it.

- [ ] **Step 4: Run to verify pass**

Run: `node --test packages/react/test/markdown.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/renderers/markdownInline.js packages/react/test/markdown.test.js
git commit -m "fix(react): keep balanced trailing parens in bare-URL autolinks (#112)"
```

### Task C2: badge returns the trimmed label

Covered by Group F3's `badge.js` edit (which returns `out.trim()`). If Group C runs before F3, make the same `out.trim()` change here with a test:

- [ ] **Step 1: Append the test to `packages/react/test/badge.test.js`**

```js
test("resolveGeneratedBadge returns the trimmed label", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver: () => "  Custom  " }), "Custom");
});
```

- [ ] **Step 2-4:** Run (FAIL), change the return to `out.trim()`, run (PASS), commit:

```bash
git add packages/react/src/badge.js packages/react/test/badge.test.js
git commit -m "fix(react): return the trimmed generated-badge label (#112)"
```

### Task C3: DataTable discovers columns over all rows

**Files:**
- Create: `packages/react/src/renderers/discoverColumns.js`
- Modify: `packages/react/src/renderers/DataTable.jsx`
- Test: `packages/react/test/dataTable.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/dataTable.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverColumns } from "../src/renderers/discoverColumns.js";

test("discoverColumns includes a key that first appears past row 50", () => {
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push(i === 55 ? { a: 1, late: 2 } : { a: 1 });
  assert.deepEqual(discoverColumns(rows), ["a", "late"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test packages/react/test/dataTable.test.js`
Expected: FAIL ("discoverColumns is not a function").

- [ ] **Step 3: Extract the pure helper (no slice) and use it**

Create `packages/react/src/renderers/discoverColumns.js`:

```js
/** Ordered column keys across all rows (first-seen order). */
export function discoverColumns(rows) {
  const cols = [];
  rows.forEach((row) =>
    Object.keys(row).forEach((k) => {
      if (!cols.includes(k)) cols.push(k);
    })
  );
  return cols;
}
```

In `packages/react/src/renderers/DataTable.jsx`, replace the inline `cols` block (lines 13-18) with `import { discoverColumns } from "./discoverColumns.js";` at the top and `const cols = discoverColumns(value);`. The cell-value `.slice(0, 80)` truncation on line 19 stays.

- [ ] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add packages/react/src/renderers/discoverColumns.js packages/react/src/renderers/DataTable.jsx packages/react/test/dataTable.test.js
git commit -m "fix(react): discover DataTable columns over all rows (#112)"
```

### Task C4: ReadingView falls back to the first readable stage

**Files:**
- Modify: `packages/react/src/ReadingView.jsx`

- [ ] **Step 1: Implement the fallback**

In `packages/react/src/ReadingView.jsx`, after computing `selectedMain` and `at` (lines 100-101), when the centered stage is not readable, fall back to the first readable stage:

```js
  const rawSelected = subs[Math.min(run.idx, subs.length - 1)].mainIndex;
  const selectedMain = readable.indexOf(rawSelected) === -1 && readable.length ? readable[0] : rawSelected;
  const at = readable.indexOf(selectedMain);
```

Everything downstream (`prevMi`, `nextMi`, `stageSubs`, the canvas heading) already keys off `selectedMain`, so this single change closes the gap.

- [ ] **Step 2: Verify**

Run: `npm run build -w examples/demo`
Expected: build succeeds. This path is practically unreachable (reading view mounts only for complete runs), so verification is the build plus a code read; no jsdom unit test.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/ReadingView.jsx
git commit -m "fix(react): fall back to the first readable stage in reading view (#112)"
```

### Task C5: output overlay blocks deck arrow-keys (lift overlay-open state)

**Files:**
- Modify: `packages/react/src/Sqnce.jsx` (add `overlayOpen` state; extend the keydown guard; pass a setter down)
- Modify: `packages/react/src/RolodexView.jsx` (thread the setter to OutputView)
- Modify: `packages/react/src/OutputView.jsx` (report `big` open state up)

- [ ] **Step 1: Add shell state and extend the guard**

In `packages/react/src/Sqnce.jsx`, add `const [overlayOpen, setOverlayOpen] = useState(false);` near `overviewOpen`. Change the keydown guard (line 426) to:

```js
      if (overviewOpen || overlayOpen || view === "reading") return;
```

Pass `onOverlayOpenChange={setOverlayOpen}` down to `RolodexView`, and include `overlayOpen` in the keydown effect's dependency list (from Group E).

- [ ] **Step 2: Thread to OutputView**

In `packages/react/src/RolodexView.jsx`, accept `onOverlayOpenChange` in props and pass it to each `OutputView`.

- [ ] **Step 3: Report `big` up from OutputView**

In `packages/react/src/OutputView.jsx`, accept `onOverlayOpenChange` and add:

```js
  useEffect(() => {
    if (onOverlayOpenChange) onOverlayOpenChange(big);
    return () => { if (onOverlayOpenChange) onOverlayOpenChange(false); };
  }, [big, onOverlayOpenChange]);
```

- [ ] **Step 4: Verify in the demo**

Run: `npm run build -w examples/demo`
Expected: build succeeds. Then manually verify (vite alias to the worktree src): open an output's fullscreen overlay, press Left/Right, and confirm the deck behind does not move.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/Sqnce.jsx packages/react/src/RolodexView.jsx packages/react/src/OutputView.jsx
git commit -m "fix(react): block deck arrow-keys while an output overlay is open (#112)"
```

### Task C6: modal overlays trap focus

**Files:**
- Create: `packages/react/src/useFocusTrap.js`
- Modify: `packages/react/src/OutputView.jsx` (the `Overlay` component) and `packages/react/src/OverviewModal.jsx`

- [ ] **Step 1: Add the focus-trap hook**

Create `packages/react/src/useFocusTrap.js`:

```js
import { useEffect } from "react";

/** Move focus into the dialog on open, cycle Tab/Shift+Tab within it, and
 * restore focus to the previously focused element on close. */
export function useFocusTrap(ref) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const prev = document.activeElement;
    const sel = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(node.querySelectorAll(sel)).filter((el) => el.offsetParent !== null);
    (focusables()[0] || node).focus();
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [ref]);
}
```

- [ ] **Step 2: Use it in both dialogs**

In `packages/react/src/OutputView.jsx`, in the `Overlay` component, add a ref on the `pf-overlay` div, give it `tabIndex={-1}`, and call `useFocusTrap(overlayRef)`. In `packages/react/src/OverviewModal.jsx`, do the same on its `pf-overlay` div. Keep the existing Escape handlers.

- [ ] **Step 3: Verify in the demo**

Run: `npm run build -w examples/demo`
Expected: build succeeds. Then manually verify: open each modal, Tab cycles within it and does not reach the deck, and closing restores focus.

- [ ] **Step 4: Commit**

```bash
git add packages/react/src/useFocusTrap.js packages/react/src/OutputView.jsx packages/react/src/OverviewModal.jsx
git commit -m "fix(react): trap focus in the output and overview modals (#112)"
```

---

## Final gates (before dropping the plan and the code review)

- [ ] Run the full suite and builds:

```bash
node --test packages/core/test/*.test.js packages/react/test/*.test.js
npm run build -w examples/demo
npm run types
```

Expected: all tests PASS, demo build succeeds, `npm run types` exits clean (the generated .d.ts are gitignored; the gate is a clean exit, not committed declarations).

- [ ] Manually verify the DOM-dependent #112 items in the demo (overlay arrow-key block, focus trap) and the #114 run-store extraction (load, save, route).

---

## Self-review

**Spec coverage:**
- #109 -> Group A. Covered (totality + tests).
- #111 -> Group B. Covered (exported helper + React wiring + forked test).
- #112 -> Group C (six tasks C1-C6) plus the badge trim shared with F3. All six items covered.
- #113 -> Group E. Covered (opts.topology + buildTopology + React memoization + keydown dep array).
- #114 -> Group D, now with a concrete step per spec-listed site: D1 (spine-end across reachableFlat/normalizeFlat/advanceForked/buildContext/buildDraftPrompt, the per-track ranges, and the shared fork-open helper), D2 (fork-open check across isRunComplete/trackStatus), D3 (gate-commit sequence across advance/advanceForked), D4 (skip-mutator preamble), D5 (CSS extraction, useRunStore, mark-done/reopen de-duplication, and the RolodexView prop-grouping). The only deferrable item is the prop-grouping, and D5 Step 8 requires recording it as an explicit PR-described deferral if skipped, so #114 cannot be reported complete with a silent gap.
- #115 -> Group F (immutability, buildContext scoping, serializeStep, resolver throw-guard). Covered.

**Placeholder scan:** Real code is shown for every leaf change. Fixtures are named concretely against the real files: `FIXTURE` (linear, `./fixtures/workflow.js`), `FORKED` (`./fixtures/forked.js`), and the `commitSpine`/`clone` helpers in `engine.test.js`, with the real step ids (`demoScript`, `respDraft`). The done-marking export is `setCheckedDone`. The only intentionally-self-contained fixture is the small forked `def` in Group B's first test, which uses its own ids and depends on nothing external. The optional D3 polish (RolodexView prop-grouping, mark-done/reopen de-duplication) is explicitly marked optional, not a hidden TODO.

**Type consistency:** `validateOutputValue` signature is identical in core (Group B Step 3) and its React call site (Group B Step 5). `buildTopology` shape (`{ subs, spineEnd, trackMap, isForked }`) is consistent between its definition and the read-aggregate consumers (Group E). `flatSpineEnd` / `flatTrackRanges` / `flatForkOpen` names match between definition (D1 Step 1) and call sites (D1 Step 2). `onOverlayOpenChange` is the single prop name across Sqnce, RolodexView, and OutputView (C5).

**Scope check:** The plan stays within the six issues. The optional polish in D3 is bounded by "only if it does not risk behavior", keeping the refactor honest.
