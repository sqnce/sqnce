# Reading mode for finished runs: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flat reading view for finished runs that opens by default when a run is complete, keeping the authoring card-deck behind an "Edit run" toggle.

**Architecture:** Pure `@sqnce/react`. A new `ReadingView.jsx` renders a contents rail (the committed reachable main stages), a run-header band, and a document canvas of each stage's outputs expanded, reusing `OutputView` read-only. `ProcessRolodex` gains a third `view` value, `"reading"`, decides completeness with the existing core `isRunComplete` export, and routes a complete run to reading on open and on run/workflow switch. No `@sqnce/core` change: completeness is `isRunComplete`, reachability is `jumpTo`, output values come from `getStepEntry`.

**Tech Stack:** React 18 (function components, hooks), `@sqnce/core` (pure engine, consumed as imports), plain ESM, no build step in `core`. `packages/react` has no unit-test runner; per repo convention each task is gated by the esbuild JSX syntax check plus the demo build, with manual demo confirmation for behavior.

## Global Constraints

- Pure `@sqnce/react` only. No `@sqnce/core` change anywhere in this plan.
- Renderers and validators stay injected props; they never enter core and ReadingView only consumes the injected `renderers`.
- No em dashes anywhere (code, comments, UI copy). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Plain ESM JavaScript. React import style matches the file: `import React, { ... } from "react";`.
- Completeness predicate is the existing export `isRunComplete(definition, run, { validators })`. Do not hand-roll a frontier check.
- Reachability is `jumpTo(run, subs, index)`: index `f` is reachable exactly when `jumpTo(run, subs, f).idx === f` (core `index.js:990-994`). This omits skipped tracks and unreached stages for free.
- Output values are read with `getStepEntry(run, stepId).outputs[outputId]`, never from a RunEntry field.
- Reading mode is read-only, but `OutputView` forwards `onChange` to custom renderers even in view mode, so always pass a no-op `onChange={() => {}}` (never undefined), or a renderer that calls the prop throws only in reading mode.
- Reading order over a fork is the `def.mainStages` index order (spine, then kept tracks in declaration order), filtered to the reachable set.
- esbuild syntax check command (run from the worktree root):
  `npx esbuild <file> --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
- Per-PR gates that must pass before the code review: `npm test`, `npm run build -w examples/demo`, `npm run types` (and the regenerated `.d.ts` committed if changed).

---

## File structure

- Create `packages/react/src/ReadingView.jsx`: the reading-mode component. One responsibility: present a finished run for reading (rail, header band, document canvas, prev/next, edit toggle). Pure props in, no store access.
- Modify `packages/react/src/OutputView.jsx:169`: let the inline renderer view honor an incoming `expanded` context instead of forcing it false, so reading mode can render renderer-backed outputs in their full form. Backward compatible: the authoring deck never sets `context.expanded`, so it stays false there.
- Modify `packages/react/src/ProcessRolodex.jsx`: add the `"reading"` view (import, view-switch branch, completeness, routing, the rolodex Read button), and append the reading-mode CSS to the `CSS` template literal.

No other files change. `packages/react/src/index.js` is untouched: `ReadingView` is internal, only `ProcessRolodex` stays exported, so the public API and the generated `.d.ts` do not change.

---

### Task 1: Reading-mode rendering (OutputView tweak + ReadingView)

**Files:**
- Modify: `packages/react/src/OutputView.jsx:169`
- Create: `packages/react/src/ReadingView.jsx`

**Interfaces:**
- Consumes: `jumpTo`, `getStepEntry`, `hasValue`, `isSubStageSkipped` from `@sqnce/core`; `OutputView` from `./OutputView.jsx`.
- Produces: `export default function ReadingView({ def, run, subs, runName, renderers, subjectName, onJump, onEdit })`.
  - `def`: the active `Definition`. `run`: the active run state `{ idx, frontier, stepState, ... }`. `subs`: `flattenSubStages(def)` (flat sub-stages, each carrying `id, name, description, mainIndex, steps`). `runName`: string for the header title. `renderers`: injected renderer map (may be undefined). `subjectName`: string for `OutputView` context. `onJump(flatIndex: number): void`: caller jumps the run to that flat sub-stage. `onEdit(): void`: caller switches to the authoring rolodex.

- [ ] **Step 1: Let OutputView's inline view honor an incoming `expanded`**

In `packages/react/src/OutputView.jsx`, the inline render view (~169) forces `expanded: false`, so a renderer that switches on `expanded` (for example the demo `FlowDiagram`) can never render its full layout inline. Change that one line so an explicit `expanded: true` from the caller passes through, while the authoring deck (which never sets `expanded`) keeps the compact form. Replace:

```jsx
            context={{ ...context, expanded: false }}
