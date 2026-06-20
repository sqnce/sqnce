# run clone primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cloneRun` primitive to `@sqnce/core` that forks an accepted run into a new run-id (full copy, or truncated to a chosen main stage), so two run records share upstream state but diverge.

**Architecture:** One new exported pure function in the run-store section of `packages/core/src/index.js`. It deep-copies the source run under `newId`, building the new entry so its `id`, its store key, and `newId` are one value by construction (the silent no-op trap is impossible). Truncation reuses the existing `flattenSubStages` helper to map steps and sub-stages to main-stage indices. Tests live in the run-store suite. No existing function changes.

**Tech Stack:** Plain ESM JavaScript, Node's built-in test runner (`node:test`), JSDoc-to-`.d.ts` via `tsc`.

## Global Constraints

(Every task implicitly includes these.)

- Never use em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- `@sqnce/core` stays dependency-free; plain ESM, no build step in core.
- Core is pure: it never reads the clock or randomness. `now` is always caller-supplied.
- Tests use `node:test` + `node:assert/strict` (Node 20+). `structuredClone` is a global (Node 17+), so it is available.
- All work happens in the worktree: `/mnt/c/Users/dawti/repos/sqnce/.worktrees/67-run-clone-primitive`. Use absolute paths.
- Generated types live under `packages/*/types/` which is gitignored: `npm run types` must pass, but there is nothing to commit from it.
- Run the full suite from the worktree root with `npm test` (it runs `node --test packages/core/test/*.test.js`). Filter one suite with `node --test --test-name-pattern="cloneRun" packages/core/test/runstore.test.js`.

---

### Task 1: `cloneRun` full-fork path

The faithful, definition-free fork: deep-copy the run as-is under a new id, with the fail-loud guards that do not need a definition. This alone satisfies the issue's core acceptance (a clone indistinguishable from a native run, `id === key`, distinct run-id).

**Files:**
- Modify: `packages/core/src/index.js` (add `cloneRun` near `updateRunState` ~941; extend the run-store block comment ~823)
- Test: `packages/core/test/runstore.test.js` (add `cloneRun` to the import block; add the tests below)

**Interfaces:**
- Consumes: existing exports `createRunStore`, `createRunEntry`, `addRun`, `updateRunState`, `setOutput`, `getStepEntry`, `archiveRun`, and the test helper `entryAt(id, workflowId, now)` already in `runstore.test.js`.
- Produces: `cloneRun(store, { fromId, newId, name = "", now }) => RunStore`. Returns a new store with one added entry at key `newId` whose `run` is a deep copy of the source's run. (Task 2 extends the same function with `uptoStageId`/`definition`.)

- [ ] **Step 1: Write the failing tests**

Add `cloneRun` to the import block at the top of `packages/core/test/runstore.test.js` (it imports from `../src/index.js`). Then append these tests:

