# per-main-stage gating implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the commit line from sub-stage boundaries to main-stage boundaries: free browsing inside a main stage, one aggregate gate per stage boundary.

**Architecture:** `frontier` changes unit from flat sub-stage index to main-stage index; `browse`/`jumpTo`/`advance` re-derive their ranges from `FlatSubStage.mainIndex`; a new `mainGateProgress` aggregates sub-stage gates; `buildContext` includes completed siblings within the current main stage. The rolodex reads the new semantics; demo seeds convert their `frontier` values; run store version bumps to 3 (old stores discarded, pre-launch).

**Tech Stack:** Plain ESM JavaScript, Node's built-in test runner (`node:test`), React (JSX via esbuild for the demo build). No new dependencies.

**Spec:** `docs/specs/4-main-stage-gating.md`. Work happens in the worktree `.worktrees/4-main-stage-gating` (branch `4-main-stage-gating`, PR #46).

**Conventions that apply to every task:** no em dashes anywhere; lowercase `sqnce`; core stays dependency-free; run `npm test` from the repo root.

**Fixture geometry used by the tests** (`packages/core/test/fixtures/workflow.js`, unchanged): main stage 0 "Alpha" holds sub-stages `start` ("Start", required steps Intake + Kickoff, hybrid) and `collect` ("Collect", required step Evidence, hybrid, plus optional Summary/Inventory); main stage 1 "Omega" holds `signoff` ("Sign-off", required step Approve, strict). Flat indices: 0 = Start, 1 = Collect, 2 = Sign-off.

---

### Task 1: Engine navigation and gating semantics

The frontier unit change is atomic across `browse`, `jumpTo`, and `advance` (they all read or write the same field), so this task changes all three plus the aggregate gate in one commit.

**Files:**
- Modify: `packages/core/src/index.js` (header comment lines 21-25, typedefs near line 116, navigation section lines 391-442, gating section after `gateProgress`)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Rewrite the navigation tests as failing tests**

In `packages/core/test/engine.test.js`, add `mainGateProgress` to the import list from `../src/index.js`. Delete these three tests entirely:
- `"advance is blocked at an unmet gate, allowed when met, and forceable"` (lines 88-100)
- `"browse stays within [0, frontier]; jumpTo respects the frontier"` (lines 102-123)
- `"advancing from a non-frontier (browsing) position is a no-op"` (lines 125-133)

In their place, add:

```js
test("browse moves freely within the frontier main stage", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = browse(run, subs, 1); // Collect, same main stage: free
  assert.equal(run.idx, 1);
  assert.equal(run.frontier, 0);
  run = browse(run, subs, 1); // Sign-off is the next main stage: no-op
  assert.equal(run.idx, 1);
  run = browse(run, subs, -1);
  assert.equal(run.idx, 0);
  run = browse(run, subs, -1); // below zero: no-op
  assert.equal(run.idx, 0);
});

test("jumpTo respects the frontier main stage boundary", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = jumpTo(run, subs, 1);
  assert.equal(run.idx, 1);
  run = jumpTo(run, subs, 2); // beyond the frontier main stage: no-op
  assert.equal(run.idx, 1);
  run = jumpTo(run, subs, 0);
  assert.equal(run.idx, 0);
});

test("advance gates on the whole stage and reports qualified missing names", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);

  let result = advance(run, subs); // Evidence (on the Collect card) still missing
  assert.equal(result.advanced, false);
  assert.deepEqual(result.missing, ["Collect: Evidence"]);

  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  result = advance(run, subs);
  assert.equal(result.advanced, true);
  assert.equal(result.run.frontier, 1);
  assert.equal(result.run.idx, 2); // first card of the committed stage
});

test("advance is legal from any card within the frontier stage", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun(); // idx 0 is not the stage's last card
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, true);
  assert.equal(result.run.idx, 2);
  assert.equal(result.run.frontier, 1);
});

test("advancing while browsing a committed stage is a no-op", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  run = jumpTo(run, subs, 1); // back into committed Alpha
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, false);
  assert.equal(result.run.frontier, 1);
});

test("advance at the last main stage is a no-op", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, false);
  assert.equal(result.run.frontier, 1);
});

test("mainGateProgress aggregates across sub-stages; single-sub stages read plain", () => {
  let run = createRun();
  let p = mainGateProgress(FIXTURE.mainStages[0], run);
  assert.equal(p.met, false);
  assert.equal(p.total, 3); // Intake, Kickoff, Evidence
  assert.deepEqual(p.missing, ["Start: Intake", "Start: Kickoff", "Collect: Evidence"]);

  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  p = mainGateProgress(FIXTURE.mainStages[0], run);
  assert.equal(p.met, true);
  assert.equal(p.done, 3);
  assert.deepEqual(p.missing, []);

  p = mainGateProgress(FIXTURE.mainStages[1], run);
  assert.equal(p.met, false);
  assert.deepEqual(p.missing, ["Approve"]); // unqualified: one sub-stage
});

test("a strict sub-stage blocks its stage boundary until explicitly done", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run; // commit to Omega
  run = setOutput(run, "approve", "memo", "Looks good.");
  assert.equal(mainGateProgress(FIXTURE.mainStages[1], run).met, false);
  run = setCheckedDone(run, "approve", true);
  assert.equal(mainGateProgress(FIXTURE.mainStages[1], run).met, true);
});
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `npm test`
Expected: FAIL. `mainGateProgress` is not exported (import error), or once stubbed, the browse/advance assertions fail under the old flat-frontier semantics (for example `browse` at frontier 0 refuses to move to idx 1).

- [ ] **Step 3: Implement the engine changes**

In `packages/core/src/index.js`:

(a) Replace the run-shape paragraph in the file header (lines 21-28) with:

```
 * 2) RUN (runtime state, also JSON-compatible)
 *    { idx, frontier, stepState: { [stepId]: { checkedDone, outputs,
 *      reopened?, generated? } } }
 *    `idx` is the flat sub-stage index of the centered card. `frontier`
 *    is the index of the furthest committed MAIN stage: browsing moves
 *    freely through committed main stages (no commit between sibling
 *    sub-stages); advancing commits the next main stage at its boundary
 *    gate, the aggregate of the stage's sub-stage gates.
 *    `reopened` suppresses hybrid content-completion until the step is
 *    touched again. `generated` maps outputId -> true for values
 *    written by draft generation; any hand edit clears the mark.
