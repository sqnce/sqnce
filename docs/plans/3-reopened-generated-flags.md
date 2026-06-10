# reopened and generated flags implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `reopened` and `generated` flags to step state in `@sqnce/core` (TDD) and wire Reopen and draft tinting in `@sqnce/react`, per docs/specs/3-reopened-generated-flags.md.

**Architecture:** Two TDD passes over `packages/core/src/index.js` extend the step entry (`{ checkedDone, outputs, reopened?, generated? }`) via `reopenStep`, a touch rule on `setOutput`/`setCheckedDone`, and an `isOutputGenerated` selector; then one react pass rewires the Reopen button and tints generated text editors. Requires batch 1 merged (tests build on `FIXTURE` from `packages/core/test/fixtures/workflow.js`).

**Tech Stack:** Plain ESM JavaScript, Node built-in test runner, React; no new dependencies.

---

### Task 1: reopened flag in core (TDD)

**Files:**
- Modify: `packages/core/test/engine.test.js` (new tests, two new imports)
- Modify: `packages/core/src/index.js` (`setOutput`, `setCheckedDone`, new `reopenStep`, `isStepComplete`, header comment)

- [ ] **Step 1: Write the failing tests**

Add `reopenStep` to the `../src/index.js` import list in `packages/core/test/engine.test.js`, then append these tests:

```js
test("reopenStep suppresses content completion under a hybrid gate", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");
  const summary = collect.steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);

  run = reopenStep(run, "summary");
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), false);
});

test("editing an output clears the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  run = reopenStep(run, "summary");
  run = setOutput(run, "summary", "out", "A better summary.");
  assert.equal(getStepEntry(run, "summary").reopened, undefined);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
});

test("re-marking done clears the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  run = reopenStep(run, "summary");
  run = setCheckedDone(run, "summary", true);
  assert.equal(getStepEntry(run, "summary").reopened, undefined);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "strict"), true);
});

test("strict gates ignore the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const approve = subs.find((s) => s.id === "signoff").steps.find((s) => s.id === "approve");

  let run = createRun();
  run = setOutput(run, "approve", "memo", "Looks good.");
  assert.equal(isStepComplete(approve, getStepEntry(run, "approve"), "strict"), false);

  run = reopenStep(run, "approve");
  assert.equal(isStepComplete(approve, getStepEntry(run, "approve"), "strict"), false);

  run = setCheckedDone(run, "approve", true);
  assert.equal(isStepComplete(approve, getStepEntry(run, "approve"), "strict"), true);
});

test("gateProgress counts a reopened required step as missing", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");

  let run = createRun();
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(gateProgress(collect, run).met, true);

  run = reopenStep(run, "evidence");
  const p = gateProgress(collect, run);
  assert.equal(p.met, false);
  assert.ok(p.missing.includes("Evidence"));
});

test("buildContext excludes a reopened step's outputs", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  run = advance(run, subs).run;
  assert.match(buildContext(subs, run, run.idx), /Vexel Tools/);

  run = reopenStep(run, "intake");
  assert.doesNotMatch(buildContext(subs, run, run.idx), /Vexel Tools/);
});

test("reopenStep on an untouched step creates a safe entry", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  const run = reopenStep(createRun(), "summary");
  const entry = getStepEntry(run, "summary");
  assert.equal(entry.checkedDone, false);
  assert.equal(entry.reopened, true);
  assert.deepEqual(entry.outputs, {});
  assert.equal(isStepComplete(summary, entry, "hybrid"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. The import of `reopenStep` throws (`The requested module '../src/index.js' does not provide an export named 'reopenStep'`).

- [ ] **Step 3: Implement in `packages/core/src/index.js`**

Replace `setOutput` with (the options argument is introduced here as touch-rule groundwork; Task 2 adds the `generated` bookkeeping):

```js
/**
 * Set one output value on a step. Returns a new run.
 * Any write counts as touching the step and clears `reopened`.
 */
export function setOutput(run, stepId, outputId, value) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  const next = { ...cur, outputs: { ...cur.outputs, [outputId]: value } };
  delete next.reopened;
  return { ...run, stepState: { ...run.stepState, [stepId]: next } };
}
```

Replace `setCheckedDone` with:

```js
/**
 * Set or clear a step's explicit done flag. Returns a new run.
 * Re-marking done clears `reopened`.
 */
