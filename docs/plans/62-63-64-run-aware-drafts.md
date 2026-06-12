# run-aware drafts and validation, manual steps: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the draft pipeline run identity (#62), run-aware validators (#63), and a `manual` step flag that suppresses Generate (#64).

**Architecture:** Three small, mostly independent changes on one branch. Core gains an optional third validator argument `{ run, stepId }` threaded through the existing validation chain, plus a `manual` boolean in the definition schema. The react component passes `runId` in the draft context, forwards the third arg at its two direct validator calls, and gates the Generate affordances on `!step.manual`. Demo content exercises both new behaviors.

**Tech Stack:** Plain ESM JavaScript, zero-dependency `@sqnce/core`, raw-JSX `@sqnce/react`, Node built-in test runner (`node:test`), Vite demo.

**Execution tags (per CLAUDE.md):** each task is tagged `inline` or `delegate: sonnet`. Core-engine and semantic tasks are `inline`; mechanical data/doc tasks are `delegate: sonnet`. TDD is mandatory for the core tasks (1, 2); react and demo have no unit suite and are verified by the esbuild syntax check and `npm run build -w examples/demo`.

**Worktree:** all work happens in `.worktrees/62-63-64-run-aware-drafts` on branch `62-63-64-run-aware-drafts`. All paths below are relative to the repo root inside that worktree.

---

## Task 0: Worktree dependencies (inline)

The worktree has no `node_modules`; the workspace install must run inside it or tests and builds bundle the wrong packages.

- [ ] **Step 1: Install workspace dependencies**

Run from the worktree root:
```bash
npm install
```
Expected: completes without error; `node_modules` present at the worktree root.

- [ ] **Step 2: Baseline the suite**

Run: `npm test`
Expected: PASS (the existing engine suite is green before any change).

---

## Task 1: core run-aware validator third argument (#63) (inline, TDD)

**Files:**
- Modify: `packages/core/src/index.js` (`firstInvalidOutput`, `isStepComplete`, `gateProgress`, `buildContext`, validator JSDoc, header comment)
- Modify: `packages/core/test/fixtures/workflow.js` (add a run-aware validated output)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Extend the fixture with a run-aware validated output**

In `packages/core/test/fixtures/workflow.js`, give the `inventory` step's output a `validate` name (it is a non-required step, so this changes no gate counts; the validator only runs when the test supplies a `traceable` entry):

```js
{
  id: "inventory",
  name: "Inventory",
  outputs: [{ id: "data", type: "data", label: "Inventory", validate: "traceable" }],
},
```

Update the fixture header comment (the list around lines 5-8) to record the new coverage by changing `a validated output (\`validate\`),` to:

```
 * a validated output and a run-aware validated output (`validate`),
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/core/test/engine.test.js`:

```js
test("validators receive { run, stepId } as a third argument", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun(FIXTURE);
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  let seen = null;
  const validators = {
    facts: (value, spec, ctx) => {
      seen = ctx;
      return null;
    },
  };
  gateProgress(subs[0], run, { validators });
  assert.equal(seen.stepId, "intake");
  assert.equal(seen.run, run);
});

test("validators omitted run is undefined, not missing", () => {
  let captured = "absent";
  const entry = { outputs: { facts: { client: "x" } } };
  const step = { id: "intake", outputs: [{ id: "facts", type: "fields", validate: "facts" }] };
  const validators = {
    facts: (value, spec, ctx) => {
      captured = ctx;
      return null;
    },
  };
  isStepComplete(step, entry, "hybrid", validators);
  assert.equal(captured.run, undefined);
  assert.equal(captured.stepId, "intake");
});

test("a run-aware validator rejects based on another step's output", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun(FIXTURE);
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setOutput(run, "inventory", "data", [{ item: "laptop" }]);
  // traceable passes only when the run's intake step names a client.
  const traceable = {
    traceable: (value, spec, { run }) => {
      const facts = getStepEntry(run, "intake").outputs.facts;
      return facts && String(facts.client || "").trim() ? null : "Inventory is untraceable: intake has no client.";
    },
  };
  const inv = FIXTURE.mainStages[0].subStages[1].steps[2];
  assert.equal(isStepComplete(inv, getStepEntry(run, "inventory"), "hybrid", traceable, run), true);

  // Clear the client: the same inventory value now fails its run-aware check.
  let run2 = createRun(FIXTURE);
  run2 = setOutput(run2, "inventory", "data", [{ item: "laptop" }]);
  assert.equal(isStepComplete(inv, getStepEntry(run2, "inventory"), "hybrid", traceable, run2), false);
  assert.equal(buildContext(subs, run2, subs.length - 1, null, { validators: traceable }).includes("Inventory"), false);
});

test("a run-aware rejection blocks the gate and force still advances", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun(FIXTURE);
  // industry is present so hasValue(facts) is true and the validator runs;
  // client is blank so the run-aware check rejects.
  run = setOutput(run, "intake", "facts", { client: "", industry: "Tools" });
  run = setCheckedDone(run, "kickoff", true);
  // facts rejects when the run-derived client is blank.
  const validators = {
    facts: (value, spec, { run }) => {
      const facts = getStepEntry(run, "intake").outputs.facts;
      return facts && String(facts.client || "").trim() ? null : "Client name missing";
    },
  };
  const gp = gateProgress(subs[0], run, { validators });
  assert.equal(gp.met, false);
  assert.ok(gp.missing.some((m) => m.includes("Intake: Client name missing")));
  const forced = advance(run, subs, { force: true, validators });
  assert.equal(forced.frontier, 1);
  assert.equal(wasAdvanceForced(forced, 0), true);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. The third-argument tests fail because validators are called with two arguments today (`ctx` is `undefined`); `isStepComplete` ignores its 5th argument.

- [ ] **Step 4: Thread run through the validation chain**

In `packages/core/src/index.js`:

`firstInvalidOutput` gains a `run` parameter and passes the third argument:
```js
function firstInvalidOutput(step, entry, validators, run) {
  if (!validators) return null;
  for (const spec of step.outputs || []) {
    const fn = spec.validate && validators[spec.validate];
    if (!fn) continue;
    const val = (entry.outputs || {})[spec.id];
    if (!hasValue(spec, val)) continue;
    const message = fn(val, spec, { run, stepId: step.id });
    if (typeof message === "string") return { spec, message };
  }
  return null;
}
```

`isStepComplete` gains an optional 5th `run` parameter, forwarded:
```js
export function isStepComplete(step, entry, gateType = "hybrid", validators, run) {
  if (firstInvalidOutput(step, entry, validators, run)) return false;
  if (gateType === "strict") return !!entry.checkedDone;
  if (entry.checkedDone) return true;
  return !entry.reopened && stepHasAnyOutput(step, entry);
}
```

`gateProgress` forwards its `run` to both calls (the `required.forEach` body):
```js
required.forEach((s) => {
  const entry = getStepEntry(run, s.id);
  if (isStepComplete(s, entry, gateType, validators, run)) return;
  const invalid = firstInvalidOutput(s, entry, validators, run);
  missing.push(invalid ? `${s.name}: ${invalid.message}` : s.name);
});
```

`buildContext` forwards its `run` to `isStepComplete` (the `sub.steps.forEach` body):
```js
if (!isStepComplete(step, getStepEntry(run, step.id), gateType, validators, run)) return;
```

`mainGateProgress`, `runSummary`, and `advance` already pass `run` to `gateProgress`, so they need no change.

- [ ] **Step 5: Update validator JSDoc and the header comment**

In `packages/core/src/index.js`, replace every occurrence of the substring
`(value: any, spec: OutputSpec) => (string|null)`
with
`(value: any, spec: OutputSpec, ctx: { run: Run, stepId: string }) => (string|null)`
(9 occurrences: the `@param` lines for `firstInvalidOutput`, `isStepComplete`, `gateProgress`, `mainGateProgress`, the aggregate gate, `advance`, `buildContext`, `buildDraftPrompt`, and `runSummary`).

In the file header, change the validators line (around line 17) from
```
 *      { [name]: (value, spec) => string | null }. A returned string
