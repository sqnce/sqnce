# skippable sub-stages implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author-declared skippable sub-stages with first-class per-run "not applicable" marking, plus recording of both skips and forced advances in run state, per `docs/specs/5-skippable-substages.md`.

**Architecture:** All semantics land in `@sqnce/core` as pure functions (two new optional run-state maps, exclusion in the aggregate gate, draft context, and run summary). The rolodex consumes them through four new core exports. Content and docs follow.

**Tech Stack:** Plain ESM JavaScript, `node:test`, React (JSX via esbuild check), no new dependencies. Core stays dependency-free.

**Worktree:** `.worktrees/5-skippable-substages` (all commands below run there). Tests: `npm test`. TDD is mandatory for every core change: write the failing test, see it fail, implement, see it pass, commit.

**Files touched overall:**
- Modify: `packages/core/src/index.js` (validation, run-state functions, gating, context, summary, header comment, JSDoc typedefs)
- Modify: `packages/core/test/engine.test.js` (new tests, new imports)
- Modify: `packages/core/test/fixtures/workflow.js` (skippable sub-stage, coverage comment)
- Modify: `packages/react/src/ProcessRolodex.jsx` (skip control, skipped card state, forced marker, pips, CSS)
- Modify: `definitions/presales.json` (Orals Prep skippable)
- Modify: `README.md`, `packages/react/README.md`, `CLAUDE.md` (run shape, behavior bullets)

---

### Task 1: validation, `skippable` flag and duplicate sub-stage ids `inline`

**Files:**
- Modify: `packages/core/src/index.js` (validateDefinition, SubStage typedef)
- Modify: `packages/core/test/engine.test.js`
- Modify: `packages/core/test/fixtures/workflow.js`

- [ ] **Step 1: Add `skippable: true` to the fixture's `collect` sub-stage and extend its coverage comment**

In `packages/core/test/fixtures/workflow.js`, change the header comment line listing the coverage floor from:

```js
 * stages, three sub-stages, both gate types, all five output types,
```

to:

```js
 * stages, three sub-stages, both gate types, a skippable sub-stage,
 * all five output types,
```

and change the `collect` sub-stage opening from:

```js
        {
          id: "collect",
          name: "Collect",
          description: "Gather and summarize evidence.",
          gate: { type: "hybrid" },
```

to:

```js
        {
          id: "collect",
          name: "Collect",
          description: "Gather and summarize evidence.",
          skippable: true,
          gate: { type: "hybrid" },
```

- [ ] **Step 2: Write the failing validation test**

Append to `packages/core/test/engine.test.js`:

```js
test("validateDefinition checks skippable and duplicate sub-stage ids", () => {
  const mk = (subStages) => ({ id: "d", name: "D", mainStages: [{ id: "m", subStages }] });
  assert.deepEqual(validateDefinition(mk([{ id: "s", skippable: true, steps: [] }])), []);
  assert.ok(
    validateDefinition(mk([{ id: "s", skippable: "yes", steps: [] }])).some((p) =>
      p.includes("skippable")
    )
  );
  assert.ok(
    validateDefinition(mk([{ id: "s", steps: [] }, { id: "s", steps: [] }])).some((p) =>
      p.includes('duplicate sub-stage id "s"')
    )
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: the new test FAILS (no `skippable` or duplicate-id problems are reported yet); all prior tests pass.

- [ ] **Step 4: Implement the validation checks**

In `packages/core/src/index.js`, in `validateDefinition`, add a sub-stage id set next to the existing `stepIds` set:

```js
  const stepIds = new Set();
  const subStageIds = new Set();
