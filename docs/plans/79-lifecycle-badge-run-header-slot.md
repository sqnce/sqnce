# Lifecycle-aware badge + run-header/status slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generated-output badge lifecycle-aware and consumer-overridable, and add two consumer-injected slots (`renderRunHeader`, `runStatus`) so a consumer can surface a run-level verdict, all in pure `@sqnce/react`.

**Architecture:** Two pure, React-free resolver modules (`badge.js`, `runStatus.js`) hold the only branching logic and carry real unit tests under `node:test`. The JSX components (`OutputView`, `ReadingView`, `RunSidebar`, `RunsScreen`) and the `ProcessRolodex` container thread those resolvers and render their results; this wiring is verified by the demo build and the type-check, since the repo has no React test harness. `@sqnce/core` is untouched.

**Tech Stack:** Plain ESM JavaScript, no build step in the packages; React 18+ for the UI; Node's built-in test runner (`node:test`, Node 20+); TypeScript `tsc` in `checkJs` mode for `.d.ts` generation and type-checking (no committed `.d.ts`, `types/` is gitignored).

## Global Constraints

- No em dashes anywhere (code, comments, docs, commit messages, UI copy). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Pure `@sqnce/react` only. No `@sqnce/core` change. Renderers and validators never enter core.
- The two new resolver modules must be React-free (no `import React`, no JSX) so `node:test` can run them directly.
- `ProcessRolodex` is annotated `@param {ProcessRolodexProps}` (`packages/react/src/ProcessRolodex.jsx:168`), and `tsconfig.declarations.json` sets `checkJs: true`. Every new prop destructured in `ProcessRolodex` MUST also be added to the `ProcessRolodexProps` typedef (`packages/react/src/ProcessRolodex.jsx:157-166`), or `npm run types` fails. `OutputView`, `ReadingView`, `RunSidebar`, and `RunsScreen` are unannotated, so new props on them need no typedef edit.
- The badge is a render-only marker (`pointer-events: none`); it never enters an output value.
- Three repo gates, all must pass: `npm test`, `npm run build -w examples/demo`, `npm run types`.
- This plan is a working artifact. It is committed on the branch so the reviews can read it, then removed in a single commit before the step-10 code review (`git rm docs/plans/79-lifecycle-badge-run-header-slot.md`), so it never reaches main.

---

## File Structure

- Create `packages/react/src/badge.js`: pure badge-label resolver (`defaultGeneratedBadge`, `resolveGeneratedBadge`).
- Create `packages/react/src/runStatus.js`: pure per-run status-word normalizer (`resolveRunStatus`).
- Create `packages/react/test/badge.test.js`: unit tests for `badge.js`.
- Create `packages/react/test/runStatus.test.js`: unit tests for `runStatus.js`.
- Modify `package.json` (root): extend the `test` script glob to include `packages/react/test/*.test.js`.
- Modify `packages/react/src/OutputView.jsx`: render a resolved `badge` label instead of the hardcoded `"AI draft"` at both badge sites; keep `generated` for the textarea styling.
- Modify `packages/react/src/ProcessRolodex.jsx`: add `generatedBadge`, `renderRunHeader`, `runStatus` props (signature + `ProcessRolodexProps` typedef + prose docs); resolve the badge at the `OutputView` render; thread the run-header/status props into `ReadingView`, `RunSidebar`, `RunsScreen`.
- Modify `packages/react/src/ReadingView.jsx`: replace the hardcoded `"Complete"` with the resolved status word, and mount `renderRunHeader` in the band.
- Modify `packages/react/src/RunSidebar.jsx`: show the status word on each run row.
- Modify `packages/react/src/RunsScreen.jsx`: add a Status column with the status word.
- Modify `examples/demo/src/App.jsx` and `examples/demo/src/demo.css`: illustrative consumer wiring for `runStatus` and `renderRunHeader`, plus a little verdict styling.

---

## Task 1: Pure badge resolver + test harness

**Files:**
- Create: `packages/react/src/badge.js`
- Create: `packages/react/test/badge.test.js`
- Modify: `package.json` (root, the `test` script)

**Interfaces:**
- Produces: `defaultGeneratedBadge(lifecycle: "done"|"draft"|"open") => string`, and `resolveGeneratedBadge({ generated: boolean, lifecycle: "done"|"draft"|"open", spec: OutputSpec, resolver?: (lifecycle, spec) => string|null }) => string|null`. Later tasks import both from `./badge.js`.

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/badge.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultGeneratedBadge, resolveGeneratedBadge } from "../src/badge.js";