export function setCheckedDone(run, stepId, checkedDone) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  const next = { ...cur, checkedDone };
  if (checkedDone) delete next.reopened;
  return { ...run, stepState: { ...run.stepState, [stepId]: next } };
}
```

Add directly after `setCheckedDone`:

```js
/**
 * Explicitly reopen a step. Clears the done flag and sets `reopened`,
 * which suppresses hybrid content-completion until the step is touched
 * again (an output write or a re-mark done). Strict gates ignore the
 * flag; they already require explicit done.
 */
export function reopenStep(run, stepId) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  return {
    ...run,
    stepState: { ...run.stepState, [stepId]: { ...cur, checkedDone: false, reopened: true } },
  };
}
```

Replace `isStepComplete` with:

```js
/**
 * Is a step complete under a gate type?
 * hybrid: explicit done OR (not reopened AND any output value).
 * strict: explicit done only.
 */
export function isStepComplete(step, entry, gateType = "hybrid") {
  if (gateType === "strict") return !!entry.checkedDone;
  if (entry.checkedDone) return true;
  return !entry.reopened && stepHasAnyOutput(step, entry);
}
```

In the file header comment, replace the RUN section lines:

```js
 * 2) RUN (runtime state, also JSON-compatible)
 *    { idx, frontier, stepState: { [stepId]: { checkedDone, outputs,
 *      reopened?, generated? } } }
 *    `frontier` is the furthest committed sub-stage. Browsing moves
 *    within [0, frontier]; advancing commits the frontier forward.
 *    `reopened` suppresses hybrid content-completion until the step is
 *    touched again. `generated` maps outputId -> true for values
 *    written by draft generation; any hand edit clears the mark.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: reopened flag suppresses hybrid content completion (#3)"
```

### Task 2: generated flag in core (TDD)

**Files:**
- Modify: `packages/core/test/engine.test.js` (new tests, one new import)
- Modify: `packages/core/src/index.js` (`setOutput` options, new `isOutputGenerated`)

- [ ] **Step 1: Write the failing tests**

Add `isOutputGenerated` to the test file's import list, then append:

```js
test("a generated write marks the output; a plain write clears it", () => {
  let run = createRun();
  run = setOutput(run, "summary", "out", "Draft.", { generated: true });
  assert.equal(isOutputGenerated(run, "summary", "out"), true);

  run = setOutput(run, "summary", "out", "Edited by hand.");
  assert.equal(isOutputGenerated(run, "summary", "out"), false);
});

test("regenerating after a hand edit re-marks the output", () => {
  let run = createRun();
  run = setOutput(run, "summary", "out", "Draft.", { generated: true });
  run = setOutput(run, "summary", "out", "Edited.");
  run = setOutput(run, "summary", "out", "Draft two.", { generated: true });
  assert.equal(isOutputGenerated(run, "summary", "out"), true);
});

test("the generated mark does not change serialization", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");
  const summary = collect.steps.find((s) => s.id === "summary");

  let typed = createRun();
  typed = setOutput(typed, "summary", "out", "Same text.");
  let generated = createRun();
  generated = setOutput(generated, "summary", "out", "Same text.", { generated: true });

  assert.equal(serializeStep(collect, summary, typed), serializeStep(collect, summary, generated));
  assert.equal(buildContext(subs, typed, 2), buildContext(subs, generated, 2));
});

