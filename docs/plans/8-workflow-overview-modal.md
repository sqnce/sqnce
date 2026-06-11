# workflow overview modal implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the project workflow governs execution: `inline` tasks run in the main loop, `delegate: sonnet` tasks dispatch to a Sonnet subagent.

**Goal:** An About button in the rolodex header opens a full-screen modal explaining the active workflow: what it is, how its gates work, the full stage tree, and where the run currently is.

**Architecture:** One new presentation component, `OverviewModal`, derives everything from the definition plus run state using existing `@sqnce/core` exports; `ProcessRolodex` gains a transient `overviewOpen` state, the button, and the modal's styles. No core changes, no new props, no persistence.

**Tech Stack:** React (plain ESM JSX, no build step in the package), `@sqnce/core` pure functions, CSS appended to the component's existing CSS string.

**Spec:** `docs/specs/8-workflow-overview-modal.md`.

---

### Task 1: `OverviewModal` component (`inline`)

**Files:**
- Create: `packages/react/src/OverviewModal.jsx`

- [ ] **Step 1: Write the component**

Create `packages/react/src/OverviewModal.jsx` with exactly this content:

```jsx
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  gateProgress,
  gateTypeOf,
  isSubStageSkipped,
  mainGateProgress,
  runSummary,
  wasAdvanceForced,
} from "@sqnce/core";

/*
 * Full-screen explainer for the active workflow: what the process is,
 * how its gates work, the stage tree, and where the run currently is.
 * Read-only: derived entirely from the definition plus run state, no
 * mutations, nothing persisted. Reuses the pf-overlay pattern from
 * OutputView (portal to body: the rolodex cards are CSS-transformed,
 * which would trap position: fixed overlays inside the card).
 */
export default function OverviewModal({ def, run, subs, idx, frontier, validators, onClose }) {
  useEffect(() => {
    /* No textarea/input guard: Escape is not a typing key and the
       modal should always close. */
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = subs[idx];
  const gateTypes = new Set(subs.map((s) => gateTypeOf(s)));
  const anySkippable = subs.some((s) => s.skippable);
  const progress = runSummary(def, run, { validators });

  return createPortal(
    <div className="pf-overlay" role="dialog" aria-modal="true">
      <div className="pf-overlay-head">
        <span className="pf-overlay-title">About this process</span>
        <button className="pf-btn pf-btn-sm" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="pf-overlay-body">
        <div className="pf-ov">
          <h2 className="pf-ov-name">{def.name}</h2>
          {def.short && <p className="pf-ov-short">{def.short}</p>}

          <h3 className="pf-ov-heading">How it works</h3>
          <ul className="pf-ov-rules">
            {gateTypes.has("hybrid") && (
              <li>
                A step counts as complete once it has any output or is checked done
                {gateTypes.has("strict")
                  ? ", except in strict sub-stages, where only the explicit done mark counts"
                  : ""}
                .
              </li>
            )}
            {!gateTypes.has("hybrid") && gateTypes.has("strict") && (
              <li>
                Every sub-stage here is strict: a step counts as complete only when it is
                explicitly checked done.
              </li>
            )}
            <li>
              Sub-stages within a committed main stage are freely browsable. Entering the next
              main stage passes its boundary gate: every required step across the stage's
              sub-stages must be complete.
            </li>
            <li>
              The gate guides rather than blocks: advancing past an unmet gate is always
              possible with the explicit override.
            </li>
            {anySkippable && (
              <li>
                Some sub-stages can be marked not applicable; they leave the gate aggregate and
                the progress count until restored.
              </li>
            )}
          </ul>

          <div className="pf-ov-stages-head">
            <h3 className="pf-ov-heading">Stages</h3>
            <span className="pf-ov-progress">
              {progress.met} of {progress.total} gates met
            </span>
          </div>
          {def.mainStages.map((ms, mi) => {
            const p = mainGateProgress(ms, run, { validators });
            const locked = mi > frontier;
            const glyph = p.met ? "✓" : locked ? "🔒" : String(mi + 1);
            const forced = wasAdvanceForced(run, mi) && !p.met;
            return (
              <div
                key={ms.id}
                className={`pf-ov-stage ${mi === current.mainIndex ? "pf-ov-stage-active" : ""}`}
              >
                <div className="pf-ov-stage-row">
                  <span className="pf-ov-glyph">{glyph}</span>
                  <span className="pf-ov-stage-name">{ms.name}</span>
                  {forced && <span className="pf-ov-forced">Advanced with open steps</span>}
                </div>
                {subs.map((sub, fi) =>
                  sub.mainIndex !== mi ? null : (
                    <div key={sub.id} className="pf-ov-sub">
                      <div className="pf-ov-sub-row">
                        <span className="pf-ov-sub-name">{sub.name}</span>
                        <span className="pf-ov-gate">{gateTypeOf(sub)} gate</span>
                        <span className="pf-ov-status">
                          {isSubStageSkipped(run, sub.id)
                            ? "Not applicable"
                            : gateProgress(sub, run, { validators }).met
                              ? "Gate met"
                              : "In progress"}
                        </span>
                        {fi === idx && <span className="pf-ov-here">you are here</span>}
                      </div>
                      {sub.description && <p className="pf-ov-sub-desc">{sub.description}</p>}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Syntax check**

Run from the worktree root:

```bash
npx esbuild packages/react/src/OverviewModal.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/OverviewModal.jsx
git commit -m "overview modal component (#8)"
```

### Task 2: wire the modal into ProcessRolodex (`inline`)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (import block ~line 40, state ~line 192, keyboard effect ~line 348, clearTransients ~line 299, header-right ~line 500, end of render ~line 883, CSS string end ~line 1240)

- [ ] **Step 1: Import the component**

In `ProcessRolodex.jsx`, after `import RunsScreen from "./RunsScreen.jsx";` add:

```jsx
import OverviewModal from "./OverviewModal.jsx";
```

- [ ] **Step 2: Add the transient state**

After the line `const [sidebarOpen, setSidebarOpen] = useState(true);` add:

```jsx
const [overviewOpen, setOverviewOpen] = useState(false);
```

- [ ] **Step 3: Clear it with the other transients**

In `clearTransients`, after `setManualEdit([]);` add:

```jsx
setOverviewOpen(false);
```

(This is what closes the modal on run, workflow, and view switches; the spec relies on the existing transient-clearing path.)

- [ ] **Step 4: Suppress arrow browsing while the modal is open**

Replace the body of the existing keydown handler:

```jsx
const onKey = (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") doBrowse(-1);
  if (e.key === "ArrowRight") doBrowse(1);
};
```

with:

```jsx
const onKey = (e) => {
  if (overviewOpen) return;
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") doBrowse(-1);
  if (e.key === "ArrowRight") doBrowse(1);
};
```

(The effect already re-registers every render with no dependency array, so the closure sees the current `overviewOpen`.)

- [ ] **Step 5: Add the About button**

In the `pf-header-right` div, immediately before the `Runs` toggle button (the one whose label is `view === "runs" ? "Back to run" : "Runs"`), add:

```jsx
{view === "rolodex" && (
  <button
    className="pf-reset"
    onClick={() => setOverviewOpen(true)}
    title="About this process"
  >
    About
  </button>
)}
```

The button renders in the rolodex view only (like `pf-counter`) and is never disabled: archived runs still get orientation.

- [ ] **Step 6: Render the modal**

At the end of the component's return, the current closing sequence is:

```jsx
      </div>
      </div>
    </div>
  );
