# rolodex interaction polish implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the five P2 interaction-polish issues (#18 gate footer, #17 stage rail, #16 one-click done, #19 generate affordance, #25 clickable side cards), per docs/specs/16-rolodex-polish.md.

**Architecture:** All changes live in `packages/react/src/ProcessRolodex.jsx` (markup plus its inline CSS string). Five independent edits, one commit each, in the spec's suggested order: footer first (biggest structural move), then rail, step rows, generate affordance, side cards. Requires batches 1 to 3 merged; the step toggle and Regenerate logic build on batch 2's `reopenStep`/`status` wiring.

**Tech Stack:** React, inline CSS string, text glyphs (✓, 🔒) and one CSS spinner; no new dependencies.

---

### Task 1: gate status and advance into the card footer (#18)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Add the footer to the center card**

In the deck's `subs.map`, directly after the `pf-steps` div closes and before the `{locked && ...}` lock overlay, insert (`p` is the card's `gateProgress` result already computed in the map; `atFrontier`, `nextSub`, `readOnly`, `doAdvance` are existing outer bindings):

```jsx
{center && (
  <div className="pf-card-foot">
    {p.met ? (
      <span className="pf-gate-state pf-gate-met">
        ✓ Gate met{atFrontier && nextSub ? ", ready to advance" : ""}
      </span>
    ) : (
      <span className="pf-gate-state">
        🔒 {p.total - p.done} required {p.total - p.done === 1 ? "step" : "steps"} left · Gate
        unmet: {p.missing.join(", ")}
      </span>
    )}
    {atFrontier && nextSub &&
      (p.met ? (
        <button className="pf-advance" disabled={readOnly} onClick={() => doAdvance(false)}>
          Advance to {nextSub.name} →
        </button>
      ) : (
        <button className="pf-override" disabled={readOnly} onClick={() => doAdvance(true)}>
          Advance anyway
        </button>
      ))}
  </div>
)}
```

- [ ] **Step 2: Remove the advance zone from the nav**

In `pf-nav-mid`, delete the entire `{atFrontier && nextSub && (<div className="pf-advance-zone">...)}` block. Keep the `{!atFrontier && (<div className="pf-gate-hint">Browsing history · frontier is ...}` hint and the `pf-legend` paragraph exactly where they are.

- [ ] **Step 3: CSS**

Append to the CSS string and delete the now-unused `.pf-advance-zone` rule:

```css
.pf-card-foot {
  margin: 12px 14px 0; padding: 10px 2px 0;
  border-top: 1px solid #DCD7C7;
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
}
.pf-gate-state { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.04em; color: #8A8E96; }
.pf-gate-met { color: #2E8F62; }
```

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build -w examples/demo` and the esbuild syntax check
(`npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`).
In the demo: gate status sits on the card; Advance appears only on the frontier card; an unmet gate still names missing steps and offers "Advance anyway"; browsing shows the card's gate state with no buttons.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: gate status and advance move into the card footer (#18)"
```

### Task 2: progress-filling stage rail (#17)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Replace the rail markup**

Replace the body of `def.mainStages.map((ms, mi) => ...)` in the header rail with:

```jsx
{def.mainStages.map((ms, mi) => {
  const firstIdx = subs.findIndex((s) => s.mainIndex === mi);
  const allDone = ms.subStages.every((ss) => gateProgress(ss, run).met);
  const stageLocked = firstIdx > frontier;
  const frontierMain = subs[frontier].mainIndex;
  const state = mi === current.mainIndex ? "active" : allDone ? "done" : "ahead";
  const glyph = allDone ? "✓" : stageLocked ? "🔒" : String(mi + 1);
  return (
    <React.Fragment key={ms.id}>
      {mi > 0 && <span className={`pf-rail-line ${mi <= frontierMain ? "pf-rail-line-fill" : ""}`} />}
      <span className={`pf-rail-stage pf-rail-${state}`}>
        <span className="pf-rail-circle">{glyph}</span>
        {ms.name}
      </span>
    </React.Fragment>
  );
})}
```

(Complete stays gate-based, the existing `allDone`. Locked keys off the frontier, never the browsing position. The connector before stage `mi` fills when `mi <= frontierMain`.)

- [ ] **Step 2: CSS**

Delete the `.pf-rail-dot` rule and the `.pf-rail-* .pf-rail-dot` color rules; add:

```css
.pf-rail-circle {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; border: 1px solid currentColor;
}
.pf-rail-active .pf-rail-circle { background: #D9A441; border-color: #D9A441; color: #23282F; }
.pf-rail-done .pf-rail-circle { background: #2E8F62; border-color: #2E8F62; color: #EDEAE0; }
.pf-rail-line-fill { background: #D9A441; }
```

- [ ] **Step 3: Verify and commit**

