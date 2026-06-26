# Skip Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `@sqnce/core` sub-stage skip primitive a source (a person vs an orchestration policy) and a fixed user-over-auto precedence, so an orchestration layer can auto-skip and safely re-evaluate without clobbering a manual choice.

**Architecture:** A `skips` map entry grows from a bare `true` to either `true` (the canonical and legacy user-skip shape) or `{ source: "user" | "auto", skipped: boolean }`. The resolved read `isSubStageSkipped` hides the bookkeeping, so every existing caller is unchanged. The two manual operations keep their signatures (a manual unskip now records a durable keep-in instead of deleting), and two new automated operations defer to any user decision and are safe to re-run.

**Tech Stack:** Plain ESM JavaScript, no build step in `core`. Tests use Node's built-in runner (`node:test`, Node 20+), checked with checkJs via `npm run types`.

## Global Constraints

- Engine stays pure and dependency-free; no UI, no renderer/validator coupling into `@sqnce/core` except as arguments. (`CLAUDE.md`)
- Never use em dashes anywhere (code, comments, docs, commit messages). Brand is lowercase `sqnce`. License Apache-2.0. (`CLAUDE.md`)
- No run-store version bump and no migration: legacy `skips[id] = true` must keep resolving as a (user) skip. Store stays `version: 3`. (spec)
- Per-PR gates, all must pass: `npm test`, `npm run build -w examples/demo`, `npm run types`. (`CLAUDE.md`)
- All work happens in the worktree `/home/dawti/dev/sqnce-worktrees/74-skip-provenance` on branch `74-skip-provenance`. Run every command from that directory.
- `npm test` runs `node --test packages/core/test/*.test.js packages/react/test/*.test.js` (engine + runstore + react), so new core tests in either `engine.test.js` or `runstore.test.js` are in the gate.

---

### Task 1: Resolved read and the `SkipEntry` type

Teach `isSubStageSkipped` to resolve the four states, add the `SkipEntry` typedef, widen the `Run` typedef, and update the file-header run-shape note. No writer produces the object shape yet; the read is tested against hand-built runs.

**Files:**
- Modify: `packages/core/src/index.js` (the `isSubStageSkipped` function ~line 618; the `Run` typedef ~line 140; the file-header comment ~line 41)
- Test: `packages/core/test/engine.test.js` (skip suite)

