# Non-blocking advisory channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive, non-blocking advisory channel to the `Sqnce` rolodex: an optional `advisories` prop whose per-sub-stage warnings render as a card marker and foot notes, distinct from the blocking gate validators and never affecting a gate.

**Architecture:** A pure, React-free resolver (`resolveAdvisories`) normalizes a consumer-supplied `advisories` function into a safe render-ready list, mirroring `resolveStageStatus`. The list is computed only in `RolodexView` (the deck) and never passed to `@sqnce/core`, so it cannot affect any gate, the run summary, completion, or advance. Rendering is two surfaces fed by that one list: a marker in the always-visible card strip and full notes in the centered card's foot.

**Tech Stack:** Plain ESM JavaScript, React (JSX) in `@sqnce/react`, Node's built-in test runner (`node:test`, Node 20+). No build step in core; core is not touched.

## Global Constraints

- Never use em dashes anywhere (code, comments, docs, commit messages, UI copy). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Keep `@sqnce/core` dependency-free and untouched: advisories never enter core in any form, not even as an argument. No new run-state field, no new engine function, no change to any gate, summary, completion, status, or draft-context computation.
- The new value is render-only: a buggy or throwing consumer function must degrade to no advisory, never blank or crash the deck (the repo's degrade-not-crash contract, as in `applyReconcile`, `resolveStageStatus`, `resolveGeneratedBadge`).
- Reuse existing theme tokens; do not add new tokens to `THEME_TOKENS`.
- Gates (run before claiming done): `npm test` (every `*.test.js` across `packages/core` and `packages/react`), `npm run build -w examples/demo`, `npm run types` (exits clean; the generated `.d.ts` are gitignored, so the gate is a clean run, not a committed file).
- Run all commands from the worktree root `~/dev/sqnce-worktrees/121-advisory-channel`. Stage files explicitly so the `node_modules` symlink stays out of commits.

---

### Task 1: The pure resolver and its tests

**Files:**
- Create: `packages/react/src/advisories.js`
- Test: `packages/react/test/advisories.test.js`

**Interfaces:**
- Consumes: nothing (pure, no imports).
- Produces: `resolveAdvisories({ advisories, ctx }) => { message: string, severity: "info"|"warning" }[]`. Total: a missing function, a throw, or a non-array return all yield `[]`. Each item needs a non-empty trimmed string `message` or it is dropped; `severity` normalizes to `"warning"` or `"info"` (`"info"` for absent or unrecognized). `RolodexView` (Task 2) imports this.

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/advisories.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAdvisories } from "../src/advisories.js";

const ctx = { def: { id: "w" }, run: {}, runId: "r1", subStageId: "sub-1" };

test("resolveAdvisories: no function returns an empty list", () => {
  assert.deepEqual(resolveAdvisories({ advisories: undefined, ctx }), []);
});

test("resolveAdvisories: a throwing function degrades to an empty list", () => {
  assert.deepEqual(
    resolveAdvisories({ advisories: () => { throw new Error("boom"); }, ctx }),
    []
  );
});

test("resolveAdvisories: a non-array return degrades to an empty list", () => {
  assert.deepEqual(resolveAdvisories({ advisories: () => "nope", ctx }), []);
  assert.deepEqual(resolveAdvisories({ advisories: () => null, ctx }), []);
  assert.deepEqual(resolveAdvisories({ advisories: () => ({ message: "x" }), ctx }), []);
});

test("resolveAdvisories: items without a non-empty message are dropped", () => {
  const out = resolveAdvisories({
    advisories: () => [
      { message: "" },
      { message: "   " },
      { severity: "warning" },
      null,
      "string-item",
      { message: "kept" },
    ],
    ctx,
  });
  assert.deepEqual(out, [{ message: "kept", severity: "info" }]);
});