```

with:

```jsx
            context={{ ...context, expanded: !!(context && context.expanded) }}
```

(The overlay path at ~209 still passes `expanded: true` and is unchanged.)

- [ ] **Step 2: Syntax-check OutputView**

Run: `npx esbuild packages/react/src/OutputView.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: exits 0, no output.

- [ ] **Step 3: Write the component**

```jsx
import React, { useMemo } from "react";
import { jumpTo, getStepEntry, hasValue, isSubStageSkipped } from "@sqnce/core";
import OutputView from "./OutputView.jsx";

/*
 * Reading mode for a (typically finished) run: a flat, non-3D document
 * view, so it never recreates the card deck's CSS transform that traps
 * position: fixed overlays. The contents rail lists the committed
 * reachable main stages (the ones jumpTo accepts, so skipped tracks and
 * unreached stages drop out); the canvas renders each stage's filled
 * outputs read-only and expanded; prev/next walk the reachable stages in
 * reading order (def.mainStages order: spine, then kept tracks). No engine
 * change: reachability is jumpTo, output values come from getStepEntry,
 * and the caller decides completeness.
 */
export default function ReadingView({ def, run, subs, runName, renderers, subjectName, onJump, onEdit }) {
  const firstFlatOf = (mi) => subs.findIndex((s) => s.mainIndex === mi);

  /* The committed reachable main stages, in def order. A stage is readable
     when its first sub-stage is a jumpTo target (jumpTo returns idx === f
     only when f is reachable), which excludes skipped tracks and stages
     past the frontier without any frontier math here. */
  const readable = useMemo(() => {
    const out = [];
    for (let mi = 0; mi < def.mainStages.length; mi++) {
      const f = subs.findIndex((s) => s.mainIndex === mi);
      if (f >= 0 && jumpTo(run, subs, f).idx === f) out.push(mi);
    }
    return out;
  }, [def, run, subs]);

  const selectedMain = subs[Math.min(run.idx, subs.length - 1)].mainIndex;
  const at = readable.indexOf(selectedMain);
  const prevMi = at > 0 ? readable[at - 1] : null;
  const nextMi = at >= 0 && at < readable.length - 1 ? readable[at + 1] : null;

  const stageSubs = subs.filter((s) => s.mainIndex === selectedMain && !isSubStageSkipped(run, s.id));

  return (
    <div className="pf-read">
      <nav className="pf-read-rail" aria-label="Contents">
        {readable.map((mi) => (
          <button
            key={def.mainStages[mi].id}
            className={`pf-read-toc ${mi === selectedMain ? "pf-read-here" : ""}`}
            aria-current={mi === selectedMain ? "step" : undefined}
            onClick={() => onJump(firstFlatOf(mi))}
          >
            {def.mainStages[mi].name}
          </button>
        ))}
      </nav>

      <div className="pf-read-doc">
        <header className="pf-read-band">
          <h1 className="pf-read-title">{runName}</h1>
          <span className="pf-read-status">Complete</span>
        </header>

        <article className="pf-read-canvas">
          <h2 className="pf-read-stage">{def.mainStages[selectedMain].name}</h2>
          {stageSubs.map((sub) => {
            const blocks = [];
            for (const step of sub.steps) {
              const se = getStepEntry(run, step.id);
              for (const spec of step.outputs || []) {
                const outVal = (se.outputs || {})[spec.id];
                if (!hasValue(spec, outVal)) continue;
                blocks.push(
                  <OutputView
                    key={step.id + ":" + spec.id}
                    spec={spec}
                    value={outVal}
                    onChange={() => {}}
                    renderers={renderers}
                    context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: true, expanded: true }}
                  />
                );
              }
            }
            if (blocks.length === 0) return null;
            return (
              <section key={sub.id} className="pf-read-sub">
                <h3 className="pf-read-sub-name">{sub.name}</h3>
                {sub.description && <p className="pf-read-sub-desc">{sub.description}</p>}
                {blocks}
              </section>
            );
          })}
        </article>

        <div className="pf-read-nav">
          <button className="pf-read-navbtn" disabled={prevMi === null} onClick={() => prevMi !== null && onJump(firstFlatOf(prevMi))}>
            ← {prevMi !== null ? def.mainStages[prevMi].name : "Back"}
          </button>
          <button className="pf-read-edit" onClick={onEdit}>
            Edit run
          </button>
          <button className="pf-read-navbtn" disabled={nextMi === null} onClick={() => nextMi !== null && onJump(firstFlatOf(nextMi))}>
            {nextMi !== null ? def.mainStages[nextMi].name : "Forward"} →
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Syntax-check the new file**

Run: `npx esbuild packages/react/src/ReadingView.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: exits 0, no output (a clean bundle to /dev/null).

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/OutputView.jsx packages/react/src/ReadingView.jsx
git commit -m "feat(react): ReadingView plus OutputView inline expanded passthrough (#78)"
```

---

### Task 2: Render reading as a third view, reachable via a Read toggle

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (import line ~2-39; derived state ~206-216; header buttons ~535-552; view switch ~588-600)

**Interfaces:**
- Consumes: `ReadingView` (Task 1); `isRunComplete` from `@sqnce/core`.
- Produces: a `view === "reading"` branch rendering `ReadingView`; a `complete` boolean; a rolodex header "Read" button (shown when `complete`).

- [ ] **Step 1: Import `isRunComplete` and `ReadingView`**

In the `@sqnce/core` import block, add `isRunComplete,` after `mainGateProgress,` on its own line:

```jsx
  mainGateProgress,
  isRunComplete,
  browse as coreBrowse,
