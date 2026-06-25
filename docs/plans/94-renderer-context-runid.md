# Renderer context runId Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `runId` (the active run entry id) to the renderer `context` at both build sites, so a custom renderer can resolve run-wide data from a shared store.

**Architecture:** Pure `@sqnce/react` change. Extract a small pure helper, `buildRendererContext`, that both context build sites (the editing rolodex view in `ProcessRolodex.jsx` and the reading view in `ReadingView.jsx`) call, so the renderer-context field set lives in one place and is unit-testable under the repo's pure-helper test convention (the React package has no DOM-render harness). `OutputView` still owns the `expanded` flag and passes the context straight through to the resolved renderer. No `@sqnce/core` change.

**Tech Stack:** Plain ESM JavaScript (no build step in source), React (JSX, peer dependency), Node's built-in test runner (`node:test`, Node 20+), `tsc` for `.d.ts` generation.

## Global Constraints

- No em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Pure `@sqnce/react`; never touch `@sqnce/core`. Renderers and validators never enter core.
- Generic, additive, backward-compatible: existing renderers ignore the new field; no behavior change to any existing renderer or view.
- `runId` is typed `string | null` (the active run entry id, or null when there is no active run entry).
- The `.d.ts` that `npm run types` emits are gitignored (`.gitignore` ignores `packages/*/types/`); none are committed. CI's `test` job runs `npm run types`, and its `pack` job verifies each tarball contains `types/index.d.ts` (produced by `prepack`).
- Tests use `node:test` and `node:assert/strict`, following `packages/react/test/badge.test.js` and `runStatus.test.js`.
- Per-PR gates (must pass): `npm test`, `npm run build -w examples/demo`, `npm run types`.

---

### Task 1: Pure helper `buildRendererContext` plus unit test

**Files:**
- Create: `packages/react/src/rendererContext.js`
- Test: `packages/react/test/rendererContext.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildRendererContext({ workflowId: string, stepId: string, subject: string, readOnly: boolean, runId?: string | null }) => { workflowId: string, stepId: string, subject: string, readOnly: boolean, runId: string | null }`. `runId` defaults to `null` when omitted. The returned object intentionally has no `expanded` key (OutputView sets that per view branch).

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/rendererContext.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRendererContext } from "../src/rendererContext.js";

test("buildRendererContext: carries runId through", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "X", readOnly: false, runId: "r1" });
  assert.equal(ctx.runId, "r1");
});

test("buildRendererContext: runId is null when supplied as null (no active entry)", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "X", readOnly: false, runId: null });
  assert.equal(ctx.runId, null);
});

test("buildRendererContext: runId defaults to null when omitted", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "X", readOnly: false });
  assert.equal(ctx.runId, null);
});