test("defaultGeneratedBadge: a done step reads 'AI generated'", () => {
  assert.equal(defaultGeneratedBadge("done"), "AI generated");
});

test("defaultGeneratedBadge: draft and open keep 'AI draft'", () => {
  assert.equal(defaultGeneratedBadge("draft"), "AI draft");
  assert.equal(defaultGeneratedBadge("open"), "AI draft");
});

test("resolveGeneratedBadge: a non-generated output shows no badge", () => {
  assert.equal(resolveGeneratedBadge({ generated: false, lifecycle: "done", spec: {} }), null);
});

test("resolveGeneratedBadge: a generated done output uses the lifecycle default", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {} }), "AI generated");
});

test("resolveGeneratedBadge: a generated draft output keeps 'AI draft'", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "draft", spec: {} }), "AI draft");
});

test("resolveGeneratedBadge: a consumer resolver overrides the label", () => {
  const resolver = (lifecycle) => (lifecycle === "done" ? "ACCEPTED" : "DRAFT");
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver }), "ACCEPTED");
});

test("resolveGeneratedBadge: a resolver returning null hides the badge", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver: () => null }), null);
});

test("resolveGeneratedBadge: a resolver is never consulted for a non-generated output", () => {
  let called = false;
  const resolver = () => { called = true; return "X"; };
  assert.equal(resolveGeneratedBadge({ generated: false, lifecycle: "open", spec: {}, resolver }), null);
  assert.equal(called, false);
});
```

- [ ] **Step 2: Extend the root test script so the runner sees react tests**

In `package.json` (root), change the `test` script from:

```json
"test": "node --test packages/core/test/*.test.js",
```

to:

```json
"test": "node --test packages/core/test/*.test.js packages/react/test/*.test.js",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. The runner reaches `packages/react/test/badge.test.js` and errors because `../src/badge.js` cannot be resolved (the module does not exist yet).

- [ ] **Step 4: Write the minimal implementation**

Create `packages/react/src/badge.js`:

```js
/*
 * Generated-output badge label, resolved from the owning step's lifecycle.
 * Pure and React-free so it runs under node:test. The badge is a
 * render-only marker (pointer-events: none); it never enters a value.
 */

/**
 * Default badge label for a generated output, by lifecycle state. An open
 * or draft step still reads "AI draft"; a done/accepted step reads
 * "AI generated", so the AI provenance survives without claiming the
 * output is still a draft.
 * @param {"done"|"draft"|"open"} lifecycle
 * @returns {string}
 */
export function defaultGeneratedBadge(lifecycle) {
  return lifecycle === "done" ? "AI generated" : "AI draft";
}

/**
 * Resolve the badge label to render for one output. Returns null when no
 * badge should show: the output was not generated, or a consumer resolver
 * hid it. A consumer resolver, when present, fully owns the label for a
 * generated output: a non-empty returned string is the label, anything
 * else (null, empty string) hides the badge.
 * @param {Object} args
 * @param {boolean} args.generated
 * @param {"done"|"draft"|"open"} args.lifecycle
 * @param {import("@sqnce/core").OutputSpec} args.spec
 * @param {((lifecycle: string, spec: any) => (string|null))} [args.resolver]
 * @returns {string|null}
 */
export function resolveGeneratedBadge({ generated, lifecycle, spec, resolver }) {
  if (!generated) return null;
  if (resolver) {
    const out = resolver(lifecycle, spec);
    return typeof out === "string" && out.trim() ? out : null;
  }
  return defaultGeneratedBadge(lifecycle);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS. All core tests still pass and the 8 new badge tests pass.

- [ ] **Step 6: Confirm the type-check still passes**

Run: `npm run types`
Expected: exits 0 with no errors (the new `badge.js` type-checks under `checkJs`).

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/badge.js packages/react/test/badge.test.js package.json
git commit -m "feat(react): pure lifecycle badge resolver with unit tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire the lifecycle badge into the authoring UI

**Files:**
- Modify: `packages/react/src/OutputView.jsx` (badge sites at lines 80 and 160; `OutputView` signature at 137; `DefaultEditor` signature at 76 and its call at 178)
- Modify: `packages/react/src/ProcessRolodex.jsx` (imports near 46; `ProcessRolodexProps` typedef 157-166; prose props doc 56-98; signature 169; `OutputView` render 829-842)

**Interfaces:**
- Consumes: `resolveGeneratedBadge` from `./badge.js` (Task 1).
- Produces: `ProcessRolodex` now accepts an optional `generatedBadge(lifecycle, spec) => string|null` prop. `OutputView` now accepts a `badge: string|null` prop and renders it; it still accepts `generated: boolean` for the textarea styling only.

- [ ] **Step 1: Add the badge prop to `OutputView` and both badge sites**

In `packages/react/src/OutputView.jsx`:

Change the `DefaultEditor` signature (line 76) from:

```js
function DefaultEditor({ spec, value, onChange, onAttach, readOnly, generated }) {
```

to:

```js
function DefaultEditor({ spec, value, onChange, onAttach, readOnly, generated, badge }) {
```

Change the text-branch badge (line 80) from:

```jsx
        {generated && <span className="pf-gen-badge">AI draft</span>}
```

to:

```jsx
        {badge && <span className="pf-gen-badge">{badge}</span>}
```

Change the `OutputView` signature (line 137) from:

```js
export default function OutputView({ spec, value, onChange, onAttach, renderers, context, generated, invalid }) {
```

to (note the `badge = null` default):

```js
export default function OutputView({ spec, value, onChange, onAttach, renderers, context, generated, badge = null, invalid }) {
```

The `= null` default matters: `OutputView` has two call sites, `ProcessRolodex` (which passes `badge`, Step 3) and `ReadingView` (which does not). Under `checkJs`, a destructured prop with no default is inferred as required, so without the default `npm run types` would fail at the `ReadingView` call site. A defaulted param is optional in the inferred type, so `ReadingView` keeps omitting `badge`.

Change the renderer-view badge (line 160) from:

```jsx
          {generated && <span className="pf-gen-badge">AI draft</span>}
```

to:

```jsx
          {badge && <span className="pf-gen-badge">{badge}</span>}
```

Change the `DefaultEditor` call (line 178) from:

```jsx
      <DefaultEditor spec={spec} value={value} onChange={onChange} onAttach={onAttach} readOnly={readOnly} generated={generated} />
```

to:

```jsx
      <DefaultEditor spec={spec} value={value} onChange={onChange} onAttach={onAttach} readOnly={readOnly} generated={generated} badge={badge} />
```

Note: `generated` is kept and still drives the textarea highlight class `pf-ta-generated` (line 82). The badge label is now separate from that styling, so a consumer hiding the badge (resolver returns null) keeps the generated highlight, and reading mode (which passes `generated={false}` and no `badge`) shows neither, exactly as today.

- [ ] **Step 2: Import the resolver and add the `generatedBadge` prop in `ProcessRolodex`**

In `packages/react/src/ProcessRolodex.jsx`, after the `RunsScreen` import (line 46) add:

```js
import { resolveGeneratedBadge } from "./badge.js";
```

Add a line to the `ProcessRolodexProps` typedef (inside the block at lines 157-166, after the `validators` property at line 165):

```js
 * @property {(lifecycle: "done"|"draft"|"open", spec: import("@sqnce/core").OutputSpec) => (string|null)} [generatedBadge]
```

Add prose to the props doc comment (after the `validators` bullet that ends at line 97, before the closing `*/` at line 98):

```js
 *  - generatedBadge (optional): (lifecycle, spec) => string | null,
 *      overrides the generated-output badge label. lifecycle is the owning
 *      step's status ("done" | "draft" | "open"). A non-empty string is the
 *      label; null hides the badge. Omit for the default mapping (a done
 *      step reads "AI generated", otherwise "AI draft").
```

Change the function signature (line 169) from:

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators }) {
```

to:

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge }) {
```

- [ ] **Step 3: Resolve the badge at the `OutputView` render**

In `packages/react/src/ProcessRolodex.jsx`, at the output map (lines 825-842), insert the badge resolution after the `invalidMsg` line (827) and before `return (` (828). Replace:

```js
                            const outVal = (entry.outputs || {})[spec.id];
                            const checkFn = spec.validate && validators && validators[spec.validate];
                            const invalidMsg = checkFn && hasValue(spec, outVal) ? checkFn(outVal, spec, { run, stepId: step.id }) : null;
                            return (
                              <OutputView
                                key={spec.id}
                                spec={spec}
                                value={outVal}
                                invalid={typeof invalidMsg === "string" ? invalidMsg : null}
                                onChange={(v) => writeOutput(step.id, spec.id, v)}
                                onAttach={() => {
                                  attachFor.current = { stepId: step.id, outputId: spec.id };
                                  fileRef.current && fileRef.current.click();
                                }}
                                renderers={renderers}
                                context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly }}
                                generated={isOutputGenerated(run, step.id, spec.id)}
                              />
                            );
```

with:

```js
                            const outVal = (entry.outputs || {})[spec.id];
                            const checkFn = spec.validate && validators && validators[spec.validate];
                            const invalidMsg = checkFn && hasValue(spec, outVal) ? checkFn(outVal, spec, { run, stepId: step.id }) : null;
                            const isGen = isOutputGenerated(run, step.id, spec.id);
                            const genBadge = resolveGeneratedBadge({ generated: isGen, lifecycle: status, spec, resolver: generatedBadge });
                            return (
                              <OutputView
                                key={spec.id}
                                spec={spec}
                                value={outVal}
                                invalid={typeof invalidMsg === "string" ? invalidMsg : null}
                                onChange={(v) => writeOutput(step.id, spec.id, v)}
                                onAttach={() => {
                                  attachFor.current = { stepId: step.id, outputId: spec.id };
                                  fileRef.current && fileRef.current.click();
                                }}
                                renderers={renderers}
                                context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly }}
                                generated={isGen}
                                badge={genBadge}
                              />
                            );