test("resolveAdvisories: recognized severities pass through, message is trimmed", () => {
  const out = resolveAdvisories({
    advisories: () => [
      { message: "  warn me  ", severity: "warning" },
      { message: "fyi", severity: "info" },
    ],
    ctx,
  });
  assert.deepEqual(out, [
    { message: "warn me", severity: "warning" },
    { message: "fyi", severity: "info" },
  ]);
});

test("resolveAdvisories: absent or unrecognized severity normalizes to info", () => {
  const out = resolveAdvisories({
    advisories: () => [
      { message: "a" },
      { message: "b", severity: "danger" },
      { message: "c", severity: 5 },
    ],
    ctx,
  });
  assert.deepEqual(out, [
    { message: "a", severity: "info" },
    { message: "b", severity: "info" },
    { message: "c", severity: "info" },
  ]);
});

test("resolveAdvisories: the function receives the context unchanged", () => {
  let seen = null;
  resolveAdvisories({ advisories: (c) => { seen = c; return []; }, ctx });
  assert.equal(seen, ctx);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/react/test/advisories.test.js`
Expected: FAIL, cannot find module `../src/advisories.js` (or `resolveAdvisories is not a function`).

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/advisories.js`:

```javascript
/*
 * Non-blocking advisory items for one sub-stage card, resolved from an
 * optional consumer-supplied function. Pure and React-free so it runs under
 * node:test: it never renders, it only normalizes the consumer's return into
 * a safe, render-ready list. Advisories inform, never block: this value is
 * computed in the view only and never enters @sqnce/core, so it cannot affect
 * a gate, the run summary, completion, or advance.
 */

/* Recognized advisory severities. Anything else normalizes to "info". */
const SEVERITIES = new Set(["info", "warning"]);

/**
 * Resolve the advisory list to render for one sub-stage. Total and
 * degrade-not-crash: a missing function, a throwing function, or a non-array
 * return all yield []. Each item must have a non-empty string message (after
 * trimming) or it is dropped; severity normalizes to "warning" or "info"
 * ("info" for absent or unrecognized). Matches resolveStageStatus and
 * applyReconcile: a buggy consumer hook can never blank or crash the deck.
 * @param {Object} args
 * @param {((ctx: any) => any)} [args.advisories] the advisories prop
 * @param {any} args.ctx context passed to the advisories function
 * @returns {{ message: string, severity: "info"|"warning" }[]}
 */
export function resolveAdvisories({ advisories, ctx }) {
  if (typeof advisories !== "function") return [];
  let raw;
  try {
    raw = advisories(ctx);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const message = typeof item.message === "string" ? item.message.trim() : "";
    if (!message) continue;
    const severity = SEVERITIES.has(item.severity) ? item.severity : "info";
    out.push({ message, severity });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/react/test/advisories.test.js`
Expected: PASS, all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/advisories.js packages/react/test/advisories.test.js
git commit -m "feat(react): add resolveAdvisories resolver and tests"
```

---

### Task 2: Wire the prop through the shell and render it in the deck

**Files:**
- Modify: `packages/react/src/Sqnce.jsx` (prop destructure ~line 209; slots pass-down ~line 672; prop doc block ~line 87; `SqnceProps` typedef ~line 199)
- Modify: `packages/react/src/RolodexView.jsx` (import ~line 21; slots destructure ~line 35; per-card resolution ~line 80; marker in `pf-card-strip` ~line 114; foot notes in `pf-card-foot` ~line 312)
- Modify: `packages/react/src/styles.js` (new classes after `.pf-gate-met` ~line 353)
- Test: none new (JSX is verified by build plus manual demo; the resolver is already tested in Task 1)

**Interfaces:**
- Consumes: `resolveAdvisories` from `./advisories.js` (Task 1).
- Produces: a new optional `advisories` prop on `Sqnce` with signature `(ctx: { def, run, runId, subStageId }) => Array<{ message: string, severity?: "info"|"warning" }>`.

- [ ] **Step 1: Add the resolver import to RolodexView**

In `packages/react/src/RolodexView.jsx`, after the line `import { resolveStageStatus } from "./stageStatus.js";` (line 21), add:

```javascript
import { resolveAdvisories } from "./advisories.js";
```

- [ ] **Step 2: Destructure `advisories` from slots in RolodexView**

In `packages/react/src/RolodexView.jsx`, change the slots destructure (line 35) from:

```javascript
  const { validators, renderers, generateDraft, generatedBadge, renderStageStatus } = slots;
```

to:

```javascript
  const { validators, advisories, renderers, generateDraft, generatedBadge, renderStageStatus } = slots;
```

- [ ] **Step 3: Resolve advisories per drawn card**

In `packages/react/src/RolodexView.jsx`, in the `subs.map` body, immediately after the line `const skipped = isSubStageSkipped(run, sub.id);` (line 80), add:

```javascript
          const cardAdvisories = skipped
            ? []
            : resolveAdvisories({
                advisories,
                ctx: { def, run, runId: activeRunId, subStageId: sub.id },
              });
          const advisoryHasWarning = cardAdvisories.some((a) => a.severity === "warning");
          const advisoryLabel = `${cardAdvisories.length} ${cardAdvisories.length === 1 ? "advisory" : "advisories"}`;
```

- [ ] **Step 4: Render the marker in the always-visible card strip**

In `packages/react/src/RolodexView.jsx`, replace the lone `pf-card-count` span inside `pf-card-strip` (lines 114-118):

```javascript
                <span className="pf-card-count">
                  {skipped
                    ? "Skipped"
                    : `${p.done}/${p.total} required${p.gateType === "strict" ? " · strict gate" : ""}`}
                </span>
```

with a right-aligned group that holds an optional marker before the count:

```javascript
                <span className="pf-card-strip-right">
                  {cardAdvisories.length > 0 && (
                    <span
                      className={`pf-card-advisory pf-card-advisory-${advisoryHasWarning ? "warning" : "info"}`}
                      aria-label={advisoryLabel}
                      title={advisoryLabel}
                    >
                      {advisoryHasWarning ? "⚠" : "ℹ"} {cardAdvisories.length}
                    </span>
                  )}
                  <span className="pf-card-count">
                    {skipped
                      ? "Skipped"
                      : `${p.done}/${p.total} required${p.gateType === "strict" ? " · strict gate" : ""}`}
                  </span>
                </span>
```

- [ ] **Step 5: Render the full notes in the centered card's foot**

In `packages/react/src/RolodexView.jsx`, the foot is `{center && (<div className="pf-card-foot"> ... </div>)}` (line 311). Insert the advisories block as the first child of `pf-card-foot`, immediately after the opening `<div className="pf-card-foot">` (line 312) and before the `{inFrontierStage ? (` line:

```javascript
                  {cardAdvisories.length > 0 && (
                    <div className="pf-advisories">
                      {cardAdvisories.map((a, ai) => (
                        <div key={ai} className={`pf-advisory pf-advisory-${a.severity}`}>
                          <span className="pf-advisory-icon" aria-hidden="true">
                            {a.severity === "warning" ? "⚠" : "ℹ"}
                          </span>
                          <span className="pf-advisory-msg">{a.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
```

(`cardAdvisories` is already `[]` for a skipped sub-stage, so no extra skip guard is needed here.)

- [ ] **Step 6: Add the styles**

In `packages/react/src/styles.js`, after the line `.pf-gate-met { color: var(--sqnce-_done); }` (line 353), add:

```css
.pf-card-strip-right { display: inline-flex; align-items: center; gap: 10px; }
.pf-card-advisory {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 7px; border-radius: var(--sqnce-_radius-sm);
  font-family: var(--sqnce-_font-mono); font-size: 10.5px; letter-spacing: 0.04em;
}
.pf-card-advisory-warning { background: var(--sqnce-_revise-bg); color: var(--sqnce-_revise-ink); }
.pf-card-advisory-info { background: var(--sqnce-_status-bg); color: var(--sqnce-_ink-muted-on-card); }
.pf-advisories { flex-basis: 100%; display: flex; flex-direction: column; gap: var(--sqnce-_space-2); margin-bottom: 4px; }
.pf-advisory {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 10px; border-radius: var(--sqnce-_radius-control);
  font-size: 12px; line-height: 1.35;
}
.pf-advisory-warning { background: var(--sqnce-_revise-bg); color: var(--sqnce-_revise-ink); }
.pf-advisory-info { background: var(--sqnce-_status-bg); color: var(--sqnce-_ink-muted-on-card); }
.pf-advisory-icon { flex-shrink: 0; }
.pf-advisory-msg { flex: 1; }
```

(These reuse existing tokens: `_revise-bg` and `_revise-ink` for warning, `_status-bg` and `_ink-muted-on-card` for info, `_radius-sm`, `_radius-control`, and `_space-2`. None use the danger or lock palette, so an advisory never reads as a closed gate.)

- [ ] **Step 7: Destructure `advisories` in the Sqnce props**

In `packages/react/src/Sqnce.jsx`, change the props destructure (line 209) from:

```javascript
export default function Sqnce({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, contextViews, generatedBadge, renderRunHeader, runStatus, renderStageStatus, reconcileRun }) {
```

to add `advisories` right after `validators`:

```javascript
export default function Sqnce({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, advisories, contextViews, generatedBadge, renderRunHeader, runStatus, renderStageStatus, reconcileRun }) {
```

- [ ] **Step 8: Pass `advisories` into the RolodexView slots**

In `packages/react/src/Sqnce.jsx`, change the slots prop on `RolodexView` (line 672) from:

```javascript
          slots={{ validators, renderers, generateDraft, generatedBadge, renderStageStatus }}
```

to:

```javascript
          slots={{ validators, advisories, renderers, generateDraft, generatedBadge, renderStageStatus }}
```

- [ ] **Step 9: Document the prop in the Sqnce doc block**

In `packages/react/src/Sqnce.jsx`, in the prop doc comment block, immediately after the `validators` entry (the block that ends `*      nothing.` at line 93) and before the `contextViews` entry (line 94), add:

```javascript
 *  - advisories (optional): (ctx) => Array<{ message, severity? }>, a pure
 *      function called once per drawn sub-stage card with ctx = { def, run,
 *      runId, subStageId }. It returns non-blocking advisory items for that
 *      sub-stage: each item has a message and an optional severity ("info" |
 *      "warning"; an absent or unrecognized value normalizes to "info").
 *      They render as a marker on the sub-stage card and as notes in the
 *      centered card's foot, distinct from the blocking gate state.
 *      Advisories inform, never block: the value is computed in the view only
 *      and never enters core, so it cannot affect a gate, the run summary,
 *      completion, or advance. Every failure mode (no function, a throw, a
 *      non-array return, an item without a message) degrades to no advisory.
 *      Skipped sub-stages show none. Omit to show none.
```

- [ ] **Step 10: Add the prop to the SqnceProps typedef**

In `packages/react/src/Sqnce.jsx`, in the `SqnceProps` typedef, immediately after the `validators` property line (line 199) and before the `contextViews` property line (line 200), add:

```javascript
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null, subStageId: string }) => ({ message: string, severity?: "info"|"warning" }[])} [advisories] Pure function returning non-blocking advisory items for a sub-stage; render-only, never enters core, degrades every failure mode to no advisory. Optional.
```

- [ ] **Step 11: Syntax-check the two JSX files**

Run:

```bash
npx esbuild packages/react/src/RolodexView.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
npx esbuild packages/react/src/Sqnce.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```

Expected: both exit 0 with no output.

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: PASS, every `*.test.js` across `packages/core` and `packages/react` passes, including the new `advisories.test.js`. No existing test changes behavior (the `advisories` slot is absent in every existing test path, so the resolver returns `[]` and nothing renders).

- [ ] **Step 13: Build the demo**

Run: `npm run build -w examples/demo`
Expected: a clean production build (this compiles the JSX, the hard gate for the new rendering code).

- [ ] **Step 14: Regenerate the types**

Run: `npm run types`
Expected: exits clean (the generated `.d.ts` are gitignored, so the gate is a clean run, not a committed file).

- [ ] **Step 15: Manual demo check of the two visible surfaces (local only, reverted)**

This repo has no component-render test harness, so confirm the rendering once by eye. Because the worktree's `node_modules` is a symlink to main, a plain demo build resolves `@sqnce/react` to main, so add a temporary Vite alias and a temporary `advisories` function, verify, then revert both (do not commit them).

1. In `examples/demo/vite.config.*`, temporarily alias `@sqnce/react` to `../../packages/react/src/index.js` (worktree source).
2. In the demo's `Sqnce` usage, temporarily pass `advisories={({ subStageId }) => subStageId === "<some real sub-stage id>" ? [{ message: "3 pains listed; demos usually need 5+", severity: "warning" }, { message: "tip: attach a call recording", severity: "info" }] : []}`.
3. Run `npm run dev -w examples/demo`, open the deck, and confirm: the chosen sub-stage card shows the marker (including while it is a side card), centering it shows the two notes in the foot distinct from the gate line, the gate state and the advance button are unchanged, and a skipped sub-stage shows no advisory.
4. Revert the alias and the temporary `advisories` wiring (`git checkout -- examples/demo`).

- [ ] **Step 16: Commit**

```bash
git add packages/react/src/Sqnce.jsx packages/react/src/RolodexView.jsx packages/react/src/styles.js
git commit -m "feat(react): wire advisories prop and render marker plus foot notes (#121)"
```

---

## Self-Review

**Spec coverage:**
- "New `advisories` (non-blocking) channel with per-sub-stage warnings": Task 2 Steps 7-10 (prop, slots, docs, typedef) plus Task 1 (resolver). Covered.
- "Render distinctly from blocking gate state": Task 2 Steps 4-6 (marker and foot notes with their own classes, amber/cream not danger/lock). Covered.
- "Never block submit/advance": the resolved list is computed only in `RolodexView` and never passed to core (Task 2 Step 3 builds it locally; no core call takes it). Covered structurally.
- "Existing validators behavior unchanged when omitted": with no `advisories` slot the resolver returns `[]` (Task 1 first test), nothing renders, core untouched. Covered.
- Severity vocabulary (info/warning, unknown to info), trimming, degrade-not-crash: Task 1 Steps 1-4. Covered.
- Skipped sub-stages show none: Task 2 Step 3 (`skipped ? []`). Covered.
- Testing (resolver unit tests, build, types, manual demo): Task 1 plus Task 2 Steps 11-15. Covered.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the manual-check step names concrete temporary edits and a revert. The only `<some real sub-stage id>` is a deliberate fill-in for a local throwaway check, not committed code.

**Type consistency:** `resolveAdvisories({ advisories, ctx })` returning `{ message, severity }[]` is defined in Task 1 and consumed identically in Task 2 Step 3; the prop signature `(ctx: { def, run, runId, subStageId }) => ...` matches between the call site (Step 3), the doc block (Step 9), and the typedef (Step 10). Class names (`pf-card-strip-right`, `pf-card-advisory`, `pf-card-advisory-warning`, `pf-card-advisory-info`, `pf-advisories`, `pf-advisory`, `pf-advisory-warning`, `pf-advisory-info`, `pf-advisory-icon`, `pf-advisory-msg`) match between the JSX (Steps 4-5) and the CSS (Step 6).