```

(b) Add a typedef after the `GateProgress` typedef (line 116):

```js
/**
 * @typedef {Object} MainGateProgress
 * @property {boolean} met
 * @property {number} done
 * @property {number} total
 * @property {string[]} missing
 */
```

(c) After `gateProgress` (end of the "Completion and gating" section), add:

```js
/**
 * Aggregate gate over one main stage's sub-stages. Missing step names
 * are qualified by sub-stage when the stage has more than one, so
 * single-sub-stage main stages read as before.
 * @param {SubStage[]} subStagesOfMain
 * @param {Run} run
 * @returns {MainGateProgress}
 */
function aggregateGate(subStagesOfMain, run) {
  const multi = subStagesOfMain.length > 1;
  let met = true;
  let done = 0;
  let total = 0;
  /** @type {string[]} */
  const missing = [];
  subStagesOfMain.forEach((ss) => {
    const p = gateProgress(ss, run);
    met = met && p.met;
    done += p.done;
    total += p.total;
    p.missing.forEach((name) => missing.push(multi ? `${ss.name}: ${name}` : name));
  });
  return { met, done, total, missing };
}

/**
 * Progress of a main stage's boundary gate: the aggregate of its
 * sub-stage gates.
 * @param {MainStage} mainStage
 * @param {Run} run
 * @returns {MainGateProgress}
 */
export function mainGateProgress(mainStage, run) {
  return aggregateGate(mainStage.subStages, run);
}
```

(d) Replace `browse`, `jumpTo`, and `advance` (the whole Navigation section bodies) with:

```js
/**
 * Last flat index belonging to a main stage or any stage before it.
 * The comparison is <=, so a frontier past the last main stage clamps
 * to the final sub-stage.
 * @param {FlatSubStage[]} subStages
 * @param {number} mainIndex
 * @returns {number}
 */
function lastIndexInMain(subStages, mainIndex) {
  let last = -1;
  subStages.forEach((s, i) => {
    if (s.mainIndex <= mainIndex) last = i;
  });
  return last;
}

