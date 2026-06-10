# orientation cues and shared icons implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Header position counter (#21), Back/Next side-card eyebrows (#22), and a shared output-type icon set used by the carried-forward chips (#23) and the output editor labels (#24), per docs/specs/21-orientation-icons.md.

**Architecture:** One new module `packages/react/src/icons.jsx` exports the five-type icon map; `ProcessRolodex.jsx` gains the counter, the eyebrows, and the input chips; `OutputView.jsx` gains the label icons. Requires batches 1 to 5 merged.

**Tech Stack:** React, inline SVGs with `currentColor`; no new dependencies.

---

### Task 1: shared icon module

**Files:**
- Create: `packages/react/src/icons.jsx`

- [ ] **Step 1: Create the module**

```jsx
import React from "react";

/*
 * Shared output-type icons, per docs/specs/21-orientation-icons.md.
 * Inline SVGs on currentColor, sized to ride alongside 11 to 12px mono
 * labels. Covers all five output types, including data.
 */
const base = {
  width: 12,
  height: 12,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const OUTPUT_TYPE_ICONS = {
  text: (
    <svg {...base}>
      <path d="M3 4h10M3 8h10M3 12h6" />
    </svg>
  ),
  fields: (
    <svg {...base}>
      <rect x="2.5" y="3" width="11" height="4" rx="1" />
      <rect x="2.5" y="9" width="11" height="4" rx="1" />
    </svg>
  ),
  file: (
    <svg {...base}>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </svg>
  ),
  link: (
    <svg {...base}>
      <path d="M6.5 9.5l3-3" />
      <path d="M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1" />
      <path d="M8.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" />
    </svg>
  ),
  data: (
    <svg {...base}>
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
      <path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </svg>
  ),
};

/** Inline icon for an output type; renders nothing for unknown types (fail soft). */
export function OutputTypeIcon({ type }) {
  const icon = OUTPUT_TYPE_ICONS[type];
  if (!icon) return null;
  return <span className="pf-oticon">{icon}</span>;
}
```

- [ ] **Step 2: CSS**

Append to the CSS string in `ProcessRolodex.jsx`:

```css
.pf-oticon { display: inline-flex; vertical-align: -1px; }
```

- [ ] **Step 3: Verify and commit**

Run the esbuild syntax check on `packages/react/src/icons.jsx` (`--external:react`), then:

```bash
git add packages/react/src/icons.jsx packages/react/src/ProcessRolodex.jsx
git commit -m "react: shared output-type icon set (#23, #24)"
```

### Task 2: header position counter (#21)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Render the counter next to the rail**

In the header, directly after the `pf-rail` div closes and before `pf-header-right`, add:

```jsx
{view === "rolodex" && (
  <span className="pf-counter">
    {idx + 1} / {subs.length}
  </span>
)}
```

(1-based flattened sub-stage position over the total; tracks `idx`, so it follows browsing and advancing and matches the active pip. Hidden on the runs screen.)

- [ ] **Step 2: CSS**

```css
.pf-counter {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px;
  color: #8A919B; letter-spacing: 0.05em; white-space: nowrap;
}
```

- [ ] **Step 3: Verify and commit**

Checks as usual; in the demo the counter reads "1 / N" on a fresh run, updates on browse and advance.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: position counter in the header (#21)"
```

### Task 3: Back/Next eyebrows on side cards (#22)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Add the eyebrow**

Inside the card div, as its first child (before `pf-card-strip`):

```jsx
{!center && Math.abs(pos) === 1 && (
  <div className="pf-card-eyebrow">{pos < 0 ? "Back" : "Next"}</div>
)}
```

- [ ] **Step 2: CSS**

```css
.pf-card-eyebrow {
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: #8A8E96; padding: 6px 16px 3px;
}
```

- [ ] **Step 3: Verify and commit**

In the demo: the previous card reads "Back", the following card "Next"; locked next cards keep the eyebrow; mini step lists and the strip are unchanged; the center card has no eyebrow.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: Back/Next eyebrow labels on side cards (#22)"
```

### Task 4: output-type chips in the carried-forward inputs (#23)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Import and helper**

Add `import { OutputTypeIcon } from "./icons.jsx";` next to the other local imports. Near the `prevDoneBlocks` computation add:

```js
const typesWithValue = (step) => {
  const entry = getStepEntry(run, step.id);
  const types = [];
  (step.outputs || []).forEach((spec) => {
    if (hasValue(spec, (entry.outputs || {})[spec.id]) && !types.includes(spec.type)) types.push(spec.type);
  });
  return types;
};
```

- [ ] **Step 2: Chips on each input item, previews kept**

Change the input item's name line to:

```jsx
<div className="pf-input-name">
  {step.name}
  <span className="pf-input-chips">
    {typesWithValue(step).map((t) => (
      <span key={t} className="pf-chip">
        <OutputTypeIcon type={t} />
        {t}
      </span>
    ))}
  </span>
</div>
```

The `pf-input-preview` div below it stays exactly as is (the 220-character previews are the hybrid the issue asks for).

- [ ] **Step 3: CSS**

```css
.pf-input-chips { display: inline-flex; gap: 4px; margin-left: 8px; vertical-align: 1px; }
.pf-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: 'IBM Plex Mono', monospace; font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase; color: #7A6A3C; background: #F1E8CE;
  border-radius: 4px; padding: 1px 5px;
}
```

- [ ] **Step 4: Verify and commit**

In the demo (presales seeded run): a carried-forward step with a fields output shows a fields chip; one with a file and a link shows both; previews unchanged.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: output-type chips in the carried-forward inputs (#23)"
```

### Task 5: icons next to output editor labels (#24)

**Files:**
- Modify: `packages/react/src/OutputView.jsx`

- [ ] **Step 1: Import and render**

Add `import { OutputTypeIcon } from "./icons.jsx";` and change the label div to:

```jsx
<div className="pf-out-label">
  <OutputTypeIcon type={spec.type} />
  {spec.label}
</div>
```

- [ ] **Step 2: CSS**

Change the existing `.pf-out-label` rule in `ProcessRolodex.jsx` to add flex alignment (keep all current declarations):

```css
.pf-out-label { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #7A6A3C; margin-bottom: 4px; display: flex; align-items: center; gap: 5px; }
```

- [ ] **Step 3: Verify and commit**

In the demo: every output editor label carries its type icon at subordinate visual weight; expanding steps with all five types shows five distinct icons.

```bash
git add packages/react/src/OutputView.jsx packages/react/src/ProcessRolodex.jsx
git commit -m "react: output-type icons next to editor labels (#24)"
```

### Task 6: batch verification and push

- [ ] **Step 1: Full checks**

Run: `npm test && npm run build -w examples/demo` plus the esbuild syntax check on `ProcessRolodex.jsx`.
Expected: green.

- [ ] **Step 2: Demo walkthrough with screenshots**

Counter position and updates, eyebrows on both side cards, chips in the inputs section, label icons in an expanded step. Under 720px the side cards (and eyebrows) stay hidden.

- [ ] **Step 3: Push**

```bash
git push
```