Same checks as Task 1. In the demo: circles number the stages; completed stages show checks, stages beyond the frontier show locks; connectors fill to the frontier's stage; browsing back moves only the gold active marker.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: numbered stage rail with check, lock, and frontier fill (#17)"
```

### Task 3: one-click done toggle on step rows (#16)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Restructure the step row**

The row is currently one `<button className="pf-step-row">` wrapping dot, name, state, and chevron; a button cannot nest inside a button, so the row becomes a div with two buttons. Replace it with (the dot is now the toggle, the spec's chosen placement):

```jsx
<div className="pf-step-row">
  <button
    className={`pf-dot-btn pf-dot-${status}`}
    disabled={!center || readOnly}
    title={status === "done" ? "Reopen" : "Mark done"}
    aria-label={status === "done" ? `Reopen ${step.name}` : `Mark ${step.name} done`}
    onClick={() => (status === "done" ? reopen(step.id) : toggleDone(step.id, true))}
  >
    {status === "done" ? "✓" : ""}
  </button>
  <button className="pf-step-expand" disabled={!center} onClick={() => setExpanded(open ? null : step.id)}>
    <span className="pf-step-name">
      {step.name}
      {step.required && <span className="pf-req">*</span>}
    </span>
    <span className="pf-step-state">
      {status === "done" ? "Done" : status === "draft" ? "Draft" : ""}
    </span>
    {center && <span className="pf-chev">{open ? "−" : "+"}</span>}
  </button>