```

(`status` is `statusOf(sub, step)`, already computed at line 752 and in scope here.)

- [ ] **Step 4: Verify the build passes**

Run: `npm run build -w examples/demo`
Expected: `✓ built in ...` with no errors.

- [ ] **Step 5: Verify the type-check passes**

Run: `npm run types`
Expected: exits 0. (If it errors with "Property 'generatedBadge' does not exist on type 'ProcessRolodexProps'", the typedef line in Step 2 is missing or malformed.)

- [ ] **Step 6: Verify the unit tests still pass**

Run: `npm test`
Expected: PASS (unchanged; this task adds no tests, the badge logic is covered by Task 1).

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/OutputView.jsx packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): lifecycle-aware, overridable generated badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pure run-status resolver + test

**Files:**
- Create: `packages/react/src/runStatus.js`
- Create: `packages/react/test/runStatus.test.js`

**Interfaces:**
- Produces: `resolveRunStatus(resolver, ctx) => { word: string, tone?: string } | null`, where `resolver` is `((ctx) => string | { word, tone } | null) | undefined` and `ctx` is `{ def, run, runId }`. Later tasks import it from `./runStatus.js`.

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/runStatus.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRunStatus } from "../src/runStatus.js";

const ctx = { def: { id: "w" }, run: {}, runId: "r1" };

test("resolveRunStatus: no resolver yields null", () => {
  assert.equal(resolveRunStatus(undefined, ctx), null);
});

test("resolveRunStatus: a bare string becomes { word }", () => {
  assert.deepEqual(resolveRunStatus(() => "ACCEPT", ctx), { word: "ACCEPT" });
});

test("resolveRunStatus: a { word, tone } passes through", () => {
  assert.deepEqual(resolveRunStatus(() => ({ word: "REVISE", tone: "revise" }), ctx), { word: "REVISE", tone: "revise" });
});

test("resolveRunStatus: a { word } with no tone omits tone", () => {
  assert.deepEqual(resolveRunStatus(() => ({ word: "DONE" }), ctx), { word: "DONE" });
});

test("resolveRunStatus: a resolver returning null yields null", () => {
  assert.equal(resolveRunStatus(() => null, ctx), null);
});

test("resolveRunStatus: an empty or whitespace word yields null", () => {
  assert.equal(resolveRunStatus(() => "   ", ctx), null);
  assert.equal(resolveRunStatus(() => ({ word: "" }), ctx), null);
});

test("resolveRunStatus: the resolver receives the run context", () => {
  let seen = null;
  resolveRunStatus((c) => { seen = c; return "X"; }, ctx);
  assert.deepEqual(seen, ctx);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. The runner errors on `packages/react/test/runStatus.test.js` because `../src/runStatus.js` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/runStatus.js`:

```js
/*
 * Per-run status word, resolved from a consumer-supplied resolver. Pure and
 * React-free so it runs under node:test. Normalizes the resolver's loose
 * return shape (string | { word, tone } | null) into a single
 * { word, tone } | null the shell renders uniformly.
 */

/**
 * @typedef {{ word: string, tone?: string }} RunStatusWord
 */

/**
 * Resolve and normalize a per-run status word. Returns null when no
 * resolver is supplied or the resolver yields no usable word, so a caller
 * can fall back to its own default (the reading band keeps "Complete"; the
 * sidebar and runs screen show nothing). A bare string becomes { word }; a
 * { word, tone } passes through; any other shape, including an empty or
 * whitespace-only word, resolves to null.
 * @param {((ctx: { def: any, run: any, runId: string|null }) => (string | RunStatusWord | null)) | undefined} resolver
 * @param {{ def: any, run: any, runId: string|null }} ctx
 * @returns {RunStatusWord | null}
 */
export function resolveRunStatus(resolver, ctx) {
  if (typeof resolver !== "function") return null;
  const out = resolver(ctx);
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (all core tests, the 8 badge tests, and the 7 runStatus tests).

- [ ] **Step 5: Confirm the type-check passes**

Run: `npm run types`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/runStatus.js packages/react/test/runStatus.test.js
git commit -m "feat(react): pure run-status word resolver with unit tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mount `renderRunHeader` and the status word in the reading band

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (imports near 46-47; typedef 157-166; prose doc 56-98; signature 169; `ReadingView` render 652-661)
- Modify: `packages/react/src/ReadingView.jsx` (import; signature line 71; band lines 120-124)

**Interfaces:**
- Consumes: `resolveRunStatus` from `./runStatus.js` (Task 3).
- Produces: `ProcessRolodex` now accepts optional `renderRunHeader({ def, run, runId, subject, complete }) => ReactNode` and `runStatus({ def, run, runId }) => string | { word, tone } | null`. `ReadingView` now accepts `renderRunHeader`, `runStatus`, `runId`, `complete`.

- [ ] **Step 1: Add the resolver import and the two props in `ProcessRolodex`**

In `packages/react/src/ProcessRolodex.jsx`, after the `resolveGeneratedBadge` import added in Task 2 add:

```js
import { resolveRunStatus } from "./runStatus.js";
```

Add two lines to the `ProcessRolodexProps` typedef (after the `generatedBadge` line from Task 2):

```js
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null, subject: string, complete: boolean }) => import("react").ReactNode} [renderRunHeader]
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null }) => (string | { word: string, tone?: string } | null)} [runStatus]
```

Add prose to the props doc comment (after the `generatedBadge` bullet from Task 2, before the closing `*/`):

```js
 *  - renderRunHeader (optional): ({ def, run, runId, subject, complete })
 *      => ReactNode, mounted in the reading-mode run header band (a final
 *      verdict banner, for example). The band only renders for a finished
 *      run, so complete is true whenever it fires. Omit to mount nothing.
 *  - runStatus (optional): ({ def, run, runId }) => string | { word, tone }
 *      | null, a short per-run status word shown in the runs sidebar, the
 *      runs screen, and the reading-mode band (where it replaces the
 *      default "Complete"). A bare string is the word; tone is an opaque
 *      visual hint that must degrade to a plain word. Omit to show no word
 *      in the lists and keep "Complete" in the band.
```

Change the function signature (the line edited in Task 2) to also destructure the two props:

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus }) {
```

- [ ] **Step 2: Thread the props into the `ReadingView` render**

In `packages/react/src/ProcessRolodex.jsx`, change the `ReadingView` element (lines 652-661) from:

```jsx
        <ReadingView
          def={def}
          run={run}
          subs={subs}
          runName={entry ? runDisplayName(def, store, entry.id) : def.name}
          renderers={renderers}
          subjectName={subjectName}
          onJump={(i) => setNav(jumpTo(run, subs, i))}
          onEdit={() => { clearTransients(); setView("rolodex"); }}
        />
```

to:

```jsx
        <ReadingView
          def={def}
          run={run}
          subs={subs}
          runName={entry ? runDisplayName(def, store, entry.id) : def.name}
          renderers={renderers}
          subjectName={subjectName}
          renderRunHeader={renderRunHeader}
          runStatus={runStatus}
          runId={entry ? entry.id : null}
          complete={complete}
          onJump={(i) => setNav(jumpTo(run, subs, i))}
          onEdit={() => { clearTransients(); setView("rolodex"); }}
        />
```