**Interfaces:**
- Produces: `isSubStageSkipped(run, subStageId) -> boolean` resolving `true`, `{source,skipped}`, absent, and unknown shapes. A `SkipEntry` typedef: `true | { source: "user" | "auto", skipped: boolean }`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/engine.test.js` (anywhere in the skip suite, e.g. after the existing `skipSubStage records only legal skips` test):

```js
test("isSubStageSkipped resolves legacy, object, and absent skip entries", () => {
  const base = createRun();
  assert.equal(isSubStageSkipped(base, "collect"), false); // absent
  assert.equal(isSubStageSkipped({ ...base, skips: { collect: true } }, "collect"), true); // legacy user skip
  assert.equal(
    isSubStageSkipped({ ...base, skips: { collect: { source: "auto", skipped: true } } }, "collect"),
    true
  );
  assert.equal(
    isSubStageSkipped({ ...base, skips: { collect: { source: "user", skipped: false } } }, "collect"),
    false // a keep-in resolves as not skipped
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --test-name-pattern="resolves legacy, object, and absent" packages/core/test/engine.test.js`
Expected: FAIL (the object-valued entry `{ source: "auto", skipped: true }` currently makes the truthy `run.skips[id]` return `true`, but the keep-in `{ source: "user", skipped: false }` is also truthy, so `isSubStageSkipped` wrongly returns `true` for the keep-in case — assertion fails on the keep-in line).

- [ ] **Step 3: Replace `isSubStageSkipped`**

In `packages/core/src/index.js`, replace the body of `isSubStageSkipped` (currently `return !!(run.skips && run.skips[subStageId]);`):

```js
export function isSubStageSkipped(run, subStageId) {
  const entry = run.skips ? run.skips[subStageId] : undefined;
  if (entry === true) return true;
  return !!(entry && entry.skipped === true);
}
```

- [ ] **Step 4: Add the `SkipEntry` typedef and widen `Run.skips`**

Immediately before the `Run` typedef block (the `/** @typedef {Object} Run` comment), add:

```js
/**
 * A skip entry records who set a sub-stage's skip. `true` is the legacy and
 * canonical shape for a user skip; the object form distinguishes an
 * orchestration policy's skip (`source: "auto"`) from a person's keep-in
 * (`source: "user", skipped: false`).
 * @typedef {true | { source: "user" | "auto", skipped: boolean }} SkipEntry
 */
```

In the `Run` typedef, change the `skips` line from `@property {Object<string, true>} [skips]` to:

```js
 * @property {Object<string, SkipEntry>} [skips]
```

- [ ] **Step 5: Update the file-header run-shape note**

In the file-header comment, replace the `skips` description (the sentence beginning "`skips` maps sub-stage id -> true for sub-stages this run marked not applicable") with:

```
 *    `skips` maps sub-stage id -> a skip entry recording who set it:
 *    `true` (a user skip, also the legacy shape) or
 *    { source: "user" | "auto", skipped } telling a person's decision
 *    from an orchestration policy's. A user decision wins: an auto
 *    operation never overrides it. isSubStageSkipped resolves an entry
 *    to its effective boolean; a skipped sub-stage is excluded from
 *    boundary gates, runSummary, and draft context. `forces` maps
```

(Keep the rest of the `forces` sentence that follows.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test --test-name-pattern="resolves legacy, object, and absent" packages/core/test/engine.test.js`
Expected: PASS

- [ ] **Step 7: Run the full engine suite to confirm no regression**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS, all existing tests still green (manual skip still resolves; nothing writes the object shape yet).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): resolve skip entries by provenance in isSubStageSkipped (#74)"
```

---

### Task 2: Durable manual operations

Make a manual skip take ownership over an automated entry (writing `true`), and make a manual unskip record a durable keep-in instead of deleting. Align unskip's guards to skip's. Rewrite the one existing test that asserted the old delete behavior.

**Files:**
- Modify: `packages/core/src/index.js` (`skipSubStage` ~line 643; `unskipSubStage` ~line 670)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `isSubStageSkipped`, `normalizeFlat`, `reachableFlat` (existing).
- Produces: `skipSubStage(run, subStages, subStageId) -> Run` writing `true`, overriding auto/keep-in; `unskipSubStage(run, subStages, subStageId) -> Run` writing `{ source: "user", skipped: false }`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/engine.test.js`, **replace** the existing test `test("unskip restores state and drops the empty map", ...)` (it asserts the old delete-and-drop behavior) with:

```js
test("a manual keep-in is durable and never touches stepState", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  run = skipSubStage(run, subs, "collect"); // user skip
  assert.equal(isSubStageSkipped(run, "collect"), true);
  assert.equal(getStepEntry(run, "evidence").outputs.doc.name, "report.pdf"); // skip never touches stepState
  run = unskipSubStage(run, subs, "collect"); // manual keep-in: records, does not delete
  assert.equal(isSubStageSkipped(run, "collect"), false);
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
  const collect = subs.find((s) => s.id === "collect");
  const evidence = collect.steps.find((s) => s.id === "evidence");
  assert.equal(stepHasAnyOutput(evidence, getStepEntry(run, "evidence")), true); // outputs survive
});

test("a manual keep-in on a never-decided sub-stage records a durable include", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = unskipSubStage(createRun(), subs, "collect");
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
  assert.equal(isSubStageSkipped(run, "collect"), false);
});

test("a manual skip takes ownership of an auto-skipped sub-stage", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = { ...createRun(), skips: { collect: { source: "auto", skipped: true } } };
  run = skipSubStage(run, subs, "collect"); // manual skip overrides the auto entry
  assert.equal(run.skips.collect, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="manual keep-in|takes ownership" packages/core/test/engine.test.js`
Expected: FAIL (today `unskipSubStage` deletes the entry, so `run.skips.collect` is `undefined`, not the keep-in object; `skipSubStage` over an auto entry returns early because `isSubStageSkipped` is already true, leaving the auto object instead of `true`).

- [ ] **Step 3: Replace `skipSubStage`**

In `packages/core/src/index.js`, replace `skipSubStage`'s final two lines (the `if (isSubStageSkipped(r, subStageId)) return r;` guard and the return) so the whole function reads:

```js
export function skipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const idx = subStages.findIndex((s) => s.id === subStageId);
  const sub = idx === -1 ? null : subStages[idx];
  if (!sub || !sub.skippable) return r;
  if (!reachableFlat(subStages, r).includes(idx)) return r;
  if (r.skips && r.skips[subStageId] === true) return r; // already a user skip (idempotent)
  return { ...r, skips: { ...r.skips, [subStageId]: true } };
}
```

- [ ] **Step 4: Replace `unskipSubStage`**

Replace the whole `unskipSubStage` function with:

```js
export function unskipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const idx = subStages.findIndex((s) => s.id === subStageId);
  const sub = idx === -1 ? null : subStages[idx];
  if (!sub || !sub.skippable) return r;
  if (!reachableFlat(subStages, r).includes(idx)) return r;
  const entry = r.skips && r.skips[subStageId];
  if (entry && entry !== true && entry.source === "user" && entry.skipped === false) return r; // already a keep-in
  return { ...r, skips: { ...r.skips, [subStageId]: { source: "user", skipped: false } } };
}
```

Also update the JSDoc above `unskipSubStage` to describe the new behavior (replace the "Undo a skip. Returns a new run with the entry removed..." comment):

```js
/**
 * Record a durable manual keep-in: the person wants this sub-stage in, and a
 * later automated re-evaluation cannot re-skip it. Returns a new run with
 * skips[subStageId] = { source: "user", skipped: false }. No-op (the normalized
 * run) when the id is unknown, not declared skippable, beyond the committed
 * region, or already a keep-in. Never touches stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test --test-name-pattern="manual keep-in|takes ownership" packages/core/test/engine.test.js`
Expected: PASS

- [ ] **Step 6: Run the full engine suite**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS (the idempotent double-skip test still holds; the rewritten keep-in test replaces the old delete test).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): durable manual keep-in and skip ownership over auto (#74)"
```

---

### Task 3: Automated operations

Add `autoSkipSubStage` and `clearAutoSkipSubStage`: an apply/clear pair that defers to any user decision and is safe to re-run.

**Files:**
- Modify: `packages/core/src/index.js` (add two functions after `unskipSubStage`)
- Test: `packages/core/test/engine.test.js` (add imports + tests)

**Interfaces:**
- Consumes: `normalizeFlat`, `reachableFlat`, `isSubStageSkipped` (existing); `mainGateProgress`, `setOutput`, `setCheckedDone` (already imported in the test).
- Produces: `autoSkipSubStage(run, subStages, subStageId) -> Run`; `clearAutoSkipSubStage(run, subStages, subStageId) -> Run`.

- [ ] **Step 1: Add the imports and write the failing tests**

In `packages/core/test/engine.test.js`, add `autoSkipSubStage,` and `clearAutoSkipSubStage,` to the import block from `../src/index.js` (next to `skipSubStage`). Then add:

```js
test("autoSkipSubStage applies, is idempotent, and yields to a user decision", () => {
  const subs = flattenSubStages(FIXTURE);
  const once = autoSkipSubStage(createRun(), subs, "collect");
  assert.deepEqual(once.skips.collect, { source: "auto", skipped: true });
  assert.equal(isSubStageSkipped(once, "collect"), true);
  const twice = autoSkipSubStage(once, subs, "collect");
  assert.equal(twice, once); // idempotent: same reference, no cumulative effect

  const userSkip = skipSubStage(createRun(), subs, "collect"); // user skip -> true
  assert.equal(autoSkipSubStage(userSkip, subs, "collect").skips.collect, true); // user wins
});

test("a manual keep-in survives repeated auto re-evaluation", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = autoSkipSubStage(createRun(), subs, "collect");
  run = unskipSubStage(run, subs, "collect"); // person keeps it in
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
  run = autoSkipSubStage(run, subs, "collect"); // signal still says skip; re-evaluate
  assert.equal(isSubStageSkipped(run, "collect"), false); // keep-in wins
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
});

test("clearAutoSkipSubStage clears only an auto skip and never a user decision", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = autoSkipSubStage(createRun(), subs, "collect");
  run = clearAutoSkipSubStage(run, subs, "collect");
  assert.equal(isSubStageSkipped(run, "collect"), false);
  assert.equal(run.skips, undefined); // map dropped when empty
  assert.equal(clearAutoSkipSubStage(run, subs, "collect"), run); // idempotent no-op

  const userSkip = skipSubStage(createRun(), subs, "collect");
  assert.equal(clearAutoSkipSubStage(userSkip, subs, "collect").skips.collect, true); // user skip untouched
});

test("the automated operations respect the skip guards", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun();
  assert.equal(autoSkipSubStage(run, subs, "nope"), run); // unknown id
  assert.equal(autoSkipSubStage(run, subs, "start"), run); // not skippable
  const def = {
    id: "d", name: "D",
    mainStages: [
      { id: "m1", subStages: [{ id: "a", name: "A", steps: [] }] },
      { id: "m2", subStages: [{ id: "b", name: "B", skippable: true, steps: [] }] },
    ],
  };
  const subs2 = flattenSubStages(def);
  const fresh = createRun();
  assert.equal(autoSkipSubStage(fresh, subs2, "b"), fresh); // m2 beyond frontier
});