```

Insert the modal before the final `</div>` (the one closing `pf-root`):

```jsx
      </div>
      </div>
      {overviewOpen && (
        <OverviewModal
          def={def}
          run={run}
          subs={subs}
          idx={idx}
          frontier={frontier}
          validators={validators}
          onClose={() => setOverviewOpen(false)}
        />
      )}
    </div>
  );
```

- [ ] **Step 7: Append the modal styles**

In the `CSS` template literal, immediately before the final media query block (`@media (max-width: 720px) {`, currently line 1252), add:

```css
/* ---------- overview modal ---------- */
.pf-ov { max-width: 760px; margin: 0 auto; width: 100%; }
.pf-ov-name { margin: 6px 0 2px; font-size: 24px; }
.pf-ov-short { margin: 0 0 6px; color: #5E6772; font-size: 14px; }
.pf-ov-heading { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #7A6A3C; margin: 22px 0 8px; }
.pf-ov-rules { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 13.5px; line-height: 1.5; }
.pf-ov-stages-head { display: flex; align-items: baseline; justify-content: space-between; }
.pf-ov-progress { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #5E6772; }
.pf-ov-stage { border: 1px solid #D8D3C2; border-radius: 8px; background: #FFFFFF; padding: 10px 14px; margin: 0 0 10px; }
.pf-ov-stage-active { border-color: #D9A441; box-shadow: 0 0 0 1px #D9A441; }
.pf-ov-stage-row { display: flex; align-items: center; gap: 8px; }
.pf-ov-glyph {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; border: 1px solid #23282F; font-family: 'IBM Plex Mono', monospace;
}
.pf-ov-stage-name { font-weight: 600; font-size: 14px; }
.pf-ov-forced { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.04em; color: #D9A441; margin-left: auto; }
.pf-ov-sub { padding: 7px 0 0 26px; }
.pf-ov-sub-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.pf-ov-sub-name { font-size: 13px; font-weight: 500; }
.pf-ov-gate { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #8A8E96; }
.pf-ov-status { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.04em; color: #5E6772; }
.pf-ov-here { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.04em; color: #23282F; background: #D9A441; border-radius: 4px; padding: 1px 7px; }
.pf-ov-sub-desc { margin: 3px 0 0; font-size: 12.5px; color: #5E6772; line-height: 1.45; }
```

Keep the statuses mono gray as written; the gold you-are-here badge carries the hierarchy. Do not add status coloring beyond the rules above.

- [ ] **Step 8: Syntax check and demo build**

```bash
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
npm run build -w examples/demo
```

Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "about button opens the workflow overview modal (#8)"
```

### Task 3: README sentence (`delegate: sonnet`)

**Files:**
- Modify: `packages/react/README.md` (intro paragraph, line 3)

- [ ] **Step 1: Document the feature**

In `packages/react/README.md`, in the intro paragraph ending `See the [repository README](../../README.md) for usage.`, insert this sentence before that final sentence:

```
An About button in the header opens a read-only overview of the active workflow: its description, how its gates work, the full stage tree, and a you-are-here marker.
```

- [ ] **Step 2: Commit**

```bash
git add packages/react/README.md
git commit -m "readme: mention the workflow overview modal (#8)"
```

### Task 4: manual verification in the demo (`inline`)

**Files:** none (verification only; fixes found here return to the main loop as deviations)

- [ ] **Step 1: Launch the demo**

```bash
npm run dev -w examples/demo
```

Expected: Vite dev server URL on stdout.

- [ ] **Step 2: Walk the acceptance criteria**

In the browser (use the playwright-core plus system Chrome workaround if scripting):

1. The About button appears in the header in the rolodex view, not on the runs screen.
2. Click About: full-screen overlay titled "About this process" with the four sections; the seeded car-buying run shows the you-are-here badge on the centered sub-stage.
3. Main stage glyphs agree with the header rail (✓ / number / 🔒, active stage highlighted).
4. Browse to another sub-stage (close the modal first; arrows must do nothing while it is open), reopen: the badge moved.
5. Press Escape with focus in a textarea: the modal closes.
6. Skip a skippable sub-stage: its row reads "Not applicable" and the gates-met count excludes it.
7. Force an advance past an unmet gate: the stage shows "Advanced with open steps"; complete the stage's required steps: the note disappears.
8. Archive the run, reopen it read-only: About still opens.
9. Hybrid-only definitions show no strict line in How it works; definitions with no skippable sub-stage show no skip line (check a second workflow, for example meal-planning vs presales).

- [ ] **Step 3: Report**

Record pass/fail per item in the PR conversation. Any failure is a deviation: fix in the main loop, re-run the failed items, push.
