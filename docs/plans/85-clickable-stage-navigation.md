# Clickable stage navigation (jump-to-stage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the inert top stage stepper in the rolodex into a keyboard-accessible jump-to-stage control, where each reachable stage chip jumps to that stage's first sub-stage and unreachable chips stay disabled.

**Architecture:** A new pure helper in `@sqnce/react` (`railNav.js`) computes, per main stage, whether the rail chip is reachable (via the engine's own `jumpTo` probe, the same idiom `ReadingView` uses), plus the glyph and color-state class. `ProcessRolodex.jsx` calls that helper while rendering the rail and adds the click and keyboard handlers (mirroring the existing side-card pattern). The authoring pip row is aligned to clear transient UI state on jump, matching the rail and prev/next. No `@sqnce/core` change.

**Tech Stack:** Plain ESM JavaScript, React (JSX in `@sqnce/react`), Node's built-in test runner (`node:test`, Node 20+). No build step in `core`.

## Global Constraints

- Never use em dashes anywhere (code, comments, docs, commit messages, UI copy). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Keep `@sqnce/core` dependency-free and unchanged; this work is pure `@sqnce/react`.
- Renderers and validators never enter core except as arguments.
- License headers and existing file conventions stay as they are.
- Per-PR gates that must pass: `npm test`, `npm run build -w examples/demo`, and `npm run types` (CI re-runs all three).
- JSX syntax check command: `npx esbuild <file> --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`.

---

## File Structure

- Create: `packages/react/src/railNav.js`, the pure per-chip rail model (reachability probe, glyph, color-state). One responsibility: turn `(run, subs, mainStages, mainIndex, validators)` into `{ firstFlat, reachable, interactive, glyph, state, active }`. Internal helper, not part of the package public `index.js`.
- Create: `packages/react/test/railNav.test.js`, unit tests for the helper across linear (reachable, forced-but-unmet committed, ahead/locked) and forked (committed track stage, skipped track) runs.
- Modify: `packages/react/src/ProcessRolodex.jsx`, the top rail render block (around lines 571-588), the rail CSS (after `.pf-rail-ahead`, around line 1168), and the authoring pip-row `onClick` (around line 1005).

Note: the helper lives in a plain `.js` file (not the `.jsx` component) because `node --test` cannot parse JSX, so the testable logic must sit outside the component, matching the existing `runStatus.js`, `badge.js` helpers and their tests.

---

## Task 1: Pure rail-chip model helper

**Files:**
- Create: `packages/react/src/railNav.js`
- Test: `packages/react/test/railNav.test.js`

**Interfaces:**
- Consumes: `jumpTo`, `mainGateProgress` from `@sqnce/core` (both already public exports).
- Produces: `railChip(run, subs, mainStages, mainIndex, validators) -> { firstFlat: number, reachable: boolean, interactive: boolean, glyph: string, state: "active"|"done"|"ahead", active: boolean }`. `ProcessRolodex.jsx` (Task 2) consumes `firstFlat` (to call `jumpTo` on click), `interactive`, `glyph`, and `state`.

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/railNav.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenSubStages,
  createRun,
  setOutput,
  advance,
  jumpTo,
  skipTrack,
} from "@sqnce/core";
import { railChip } from "../src/railNav.js";

/* Minimal linear definition: four hybrid-gated main stages, one sub-stage and
   one required text step each. Flat index equals main index here. */
const LINEAR = {
  id: "lin",
  name: "Linear",
  subject: { stepId: "a", outputId: "o", field: "x", fallback: "?" },
  mainStages: [
    { id: "m0", name: "Intake", subStages: [{ id: "m0s", name: "Intake", gate: { type: "hybrid" }, steps: [{ id: "a", name: "A", required: true, outputs: [{ id: "o", type: "text", label: "O" }] }] }] },
    { id: "m1", name: "Findings", subStages: [{ id: "m1s", name: "Findings", gate: { type: "hybrid" }, steps: [{ id: "b", name: "B", required: true, outputs: [{ id: "o2", type: "text", label: "O2" }] }] }] },
    { id: "m2", name: "Design", subStages: [{ id: "m2s", name: "Design", gate: { type: "hybrid" }, steps: [{ id: "c", name: "C", required: true, outputs: [{ id: "o3", type: "text", label: "O3" }] }] }] },
    { id: "m3", name: "Deliver", subStages: [{ id: "m3s", name: "Deliver", gate: { type: "hybrid" }, steps: [{ id: "d", name: "D", required: true, outputs: [{ id: "o4", type: "text", label: "O4" }] }] }] },
  ],
};

