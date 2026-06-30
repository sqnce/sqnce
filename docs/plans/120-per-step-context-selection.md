# Per-step context selection (context views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a step name a context view of its prior outputs; the consumer supplies the implementation as a `contextViews` map of pure functions that core applies at serialization, so a step can be fed a selected subset of an upstream output without mutating run state.

**Architecture:** A new optional `contextView: "<name>"` on a `Step` names the view. `buildContext` treats the excluded (drafted) step as the target, resolves that name against a consumer-supplied `contextViews` map (threaded like `validators`), and binds the resolved function into each `serializeStep` call. `serializeStep` runs the bound function over each output's value before the presence check and formatting; the returned value is what serializes. Selection happens only on the local value being serialized; it never writes back to the run, so validators, gates, completion, status, and other steps' context are unaffected. Core never parses the value, so the `input-NNN` header convention stays in the consumer.

**Tech Stack:** Plain ESM JavaScript, no build step in `@sqnce/core`. Tests use Node's built-in runner (`node:test`, Node 20+). UI is `@sqnce/react` (React 19). Types are generated from JSDoc by `tsc` 5.9.3.

## Global Constraints

- `@sqnce/core` stays pure and dependency-free; renderers and validators (and now context views) never enter core except as arguments. (`CLAUDE.md`)
- Never use em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks. (`CLAUDE.md`)
- Brand is lowercase `sqnce` everywhere. License Apache-2.0.
- A context view is consumer-supplied, pure, must not throw; core does not catch (same contract as validators). Resolved by name; an absent map or unresolvable name means no view (full context, today's behavior). Never persisted.
- `input-NNN` header bytes in kept slices are preserved because core serializes the view's returned value verbatim and never strips it.
- Gates: `npm test` (all `*.test.js` in `packages/core` and `packages/react`), `npm run build -w examples/demo`, `npm run types` (must exit clean; generated `.d.ts` live under `packages/*/types/` which is gitignored, so nothing is committed from it; CI re-runs the real check).

---

## File Structure

- `packages/core/src/index.js`, the engine. Adds: `Step.contextView` typedef + file-header bullet; a `validateDefinition` step-level check; the `view`/`targetStepId` options in `serializeStep`; the `contextViews` resolution + threading in `buildContext`; JSDoc on `buildContext`/`buildDraftPrompt`.
- `packages/core/test/fixtures/workflow.js`, the core-owned fixture. Adds `contextView: "select"` to the `approve` step and one coverage-comment line.
- `packages/core/test/context-views.test.js`, NEW. All `#120` engine tests (schema validation, `serializeStep` view, `buildContext` resolution + selection, no-regression, header preservation, validator independence, pass-through, truncation order, end-to-end through `buildDraftPrompt`).
- `packages/react/src/Sqnce.jsx`, the draft host. Adds the optional `contextViews` prop and threads it into the single `buildDraftPrompt` call; JSDoc.
- `CLAUDE.md`, `README.md`, `packages/react/README.md`, docs.

**Not touched (deliberate):** `packages/react/src/RolodexView.jsx:144` calls `serializeStep(prevSub, step, run)` on the display path (rendering a previous card's stored output). It passes no view and stays that way: context views are a draft-prompt selection, not a change to what a committed output actually contains, so the display shows the real stored output. The new `serializeStep` options are optional, so this call is unchanged.

---

## Task 1: Definition schema, `contextView` on Step + validation

**Files:**
- Modify: `packages/core/src/index.js` (Step typedef near line 82-90; file header comment near line 28-30; `validateDefinition` step loop near line 439-440)
- Test: `packages/core/test/context-views.test.js` (new)

**Interfaces:**
- Produces: `Step.contextView?: string` (optional, non-empty when present). `validateDefinition(definition)` pushes `step "<id>": contextView must be a non-empty string` when present and empty or non-string.

- [ ] **Step 1: Write the failing test**, create `packages/core/test/context-views.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenSubStages,
  validateDefinition,
  createRun,
  setOutput,
  getStepEntry,
  isStepComplete,
  buildContext,
  buildDraftPrompt,
  serializeStep,
} from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js";

// ---- shared helpers (consumer-style, proving core never needs the format) ----
const MATERIALS =
  "=== [input-001] a.md ===\n\nalpha body\n\n=== [input-002] b.md ===\n\nbeta body";
function splitByHeader(text) {
  const re = /^=== \[(input-\d{3})\] .*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ id: m[1], start: m.index });
  return marks.map((mk, i) => ({
    id: mk.id,
    slice: text.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : text.length),
  }));
}
const keepOnly = (text, ids) =>
  splitByHeader(text)
    .filter((s) => ids.has(s.id))
    .map((s) => s.slice)
    .join("")
    .trimEnd();

test("validateDefinition accepts a non-empty contextView on a step", () => {
  // FIXTURE's approve step carries contextView: "select" (added in this task's fixture edit).
  assert.deepEqual(validateDefinition(FIXTURE), []);
});

test("validateDefinition rejects an empty or non-string contextView", () => {
  const bad = structuredClone(FIXTURE);
  // approve is the single step in omega/signoff
  bad.mainStages[1].subStages[0].steps[0].contextView = "  ";
  assert.ok(
    validateDefinition(bad).some((p) => /contextView must be a non-empty string/.test(p)),
    "empty contextView must be reported"
  );
  const bad2 = structuredClone(FIXTURE);
  bad2.mainStages[1].subStages[0].steps[0].contextView = 5;
  assert.ok(validateDefinition(bad2).some((p) => /contextView must be a non-empty string/.test(p)));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/dev/sqnce-worktrees/120-per-step-context-selection && node --test packages/core/test/context-views.test.js`
Expected: the rejection test FAILS (the real red test: `validateDefinition` does not yet push a `contextView` problem, so `.some(...)` is false). The acceptance test (`validateDefinition(FIXTURE)` deepEqual `[]`) passes trivially at this point and only becomes meaningful after Step 6 adds a valid `contextView` to the fixture, where it guards that a valid `contextView` is accepted (green stays green). Treat the rejection test as the failing test that drives the implementation.

- [ ] **Step 3: Add the `contextView` check to `validateDefinition`**, in `packages/core/src/index.js`, in the step loop, immediately after the `manual` check (`step "${st.id}": manual must be a boolean`):

```js
        if (st.manual !== undefined && typeof st.manual !== "boolean")
          problems.push(`step "${st.id}": manual must be a boolean`);
        if (
          st.contextView !== undefined &&
          (typeof st.contextView !== "string" || !st.contextView.trim())
        )
          problems.push(`step "${st.id}": contextView must be a non-empty string`);
```

- [ ] **Step 4: Add `contextView` to the `Step` typedef**, in `packages/core/src/index.js`, in the `@typedef {Object} Step` block, after the `manual` property:

```js
 * @property {boolean} [manual] When true, the UI suppresses the Generate affordance; the step is human-entered.
 * @property {string} [contextView] Names a consumer-supplied context view (in the contextViews map) that selects what this step sees of prior outputs when its draft prompt is built. Free string, resolved by name, never whitelisted.
 * @property {OutputSpec[]} [outputs]
```

- [ ] **Step 5: Add a file-header bullet**, in `packages/core/src/index.js`, in the leading file comment, after the `manual: true` bullet (around line 28-30):

```js
 *    - A step may carry an optional manual: true; the engine ignores it,
 *      the UI layer suppresses the draft action on that step.
 *    - A step may carry an optional contextView: "<name>", a free string
 *      resolved against a consumer-supplied contextViews map
 *      { [name]: (value, spec, { run, sourceStepId, targetStepId }) => value }.
 *      When building that step's draft prompt, each prior output's value is
 *      passed through the named view before serialization; the view selects
 *      what this step sees (it never mutates run state). Unresolvable names
 *      mean no view (full context). The engine never parses the value.
```

- [ ] **Step 6: Add `contextView` to the `approve` step in the fixture**, in `packages/core/test/fixtures/workflow.js`, the `approve` step in `omega`/`signoff`:

```js
            {
              id: "approve",
              name: "Approve",
              required: true,
              contextView: "select",
              outputs: [{ id: "memo", type: "text", label: "Memo" }],
            },
```

And extend the fixture's coverage comment (the `Coverage floor:` list) by adding `a step with a contextView,` to the enumerated items.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test packages/core/test/context-views.test.js`
Expected: PASS (2 tests). Then run the full core suite to confirm no regression from the fixture edit: `node --test packages/core/test/*.test.js`, Expected: all pass (the existing `validateDefinition(FIXTURE)` deepEqual `[]` still holds; `contextView` is inert without a `contextViews` map).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.js packages/core/test/fixtures/workflow.js packages/core/test/context-views.test.js
git commit -m "feat(core): contextView on Step, validated as a non-empty string (#120)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `serializeStep` applies a context view

**Files:**
- Modify: `packages/core/src/index.js` (`serializeStep`, near line 1307-1332)
- Test: `packages/core/test/context-views.test.js`

**Interfaces:**
- Consumes: `Step.contextView` (Task 1).
- Produces: `serializeStep(subStage, step, run, { maxChars = 2500, view, targetStepId })`. When `view` is a function, each output value is replaced by `view(value, spec, { run, sourceStepId: step.id, targetStepId })` before the `hasValue` check and formatting. Omitting `view` is byte-identical to today. A view returning an empty/absent value drops that output (and the block if it was the only output).

- [ ] **Step 1: Write the failing tests**, append to `packages/core/test/context-views.test.js`:

```js
test("serializeStep applies a view to each output value before formatting", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);

  // no view -> full materials, both inputs present
  const full = serializeStep(collect, summary, run, { maxChars: Infinity });
  assert.match(full, /\[input-001\]/);
  assert.match(full, /\[input-002\]/);

  // view keeping only input-001
  const view = (value, spec, ctx) =>
    ctx.sourceStepId === "summary" ? keepOnly(value, new Set(["input-001"])) : value;
  const trimmed = serializeStep(collect, summary, run, { maxChars: Infinity, view, targetStepId: "approve" });
  assert.match(trimmed, /\[input-001\] a\.md/); // header bytes preserved
  assert.doesNotMatch(trimmed, /\[input-002\]/); // dropped
  assert.match(trimmed, /alpha body/);
  assert.doesNotMatch(trimmed, /beta body/);
});

test("serializeStep view receives sourceStepId and targetStepId", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", "x");
  let seen = null;
  const view = (value, spec, ctx) => {
    seen = ctx;
    return value;
  };
  serializeStep(collect, summary, run, { view, targetStepId: "approve" });
  assert.equal(seen.sourceStepId, "summary");
  assert.equal(seen.targetStepId, "approve");
  assert.equal(seen.run, run);
});

test("serializeStep view returning an empty value drops the block", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const view = () => ""; // suppress
  assert.equal(serializeStep(collect, summary, run, { view, targetStepId: "approve" }), null);
});

test("serializeStep selection runs before the maxChars truncation", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  // a view that returns a 40-char string; budget of 10 must still truncate the SELECTED text
  const view = () => "0123456789abcdefghijklmnopqrstuvwxyzABCD";
  const block = serializeStep(collect, summary, run, { maxChars: 10, view, targetStepId: "approve" });
  assert.match(block, /\n\[truncated\]$/);
  assert.match(block, /0123456789\n\[truncated\]$/);
});

test("serializeStep without a view is unchanged", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  assert.equal(
    serializeStep(collect, summary, run, { maxChars: Infinity }),
    serializeStep(collect, summary, run, { maxChars: Infinity, view: undefined, targetStepId: "approve" })
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/context-views.test.js`
Expected: FAIL. `serializeStep` ignores `view`, so the trimmed/suppress/truncate tests fail (full materials returned, block not dropped).

- [ ] **Step 3: Implement the view in `serializeStep`**, in `packages/core/src/index.js`, change the signature and the per-output read:

```js
export function serializeStep(subStage, step, run, { maxChars = 2500, view, targetStepId } = {}) {
  const entry = getStepEntry(run, step.id);
  const parts = [];
  (step.outputs || []).forEach((spec) => {
    let val = (entry.outputs || {})[spec.id];
    if (typeof view === "function") val = view(val, spec, { run, sourceStepId: step.id, targetStepId });
    if (!hasValue(spec, val)) return;
```

(The remainder of `serializeStep` is unchanged: it formats `val` per type, joins, truncates at `maxChars` with the `[truncated]` marker.)

- [ ] **Step 4: Update the `serializeStep` JSDoc**, extend its options block:

```js
 * @param {{ maxChars?: number, view?: (value: any, spec: OutputSpec, ctx: { run: Run, sourceStepId: string, targetStepId?: string }) => any, targetStepId?: string }} [opts]
 *   maxChars: block budget (default 2500; Infinity disables truncation).
 *   view: when present, each output's value passes through it before the
 *   presence check and formatting; the returned value is serialized.
 *   targetStepId: the draft target, forwarded to view as ctx.targetStepId.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test packages/core/test/context-views.test.js`
Expected: PASS (all tests in the file so far).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.js packages/core/test/context-views.test.js
git commit -m "feat(core): serializeStep applies an optional per-output view (#120)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `buildContext` resolves `contextView` and threads the view

**Files:**
- Modify: `packages/core/src/index.js` (`buildContext`, near line 1351-1390; `buildDraftPrompt` JSDoc near line 1402)
- Test: `packages/core/test/context-views.test.js`

**Interfaces:**
- Consumes: `Step.contextView` (Task 1), `serializeStep({ view, targetStepId })` (Task 2).
- Produces: `buildContext(subStages, run, flatIdx, excludeStepId, { maxCharsPerStep, validators, contextViews })`. The draft target is the step whose id is `excludeStepId`; core resolves its `contextView` against `contextViews` and binds the function (or none). `buildDraftPrompt` already forwards `opts`, so `contextViews` flows through unchanged. No view resolves when `contextViews` is absent, the name is missing, the step has no `contextView`, or `excludeStepId` is empty/absent.

- [ ] **Step 1: Write the failing tests**, append to `packages/core/test/context-views.test.js`:

```js
// helper: flat index of the sub-stage containing a step
const idxOf = (subs, stepId) => subs.findIndex((s) => (s.steps || []).some((st) => st.id === stepId));
const views = {
  select: (value, spec, ctx) =>
    ctx.sourceStepId === "summary" ? keepOnly(value, new Set(["input-001"])) : value,
  suppress: (value, spec, ctx) => (ctx.sourceStepId === "summary" ? "" : value),
};

test("buildContext resolves the target's contextView and trims that source", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const ai = idxOf(subs, "approve");

  // no contextViews -> full materials (today's behavior)
  const full = buildContext(subs, run, ai, "approve");
  assert.match(full, /\[input-001\]/);
  assert.match(full, /\[input-002\]/);

  // contextViews + approve.contextView "select" -> only input-001
  const selected = buildContext(subs, run, ai, "approve", { contextViews: views });
  assert.match(selected, /\[input-001\] a\.md/);
  assert.doesNotMatch(selected, /\[input-002\]/);
});

test("buildContext view is a no-op when the name is unresolvable or absent", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const ai = idxOf(subs, "approve");
  const full = buildContext(subs, run, ai, "approve");

  // contextViews present but the name "select" missing from the map
  assert.equal(buildContext(subs, run, ai, "approve", { contextViews: {} }), full);
  // a step without a contextView (summary) is unaffected even with a map present
  const si = idxOf(subs, "summary");
  assert.equal(
    buildContext(subs, run, si, "evidence", { contextViews: views }),
    buildContext(subs, run, si, "evidence")
  );
  // empty excludeStepId resolves no view
  assert.equal(buildContext(subs, run, ai, "", { contextViews: views }), buildContext(subs, run, ai, ""));
});

test("buildContext suppress view drops the materials block entirely", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  // re-target approve's contextView to "suppress" via a cloned definition
  const def = structuredClone(FIXTURE);
  def.mainStages[1].subStages[0].steps[0].contextView = "suppress";
  const subs2 = flattenSubStages(def);
  const ai = idxOf(subs2, "approve");
  const ctx = buildContext(subs2, run, ai, "approve", { contextViews: views });
  assert.doesNotMatch(ctx, /Summary/); // the summary block (its only content was materials) is gone
  assert.doesNotMatch(ctx, /input-001/);
});

test("buildContext non-targeted prior outputs pass through unchanged under a view", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  run = setOutput(run, "inventory", "data", [{ note: "keep me" }]);
  const ai = idxOf(subs, "approve");
  const ctx = buildContext(subs, run, ai, "approve", { contextViews: views });
  // summary trimmed, but inventory (sourceStepId !== "summary") is untouched
  assert.match(ctx, /keep me/);
  assert.doesNotMatch(ctx, /\[input-002\]/);
});

test("a view trimming a source does not change run state or validator-gated completion", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  run = setOutput(run, "inventory", "data", [{ ref: "input-002" }]);
  const before = structuredClone(run);
  // traceable: each inventory ref must appear in summary's FULL materials, read via ctx.run
  const validators = {
    traceable: (value, spec, { run }) => {
      const mat = getStepEntry(run, "summary").outputs.out || "";
      return value.every((it) => mat.includes(`[${it.ref}]`)) ? null : "ref not in materials";
    },
  };
  const ai = idxOf(subs, "approve");
  const ctx = buildContext(subs, run, ai, "approve", { contextViews: views, validators });

  // the view never mutates the run
  assert.deepEqual(run, before);
  // inventory cites input-002, which the view dropped from summary's serialized slice...
  assert.doesNotMatch(ctx, /\[input-002\] b\.md/);
  // ...but inventory is still complete & included, because the validator reads run state (full materials)
  const inv = subs.flatMap((s) => s.steps || []).find((st) => st.id === "inventory");
  assert.equal(isStepComplete(inv, getStepEntry(run, "inventory"), "hybrid", validators, run), true);
  assert.match(ctx, /Inventory/); // inventory block present (its validator passed on the intact run)
});

test("buildDraftPrompt threads contextViews end-to-end", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const approve = subs.flatMap((s) => s.steps || []).find((st) => st.id === "approve");
  const ai = idxOf(subs, "approve");
  const prompt = buildDraftPrompt(FIXTURE, subs, run, ai, approve, { contextViews: views });
  assert.match(prompt, /\[input-001\]/);
  assert.doesNotMatch(prompt, /\[input-002\]/);
  // omitted contextViews -> full materials in the prompt
  const fullPrompt = buildDraftPrompt(FIXTURE, subs, run, ai, approve);
  assert.match(fullPrompt, /\[input-002\]/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/context-views.test.js`
Expected: FAIL. `buildContext` ignores `contextViews`, so selection tests fail (full materials returned).

- [ ] **Step 3: Implement resolution + threading in `buildContext`**, in `packages/core/src/index.js`, change the signature and add resolution right after `const r = normalizeFlat(...)`:

```js
export function buildContext(subStages, run, flatIdx, excludeStepId, { maxCharsPerStep, validators, contextViews } = {}) {
  const forked = subStages.some((s) => s.track !== undefined);
  const r = normalizeFlat(subStages, run);
  // #120: the draft target is the excluded step; resolve its named context view (if any)
  // against the consumer-supplied contextViews map. An absent map, an unresolvable name,
  // a step without contextView, or an empty excludeStepId all yield no view (full context).
  let viewFn;
  if (excludeStepId && contextViews) {
    let targetStep;
    for (const s of subStages) {
      const st = (s.steps || []).find((x) => x.id === excludeStepId);
      if (st) { targetStep = st; break; }
    }
    const name = targetStep && targetStep.contextView;
    if (typeof name === "string" && name && typeof contextViews[name] === "function") viewFn = contextViews[name];
  }
```

Then thread the bound view and target id into the `serializeStep` call inside the loop:

```js
      const block = serializeStep(sub, step, r, { maxChars: maxCharsPerStep, view: viewFn, targetStepId: excludeStepId });
      if (block) blocks.push(block);
```

- [ ] **Step 4: Update the `buildContext` and `buildDraftPrompt` JSDoc**, extend each options block to mention `contextViews`:

`buildContext`:
```js
 * @param {{ maxCharsPerStep?: number, validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>, contextViews?: Object<string, (value: any, spec: OutputSpec, ctx: { run: Run, sourceStepId: string, targetStepId?: string }) => any> }} [opts]
 *   maxCharsPerStep forwards as serializeStep's maxChars (default 2500).
 *   contextViews: resolved by the excluded (target) step's contextView name;
 *   the bound view selects what the target sees of each prior output at
 *   serialization, never mutating run state.
```

`buildDraftPrompt`: append to its `@param` opts line the same `contextViews?: ...` member, and a sentence: `contextViews forwards to buildContext.`

- [ ] **Step 5: Run the file tests, then the full core suite**

Run: `node --test packages/core/test/context-views.test.js`, Expected: PASS (all).
Run: `node --test packages/core/test/*.test.js`, Expected: all pass, no regression.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.js packages/core/test/context-views.test.js
git commit -m "feat(core): buildContext resolves a target's contextView and threads it (#120)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `@sqnce/react`, `contextViews` prop on the draft host

**Files:**
- Modify: `packages/react/src/Sqnce.jsx` (component props + the `buildDraftPrompt` call near line 443; the props JSDoc near line 193/202)

**Interfaces:**
- Consumes: `buildDraftPrompt(..., { contextViews })` (Task 3).
- Produces: `Sqnce` gains an optional `contextViews` prop, passed into the draft call beside `validators`. The component works unchanged when the prop is omitted.

- [ ] **Step 1: Add the prop to the component signature**, in `packages/react/src/Sqnce.jsx`, add `contextViews` to the destructured props (the line beginning `export default function Sqnce({ workflows, persistence, ... })`):

```jsx
export default function Sqnce({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, contextViews, generatedBadge, renderRunHeader, runStatus, renderStageStatus, reconcileRun }) {
```

- [ ] **Step 2: Thread it into the draft prompt**, change the single `buildDraftPrompt` call (near line 443):

```jsx
      const prompt = buildDraftPrompt(def, subs, run, idx, step, { validators, contextViews });
```

- [ ] **Step 3: Document the prop**, in the `Sqnce` props JSDoc block, after the `validators` `@property`, add:

```jsx
 * @property {Object<string, (value: any, spec: import("@sqnce/core").OutputSpec, ctx: { run: import("@sqnce/core").Run, sourceStepId: string, targetStepId?: string }) => any>} [contextViews] Map of context-view name to a pure selector; a step's `contextView` names one. Applied to prior outputs when building that step's draft prompt; optional, the component works without it.
```

Also add a one-line mention in the prose prop list near line 87 (where `validators (optional): map of validator name -> ...` is listed): `- contextViews (optional): map of context-view name -> selector; a step's contextView names one.`

- [ ] **Step 4: Syntax-check the JSX**

Run: `npx esbuild packages/react/src/Sqnce.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no errors (a clean build to `/dev/null`).

- [ ] **Step 5: Run the react test suite (no regression)**

Run: `node --test packages/react/test/*.test.js`
Expected: all pass (the existing suites are unaffected; the new prop is optional and inert when omitted).

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/Sqnce.jsx
git commit -m "feat(react): contextViews prop threads into buildDraftPrompt (#120)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Docs + types + full gate run

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `packages/react/README.md`

- [ ] **Step 1: Update `CLAUDE.md`**, in the Architecture section's Definitions bullet (item 1), after the `validate` sentence, add: `Any step may also carry an optional `contextView: "<name>"`, a free string (non-empty, never whitelisted) resolved against a consumer-supplied `contextViews` map; it names how the step sees prior outputs in its draft prompt.` In "Key behaviors to preserve", add a bullet:

```
- A step may declare `contextView: "<name>"`, resolved against a consumer-supplied `contextViews` map of pure functions. When core builds that step's draft prompt, each prior output's value passes through the named view (`(value, spec, { run, sourceStepId, targetStepId }) => value`) at serialization only: it selects what the step sees and never mutates run state, so validators, gates, completion, status, runSummary, and other steps' context are unaffected. An absent map, an unresolvable name, or no `contextView` means the full context (no regression). Core never parses the value, so a consumer's slice headers (for example `=== [input-NNN] ===`) survive because core serializes the returned value verbatim. Views never enter core except as arguments.
```

- [ ] **Step 2: Update the `contextViews` injected-prop note in `CLAUDE.md`**, in Architecture item 3 (UI), where it lists injected props (`persistence`, `generateDraft`, `renderers`, `validators`), add `contextViews` to the same list as another injected, optional prop the component works without.

- [ ] **Step 3: Update `README.md`**, wherever the `validators` consumer prop / draft generation is documented, add a sentence: a step may name a `contextView`, and a `contextViews` map of pure selectors controls what each step sees of prior outputs in its draft prompt (selection at serialization, run state untouched, slice headers preserved). Keep it brief and consistent with the existing `validators` description.

- [ ] **Step 4: Update `packages/react/README.md`**, add `contextViews` to the documented optional props of the component, mirroring the `validators` entry: `contextViews` (optional): map of context-view name to a pure selector; a step's `contextView` names one; applied to prior outputs when building that step's draft prompt.

- [ ] **Step 5: Regenerate types and confirm clean**

Run: `npm run types`
Expected: exits 0 with no errors. The generated `.d.ts` under `packages/*/types/` are gitignored (`.gitignore` has `packages/*/types/`), so there is nothing to commit from it; CI re-runs the real check. If `tsc` surfaces an error about the new JSDoc, fix the JSDoc and re-run.

- [ ] **Step 6: Run all gates**

```bash
npm test
npm run build -w examples/demo
npm run types
```
Expected: `npm test` all pass (core + react); demo build succeeds; `npm run types` exits clean. Capture the output; do not claim green without it.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md packages/react/README.md
git commit -m "docs: contextView / contextViews per-step context selection (#120)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Schema (`contextView` + validation) → Task 1. `serializeStep` view → Task 2. `buildContext` resolution from the excluded target + threading, no-op cases, header preservation, validator independence, pass-through, truncation order, end-to-end `buildDraftPrompt` → Task 3. `@sqnce/react` `contextViews` prop → Task 4. Docs + types + gates → Task 5. The spec's "core-owned fixture, never bundled content" is honored (tests use `FIXTURE` and inline values, never `definitions/`). The spike's seven assertions map onto Task 2/3 tests (baseline, cited/retrieved/suppressed-style selection, unresolvable no-op, validator independence, header preservation).

**Placeholder scan:** none; every code step shows the actual code, every command its expected output.

**Type consistency:** `contextView` (Step field) and `contextViews` (map) are used consistently across Tasks 1-5; the view signature `(value, spec, { run, sourceStepId, targetStepId }) => value` matches in the typedef (Task 1), `serializeStep` (Task 2), `buildContext`/`buildDraftPrompt` JSDoc (Task 3), and the `Sqnce` prop JSDoc (Task 4).