test("an auto skip is excluded from the boundary gate; a keep-in is included", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], run).met, false); // collect still open
  const autoRun = autoSkipSubStage(run, subs, "collect");
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], autoRun).met, true); // auto skip excludes collect
  const keptRun = unskipSubStage(autoRun, subs, "collect");
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], keptRun).met, false); // keep-in re-includes collect
});
```

Note on the guard test: `autoSkipSubStage(createRun(), subs2, "b")` and `createRun()` are compared by `assert.equal`; both are freshly normalized fresh runs, so the no-op path returns a structurally identical normalized run. If `assert.equal` (reference) is too strict here, assert `isSubStageSkipped(autoSkipSubStage(createRun(), subs2, "b"), "b") === false` instead; the existing `skipSubStage` beyond-frontier test uses reference equality successfully, so prefer matching that style first.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="autoSkipSubStage|auto re-evaluation|clearAutoSkipSubStage|automated operations respect|excluded from the boundary" packages/core/test/engine.test.js`
Expected: FAIL with `autoSkipSubStage is not defined` (and `clearAutoSkipSubStage is not defined`).

- [ ] **Step 3: Add `autoSkipSubStage` and `clearAutoSkipSubStage`**

In `packages/core/src/index.js`, immediately after `unskipSubStage`, add:

```js
/**
 * Apply an automated skip (orchestration policy). No-op (the normalized run)
 * when the id is unknown, not declared skippable, beyond the committed region,
 * when a user decision is already recorded (the user wins), or when an
 * automated skip is already set (idempotent). Never touches stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function autoSkipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const idx = subStages.findIndex((s) => s.id === subStageId);
  const sub = idx === -1 ? null : subStages[idx];
  if (!sub || !sub.skippable) return r;
  if (!reachableFlat(subStages, r).includes(idx)) return r;
  const entry = r.skips && r.skips[subStageId];
  if (entry === true || (entry && entry.source === "user")) return r; // user wins
  if (entry && entry.source === "auto" && entry.skipped === true) return r; // already auto-skipped
  return { ...r, skips: { ...r.skips, [subStageId]: { source: "auto", skipped: true } } };
}

/**
 * Clear an automated skip. Removes the entry only when it is an automated skip,
 * dropping the skips field when it empties. A user decision or an absent entry
 * is a no-op (a user choice is never touched). Idempotent. Never touches
 * stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function clearAutoSkipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const entry = r.skips && r.skips[subStageId];
  if (!entry || entry === true || entry.source !== "auto") return r;
  const skips = { ...r.skips };
  delete skips[subStageId];
  const next = { ...r, skips };
  if (!Object.keys(skips).length) delete next.skips;
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --test-name-pattern="autoSkipSubStage|auto re-evaluation|clearAutoSkipSubStage|automated operations respect|excluded from the boundary" packages/core/test/engine.test.js`
Expected: PASS. (If the guard test's reference-equality assertion fails, switch that one line to the `isSubStageSkipped(...) === false` form as noted in Step 1.)

- [ ] **Step 5: Run the full engine suite**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): add autoSkipSubStage and clearAutoSkipSubStage (#74)"
```

---

### Task 4: Preserve provenance through the sanitizer and cloneRun

The relation-set sanitizer and `cloneRun` truncation currently coerce skip values to `true`. Change both to copy the value, and widen their local type annotations. Add tests proving an auto skip and a keep-in survive.

**Files:**
- Modify: `packages/core/src/index.js` (relation-set sanitizer ~line 844; `cloneRun` truncation ~line 1569)
- Test: `packages/core/test/engine.test.js` (sanitizer), `packages/core/test/runstore.test.js` (cloneRun)

**Interfaces:**
- Consumes: the `SkipEntry` typedef from Task 1.
- Produces: a sanitized validator-visible run and a cloned run that both retain skip provenance.

- [ ] **Step 1: Write the failing sanitizer test**

In `packages/core/test/engine.test.js`, after the existing test `"a scoped validator run hides sibling trackFrontier/skips, omits skippedTracks, and sets idx to the step"`, add:

```js
test("a scoped validator run preserves an in-scope skip's provenance value", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open
  r = setOutput(r, "respDraft", "d", "ok");
  // an in-scope spine skip carrying provenance must reach the validator intact
  r = { ...r, skips: { "intake-sub": { source: "auto", skipped: true } } };
  let seen;
  const validators = {
    inspect: (_v, _spec, ctx) => {
      seen = ctx.run && ctx.run.skips && ctx.run.skips["intake-sub"];
      return null;
    },
  };
  const def = clone(FORKED);
  def.mainStages[5].subStages[0].steps[0].outputs[0].validate = "inspect"; // respDraft (response track)
  const dsubs = flattenSubStages(def);
  gateProgress(dsubs.find((s) => s.id === "resp-draft-sub"), r, { validators, subStages: dsubs });
  assert.deepEqual(seen, { source: "auto", skipped: true }); // value preserved, not coerced to true
});
```

- [ ] **Step 2: Write the failing cloneRun tests**

In `packages/core/test/runstore.test.js`, after the test `"cloneRun truncated fork drops empty skips/forces maps"`, add:

```js
test("cloneRun preserves skip provenance on a full clone", () => {
  const run = { idx: 1, frontier: 0, stepState: { p0: { checkedDone: true, outputs: {} } },
    skips: { a0x: { source: "auto", skipped: true } } };
  let s = multiStore(run);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  assert.deepEqual(s.entries["r2"].run.skips, { a0x: { source: "auto", skipped: true } });
});