/**
 * Browse within committed main stages. Returns a new run (or the same
 * run if out of range). Movement between sibling sub-stages is plain
 * browsing; nothing commits.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {number} direction
 * @returns {Run}
 */
export function browse(run, subStages, direction) {
  const target = run.idx + direction;
  if (target < 0 || target > lastIndexInMain(subStages, run.frontier)) return run;
  return { ...run, idx: target };
}

/**
 * Jump to any sub-stage within the committed main stages.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {number} index
 * @returns {Run}
 */
export function jumpTo(run, subStages, index) {
  if (index < 0 || index > lastIndexInMain(subStages, run.frontier)) return run;
  return { ...run, idx: index };
}

/**
 * Commit the next main stage. Legal from any card within the frontier
 * main stage; a no-op while browsing a committed stage or at the last
 * main stage. The gate is the stage aggregate; force overrides it.
 * On success, idx lands on the first sub-stage of the committed stage.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {{ force?: boolean }} [opts]
 * @returns {AdvanceResult}
 */
export function advance(run, subStages, { force = false } = {}) {
  const cur = subStages[run.idx];
  const maxMain = subStages.length ? subStages[subStages.length - 1].mainIndex : 0;
  if (!cur || cur.mainIndex !== run.frontier || run.frontier >= maxMain) {
    return { run, advanced: false, missing: [] };
  }
  const progress = aggregateGate(
    subStages.filter((s) => s.mainIndex === run.frontier),
    run
  );
  if (!progress.met && !force) {
    return { run, advanced: false, missing: progress.missing };
  }
  return {
    run: {
      ...run,
      idx: subStages.findIndex((s) => s.mainIndex === run.frontier + 1),
      frontier: run.frontier + 1,
    },
    advanced: true,
    missing: [],
  };
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: the Task 1 tests PASS. Two pre-existing tests now FAIL because they call the old `advance`/`buildContext` flow: `"buildContext only includes completed prior outputs; prompt references the subject"` and `"buildContext excludes a reopened step's outputs"`. That is expected; Task 2 rewrites them. Do not commit yet if you want every commit green; instead proceed to Task 2 and commit both tasks together only if these two tests fail. If they happen to pass, commit now with the Task 1 message and commit Task 2 separately.

Note: `"buildContext excludes a reopened step's outputs"` advances with only Intake and Kickoff complete; under the new aggregate gate that advance is blocked (Evidence missing), `run.idx` stays 0, and `buildContext(subs, run, 0)` still includes the completed sibling Intake under the new rule in Task 2, so the assertions are rewritten there rather than patched here.

- [ ] **Step 5: Commit (combined with Task 2 if Step 4 left failures)**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: frontier commits at main-stage boundaries, aggregate stage gate"
```

### Task 2: buildContext sibling rule

**Files:**
- Modify: `packages/core/src/index.js:496-514` (`buildContext`), `packages/core/src/index.js:526-539` (`buildDraftPrompt`)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Rewrite the context tests as failing tests**

Delete the tests `"buildContext only includes completed prior outputs; prompt references the subject"` and `"buildContext excludes a reopened step's outputs"`. Add:

```js
test("buildContext includes completed siblings in the current stage, excluding the drafted step", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools", industry: "Tooling" });
  run = setOutput(run, "summary", "out", "Evidence points one way.");

  // From the first card, the completed Summary on a LATER sibling card is context.
  const ctx = buildContext(subs, run, 0);
  assert.match(ctx, /Vexel Tools/);
  assert.match(ctx, /Evidence points one way\./);

  // Drafting Summary itself excludes it but keeps its siblings.
  const forSummary = buildContext(subs, run, 1, "summary");
  assert.match(forSummary, /Vexel Tools/);
  assert.doesNotMatch(forSummary, /Evidence points one way\./);
});

test("buildContext excludes later main stages", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "approve", "memo", "Looks good.");
  run = setCheckedDone(run, "approve", true); // strict gate: now complete
  assert.doesNotMatch(buildContext(subs, run, 0), /Looks good\./);
  assert.match(buildContext(subs, run, 2), /Looks good\./);
});