</div>
```

(`status === "done"` is gate-aware completion via `statusOf`; reopen on a content-bearing hybrid step goes through batch 2's `reopenStep`. The in-body Mark done/Reopen button stays untouched.)

- [ ] **Step 2: CSS**

Replace the `.pf-step-row` and `.pf-dot*` rules with:

```css
.pf-step-row { display: flex; align-items: center; gap: 10px; padding-right: 14px; }
.pf-dot-btn {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; margin-left: 14px;
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
  background: #FFFFFF; border: 1.5px solid #B6BAC1; cursor: pointer;
  font-size: 11px; line-height: 1; color: transparent;
}
.pf-dot-btn:hover:not(:disabled) { border-color: #2E8F62; color: #2E8F62; }
.pf-dot-btn:disabled { cursor: default; }
.pf-dot-draft { border-color: #D9A441; background: #F4DFAE; }
.pf-dot-done { border-color: #2E8F62; background: #2E8F62; color: #FFFFFF; }
.pf-step-expand {
  flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0;
  background: none; border: none; padding: 11px 0; cursor: pointer;
  font-family: inherit; font-size: 14.5px; color: #23282F; text-align: left;
}
.pf-step-expand:disabled { cursor: default; }
```

- [ ] **Step 3: Verify and commit**

Same checks. In the demo: a checklist step completes and reopens from the row circle without expanding; the rest of the row still expands; tab reaches the circle then the row; side-card rows stay inert.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: one-click done toggle on step rows (#16)"
```

### Task 4: Generate/Regenerate affordance (#19)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Manual-edit transient state**

Add `hasValue` to the `@sqnce/core` import list if absent. Next to the other transient state hooks add:

```js
const [manualEdit, setManualEdit] = useState([]);
```

and add `setManualEdit([]);` inside `clearTransients`.

- [ ] **Step 2: Dashed invite replaces the empty target text output**

In the step body's outputs map, render the invite for the generate target (the first text output, same selection rule as `generate()`) while it is empty and not in manual mode:

```jsx
{(step.outputs || []).map((spec) => {
  const target = (step.outputs || []).find((o) => o.type === "text");
  const isGenTarget = !!generateDraft && spec === target;
  if (isGenTarget && !hasValue(spec, (entry.outputs || {})[spec.id]) && !manualEdit.includes(step.id)) {
    return (
      <div key={spec.id} className="pf-out">
        <div className="pf-out-head">
          <div className="pf-out-label">{spec.label}</div>
        </div>
        <div className="pf-gen-invite">
          {generating === step.id ? (
            <span className="pf-spinner" aria-label="Generating" />
          ) : (
            <>
              <button className="pf-btn pf-btn-primary" disabled={readOnly} onClick={() => generate(sub, step)}>
                Generate draft
              </button>
              <button className="pf-gen-manual" disabled={readOnly} onClick={() => setManualEdit([...manualEdit, step.id])}>
                or write it yourself
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <OutputView ... /* existing call, unchanged */ />
  );
})}
```

(With `generateDraft` omitted, `isGenTarget` is always false and every output renders through `OutputView` exactly as today.)

- [ ] **Step 3: Regenerate label and spinner on the actions button**

Replace the generate button in `pf-actions` with:

```jsx
{generateDraft && (step.outputs || []).some((o) => o.type === "text") && (
  <button
    className="pf-btn"
    disabled={generating === step.id || readOnly}
    onClick={() => generate(sub, step)}
  >
    {generating === step.id ? (
      <>
        <span className="pf-spinner pf-spinner-sm" aria-hidden="true" /> Generating…
      </>
    ) : hasValue(
        (step.outputs || []).find((o) => o.type === "text"),
        (entry.outputs || {})[(step.outputs || []).find((o) => o.type === "text").id]
      ) ? (
      "Regenerate"
    ) : (
      "Generate draft"
    )}
  </button>
)}
```

- [ ] **Step 4: CSS**

```css
.pf-gen-invite {
  border: 1.5px dashed #C9C3B0; border-radius: 8px; padding: 18px;
  display: flex; align-items: center; justify-content: center; gap: 12px;
  background: #FCFBF5; min-height: 46px;
}
.pf-gen-manual {
  background: none; border: none; color: #7A6A3C; cursor: pointer;
  font-size: 12px; text-decoration: underline; font-family: 'IBM Plex Mono', monospace;
}
.pf-spinner {
  width: 14px; height: 14px; border-radius: 50%; display: inline-block;
  border: 2px solid #D9A441; border-top-color: transparent;
  animation: pf-spin 0.8s linear infinite; vertical-align: -2px;
}
.pf-spinner-sm { width: 11px; height: 11px; }
@keyframes pf-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pf-spinner { animation: none; border-top-color: #D9A441; opacity: 0.5; } }
```

- [ ] **Step 5: Verify and commit**

Same checks, plus in the demo: empty text step shows the dashed invite; "or write it yourself" reveals the plain textarea; generating shows the spinner in both the invite and the actions button; a filled output offers "Regenerate"; with `generateDraft` omitted (demo without the prop or a definition step check) the invite never appears. Generated results keep batch 2's tint.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: generate invite, spinner, and Regenerate label (#19)"
```

### Task 5: clickable side cards (#25)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Make visible, committed side cards click targets**

In the deck's `subs.map`, before the card `return`, add:

```js
const sideClickable = !center && Math.abs(pos) === 1 && i <= frontier;
```

and change the card div to:

```jsx
<div
  key={sub.id}
  className={`pf-card ${center ? "pf-card-center" : "pf-card-side"} ${locked ? "pf-card-locked" : ""} ${sideClickable ? "pf-card-clickable" : ""}`}
  style={{
    transform: `translateX(calc(-50% + ${pos * 420}px)) rotateY(${pos * -24}deg) scale(${center ? 1 : 0.82})`,
    opacity: Math.abs(pos) === 2 ? 0 : center ? 1 : 0.38,
    zIndex: 10 - Math.abs(pos),
    pointerEvents: center || sideClickable ? "auto" : "none",
  }}
  role={sideClickable ? "button" : undefined}
  tabIndex={sideClickable ? 0 : undefined}
  aria-label={sideClickable ? `Go to ${sub.name}` : undefined}
  onClick={sideClickable ? () => setNav(jumpTo(run, subs, i)) : undefined}
  onKeyDown={
    sideClickable
      ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setNav(jumpTo(run, subs, i));
          }
        }
      : undefined
  }
>
```

(`setNav(jumpTo(run, subs, i))` is the pips' existing navigation call: browsing only, the frontier never moves. Locked cards and the `|pos| == 2` invisible cards keep `pointerEvents: "none"`. `pf-steps-side` already has `pointer-events: none`, so step rows on side cards stay one inert region inside the single card target.)

- [ ] **Step 2: CSS**

```css
.pf-card-clickable { cursor: pointer; }
.pf-card-clickable:hover { filter: brightness(1.12); outline: 1px solid #D9A441; }
.pf-card-clickable:focus-visible { outline: 2px solid #D9A441; }
```

(Hover uses `filter`, not opacity, because each card's opacity is set inline.)

- [ ] **Step 3: Verify and commit**

Same checks, plus in the demo: clicking the back or forward side card centers it with the browse animation; a locked next card ignores clicks; clicking anywhere on a side card (including over its step list) navigates; Enter/Space work on a focused side card.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: side cards within the frontier are click targets (#25)"
```

### Task 6: batch verification and push

- [ ] **Step 1: Full checks**

Run: `npm test && npm run build -w examples/demo` plus the esbuild syntax check.
Expected: green.

- [ ] **Step 2: Demo walkthrough with screenshots**

In the running demo, capture desktop (1440) and one mobile (390) width: rail states mid-run, card footer met and unmet, row toggle before and after, generate invite and spinner, side-card hover. Confirm keyboard navigation, gating, override, drafts, and rendered output views still work; under 720px side cards stay hidden.

- [ ] **Step 3: Push**

```bash
git push
```
