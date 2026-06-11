# context budget, output validators, generation into data outputs: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/specs/52-53-54-draft-pipeline.md`: a configurable context budget through the prompt-building chain (#52), consumer-supplied output validators enforced by completion and gates (#54), and draft generation into `data` outputs with parse and validation (#53).

**Architecture:** All semantics land in `@sqnce/core` as pure functions with TDD (an options object threads `maxCharsPerStep` and `validators` through the existing call graph; new helpers `draftTarget` and `parseDraft`). `@sqnce/react` only threads the new `validators` prop into existing calls and extends the generate flow. Demo content and docs follow.

**Tech Stack:** Plain ESM JavaScript, Node's built-in test runner (`node:test`), React (JSX, no build step in core).

**Worktree:** `.worktrees/52-53-54-draft-pipeline`, branch `52-53-54-draft-pipeline`, PR #56.

**Task tags:** every task is `inline` or `delegate: sonnet` per CLAUDE.md. Run all commands from the worktree root.

---

### Task 1: serializeStep single-point truncation with marker (#52) [inline]

**Files:**
- Modify: `packages/core/src/index.js:622-646` (serializeStep)
- Test: `packages/core/test/engine.test.js` (replace test at :315-326, add new)

- [ ] **Step 1: Replace the capped-JSON test and add budget tests**

Replace the test `"serializeStep serializes data outputs as capped JSON"` (engine.test.js:315-326) with:

```js
test("serializeStep truncates at maxChars with a marker, inner caps removed", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "Step", outputs: [{ id: "o", type: "data", label: "Inventory" }] };
  let run = createRun();
  run = setOutput(run, "st", "o", { tables: [{ name: "Account" }] });
  const block = serializeStep(sub, step, run);
  assert.ok(block.includes("Inventory:"));
  assert.ok(block.includes('{"tables":[{"name":"Account"}]}'));
  assert.ok(!block.includes("[truncated]"));

  run = setOutput(run, "st", "o", { big: "x".repeat(5000) });
  const capped = serializeStep(sub, step, run);
  assert.ok(capped.endsWith("\n[truncated]"));
  assert.ok(capped.length < 2600);

  const unlimited = serializeStep(sub, step, run, { maxChars: Infinity });
  assert.ok(unlimited.includes("x".repeat(5000)), "Infinity disables truncation entirely");
  assert.ok(!unlimited.includes("[truncated]"));

  const tight = serializeStep(sub, step, run, { maxChars: 10 });
  assert.ok(tight.endsWith("\n[truncated]"));
});

test("serializeStep no longer inner-caps file content", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "Step", outputs: [{ id: "f", type: "file", label: "Doc" }] };
  let run = createRun();
  run = setOutput(run, "st", "f", { name: "big.txt", content: "y".repeat(3000) });
  const block = serializeStep(sub, step, run, { maxChars: Infinity });
  assert.ok(block.includes("y".repeat(3000)), "file content above 2000 chars survives a big budget");
});
```

- [ ] **Step 2: Run tests, confirm the new ones fail**

Run: `npm test`
Expected: the two new tests FAIL (no `[truncated]` marker, file content cut at 2000); everything else passes.

- [ ] **Step 3: Implement**

In `serializeStep` (packages/core/src/index.js), change the file and data part pushes and the return:

```js
    if (spec.type === "file")
      parts.push(`Attached file: ${val.name}\n${val.content || ""}`);
    if (spec.type === "data")
      parts.push(`${spec.label || "Data"}:\n${JSON.stringify(val)}`);
  });
  if (!parts.length) return null;
  const joined = parts.join("\n");
  const body =
    joined.length > maxChars ? `${joined.slice(0, maxChars)}\n[truncated]` : joined;
  return `### ${subStage.mainName} / ${subStage.name} / ${step.name}\n${body}`;
```

Update the function's JSDoc: the `@param` for opts becomes `@param {{ maxChars?: number }} [opts] Block budget in characters, default 2500; Infinity disables truncation. A truncated block ends with a "[truncated]" line.`

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: serializeStep truncates only at maxChars, with marker (#52)"
```

---

### Task 2: thread maxCharsPerStep through buildContext and buildDraftPrompt (#52) [inline]

**Files:**
- Modify: `packages/core/src/index.js:663-704` (buildContext, buildDraftPrompt)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write failing tests**

Add after the existing `"buildDraftPrompt carries sibling context and the step task"` test:

```js
test("maxCharsPerStep threads from buildDraftPrompt and buildContext to serializeStep", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Acme", industry: "x".repeat(4000) });
  const summary = subs[1].steps.find((s) => s.id === "summary");

  const capped = buildContext(subs, run, 1, "summary");
  assert.ok(capped.includes("[truncated]"), "default budget truncates the long block");

  const full = buildContext(subs, run, 1, "summary", { maxCharsPerStep: Infinity });
  assert.ok(full.includes("x".repeat(4000)), "Infinity budget passes the block whole");
  assert.ok(!full.includes("[truncated]"));

  const prompt = buildDraftPrompt(FIXTURE, subs, run, 1, summary, { maxCharsPerStep: Infinity });
  assert.ok(prompt.includes("x".repeat(4000)), "the option reaches the prompt");

  const defaultPrompt = buildDraftPrompt(FIXTURE, subs, run, 1, summary);
  assert.ok(defaultPrompt.includes("[truncated]"), "omitting the option keeps the default budget");
});
```

- [ ] **Step 2: Run tests, confirm the new one fails**

Run: `npm test`
Expected: FAIL (buildContext does not accept options yet).

- [ ] **Step 3: Implement**

Change the two signatures and the serializeStep call:

```js
export function buildContext(subStages, run, flatIdx, excludeStepId, { maxCharsPerStep, validators } = {}) {
```

(the `validators` key is wired in Task 4; accepting it now keeps the signature stable). Inside, the serializeStep call becomes:

```js
      const block = serializeStep(sub, step, run, { maxChars: maxCharsPerStep });
```

(`maxChars: undefined` falls through to serializeStep's 2500 default by destructuring.)

```js
export function buildDraftPrompt(definition, subStages, run, subIdx, step, opts = {}) {
  const subStage = subStages[subIdx];
  const subject = resolveSubject(definition, run);
  const ctx = buildContext(subStages, run, subIdx, step.id, opts);
```

Update both functions' JSDoc with `@param {{ maxCharsPerStep?: number, validators?: Object<string, (value: any, spec: OutputSpec) => (string|null)> }} [opts]`.

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: thread maxCharsPerStep through buildContext and buildDraftPrompt (#52)"
```

---

### Task 3: validator-aware step completion (#54) [inline]

**Files:**
- Modify: `packages/core/src/index.js:437-441` (isStepComplete), new internal helper above it
- Modify: `packages/core/test/fixtures/workflow.js` (validate on the intake facts output, header comment)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Extend the fixture**

In `packages/core/test/fixtures/workflow.js`, the intake facts output gains a validator name:

```js
              outputs: [
                {
                  id: "facts",
                  type: "fields",
                  label: "Facts",
                  validate: "facts",
                  fields: [
                    { key: "client", label: "Client" },
                    { key: "industry", label: "Industry" },
                  ],
                },
              ],
```

In the fixture's header comment, extend the coverage floor list: after "a render hint," add "a validated output (`validate`),".

- [ ] **Step 2: Write failing tests**

Add to `packages/core/test/engine.test.js`:

```js
const FACTS_VALIDATORS = {
  facts: (value) => (String(value.client || "").trim() ? null : "Client name missing"),
};

test("an invalid present output makes its step incomplete, done flag included", () => {
  const step = FIXTURE.mainStages[0].subStages[0].steps[0]; // intake
  let run = createRun();
  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  const entry = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, entry, "hybrid"), true, "without validators: unchanged");
  assert.equal(isStepComplete(step, entry, "hybrid", FACTS_VALIDATORS), false);

  run = setCheckedDone(run, "intake", true);
  const done = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, done, "hybrid", FACTS_VALIDATORS), false, "done cannot bless invalid");
  assert.equal(isStepComplete(step, done, "strict", FACTS_VALIDATORS), false, "strict too");

  run = setOutput(run, "intake", "facts", { client: "Acme" });
  const fixed = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, fixed, "hybrid", FACTS_VALIDATORS), true);
});

test("validators run only on present values and only when resolvable", () => {
  const step = FIXTURE.mainStages[0].subStages[0].steps[0]; // intake
  let calls = 0;
  const counting = { facts: (v) => { calls += 1; return "always invalid"; } };

  const empty = getStepEntry(createRun(), "intake");
  assert.equal(isStepComplete(step, empty, "hybrid", counting), false, "incomplete for emptiness, not validity");
  assert.equal(calls, 0, "no value, validator never runs");

  let run = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  const entry = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, entry, "hybrid", { other: () => "nope" }), true, "unresolvable name: unvalidated");
  assert.equal(isStepComplete(step, entry, "hybrid", {}), true, "empty map: unvalidated");
});
```

- [ ] **Step 3: Run tests, confirm the new ones fail**

Run: `npm test`
Expected: the two new tests FAIL (isStepComplete ignores the 4th argument).

- [ ] **Step 4: Implement**

Above `isStepComplete` in `packages/core/src/index.js` add:

```js
/**
 * First invalid present output of a step, or null. An output is invalid
 * when it names a validator (`spec.validate`), the validators map
 * resolves the name, the value is present (`hasValue`), and the
 * validator returns a string message. Validators must be pure and must
 * not throw; the engine does not catch.
 * @param {Step} step
 * @param {StepEntry} entry
 * @param {Object<string, (value: any, spec: OutputSpec) => (string|null)>} [validators]
 * @returns {{ spec: OutputSpec, message: string } | null}
 */
