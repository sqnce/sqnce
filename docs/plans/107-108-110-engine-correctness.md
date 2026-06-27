# Engine correctness bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five engine correctness gaps (#107, #108, #110) in `packages/core/src/index.js` so the engine reports run and definition state truthfully.

**Architecture:** Four small engine code fixes plus one documentation clarification, all in the pure dependency-free engine and its test suite, with one matching wording change in `CLAUDE.md`. Each fix has its own test (except #110.3, which is docs-only and already pinned by existing tests).

**Tech Stack:** Plain ESM JavaScript, `@sqnce/core` engine (no build step), Node's built-in test runner (`node:test`, Node 20+).

## Global Constraints

- No em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- `@sqnce/core` stays pure and dependency-free; these are engine fixes, no new dependency.
- New tests go in `packages/core/test/engine.test.js` (the root `npm test` globs `packages/core/test/*.test.js`).
- Conventional commits: `fix(core): ...`, `docs(core): ...`, `docs(claude): ...`.
- License Apache-2.0; plain ESM, no TypeScript.

---

### Task 1: #108 validateDefinition validates output ids

**Files:**
- Modify: `packages/core/src/index.js` (the output loop in `validateDefinition`, around lines 411-436)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `validateDefinition` (already exported).
- Produces: `validateDefinition` now reports `step "<id>": an output is missing an id` and `step "<id>": duplicate output id "<id>"`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/engine.test.js`:

```js
test("validateDefinition catches a missing or duplicate output id", () => {
  const mk = (outputs) => ({
    id: "d", name: "D",
    mainStages: [{ id: "m", name: "M", subStages: [{ id: "s", name: "S",
      steps: [{ id: "st", name: "St", outputs }] }] }],
  });
  assert.ok(validateDefinition(mk([{ type: "text" }])).some((p) => /output is missing an id/.test(p)));
  assert.ok(validateDefinition(mk([{ id: "  ", type: "text" }])).some((p) => /output is missing an id/.test(p)));
  assert.ok(
    validateDefinition(mk([{ id: "o", type: "text" }, { id: "o", type: "text" }]))
      .some((p) => /duplicate output id "o"/.test(p))
  );
  assert.deepEqual(validateDefinition(mk([{ id: "a", type: "text" }, { id: "b", type: "text" }])), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/core/test/engine.test.js`
Expected: FAIL on the missing-id and duplicate-id assertions (validateDefinition does not yet check output ids).

- [ ] **Step 3: Write the implementation**

In `packages/core/src/index.js`, the output loop currently opens like this:

```js
        (st.outputs || []).forEach((o) => {
          if (!["text", "fields", "file", "link", "data"].includes(o.type))
            problems.push(`step "${st.id}": unknown output type "${o.type}"`);
```

Change it to declare a per-step id set and check the id first:

```js
        const outputIds = new Set();
        (st.outputs || []).forEach((o) => {
          if (typeof o.id !== "string" || !o.id.trim())
            problems.push(`step "${st.id}": an output is missing an id`);
          else if (outputIds.has(o.id))
            problems.push(`step "${st.id}": duplicate output id "${o.id}"`);
          else outputIds.add(o.id);
          if (!["text", "fields", "file", "link", "data"].includes(o.type))
            problems.push(`step "${st.id}": unknown output type "${o.type}"`);
```

The rest of the loop body (fields, render, validate checks) is unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS, including the new test and the existing "all bundled definitions validate" test (the de-risking confirmed all bundled definitions already have valid output ids).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "fix(core): validateDefinition checks output id presence and per-step uniqueness (#108)"
```

---

### Task 2: #110.2 validateDefinition validates the subject for linear definitions

**Files:**
- Modify: `packages/core/src/index.js` (the subject block in `validateDefinition`, around lines 500-527)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `validateDefinition`, `isForked`, `lastSpineIndex` (already in scope).
- Produces: `validateDefinition` now runs the subject's deep resolution (one-step, output-on-step, fields-type, field-key) for every definition, not only forked ones; the spine-membership check stays forked-only.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/engine.test.js`:

```js
test("validateDefinition validates the subject for a linear definition", () => {
  const mk = (subject) => ({
    id: "d", name: "D", subject,
    mainStages: [{ id: "m", name: "M", subStages: [{ id: "s", name: "S",
      steps: [{ id: "st", name: "St", outputs: [
        { id: "o", type: "fields", fields: [{ key: "client", label: "Client" }] }] }] }] }],
  });
  // a present but misspelled field is caught by the lifted deep resolution
  assert.ok(validateDefinition(mk({ stepId: "st", outputId: "o", field: "nope" }))
    .some((p) => /field "nope" is not a field/.test(p)));
  // a step id that resolves to no step is caught
  assert.ok(validateDefinition(mk({ stepId: "ghost", outputId: "o", field: "client" }))
    .some((p) => /must resolve to exactly one step/.test(p)));
  // a fully correct subject reports nothing
  assert.deepEqual(validateDefinition(mk({ stepId: "st", outputId: "o", field: "client" })), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/core/test/engine.test.js`
Expected: FAIL on the misspelled-field and missing-step assertions (linear definitions currently skip the deep resolution).

- [ ] **Step 3: Write the implementation**

In `packages/core/src/index.js`, the subject block currently reads:

```js
  if (definition.subject) {
    const s = definition.subject;
    if (!s.stepId || !s.outputId || !s.field) {
      problems.push("definition.subject requires stepId, outputId, and field");
    } else if (isForked(definition)) {
      const spineEnd = lastSpineIndex(definition);
      const owners = [];
      (definition.mainStages || []).forEach((ms, mi) => {
        (ms.subStages || []).forEach((ss) =>
          (ss.steps || []).forEach((st) => {
            if (st.id === s.stepId) owners.push({ mi, step: st });
          })
        );
      });
      if (owners.length !== 1) {
        problems.push(`definition.subject.stepId "${s.stepId}" must resolve to exactly one step`);
      } else {
        const { mi, step } = owners[0];
        if (mi > spineEnd) problems.push("definition.subject step must live in the spine, not a track");
        const out = (step.outputs || []).find((o) => o.id === s.outputId);
        if (!out) problems.push(`definition.subject.outputId "${s.outputId}" is not on step "${s.stepId}"`);
        else if (out.type !== "fields")
          problems.push("definition.subject must point at a fields output");
        else if (!(out.fields || []).some((f) => f.key === s.field))
          problems.push(`definition.subject.field "${s.field}" is not a field of "${s.outputId}"`);
      }
    }
  }
```

Lift the base resolution out of the forked-only branch, keeping only the spine-membership check forked-specific:

```js
  if (definition.subject) {
    const s = definition.subject;
    if (!s.stepId || !s.outputId || !s.field) {
      problems.push("definition.subject requires stepId, outputId, and field");
    } else {
      const owners = [];
      (definition.mainStages || []).forEach((ms, mi) => {
        (ms.subStages || []).forEach((ss) =>
          (ss.steps || []).forEach((st) => {
            if (st.id === s.stepId) owners.push({ mi, step: st });
          })
        );
      });
      if (owners.length !== 1) {
        problems.push(`definition.subject.stepId "${s.stepId}" must resolve to exactly one step`);
      } else {
        const { mi, step } = owners[0];
        // spine-membership is the only forked-specific constraint
        if (isForked(definition) && mi > lastSpineIndex(definition))
          problems.push("definition.subject step must live in the spine, not a track");
        const out = (step.outputs || []).find((o) => o.id === s.outputId);
        if (!out) problems.push(`definition.subject.outputId "${s.outputId}" is not on step "${s.stepId}"`);
        else if (out.type !== "fields")
          problems.push("definition.subject must point at a fields output");
        else if (!(out.fields || []).some((f) => f.key === s.field))
          problems.push(`definition.subject.field "${s.field}" is not a field of "${s.outputId}"`);
      }
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS, including the new test, the existing forked subject tests, and "all bundled definitions validate" (the de-risking confirmed every bundled linear subject resolves).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "fix(core): validate the subject for linear definitions, not only forked (#110)"
```

---

### Task 3: #107 trackStatus agrees with isRunComplete

**Files:**
- Modify: `packages/core/src/index.js` (`trackStatus`, the complete branch around lines 1816-1819)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `trackStatus`, `isRunComplete`, `mainGateProgress`, `lastSpineIndex` (already in scope), the `tm.indices` track-map field, and the existing test helpers `commitSpine`, `driveResponseToTerminal` (in engine.test.js), and the core exports `skipTrack`, `jumpTo`, `advance`, `setOutput`, `setCheckedDone`.
- Produces: `trackStatus` returns `"complete"` only when the frontier is at the track terminal and every gate from the spine start through the track terminal is met.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/engine.test.js`:

```js
test("trackStatus is active (not complete) when an intermediate track gate was forced", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open
  r = skipTrack(r, FORKED, "demo"); // keep only response
  // force past respDraft's unmet gate, then meet review and the strict terminal
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-draft-sub"));
  r = advance(r, subs, { force: true }).run; // respDraft missing: forced, response = 6
  r = setOutput(r, "respReview", "r", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-review-sub"));
  r = advance(r, subs).run; // response = 7 (terminal)
  r = setCheckedDone(r, "respSignoff", true);
  assert.equal(trackStatus(FORKED, r, "response"), "active");
  assert.equal(isRunComplete(FORKED, r), false);
});

test("trackStatus is active (not complete) when a spine gate was forced open", () => {
  const subs = flattenSubStages(FORKED);
  // commit intake (met), leave the findings gate unmet, force-open the fork
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  r = setCheckedDone(r, "intake", true);
  r = advance(r, subs).run; // frontier at findings (1), findings gate NOT met
  r = advance(r, subs, { force: true }).run; // force-open the fork past the unmet findings gate
  r = skipTrack(r, FORKED, "demo");
  r = driveResponseToTerminal(r, subs); // response fully met
  assert.equal(trackStatus(FORKED, r, "response"), "active"); // unmet spine gate keeps it incomplete
  assert.equal(isRunComplete(FORKED, r), false);
});
```

(The genuinely-complete positive case is already covered by the existing test "a skipped optional track is excluded; an all-required-complete run completes", which asserts `trackStatus(FORKED, r, "response") === "complete"` and must stay green.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/engine.test.js`
Expected: FAIL on the two new assertions (today `trackStatus` returns `"complete"` from the terminal gate alone).

- [ ] **Step 3: Write the implementation**

In `packages/core/src/index.js`, `trackStatus` currently ends:

```js
  const v = r.trackFrontier[trackId]; // own + in-range, verified by the loop above
  if (isTrackSkippedEffective(definition, r, trackId)) return "skipped";
  if (v === tm.terminal && mainGateProgress(definition.mainStages[tm.terminal], r, o).met) return "complete";
  return "active";
```

Replace the complete branch so it checks every gate along the track's path (spine plus the track's own stages):

```js
  const v = r.trackFrontier[trackId]; // own + in-range, verified by the loop above
  if (isTrackSkippedEffective(definition, r, trackId)) return "skipped";
  // "complete" must mean every gate along this track's path is met (the shared
  // spine plus the track's own stages), matching the gates isRunComplete checks.
  // Checking only the track's own stages would still report complete when the
  // fork was force-opened past an unmet spine gate.
  const spineEnd = lastSpineIndex(definition);
  const gateMet = (i) => mainGateProgress(definition.mainStages[i], r, o).met;
  if (v !== tm.terminal) return "active";
  for (let i = 0; i <= spineEnd; i++) if (!gateMet(i)) return "active";
  for (const i of tm.indices) if (!gateMet(i)) return "active";
  return "complete";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS, including the two new tests and the existing forked trackStatus tests (the complete, skipped, active, and validator-rejected cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "fix(core): trackStatus checks every gate on the track path, agreeing with isRunComplete (#107)"
```

---

### Task 4: #110.1 buildDraftPrompt guards an out-of-range idx on the linear path

**Files:**
- Modify: `packages/core/src/index.js` (`buildDraftPrompt`, the `const subStage = subStages[idx];` read around line 1385)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `buildDraftPrompt`, `flattenSubStages`, `createRun`, `lastIndexInMain` (already in scope), the linear `FIXTURE`.
- Produces: `buildDraftPrompt` falls back to the last committed sub-stage when the requested index is out of range, instead of throwing.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/engine.test.js`:

```js
test("buildDraftPrompt falls back on an out-of-range idx instead of throwing", () => {
  const subs = flattenSubStages(FIXTURE);
  const step = subs[0].steps[0];
  const prompt = buildDraftPrompt(FIXTURE, subs, createRun(), 999, step);
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/core/test/engine.test.js`
Expected: FAIL with a TypeError reading `mainName` of undefined (the linear path has no out-of-range guard).

- [ ] **Step 3: Write the implementation**

In `packages/core/src/index.js`, `buildDraftPrompt` reads the sub-stage with:

```js
  const subStage = subStages[idx];
```

Change it to fall back when the index is out of range, mirroring the forked path:

```js
  let subStage = subStages[idx];
  if (!subStage) {
    // A stale or corrupted persisted index has no sub-stage on the linear path
    // (normalizeFlat leaves a linear run unchanged), so fall back to the last
    // committed sub-stage, mirroring the forked fallback, instead of throwing.
    idx = lastIndexInMain(subStages, r.frontier);
    subStage = subStages[idx];
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/core/test/engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "fix(core): buildDraftPrompt guards an out-of-range idx on the linear path (#110)"
```

---

### Task 5: #110.3 clarify the cloneRun contract docs (no behavior change)

**Files:**
- Modify: `packages/core/src/index.js` (the `cloneRun` JSDoc, around line 1569-1570)
- Modify: `CLAUDE.md` (the `cloneRun` contract sentence, around line 43)

**Interfaces:**
- Consumes: nothing new.
- Produces: no code or behavior change. The two existing `runstore.test.js` tests (a clone over a run holding a step, or a kept skip, absent from the definition throws) are the behavior pin and must stay green.

- [ ] **Step 1: Confirm the behavior pin already passes**

Run: `node --test packages/core/test/runstore.test.js`
Expected: PASS, including "cloneRun throws when the run holds a step absent from the definition" and "cloneRun throws when the run holds a skip sub-stage absent from the definition". These pin the loud-failure behavior this task preserves; no `cloneRun` code changes.

- [ ] **Step 2: Reword the cloneRun JSDoc**

In `packages/core/src/index.js`, the `cloneRun` JSDoc currently contains:

```
 * the fork stage are dropped. The supplied definition must be the run's own
 * workflow and must currently describe every retained step and kept skip.
 * Throws rather than silently producing a broken store on bad, colliding,
```

Replace the "retained" sentence so the docs match the loud-failure behavior:

```
 * the fork stage are dropped. The supplied definition must be the run's own
 * workflow and must currently describe every step and kept skip the run
 * carries: any step or skip the definition no longer describes throws (even one
 * a truncation would otherwise discard), and a retained kept skip's sub-stage
 * must still be skippable. Throws rather than silently producing a broken store
 * on bad, colliding,
```

- [ ] **Step 3: Reword the CLAUDE.md cloneRun sentence**

In `CLAUDE.md`, the `cloneRun` bullet ends with:

```
an `uptoStageId` beyond the frontier, or a retained step or kept skip the definition no longer describes.
```

Replace that tail with wording that matches the loud-failure behavior:

```
an `uptoStageId` beyond the frontier, any step or kept skip the definition no longer describes (even one a truncation would discard), or a retained sub-stage whose kept skip is no longer skippable.
```

(Match the surrounding sentence exactly when editing; only the tail clause changes.)

- [ ] **Step 4: Verify nothing else changed and the suite is green**

Run: `npm test`
Expected: PASS across all core and react suites; no behavior change.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js CLAUDE.md
git commit -m "docs(core): clarify the cloneRun contract wording, drop ambiguous 'retained' (#110)"
```

---

### Task 6: full gates

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS across all core and react suites.

- [ ] **Step 2: Run the demo build**

Run: `npm run build -w examples/demo`
Expected: exits 0.

- [ ] **Step 3: Run the types gate**

Run: `npm run types`
Expected: exits 0 (the JSDoc changes regenerate cleanly).

---

## Self-Review

**Spec coverage:**
- #107 trackStatus spine-plus-track gates: Task 3 (with the spine-force regression).
- #108 output id presence and per-step uniqueness: Task 1.
- #110.1 linear buildDraftPrompt idx guard: Task 4.
- #110.2 linear subject validation: Task 2.
- #110.3 docs-only clarification, behavior unchanged, existing tests pin it: Task 5.
- Gates: Task 6.

**Placeholder scan:** none. Every code step shows the actual before/after and the test code.

**Type consistency:** `tm.indices` and `lastSpineIndex(definition)` in Task 3 match the engine; the new validateDefinition messages in Tasks 1 and 2 match the test regexes (`/output is missing an id/`, `/duplicate output id "o"/`, `/field "nope" is not a field/`, `/must resolve to exactly one step/`); Task 4 uses `lastIndexInMain(subStages, r.frontier)`, the same helper and normalized run the surrounding code uses.