(`complete` is computed at line 221; `entry` is the active run entry, used at line 656 already.)

- [ ] **Step 3: Resolve the word and mount the header in `ReadingView`**

In `packages/react/src/ReadingView.jsx`:

Add the resolver import after the existing core import (line 2):

```js
import { resolveRunStatus } from "./runStatus.js";
```

Change the signature (line 71) from:

```js
export default function ReadingView({ def, run, subs, runName, renderers, subjectName, onJump, onEdit }) {
```

to:

```js
export default function ReadingView({ def, run, subs, runName, renderers, subjectName, renderRunHeader, runStatus, runId, complete, onJump, onEdit }) {
```

Just before the `return (` (line 105), add the two derivations:

```js
  const status = resolveRunStatus(runStatus, { def, run, runId });
  const headerNode = renderRunHeader ? renderRunHeader({ def, run, runId, subject: subjectName, complete }) : null;
```

Change the band header and add the header slot (lines 120-124) from:

```jsx
      <div className="pf-read-doc">
        <header className="pf-read-band">
          <h1 className="pf-read-title">{runName}</h1>
          <span className="pf-read-status">Complete</span>
        </header>
```

to:

```jsx
      <div className="pf-read-doc">
        <header className="pf-read-band">
          <h1 className="pf-read-title">{runName}</h1>
          <span className="pf-read-status" data-tone={status && status.tone ? status.tone : undefined}>
            {status ? status.word : "Complete"}
          </span>
        </header>
        {headerNode && <div className="pf-read-header-slot">{headerNode}</div>}
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build -w examples/demo`
Expected: `✓ built in ...` with no errors.

- [ ] **Step 5: Verify the type-check passes**

Run: `npm run types`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx packages/react/src/ReadingView.jsx
git commit -m "feat(react): run-header slot and status word in the reading band

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Show the status word in the runs sidebar and the runs screen

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (`RunSidebar` render 626-637; `RunsScreen` render 641-650)
- Modify: `packages/react/src/RunSidebar.jsx` (import; signature 11-22; run row 55-86)
- Modify: `packages/react/src/RunsScreen.jsx` (import; signature 10-19; header 36-44; row 46-71)

**Interfaces:**
- Consumes: `resolveRunStatus` from `./runStatus.js` (Task 3); the `runStatus` prop on `ProcessRolodex` (Task 4).
- Produces: `RunSidebar` and `RunsScreen` each accept an optional `runStatus` prop and render the resolved word per run.

- [ ] **Step 1: Pass `runStatus` to both list components**

In `packages/react/src/ProcessRolodex.jsx`, add `runStatus={runStatus}` to the `RunSidebar` element (between `validators` at line 629 and `collapsed` at line 630):

```jsx
      <RunSidebar
        workflows={workflows}
        store={store}
        validators={validators}
        runStatus={runStatus}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenRun={openRun}
        onNewRun={newRun}
        onRename={doRename}
        onArchive={doArchive}
        onDelete={doDelete}
      />
```

And to the `RunsScreen` element (after `validators` at line 644):

```jsx
        <RunsScreen
          workflows={workflows}
          store={store}
          validators={validators}
          runStatus={runStatus}
          onOpenRun={openRun}
          onRename={doRename}
          onArchive={doArchive}
          onUnarchive={doUnarchive}
          onDelete={doDelete}
        />
```

- [ ] **Step 2: Render the word in `RunSidebar`**

In `packages/react/src/RunSidebar.jsx`:

Add the import after the existing core import (line 2):

```js
import { resolveRunStatus } from "./runStatus.js";
```

Add `runStatus` to the destructured props (between `validators` at line 14 and `collapsed` at line 15):

```js
  workflows,
  store,
  validators,
  runStatus,
  collapsed,
```

Inside the per-run map, after `sum` is computed (line 56), add:

```js
              const status = resolveRunStatus(runStatus, { def: w, run: e.run, runId: e.id });
```

In the open button, add the word after the count span (after lines 82-84), so the button contents become:

```jsx
                    <button className="pf-side-run-open" onClick={() => onOpenRun(e.id)}>
                      <span className="pf-side-run-name">{runDisplayName(w, store, e.id)}</span>
                      <span className="pf-side-meter">
                        <span
                          className="pf-side-meter-fill"
                          style={{ width: `${sum.total ? (sum.met / sum.total) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="pf-side-count">
                        {sum.met}/{sum.total}
                      </span>
                      {status && (
                        <span className="pf-side-status" data-tone={status.tone || undefined}>
                          {status.word}
                        </span>
                      )}
                    </button>
```

- [ ] **Step 3: Render the word in `RunsScreen`**

In `packages/react/src/RunsScreen.jsx`:

Add the import after the existing core import (line 2):

```js
import { resolveRunStatus } from "./runStatus.js";
```

Add `runStatus` to the destructured props (between `validators` at line 13 and `onOpenRun` at line 14):

```js
  workflows,
  store,
  validators,
  runStatus,
  onOpenRun,
```

Add a `Status` header column after the `Workflow` header (between lines 39 and 40):

```jsx
            <th>Run</th>
            <th>Workflow</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Updated</th>
            <th>Actions</th>
```

Inside the row map, after `sum` is computed (line 48), add:

```js
            const status = resolveRunStatus(runStatus, { def: w, run: e.run, runId: e.id });
```

Add a `Status` body cell after the `Workflow` cell (between line 71 `<td>{w.short || w.name}</td>` and line 72 `<td>` for Progress):

```jsx
                <td>{w.short || w.name}</td>
                <td>
                  {status ? (
                    <span className="pf-runs-status" data-tone={status.tone || undefined}>
                      {status.word}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td>
                  {sum.met}/{sum.total}
                </td>
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build -w examples/demo`
Expected: `✓ built in ...` with no errors.

- [ ] **Step 5: Verify the type-check passes**

Run: `npm run types`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx packages/react/src/RunSidebar.jsx packages/react/src/RunsScreen.jsx
git commit -m "feat(react): per-run status word in the sidebar and runs screen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Styling and an illustrative demo consumer

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (the inline stylesheet, near the `.pf-read-status` rule around line 1316 and the `.pf-side-count` rule)
- Modify: `examples/demo/src/App.jsx` (add `runStatus` and `renderRunHeader`)
- Modify: `examples/demo/src/demo.css` (verdict banner styling)

**Interfaces:**
- Consumes: the three injected props on `ProcessRolodex` (`generatedBadge` is left to its default in the demo; `runStatus` and `renderRunHeader` are wired).

- [ ] **Step 1: Add CSS for the new elements**

In `packages/react/src/ProcessRolodex.jsx`, find the inline style rule `.pf-render > .pf-gen-badge { left: 10px; right: auto; }` (line 1316) and add, immediately after it:

```css
.pf-read-header-slot { padding: 4px 0 14px; }
.pf-side-status, .pf-runs-status {
  font-family: 'IBM Plex Mono', monospace; font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase; color: #7A6A3C; background: #F1E8CE;
  border-radius: 4px; padding: 1px 5px; white-space: nowrap;
}
.pf-side-status { margin-left: 6px; }
.pf-side-status[data-tone="accept"], .pf-runs-status[data-tone="accept"] { color: #2E6E3F; background: #DDEFE0; }
.pf-side-status[data-tone="revise"], .pf-runs-status[data-tone="revise"] { color: #8F4E2E; background: #F4DFAE; }
```

(The `data-tone` rules are an opaque visual hint; an unknown tone simply falls back to the base chip styling, so the word always reads.)

- [ ] **Step 2: Wire an illustrative consumer into the demo**

In `examples/demo/src/App.jsx`, `getStepEntry` is already imported (line 3). Add these two functions above `export default function App()` (line 52):

```js
/* Illustrative consumer derivation. sqnce stays content-agnostic; a real
   consumer derives its own verdict. For the presales workflow, read the
   fit-gap step's text and surface a coarse ACCEPT/REVISE word; other
   workflows get no status word. */
function runStatus({ def, run }) {
  if (def.id !== "presales-pursuit") return null;
  const e = getStepEntry(run, "fit-gap");
  const text = e && e.outputs && typeof e.outputs.out === "string" ? e.outputs.out : "";
  if (!text.trim()) return null;
  return /\bgap\b/i.test(text) ? { word: "REVISE", tone: "revise" } : { word: "ACCEPT", tone: "accept" };
}

function renderRunHeader({ def, run, complete }) {
  if (!complete) return null;
  const st = runStatus({ def, run });
  if (!st) return null;
  return <div className={`demo-verdict demo-verdict-${st.tone}`}>Readiness: {st.word}</div>;
}
```

Add the two props to the `<ProcessRolodex>` element (after `renderers={RENDERERS}` at line 72):

```jsx
      <ProcessRolodex
        workflows={WORKFLOWS}
        workflowGroups={GROUPS}
        initialRunFor={initialRunFor}
        persistence={persistence}
        generateDraft={generateDraft}
        validators={validators}
        renderers={RENDERERS}
        runStatus={runStatus}
        renderRunHeader={renderRunHeader}
      />
```

Note: `App.jsx` uses JSX in `renderRunHeader`, and the file is already a `.jsx` compiled by the demo's Vite/esbuild toolchain, so the JSX there builds fine.

- [ ] **Step 3: Add demo verdict styling**

In `examples/demo/src/demo.css`, append:

```css
.demo-verdict {
  display: inline-block;
  font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.06em;
  text-transform: uppercase; border-radius: 6px; padding: 4px 10px;
  color: #7A6A3C; background: #F1E8CE;
}
.demo-verdict-accept { color: #2E6E3F; background: #DDEFE0; }
.demo-verdict-revise { color: #8F4E2E; background: #F4DFAE; }
```

- [ ] **Step 4: Run all three gates**

Run: `npm test`
Expected: PASS (core + 8 badge + 7 runStatus tests).

Run: `npm run build -w examples/demo`
Expected: `✓ built in ...`.

Run: `npm run types`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx examples/demo/src/App.jsx examples/demo/src/demo.css
git commit -m "feat(demo): styling and an illustrative run-status/header consumer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Acceptance check (maps to the spec's Acceptance section)

After Task 6, confirm each spec acceptance criterion:

1. A generated output on a done step is not labelled "AI draft": it shows "AI generated" (default) or the `generatedBadge` override. Covered by Tasks 1-2; verify by opening a run, generating a draft on a text step, and marking the step done: the badge text changes from "AI draft" to "AI generated".
2. With all three new props omitted, `ProcessRolodex` renders exactly as today, including the band's "Complete". Covered because every prop is optional and resolves to the prior default (`badge` undefined, `runStatus`/`renderRunHeader` absent, band shows "Complete").
3. The status word appears next to runs in the sidebar and the runs screen. Covered by Task 5; verify in the demo (presales runs with a fit-gap value show ACCEPT or REVISE).
4. The status word appears on the reading-mode run headline, replacing the default "Complete". Covered by Task 4; verify by completing a presales run and entering reading mode.
5. `npm test`, `npm run build -w examples/demo`, and `npm run types` pass. Covered by the per-task gate steps and Task 6 Step 4.

---

## Self-review (done while writing this plan)

- **Spec coverage:** Part 1 (lifecycle badge + override) is Tasks 1-2; Part 2 (`renderRunHeader` + `runStatus` in band, sidebar, runs screen) is Tasks 3-5; styling and demonstration are Task 6. Every acceptance criterion maps to a task above.
- **Placeholder scan:** no TBD/TODO; every code step shows the exact code and the exact before/after.
- **Type consistency:** `resolveGeneratedBadge` takes a single options object with `{ generated, lifecycle, spec, resolver }` everywhere it is called (Task 1 defines it, Task 2 calls it). `resolveRunStatus(resolver, ctx)` with `ctx = { def, run, runId }` is consistent across Task 3 (definition), Task 4 (ReadingView), and Task 5 (sidebar, runs screen). The `data-tone` attribute and `{ word, tone }` shape match across band, sidebar, and runs screen. Every new `ProcessRolodex` prop is added to the `ProcessRolodexProps` typedef, satisfying `checkJs`.
- **Reading-mode badge:** `ReadingView` keeps passing `generated={false}` and never passes `badge`. Because `OutputView` defaults `badge = null` (Task 2 Step 1), this both type-checks under `checkJs` and shows no badge on finished-run output, unchanged. No edit needed in `ReadingView` for Part 1.
- **checkJs required-prop audit:** the only new prop with more than one call site is `OutputView.badge`, defaulted to keep it optional. `ReadingView`, `RunSidebar`, and `RunsScreen` each have a single call site (in `ProcessRolodex`) that passes every new prop, so their inferred-required props are satisfied. `ProcessRolodex`'s own three new props are declared optional (`[...]`) in `ProcessRolodexProps`, so the demo passing only two of them type-checks.