```
to
```
 *      { [name]: (value, spec, { run, stepId }) => string | null }. The
 *      third argument carries the run (read other steps via
 *      getStepEntry) and the stepId. A returned string
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all new tests green, every prior test still green, including "all bundled definitions validate" and "the test fixture validates").

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.js packages/core/test/fixtures/workflow.js packages/core/test/engine.test.js
git commit -m "feat(core): run-aware validators via a third { run, stepId } argument (#63)"
```

---

## Task 2: core manual step flag schema (#64) (inline, TDD)

**Files:**
- Modify: `packages/core/src/index.js` (`validateDefinition`, `Step` typedef, header comment)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/engine.test.js`:

```js
test("validateDefinition checks the manual step flag", () => {
  const mk = (manual) => ({
    id: "d", name: "D",
    mainStages: [{ id: "m", subStages: [{ id: "s", steps: [
      { id: "st", manual, outputs: [{ id: "o", type: "text", label: "T" }] },
    ] }] }],
  });
  assert.deepEqual(validateDefinition(mk(true)), []);
  assert.deepEqual(validateDefinition(mk(undefined)), []);
  assert.ok(validateDefinition(mk("false")).some((p) => p.includes("manual must be a boolean")));
  assert.ok(validateDefinition(mk(1)).some((p) => p.includes("manual must be a boolean")));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. `validateDefinition` does not check `manual`, so the truthy-string and numeric cases produce no problem.

- [ ] **Step 3: Add the validateDefinition check**

In `packages/core/src/index.js`, inside the `(ss.steps || []).forEach((st) => {` loop, right after `stepIds.add(st.id);`:

```js
if (st.manual !== undefined && typeof st.manual !== "boolean")
  problems.push(`step "${st.id}": manual must be a boolean`);
```

- [ ] **Step 4: Document `manual` on the Step typedef**

In `packages/core/src/index.js`, add to the `Step` typedef (after `@property {string} [aiPrompt]`):
```js
 * @property {boolean} [manual] When true, the UI suppresses the Generate affordance; the step is human-entered.
```

In the file header, append to the gate/checklist area (after the `definition.subject` line, around line 24):
```
 *    - A step may carry an optional manual: true; the engine ignores it,
 *      the UI layer suppresses the draft action on that step.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (new test green, all prior tests still green).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): validate the manual step flag (#64)"
```

---

## Task 3: react runId in the generateDraft context (#62) (inline)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (`generate()` context, JSDoc)

- [ ] **Step 1: Add runId to the draft context**

In `generate()` (around line 394), change:
```js
      const text = await generateDraft(prompt, {
        workflowId: def.id,
        stepId: step.id,
        subject: subjectName,
      });
```
to:
```js
      const text = await generateDraft(prompt, {
        workflowId: def.id,
        stepId: step.id,
        subject: subjectName,
        runId: entry.id,
      });
```
(`entry` is the component-scope active run entry from `const entry = activeRunEntry(store, activeId);`, which `generate()` closes over.)

- [ ] **Step 2: Update the generateDraft JSDoc**

In the same file, update the two context-type mentions in the prop JSDoc (around lines 64 and 155) so the context reads `{ workflowId, stepId, subject, runId }`. For the line ~64 prose:
```
 *  - generateDraft (optional): async (prompt, context) => string where
 *    context is { workflowId, stepId, subject, runId }. runId is the
 *    active run entry id, for server-side generators that resolve the
 *    run from a shared store. Single-argument implementations keep working.
```
For the `@param` typedef around line 155, add `runId: string` to the context object type.

- [ ] **Step 3: Syntax check**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): include the active runId in the generateDraft context (#62)"
```

---

## Task 4: react run-aware validator call sites (#63) (inline)

`ProcessRolodex` reaches validators four ways: two direct calls (draft rejection, per-output invalid line) and two indirect calls through `isStepComplete` (`prevDoneBlocks`, `statusOf`). All four must pass `{ run, stepId }` (direct) or `run` (indirect) so a run-aware validator resolves consistently; otherwise a value can be gate-valid (gateProgress passes run) while the step status still reads draft and is excluded from the previous-context panel.

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (post-generation rejection, per-output invalid line, `prevDoneBlocks`, `statusOf`)

- [ ] **Step 1: Pass the third argument at the post-generation validator call**

In `generate()` (around line 405-406), change:
```js
      const fn = target.validate && validators && validators[target.validate];
      const message = fn ? fn(parsed.value, target) : null;
```
to:
```js
      const fn = target.validate && validators && validators[target.validate];
      const message = fn ? fn(parsed.value, target, { run, stepId: step.id }) : null;
```

- [ ] **Step 2: Pass the third argument at the per-output invalid line**

In the output render (around line 740-741), change:
```js
                            const checkFn = spec.validate && validators && validators[spec.validate];
                            const invalidMsg = checkFn && hasValue(spec, outVal) ? checkFn(outVal, spec) : null;
```
to:
```js
                            const checkFn = spec.validate && validators && validators[spec.validate];
                            const invalidMsg = checkFn && hasValue(spec, outVal) ? checkFn(outVal, spec, { run, stepId: step.id }) : null;
```
(`run` is the component-scope run; `step` is the current step in the `sub.steps.map` callback.)

- [ ] **Step 3: Pass run through the indirect isStepComplete call in prevDoneBlocks**

In `prevDoneBlocks` (around line 448), change:
```js
            isStepComplete(step, entry, gateTypeOf(prevSub), validators) && stepHasAnyOutput(step, entry)
```
to:
```js
            isStepComplete(step, entry, gateTypeOf(prevSub), validators, run) && stepHasAnyOutput(step, entry)
```

- [ ] **Step 4: Pass run through the indirect isStepComplete call in statusOf**

In `statusOf` (around line 463), change:
```js
    if (isStepComplete(step, entry, gateTypeOf(sub), validators)) return "done";
```
to:
```js
    if (isStepComplete(step, entry, gateTypeOf(sub), validators, run)) return "done";
```
(`run` is in component scope in both functions; these are the only two `isStepComplete` call sites in the file besides the import.)

- [ ] **Step 5: Syntax check**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): pass run context to validators in all four call sites (#63)"
```

---

## Task 5: react suppress Generate on manual steps (#64) (inline)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (invite-block gate, action-row gate)

- [ ] **Step 1: Compute canGenerate next to the target**

In the `sub.steps.map((step) => {` body (around line 668), where `const target = draftTarget(step);` is computed, add immediately after it:
```js
                  const canGenerate = !!generateDraft && !!target && !step.manual;
```

- [ ] **Step 2: Gate the invite block on canGenerate**

Around line 703, change:
```js
                            const isGenTarget = !!generateDraft && spec === target;
```
to:
```js
                            const isGenTarget = canGenerate && spec === target;
```

- [ ] **Step 3: Gate the action-row Generate button on canGenerate**

Around line 767, change:
```js
                            {generateDraft && target && (
```
to:
```js
                            {canGenerate && (
```

- [ ] **Step 4: Syntax check**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): suppress the Generate affordance on manual steps (#64)"
```

---

## Task 6: demo mark presales demo-data manual (#64) (delegate: sonnet)

**Files:**
- Modify: `definitions/presales.json` (the `demo-data` step)

- [ ] **Step 1: Add the manual flag**

In `definitions/presales.json`, locate the step with `"id": "demo-data"` and add `"manual": true` as a sibling key to its `"id"`/`"name"` (do not touch its outputs). Result shape:
```json
{
  "id": "demo-data",
  "name": "...",
  "manual": true,
  "outputs": [ ... unchanged ... ]
}
```

- [ ] **Step 2: Verify the definition still validates**

Run: `npm test`
Expected: PASS, including "all bundled definitions validate" (which now exercises the `manual` boolean check on real content).

- [ ] **Step 3: Commit**

```bash
git add definitions/presales.json
git commit -m "feat(demo): mark the presales demo-data step manual (#64)"
```

---

## Task 7: demo run-aware win-themes validator (#63) (inline)

**Files:**
- Modify: `examples/demo/src/App.jsx` (import `getStepEntry`, run-aware `win-themes` validator)
- Modify: `examples/demo/src/drafts.js` (win-themes draft references requirement ids)

- [ ] **Step 1: Add requirement references to the canned win-themes draft**

In `examples/demo/src/drafts.js`, change the `"win-themes"` entry so each theme carries a `requirement` referencing an id the `requirements` draft produces (R1, R2, R3):
```js
  "win-themes": (s) =>
    "```json\n" +
    JSON.stringify([
      { name: "Fastest time to value", purpose: `Lead with the six-week pilot plan for ${s}.`, requirement: "R1" },
      { name: "Platform consolidation", purpose: "One license replaces three point tools.", requirement: "R2" },
      { name: "Local delivery team", purpose: "Named consultants the customer already met.", requirement: "R3" },
    ]) +
    "\n```",
```

- [ ] **Step 2: Make the win-themes validator run-aware**

In `examples/demo/src/App.jsx`, extend the import from `@sqnce/react`. The demo imports `ProcessRolodex` from `@sqnce/react`; `getStepEntry` is a core export, so add a core import at the top:
```js
import { getStepEntry } from "@sqnce/core";
```
Then replace the `"win-themes"` validator in the `validators` map with a run-aware version that resolves each theme's `requirement` against the `requirements` step output (step id `requirements`, output id `out`):
```js
  "win-themes": (value, spec, ctx) => {
    if (!(Array.isArray(value) && value.length > 0 && value.every((t) => t && typeof t.name === "string" && typeof t.purpose === "string")))
      return "Win themes must be an array of { name, purpose } objects.";
    const reqEntry = ctx && ctx.run ? getStepEntry(ctx.run, "requirements") : null;
    const reqs = reqEntry && Array.isArray(reqEntry.outputs && reqEntry.outputs.out) ? reqEntry.outputs.out : [];
    const ids = new Set(reqs.map((r) => r && r.id));
    const bad = value.find((t) => t.requirement && !ids.has(t.requirement));
    return bad ? `Win theme "${bad.name}" references requirement ${bad.requirement}, which the requirements step does not define.` : null;
  },
```
(The two-argument `requirements` validator above it is unchanged, demonstrating both contracts coexisting. When the requirements step is empty, `ids` is empty and any present `requirement` ref is reported, which is the intended run-aware behavior.)

- [ ] **Step 3: Build the demo**

Run: `npm run build -w examples/demo`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/App.jsx examples/demo/src/drafts.js
git commit -m "feat(demo): run-aware win-themes validator resolving requirement refs (#63)"
```

---

## Task 8: docs (#62 #63 #64) (delegate: sonnet)

**Files:**
- Modify: `README.md`, `packages/react/README.md`, `CLAUDE.md`

- [ ] **Step 1: Root README**

In `README.md`, update the `generateDraft` example area (around line 88) and the validators paragraph (around line 92).

Change the line at ~88:
```
Both `persistence` and `generateDraft` are optional. Omit `persistence` for in-memory runs; omit `generateDraft` to hide the draft action entirely.
```
to add a sentence:
```
Both `persistence` and `generateDraft` are optional. Omit `persistence` for in-memory runs; omit `generateDraft` to hide the draft action entirely. The draft context passed to `generateDraft` is `{ workflowId, stepId, subject, runId }`; `runId` is the active run entry id, for server-side generators that resolve the run from a shared store. A step marked `manual: true` shows no Generate affordance at all.
```

In the validators paragraph (~92), change `(value, spec) => ...` to note the third argument:
```
A `validators` prop resolves the `validate` names declared on output specs: `validators={{ "win-themes": (value, spec, { run, stepId }) => Array.isArray(value) ? null : "Expected an array." }}`. The third argument carries the run (read other steps with `getStepEntry`) and the stepId, so a validator can relate one step's output to another. A returned string is the problem message: the owning step reads incomplete (gates, status, draft context) until the value is fixed, and the message appears in the gate footer. Validators are pure functions; omit the prop to validate nothing.
```

- [ ] **Step 2: react README**

In `packages/react/README.md`, update the `generateDraft` and `validators` bullets (lines 9-10):

Line 9 context type: change `context is { workflowId, stepId, subject }` to `context is { workflowId, stepId, subject, runId }`, and append to the bullet: ` A step marked \`manual: true\` shows no draft action.`

Line 10: change `(value, spec) => string | null` to `(value, spec, { run, stepId }) => string | null` and append: ` The third argument carries the run (read other steps with \`getStepEntry\`) and the stepId.`

- [ ] **Step 3: CLAUDE.md**

In `CLAUDE.md`, under "Architecture" point 2 (engine), the validators sentence: note that validators receive `(value, spec, { run, stepId })` and may read other steps via the run.

Under "Key behaviors to preserve", add two bullets (matching the existing voice, no em dashes):
```
- The generateDraft context carries the active run entry id as `runId`, so a server-side generator resolving the run from a shared store does not race the save debounce.
- A step may be marked `manual: true` to suppress the Generate affordance entirely (both the invite and the action-row button); manual steps are human-entered. Validators receive a third argument `{ run, stepId }` and can relate one step's output to another via `getStepEntry`.
```

- [ ] **Step 4: Commit**

```bash
git add README.md packages/react/README.md CLAUDE.md
git commit -m "docs: runId context, run-aware validators, manual steps (#62 #63 #64)"
```

---

## Task 9: regenerate types and full verification (inline)

**Files:**
- Modify: `packages/core/types/*.d.ts`, `packages/react/types/*.d.ts` (generated)

- [ ] **Step 1: Regenerate declarations**

Run: `npm run types`
Expected: regenerates `.d.ts` from the updated JSDoc into `packages/*/types`.

- [ ] **Step 2: Confirm the full suite, build, and syntax check**

Run, expecting all to pass:
```bash
npm test
npm run build -w examples/demo
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```

- [ ] **Step 3: Confirm there is no stale generated drift**

Run: `git status --porcelain`
Expected: only the regenerated `types/*.d.ts` files (if any) are pending. Stage and commit them; if `npm run types` produced no change, this step is a no-op.

- [ ] **Step 4: Commit (only if types changed)**

```bash
git add packages/core/types packages/react/types
git commit -m "chore: regenerate type declarations for #62 #63 #64"
```

---

## Self-Review

**Spec coverage:**
- #62 (runId in context) -> Task 3; docs Task 8.
- #63 (run-aware validators): core threading -> Task 1; react call sites -> Task 4; demo -> Task 7; docs Task 8.
- #64 (manual steps): core schema -> Task 2; react suppression -> Task 5; demo content -> Task 6; docs Task 8.
- Spec "Demo and definitions" -> Tasks 6, 7. Spec "Docs" -> Tasks 8, 9 (`npm run types`). Spec "Acceptance" engine tests -> Tasks 1, 2; demo acceptance -> manual confirmation after Task 7 (no UI suite).

**Placeholder scan:** every code step shows the exact code or command; no TBD/TODO.

**Type consistency:** the third validator argument is `{ run, stepId }` everywhere (core `firstInvalidOutput`, JSDoc, react Tasks 4/7, docs Task 8). `isStepComplete`'s new parameter is `run` (5th) consistently in Task 1 source and tests. The demo reads the requirements output as `getStepEntry(run, "requirements").outputs.out`, matching the confirmed step id `requirements` and output id `out`. `canGenerate` is defined once (Task 5 Step 1) and used in Steps 2-3.

## Out of scope (per spec)

Browser-side draft landing semantics; `runId` in the OutputView renderer context; async/throwing/built-in validators; persisting validation results; core refusing to build a draft prompt for a manual step; inferring `manual` from a missing `aiPrompt`.