```

and extend the sub-stage loop. Change:

```js
    (ms.subStages || []).forEach((ss, si) => {
      if (!ss.id) problems.push(`mainStages[${mi}].subStages[${si}].id is required`);
      const gt = ss.gate && ss.gate.type;
```

to:

```js
    (ms.subStages || []).forEach((ss, si) => {
      if (!ss.id) problems.push(`mainStages[${mi}].subStages[${si}].id is required`);
      if (ss.id && subStageIds.has(ss.id)) problems.push(`duplicate sub-stage id "${ss.id}"`);
      subStageIds.add(ss.id);
      if (ss.skippable !== undefined && typeof ss.skippable !== "boolean")
        problems.push(`sub-stage "${ss.id}": skippable must be a boolean`);
      const gt = ss.gate && ss.gate.type;
```

Also extend the `SubStage` typedef:

```js
/**
 * @typedef {Object} SubStage
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {boolean} [skippable]
 * @property {Gate} [gate]
 * @property {Step[]} [steps]
 */
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including "all bundled definitions validate" and "the test fixture validates" (the fixture's new flag is a valid boolean).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js packages/core/test/fixtures/workflow.js
git commit -m "skippable sub-stages: validate the flag and duplicate sub-stage ids"
```

---

### Task 2: `skipSubStage`, `unskipSubStage`, `isSubStageSkipped` `inline`

**Files:**
- Modify: `packages/core/src/index.js` (new functions, Run typedef, header comment)
- Modify: `packages/core/test/engine.test.js` (tests plus imports)

- [ ] **Step 1: Write the failing tests**

Add `skipSubStage`, `unskipSubStage`, `isSubStageSkipped`, `stepHasAnyOutput` to the import list at the top of `packages/core/test/engine.test.js` (keep the existing names). Then append:

```js
test("skipSubStage records only legal skips", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun();
  assert.equal(skipSubStage(run, subs, "nope"), run); // unknown id
  assert.equal(skipSubStage(run, subs, "start"), run); // not skippable
  const skipped = skipSubStage(run, subs, "collect");
  assert.equal(isSubStageSkipped(skipped, "collect"), true);
  assert.equal(isSubStageSkipped(skipped, "start"), false);
  assert.equal(skipSubStage(skipped, subs, "collect"), skipped); // idempotent
});

test("skipping beyond the frontier is a no-op", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      { id: "m1", subStages: [{ id: "a", name: "A", steps: [] }] },
      { id: "m2", subStages: [{ id: "b", name: "B", skippable: true, steps: [] }] },
    ],
  };
  const subs = flattenSubStages(def);
  const run = createRun();
  assert.equal(skipSubStage(run, subs, "b"), run); // m2 not committed yet
  const committed = advance(run, subs, { force: true }).run;
  assert.equal(isSubStageSkipped(skipSubStage(committed, subs, "b"), "b"), true);
});

test("unskip restores state and drops the empty map", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(unskipSubStage(run, subs, "collect"), run); // not skipped: no-op
  run = skipSubStage(run, subs, "collect");
  assert.equal(getStepEntry(run, "evidence").outputs.doc.name, "report.pdf"); // skip never touches stepState
  run = unskipSubStage(run, subs, "collect");
  assert.equal(isSubStageSkipped(run, "collect"), false);
  assert.equal(run.skips, undefined); // absent when empty
  const collect = subs.find((s) => s.id === "collect");
  const evidence = collect.steps.find((s) => s.id === "evidence");
  assert.equal(stepHasAnyOutput(evidence, getStepEntry(run, "evidence")), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with "skipSubStage is not exported" (import error) or equivalent.

- [ ] **Step 3: Implement the three functions**

In `packages/core/src/index.js`, after `reopenStep` (end of the "Run state" section), add:

```js
/**
 * Was this sub-stage marked not applicable in this run?
 * @param {Run} run
 * @param {string} subStageId
 * @returns {boolean}
 */
export function isSubStageSkipped(run, subStageId) {
  return !!(run.skips && run.skips[subStageId]);
}

/**
 * Mark a sub-stage not applicable. Returns a new run. No-op (the same
 * run back) when the id is unknown, the sub-stage is not declared
 * skippable, it lies beyond the frontier, or it is already skipped.
 * Skipping never touches stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function skipSubStage(run, subStages, subStageId) {
  const sub = subStages.find((s) => s.id === subStageId);
  if (!sub || !sub.skippable || sub.mainIndex > run.frontier) return run;
  if (isSubStageSkipped(run, subStageId)) return run;
  return { ...run, skips: { ...run.skips, [subStageId]: true } };
}

/**
 * Undo a skip. Returns a new run with the entry removed; the skips
 * field is dropped entirely when it empties. No-op when the id is not
 * currently skipped. Outputs and done flags survive untouched.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function unskipSubStage(run, subStages, subStageId) {
  if (!isSubStageSkipped(run, subStageId)) return run;
  /** @type {Object<string, true>} */
  const skips = { ...run.skips };
  delete skips[subStageId];
  const next = { ...run, skips };
  if (!Object.keys(skips).length) delete next.skips;
  return next;
}
```

Extend the `Run` typedef:

```js
/**
 * @typedef {Object} Run
 * @property {number} idx
 * @property {number} frontier
 * @property {Object<string, StepEntry>} stepState
 * @property {Object<string, true>} [skips]
 * @property {Object<string, true>} [forces]
 */
```

And update the file header comment's RUN block (lines 21-32) to:

```js
 * 2) RUN (runtime state, also JSON-compatible)
 *    { idx, frontier, stepState: { [stepId]: { checkedDone, outputs,
 *      reopened?, generated? } }, skips?, forces? }
 *    `idx` is the flat sub-stage index of the centered card. `frontier`
 *    is the index of the furthest committed MAIN stage: browsing moves
 *    freely through committed main stages (no commit between sibling
 *    sub-stages); advancing commits the next main stage at its boundary
 *    gate, the aggregate of the stage's sub-stage gates.
 *    `reopened` suppresses hybrid content-completion until the step is
 *    touched again. `generated` maps outputId -> true for values
 *    written by draft generation; any hand edit clears the mark.
 *    `skips` maps sub-stage id -> true for sub-stages this run marked
 *    not applicable: excluded from boundary gates, runSummary, and
 *    draft context. `forces` maps main-stage index -> true when the
 *    run advanced past that stage's unmet gate with the override.
 *    Both maps are optional and absent when empty.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "skippable sub-stages: skip, unskip, and isSubStageSkipped"
```

---

### Task 3: aggregate gate exclusion and `runSummary` `inline`

**Files:**
- Modify: `packages/core/src/index.js` (aggregateGate, runSummary)
- Modify: `packages/core/test/engine.test.js` (tests plus `runSummary` and `mainGateProgress` imports as needed)

- [ ] **Step 1: Write the failing tests**

Add `runSummary` to the test file's import list. Append:

```js
test("a skipped sub-stage is excluded from the stage boundary gate", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], run).met, false); // Evidence missing

  run = skipSubStage(run, subs, "collect");
  const p = mainGateProgress(FIXTURE.mainStages[0], run);
  assert.equal(p.met, true);
  assert.equal(p.total, 2); // Intake, Kickoff only
  assert.deepEqual(p.missing, []);

  const result = advance(run, subs); // no force needed
  assert.equal(result.advanced, true);
  assert.equal(result.run.frontier, 1);
});

test("a skipped strict sub-stage no longer blocks the boundary", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      {
        id: "m1",
        subStages: [
          { id: "a", name: "A", steps: [] },
          {
            id: "b", name: "B", skippable: true, gate: { type: "strict" },
            steps: [{ id: "s1", name: "S1", required: true }],
          },
        ],
      },
      { id: "m2", subStages: [{ id: "c", name: "C", steps: [] }] },
    ],
  };
  const subs = flattenSubStages(def);
  let run = createRun();
  assert.equal(mainGateProgress(def.mainStages[0], run).met, false);
  run = skipSubStage(run, subs, "b");
  assert.equal(mainGateProgress(def.mainStages[0], run).met, true);
  assert.equal(advance(run, subs).advanced, true);
});

test("missing names stay qualified by the stage's total sub-stage count", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      {
        id: "m1",
        subStages: [
          { id: "a", name: "A", steps: [{ id: "s1", name: "S1", required: true }] },
          { id: "b", name: "B", skippable: true, steps: [{ id: "s2", name: "S2", required: true }] },
        ],
      },
    ],
  };
  const subs = flattenSubStages(def);
  const run = skipSubStage(createRun(), subs, "b");
  assert.deepEqual(mainGateProgress(def.mainStages[0], run).missing, ["A: S1"]);
});

test("a stage with every sub-stage skipped is trivially met", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      {
        id: "m1",
        subStages: [
          { id: "a", name: "A", skippable: true, steps: [{ id: "s1", name: "S1", required: true }] },
        ],
      },
      { id: "m2", subStages: [{ id: "c", name: "C", steps: [] }] },
    ],
  };
  const subs = flattenSubStages(def);
  const run = skipSubStage(createRun(), subs, "a");
  const p = mainGateProgress(def.mainStages[0], run);
  assert.deepEqual(p, { met: true, done: 0, total: 0, missing: [] });
  assert.equal(advance(run, subs).advanced, true);
});

test("runSummary excludes skipped sub-stages", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  assert.deepEqual(runSummary(FIXTURE, run), { met: 0, total: 3 });
  run = skipSubStage(run, subs, "collect");
  assert.deepEqual(runSummary(FIXTURE, run), { met: 0, total: 2 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: the new tests FAIL (gates still count skipped sub-stages); prior tests pass.

- [ ] **Step 3: Implement the exclusion**

In `packages/core/src/index.js`, change `aggregateGate` so skipped sub-stages drop out while the qualification rule keys off the unfiltered count:

```js
function aggregateGate(subStagesOfMain, run) {
  const multi = subStagesOfMain.length > 1;
  const active = subStagesOfMain.filter((ss) => !isSubStageSkipped(run, ss.id));
  let met = true;
  let done = 0;
  let total = 0;
  /** @type {string[]} */
  const missing = [];
  active.forEach((ss) => {
    const p = gateProgress(ss, run);
    met = met && p.met;
    done += p.done;
    total += p.total;
    p.missing.forEach((name) => missing.push(multi ? `${ss.name}: ${name}` : name));
  });
  return { met, done, total, missing };
}
```

And change `runSummary`:

```js
export function runSummary(definition, run) {
  const subs = flattenSubStages(definition).filter((ss) => !isSubStageSkipped(run, ss.id));
  return { met: subs.filter((ss) => gateProgress(ss, run).met).length, total: subs.length };
}
```

Also update `mainGateProgress`'s doc comment first line to:

```js
 * Progress of a main stage's boundary gate: the aggregate of its
 * sub-stage gates. Skipped sub-stages are excluded.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "skippable sub-stages: exclude skips from boundary gates and runSummary"
```

---

### Task 4: record forced advances, `wasAdvanceForced` `inline`

**Files:**
- Modify: `packages/core/src/index.js` (advance, new reader)
- Modify: `packages/core/test/engine.test.js` (tests plus `wasAdvanceForced` import)

- [ ] **Step 1: Write the failing tests**

Add `wasAdvanceForced` to the test file's import list. Append:

```js
test("a forced advance past an unmet gate is recorded", () => {
  const subs = flattenSubStages(FIXTURE);
  const result = advance(createRun(), subs, { force: true });
  assert.equal(result.advanced, true);
  assert.equal(wasAdvanceForced(result.run, 0), true);
  assert.equal(wasAdvanceForced(result.run, 1), false);
});

test("a met gate records no force, with or without the flag", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(advance(run, subs).run.forces, undefined);
  assert.equal(advance(run, subs, { force: true }).run.forces, undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL ("wasAdvanceForced is not exported", and no `forces` recorded).

- [ ] **Step 3: Implement the recording**

In `packages/core/src/index.js`, add next to `isSubStageSkipped`:

```js
/**
 * Did this run advance past mainIndex's boundary while its gate was
 * unmet? A historical fact: never auto-cleared.
 * @param {Run} run
 * @param {number} mainIndex
 * @returns {boolean}
 */
export function wasAdvanceForced(run, mainIndex) {
  return !!(run.forces && run.forces[mainIndex]);
}
```

In `advance`, change the success return from:

```js
  return {
    run: {
      ...run,
      idx: subStages.findIndex((s) => s.mainIndex === run.frontier + 1),
      frontier: run.frontier + 1,
    },
    advanced: true,
    missing: [],
  };
```

to:

```js
  /** @type {Run} */
  const next = {
    ...run,
    idx: subStages.findIndex((s) => s.mainIndex === run.frontier + 1),
    frontier: run.frontier + 1,
  };
  if (!progress.met) next.forces = { ...run.forces, [run.frontier]: true };
  return { run: next, advanced: true, missing: [] };
```

Also extend `advance`'s doc comment with one line at the end:

```js
 * A forced commit past an unmet gate records forces[old frontier];
 * a met gate records nothing.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "skippable sub-stages: record forced advances in run state"
```

---

### Task 5: `buildContext` excludes skipped sub-stages `inline`

**Files:**
- Modify: `packages/core/src/index.js` (buildContext)
- Modify: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
test("buildContext excludes a skipped sub-stage's completed steps", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", "Evidence points one way.");
  assert.match(buildContext(subs, run, 0), /Evidence points one way\./);

  run = skipSubStage(run, subs, "collect");
  assert.doesNotMatch(buildContext(subs, run, 0), /Evidence points one way\./);

  run = unskipSubStage(run, subs, "collect");
  assert.match(buildContext(subs, run, 0), /Evidence points one way\./);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: the new test FAILS on the `doesNotMatch` assertion.

- [ ] **Step 3: Implement the exclusion**

In `buildContext`, change:

```js
  subStages.forEach((sub) => {
    if (sub.mainIndex > curMain) return;
```

to:

```js
  subStages.forEach((sub) => {
    if (sub.mainIndex > curMain) return;
    if (isSubStageSkipped(run, sub.id)) return;
```

And extend `buildContext`'s doc comment with:

```js
 * Skipped sub-stages are excluded entirely: not-applicable content
 * never feeds draft prompts, even if outputs were entered before the
 * skip.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "skippable sub-stages: exclude skips from draft context"
```

---

### Task 6: rolodex UI `inline`

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

No test runner exists for the react package; verification is the esbuild syntax check, the demo build, and the manual acceptance walk in Task 8.

- [ ] **Step 1: Import the new core functions**

In the `@sqnce/core` import block (after `advance as coreAdvance,`), add:

```js
  skipSubStage,
  unskipSubStage,
  isSubStageSkipped,
  wasAdvanceForced,
```

- [ ] **Step 2: Add the skip toggle handler**

After the `reopen` handler in the mutations section, add:

```js
  const toggleSkip = (subStageId, skipped) => {
    if (readOnly) return;
    setExpanded(null);
    setRun(
      skipped ? unskipSubStage(run, subs, subStageId) : skipSubStage(run, subs, subStageId)
    );
  };
```

(`setRun`, not `setNav`: a skip changes gate state, so it bumps `updatedAt` and is blocked on archived runs.)

- [ ] **Step 3: Compute skip state per card and dim skipped cards**

In the deck map, after `const p = gateProgress(sub, run);`, add:

```js
          const skipped = isSubStageSkipped(run, sub.id);
```

Append the class to the card div (the `pf-card` className template):

```js
              className={`pf-card ${center ? "pf-card-center" : "pf-card-side"} ${locked ? "pf-card-locked" : ""} ${sideClickable ? "pf-card-clickable" : ""} ${skipped ? "pf-card-skipped" : ""}`}
```

- [ ] **Step 4: Disable step controls on skipped cards**

CSS alone (`pointer-events: none`) would leave the buttons reachable by keyboard and assistive tech, so skipped state joins the `disabled` logic of both step controls. Change the dot button:

```jsx
                        <button
                          className={`pf-dot-btn pf-dot-${status}`}
                          disabled={!center || readOnly}
```

to:

```jsx
                        <button
                          className={`pf-dot-btn pf-dot-${status}`}
                          disabled={!center || readOnly || skipped}
```

and the expand button:

```jsx
                        <button
                          className="pf-step-expand"
                          disabled={!center}
```

to:

```jsx
                        <button
                          className="pf-step-expand"
                          disabled={!center || skipped}
```

With expansion disabled and `toggleSkip` closing any open body via `setExpanded(null)`, no step-body control (outputs, generate, mark done) is reachable on a skipped card by any input method.

- [ ] **Step 5: Replace the strip count on skipped cards**

Change:

```jsx
                <span className="pf-card-count">
                  {p.done}/{p.total} required{p.gateType === "strict" ? " · strict gate" : ""}
                </span>
```

to:

```jsx
                <span className="pf-card-count">
                  {skipped
                    ? "Skipped"
                    : `${p.done}/${p.total} required${p.gateType === "strict" ? " · strict gate" : ""}`}
                </span>
```

- [ ] **Step 6: Rework the card footer (skip control, skipped line, forced marker)**

Replace the entire `{center && (<div className="pf-card-foot"> ... </div>)}` block with:

```jsx
              {center && (
                <div className="pf-card-foot">
                  {inFrontierStage ? (
                    <>
                      {stageProg.met ? (
                        <span className="pf-gate-state pf-gate-met">
                          ✓ Stage gate met{nextMain ? ", ready to advance" : ""}
                        </span>
                      ) : (
                        <span className="pf-gate-state">
                          🔒 {stageProg.total - stageProg.done} required {stageProg.total - stageProg.done === 1 ? "step" : "steps"} left in this stage
                          · Gate unmet: {stageProg.missing.join(", ")}
                        </span>
                      )}
                      {nextMain &&
                        (stageProg.met ? (
                          <button className="pf-advance" disabled={readOnly} onClick={() => doAdvance(false)}>
                            Advance to {nextMain.name} →
                          </button>
                        ) : (
                          <button className="pf-override" disabled={readOnly} onClick={() => doAdvance(true)}>
                            Advance anyway
                          </button>
                        ))}
                    </>
                  ) : (
                    <>
                      {skipped ? (
                        <span className="pf-gate-state">Skipped, not applicable</span>
                      ) : p.met ? (
                        <span className="pf-gate-state pf-gate-met">✓ Gate met</span>
                      ) : (
                        <span className="pf-gate-state">
                          🔒 {p.total - p.done} required {p.total - p.done === 1 ? "step" : "steps"} left
                          · Gate unmet: {p.missing.join(", ")}
                        </span>
                      )}
                      {wasAdvanceForced(run, sub.mainIndex) &&
                        !mainGateProgress(def.mainStages[sub.mainIndex], run).met && (
                          <span className="pf-gate-state pf-gate-forced">Advanced with open steps</span>
                        )}
                    </>
                  )}
                  {sub.skippable && (
                    <button
                      className="pf-skip-btn"
                      disabled={readOnly}
                      onClick={() => toggleSkip(sub.id, skipped)}
                    >
                      {skipped ? "Restore" : "Mark not applicable"}
                    </button>
                  )}
                </div>
              )}
```

Notes on intent: the frontier-stage branch is unchanged (a skipped frontier card still shows the stage aggregate and advance affordance, because the footer describes the stage); committed cards get the skipped line or, independently, the forced marker; the skip toggle renders on any centered skippable card and only disables when read-only.

- [ ] **Step 7: Mute skipped pips**

Change the pip className to:

```jsx
                className={`pf-pip ${i === idx ? "pf-pip-active" : ""} ${s.mainIndex > frontier ? "pf-pip-locked" : ""} ${isSubStageSkipped(run, s.id) ? "pf-pip-skipped" : ""}`}
```

- [ ] **Step 8: Add the CSS**

The `pointer-events: none` rule is visual reinforcement only; the accessible disabling is the `disabled` props from Step 4. In the `CSS` template string, after the `.pf-override:hover { color: #D9A441; }` rule, add:

```css
.pf-skip-btn {
  background: none; border: none; color: #8A919B; font-size: 12px; cursor: pointer;
  text-decoration: underline; font-family: 'IBM Plex Mono', monospace;
}
.pf-skip-btn:hover:not(:disabled) { color: #D9A441; }
.pf-skip-btn:disabled { opacity: 0.4; cursor: default; }
.pf-gate-forced { color: #D9A441; }
.pf-card-skipped .pf-card-desc, .pf-card-skipped .pf-inputs { opacity: 0.5; }
.pf-card-skipped .pf-steps { opacity: 0.5; pointer-events: none; }
.pf-pip-skipped { background: transparent; border: 1px solid #4A535E; box-sizing: border-box; }
```

- [ ] **Step 9: Syntax check and build**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no errors.

Run: `npm run build -w examples/demo`
Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "skippable sub-stages: rolodex skip control, skipped card state, forced marker"
```

---

### Task 7: content and docs `delegate: sonnet`

**Files:**
- Modify: `definitions/presales.json`
- Modify: `README.md`
- Modify: `packages/react/README.md`
- Modify: `CLAUDE.md`

Conventions: no em dashes anywhere; brand is lowercase `sqnce`.

- [ ] **Step 1: Make presales Orals Prep skippable**

In `definitions/presales.json`, change:

```json
        {
          "id": "orals",
          "name": "Orals Prep",
          "gate": {
            "type": "hybrid"
          },
```

to:

```json
        {
          "id": "orals",
          "name": "Orals Prep",
          "skippable": true,
          "gate": {
            "type": "hybrid"
          },
```

- [ ] **Step 2: Update README.md**

Change the RUN line:

```
  { idx, frontier, stepState: { [stepId]: { checkedDone, outputs, reopened?, generated? } } }
```

to:

```
  { idx, frontier, stepState: { [stepId]: { checkedDone, outputs, reopened?, generated? } },
    skips?, forces? }
```

and the UI lines:

```
  Rolodex: active sub-stage centered, neighbors faded,
  locked beyond the frontier main stage, gated "Advance" at stage boundaries with override
```

to:

```
  Rolodex: active sub-stage centered, neighbors faded,
  locked beyond the frontier main stage, gated "Advance" at stage boundaries with override,
  skippable sub-stages can be marked not applicable
```

- [ ] **Step 3: Update packages/react/README.md**

In the first paragraph, after "(with an explicit override)." and before "See the", insert:

```
Sub-stages declared skippable offer "Mark not applicable"; a skipped card stays in the deck, dimmed, with a Restore control.
```

- [ ] **Step 4: Update CLAUDE.md**

In Architecture item 2, change:

```
Run shape: `{ idx, frontier, stepState }`.
```

to:

```
Run shape: `{ idx, frontier, stepState }` plus optional `skips` (sub-stage id -> true) and `forces` (main-stage index -> true) maps, absent when empty.
```

In "Key behaviors to preserve", after the override bullet ("Advancing past an unmet gate..."), add two bullets:

```
- Sub-stages declared `skippable: true` can be marked not applicable per run: excluded from the boundary aggregate, `runSummary`, and draft context; skip and unskip never touch `stepState`. Skips of unknown, non-skippable, or beyond-frontier sub-stages are no-ops.
- A forced advance past an unmet gate records `forces[old frontier]` in run state; a met gate records nothing and the marker is never auto-cleared.
```

- [ ] **Step 5: Verify and commit**

Run: `npm test`
Expected: PASS ("all bundled definitions validate" covers the presales edit).

```bash
git add definitions/presales.json README.md packages/react/README.md CLAUDE.md
git commit -m "skippable sub-stages: presales orals content and docs"
```

---

### Task 8: full verification and push `inline`

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS, zero failures.

- [ ] **Step 2: Types**

Run: `npm run types`
Expected: regenerates `packages/*/types` cleanly; commit any diff:

```bash
git add packages/core/types packages/react/types
git commit -m "skippable sub-stages: regenerate types" || true
```

- [ ] **Step 3: Demo build**

Run: `npm run build -w examples/demo`
Expected: build succeeds.

- [ ] **Step 4: Manual acceptance walk (demo)**

Serve the demo build (or `npm run dev -w examples/demo` if available) and verify, per the spec's acceptance section:

- The presales Orals Prep card offers "Mark not applicable"; skipping removes its two steps from the Proposal & Demo footer count; Restore brings them back.
- A skipped card renders dimmed with disabled inputs and a muted pip.
- Force-advancing past an unmet stage shows "Advanced with open steps" on that stage's cards when browsing back; completing the open steps removes the line.
- An archived run disables both skip and restore.

- [ ] **Step 5: Push**

```bash
git push
```

Then the Codex implementation loop takes over (workflow step 9).