/* Minimal forked definition: two-stage spine, one optional demo track stage,
   one required response track stage. */
const FORKED = {
  id: "frk",
  name: "Forked",
  subject: { stepId: "a", outputId: "o", field: "x", fallback: "?" },
  tracks: [
    { id: "demo", name: "Demo", optional: true },
    { id: "resp", name: "Resp" },
  ],
  mainStages: [
    { id: "s0", name: "Intake", subStages: [{ id: "s0s", name: "Intake", gate: { type: "hybrid" }, steps: [{ id: "a", name: "A", required: true, outputs: [{ id: "o", type: "text", label: "O" }] }] }] },
    { id: "s1", name: "Findings", subStages: [{ id: "s1s", name: "Findings", gate: { type: "hybrid" }, steps: [{ id: "b", name: "B", required: true, outputs: [{ id: "o2", type: "text", label: "O2" }] }] }] },
    { id: "d0", name: "Demo", track: "demo", subStages: [{ id: "d0s", name: "Demo", gate: { type: "hybrid" }, steps: [{ id: "c", name: "C", required: true, outputs: [{ id: "o3", type: "text", label: "O3" }] }] }] },
    { id: "r0", name: "Resp", track: "resp", subStages: [{ id: "r0s", name: "Resp", gate: { type: "hybrid" }, steps: [{ id: "e", name: "E", required: true, outputs: [{ id: "o4", type: "text", label: "O4" }] }] }] },
  ],
};

test("railChip linear: committed-and-met stage is a done, interactive tick", () => {
  const subs = flattenSubStages(LINEAR);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {}); // stage 0 gate met
  r = advance(r, subs).run; // frontier 1, idx on stage 1
  const c0 = railChip(r, subs, LINEAR.mainStages, 0, undefined);
  assert.equal(c0.reachable, true);
  assert.equal(c0.interactive, true);
  assert.equal(c0.glyph, "✓"); // tick
  assert.equal(c0.state, "done");
  assert.equal(c0.firstFlat, 0);
});

test("railChip linear: an ahead stage is locked and non-interactive", () => {
  const subs = flattenSubStages(LINEAR);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run; // frontier 1
  const c3 = railChip(r, subs, LINEAR.mainStages, 3, undefined);
  assert.equal(c3.reachable, false);
  assert.equal(c3.interactive, false);
  assert.equal(c3.glyph, "🔒"); // lock
});

test("railChip linear: a forced-but-unmet committed stage is interactive with a number glyph", () => {
  const subs = flattenSubStages(LINEAR);
  let r = createRun();
  r = advance(r, subs, { force: true }).run; // force past stage 0's unmet gate, frontier 1
  const c0 = railChip(r, subs, LINEAR.mainStages, 0, undefined);
  assert.equal(c0.reachable, true);
  assert.equal(c0.interactive, true);
  assert.equal(c0.glyph, "1"); // number, not a lock and not a tick
});

test("railChip forked: a committed track stage past the spine frontier is interactive with a number glyph", () => {
  const subs = flattenSubStages(FORKED);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run; // commit spine stage 0, frontier 1
  r = setOutput(r, "b", "o2", "y", {});
  r = advance(r, subs).run; // commit last spine stage, open the fork
  const cDemo = railChip(r, subs, FORKED.mainStages, 2, undefined); // demo stage, mainIndex 2 > frontier 1
  assert.equal(cDemo.reachable, true);
  assert.equal(cDemo.interactive, true);
  assert.equal(cDemo.glyph, "3"); // number, not a lock
});