test("buildDraftPrompt carries sibling context and the step task", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools", industry: "Tooling" });
  const summary = subs[1].steps.find((s) => s.id === "summary");
  const prompt = buildDraftPrompt(FIXTURE, subs, run, 1, summary);
  assert.match(prompt, /Vexel Tools/);
  assert.match(prompt, /Summarize the evidence\./);
});

test("buildContext excludes a reopened step's outputs", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  assert.match(buildContext(subs, run, 0), /Vexel Tools/);
  run = reopenStep(run, "intake");
  assert.doesNotMatch(buildContext(subs, run, 0), /Vexel Tools/);
});
```

The test `"the generated mark does not change serialization"` calls `buildContext(subs, typed, 2)` and stays valid unchanged (it compares two equal-context runs).

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `npm test`
Expected: FAIL. The old `buildContext` excludes everything at or after `flatIdx`, so `buildContext(subs, run, 0)` is empty and `assert.match(ctx, /Vexel Tools/)` fails.

- [ ] **Step 3: Implement**

Replace `buildContext` with:

```js
/**
 * Compile completed outputs into one context string for the card at
 * flatIdx: every completed step in main stages before the card's main
 * stage, plus completed sibling steps within that main stage (any
 * card, including the current one), excluding excludeStepId (the step
 * being drafted).
 * @param {FlatSubStage[]} subStages
 * @param {Run} run
 * @param {number} flatIdx
 * @param {string} [excludeStepId]
 * @returns {string}
 */
export function buildContext(subStages, run, flatIdx, excludeStepId) {
  const cur = subStages[flatIdx];
  const curMain = cur ? cur.mainIndex : 0;
  const blocks = [];
  subStages.forEach((sub) => {
    if (sub.mainIndex > curMain) return;
    const gateType = gateTypeOf(sub);
    (sub.steps || []).forEach((step) => {
      if (step.id === excludeStepId) return;
      if (!isStepComplete(step, getStepEntry(run, step.id), gateType)) return;
      const block = serializeStep(sub, step, run);
      if (block) blocks.push(block);
    });
  });
  return blocks.join("\n\n");
}
```

In `buildDraftPrompt`, change the context line to:

```js
  const ctx = buildContext(subStages, run, subIdx, step.id);
```

- [ ] **Step 4: Run the full suite, expect green**

Run: `npm test`
Expected: PASS, all tests (including Task 1's if they were committed together; see Task 1 Step 4).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: draft context includes completed siblings within the current main stage"
```

### Task 3: Run store version 3

**Files:**
- Modify: `packages/core/src/index.js:558-560` (`createRunStore`), `packages/core/src/index.js:548-549` (run store section comment)
- Test: `packages/core/test/runstore.test.js:55-57`

- [ ] **Step 1: Update the store test to expect version 3**

In `packages/core/test/runstore.test.js`, the test `"createRunStore returns an empty version 2 store"` becomes:

```js
test("createRunStore returns an empty version 3 store", () => {
  assert.deepEqual(createRunStore(), {
    version: 3,
    activeWorkflowId: null,
    activeRunByWorkflow: {},
    entries: {},
  });
});
```