function firstInvalidOutput(step, entry, validators) {
  if (!validators) return null;
  for (const spec of step.outputs || []) {
    const fn = spec.validate && validators[spec.validate];
    if (!fn) continue;
    const val = (entry.outputs || {})[spec.id];
    if (!hasValue(spec, val)) continue;
    const message = fn(val, spec);
    if (typeof message === "string") return { spec, message };
  }
  return null;
}
```

Change `isStepComplete`:

```js
/**
 * Is a step complete under a gate type?
 * hybrid: explicit done OR (not reopened AND any output value).
 * strict: explicit done only.
 * Either way, a present output value whose named validator rejects it
 * makes the step incomplete; a done flag cannot bless invalid data
 * (the advance force override remains the escape hatch).
 * @param {Step} step
 * @param {StepEntry} entry
 * @param {"hybrid"|"strict"} [gateType]
 * @param {Object<string, (value: any, spec: OutputSpec) => (string|null)>} [validators]
 * @returns {boolean}
 */
export function isStepComplete(step, entry, gateType = "hybrid", validators) {
  if (firstInvalidOutput(step, entry, validators)) return false;
  if (gateType === "strict") return !!entry.checkedDone;
  if (entry.checkedDone) return true;
  return !entry.reopened && stepHasAnyOutput(step, entry);
}
```

Also extend the `OutputSpec` typedef (index.js:51-58) with `@property {string} [validate]`.

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js packages/core/test/fixtures/workflow.js
git commit -m "core: validator-aware step completion (#54)"
```

---

### Task 4: thread validators through gates, advance, runSummary, buildContext (#54) [inline]

**Files:**
- Modify: `packages/core/src/index.js` (gateProgress :458-469, aggregateGate :479-495, mainGateProgress :504-506, advance :567-588, buildContext :663-679, runSummary :894-897)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write failing tests**

```js
test("gateProgress reports invalid outputs as unmet with the validator message", () => {
  const start = FIXTURE.mainStages[0].subStages[0];
  let run = createRun();
  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  run = setCheckedDone(run, "kickoff", true);

  const without = gateProgress(start, run);
  assert.equal(without.met, true, "no validators: unchanged");

  const p = gateProgress(start, run, { validators: FACTS_VALIDATORS });
  assert.equal(p.met, false);
  assert.equal(p.done, 1);
  assert.deepEqual(p.missing, ["Intake: Client name missing"]);
});

test("validators thread through the boundary gate, advance, and runSummary", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  run = setCheckedDone(run, "kickoff", true);
  run = skipSubStage(run, subs, "collect");

  const main = mainGateProgress(FIXTURE.mainStages[0], run, { validators: FACTS_VALIDATORS });
  assert.equal(main.met, false);
  assert.deepEqual(main.missing, ["Intake: Client name missing"]);

  const blocked = advance(run, subs, { validators: FACTS_VALIDATORS });
  assert.equal(blocked.advanced, false);
  assert.deepEqual(blocked.missing, ["Intake: Client name missing"]);

  const forced = advance(run, subs, { force: true, validators: FACTS_VALIDATORS });
  assert.equal(forced.advanced, true);
  assert.equal(wasAdvanceForced(forced.run, 0), true, "force past invalid records the marker");

  const plain = advance(run, subs, {});
  assert.equal(plain.advanced, true, "without validators the gate is met");
  assert.equal(wasAdvanceForced(plain.run, 0), false);

  const sum = runSummary(FIXTURE, run, { validators: FACTS_VALIDATORS });
  assert.equal(sum.met, 0);
  assert.equal(runSummary(FIXTURE, run).met, 1, "no validators: unchanged");
});

test("buildContext excludes steps made incomplete by invalid outputs", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Acme" });
  assert.ok(buildContext(subs, run, 0, "kickoff", { validators: FACTS_VALIDATORS }).includes("Acme"));

  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  assert.equal(buildContext(subs, run, 0, "kickoff", { validators: FACTS_VALIDATORS }), "");
  assert.ok(buildContext(subs, run, 0, "kickoff").includes("Retail"), "no validators: included");
});
```