test("buildRendererContext: carries the existing fields unchanged and adds no others", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "Subject", readOnly: true, runId: "r9" });
  assert.deepEqual(ctx, { workflowId: "w", stepId: "s", subject: "Subject", readOnly: true, runId: "r9" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL. The new file's tests error because `../src/rendererContext.js` does not exist (`ERR_MODULE_NOT_FOUND`). Existing 209 tests still pass.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/rendererContext.js`:

```js
/*
 * Build the context object passed to a custom output renderer.
 *
 * Single source for the renderer-context field set so the two build sites
 * (the editing rolodex view in ProcessRolodex.jsx and the reading view in
 * ReadingView.jsx) cannot drift. The `expanded` flag is deliberately not set
 * here: OutputView owns it and sets it per view branch (inline vs the
 * full-screen overlay).
 */

/**
 * @param {Object} args
 * @param {string} args.workflowId
 * @param {string} args.stepId
 * @param {string} args.subject
 * @param {boolean} args.readOnly
 * @param {string | null} [args.runId] the active run entry id, or null when
 *   there is no active run entry (a brand-new workflow with no run yet)
 * @returns {{ workflowId: string, stepId: string, subject: string, readOnly: boolean, runId: string | null }}
 */
export function buildRendererContext({ workflowId, stepId, subject, readOnly, runId = null }) {
  return { workflowId, stepId, subject, readOnly, runId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. All four `buildRendererContext` tests pass; total is 213 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/rendererContext.js packages/react/test/rendererContext.test.js
git commit -m "feat(react): add buildRendererContext helper carrying runId (#94)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire both build sites to the helper and add `runId` to the typedef

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (import at line 42 area; typedef at lines 159-166; context build at line 868)
- Modify: `packages/react/src/ReadingView.jsx` (import at line 3 area; context build at line 159)

**Interfaces:**
- Consumes: `buildRendererContext` from Task 1.
- Produces: a renderer `context` that includes `runId` at both views. `ProcessRolodex` supplies `runId: activeRunId`, a dedicated variable holding the active run id (`entry ? entry.id : null`) derived at the top of the component; `ReadingView` supplies its existing nullable `runId` prop (also fed from `activeRunId`).

**Shadowing caution (important):** at the `OutputView` site (line 868) the name `entry` is shadowed by a per-step `const entry = getStepEntry(run, step.id)` inside `sub.steps.map` (line 777). That `entry` is a `StepEntry` (`{ checkedDone, outputs }`, no `id`), so `entry.id` there is `undefined`, not the active run id. Do not read `entry.id` at line 868. Derive `activeRunId` near line 236 (where `entry` is the active run entry) and use that.

There is no DOM-render unit test for the JSX wiring (the React package has no DOM harness, and adding one is out of scope per the spec). The helper's logic is covered by Task 1; the wiring is verified by the syntax check, the build, and the unchanged existing tests.

- [ ] **Step 1: Add the import to `ProcessRolodex.jsx`**

After the existing line `import OutputView from "./OutputView.jsx";` (line 42), add:

```js
import { buildRendererContext } from "./rendererContext.js";
```

- [ ] **Step 2: Add `runId` to the `RendererContext` typedef in `ProcessRolodex.jsx`**

Replace the typedef block (lines 159-166):

```js
/**
 * @typedef {Object} RendererContext
 * @property {string} workflowId
 * @property {string} stepId
 * @property {string} subject
 * @property {boolean} readOnly
 * @property {boolean} [expanded]
 */
```

with:

```js
/**
 * @typedef {Object} RendererContext
 * @property {string} workflowId
 * @property {string} stepId
 * @property {string} subject
 * @property {boolean} readOnly
 * @property {string | null} runId the active run entry id, or null when there is no active run entry
 * @property {boolean} [expanded]
 */
```

- [ ] **Step 3: Derive `activeRunId` once at the top of the component in `ProcessRolodex.jsx`**

The active run entry is computed at line 235 (`const entry = activeRunEntry(store, activeId);`), and `readOnly` at line 236. Immediately after line 236, add a dedicated variable for the active run id (it is null for a brand-new workflow with no run yet, so the nullable form is required):

```js
  const activeRunId = entry ? entry.id : null;
```

Context for the insertion point (the lines read):

```js
  const entry = activeRunEntry(store, activeId);
  const readOnly = !!entry && entry.status === "archived";
```

becomes:

```js
  const entry = activeRunEntry(store, activeId);
  const readOnly = !!entry && entry.status === "archived";
  const activeRunId = entry ? entry.id : null;
```

- [ ] **Step 4: Wire the editing-view context build in `ProcessRolodex.jsx`**

Replace line 868:

```jsx
                                context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly }}
```

with (note `runId: activeRunId`, not `entry.id`, because `entry` is shadowed here):

```jsx
                                context={buildRendererContext({ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly, runId: activeRunId })}
```

- [ ] **Step 5: Consolidate the `ReadingView` runId prop on `activeRunId` in `ProcessRolodex.jsx`**

The `ReadingView` is mounted in the outer render scope (line 683), where `entry` is the active run entry and the inline `entry ? entry.id : null` is already correct. Switch it to the dedicated variable so the active run id has a single source. Replace line 683:

```jsx
          runId={entry ? entry.id : null}
