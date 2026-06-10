# active card expansion implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The active rolodex card widens to `min(800px, 92vw)` while side cards contract to `min(400px, 44vw)`, with width animating in the existing browse transition.

**Architecture:** Pure CSS-and-transform change in `packages/react/src/ProcessRolodex.jsx`, mirrored into the artifact. Width moves from the shared `.pf-card` rule to the center and side classes, the translateX step changes from own-width percent to fixed pixels, and rotation eases. No core changes, no new dependencies.

**Tech Stack:** React inline styles plus the component's embedded CSS string, Vite demo for visual verification, esbuild syntax check for the artifact.

Spec: `docs/specs/29-active-card-expansion.md`. This plan is deleted in the final pre-merge commit per the dev workflow.

Tuning latitude (from the spec): offset step 380 to 480px, rotation -20 to -28deg. Widths, scale 0.82, and opacity 0.38 are fixed.

---

### Task 1: react package, widths, transition, transform

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (transform at line ~318, CSS at lines ~530-540)

- [ ] **Step 1: move width to the position classes and add the width transition**

In the embedded CSS, change:

```css
.pf-card {
  position: absolute; left: 50%; top: 12px;
  width: min(560px, 88vw); max-height: calc(100% - 24px);
```

to:

```css
.pf-card {
  position: absolute; left: 50%; top: 12px;
  max-height: calc(100% - 24px);
```

and change:

```css
  transition: transform 0.45s cubic-bezier(.3,.9,.3,1), opacity 0.45s;
```

to:

```css
  transition: transform 0.45s cubic-bezier(.3,.9,.3,1), width 0.45s cubic-bezier(.3,.9,.3,1), opacity 0.45s;
```

then add, directly after the `@media (prefers-reduced-motion: reduce)` line:

```css
.pf-card-center { width: min(800px, 92vw); }
.pf-card-side { width: min(400px, 44vw); }
```

- [ ] **Step 2: pixel-step transform**

Change the inline card transform:

```js
transform: `translateX(calc(-50% + ${pos * 56}%)) rotateY(${pos * -28}deg) scale(${center ? 1 : 0.82})`,
```

to:

```js
transform: `translateX(calc(-50% + ${pos * 420}px)) rotateY(${pos * -24}deg) scale(${center ? 1 : 0.82})`,
```

- [ ] **Step 3: run the test suite**

Run: `npm test`
Expected: 15 tests pass (no engine surface touched; this is a regression guard).

- [ ] **Step 4: commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: expand the active card, contract side cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: visual verification in the running demo, tune if needed

**Files:**
- Possibly modify: `packages/react/src/ProcessRolodex.jsx` (offset and rotation only, within spec ranges)

- [ ] **Step 1: start the demo dev server**

Run (background): `npm run dev -w examples/demo`
Expected: Vite serves on a localhost port (printed in output).

- [ ] **Step 2: screenshot the acceptance states**

Using the browse tool against the dev URL with the presales workflow visible, capture:

1. 1280x800 viewport: full deck.
2. 1440x900 viewport: full deck.
3. 1920x1080 viewport: full deck.
4. 600x900 viewport: center card only (side cards hidden by the 720px breakpoint).
5. At 1440: browse one card left and right to observe the width animation (before/after screenshots).
6. At 1440: the Demonstration card with rendered views (cards, flow) on the wide card; the RFP Review card showing the requirements table.

Checks per the spec acceptance:
- No horizontal scrollbar or clipped side card at the three desktop widths.
- Side card strip and title visibly peek on both sides of the center card.
- Center card visibly much wider than side cards.
- Rendered views and keyboard navigation (arrow keys) work on the wide card.

- [ ] **Step 3: tune within ranges if a check fails**

If side cards clip at 1280, reduce the offset step toward 380px; if the peek is too thin at 1920, raise toward 480px; if side cards look sliver-thin, ease rotation toward -20deg. Stay within the spec ranges (offset 380 to 480px, rotation -20 to -28deg). Re-screenshot after any change. If no value in range satisfies a check, stop and renegotiate the spec rather than exceeding the ranges.

- [ ] **Step 4: stop the dev server, commit any tuning**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: tune card peek offset and rotation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Skip the commit if no tuning was needed.

### Task 3: artifact mirror

**Files:**
- Modify: `examples/claude-artifact/process-rolodex.jsx` (transform at line ~1418, CSS at lines ~1619-1627)

- [ ] **Step 1: apply the same three changes**

Remove `width: min(560px, 88vw);` from the artifact's `.pf-card` rule (line ~1619, keep `max-height`), change its transition line (~1623) to:

```css
  transition: transform 0.45s cubic-bezier(.3,.9,.3,1), width 0.45s cubic-bezier(.3,.9,.3,1), opacity 0.45s;
```

add after its `@media (prefers-reduced-motion: reduce)` line (~1627):

```css
.pf-card-center { width: min(800px, 92vw); }
.pf-card-side { width: min(400px, 44vw); }
```

and change its transform (line ~1418) to the same pixel step as Task 1 Step 2, including any Task 2 tuning:

```js
transform: `translateX(calc(-50% + ${pos * 420}px)) rotateY(${pos * -24}deg) scale(${center ? 1 : 0.82})`,
```

- [ ] **Step 2: syntax check**

Run: `npx esbuild examples/claude-artifact/process-rolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`
Expected: exit 0.

- [ ] **Step 3: commit**

```bash
git add examples/claude-artifact/process-rolodex.jsx
git commit -m "artifact: mirror active card expansion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: full verification and push

- [ ] **Step 1: run everything**

Run: `npm test && npm run build -w examples/demo && npx esbuild examples/claude-artifact/process-rolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`
Expected: 15 tests pass, both builds succeed.

- [ ] **Step 2: confirm the values match between component and artifact**

Run: `grep -n "pos \* 4" packages/react/src/ProcessRolodex.jsx examples/claude-artifact/process-rolodex.jsx && grep -n "min(800px" packages/react/src/ProcessRolodex.jsx examples/claude-artifact/process-rolodex.jsx`
Expected: the same offset, rotation, and width values in both files.

- [ ] **Step 3: push**

```bash
git push
```

Codex auto-reviews the push on PR #32; address findings until the +1 reaction lands for the implementation phase.