(Keep the surrounding assertion structure if it differs; the point is `version: 3`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL with `version: 2 !== version: 3`.

- [ ] **Step 3: Implement**

In `createRunStore`, change `version: 2` to `version: 3`. In the run store section comment above it, change `{ version: 2, activeWorkflowId, ... }` to `{ version: 3, ... }` and add one sentence: `Version 3 marks the frontier unit change (main-stage index); older stores are discarded by loaders.`

- [ ] **Step 4: Run, expect green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "core: run store version 3 for the frontier unit change"
```

### Task 4: Rolodex UI

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

No unit-test harness exists for the React package; verification is the esbuild syntax check plus the demo build, and behavior assertions live in the spec's acceptance section.

- [ ] **Step 1: Apply the edits**

(a) Import: add `mainGateProgress,` after `gateProgress,` in the `@sqnce/core` import block (line 13).

(b) Component docblock (lines 52-55): change both `version: 2` mentions to `version: 3` ("where state is the versioned run store `{ version: 3, ... }`. Anything that is not a version 3 store is discarded on load.").

(c) Line 194: clamp against main stages:

```js
  const frontier = Math.min(run.frontier, def.mainStages.length - 1);
```

(d) Persistence load check (line 252): `saved.version === 3`.

(e) Derived block: replace lines 274-275 (`atFrontier`, dead `prog`) with:

```js
  const inFrontierStage = current.mainIndex === frontier;
  const maxBrowse = subs.reduce((acc, s, i) => (s.mainIndex <= frontier ? i : acc), 0);
  const stageProg = mainGateProgress(def.mainStages[frontier], run);
  const nextMain = frontier < def.mainStages.length - 1 ? def.mainStages[frontier + 1] : null;
```

(f) Rail (lines 437-446): delete the `firstIdx` and inner `frontierMain` lines; `stageLocked` becomes `mi > frontier`; the rail-line fill condition becomes `mi <= frontier`:

```js
          {def.mainStages.map((ms, mi) => {
            const allDone = ms.subStages.every((ss) => gateProgress(ss, run).met);
            const stageLocked = mi > frontier;
            const state = mi === current.mainIndex ? "active" : allDone ? "done" : "ahead";
            const glyph = allDone ? "✓" : stageLocked ? "🔒" : String(mi + 1);
            return (
              <React.Fragment key={ms.id}>
                {mi > 0 && <span className={`pf-rail-line ${mi <= frontier ? "pf-rail-line-fill" : ""}`} />}
```

(g) Deck card flags (lines 529-532): key off the card's main stage:

```js
          const locked = sub.mainIndex > frontier;
          const center = pos === 0;
          const p = gateProgress(sub, run);
          const sideClickable = !center && Math.abs(pos) === 1 && sub.mainIndex <= frontier;
```

(h) Card foot (lines 738-761): frontier-stage cards show the stage aggregate and the advance affordance; committed cards keep the per-card line without a button:

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
                  ) : p.met ? (
                    <span className="pf-gate-state pf-gate-met">✓ Gate met</span>
                  ) : (
                    <span className="pf-gate-state">
                      🔒 {p.total - p.done} required {p.total - p.done === 1 ? "step" : "steps"} left
                      · Gate unmet: {p.missing.join(", ")}
                    </span>
                  )}
                </div>
              )}
```

(i) Pips (line 783): locked condition becomes `s.mainIndex > frontier`:

```jsx
                className={`pf-pip ${i === idx ? "pf-pip-active" : ""} ${s.mainIndex > frontier ? "pf-pip-locked" : ""}`}
```

(j) Browsing hint (lines 789-791): show on committed stages only, naming the frontier main stage:

```jsx
          {!inFrontierStage && (
            <div className="pf-gate-hint">Browsing history · frontier is {def.mainStages[frontier].name}</div>
          )}
```

(k) Forward nav (lines 797-798): bound by `maxBrowse`:

```jsx
        <button className="pf-nav-btn pf-nav-fwd" disabled={idx >= maxBrowse} onClick={() => doBrowse(1)}>
          {idx < maxBrowse && nextSub ? nextSub.name : "Forward"} →
        </button>
```

- [ ] **Step 2: Syntax check and build**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`
Expected: no errors (warnings about CSS-in-JS template size are fine).
Run: `npm run build -w examples/demo`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: rolodex reads main-stage frontier, stage-aggregate gate footer"
```

### Task 5: Demo seed conversion

**Files:**
- Modify: `examples/demo/src/seeds.js` (frontier values and the four seed comments)

- [ ] **Step 1: Convert frontier values to main-stage indices**

`idx` values stay flat and unchanged. Apply:

| seed | old `frontier` (flat) | new `frontier` (main) | frontier stage |
|---|---|---|---|
| `car-buying` | 3 | 2 | Deal |
| `moving` | 1 | 1 | Hunt |
| `trip-planning` | 1 | 1 | Book |
| `meal-planning` | 1 | 0 | Plan |
| `presales-pursuit` | 4 | 1 | Proposal & Demo |

Update the two "Deep seed" comments to the new unit:

car-buying:
```js
  /* Deep seed: frontier at the Deal stage, viewing "Financing" (flat
     index 3), a strict gate with nothing done, so the stage gate is
     unmet and the override is visible. */
```

presales-pursuit:
```js
  /* Deep seed: frontier at Proposal & Demo, viewing "Demonstration"
     (flat index 4), every step through Demo Data filled. Demo Build, a
     required checklist step, stays undone, so the unmet stage gate and
     the override are visible. Orals Prep and Delivery are browsable in
     the open stage but unseeded. */
```

The three light-seed comments keep their text but replace "(index 1)" with "(flat index 1)" and, for meal-planning, note the frontier stays at the Plan stage (`frontier: 0`).

- [ ] **Step 2: Build the demo**

Run: `npm run build -w examples/demo`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add examples/demo/src/seeds.js
git commit -m "demo: seed frontiers convert to main-stage indices"
```

### Task 6: Prose docs and generated types

**Files:**
- Modify: `README.md:32-39`, `packages/react/README.md:3`, `CLAUDE.md` (Architecture item 2, Key behaviors bullets)
- Regenerate: `packages/*/types` via `npm run types`

- [ ] **Step 1: README.md**

Line 32-33 (UI block in the diagram) becomes:

```
UI (@sqnce/react)
  Rolodex: active sub-stage centered, neighbors faded,
  locked beyond the frontier main stage, gated "Advance" at stage boundaries with override
```

The Gate and Frontier bullets (lines 38-39) become:

```markdown
- **Gate**: each sub-stage declares how its steps complete (`hybrid`: any output or marked done; `strict`: explicitly marked done). The hard gate sits at the main-stage boundary: every required step in the stage must be complete before the next main stage unlocks. An "advance anyway" override is always available, so the gate guides rather than blocks.
- **Frontier**: the furthest committed main stage. Sub-stages within it are freely navigable; browsing back through history never loses your place; advancing to the next main stage is a deliberate action.
```

- [ ] **Step 2: packages/react/README.md**

Line 3 becomes:

```markdown
Rolodex UI for sqnce workflow definitions. The active sub-stage is centered and interactive; neighbors are faded; sub-stages beyond the frontier main stage are locked until its boundary gate is met (with an explicit override). See the [repository README](../../README.md) for usage.
```

- [ ] **Step 3: CLAUDE.md**

In Architecture item 2, replace the run-shape sentence with:

```markdown
State in, new state out. Run shape: `{ idx, frontier, stepState }`. `idx` is the flat sub-stage index of the centered card; `frontier` is the furthest committed main stage; browsing moves freely within committed main stages; `advance` commits the next main stage at its boundary gate, the aggregate of the stage's sub-stage gates (with `force` override).
```

In "Key behaviors to preserve", after the hybrid/strict bullet, add:

```markdown
- The hard gate sits at main-stage boundaries: the boundary gate aggregates the stage's sub-stage gates, and sub-stages within a main stage are freely navigable with no commit between them.
```

and change the browsing bullet to:

```markdown
- Browsing history never moves the frontier; advancing while browsing a committed main stage is a no-op.
```

- [ ] **Step 4: Regenerate types**

Run: `npm run types`
Expected: succeeds; `packages/core/types/index.d.ts` gains `mainGateProgress` and the `MainGateProgress` typedef and the changed signatures.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/react/README.md CLAUDE.md packages/core/types packages/react/types
git commit -m "docs: frontier is the furthest committed main stage"
```

### Task 7: Full verification and push

- [ ] **Step 1: Full check**

Run: `npm test && npm run build -w examples/demo && npm run types && git status --short`
Expected: tests pass, build passes, `git status` shows no uncommitted diff after the types regen (a dirty tree means Task 6 Step 4 missed a file; commit it).

- [ ] **Step 2: Manual demo pass (spec acceptance)**

Run the demo (`npm run dev -w examples/demo` or build output) and verify: presales seed opens at Demonstration with all four Proposal & Demo cards browsable and editable; the footer shows stage aggregate progress with "Advance anyway" (Demo Build undone); marking Demo Build done flips the footer to "Advance to SOW"; advancing lands on Scope Definition and fills the rail through Proposal & Demo; pips beyond the open stage are locked; an old (version 2) localStorage state is discarded and reseeds on load.

- [ ] **Step 3: Push**

```bash
git push
```

Then the Codex implementation loop takes over (lifecycle step 9).