test("cloneRun truncation preserves a kept skip's provenance value", () => {
  const run = { idx: 3, frontier: 2, stepState: {
      p0: { checkedDone: true, outputs: {} }, px: { checkedDone: true, outputs: {} },
      p1: { checkedDone: true, outputs: {} }, p2: { checkedDone: false, outputs: {} } },
    skips: { a0x: { source: "auto", skipped: true } }, forces: { 0: true } };
  let s = multiStore(run);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1", definition: MULTI });
  assert.deepEqual(s.entries["r2"].run.skips, { a0x: { source: "auto", skipped: true } }); // not coerced to true
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="preserves an in-scope skip|preserves skip provenance|preserves a kept skip" packages/core/test/engine.test.js packages/core/test/runstore.test.js`
Expected: FAIL (the sanitizer and cloneRun both write `true`, so `seen` is `true` and the cloned `skips.a0x` is `true`, not the object).

- [ ] **Step 4: Fix the relation-set sanitizer**

In `packages/core/src/index.js`, in the relation-set sanitizer, change the local annotation and the copy. Find:

```js
  /** @type {Object<string, true>} */
  const skips = {};
  Object.keys(r.skips || {}).forEach((sub) => {
    const s = subStages.find((x) => x.id === sub);
    // allowlist: keep only known, in-scope sub-stage skips
    if (s && inScope(s.mainIndex)) skips[sub] = true;
  });
```

Replace with:

```js
  /** @type {Object<string, SkipEntry>} */
  const skips = {};
  Object.keys(r.skips || {}).forEach((sub) => {
    const s = subStages.find((x) => x.id === sub);
    // allowlist: keep only known, in-scope sub-stage skips, preserving provenance
    if (s && inScope(s.mainIndex)) skips[sub] = r.skips[sub];
  });
```

- [ ] **Step 5: Fix `cloneRun` truncation**

In `cloneRun`, find:

```js
    /** @type {Object<string, true>} */
    const skips = {};
    for (const subId of Object.keys(run.skips || {})) {
      if (!subMain.has(subId))
        throw new Error(`cloneRun: skip sub-stage "${subId}" is not in definition "${definition.id}"`);
      if (subMain.get(subId) <= k) {
        if (!skippable.get(subId)) throw new Error(`cloneRun: sub-stage "${subId}" is no longer skippable`);
        skips[subId] = true;
      }
    }
```

Replace the annotation and the assignment line:

```js
    /** @type {Object<string, SkipEntry>} */
    const skips = {};
    for (const subId of Object.keys(run.skips || {})) {
      if (!subMain.has(subId))
        throw new Error(`cloneRun: skip sub-stage "${subId}" is not in definition "${definition.id}"`);
      if (subMain.get(subId) <= k) {
        if (!skippable.get(subId)) throw new Error(`cloneRun: sub-stage "${subId}" is no longer skippable`);
        skips[subId] = run.skips[subId];
      }
    }
```

(The unknown-id and no-longer-skippable throws are unchanged; the existing tests for both still pass.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test --test-name-pattern="preserves an in-scope skip|preserves skip provenance|preserves a kept skip" packages/core/test/engine.test.js packages/core/test/runstore.test.js`
Expected: PASS

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS (engine + runstore + react), including the existing cloneRun truncation tests that assert `skips: { a0x: true }` (a legacy `true` is still preserved as `true`).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js packages/core/test/runstore.test.js
git commit -m "feat(core): preserve skip provenance through sanitizer and cloneRun (#74)"
```

---

### Task 5: Docs and full gate

Update `README.md` and `CLAUDE.md` for the richer skip shape and precedence, then run all three per-PR gates.

**Files:**
- Modify: `README.md` (run-shape block ~line 26), `CLAUDE.md` (Architecture run-shape ~line 23; Key behaviors skip line ~line 31)

- [ ] **Step 1: Update `README.md`**

The run-shape pseudo-block already reads `skips?, forces? }`; leave the shape line. Update the UI bullet `skippable sub-stages can be marked not applicable` to note provenance by replacing it with:

```
  skippable sub-stages can be marked not applicable (a manual choice
  always wins over an orchestration policy's auto-skip)
```

- [ ] **Step 2: Update `CLAUDE.md` Architecture run-shape line**

In the Engine bullet (item 2), change `plus optional \`skips\` (sub-stage id -> true) and \`forces\` (main-stage index -> true) maps` to:

```
plus optional `skips` (sub-stage id -> a skip entry: `true` for a user skip, or `{ source: "user" | "auto", skipped }` distinguishing a person's decision from an orchestration policy's, user-over-auto) and `forces` (main-stage index -> true) maps
```

- [ ] **Step 3: Update the `CLAUDE.md` Key behaviors skip line**

Replace the bullet beginning `Sub-stages declared \`skippable: true\` can be marked not applicable per run:` with a version that records provenance (keep the existing first two sentences, append the precedence rule):

```
- Sub-stages declared `skippable: true` can be marked not applicable per run: excluded from the boundary aggregate, `runSummary`, and draft context; skip and unskip never touch `stepState`. Skips of unknown, non-skippable, or beyond-frontier sub-stages are no-ops. A skip carries provenance (#74): `isSubStageSkipped` resolves an entry (`true` = a user skip, also the legacy shape; `{ source, skipped }` for an auto skip or a durable user keep-in) to its effective boolean. A user decision always wins: `autoSkipSubStage`/`clearAutoSkipSubStage` defer to any user skip or keep-in and are idempotent, while the manual `skipSubStage`/`unskipSubStage` take ownership (a manual unskip records a durable keep-in instead of deleting). Legacy `skips[id] = true` still reads as skipped; `cloneRun` and the relation-set sanitizer preserve the value.
```

- [ ] **Step 4: Run all three per-PR gates**

Run: `npm test`
Expected: PASS (all core + react tests).

Run: `npm run build -w examples/demo`
Expected: the demo build completes with no error (exit 0).

Run: `npm run types`
Expected: exits clean (checkJs accepts the widened `SkipEntry` union and the regenerated `.d.ts` reflect the new `skips` type and the two new exported functions). If `tsc` is not installed locally, note that CI runs the real check; confirm the changed signatures are only additive (two new exports) plus the widened `skips` type.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md packages/core/types packages/react/types 2>/dev/null; git add README.md CLAUDE.md
git commit -m "docs(claude): skip provenance run-shape and user-over-auto precedence (#74)"
```

(The generated `.d.ts` under `packages/*/types` are gitignored, so only `README.md` and `CLAUDE.md` land; the `git add` of `types` is a harmless no-op if ignored.)

---

## Self-Review

**Spec coverage:**
- Four states + resolved read: Task 1. ✅
- Two new automated ops, manual ops keep signatures, durable keep-in: Tasks 2-3. ✅
- User-over-auto precedence, idempotent auto-apply/clear: Task 3 tests. ✅
- Legacy `true` reads as skipped; no version bump: Task 1 test + unchanged store. ✅
- cloneRun + relation-set preserve provenance; throw on no-longer-skippable retained entry: Task 4 (the existing throw test is untouched and still passes). ✅
- JSDoc `skips` type widened (Run typedef + two local annotations) for `npm run types`: Tasks 1 and 4. ✅
- Docs (core header, README, CLAUDE.md): Tasks 1 and 5. ✅
- Out of scope (per-step skippability, reset-to-neutral op, track-skip provenance, UI/demo surface): not implemented, correct. ✅

**Placeholder scan:** No TBD/TODO; every code step shows the real code; every command has expected output.

**Type consistency:** `autoSkipSubStage`, `clearAutoSkipSubStage`, `isSubStageSkipped`, `skipSubStage`, `unskipSubStage`, `SkipEntry` are used with identical names and signatures across tasks. The `skips` entry shape `{ source: "user" | "auto", skipped: boolean }` is identical everywhere.