test("railChip forked: a skipped track's stage is locked and non-interactive", () => {
  const subs = flattenSubStages(FORKED);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run;
  r = setOutput(r, "b", "o2", "y", {});
  r = advance(r, subs).run; // fork open
  r = skipTrack(r, FORKED, "demo"); // demo is optional, now skipped
  r = jumpTo(r, subs, 1); // move the centered card off the now-unreachable demo stage onto the spine
  const cDemo = railChip(r, subs, FORKED.mainStages, 2, undefined);
  assert.equal(cDemo.reachable, false);
  assert.equal(cDemo.interactive, false);
  assert.equal(cDemo.glyph, "🔒"); // lock
});

test("railChip forked: an optional track filled then skipped reads as locked, not done", () => {
  const subs = flattenSubStages(FORKED);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run;
  r = setOutput(r, "b", "o2", "y", {});
  r = advance(r, subs).run; // fork open, idx on demo (flat index 2)
  r = setOutput(r, "c", "o3", "z", {}); // fill the demo stage so its gate is met
  r = skipTrack(r, FORKED, "demo"); // optional demo is now skipped and unreachable
  r = jumpTo(r, subs, 1); // recenter onto the spine so active is not the demo stage
  const cDemo = railChip(r, subs, FORKED.mainStages, 2, undefined);
  assert.equal(cDemo.reachable, false);
  assert.equal(cDemo.interactive, false);
  assert.equal(cDemo.glyph, "🔒"); // lock, not a tick, even though the gate is met
  assert.notEqual(cDemo.state, "done");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/react/test/railNav.test.js`
Expected: FAIL. The error is a module-resolution / import failure for `railChip` (cannot find `../src/railNav.js`), because the helper does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/railNav.js`:

```javascript
import { jumpTo, mainGateProgress } from "@sqnce/core";

/**
 * Pure per-chip model for the top stage rail. Reachability is the engine's own
 * probe (the same idiom the reading-mode contents list uses): a stage is
 * reachable when jumpTo accepts a jump to its first sub-stage. That single
 * result drives both interactivity and the glyph, so the rail is correct for
 * linear and forked runs without any frontier arithmetic and without a core
 * change. The active/done/ahead color class follows the prior rail, except that
 * an unreachable stage is never shown as done: a skipped track that still holds
 * stale filled outputs (the engine keeps a skipped track's stepState) would
 * otherwise report its gate met, so reachability is checked before done.
 *
 * subStages is passed to mainGateProgress so a forked run scopes its
 * validators the same way the engine's advance does (the spine plus the
 * stage's own track); for a linear run there are no tracks, so this is inert.
 *
 * @param {import("@sqnce/core").Run} run
 * @param {import("@sqnce/core").FlatSubStage[]} subs Flat sub-stages (flattenSubStages output).
 * @param {import("@sqnce/core").MainStage[]} mainStages
 * @param {number} mainIndex
 * @param {Object<string, ((value: any, spec: any, ctx: any) => (string|null))>} [validators]
 * @returns {{ firstFlat: number, reachable: boolean, interactive: boolean, glyph: string, state: string, active: boolean }}
 */
export function railChip(run, subs, mainStages, mainIndex, validators) {
  const ms = mainStages[mainIndex];
  const firstFlat = subs.findIndex((s) => s.mainIndex === mainIndex);
  const reachable = firstFlat >= 0 && jumpTo(run, subs, firstFlat).idx === firstFlat;
  const allDone = mainGateProgress(ms, run, { validators, subStages: subs }).met;
  const centered = subs[Math.min(run.idx, subs.length - 1)];
  const active = !!centered && centered.mainIndex === mainIndex;
  const state = active ? "active" : reachable && allDone ? "done" : "ahead";
  const glyph = !reachable ? "🔒" : allDone ? "✓" : String(mainIndex + 1);
  return { firstFlat, reachable, interactive: reachable, glyph, state, active };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test packages/react/test/railNav.test.js`
Expected: PASS, 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/railNav.js packages/react/test/railNav.test.js
git commit -m "feat(react): pure rail-chip reachability model for jump-to-stage"
```

---

## Task 2: Wire the helper into the rail (click, keyboard, styling)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (rail render block around lines 571-588; rail CSS after `.pf-rail-ahead` around line 1168)

**Interfaces:**
- Consumes: `railChip` from Task 1; the existing in-scope `subs`, `run`, `def`, `frontier`, `validators`, `clearTransients`, `setNav`, `jumpTo`, `React`.
- Produces: no new exports; this wires the helper into the component render.

- [ ] **Step 1: Add the import for the helper**

In `packages/react/src/ProcessRolodex.jsx`, add to the local-module imports near the top (next to the `themeScope` import at line 2):

```javascript
import { railChip } from "./railNav.js";
```

- [ ] **Step 2: Replace the rail render block**

Replace this exact block (around lines 571-588):

```javascript
          {def.mainStages.map((ms, mi) => {
            /* Skip-aware: a stage whose remaining sub-stage gates are met
               reads done even when a skipped sub-stage's own gate is not. */
            const allDone = mainGateProgress(ms, run, { validators }).met;
            const stageLocked = mi > frontier;
            const state = mi === current.mainIndex ? "active" : allDone ? "done" : "ahead";
            const glyph = allDone ? "✓" : stageLocked ? "🔒" : String(mi + 1);
            return (
              <React.Fragment key={ms.id}>
                {mi > 0 && <span className={`pf-rail-line ${mi <= frontier ? "pf-rail-line-fill" : ""}`} />}
                <span className={`pf-rail-stage pf-rail-${state}`} aria-current={state === "active" ? "step" : undefined}>
                  <span className="pf-rail-circle">{glyph}</span>
                  {ms.name}
                  {state === "active" && <span className="pf-rail-here" aria-hidden="true">▾</span>}
                </span>
              </React.Fragment>
            );
          })}
```

with:

```javascript
          {def.mainStages.map((ms, mi) => {
            /* Reachability, glyph, and color-state come from the shared rail
               model: a chip is interactive exactly when the engine accepts a
               jump to its first sub-stage, so this is fork-aware with no
               frontier math and no core change. The active/done/ahead color
               class is unchanged; only the lock glyph and interactivity follow
               reachability. */
            const { firstFlat, interactive, glyph, state } = railChip(run, subs, def.mainStages, mi, validators);
            const go = () => {
              clearTransients();
              setNav(jumpTo(run, subs, firstFlat));
            };
            return (
              <React.Fragment key={ms.id}>
                {mi > 0 && <span className={`pf-rail-line ${mi <= frontier ? "pf-rail-line-fill" : ""}`} />}
                <span
                  className={`pf-rail-stage pf-rail-${state} ${interactive ? "pf-rail-clickable" : ""}`}
                  aria-current={state === "active" ? "step" : undefined}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? `Go to ${ms.name}` : undefined}
                  onClick={interactive ? go : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            go();
                          }
                        }
                      : undefined
                  }
                >
                  <span className="pf-rail-circle">{glyph}</span>
                  {ms.name}
                  {state === "active" && <span className="pf-rail-here" aria-hidden="true">▾</span>}
                </span>
              </React.Fragment>
            );
          })}
