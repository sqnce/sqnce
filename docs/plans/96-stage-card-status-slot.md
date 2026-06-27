# Per-step status slot on stage cards: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `renderStageStatus` prop to `ProcessRolodex` so a consumer can paint its own badge in place of a deck card's generic "Done"/"Draft" status word.

**Architecture:** A pure, React-free helper (`stageStatus.js`) decides whether the consumer's node or the generic word is shown; `ProcessRolodex.jsx` calls it where it currently inlines the status word. The demo wires the slot as the reference consumer. This mirrors the `runStatus.js` / `badge.js` split already in the package.

**Tech Stack:** Plain ESM JavaScript, React (JSX) in `@sqnce/react`, Node's built-in test runner (`node:test`). No build step in core; no new dependencies.

## Global Constraints

- `@sqnce/core` must not change. This is `@sqnce/react` and `examples/demo` only. (CLAUDE.md: keep core dependency-free; new UI work goes in `@sqnce/react`.)
- Never use em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Plain ESM JavaScript, no TypeScript syntax. Types come from JSDoc.
- The override contract: only a `null` or `undefined` return from the slot falls back to the generic word; any other return value (including a falsy non-nullish node) is shown as given.
- Generated `.d.ts` files are gitignored in this repo, so the types gate is "`npm run types` exits clean", not "commit the `.d.ts`". Do not stage or commit generated declaration files.
- Stage files explicitly in every commit (the worktree's `node_modules` is an untracked symlink that must never be committed).

**Gates (run from the worktree root):**
- `npm test` (runs `node --test packages/core/test/*.test.js packages/react/test/*.test.js`). The react tests import `../src/*.js` by relative path, so this validates the worktree source.
- `npm run build -w examples/demo`
- `npm run types`

**Worktree build caveat (important):** this worktree's `node_modules` is a symlink to the main checkout's `node_modules`, and `node_modules/@sqnce/react` resolves to the main checkout's `packages/react`, not this worktree's. So `npm run build -w examples/demo` run here bundles main's `@sqnce/react`, which means it validates `examples/demo/src/App.jsx` and that the bundle resolves, but it does NOT compile this worktree's `ProcessRolodex.jsx` change. The worktree's react-source change is validated locally by the esbuild syntax check (Task 2, Step 6) and authoritatively by CI (which checks out the branch fresh, with no cross-worktree symlink, and runs the real build). To watch the `ProcessRolodex.jsx` change actually render locally, alias `@sqnce/react` to this worktree's `packages/react/src` in `examples/demo/vite.config` for the manual verification (Task 4, Step 4), then revert the alias.

---

### Task 1: Pure `stageStatus.js` helper + unit test

**Files:**
- Create: `packages/react/src/stageStatus.js`
- Test: `packages/react/test/stageStatus.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `defaultStageStatusWord(status: "done"|"draft"|"open") => string`, the generic word ("Done", "Draft", or "").
  - `resolveStageStatus({ render?: (ctx) => any, ctx: any, status: "done"|"draft"|"open" }) => { node: any } | { word: string }`, which returns `{ node }` when the slot returns a non-nullish value, else `{ word }`.

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/stageStatus.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultStageStatusWord, resolveStageStatus } from "../src/stageStatus.js";

const ctx = { def: { id: "w" }, run: {}, runId: "r1", stepId: "s1", status: "done" };
const NODE = { sentinel: true };

test("defaultStageStatusWord: maps each lifecycle to its word", () => {
  assert.equal(defaultStageStatusWord("done"), "Done");
  assert.equal(defaultStageStatusWord("draft"), "Draft");
  assert.equal(defaultStageStatusWord("open"), "");
});

test("resolveStageStatus: no render slot falls back to the generic word", () => {
  assert.deepEqual(resolveStageStatus({ render: undefined, ctx, status: "done" }), { word: "Done" });
  assert.deepEqual(resolveStageStatus({ render: undefined, ctx, status: "draft" }), { word: "Draft" });
  assert.deepEqual(resolveStageStatus({ render: undefined, ctx, status: "open" }), { word: "" });
});

test("resolveStageStatus: a returned node is shown", () => {
  assert.deepEqual(resolveStageStatus({ render: () => NODE, ctx, status: "done" }), { node: NODE });
});

test("resolveStageStatus: a null or undefined return falls back to the generic word", () => {
  assert.deepEqual(resolveStageStatus({ render: () => null, ctx, status: "draft" }), { word: "Draft" });
  assert.deepEqual(resolveStageStatus({ render: () => undefined, ctx, status: "open" }), { word: "" });
});

test("resolveStageStatus: only nullish falls back; a falsy non-nullish node is shown", () => {
  assert.deepEqual(resolveStageStatus({ render: () => false, ctx, status: "done" }), { node: false });
});

test("resolveStageStatus: the render slot receives the context", () => {
  let seen = null;
  resolveStageStatus({ render: (c) => { seen = c; return NODE; }, ctx, status: "done" });
  assert.deepEqual(seen, ctx);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, the `packages/react/test/stageStatus.test.js` cases error with a module-not-found for `../src/stageStatus.js` (the file does not exist yet). The existing core and react suites still pass.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/stageStatus.js`:

```js
/*
 * Per-step status word on a deck card, resolved from an optional
 * consumer-supplied render slot. Pure and React-free so it runs under
 * node:test: it never renders, it only decides whether the consumer's
 * node or the generic word is shown. The node is opaque here; the JSX in
 * ProcessRolodex renders whichever side this returns.
 */

/**
 * Default per-step status word, by lifecycle state. Mirrors the mapping
 * that was inline in ProcessRolodex: a done step reads "Done", a draft
 * step reads "Draft", an open step reads nothing.
 * @param {"done"|"draft"|"open"} status
 * @returns {string}
 */
export function defaultStageStatusWord(status) {
  return status === "done" ? "Done" : status === "draft" ? "Draft" : "";
}

/**
 * Resolve what to show on one step's status line. When the consumer
 * supplies a render slot and it returns a non-nullish value, that value
 * (a React node) is shown; only null or undefined falls back to the
 * generic word, so a consumer returns null to defer and returns its own
 * empty node to show nothing. Returns a discriminated result so the JSX
 * stays thin and this stays testable without a DOM.
 * @param {Object} args
 * @param {((ctx: any) => any)} [args.render] the renderStageStatus prop
 * @param {any} args.ctx context passed to the render slot
 * @param {"done"|"draft"|"open"} args.status
 * @returns {{ node: any } | { word: string }}
 */
export function resolveStageStatus({ render, ctx, status }) {
  if (typeof render === "function") {
    const node = render(ctx);
    if (node !== null && node !== undefined) return { node };
  }
  return { word: defaultStageStatusWord(status) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, all six `stageStatus` cases pass; the core and react suites remain green.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/stageStatus.js packages/react/test/stageStatus.test.js
git commit -m "feat(react): pure stageStatus resolver for the per-step status slot (#96)"
```

---

### Task 2: Wire `renderStageStatus` into `ProcessRolodex`

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (import at line 52; JSDoc prose around line 117; typedef around line 189; destructuring at line 193; the status-word span at lines 843-845)

**Interfaces:**
- Consumes: `resolveStageStatus` from Task 1.
- Produces: a new optional prop `renderStageStatus(ctx: { def, run, runId, stepId, status }) => ReactNode` on `ProcessRolodex`, consumed by the demo in Task 3.

- [ ] **Step 1: Add the import**

In `packages/react/src/ProcessRolodex.jsx`, after the existing line 52 `import { resolveRunStatus } from "./runStatus.js";`, add:

```js
import { resolveStageStatus } from "./stageStatus.js";
```

- [ ] **Step 2: Document the prop in the JSDoc prose block**

In the prop list comment, immediately after the `runStatus` entry (the block that ends around line 117 with `* in the lists and keep "Complete" in the band.`), add this entry:

```js
 *  - renderStageStatus (optional): ({ def, run, runId, stepId, status })
 *      => ReactNode, a per-step status badge shown in place of the generic
 *      "Done"/"Draft" word on a deck card's step row. status is the step's
 *      lifecycle ("done" | "draft" | "open"). Only a null or undefined
 *      return falls back to the generic word; any other return is shown as
 *      given. Called once per drawn step, so keep it cheap and pure. Omit
 *      to show the generic word everywhere.
```

- [ ] **Step 3: Add the typedef property**

In the `ProcessRolodexProps` typedef, immediately after the `runStatus` property (line 189), add:

```js
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null, stepId: string, status: "done"|"draft"|"open" }) => import("react").ReactNode} [renderStageStatus]
```

- [ ] **Step 4: Destructure the new prop**

Change the function signature at line 193 from:

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus }) {
```

to:

```js
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus, renderStageStatus }) {
```

- [ ] **Step 5: Replace the inline status word with the resolver**

Replace the span at lines 843-845, which currently reads:

```jsx
                          <span className="pf-step-state">
                            {status === "done" ? "Done" : status === "draft" ? "Draft" : ""}
                          </span>
```

with:

```jsx
                          <span className="pf-step-state">
                            {(() => {
                              const ss = resolveStageStatus({
                                render: renderStageStatus,
                                ctx: { def, run, runId: activeRunId, stepId: step.id, status },
                                status,
                              });
                              return "node" in ss ? ss.node : ss.word;
                            })()}
                          </span>
```

(`def`, `run`, `activeRunId`, `step.id`, and `status` are all already in scope here: `def` line 235, `run` line 244, `activeRunId` line 242, `status` line 814.)

- [ ] **Step 6: Syntax-check the changed JSX**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output and exit 0 (no syntax error).

- [ ] **Step 7: Verify the package gates still pass (prop omitted is unchanged)**

Run: `npm test`
Expected: PASS, unchanged; the helper test and all suites stay green.

Run: `npm run build -w examples/demo`
Expected: the demo builds successfully. Per the worktree build caveat, this bundles main's `@sqnce/react`, so it confirms `App.jsx` and bundle resolution, not the `ProcessRolodex.jsx` edit; Step 6's esbuild check is what validated that edit's syntax. The full build of this branch's react source runs in CI.

- [ ] **Step 8: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): renderStageStatus slot on ProcessRolodex stage cards (#96)"
```

---

### Task 3: Demo reference wiring

**Files:**
- Modify: `examples/demo/src/App.jsx` (add a `renderStageStatus` function near the existing `renderRunHeader`, around lines 64-69; pass the prop to `ProcessRolodex`, around line 93)

**Interfaces:**
- Consumes: the `renderStageStatus` prop from Task 2; the existing `runStatus` helper and `demo-verdict` / `demo-verdict-<tone>` classes already in the demo.
- Produces: nothing downstream; this is the reference consumer.

- [ ] **Step 1: Add the demo render slot**

In `examples/demo/src/App.jsx`, immediately after the `renderRunHeader` function (which ends at line 69), add:

```jsx
/* Reference per-step badge: on the presales workflow, paint the coarse
   ACCEPT/REVISE verdict over the fit-gap step's status word once it is
   done. Other steps and workflows keep the generic word. */
function renderStageStatus({ def, run, stepId, status }) {
  if (def.id !== "presales-pursuit" || stepId !== "fit-gap" || status !== "done") return null;
  const st = runStatus({ def, run });
  if (!st) return null;
  return <span className={`demo-verdict demo-verdict-${st.tone}`}>{st.word}</span>;
}
```

- [ ] **Step 2: Pass the prop to `ProcessRolodex`**

In the `<ProcessRolodex ... />` element, after the `renderRunHeader={renderRunHeader}` line (line 93), add:

```jsx
        renderStageStatus={renderStageStatus}
```

- [ ] **Step 3: Build the demo**

Run: `npm run build -w examples/demo`
Expected: the demo builds successfully with the slot wired.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/App.jsx
git commit -m "feat(demo): wire renderStageStatus as the reference per-step badge (#96)"
```

---

### Task 4: Full gates + manual demo verification

**Files:** none changed (verification only). If the manual check or types run reveals a defect, fix it in the owning file from Task 1-3 and re-run that task's gate before continuing.

- [ ] **Step 1: Run the test gate**

Run: `npm test`
Expected: PASS, every core and react suite, including `stageStatus.test.js`.

- [ ] **Step 2: Run the build gate**

Run: `npm run build -w examples/demo`
Expected: build succeeds (locally this bundles main's `@sqnce/react` per the worktree build caveat; CI builds this branch's react source fresh and is the authoritative build gate).

- [ ] **Step 3: Run the types gate**

Run: `npm run types`
Expected: exits 0 with no JSDoc/`tsc` errors (the new `renderStageStatus` typedef is valid). Then run `git status --short` and confirm no generated `.d.ts` files are staged or tracked (they are gitignored); commit nothing here.

- [ ] **Step 4: Manual demo verification**

`@sqnce/react` has no DOM render harness, so verify the JSX wiring by driving the demo (per the repo pattern). Build/serve the demo with the worktree's `@sqnce/react` aliased in (so the build resolves the worktree source, not main), open the presales workflow, drive a run so the Solutioning sub-stage's `fit-gap` step is done, and confirm:
  - the `fit-gap` step's status word shows the ACCEPT or REVISE pill instead of "Done";
  - every other step still shows its generic "Done"/"Draft"/blank word;
  - removing the `renderStageStatus` prop restores "Done" on `fit-gap` (the fallback path).

Record the result (what was observed) in the PR. If the wiring is wrong (for example the pill does not replace the word, or the fallback is inverted), fix `ProcessRolodex.jsx` (Task 2, Step 5) and re-run Steps 1-4.

- [ ] **Step 5: Confirm the branch state**

Run: `git status --short`
Expected: only the untracked `node_modules` symlink; no other unstaged or untracked changes. All work from Tasks 1-3 is committed.

---

## Self-Review

**Spec coverage:**
- "Add one optional injected prop `renderStageStatus`": Task 2 (destructuring, typedef, JSDoc).
- "context `{ def, run, runId, stepId, status }`": Task 2, Step 5 (the `ctx` object) and the typedef.
- "override with fallback; only nullish falls back": Task 1 (`resolveStageStatus`) plus its tests (null/undefined fall back, `false` shown).
- "extract a pure React-free helper mirroring `runStatus.js`": Task 1.
- "replace the inline ternary at line 844": Task 2, Step 5.
- "wire a minimal `renderStageStatus` into the demo": Task 3.
- "add the typedef; `npm run types` regenerates the `.d.ts`": Task 2, Step 3 plus Task 4, Step 3 (with the gitignored-`.d.ts` caveat).
- "deck only; reading view untouched": no `ReadingView.jsx` change in any task.
- "unit test covering absent/null/node": Task 1, Step 1.
- "gates: `npm test`, `npm run build -w examples/demo`, `npm run types`": Task 4.

**Placeholder scan:** no TBD/TODO; every code step shows full code; every command has expected output.

**Type consistency:** `defaultStageStatusWord` and `resolveStageStatus` are named identically in Task 1's implementation, its test, and Task 2's call site. The `ctx` keys (`def`, `run`, `runId`, `stepId`, `status`) match between Task 2's call, the typedef, the JSDoc prose, and Task 3's destructuring (`def`, `run`, `stepId`, `status`).