```

and add `runDisplayName,` after `activeRunEntry,` (the run-store helpers, ~38):

```jsx
  runsForWorkflow,
  activeRunEntry,
  runDisplayName,
} from "@sqnce/core";
```

After `import OutputView from "./OutputView.jsx";` add:

```jsx
import ReadingView from "./ReadingView.jsx";
```

`runDisplayName(definition, store, runId)` returns the entry's name, else the subject value, else `Run N`, matching the sidebar and runs table (`RunSidebar.jsx:75`, `RunsScreen.jsx:66`).

- [ ] **Step 2: Derive `complete`**

Immediately after the `frontier` line (`const frontier = Math.min(run.frontier, def.mainStages.length - 1);`, ~216) add:

```jsx
  const complete = useMemo(() => isRunComplete(def, run, { validators }), [def, run, validators]);
```

- [ ] **Step 3: Add the reading branch to the view switch**

Replace the view-switch opening (the `view === "runs" ? ( <RunsScreen .../> ) : (` lines, ~588-600) so a `"reading"` branch sits between runs and the deck. Change the `) : (` after `</RunsScreen>` to:

```jsx
      ) : view === "reading" ? (
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
      ) : (
```

(The existing `<>` deck fragment and its closing `</>` at ~600 and ~916 stay as the final branch.)

- [ ] **Step 4: Add the rolodex "Read" button**

In the header-right block, after the `About` button's closing `)}` (~543) and before the Runs toggle button (~544), add:

```jsx
          {view === "rolodex" && complete && (
            <button
              className="pf-reset"
              onClick={() => { clearTransients(); setView("reading"); }}
              title="Read this finished run"
            >
              Read
            </button>
          )}
```

- [ ] **Step 5: Hide the inert header rail in reading mode**

The header `pf-rail` (the inert stage strip, ~502-520) renders above every view and maps all `def.mainStages` with no reachability filtering, so in reading mode it would sit above the new contents rail and would re-show skipped or unreached stages. The spec has the reading rail replace the strip, so render the header rail only outside reading mode. Wrap the existing `<div className="pf-rail"> ... </div>` block in a guard:

```jsx
        {view !== "reading" && (
          <div className="pf-rail">
            {def.mainStages.map((ms, mi) => {
              /* ...unchanged body... */
            })}
          </div>
        )}
```

(Keep the block's contents exactly as they are; only add the `{view !== "reading" && (` wrapper and its closing `)}`.)

- [ ] **Step 6: Syntax-check the changed file**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: exits 0, no output.

- [ ] **Step 7: Build the demo**

Run: `npm run build -w examples/demo`
Expected: Vite build completes with `✓ built in` and a nonzero bundle; exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): render reading mode as a third view with a Read toggle (#78)"
```