```

- [ ] **Step 3: Add the clickable and focus CSS**

In the CSS template string, immediately after the `.pf-rail-ahead { ... }` rule (around line 1168), add:

```css
.pf-rail-clickable { cursor: pointer; }
.pf-rail-clickable:hover { color: var(--sqnce-_accent); }
.pf-rail-clickable:focus-visible { outline: 2px solid var(--sqnce-_accent); outline-offset: 3px; border-radius: 4px; }
```

- [ ] **Step 4: Verify the JSX still parses**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output and exit 0 (a clean parse and bundle).

- [ ] **Step 5: Verify the helper tests and the demo build still pass**

Run: `node --test packages/react/test/railNav.test.js`
Expected: PASS, 6 tests.

Run: `npm run build -w examples/demo`
Expected: the Vite build completes with exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): make the top stage rail a jump-to-stage control"
```

---

## Task 3: Align the authoring pip row to clear transients on jump

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (the `.pf-pip` button `onClick` around line 1005)

**Interfaces:**
- Consumes: the existing in-scope `clearTransients`, `setNav`, `jumpTo`, `run`, `subs`.
- Produces: no new exports.

Rationale: the spec's approved open question 2 aligns the pip-row jump to the same transient-clearing the rail and prev/next use, so a stage switch from any control lands clean. The side cards are intentionally left unchanged here; the spec scoped the alignment to the pip row, and the side cards remain a separate pre-existing inconsistency.