test("a generated write clears the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  run = reopenStep(run, "summary");
  run = setOutput(run, "summary", "out", "Regenerated.", { generated: true });
  assert.equal(getStepEntry(run, "summary").reopened, undefined);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL on the missing `isOutputGenerated` export.

- [ ] **Step 3: Implement in `packages/core/src/index.js`**

Replace `setOutput` (final form) with:

```js
/**
 * Set one output value on a step. Returns a new run.
 * Any write counts as touching the step and clears `reopened`.
 * `generated: true` marks the value as written by draft generation;
 * the default (a hand edit) clears the mark for that output.
 */
export function setOutput(run, stepId, outputId, value, { generated = false } = {}) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  const next = { ...cur, outputs: { ...cur.outputs, [outputId]: value } };
  delete next.reopened;
  const gen = { ...cur.generated };
  if (generated) gen[outputId] = true;
  else delete gen[outputId];
  if (Object.keys(gen).length) next.generated = gen;
  else delete next.generated;
  return { ...run, stepState: { ...run.stepState, [stepId]: next } };
}
```

Add directly after `setOutput`:

```js
/** Was this output written by draft generation (and not hand-edited since)? */
export function isOutputGenerated(run, stepId, outputId) {
  const entry = run.stepState[stepId];
  return !!(entry && entry.generated && entry.generated[outputId]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: generated flag tracks draft provenance per output (#20)"
```

### Task 3: react wiring (Reopen, tint)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`
- Modify: `packages/react/src/OutputView.jsx`

- [ ] **Step 1: Rewire ProcessRolodex.jsx**

Add `reopenStep` and `isOutputGenerated` to the `@sqnce/core` import list (alongside `setOutput as coreSetOutput`, `setCheckedDone`).

Replace `writeOutput` with:

```js
const writeOutput = (stepId, outputId, value, opts) => {
  if (readOnly) return;
  setRun(coreSetOutput(run, stepId, outputId, value, opts));
};
```

Add below `toggleDone`:

```js
const reopen = (stepId) => {
  if (readOnly) return;
  setRun(reopenStep(run, stepId));
};
```

In `generate`, change the success write to:

```js
writeOutput(step.id, target.id, text, { generated: true });
```

In the step body's actions, replace the Mark done/Reopen button. `status` is already computed in the enclosing map (`const status = statusOf(sub, step)`), so completion is gate-aware:

```jsx
<button
  className={`pf-btn ${status === "done" ? "" : "pf-btn-primary"}`}
  disabled={readOnly}
  onClick={() => (status === "done" ? reopen(step.id) : toggleDone(step.id, true))}
>
  {status === "done" ? "Reopen" : "Mark done"}
</button>
```

On the `OutputView` call site, add the provenance prop:

```jsx
generated={isOutputGenerated(run, step.id, spec.id)}
```

Append to the CSS template string (after the `.pf-jt-*` rules at the end):

```css
.pf-ta-wrap { position: relative; }
.pf-gen-badge {
  position: absolute; top: 6px; right: 10px; z-index: 2; pointer-events: none;
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #7A6A3C; background: #F4DFAE; border-radius: 4px; padding: 1px 6px;
}
.pf-ta-generated, .pf-ta-generated[readonly] { background: #FCF7E9; border-color: #D9A441; }
```

(The `[readonly]` variant keeps the tint visible on archived runs; it is declared after the existing `.pf-ta[readonly]` rule, so it wins at equal specificity.)

- [ ] **Step 2: Thread the prop through OutputView.jsx**

Change the component signature:

```js
export default function OutputView({ spec, value, onChange, onAttach, renderers, context, generated }) {
```

Pass it to `DefaultEditor` at the existing call site:

```jsx
<DefaultEditor spec={spec} value={value} onChange={onChange} onAttach={onAttach} readOnly={readOnly} generated={generated} />
```

Change `DefaultEditor`'s signature and its text branch:

```jsx
function DefaultEditor({ spec, value, onChange, onAttach, readOnly, generated }) {
  if (spec.type === "text")
    return (
      <div className="pf-ta-wrap">
        {generated && <span className="pf-gen-badge">AI draft</span>}
        <textarea
          className={`pf-ta ${generated ? "pf-ta-generated" : ""}`}
          placeholder="Write the output or generate a draft."
          value={value || ""}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
```

The other branches (link, fields, file) are unchanged.

- [ ] **Step 3: Verify**

Run: `npm test && npm run build -w examples/demo`
Expected: tests pass; build succeeds.

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no syntax errors.

- [ ] **Step 4: Manual demo check**

Run the demo (`npm run dev -w examples/demo`), generate a draft on a text step: the textarea shows the cream tint and "AI draft" badge. Type in it: tint and badge disappear. Mark a content-bearing hybrid step done, click Reopen: the step drops to Draft status and the gate counts it missing. Regenerate: tint returns.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx packages/react/src/OutputView.jsx
git commit -m "react: reopen via reopenStep, tint generated drafts (#3, #20)"
```

### Task 4: docs alignment and push

**Files:**
- Modify: `README.md` (RUN line in the architecture diagram)

- [ ] **Step 1: Update the README run shape**

Replace:

```
RUN (runtime state, separate from the definition)
  { idx, frontier, stepState: { [stepId]: { checkedDone, outputs } } }
```

with:

```
RUN (runtime state, separate from the definition)
  { idx, frontier, stepState: { [stepId]: { checkedDone, outputs, reopened?, generated? } } }
```

- [ ] **Step 2: Full check suite**

Run: `npm test && npm run build -w examples/demo`
Expected: green.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: step entry gains reopened and generated flags (#3, #20)"
git push
```