---

### Task 3: Route a complete run to reading on open and on switch

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (`switchWorkflow` ~329-336; `openRun` ~339-343; the Runs/Back-to-run header button ~544-552)

**Interfaces:**
- Consumes: `complete`/`isRunComplete`, `viewForRun`.
- Produces: a `viewForRun(entry)` helper; open and switch land on `"reading"` for a complete run, `"rolodex"` otherwise. New runs stay `"rolodex"`.

- [ ] **Step 1: Add the `viewForRun` helper**

Immediately before `const switchWorkflow = (id) => {` (~329) add:

```jsx
  /* Pick the landing view for a run entry: a finished run reads, an
     in-progress run authors. Uses the entry's own workflow definition so
     switching workflows routes correctly. */
  const viewForRun = (e) => {
    if (!e) return "rolodex";
    const d = workflows.find((w) => w.id === e.workflowId) || def;
    return isRunComplete(d, e.run, { validators }) ? "reading" : "rolodex";
  };
```

- [ ] **Step 2: Route `switchWorkflow`**

Replace the body of `switchWorkflow` (~329-336) with:

```jsx
  const switchWorkflow = (id) => {
    if (id === activeId) return;
    clearTransients();
    const target = activeRunEntry(store, id);
    setView(target ? viewForRun(target) : "rolodex");
    setStore((s) => {
      const existing = activeRunEntry(s, id);
      return existing ? coreSetActiveRun(s, existing.id) : addRun(s, newEntryFor(s, id));
    });
  };
```

- [ ] **Step 3: Route `openRun`**

Replace `openRun` (~339-343) with:

```jsx
  const openRun = (runId) => {
    clearTransients();
    setView(viewForRun(store.entries[runId]));
    setStore((s) => coreSetActiveRun(s, runId));
  };
```

- [ ] **Step 4: Route "Back to run"**

In the Runs toggle button (~544-552), change the click handler so returning from the runs screen honors completeness. Replace:

```jsx
              setView(view === "runs" ? "rolodex" : "runs");
```

with:

```jsx
              setView(view === "runs" ? viewForRun(entry) : "runs");
```

- [ ] **Step 5: Route the active run once after load**

Explicit opens and switches route through `viewForRun`, but the active run that is already live at startup does not: without persistence `loaded` starts true, and with persistence `persistence.load()` replaces the store after mount with `view` still `"rolodex"`. Add a one-shot effect so an already-complete active run lands in reading on first paint and on reload. Insert it immediately after the persistence save effect (the `useEffect` ending `}, [store, loaded, persistence]);`, ~292) and add a `routedOnLoad` ref next to the other refs (`const routedOnLoad = useRef(false);`, near `saveTimer`, ~200):

```jsx
  /* Route the startup active run once: a finished run that was active at
     load (cold mount without persistence, or after persistence.load
     swaps the store) opens in reading, matching open and switch. The ref
     keeps this a one-shot so a later Edit toggle is not snapped back. */
  useEffect(() => {
    if (!loaded || routedOnLoad.current) return;
    routedOnLoad.current = true;
    setView(viewForRun(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, entry]);
```

A brand-new seeded run is not complete, so `viewForRun` returns `"rolodex"`; this only changes the landing view when the active run is genuinely complete.

Then add a guard effect immediately after it, so reading mode never lingers over a run that stopped being readable. While in reading mode the global Reset run button and the sidebar delete stay active; either one can make the active run incomplete or remove it, and the branch would otherwise keep showing a hard-coded "Complete" over blank or fallback content:

```jsx
  /* Reading mode is only valid over a present, complete run. Reset run,
     a sidebar delete, or any path that drops completeness while reading
     routes back to the authoring deck rather than showing "Complete" over
     emptied content. */
  useEffect(() => {
    if (view === "reading" && (!entry || !complete)) setView("rolodex");
  }, [view, entry, complete]);
```

This does not fight the Edit toggle: Edit sets `view` to `"rolodex"`, and the one-shot above does not re-route a still-complete run, so the user stays in the deck.

- [ ] **Step 6: Syntax-check**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: exits 0, no output.

- [ ] **Step 7: Build the demo**

Run: `npm run build -w examples/demo`
Expected: exit 0, `✓ built`.