- [ ] **Step 1: Update the pip-row onClick**

Replace this exact line (around line 1005):

```javascript
                onClick={() => setNav(jumpTo(run, subs, i))}
```

with:

```javascript
                onClick={() => { clearTransients(); setNav(jumpTo(run, subs, i)); }}
```

- [ ] **Step 2: Verify the JSX still parses**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output and exit 0.

- [ ] **Step 3: Verify the demo build**

Run: `npm run build -w examples/demo`
Expected: the Vite build completes with exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): clear transient UI state on pip-row jump, matching the rail"
```

---

## Task 4: Full gates and manual click-through

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all core and react test files pass, including the new `railNav.test.js` (6 tests).

- [ ] **Step 2: Run the demo build**

Run: `npm run build -w examples/demo`
Expected: exit 0.

- [ ] **Step 3: Run the types gate**

Run: `npm run types`
Expected: exit 0, no TypeScript declaration errors from the new JSDoc in `railNav.js`. (Generated `.d.ts` are gitignored in this repo; the gate is that the command exits clean.)

- [ ] **Step 4: Manual click-through (record the result in the PR)**

Run the demo (`npm run build -w examples/demo` then serve `examples/demo/dist`, or `npm run dev -w examples/demo`), open a workflow, advance a few stages, and confirm:
- Clicking a completed (tick) stage chip jumps to that stage's first sub-stage; the frontier does not move and the "Browsing history" hint shows.
- Clicking the current (active) stage chip recenters to that stage's first sub-stage.
- A stage ahead of the frontier shows a lock, is not clickable, and is skipped by keyboard Tab.
- Tabbing reaches each reachable chip with a visible focus outline; Enter and Space activate the jump.
- Jumping from the rail clears any expanded step, generation error, and the inputs panel (same as prev/next).
- The pip-row jump now also clears those transients.

- [ ] **Step 5: Drop nothing yet**

The plan stays on the branch until step 10 of the dev-workflow (the plan is removed in its own commit just before the code-review loop). No commit in this task.

---

## Self-Review

**1. Spec coverage:**
- "Each chip interactive when the engine accepts a jump" -> Task 1 `railChip.reachable`/`interactive`, Task 2 wiring.
- "Jump to the first sub-stage via jumpTo" -> Task 1 `firstFlat`, Task 2 `go()`.
- "Clears transient UI state" -> Task 2 `go()` calls `clearTransients()`; Task 3 aligns the pip row.
- "Frontier does not move" -> uses `setNav(jumpTo(...))`; `jumpTo` only sets `idx`; verified by the manual check and inherent to the primitive.
- "Glyph: tick / number / lock by reachability" -> Task 1 `glyph`, tested in Task 1.
- "Color classes unchanged, byte-identical for linear" -> Task 1 keeps `state` as active/done/ahead; tested by the linear cases.
- "Forked: committed track chip interactive, not a lock" -> Task 1 forked test; Task 2 wiring.
- "Accessibility: role/tabIndex/Enter+Space/aria-label/focus outline; ahead not focusable" -> Task 2 markup and CSS.
- "npm test and npm run build pass" -> Task 4.

**2. Placeholder scan:** No TBDs; every code step shows the full code and the exact command with expected output.

**3. Type consistency:** `railChip` is defined in Task 1 and consumed by the same name and field names (`firstFlat`, `interactive`, `glyph`, `state`) in Task 2. The click helper `go` is local to the rail map callback. The pip-row change reuses existing `clearTransients`/`setNav`/`jumpTo`.