```

with:

```jsx
          runId={activeRunId}
```

- [ ] **Step 6: Add the import to `ReadingView.jsx`**

After the existing line `import OutputView from "./OutputView.jsx";` (line 3), add:

```js
import { buildRendererContext } from "./rendererContext.js";
```

- [ ] **Step 7: Wire the reading-view context build in `ReadingView.jsx`**

Replace line 159:

```jsx
                      context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: true, expanded: false }}
```

with:

```jsx
                      context={buildRendererContext({ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: true, runId })}
```

(`runId` is already a prop of `ReadingView`, passed down from `ProcessRolodex` as `entry ? entry.id : null`. The `expanded: false` is dropped because `OutputView` always overrides `expanded` per view branch via `{ ...context, expanded }`, so removing it is behavior-preserving.)

- [ ] **Step 8: Syntax-check both modified JSX files**

Run:

```bash
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
npx esbuild packages/react/src/ReadingView.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```

Expected: both exit 0 with no output (no syntax errors; the `./rendererContext.js` import resolves).

- [ ] **Step 9: Run tests and the demo build**

Run: `npm test`
Expected: PASS, 213 tests, 0 failures (the wiring does not change any test).

Run: `npm run build -w examples/demo`
Expected: the Vite build completes successfully (exit 0), confirming the JSX changes bundle.

- [ ] **Step 10: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx packages/react/src/ReadingView.jsx
git commit -m "feat(react): pass runId in the renderer context at both build sites (#94)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Document `runId` (contract comment and README) and verify types

**Files:**
- Modify: `packages/react/src/OutputView.jsx:13` (the renderer-contract comment that enumerates the context fields)
- Modify: `README.md` (the "Custom renderers" section paragraph, around line 173)

**Interfaces:**
- Consumes: the `runId` field added in Task 2.
- Produces: no code surface; documentation only, plus a clean `npm run types` run.

- [ ] **Step 1: Update the renderer-contract comment in `OutputView.jsx`**

Replace line 13:

```js
 * context = { workflowId, stepId, subject, readOnly, expanded }.
```

with:

```js
 * context = { workflowId, stepId, subject, readOnly, runId, expanded }.
 * runId is the active run entry id (null when there is no active run yet).
```

- [ ] **Step 2: Document `runId` in the README "Custom renderers" section**

In `README.md`, find the sentence:

```
`context.expanded` flips to true inside the full-screen overlay; re-fit on its change.
```

Replace it with:

```
`context.expanded` flips to true inside the full-screen overlay; re-fit on its change. `context.runId` is the active run entry id (null when there is no active run yet), so a host can resolve run-wide data (for example a citation pointing into another step of the same run) from a shared store while rendering one step's output.
```

- [ ] **Step 3: Run the types gate**

Run: `npm run types`
Expected: exit 0, `tsc` emits no error. (It writes `.d.ts` into `packages/core/types/` and `packages/react/types/`, both gitignored.)

- [ ] **Step 4: Confirm nothing new is tracked or left uncommitted**

Run: `git status --short`
Expected: shows only the two modified files staged or unstaged (`packages/react/src/OutputView.jsx`, `README.md`) plus the pre-existing untracked `node_modules` symlink. No `packages/*/types/` paths appear (they are gitignored).

- [ ] **Step 5: Final gate run**

Run: `npm test`
Expected: PASS, 213 tests, 0 failures.

Run: `npm run build -w examples/demo`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/OutputView.jsx README.md
git commit -m "docs(react): document renderer context runId in contract comment and README (#94)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the implementer

- Do not run `git add -A` or `git add .` in this worktree: `node_modules` is an unignored symlink here (the `.gitignore` `node_modules/` pattern matches only real directories, not the symlink). Stage files explicitly, as every commit step above does.
- The `.d.ts` files are gitignored; never commit them.
- This is the implementation plan, a working artifact. It is removed before the code review (`git rm docs/plans/94-renderer-context-runid.md`) so it never reaches `main`.