- [ ] **Step 8: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): open a complete run in reading mode by default (#78)"
```

---

### Task 4: Reading-mode styles (flat layout + responsive)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (the `CSS` template literal; base rules before the `@media (max-width: 720px)` block ~1325, and one rule inside that block)

**Interfaces:**
- Consumes: the class names emitted by `ReadingView` (`pf-read`, `pf-read-rail`, `pf-read-toc`, `pf-read-here`, `pf-read-doc`, `pf-read-band`, `pf-read-title`, `pf-read-status`, `pf-read-canvas`, `pf-read-stage`, `pf-read-sub`, `pf-read-sub-name`, `pf-read-sub-desc`, `pf-read-nav`, `pf-read-edit`).
- Produces: a flat (no transform) reading layout with a contents rail that collapses on narrow widths and a reading column with a bounded measure.

- [ ] **Step 1: Add the base reading-mode rules**

Insert these rules into the `CSS` string immediately before the line `@media (max-width: 720px) {` (~1325):

```css
/* ---------- reading mode ---------- */
/* A light document page on the dark app shell, like the cards, so the dark
   text below stays legible. The page scrolls; the contents rail sticks. */
.pf-read { display: flex; flex: 1; min-height: 0; gap: 24px; margin: 8px 4px; padding: 20px 24px; background: #F1EEE3; border: 1px solid #D8D3C2; border-radius: 10px; color: #23282F; overflow: auto; }
.pf-read-rail { flex: 0 0 200px; display: flex; flex-direction: column; gap: 2px; align-self: flex-start; position: sticky; top: 0; }
.pf-read-toc { text-align: left; background: none; border: none; border-left: 2px solid transparent; padding: 6px 10px; color: #5E6772; font-size: 13px; cursor: pointer; border-radius: 0 4px 4px 0; }
.pf-read-toc:hover { color: #23282F; background: #E7E2D4; }
.pf-read-here { color: #23282F; border-left-color: #D9A441; font-weight: 600; }
.pf-read-doc { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pf-read-band { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid #D8D3C2; padding-bottom: 10px; margin-bottom: 12px; }
.pf-read-title { font-size: 22px; margin: 0; color: #23282F; }
.pf-read-status { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #2E8F62; }
.pf-read-canvas { max-width: 760px; }
.pf-read-stage { font-size: 18px; color: #23282F; margin: 4px 0 12px; }
.pf-read-sub { margin-bottom: 22px; }
.pf-read-sub-name { font-size: 15px; color: #3A434E; margin: 0 0 4px; }
.pf-read-sub-desc { color: #6B6F76; margin: 0 0 10px; }
.pf-read-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid #D8D3C2; margin-top: 8px; }
.pf-read-navbtn, .pf-read-edit { background: none; border: 1px solid #C9C3B0; border-radius: 6px; padding: 6px 12px; color: #3A434E; cursor: pointer; }
.pf-read-navbtn:hover:not(:disabled), .pf-read-edit:hover { background: #E7E2D4; }
.pf-read-navbtn:disabled { opacity: 0.4; cursor: default; }
/* Uncap renderer-backed outputs in reading mode: the document shows them
   in full rather than the authoring deck's 280px capped panel. The
   expand-to-overlay button stays, so a large output can still go
   fullscreen and the no-trapped-overlay acceptance check is reachable. */
.pf-read .pf-render { max-height: none; }
```

- [ ] **Step 2: Add the narrow-width rule**

Inside the existing `@media (max-width: 720px) {` block (~1325-1332), before its closing `}`, add:

```css
  .pf-read { flex-direction: column; }
  .pf-read-rail { flex-basis: auto; position: static; max-height: none; flex-direction: row; flex-wrap: wrap; }
```

- [ ] **Step 3: Syntax-check**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: exits 0, no output.

- [ ] **Step 4: Build the demo**

Run: `npm run build -w examples/demo`
Expected: exit 0, `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): reading-mode styles, flat layout and responsive rail (#78)"
```

---

### Task 5: Full gates and manual acceptance

**Files:** none (verification only).

- [ ] **Step 1: Run the engine tests**

Run: `npm test`
Expected: all `node:test` suites pass; final line shows `pass` counts and `0` fail (core is untouched, so this must stay green).

- [ ] **Step 2: Build the demo**

Run: `npm run build -w examples/demo`
Expected: exit 0, `✓ built`.

- [ ] **Step 3: Regenerate and check types**

Run: `npm run types`
Expected: exit 0. Then `git status --short packages/react/types` shows no change (ReadingView is internal and `ProcessRolodex` props are unchanged, so the public `.d.ts` does not move). If anything changed, commit it with `chore(types): regenerate after #78`.

- [ ] **Step 4: Manual acceptance in the demo**

Run the demo (`npm run dev -w examples/demo`) and confirm each acceptance criterion:
- Complete a run end to end (mark each stage's required steps done and advance through the last stage). On the next open of that run from the Runs screen it lands in reading mode; an in-progress run still opens in the authoring rolodex.
- Reading mode shows the contents rail with a "you are here" marker on the selected stage, the run-header band with the run name and a "Complete" status word, and the selected stage's outputs expanded.
- Clicking a rail entry and the prev/next buttons move the selected stage; for a linear run the rail lists every stage, in order.
- "Edit run" switches to the authoring card-deck for the same run, and the rolodex "Read" button returns to reading, with no change to run state (reopen the run and confirm outputs and gates are unchanged).
- Open an output's expand overlay in reading mode and confirm it is not clipped or trapped (the flat layout has no transformed ancestor).

- [ ] **Step 5: Commit any type regeneration only (if Step 3 produced a diff)**

```bash
git add packages/react/types
git commit -m "chore(types): regenerate after #78"
```

---

## Self-review

**Spec coverage:**
- "Add reading as a third view": Task 2 (view switch + branch).
- "Default a complete run to reading; in-progress to rolodex; open and switch route": Task 3 (`viewForRun`, `openRun`, `switchWorkflow`, Back-to-run, and the one-shot startup routing so a persisted or cold-mounted complete active run also lands in reading). Completeness via `isRunComplete`: Task 2 Step 1-2. Header title via `runDisplayName` so unnamed finished runs stay distinct: Task 2 Step 1 + Step 3.
- "Persistent clickable contents rail with you-are-here, defined by the reachable set": Task 1 (`readable` via `jumpTo`, `pf-read-here`).
- "Forked run: rail lists kept track stages, not just spine; skipped tracks omitted": Task 1 (`jumpTo` reachability oracle excludes skipped tracks; `def.mainStages` order gives spine then kept tracks).
- "Run-header band with name and neutral Complete status": Task 1 (`pf-read-band`).
- "Reading canvas, outputs expanded, reuse OutputView, editing suppressed": Task 1 (the `OutputView:169` change so an explicit `expanded: true` reaches the inline renderer, and `ReadingView` calling `OutputView` with `context.readOnly: true`, `expanded: true`, a no-op `onChange` so custom renderers never throw, filled outputs only) plus Task 4 CSS that uncaps `.pf-render` inside `.pf-read`, so renderer-backed outputs (for example `FlowDiagram`) show their full layout, not the deck's 280px capped panel. The expand-to-overlay button stays reachable for the overlay acceptance check.
- "Reading rail replaces the inert header strip": Task 2 Step 5 hides the header `pf-rail` when `view === "reading"`, so only the reachability-filtered contents rail shows.
- "Reading mode stays valid": Task 3 guard effect routes back to the deck when the active run is reset, deleted, or otherwise no longer complete while reading.
- "Prev/next defined over a fork (spine then kept tracks, skipped omitted)": Task 1 (`readable` order + prev/next).
- "Edit toggle both directions, no run-state mutation": Task 1 (`onEdit`) + Task 2 Step 4 (Read button); switching only calls `setView`, never `setRun`.
- "Flat layout so no fixed overlay is trapped; responsive rail and bounded measure": Task 4, which also gives reading mode a light document surface on the dark shell (so the dark text is legible) with its own light-styled `pf-read-navbtn` buttons rather than the deck's dark-on-dark nav buttons.
- "Gates pass": Task 5.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every command has an expected result.

**Type consistency:** `ReadingView` prop names (`def, run, subs, runName, renderers, subjectName, onJump, onEdit`) match the call site in Task 2 Step 3. `viewForRun` is defined in Task 3 Step 1 before its uses in Steps 2-4. `complete` is defined in Task 2 Step 2 before its use in Task 2 Step 4. Reachability uses `jumpTo(...).idx === f` consistently.

## Execution handoff

Per the repo dev-workflow this plan is committed on the branch, reviewed (Codex plan-review loop then adversarial plan review), executed with `superpowers:subagent-driven-development` or `executing-plans`, then removed in a single commit before the code review so it never reaches main.
