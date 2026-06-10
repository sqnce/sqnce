# output view fixes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hinted file outputs with no extracted text fall back to the attachment display (#33), and KeyValue maps keys to display labels from `spec.fields` and `options.labels` (#31), per docs/specs/33-output-view-fixes.md. The approved follow-up reverts #28's display-ready key rename in presales and seeds.

**Architecture:** One guard in `packages/react/src/OutputView.jsx` routes empty-content file outputs to the default editor; `packages/react/src/renderers/KeyValue.jsx` gains a per-key label lookup; `docs/render-kinds.md` documents the contract; `definitions/presales.json` and `examples/demo/src/seeds.js` go back to code-style keys. Requires batches 1 to 4 merged.

**Tech Stack:** React, plain JSON definitions; no new dependencies, no `@sqnce/core` change.

---

### Task 1: binary attachment fallback (#33)

**Files:**
- Modify: `packages/react/src/OutputView.jsx`

- [ ] **Step 1: Add the no-text guard**

After the existing `const viewValue = ...` line, add:

```js
/* A file value with no extracted text has nothing for a renderer to
   show; fall back to the attachment display instead of a blank panel. */
const fileNoText = spec.type === "file" && !(value && value.content && value.content.trim());
```

- [ ] **Step 2: Route view mode to the default display**

Change the `body` ternary's first condition from `Renderer && shownMode === "view"` to:

```js
Renderer && shownMode === "view" && !fileNoText
```

A hinted file output with no extracted text now falls through to the `DefaultEditor` branch (attachment chip plus Replace/Attach button). Everything else is untouched: file values with extracted text keep the rendered view, data/text/link/fields behave as today.

- [ ] **Step 3: Suppress the redundant toggle**

Change the `toggle` assignment's guard from `readOnly ? null : ...` to:

```js
readOnly || fileNoText ? null : ...
```

(The default file display already carries the Replace file button; a second toggle would duplicate it. The expand overlay only renders with the renderer, so it disappears in this state without further changes.)

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build -w examples/demo`
In the demo (presales, RFP Upload step, markdown-hinted file output): attach a PDF, collapse and reopen the step: the file chip and Replace file button show, no blank panel. Attach a `.md` file: rendered markdown with the Replace file toggle, as before. Archived run: chip shows, replace disabled.

```bash
git add packages/react/src/OutputView.jsx
git commit -m "react: hinted file outputs with no extracted text fall back to the attachment display (#33)"
```

### Task 2: KeyValue label mapping (#31)

**Files:**
- Modify: `packages/react/src/renderers/KeyValue.jsx`

- [ ] **Step 1: Replace the file with**

```jsx
import React from "react";
import JsonTree from "./JsonTree.jsx";

/**
 * Flat-object renderer: one row per key. Non-objects fall back to the
 * tree. Row labels resolve per key: render.options.labels wins, then a
 * fields spec's declared { key, label } pairs, then the raw key. Labels
 * are a lookup, never a filter or reorder; unmapped keys show as-is.
 */
export default function KeyValue({ spec, value }) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return <JsonTree value={value} />;
  }
  const optionLabels = (spec && spec.render && spec.render.options && spec.render.options.labels) || {};
  const fieldLabels = {};
  ((spec && spec.fields) || []).forEach((f) => {
    if (f && f.key && f.label) fieldLabels[f.key] = f.label;
  });
  const labelFor = (k) => optionLabels[k] || fieldLabels[k] || k;
  return (
    <div className="pf-kv">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="pf-kv-row">
          <div className="pf-kv-key">{labelFor(k)}</div>
          <div className="pf-kv-val">{v == null || typeof v !== "object" ? String(v) : JSON.stringify(v)}</div>
        </div>
      ))}
    </div>
  );
}
```

(`OutputView` already passes `spec` to every renderer; no call-site change.)

- [ ] **Step 2: Verify and commit**

Run: `npm test && npm run build -w examples/demo`

```bash
git add packages/react/src/renderers/KeyValue.jsx
git commit -m "react: KeyValue resolves row labels from options.labels and spec.fields (#31)"
```

### Task 3: document the contract (#31)

**Files:**
- Modify: `docs/render-kinds.md`

- [ ] **Step 1: Update the keyvalue row in the built-in kinds table**

Replace:

```markdown
| `keyvalue` | flat object | one row per key |
```

with:

```markdown
| `keyvalue` | flat object | one row per key; row labels resolve per key: `options.labels` wins, then a `fields` output's declared `{ key, label }` pairs, then the raw key |
```

- [ ] **Step 2: Add the example after the table's trailing paragraph**

```markdown
`keyvalue` labels: `"render": { "kind": "keyvalue", "options": { "labels": { "dealSize": "Deal size" } } }` relabels keys on plain `data` objects. A `fields` output's declared labels apply automatically with no options; `options.labels` overrides them per key; unmapped keys display as-is.
```

- [ ] **Step 3: Commit**

```bash
git add docs/render-kinds.md
git commit -m "docs: keyvalue label mapping contract (#31)"
```

### Task 4: revert the #28 key rename (#31 follow-up, approved)

**Files:**
- Modify: `definitions/presales.json`
- Modify: `examples/demo/src/seeds.js`

- [ ] **Step 1: presales.json**

In the intake step's `facts` output, rename the field keys (labels stay):

- `"key": "Client"` to `"key": "client"`
- `"key": "Industry"` to `"key": "industry"`
- `"key": "Deal size"` to `"key": "dealSize"`
- `"key": "Response due"` to `"key": "responseDue"`

And in the definition's `subject`, change `"field": "Client"` to `"field": "client"`.

- [ ] **Step 2: seeds.js**

In the presales seed's intake `facts` value, rename the same four object keys: `"Client"` to `client`, `"Industry"` to `industry`, `"Deal size"` to `dealSize`, `"Response due"` to `responseDue`. Values unchanged.

- [ ] **Step 3: Verify**

Run: `npm test` (the bundled-definitions validation covers presales) and `npm run build -w examples/demo`.
In the demo: the presales intake card renders "Client", "Industry", "Deal size", "Response due" row labels via the keyvalue hint's automatic `spec.fields` mapping (identical to before the revert); the seeded run's display name still resolves to the client subject; the header subject line still shows the client name.

- [ ] **Step 4: Commit**

```bash
git add definitions/presales.json examples/demo/src/seeds.js
git commit -m "presales: code-style field keys, labels via spec.fields (#31)"
```

### Task 5: batch verification and push

- [ ] **Step 1: Full checks**

Run: `npm test && npm run build -w examples/demo`
Expected: green.

- [ ] **Step 2: Acceptance sweep against the spec**

- PDF on a markdown-hinted file output shows the chip, never a blank panel; .md uploads keep the rendered view.
- A fields output with a keyvalue hint renders declared labels with no options (presales intake).
- `options.labels` relabels data-output keys; unmapped keys show raw.
- `docs/render-kinds.md` documents precedence.
- Presales renders identically before and after the key revert; seeded subject resolution works.

- [ ] **Step 3: Push**

```bash
git push
```