- [ ] **Step 2: Run tests, confirm the new ones fail**

Run: `npm test`
Expected: the three new tests FAIL.

- [ ] **Step 3: Implement**

`gateProgress` rebuilt to attach messages:

```js
/**
 * Progress of a sub-stage's gate.
 * Returns { met, done, total, gateType, missing }. A missing entry is
 * the step name, or "name: message" when the step is incomplete
 * because a present output failed its named validator.
 * @param {SubStage} subStage
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec) => (string|null)> }} [opts]
 * @returns {GateProgress}
 */
export function gateProgress(subStage, run, { validators } = {}) {
  const gateType = gateTypeOf(subStage);
  const required = (subStage.steps || []).filter((s) => s.required);
  /** @type {string[]} */
  const missing = [];
  required.forEach((s) => {
    const entry = getStepEntry(run, s.id);
    if (isStepComplete(s, entry, gateType, validators)) return;
    const invalid = firstInvalidOutput(s, entry, validators);
    missing.push(invalid ? `${s.name}: ${invalid.message}` : s.name);
  });
  return {
    met: missing.length === 0,
    done: required.length - missing.length,
    total: required.length,
    gateType,
    missing,
  };
}
```

Threading (signatures only change; bodies pass `opts` along):

```js
function aggregateGate(subStagesOfMain, run, opts) {
  ...
    const p = gateProgress(ss, run, opts);
```

```js
export function mainGateProgress(mainStage, run, opts) {
  return aggregateGate(mainStage.subStages, run, opts);
}
```

```js
export function advance(run, subStages, { force = false, validators } = {}) {
  ...
  const progress = aggregateGate(
    subStages.filter((s) => s.mainIndex === run.frontier),
    run,
    { validators }
  );
```

```js
export function runSummary(definition, run, opts) {
  const subs = flattenSubStages(definition).filter((ss) => !isSubStageSkipped(run, ss.id));
  return { met: subs.filter((ss) => gateProgress(ss, run, opts).met).length, total: subs.length };
}
```

`buildContext`'s completion check gains the validators it already accepts (Task 2):

```js
      if (!isStepComplete(step, getStepEntry(run, step.id), gateType, validators)) return;
```

Add `@param {{ validators?: ... }} [opts]` JSDoc on `mainGateProgress`, `advance` (extend the existing opts doc), and `runSummary`.

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: thread validators through gates, advance, runSummary, buildContext (#54)"
```

---

### Task 5: validate field in validateDefinition, draftTarget, parseDraft, data-aware prompt (#53) [inline]

**Files:**
- Modify: `packages/core/src/index.js` (validateDefinition :213-233, buildDraftPrompt :691-704, new exports near them)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write failing tests**

```js
test("validateDefinition checks the validate field", () => {
  const def = JSON.parse(JSON.stringify(FIXTURE));
  def.mainStages[0].subStages[0].steps[0].outputs[0].validate = "";
  assert.ok(validateDefinition(def).some((p) => p.includes("validate")));
  def.mainStages[0].subStages[0].steps[0].outputs[0].validate = 7;
  assert.ok(validateDefinition(def).some((p) => p.includes("validate")));
  def.mainStages[0].subStages[0].steps[0].outputs[0].validate = "anything-goes";
  assert.deepEqual(validateDefinition(def), [], "names are never whitelisted");
});

test("draftTarget picks the first text output, else the first data output", () => {
  assert.equal(draftTarget({ id: "s", outputs: [{ id: "a", type: "data" }, { id: "b", type: "text" }] }).id, "b");
  assert.equal(draftTarget({ id: "s", outputs: [{ id: "a", type: "data" }, { id: "c", type: "data" }] }).id, "a");
  assert.equal(draftTarget({ id: "s", outputs: [{ id: "a", type: "fields", fields: [] }] }), null);
  assert.equal(draftTarget({ id: "s" }), null);
});

test("parseDraft passes text through and parses data strictly with fence tolerance", () => {
  const text = { id: "o", type: "text" };
  assert.deepEqual(parseDraft(text, "  raw draft  "), { ok: true, value: "  raw draft  " });

  const data = { id: "o", type: "data" };
  assert.deepEqual(parseDraft(data, '[{"a":1}]'), { ok: true, value: [{ a: 1 }] });
  assert.deepEqual(parseDraft(data, '```json\n[{"a":1}]\n```'), { ok: true, value: [{ a: 1 }] });
  assert.deepEqual(parseDraft(data, '```\n{"a":1}\n```'), { ok: true, value: { a: 1 } });

  const bad = parseDraft(data, "here is your JSON: [1]");
  assert.equal(bad.ok, false);
  assert.ok(bad.error.startsWith("Draft is not valid JSON:"));
});

test("buildDraftPrompt instructs JSON-only replies for data targets", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun();
  const inventory = subs[1].steps.find((s) => s.id === "inventory");
  const summary = subs[1].steps.find((s) => s.id === "summary");
  assert.ok(buildDraftPrompt(FIXTURE, subs, run, 1, inventory).includes("Respond with valid JSON only"));
  assert.ok(buildDraftPrompt(FIXTURE, subs, run, 1, summary).includes("Respond with the draft output only"));
});
```

Add `draftTarget` and `parseDraft` to the test file's import list from `../src/index.js`.

- [ ] **Step 2: Run tests, confirm the new ones fail**

Run: `npm test`
Expected: FAIL (no such exports; validateDefinition silent on validate).

- [ ] **Step 3: Implement**

In `validateDefinition`, inside the outputs forEach (after the render checks):

```js
          if (
            o.validate !== undefined &&
            (typeof o.validate !== "string" || !o.validate.trim())
          )
            problems.push(`step "${st.id}": validate must be a non-empty string`);