```js
test("cloneRun full fork copies the run under a new id with id === key", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = updateRunState(s, "r1", setOutput(createRun(), "s1", "facts", { client: "Acme" }), 150);
  s = cloneRun(s, { fromId: "r1", newId: "r2", name: "  variant-a  ", now: 200 });
  const c = s.entries["r2"];
  assert.equal(c.id, "r2");
  assert.equal(c.workflowId, "wf");
  assert.equal(c.status, "active");
  assert.equal(c.name, "variant-a");
  assert.equal(c.createdAt, 200);
  assert.equal(c.updatedAt, 200);
  assert.deepEqual(c.run, s.entries["r1"].run);
  assert.equal(Object.keys(s.entries).length, 2);
});

test("cloneRun leaves the active-run mapping untouched", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  const beforeActive = { ...s.activeRunByWorkflow };
  const beforeWf = s.activeWorkflowId;
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  assert.equal(s.activeWorkflowId, beforeWf);
  assert.deepEqual(s.activeRunByWorkflow, beforeActive);
  assert.equal(s.activeRunByWorkflow["wf"], "r1");
});

test("cloneRun clone is a native run: setOutput advances its own state, not the source", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  const driven = setOutput(s.entries["r2"].run, "s1", "facts", { client: "Beta" });
  s = updateRunState(s, "r2", driven, 300);
  assert.deepEqual(getStepEntry(s.entries["r2"].run, "s1").outputs, { facts: { client: "Beta" } });
  assert.deepEqual(s.entries["r1"].run.stepState, {});
  assert.equal(Object.keys(s.entries).length, 2);
});

test("cloneRun deep-copies: clone and source do not alias", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = updateRunState(s, "r1", {
    idx: 0, frontier: 0,
    stepState: { s1: { checkedDone: false, outputs: { facts: { client: "Acme" } } } },
    skips: { b: true }, forces: { 0: true },
  }, 150);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  const src = s.entries["r1"].run, cl = s.entries["r2"].run;
  assert.notEqual(cl, src);
  assert.notEqual(cl.stepState, src.stepState);
  assert.notEqual(cl.skips, src.skips);
  assert.notEqual(cl.forces, src.forces);
  assert.notEqual(cl.stepState.s1, src.stepState.s1);
});

test("cloneRun forks an archived run into an active clone", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = archiveRun(s, "r1", 150);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  assert.equal(s.entries["r1"].status, "archived");
  assert.equal(s.entries["r2"].status, "active");
});

test("cloneRun throws on unknown fromId", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.throws(() => cloneRun(s, { fromId: "nope", newId: "r2", now: 200 }), /no run with id/);
});

test("cloneRun throws on an existing newId", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 150));
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200 }), /already exists/);
});

test("cloneRun throws on a non-string or empty newId", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "", now: 200 }), /non-empty string/);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "   ", now: 200 }), /non-empty string/);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: 42, now: 200 }), /non-empty string/);
});

test("cloneRun does not mutate the input store", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  const snapshot = structuredClone(s);
  cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  assert.deepEqual(s, snapshot);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="cloneRun" packages/core/test/runstore.test.js`
Expected: FAIL (`cloneRun is not a function` / not exported).

- [ ] **Step 3: Implement the full-fork function**

In `packages/core/src/index.js`, immediately after `updateRunState` (ends ~941), add:

```js
/**
 * Fork a run into a new run-id. Deep-copies the source run under newId and
 * returns a new store the caller can drive normally. The new entry's id,
 * its store key, and newId are one value by construction, so the silent
 * no-op trap (updates landing on the wrong record because entry.id drifted
 * from its key) is impossible. The clone is always active (even from an
 * archived source) and the active-run mapping is left untouched: a consumer
 * that wants the fork open calls setActiveRun itself. Throws rather than
 * silently producing a broken store on bad or colliding input.
 * @param {RunStore} store
 * @param {{ fromId: string, newId: string, name?: string, now: number }} opts
 * @returns {RunStore}
 */
export function cloneRun(store, { fromId, newId, name = "", now }) {
  if (typeof newId !== "string" || !newId.trim())
    throw new Error("cloneRun: newId must be a non-empty string");
  const source = store.entries[fromId];
  if (!source) throw new Error(`cloneRun: no run with id "${fromId}"`);
  if (store.entries[newId]) throw new Error(`cloneRun: a run with id "${newId}" already exists`);
  const entry = {
    id: newId,
    workflowId: source.workflowId,
    name: String(name || "").trim(),
    status: "active",
    createdAt: now,
    updatedAt: now,
    run: structuredClone(source.run),
  };
  return { ...store, entries: { ...store.entries, [newId]: entry } };
}
```

Then extend the run-store block comment (the `/* ... */` block ending ~836, just above `createRunStore`) by appending one sentence before its closing `*/`:

```
 * cloneRun forks an entry into a new id: the new entry's id, its store key,
 * and the newId argument are one value by construction, so updates never
 * silently no-op against a clone, and cloning never changes the active-run
 * mapping (it does not route through addRun).
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --test-name-pattern="cloneRun" packages/core/test/runstore.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (no regressions in engine.test.js or runstore.test.js).

- [ ] **Step 6: Commit**

```bash
cd /mnt/c/Users/dawti/repos/sqnce/.worktrees/67-run-clone-primitive
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "feat(core): cloneRun full-fork path (#67)"
```

---

### Task 2: `cloneRun` truncated-fork path

Extend the function from Task 1 with `uptoStageId` (a main-stage id, requires `definition`): keep accepted work only up to and including that main stage, blank after, with the definition-dependent fail-loud guards.

**Files:**
- Modify: `packages/core/src/index.js` (extend `cloneRun` added in Task 1)
- Test: `packages/core/test/runstore.test.js` (add a multi-main-stage fixture + the tests below; add `createRunEntry` to the import block if not already imported)

**Interfaces:**
- Consumes: `cloneRun(store, { fromId, newId, name, now }) => RunStore` from Task 1; the existing exports `flattenSubStages(definition)` (returns flat sub-stages each carrying `mainIndex` and `steps`), `createRunEntry`, `createRunStore`, `addRun`, `setOutput`, `getStepEntry`, `updateRunState`.
- Produces: the final signature `cloneRun(store, { fromId, newId, name = "", now, uptoStageId, definition }) => RunStore`. When `uptoStageId` is set, the clone's run is `{ idx, frontier, stepState }` plus `skips`/`forces` when non-empty, truncated to main stage `k`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/runstore.test.js`, ensure `createRunEntry` is in the import block. Add a multi-main-stage fixture (place it near the top, after the existing `DEF`):

```js
/* Three-main-stage fixture for truncation. Flat sub-stage indices:
   a0=0, a0x=1 (skippable) in m0; a1=2 in m1; a2=3 in m2. */
const MULTI = {
  id: "multi",
  name: "Multi",
  mainStages: [
    { id: "m0", name: "M0", subStages: [
      { id: "a0", name: "A0", gate: { type: "hybrid" }, steps: [{ id: "p0", name: "P0" }] },
      { id: "a0x", name: "A0x", skippable: true, gate: { type: "hybrid" }, steps: [{ id: "px", name: "PX" }] },
    ] },
    { id: "m1", name: "M1", subStages: [
      { id: "a1", name: "A1", gate: { type: "hybrid" }, steps: [{ id: "p1", name: "P1" }] },
    ] },
    { id: "m2", name: "M2", subStages: [
      { id: "a2", name: "A2", gate: { type: "hybrid" }, steps: [{ id: "p2", name: "P2" }] },
    ] },
  ],
};

const multiSource = () => ({
  idx: 3,
  frontier: 2,
  stepState: {
    p0: { checkedDone: true, outputs: { v: 0 } },
    px: { checkedDone: true, outputs: {} },
    p1: { checkedDone: true, outputs: { v: 1 } },
    p2: { checkedDone: false, outputs: { v: 2 } },
  },
  skips: { a0x: true },
  forces: { 0: true, 1: true },
});

const multiStore = (run) =>
  addRun(createRunStore(), createRunEntry({ id: "r1", workflowId: "multi", run, now: 100 }));
```

Then append these tests:

```js
test("cloneRun truncated fork keeps work up to the fork main stage", () => {
  let s = multiStore(multiSource());
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1", definition: MULTI });
  const r = s.entries["r2"].run;
  assert.equal(r.frontier, 1);
  assert.deepEqual(Object.keys(r.stepState).sort(), ["p0", "p1", "px"]);
  assert.equal(r.idx, 2);
  assert.deepEqual(r.skips, { a0x: true });
  assert.deepEqual(r.forces, { 0: true });
});

test("cloneRun truncated to the current frontier keeps the whole committed prefix", () => {
  let s = multiStore(multiSource());
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m2", definition: MULTI });
  const r = s.entries["r2"].run;
  assert.equal(r.frontier, 2);
  assert.deepEqual(Object.keys(r.stepState).sort(), ["p0", "p1", "p2", "px"]);
  assert.deepEqual(r.forces, { 0: true, 1: true });
  assert.equal(r.idx, 3);
});

test("cloneRun truncated fork drops empty skips/forces maps", () => {
  const run = { idx: 1, frontier: 1, stepState: {
    p0: { checkedDone: true, outputs: {} }, p1: { checkedDone: true, outputs: {} },
  } };
  let s = multiStore(run);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0", definition: MULTI });
  const r = s.entries["r2"].run;
  assert.equal(r.frontier, 0);
  assert.deepEqual(Object.keys(r.stepState), ["p0"]);
  assert.ok(!("skips" in r));
  assert.ok(!("forces" in r));
});

test("cloneRun truncated clone is drivable and isolated from the source", () => {
  let s = multiStore(multiSource());
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1", definition: MULTI });
  const driven = setOutput(s.entries["r2"].run, "p1", "v", 99);
  s = updateRunState(s, "r2", driven, 300);
  assert.equal(getStepEntry(s.entries["r2"].run, "p1").outputs.v, 99);
  assert.equal(s.entries["r1"].run.stepState.p1.outputs.v, 1);
});

test("cloneRun throws when uptoStageId is given without a definition", () => {
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1" }),
    /requires a definition/);
});

test("cloneRun throws when the definition is not the run's workflow", () => {
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1",
    definition: { ...MULTI, id: "other" } }), /not the run's workflow/);
});

test("cloneRun throws on an unknown uptoStageId", () => {
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "ghost",
    definition: MULTI }), /no main stage/);
});

test("cloneRun throws on an ambiguous (duplicate) uptoStageId", () => {
  const dup = { ...MULTI, mainStages: [...MULTI.mainStages,
    { id: "m0", name: "dup", subStages: [{ id: "az", name: "AZ", gate: { type: "hybrid" }, steps: [{ id: "pz", name: "PZ" }] }] }] };
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: dup }), /ambiguous/);
});

test("cloneRun throws when uptoStageId is beyond the frontier", () => {
  const run = { idx: 0, frontier: 0, stepState: { p0: { checkedDone: true, outputs: {} } } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m2",
    definition: MULTI }), /beyond the run frontier/);
});

test("cloneRun throws when the run holds a step absent from the definition", () => {
  const run = { idx: 0, frontier: 0, stepState: {
    p0: { checkedDone: true, outputs: {} }, ghost: { checkedDone: true, outputs: {} },
  } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: MULTI }), /step "ghost" is not in definition/);
});

test("cloneRun throws when a kept skip's sub-stage is no longer skippable", () => {
  const run = { idx: 0, frontier: 0, stepState: { p0: { checkedDone: true, outputs: {} } }, skips: { a0: true } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: MULTI }), /no longer skippable/);
});

test("cloneRun throws when the run holds a skip sub-stage absent from the definition", () => {
  const run = { idx: 0, frontier: 0, stepState: { p0: { checkedDone: true, outputs: {} } }, skips: { ghost: true } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: MULTI }), /skip sub-stage "ghost" is not in definition/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="cloneRun" packages/core/test/runstore.test.js`
Expected: the new truncation tests FAIL (`uptoStageId` ignored, so `frontier`/`stepState` are not truncated and the throws do not fire). The Task 1 full-fork tests still PASS.

- [ ] **Step 3: Extend the function with the truncation branch**

In `packages/core/src/index.js`, change `cloneRun` to add the two new options and the truncation block. Replace the Task 1 body so that the signature and JSDoc become:

```js
/**
 * Fork a run into a new run-id. Deep-copies the source run under newId and
 * returns a new store the caller can drive normally. The new entry's id,
 * its store key, and newId are one value by construction, so the silent
 * no-op trap (updates landing on the wrong record because entry.id drifted
 * from its key) is impossible. The clone is always active (even from an
 * archived source) and the active-run mapping is left untouched: a consumer
 * that wants the fork open calls setActiveRun itself.
 *
 * With uptoStageId (a main-stage id, requires definition), the clone keeps
 * accepted work only up to and including that main stage; later stages are
 * blank, idx lands on the first sub-stage of the fork stage, the force at
 * the fork stage's own outgoing boundary is dropped, and skips/forces past
 * the fork stage are dropped. The supplied definition must be the run's own
 * workflow and must currently describe every retained step and kept skip.
 * Throws rather than silently producing a broken store on bad, colliding,
 * mismatched, or too-far input.
 * @param {RunStore} store
 * @param {{ fromId: string, newId: string, name?: string, now: number, uptoStageId?: string, definition?: Definition }} opts
 * @returns {RunStore}
 */
export function cloneRun(store, { fromId, newId, name = "", now, uptoStageId, definition }) {
  if (typeof newId !== "string" || !newId.trim())
    throw new Error("cloneRun: newId must be a non-empty string");
  const source = store.entries[fromId];
  if (!source) throw new Error(`cloneRun: no run with id "${fromId}"`);
  if (store.entries[newId]) throw new Error(`cloneRun: a run with id "${newId}" already exists`);

  let run = structuredClone(source.run);

  if (uptoStageId !== undefined) {
    if (!definition) throw new Error("cloneRun: uptoStageId requires a definition");
    if (definition.id !== source.workflowId)
      throw new Error(
        `cloneRun: definition "${definition.id}" is not the run's workflow "${source.workflowId}"`
      );
    const matches = (definition.mainStages || []).reduce(
      (acc, ms, i) => (ms.id === uptoStageId ? [...acc, i] : acc),
      []
    );
    if (matches.length === 0) throw new Error(`cloneRun: no main stage "${uptoStageId}"`);
    if (matches.length > 1)
      throw new Error(`cloneRun: main stage "${uptoStageId}" is ambiguous (${matches.length} matches)`);
    const k = matches[0];
    if (k > run.frontier)
      throw new Error(
        `cloneRun: uptoStageId "${uptoStageId}" (stage ${k}) is beyond the run frontier ${run.frontier}`
      );

    const subs = flattenSubStages(definition);
    const stepMain = new Map();
    subs.forEach((ss) => (ss.steps || []).forEach((st) => stepMain.set(st.id, ss.mainIndex)));
    const subMain = new Map(subs.map((ss) => [ss.id, ss.mainIndex]));
    const skippable = new Map(subs.map((ss) => [ss.id, !!ss.skippable]));

    const stepState = {};
    for (const [stepId, entry] of Object.entries(run.stepState)) {
      if (!stepMain.has(stepId))
        throw new Error(`cloneRun: step "${stepId}" is not in definition "${definition.id}"`);
      if (stepMain.get(stepId) <= k) stepState[stepId] = entry;
    }

    const skips = {};
    for (const subId of Object.keys(run.skips || {})) {
      if (!subMain.has(subId))
        throw new Error(`cloneRun: skip sub-stage "${subId}" is not in definition "${definition.id}"`);
      if (subMain.get(subId) <= k) {
        if (!skippable.get(subId)) throw new Error(`cloneRun: sub-stage "${subId}" is no longer skippable`);
        skips[subId] = true;
      }
    }

    const forces = {};
    for (const i of Object.keys(run.forces || {})) {
      if (Number(i) < k) forces[i] = true;
    }

    run = { idx: subs.findIndex((ss) => ss.mainIndex === k), frontier: k, stepState };
    if (Object.keys(skips).length) run.skips = skips;
    if (Object.keys(forces).length) run.forces = forces;
  }

  const entry = {
    id: newId,
    workflowId: source.workflowId,
    name: String(name || "").trim(),
    status: "active",
    createdAt: now,
    updatedAt: now,
    run,
  };
  return { ...store, entries: { ...store.entries, [newId]: entry } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --test-name-pattern="cloneRun" packages/core/test/runstore.test.js`
Expected: PASS (all full-fork and truncation tests, 21 total).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
cd /mnt/c/Users/dawti/repos/sqnce/.worktrees/67-run-clone-primitive
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "feat(core): cloneRun truncated-fork path (#67)"
```

---

### Task 3: docs note and type generation

Record the behavior in `CLAUDE.md` and verify the public type surface emits.

**Files:**
- Modify: `CLAUDE.md` (add one key-behavior bullet)

**Interfaces:**
- Consumes: the final `cloneRun` signature from Task 2.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the CLAUDE.md key-behavior note**

In `CLAUDE.md`, under "## Key behaviors to preserve", add this bullet at the end of the list (no em dashes):

```markdown
- `cloneRun(store, { fromId, newId, name, now, uptoStageId, definition })` forks a run into a distinct run-id, deep-copying the accepted run (full, or truncated to and including a main stage via `uptoStageId` + `definition`). The new entry's id equals its store key equals `newId` by construction, so state updates never silently no-op against a clone; the clone is always active and the active-run mapping is untouched (it does not route through `addRun`). It throws on a bad or colliding `newId`, an unknown `fromId`, a definition that is not the run's workflow, an unknown or ambiguous `uptoStageId`, an `uptoStageId` beyond the frontier, or a retained step or kept skip the definition no longer describes.
```

- [ ] **Step 2: Verify the type surface emits**

Run: `npm run types`
Expected: exits 0 (no TypeScript/JSDoc errors). Then confirm the declaration includes the new export:

Run: `grep -n "cloneRun" packages/core/types/index.d.ts`
Expected: a line declaring `export function cloneRun(...)`. (The `types/` dir is gitignored, so there is nothing to commit from this step.)

- [ ] **Step 3: Run the full suite once more**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /mnt/c/Users/dawti/repos/sqnce/.worktrees/67-run-clone-primitive
git add CLAUDE.md
git commit -m "docs: record cloneRun behavior in CLAUDE.md (#67)"
```

---

## Task routing (for the orchestrator)

- **Task 1 (full-fork path):** `delegate: sonnet`. Single-file core change, verbatim deep copy plus three guards and entry construction, with a complete prescriptive test matrix.
- **Task 2 (truncated-fork path):** `delegate: opus`. Intricate core-engine arithmetic (keep/drop by main-stage index, idx landing, forces/skips filtering) and eight fail-loud guards with subtle edge cases.
- **Task 3 (docs + types):** `delegate: haiku`. Mechanical one-bullet doc edit plus a type-generation verification, exact wording supplied.

## Self-review notes

- **Spec coverage:** full fork (Task 1), truncated fork incl. `idx`/`frontier`/`stepState`/`skips`/`forces` rules (Task 2), all eleven throw conditions (newId non-empty + unknown fromId + collision in Task 1; no-definition, workflow mismatch, unknown stage, ambiguous stage, beyond-frontier, absent step, absent skip, non-skippable kept skip in Task 2), the `id === key` no-op regression (Task 1 "native run" test), isolation assertions (Task 1 "deep-copies" test), archived-source-to-active (Task 1), CLAUDE.md note and type emission (Task 3). The README needs no change (verified in the spec).
- **Type consistency:** the function is named `cloneRun` throughout; the final signature `{ fromId, newId, name, now, uptoStageId, definition }` in Task 2 supersedes Task 1's `{ fromId, newId, name, now }` on the same function; test helpers `multiStore`/`multiSource`/`MULTI` are defined in Task 2 before use.
- **No placeholders:** every code and test step shows the exact content.