```

New exports in the "Subject and draft-generation support" section:

```js
/**
 * The output spec draft generation writes into: the first "text"
 * output, else the first "data" output, else null. The UI and the
 * prompt builder share this single definition of the target.
 * @param {Step} step
 * @returns {OutputSpec|null}
 */
export function draftTarget(step) {
  const outputs = step.outputs || [];
  return outputs.find((o) => o.type === "text") || outputs.find((o) => o.type === "data") || null;
}

/**
 * Turn a raw LLM reply into a storable value for a draft target.
 * Text targets pass through unchanged. Data targets are trimmed,
 * stripped of one surrounding markdown code fence when present, then
 * parsed as strict JSON.
 * @param {OutputSpec} spec
 * @param {string} text
 * @returns {{ ok: true, value: any } | { ok: false, error: string }}
 */
export function parseDraft(spec, text) {
  if (spec.type !== "data") return { ok: true, value: text };
  let body = String(text).trim();
  const fence = body.match(/^```[A-Za-z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) body = fence[1].trim();
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (e) {
    return { ok: false, error: `Draft is not valid JSON: ${e.message}` };
  }
}
```

In `buildDraftPrompt`, derive the closing line from the target:

```js
  const target = draftTarget(step);
  const closing =
    target && target.type === "data"
      ? "Respond with valid JSON only: no preamble, no code fences, no commentary."
      : `Refer to ${subject} by name where natural. Respond with the draft output only, concise and usable. No preamble.`;
  return [
    `You are assisting inside a staged workflow named "${definition.name}". This process concerns ${subject}.`,
    `Current stage: ${subStage.mainName} > ${subStage.name}. Current step: ${step.name} (${step.description || ""}).`,
    ctx
      ? `Outputs produced so far:\n\n${ctx}`
      : `No prior outputs exist yet; produce a strong first draft from general best practice.`,
    `Task: ${step.aiPrompt || `Draft the output for the step "${step.name}".`}`,
    closing,
  ].join("\n\n");
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "core: draftTarget, parseDraft, validate field, data-aware prompt (#53)"
```

---

### Task 6: core header comment and the #50 asymmetry note [inline]

**Files:**
- Modify: `packages/core/src/index.js:1-39` (file header), `:899-905` (runDisplayName comment)

- [ ] **Step 1: Edit the header comment**

In the DEFINITION section of the file header (after the render hint bullet), add:

```
 *    - Any output spec may carry an optional validate: "<name>", a
 *      free string resolved against a consumer-supplied validators map
 *      { [name]: (value, spec) => string | null }. A returned string
 *      is the problem message. Validators are pure, never persisted,
 *      and unresolvable names mean unvalidated.
```

After the run-shape paragraph, add one line:

```
 *    Draft generation targets draftTarget(step): the first text
 *    output, else the first data output; parseDraft turns the raw
 *    reply into a storable value (strict JSON for data targets).
```

- [ ] **Step 2: Document the #50 decision**

In the comment block above `runDisplayName` (index.js:899-905), after "the configured fallback string never becomes a display name", add:

```
 * Deliberate asymmetry with resolveSubject (#50): a skipped subject
 * sub-stage makes resolveSubject fall back (content channels must not
 * leak not-applicable values), but the display name keeps the typed
 * subject; it identifies the run, and renaming runs on skip would
 * destabilize the runs list.
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add packages/core/src/index.js
git commit -m "core: document validators, draft targets, and the #50 display-name asymmetry"
```

---

### Task 7: react generate flow for data targets and richer errors (#53) [inline]

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (imports :2-37, prop docs :50-80 and :139-150, generate :369-389, invite/actions :662-741, error line :717-719)

- [ ] **Step 1: Imports and props**

Add `draftTarget` and `parseDraft` to the `@sqnce/core` import list. Add `validators` to the component signature:

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators }) {
```

Extend the `ProcessRolodexProps` typedef:

```js
 * @property {Object<string, (value: any, spec: import("@sqnce/core").OutputSpec) => (string|null)>} [validators]
```

And the prose prop docs (after the `renderers` bullet):

```
 *  - validators (optional): map of validator name -> (value, spec) =>
 *      string | null, resolving the validate names declared on output
 *      specs. A returned string is the problem message: it makes the
 *      owning step incomplete (gates, status, draft context) and
 *      rejects generated drafts. Pure functions; omit to validate
 *      nothing.
```

- [ ] **Step 2: Rewrite generate()**

Replace the whole `generate` function (ProcessRolodex.jsx:370-389):

```js
  const generate = async (sub, step) => {
    if (!generateDraft || readOnly) return;
    const target = draftTarget(step);
    if (!target) return;
    setGenerating(step.id);
    setGenError(null);
    try {
      const prompt = buildDraftPrompt(def, subs, run, idx, step, { validators });
      const text = await generateDraft(prompt, {
        workflowId: def.id,
        stepId: step.id,
        subject: subjectName,
      });
      if (!text) throw new Error("Empty response");
      const parsed = parseDraft(target, text);
      if (!parsed.ok) {
        setGenError({ stepId: step.id, message: parsed.error });
        return;
      }
      const fn = target.validate && validators && validators[target.validate];
      const message = fn ? fn(parsed.value, target) : null;
      if (typeof message === "string") {
        setGenError({ stepId: step.id, message: `Draft failed validation: ${message}` });
        return;
      }
      writeOutput(step.id, target.id, parsed.value, { generated: true });
    } catch (e) {
      setGenError({ stepId: step.id, message: null });
    } finally {
      setGenerating(null);
    }
  };
```

- [ ] **Step 3: Target-aware invite, error line, and actions row**

In the steps map (after `const status = statusOf(sub, step);` at :628), add:

```js
                  const target = draftTarget(step);
```

In the outputs map, replace the two target lines (:663-664):

```js
                            const isGenTarget = !!generateDraft && spec === target;
```

(delete the old `const target = (step.outputs || []).find((o) => o.type === "text");` line inside the map.)

Replace the error line (:717-719):

```js
                          {genError && genError.stepId === step.id && (
                            <div className="pf-error">
                              {genError.message || "Generation failed. Check the connection and try again."}
                            </div>
                          )}
```

Replace the actions-row generate button condition and label (:722-741):

```js
                            {generateDraft && target && (
                              <button
                                className="pf-btn"
                                disabled={generating === step.id || readOnly}
                                onClick={() => generate(sub, step)}
                              >
                                {generating === step.id ? (
                                  <>
                                    <span className="pf-spinner pf-spinner-sm" aria-hidden="true" /> Generating…
                                  </>
                                ) : hasValue(target, (entry.outputs || {})[target.id]) ? (
                                  "Regenerate"
                                ) : (
                                  "Generate draft"
                                )}
                              </button>
                            )}
```

- [ ] **Step 4: Syntax check and commit**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no errors.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: generate drafts into data outputs with parse and validation (#53)"
```

---

### Task 8: react validators threading and per-output invalid display (#54) [inline]

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (call sites :281, :302-309, :415-422, :433-438, :456, :515-525, :529-537, :547, :795)
- Modify: `packages/react/src/RunSidebar.jsx:2,55`
- Modify: `packages/react/src/RunsScreen.jsx:2,47`
- Modify: `packages/react/src/OutputView.jsx` (invalid prop, badge restriction)

- [ ] **Step 1: Thread validators through every gate and completion call in ProcessRolodex**

```js
  const stageProg = mainGateProgress(def.mainStages[frontier], run, { validators });
```

```js
  const doAdvance = (force) => {
    if (readOnly) return;
    const result = coreAdvance(run, subs, { force, validators });
```

prevDoneBlocks (:420): `isStepComplete(step, entry, gateTypeOf(prevSub), validators) && stepHasAnyOutput(step, entry)`

statusOf (:435): `if (isStepComplete(step, entry, gateTypeOf(sub), validators)) return "done";`

rail (:456): `const allDone = mainGateProgress(ms, run, { validators }).met;`

deck (:547): `const p = gateProgress(sub, run, { validators });`

forced marker (:795): `!mainGateProgress(def.mainStages[sub.mainIndex], run, { validators }).met && (`

- [ ] **Step 2: Pass validators to RunSidebar and RunsScreen**

Add `validators={validators}` to both component usages (:515-525 and :529-537). In `RunSidebar.jsx` add `validators` to the destructured props and change :55 to `const sum = runSummary(w, e.run, { validators });`. Same change in `RunsScreen.jsx` (:47).

- [ ] **Step 3: Per-output invalid message**

In the outputs map in ProcessRolodex (where OutputView is rendered, :700-714), compute and pass the message:

```js
                            const outVal = (entry.outputs || {})[spec.id];
                            const checkFn = spec.validate && validators && validators[spec.validate];
                            const invalidMsg = checkFn && hasValue(spec, outVal) ? checkFn(outVal, spec) : null;
                            return (
                              <OutputView
                                key={spec.id}
                                spec={spec}
                                value={outVal}
                                invalid={typeof invalidMsg === "string" ? invalidMsg : null}
                                ...
```

(keep the remaining OutputView props unchanged; replace the old `value={(entry.outputs || {})[spec.id]}` with `value={outVal}`.)

In `OutputView.jsx`, accept and render it, and drop the text-only badge restriction:

```js
export default function OutputView({ spec, value, onChange, onAttach, renderers, context, generated, invalid }) {
```

Badge line (:160): `{generated && <span className="pf-gen-badge">AI draft</span>}`

After `{body}` in the returned JSX (:200):

```js
      {invalid && <div className="pf-error">{invalid}</div>}
```

- [ ] **Step 4: Syntax check, build, commit**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null` (repeat for `OutputView.jsx`, `RunSidebar.jsx`, `RunsScreen.jsx`)
Expected: no errors.

Run: `npm run build -w examples/demo`
Expected: build succeeds.

```bash
git add packages/react/src
git commit -m "react: validators prop threads completion, gates, and per-output messages (#54)"
```

---

### Task 9: presales content and demo wiring [delegate: sonnet]

**Files:**
- Modify: `definitions/presales.json` (steps `requirements` and `win-themes`)
- Modify: `examples/demo/src/App.jsx`
- Modify: `examples/demo/src/drafts.js`

- [ ] **Step 1: presales.json**

The `requirements` step (sub-stage `review`) gains an aiPrompt, and its output gains a validate name:

```json
{
  "id": "requirements",
  "name": "Requirements Extract",
  "required": true,
  "description": "Functional and non-functional requirements.",
  "aiPrompt": "Extract the requirements as a JSON array of row objects, each with keys id, requirement, type (functional or non-functional), and priority (must, should, could).",
  "outputs": [
    {
      "id": "out",
      "type": "data",
      "label": "Requirements",
      "validate": "requirements",
      "render": { "kind": "table" }
    }
  ]
}
```

The `win-themes` step (sub-stage `proposal`) likewise:

```json
{
  "id": "win-themes",
  "name": "Win Themes",
  "required": true,
  "description": "The three to five reasons we win this deal.",
  "aiPrompt": "Draft three to five win themes as a JSON array of objects, each with keys name (the theme) and purpose (how we use it).",
  "outputs": [
    {
      "id": "out",
      "type": "data",
      "label": "Win themes",
      "validate": "win-themes",
      "render": { "kind": "cards", "options": { "title": "name", "subtitle": "purpose" } }
    }
  ]
}
```

Preserve every field not shown here exactly as it is in the file.

- [ ] **Step 2: demo validators in App.jsx**

Above the App component in `examples/demo/src/App.jsx`:

```js
/* Validators referenced by validate names in definitions/presales.json.
   A returned string is the problem message; null means valid. */
const validators = {
  requirements: (value) =>
    Array.isArray(value) && value.length > 0 && value.every((r) => r && typeof r === "object" && !Array.isArray(r))
      ? null
      : "Requirements must be a non-empty array of row objects.",
  "win-themes": (value) =>
    Array.isArray(value) && value.length > 0 && value.every((t) => t && typeof t.name === "string" && typeof t.purpose === "string")
      ? null
      : "Win themes must be an array of { name, purpose } objects.",
};
```

Add `validators={validators}` to the `<ProcessRolodex` usage (next to `generateDraft={generateDraft}`).

- [ ] **Step 3: canned JSON drafts in drafts.js**

Add to the `DRAFTS` map (values keep the `(s) =>` signature of their neighbors). The win-themes draft is deliberately fence-wrapped to exercise the parser's tolerance:

```js
  requirements: () =>
    JSON.stringify([
      { id: "R1", requirement: "Single sign-on via the customer's identity provider", type: "non-functional", priority: "must" },
      { id: "R2", requirement: "Case intake form with file attachments", type: "functional", priority: "must" },
      { id: "R3", requirement: "Automated assignment by region and workload", type: "functional", priority: "should" },
      { id: "R4", requirement: "Monthly volume and SLA reporting", type: "functional", priority: "should" },
    ]),
  "win-themes": (s) =>
    "```json\n" +
    JSON.stringify([
      { name: "Fastest time to value", purpose: `Lead with the six-week pilot plan for ${s}.` },
      { name: "Platform consolidation", purpose: "One license replaces three point tools." },
      { name: "Local delivery team", purpose: "Named consultants the customer already met." },
    ]) +
    "\n```",
```

- [ ] **Step 4: Verify and commit**

Run: `npm test` (bundled definitions must still validate)
Run: `npm run build -w examples/demo`
Expected: both pass.

```bash
git add definitions/presales.json examples/demo/src/App.jsx examples/demo/src/drafts.js
git commit -m "demo: presales structured steps generate validated JSON drafts"
```

---

### Task 10: docs [delegate: sonnet]

**Files:**
- Modify: `README.md` (after the `persistence`/`generateDraft` paragraph at :80, and the custom renderers section :148-169)
- Modify: `packages/react/README.md` (props list :8-9)
- Modify: `CLAUDE.md` (Architecture item 1 and 3, Key behaviors)

- [ ] **Step 1: README.md**

After the line "Both `persistence` and `generateDraft` are optional..." (:80), add a paragraph:

```markdown
Draft generation targets a step's first `text` output, or its first `data` output when it has no text output. Data drafts are parsed as strict JSON (one surrounding code fence is tolerated) and, when the output declares a `validate` name, checked by your validator before anything is stored; failures surface as the generation error and write nothing.

A `validators` prop resolves the `validate` names declared on output specs: `validators={{ "win-themes": (value, spec) => Array.isArray(value) ? null : "Expected an array." }}`. A returned string is the problem message: the owning step reads incomplete (gates, status, draft context) until the value is fixed, and the message appears in the gate footer. Validators are pure functions; omit the prop to validate nothing.
```

- [ ] **Step 2: packages/react/README.md**

In the props list after the `generateDraft` bullet, add:

```markdown
- `validators` (optional): map of validator name -> `(value, spec) => string | null`, resolving `validate` names on output specs. A string return is the problem message: the step reads incomplete and generated drafts that fail are rejected.
```

And extend the `generateDraft` bullet with: "Targets the step's first `text` output, else its first `data` output (JSON replies, parsed and validated before storing)."

- [ ] **Step 3: CLAUDE.md**

Architecture item 1, after the render hint sentence, add: "Any output spec may also carry an optional `validate: \"<name>\"`, a free string validated loosely (non-empty), never whitelisted, resolved against a consumer-supplied validators map."

Architecture item 2, extend the `buildDraftPrompt` sentence: "`buildDraftPrompt` returns a string; the engine never calls an LLM. `buildDraftPrompt`/`buildContext` accept `{ maxCharsPerStep, validators }`; `serializeStep` accepts `{ maxChars }` (default 2500, `Infinity` allowed, truncated blocks end with a `[truncated]` line)."

Architecture item 3, after the renderers sentence: "`validators` is injected the same way; validators never enter core as anything but arguments."

Key behaviors, add three bullets:

```markdown
- Validators are consumer-supplied pure functions resolved by name from output specs; an invalid present value makes its step incomplete everywhere (gates, status, draft context) regardless of the done flag, with the message reported in `missing`. Unresolvable names mean unvalidated; validation results are never persisted.
- Draft generation targets the first text output, else the first data output. Data drafts parse as strict JSON with single-fence tolerance and run the target's validator; any failure surfaces as the generation error and never writes a value.
- Serialization budget: `maxCharsPerStep` threads from `buildDraftPrompt`/`buildContext` into `serializeStep`; the block-level budget is the single truncation point and truncated blocks end with a `[truncated]` marker.
```

- [ ] **Step 4: Commit**

```bash
git add README.md packages/react/README.md CLAUDE.md
git commit -m "docs: validators, data drafts, context budget"
```

---

### Task 11: full verification and push [inline]

- [ ] **Step 1: Full check**

Run, from the worktree root:

```bash
npm test
npm run types
npm run build -w examples/demo
```

Expected: all pass. `npm run types` regenerates `.d.ts` without errors (output is not committed).

- [ ] **Step 2: Push**

```bash
git push
```

Then the Codex implementation loop (workflow step 9) takes over.
