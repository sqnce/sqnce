# output rendering controls implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Definitions can declare how outputs are presented (render hints plus a new `data` output type), `@sqnce/react` renders generic shapes well and exposes a `renderers` registry prop, and the demo proves the contract with a real React Flow + elkjs renderer.

**Architecture:** Core learns one new output type (`data`) and loose validation of an opaque `render: { kind, options }` hint; it never interprets `kind`. The react package extracts the hardcoded output-type switch into an `OutputView` component that resolves `render.kind` against an injected `renderers` prop, then built-ins, then falls back (JSON tree for `data`, default editor otherwise). Domain renderers and their dependencies live in the importing app; the demo carries one as vendorable reference code.

**Tech Stack:** Plain ESM JavaScript, Node's `node:test`, React 19, Vite (demo only). New deps in `examples/demo` only: `@xyflow/react`, `elkjs`. Zero new deps in `packages/*`.

**Spec:** `docs/superpowers/specs/2026-06-09-output-rendering-design.md` (approved). Issue: https://github.com/sqnce/sqnce/issues/26

**Conventions that bind every task:** no em dashes anywhere (code, comments, docs, commits); brand is lowercase `sqnce`; `@sqnce/core` stays dependency-free; every UI behavior change is mirrored into `examples/claude-artifact/process-rolodex.jsx` (Task 14).

---

## File structure

```
packages/core/src/index.js                modify: validate data type + render hint, hasValue, serializeStep
packages/core/test/engine.test.js         modify: new tests (TDD)
packages/react/src/renderers/JsonTree.jsx   create: collapsible tree, universal data fallback
packages/react/src/renderers/KeyValue.jsx   create: flat-object grid
packages/react/src/renderers/DataTable.jsx  create: array-of-objects table
packages/react/src/renderers/Cards.jsx      create: navigable list + detail pane
packages/react/src/renderers/Markdown.jsx   create: minimal markdown subset
packages/react/src/renderers/builtins.js    create: kind -> component map
packages/react/src/OutputView.jsx           create: resolution, RenderBox, overlay, editors
packages/react/src/ProcessRolodex.jsx       modify: renderers prop, use OutputView, CSS additions
packages/react/package.json                 modify: react-dom peer dependency
definitions/presales.json                   modify: data outputs + markdown hints
examples/demo/package.json                  modify: @xyflow/react + elkjs deps
examples/demo/src/renderers/FlowDiagram.jsx create: vendorable reference renderer
examples/demo/src/App.jsx                   modify: lazy renderers prop
examples/demo/src/seeds.js                  modify: Pacific Ridge data outputs
docs/render-kinds.md                        create: kind vocabulary
docs/RENDERERS.md                           create: promoted library research
README.md                                   modify: custom renderers section
CLAUDE.md                                   modify: data type, registry rules, non-goal + trigger
examples/claude-artifact/process-rolodex.jsx modify: mirror engine + UI changes
```

---

### Task 1: spec-first draft PR

**Files:** none changed beyond what exists in the worktree (spec docs + this plan).

- [ ] **Step 1: Commit spec and plan**

```bash
git add docs/superpowers/
git commit -m "docs: spec and plan for output rendering controls (#26)"
```

- [ ] **Step 2: Push and open draft PR**

```bash
git push -u origin worktree-output-rendering
gh pr create --draft --title "output rendering controls: render hints, data outputs, renderer registry (#26)" --body "Implements #26. Spec-first: docs/superpowers/specs/2026-06-09-output-rendering-design.md (approved in session). Implementation follows task-by-task; plan doc will be deleted before merge, spec stays."
```

Expected: PR URL printed. Delete scratch file if present: `rm -f seed-extract.json`.

---

### Task 2: core accepts the `data` output type

**Files:**
- Modify: `packages/core/src/index.js:71`
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write the failing test** (append inside the existing top-level describe/test structure of `engine.test.js`; the file uses `import test from "node:test"` and `assert`)

```js
test("validateDefinition accepts the data output type", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [{ id: "m", subStages: [{ id: "s", steps: [
      { id: "st", outputs: [{ id: "o", type: "data", label: "Payload" }] },
    ] }] }],
  };
  assert.deepEqual(validateDefinition(def), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `unknown output type "data"` in the problems array.

- [ ] **Step 3: Minimal implementation** in `packages/core/src/index.js`, line 71:

```js
          if (!["text", "fields", "file", "link", "data"].includes(o.type))
```

Also update the header comment line 10 to: `*    - Output spec types: "text" | "fields" | "file" | "link" | "data"`.

- [ ] **Step 4: Run tests, expect PASS (12 tests).**

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): accept data output type in validateDefinition"
```

---

### Task 3: core validates the render hint

**Files:**
- Modify: `packages/core/src/index.js` (inside the outputs forEach in validateDefinition)
- Test: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test("validateDefinition checks render hints", () => {
  const mk = (render) => ({
    id: "d", name: "D",
    mainStages: [{ id: "m", subStages: [{ id: "s", steps: [
      { id: "st", outputs: [{ id: "o", type: "text", label: "T", render }] },
    ] }] }],
  });
  assert.deepEqual(validateDefinition(mk({ kind: "markdown" })), []);
  assert.deepEqual(validateDefinition(mk({ kind: "erd", options: { tables: "x" } })), []);
  assert.ok(validateDefinition(mk({})).some((p) => p.includes("render.kind")));
  assert.ok(validateDefinition(mk({ kind: "" })).some((p) => p.includes("render.kind")));
  assert.ok(validateDefinition(mk({ kind: "x", options: "nope" })).some((p) => p.includes("render.options")));
  assert.ok(validateDefinition(mk("markdown")).some((p) => p.includes("render")));
});
```

- [ ] **Step 2: Run, expect FAIL** (no render validation exists).

- [ ] **Step 3: Implement** in the outputs forEach, after the fields check (after line 74):

```js
          if (o.render !== undefined) {
            if (!o.render || typeof o.render !== "object" || Array.isArray(o.render)) {
              problems.push(`step "${st.id}": render must be an object`);
            } else {
              if (typeof o.render.kind !== "string" || !o.render.kind.trim())
                problems.push(`step "${st.id}": render.kind must be a non-empty string`);
              if (
                o.render.options !== undefined &&
                (typeof o.render.options !== "object" || o.render.options === null || Array.isArray(o.render.options))
              )
                problems.push(`step "${st.id}": render.options must be an object`);
            }
          }
```

- [ ] **Step 4: Run tests, expect PASS.**

- [ ] **Step 5: Commit** `git commit -am "feat(core): validate render hints on output specs"`

---

### Task 4: core hasValue for data

**Files:** `packages/core/src/index.js:127-134`, test file.

- [ ] **Step 1: Failing tests**

```js
test("hasValue for data outputs", () => {
  const spec = { id: "o", type: "data" };
  assert.equal(hasValue(spec, null), false);
  assert.equal(hasValue(spec, undefined), false);
  assert.equal(hasValue(spec, []), false);
  assert.equal(hasValue(spec, {}), false);
  assert.equal(hasValue(spec, ""), false);
  assert.equal(hasValue(spec, "  "), false);
  assert.equal(hasValue(spec, [1]), true);
  assert.equal(hasValue(spec, { a: 1 }), true);
  assert.equal(hasValue(spec, "x"), true);
  assert.equal(hasValue(spec, 0), true);
});
```

- [ ] **Step 2: Run, expect FAIL** (data falls through to `return false`).

- [ ] **Step 3: Implement** in `hasValue`, before the final `return false`:

```js
  if (spec.type === "data") {
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return Object.keys(val).length > 0;
    return String(val).trim().length > 0;
  }
```

- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat(core): hasValue semantics for data outputs"`

---

### Task 5: core serializeStep for data

**Files:** `packages/core/src/index.js:221-243`, test file.

- [ ] **Step 1: Failing tests**

```js
test("serializeStep serializes data outputs as capped JSON", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "Step", outputs: [{ id: "o", type: "data", label: "Inventory" }] };
  let run = createRun();
  run = setOutput(run, "st", "o", { tables: [{ name: "Account" }] });
  const block = serializeStep(sub, step, run);
  assert.ok(block.includes("Inventory:"));
  assert.ok(block.includes('{"tables":[{"name":"Account"}]}'));
  run = setOutput(run, "st", "o", { big: "x".repeat(5000) });
  const capped = serializeStep(sub, step, run);
  assert.ok(capped.length < 2700);
});
```

- [ ] **Step 2: Run, expect FAIL** (data outputs produce no parts, block is null).

- [ ] **Step 3: Implement** in `serializeStep`, after the file branch (line 237):

```js
    if (spec.type === "data")
      parts.push(`${spec.label || "Data"}:\n${JSON.stringify(val).slice(0, 2000)}`);
```

- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat(core): serialize data outputs into draft prompts"`

---

### Task 6: built-in renderers, structural set (JsonTree, KeyValue, DataTable)

**Files:**
- Create: `packages/react/src/renderers/JsonTree.jsx`
- Create: `packages/react/src/renderers/KeyValue.jsx`
- Create: `packages/react/src/renderers/DataTable.jsx`

No test harness exists for UI; verification is the esbuild syntax check per file plus the demo build in later tasks.

- [ ] **Step 1: Create `JsonTree.jsx`**

```jsx
import React from "react";

/** Collapsible JSON tree. Universal fallback for data outputs and unknown kinds. */
function Node({ k, v, depth }) {
  const label = k != null ? <span className="pf-jt-key">{k}: </span> : null;
  if (v === null || typeof v !== "object") {
    return (
      <div className="pf-jt-leaf">
        {label}
        <span className={`pf-jt-${v === null ? "null" : typeof v}`}>{JSON.stringify(v)}</span>
      </div>
    );
  }
  const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
  return (
    <details className="pf-jt-node" open={depth < 1}>
      <summary>
        {label}
        <span className="pf-jt-meta">{Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </summary>
      <div className="pf-jt-children">
        {entries.map(([ck, cv]) => (
          <Node key={String(ck)} k={String(ck)} v={cv} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

export default function JsonTree({ value }) {
  return (
    <div className="pf-jt">
      <Node v={value === undefined ? null : value} depth={0} />
    </div>
  );
}
```

- [ ] **Step 2: Create `KeyValue.jsx`**

```jsx
import React from "react";
import JsonTree from "./JsonTree.jsx";

/** Flat-object renderer: one row per key. Non-objects fall back to the tree. */
export default function KeyValue({ value }) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return <JsonTree value={value} />;
  }
  return (
    <div className="pf-kv">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="pf-kv-row">
          <div className="pf-kv-key">{k}</div>
          <div className="pf-kv-val">{v == null || typeof v !== "object" ? String(v) : JSON.stringify(v)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `DataTable.jsx`**

```jsx
import React from "react";
import JsonTree from "./JsonTree.jsx";

/** Array-of-uniform-objects renderer. Anything else falls back to the tree. */
export default function DataTable({ value }) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((r) => r == null || typeof r !== "object" || Array.isArray(r))
  ) {
    return <JsonTree value={value} />;
  }
  const cols = [];
  value.slice(0, 50).forEach((row) =>
    Object.keys(row).forEach((k) => {
      if (!cols.includes(k)) cols.push(k);
    })
  );
  const cell = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v));
  return (
    <table className="pf-table">
      <thead>
        <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {value.map((row, i) => (
          <tr key={i}>{cols.map((c) => <td key={c}>{cell(row[c])}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Syntax check all three**

Run: `npx esbuild packages/react/src/renderers/JsonTree.jsx packages/react/src/renderers/KeyValue.jsx packages/react/src/renderers/DataTable.jsx --bundle --format=esm --external:react --external:@sqnce/core --outdir=/tmp/sqnce-check`
Expected: no errors.

- [ ] **Step 5: Commit** `git add packages/react/src/renderers && git commit -m "feat(react): JsonTree, KeyValue, DataTable built-in renderers"`

---

### Task 7: built-in Cards renderer

**Files:** Create: `packages/react/src/renderers/Cards.jsx`

- [ ] **Step 1: Create `Cards.jsx`** (selection is renderer view state: internal, never written through onChange)

```jsx
import React, { useState } from "react";
import KeyValue from "./KeyValue.jsx";
import JsonTree from "./JsonTree.jsx";

/**
 * Navigable item list with a detail pane.
 * render.options: { title: "<key>", subtitle: "<key>" } select which item
 * fields label the list; defaults probe name/title/id and purpose/description.
 */
export default function Cards({ spec, value }) {
  const [sel, setSel] = useState(0);
  if (!Array.isArray(value) || !value.length) return <JsonTree value={value} />;
  const opts = (spec && spec.render && spec.render.options) || {};
  const titleOf = (item, i) => {
    if (item == null || typeof item !== "object") return String(item);
    return String((opts.title && item[opts.title]) || item.name || item.title || item.id || `Item ${i + 1}`);
  };
  const subOf = (item) => {
    if (item == null || typeof item !== "object") return "";
    return String((opts.subtitle && item[opts.subtitle]) || item.purpose || item.description || "");
  };
  const idx = Math.min(sel, value.length - 1);
  const current = value[idx];
  return (
    <div className="pf-cards">
      <div className="pf-cards-list">
        {value.map((item, i) => (
          <button
            key={i}
            className={`pf-cards-item ${i === idx ? "pf-cards-active" : ""}`}
            onClick={() => setSel(i)}
          >
            <div className="pf-cards-title">{titleOf(item, i)}</div>
            {subOf(item) && <div className="pf-cards-sub">{subOf(item).slice(0, 90)}</div>}
          </button>
        ))}
      </div>
      <div className="pf-cards-detail">
        {current != null && typeof current === "object" && !Array.isArray(current) ? (
          <KeyValue value={current} />
        ) : (
          <JsonTree value={current} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Syntax check** (same esbuild command pattern). Expected: clean.
- [ ] **Step 3: Commit** `git add packages/react && git commit -m "feat(react): Cards built-in renderer with detail pane"`

---

### Task 8: built-in Markdown renderer

**Files:** Create: `packages/react/src/renderers/Markdown.jsx`

Documented subset: ATX headings, paragraphs, unordered and ordered lists, blockquotes, fenced code, horizontal rules, GFM pipe tables, inline code/bold/italic/links. Output is React elements only, never innerHTML; link hrefs are whitelisted to http(s), mailto, and fragment.

- [ ] **Step 1: Create `Markdown.jsx`**

```jsx
import React from "react";

const TOKEN = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]]+\]\([^)\s]+\))/;

function inline(text) {
  const out = [];
  let rest = String(text);
  let i = 0;
  while (rest.length) {
    const m = rest.match(TOKEN);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={i}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={i}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={i}>{tok.slice(1, -1)}</em>);
    else {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const safe = /^(https?:|mailto:|#)/i.test(mm[2]);
      out.push(
        safe ? (
          <a key={i} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>
        ) : (
          `${mm[1]} (${mm[2]})`
        )
      );
    }
    rest = rest.slice(m.index + tok.length);
    i++;
  }
  return out;
}

const BLOCK_START = /^(#{1,6}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+|(-{3,}|\*{3,})\s*$)/;

/** Minimal markdown subset renderer. React elements only, no innerHTML. */
export default function Markdown({ value }) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;
  const splitRow = (l) =>
    l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className="pf-md-pre">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const Tag = `h${h[1].length}`;
      blocks.push(<Tag key={key++}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key++}>{inline(buf.join(" "))}</blockquote>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </Tag>
      );
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) body.push(splitRow(lines[i++]));
      blocks.push(
        <table key={key++} className="pf-table">
          <thead>
            <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(buf.join(" "))}</p>);
  }
  return <div className="pf-md">{blocks}</div>;
}
```

- [ ] **Step 2: Syntax check.** Expected: clean.
- [ ] **Step 3: Commit** `git commit -am "feat(react): minimal markdown subset renderer"` (use `git add packages/react` first).

---

### Task 9: builtins map and OutputView

**Files:**
- Create: `packages/react/src/renderers/builtins.js`
- Create: `packages/react/src/OutputView.jsx`
- Modify: `packages/react/package.json` (peer dep `react-dom`)

- [ ] **Step 1: Create `builtins.js`**

```js
import Markdown from "./Markdown.jsx";
import DataTable from "./DataTable.jsx";
import Cards from "./Cards.jsx";
import KeyValue from "./KeyValue.jsx";

/**
 * Built-in render kinds, keyed by content shape, not domain.
 * Value shapes are documented in docs/render-kinds.md.
 */
export const BUILTIN_RENDERERS = {
  markdown: Markdown,
  table: DataTable,
  cards: Cards,
  keyvalue: KeyValue,
};
```

- [ ] **Step 2: Create `OutputView.jsx`** (the contract seam: resolution order, RenderBox with expand overlay via portal, raw JSON editor for data, view/edit toggle for hinted non-data outputs, default editors extracted verbatim from ProcessRolodex)

```jsx
import React, { useEffect, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { hasValue } from "@sqnce/core";
import { BUILTIN_RENDERERS } from "./renderers/builtins.js";
import JsonTree from "./renderers/JsonTree.jsx";

/*
 * Renderer contract: a renderer is a pure presentation component
 * receiving { spec, value, onChange, context }. onChange carries value
 * mutations only; renderer view state (selection, pan, zoom) stays
 * internal, because serializeStep feeds values into LLM draft prompts.
 * context = { workflowId, stepId, subject, readOnly, expanded }.
 */

function Overlay({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  /* Portal to body: the rolodex cards are CSS-transformed, which would
     trap position: fixed overlays inside the card. */
  return createPortal(
    <div className="pf-overlay" role="dialog" aria-modal="true">
      <div className="pf-overlay-head">
        <span className="pf-overlay-title">{label}</span>
        <button className="pf-btn pf-btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="pf-overlay-body">{children}</div>
    </div>,
    document.body
  );
}

function RenderView({ Renderer, spec, value, onChange, context }) {
  return (
    <Suspense fallback={<div className="pf-render-loading">Loading view…</div>}>
      <Renderer spec={spec} value={value} onChange={onChange} context={context} />
    </Suspense>
  );
}

function RawJsonEditor({ value, onChange, onDone }) {
  const [draft, setDraft] = useState(() => JSON.stringify(value === undefined ? null : value, null, 2));
  const [error, setError] = useState(null);
  const apply = () => {
    try {
      onChange(JSON.parse(draft));
      setError(null);
      onDone();
    } catch (e) {
      setError("Invalid JSON: " + e.message);
    }
  };
  return (
    <div>
      <textarea className="pf-ta pf-ta-mono" value={draft} onChange={(e) => setDraft(e.target.value)} />
      {error && <div className="pf-error">{error}</div>}
      <div className="pf-actions">
        <button className="pf-btn pf-btn-sm" onClick={apply}>
          Apply
        </button>
        <button className="pf-btn pf-btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DefaultEditor({ spec, value, onChange, onAttach }) {
  if (spec.type === "text")
    return (
      <textarea
        className="pf-ta"
        placeholder="Write the output or generate a draft."
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (spec.type === "link")
    return (
      <input
        className="pf-field-input pf-link-input"
        placeholder="https://"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (spec.type === "fields")
    return (
      <div className="pf-fields">
        {spec.fields.map((f) => (
          <label key={f.key} className="pf-field">
            <span>{f.label}</span>
            <input
              className="pf-field-input"
              value={(value && value[f.key]) || ""}
              onChange={(e) => onChange({ ...(value || {}), [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    );
  if (spec.type === "file")
    return (
      <>
        {value && value.name ? (
          <div className="pf-filechip">📎 {value.name}</div>
        ) : (
          <div className="pf-filechip pf-filechip-empty">No file attached</div>
        )}
        <button className="pf-btn pf-btn-sm" onClick={onAttach}>
          {value && value.name ? "Replace file" : "Attach file"}
        </button>
      </>
    );
  return null;
}

/**
 * One output spec rendered: resolves render.kind against the injected
 * renderers map, then built-ins, then falls back (JSON tree for data,
 * the default editor otherwise). Unknown kinds never render blank.
 */
export default function OutputView({ spec, value, onChange, onAttach, renderers, context }) {
  const kind = spec.render && spec.render.kind;
  const Custom = kind ? (renderers && renderers[kind]) || BUILTIN_RENDERERS[kind] : null;
  const isData = spec.type === "data";
  const Renderer = Custom || (isData ? JsonTree : null);
  const filled = hasValue(spec, value);
  const viewValue = spec.type === "file" ? (value && value.content) || "" : value;
  /* Mode is initialized once at mount; deriving it per render would flip
     an empty hinted output from edit to view on the first keystroke. */
  const [mode, setMode] = useState(() => (isData ? "view" : Renderer && filled ? "view" : "edit"));
  const [big, setBig] = useState(false);

  const body =
    Renderer && mode === "view" ? (
      filled ? (
        <div className="pf-render">
          <button className="pf-render-expand" title="Expand" onClick={() => setBig(true)}>
            ⛶
          </button>
          <RenderView
            Renderer={Renderer}
            spec={spec}
            value={viewValue}
            onChange={onChange}
            context={{ ...context, expanded: false }}
          />
        </div>
      ) : (
        <div className="pf-filechip pf-filechip-empty">{isData ? "No data yet" : "Nothing to show yet"}</div>
      )
    ) : isData ? (
      <RawJsonEditor value={value} onChange={onChange} onDone={() => setMode("view")} />
    ) : (
      <DefaultEditor spec={spec} value={value} onChange={onChange} onAttach={onAttach} />
    );

  const toggle =
    Renderer && mode === "view" && spec.type !== "file" ? (
      <button className="pf-render-toggle" onClick={() => setMode("edit")}>
        {isData ? "Edit JSON" : "Edit"}
      </button>
    ) : Renderer && mode === "edit" && !isData && filled ? (
      <button className="pf-render-toggle" onClick={() => setMode("view")}>
        View
      </button>
    ) : null;

  return (
    <div className="pf-out">
      <div className="pf-out-head">
        <div className="pf-out-label">{spec.label}</div>
        {toggle}
      </div>
      {body}
      {big && Renderer && (
        <Overlay label={spec.label} onClose={() => setBig(false)}>
          <RenderView
            Renderer={Renderer}
            spec={spec}
            value={viewValue}
            onChange={onChange}
            context={{ ...context, expanded: true }}
          />
        </Overlay>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add react-dom peer** in `packages/react/package.json`:

```json
  "peerDependencies": { "react": ">=18", "react-dom": ">=18" },
```

- [ ] **Step 4: Syntax check OutputView** (esbuild, add `--external:react-dom`). Expected: clean.
- [ ] **Step 5: Commit** `git add packages/react && git commit -m "feat(react): OutputView with renderer registry resolution, expand overlay, raw JSON editing"`

---

### Task 10: wire OutputView into ProcessRolodex

**Files:** Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Add the prop and import.** Line 1 area: add `import OutputView from "./OutputView.jsx";`. Change the signature (line 86):

```jsx
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers }) {
```

Update the JSDoc block (after the initialRunFor entry, line 41):

```
 *  - renderers (optional): map of render kind -> React component, the
 *      registry for definition render hints. Resolution order: this map,
 *      then built-ins (markdown, table, cards, keyvalue), then fallback
 *      (JSON tree for data outputs, default editor otherwise). A renderer
 *      receives { spec, value, onChange, context } and must treat
 *      onChange as value-mutations-only. Omit to use built-ins alone.
```

- [ ] **Step 2: Replace the output type switch** (lines 379-449, the entire `(step.outputs || []).map((spec) => { ... })` block) with:

```jsx
                          {(step.outputs || []).map((spec) => (
                            <OutputView
                              key={spec.id}
                              spec={spec}
                              value={(entry.outputs || {})[spec.id]}
                              onChange={(v) => writeOutput(step.id, spec.id, v)}
                              onAttach={() => {
                                attachFor.current = { stepId: step.id, outputId: spec.id };
                                fileRef.current && fileRef.current.click();
                              }}
                              renderers={renderers}
                              context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: false }}
                            />
                          ))}
```

- [ ] **Step 3: Append CSS** to the CSS template literal, before the closing backtick (before the `@media (max-width: 720px)` rule):

```css
.pf-out-head { display: flex; align-items: center; justify-content: space-between; }
.pf-render-toggle { background: none; border: none; color: #7A6A3C; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; text-decoration: underline; padding: 0; }
.pf-render { position: relative; border: 1px solid #D8D3C2; border-radius: 6px; background: #FFFFFF; max-height: 280px; overflow: auto; padding: 10px; }
.pf-render-expand { position: absolute; top: 6px; right: 6px; z-index: 2; background: #F1EEE3; border: 1px solid #C9C3B0; border-radius: 5px; cursor: pointer; font-size: 12px; padding: 2px 6px; }
.pf-render-expand:hover { border-color: #23282F; }
.pf-render-loading { font-size: 12px; color: #8A8E96; padding: 8px; }
.pf-ta-mono { font-family: 'IBM Plex Mono', monospace; font-size: 12px; min-height: 180px; }
.pf-overlay { position: fixed; inset: 0; z-index: 1000; background: #F1EEE3; display: flex; flex-direction: column; }
.pf-overlay-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #23282F; color: #EDEAE0; }
.pf-overlay-title { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-overlay-body { flex: 1; overflow: auto; padding: 18px 22px; }
.pf-jt { font-family: 'IBM Plex Mono', monospace; font-size: 12px; line-height: 1.55; }
.pf-jt-node { padding-left: 0; }
.pf-jt-children { padding-left: 16px; }
.pf-jt-node > summary { cursor: pointer; list-style-position: outside; }
.pf-jt-leaf { padding-left: 16px; }
.pf-jt-key { color: #7A6A3C; }
.pf-jt-string { color: #2E6E8F; } .pf-jt-number { color: #8F4E2E; } .pf-jt-boolean, .pf-jt-null { color: #6B4E8F; }
.pf-jt-meta { color: #9A9EA6; }
.pf-kv { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 4px 14px; font-size: 12.5px; }
.pf-kv-key { font-family: 'IBM Plex Mono', monospace; color: #7A6A3C; word-break: break-word; }
.pf-kv-val { color: #23282F; white-space: pre-wrap; word-break: break-word; }
.pf-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.pf-table th, .pf-table td { border: 1px solid #DCD7C7; padding: 5px 8px; text-align: left; vertical-align: top; }
.pf-table th { background: #EFEBDD; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; }
.pf-cards { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: 12px; min-height: 120px; }
.pf-cards-list { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; max-height: 420px; }
.pf-cards-item { text-align: left; background: #FAF8F0; border: 1px solid #DCD7C7; border-radius: 6px; padding: 7px 9px; cursor: pointer; font-family: inherit; }
.pf-cards-item:hover { border-color: #23282F; }
.pf-cards-active { border-color: #D9A441; background: #FBF3DD; }
.pf-cards-title { font-size: 12.5px; font-weight: 600; color: #23282F; }
.pf-cards-sub { font-size: 11px; color: #6B6F76; }
.pf-cards-detail { border-left: 2px solid #D9A441; padding-left: 12px; overflow: auto; }
.pf-md { font-size: 13.5px; line-height: 1.6; }
.pf-md h1, .pf-md h2, .pf-md h3, .pf-md h4, .pf-md h5, .pf-md h6 { margin: 12px 0 6px; line-height: 1.25; }
.pf-md h1 { font-size: 19px; } .pf-md h2 { font-size: 16.5px; } .pf-md h3 { font-size: 14.5px; }
.pf-md p { margin: 6px 0; }
.pf-md ul, .pf-md ol { margin: 6px 0; padding-left: 22px; }
.pf-md blockquote { margin: 8px 0; border-left: 3px solid #D9A441; padding-left: 10px; color: #5C6068; }
.pf-md-pre { background: #23282F; color: #EDEAE0; border-radius: 6px; padding: 10px; overflow-x: auto; font-size: 12px; }
.pf-md code { background: #EFEBDD; border-radius: 3px; padding: 0 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.92em; }
.pf-md-pre code { background: none; padding: 0; }
.pf-md table { margin: 8px 0; }
```

- [ ] **Step 4: Verify**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/tmp/pr-check.js && npm test && npm run build -w examples/demo`
Expected: all clean (existing behavior unchanged; no definition uses hints yet).

- [ ] **Step 5: Commit** `git add packages/react && git commit -m "feat(react): renderers prop, OutputView wiring, render CSS"`

---

### Task 11: presales definition and demo seeds

**Files:**
- Modify: `definitions/presales.json` (demo-data step outputs; markdown hints)
- Modify: `examples/demo/src/seeds.js` (presales seed demo-data outputs)

- [ ] **Step 1: definitions/presales.json.** In the `demo-data` step (id "demo-data"), extend `outputs` to:

```json
"outputs": [
  { "id": "file", "type": "file", "label": "Data set" },
  {
    "id": "inventory",
    "type": "data",
    "label": "Build inventory",
    "render": { "kind": "cards", "options": { "title": "name", "subtitle": "purpose" } }
  },
  {
    "id": "automations",
    "type": "data",
    "label": "Automation map",
    "render": { "kind": "flow" }
  }
]
```

In the `demo-script` step, change the output to add the hint:

```json
"outputs": [
  { "id": "out", "type": "text", "label": "Demo script", "render": { "kind": "markdown" } }
]
```

Same for `solution-narrative`'s output (`"render": { "kind": "markdown" }` added to its existing object).

- [ ] **Step 2: Run `npm test`.** Expected: PASS (the bundled-definitions validation test covers the edit; render hints validate).

- [ ] **Step 3: seeds.js.** In the `"presales-pursuit"` seed, inside `"demo-data"` (line ~254), extend its `outputs` object with `inventory` and `automations` keys alongside the existing file entry. Exact values (real Pacific Ridge content trimmed from the reference run):

```js
inventory: [
  { id: "tbl-account", name: "Account", logical_name: "account", purpose: "GC, sub-contractor, end-user municipality records; visual account hierarchy; ERP-sourced credit and order-history panel.", scenes: [2, 3, 4, 8, 9] },
  { id: "tbl-contact", name: "Contact", logical_name: "contact", purpose: "Buyer, Engineer, AP role designations per account.", scenes: [2, 3] },
  { id: "tbl-lead", name: "Lead", logical_name: "lead", purpose: "Inbound web inquiry; source = Web; territory-routed.", scenes: [1, 2] },
  { id: "tbl-opportunity", name: "Opportunity", logical_name: "opportunity", purpose: "Pipeline with the OM-02 named stages; single-table BPF host (qualifies for offline).", scenes: [2, 5, 6, 7, 8, 9] },
  { id: "tbl-quote", name: "Quote", logical_name: "quote", purpose: "Pipe-spec quote with versioning/cloning and header-level pricing summary.", scenes: [5, 6] },
  { id: "tbl-quote-detail", name: "Quote Detail (Quote Product)", logical_name: "quotedetail", purpose: "Pipe line items + surcharge / freight write-in rows.", scenes: [5, 6] },
  { id: "tbl-product", name: "Product", logical_name: "product", purpose: "Pipe SKUs with grade/diameter/wall attributes. Mastered in ERP; read into Dataverse.", scenes: [5] },
  { id: "tbl-price-list", name: "Price List", logical_name: "pricelevel", purpose: "Pricing source for QT-02; default by territory; maintained by Priya (Product Manager).", scenes: [5, 10] },
  { id: "tbl-price-list-item", name: "Price List Item", logical_name: "productpricelevel", purpose: "Unit prices keyed to currency and Unit (UoM); override pricing supported.", scenes: [5] },
  { id: "tbl-unit-group", name: "Unit Group", logical_name: "uomschedule", purpose: "Two Unit Groups model UoM in feet OR tons.", scenes: [5] },
  { id: "tbl-territory", name: "Territory", logical_name: "territory", purpose: "Western-US territory model with hierarchical relationship; default price-list-by-territory.", scenes: [1, 8, 9] },
  { id: "tbl-connection", name: "Connection", logical_name: "connection", purpose: "Links the municipal end-user account to the GC account on the same project.", scenes: [3] },
],
automations: {
  nodes: [
    { id: "A-01", label: "A-01: Web lead territory routing", group: "automation" },
    { id: "A-02", label: "A-02: Lead-to-opportunity conversion", group: "automation" },
    { id: "A-03", label: "A-03: ERP account & credit lookup", group: "automation" },
    { id: "A-04", label: "A-04: Product catalog refresh", group: "automation" },
    { id: "A-06", label: "A-06: Quote clone & version flow", group: "automation" },
    { id: "A-07", label: "A-07: Discount / margin approval", group: "automation" },
    { id: "A-08", label: "A-08: Branded quote PDF & send", group: "automation" },
    { id: "A-09", label: "A-09: Next-step activity automation", group: "automation" },
    { id: "tbl-lead", label: "Lead", group: "table" },
    { id: "tbl-opportunity", label: "Opportunity", group: "table" },
    { id: "tbl-account", label: "Account", group: "table" },
    { id: "tbl-product", label: "Product", group: "table" },
    { id: "tbl-price-list", label: "Price List", group: "table" },
    { id: "tbl-quote", label: "Quote", group: "table" },
    { id: "tbl-activity-phonecall", label: "Phone Call activity", group: "table" },
    { id: "tbl-activity-task", label: "Task activity", group: "table" },
    { id: "tbl-activity-appointment", label: "Appointment activity", group: "table" },
  ],
  edges: [
    { from: "A-01", to: "tbl-lead" },
    { from: "A-02", to: "tbl-lead" },
    { from: "A-02", to: "tbl-opportunity" },
    { from: "A-03", to: "tbl-account" },
    { from: "A-04", to: "tbl-product" },
    { from: "A-04", to: "tbl-price-list" },
    { from: "A-06", to: "tbl-quote" },
    { from: "A-06", to: "tbl-opportunity" },
    { from: "A-07", to: "tbl-quote" },
    { from: "A-08", to: "tbl-quote" },
    { from: "A-09", to: "tbl-activity-phonecall" },
    { from: "A-09", to: "tbl-activity-task" },
    { from: "A-09", to: "tbl-activity-appointment" },
  ],
},
```

Also reformat the existing `demo-script` seed text into markdown (keep the same content, add `##` act headings and a small pipe table of wow moments) so the markdown renderer has something real to show. Keep it under 60 lines.

- [ ] **Step 4: Verify** `npm test && npm run build -w examples/demo`. Expected: clean.
- [ ] **Step 5: Commit** `git add definitions examples/demo && git commit -m "feat(demo): presales data outputs with render hints, Pacific Ridge seed content"`

---

### Task 12: vendorable reference renderer (React Flow + elkjs)

**Files:**
- Modify: `examples/demo/package.json` (add deps)
- Create: `examples/demo/src/renderers/FlowDiagram.jsx`
- Modify: `examples/demo/src/App.jsx`

- [ ] **Step 1: Add deps** to `examples/demo/package.json` dependencies:

```json
    "@xyflow/react": "^12.11.0",
    "elkjs": "^0.11.1",
```

Run `npm install` at the repo root.

- [ ] **Step 2: Create `FlowDiagram.jsx`**

```jsx
/*
 * FlowDiagram: vendorable reference renderer for the sqnce "flow" kind
 * ({ nodes: [{ id, label, group? }], edges: [{ from, to, label? }] }).
 *
 * COPY THIS FILE INTO YOUR PROJECT. It is not a published package and
 * carries no semver promise. It exists to prove the sqnce renderer
 * contract ({ spec, value, onChange, context }) under a demanding load:
 * async layout in a worker, re-fit on the inline-to-overlay transition,
 * and strictly view-only behavior (onChange is never called; selection
 * and viewport are renderer view state and stay internal).
 *
 * Dependencies (pin guidance, June 2026): @xyflow/react ^12.11.0 (MIT),
 * elkjs ^0.11.1 (EPL-2.0). elkjs is consumed unmodified as a separate
 * lazy chunk; the EPL-2.0 notice travels with its bundled worker file.
 *
 * Bundler note: elkjs's automatic worker loading does not survive
 * bundling (kieler/elkjs#142, #272). Under Vite, import elk-api and the
 * worker URL explicitly (below). Under webpack or Next, replace the
 * workerFactory with: new Worker(new URL("elkjs/lib/elk-worker.min.js",
 * import.meta.url)).
 */
import React, { useEffect, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk-api";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import "@xyflow/react/dist/style.css";

const NODE_W = 190;
const NODE_H = 48;

const elk = new ELK({
  workerFactory: () => new Worker(elkWorkerUrl, { type: "classic" }),
});

function useElkLayout(value) {
  const [positions, setPositions] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setPositions(null);
    setError(null);
    const nodes = (value && value.nodes) || [];
    const ids = new Set(nodes.map((n) => n.id));
    const edges = ((value && value.edges) || []).filter((e) => ids.has(e.from) && ids.has(e.to));
    if (!nodes.length) return undefined;
    elk
      .layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "70",
          "elk.spacing.nodeNode": "22",
        },
        children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
        edges: edges.map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
      })
      .then(
        (res) => {
          if (!alive) return;
          setPositions(new Map(res.children.map((c) => [c.id, { x: c.x, y: c.y }])));
        },
        (err) => {
          if (alive) setError(String(err));
        }
      );
    return () => {
      alive = false;
    };
  }, [value]);
  return { positions, error };
}

function Diagram({ value, context }) {
  const { positions, error } = useElkLayout(value);
  const { fitView } = useReactFlow();
  const expanded = !!(context && context.expanded);
  useEffect(() => {
    if (positions) requestAnimationFrame(() => fitView({ padding: 0.15 }));
  }, [positions, expanded, fitView]);
  if (error) return <div style={{ padding: 10, color: "#B3402A", fontSize: 13 }}>Layout failed: {error}</div>;
  if (!positions) return <div style={{ padding: 10, fontSize: 13 }}>Laying out…</div>;
  const ids = new Set(((value && value.nodes) || []).map((n) => n.id));
  const nodes = ((value && value.nodes) || []).map((n) => ({
    id: n.id,
    position: positions.get(n.id) || { x: 0, y: 0 },
    data: { label: n.label || n.id },
    sourcePosition: "right",
    targetPosition: "left",
    style: {
      width: NODE_W,
      fontSize: 11.5,
      borderRadius: 6,
      border: "1px solid " + (n.group === "table" ? "#2E8F62" : "#D9A441"),
      background: n.group === "table" ? "#F2F8F3" : "#FBF3DD",
    },
  }));
  const edges = ((value && value.edges) || [])
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e, i) => ({ id: `e${i}`, source: e.from, target: e.to, label: e.label }));
  return (
    <ReactFlow nodes={nodes} edges={edges} nodesDraggable={false} nodesConnectable={false} fitView>
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function FlowDiagram({ spec, value, onChange, context }) {
  const expanded = !!(context && context.expanded);
  return (
    <div style={{ height: expanded ? "100%" : 300, minHeight: 220 }}>
      <ReactFlowProvider>
        <Diagram value={value} context={context} />
      </ReactFlowProvider>
    </div>
  );
}
```

- [ ] **Step 3: Wire into App.jsx.** Add at the top:

```jsx
import { lazy } from "react";
const FlowDiagram = lazy(() => import("./renderers/FlowDiagram.jsx"));
const RENDERERS = { flow: FlowDiagram };
```

and pass `renderers={RENDERERS}` to `<ProcessRolodex ... />`.

- [ ] **Step 4: Verify** `npm run build -w examples/demo`. Expected: build succeeds, FlowDiagram and elkjs appear as separate lazy chunks. Contingency if the `?url` worker import fails the build: replace the two elk imports with `import ELK from "elkjs/lib/elk.bundled.js";` and `const elk = new ELK();` (main-thread layout, still async), and note the substitution in the file header.
- [ ] **Step 5: Commit** `git add examples/demo package-lock.json && git commit -m "feat(demo): vendorable React Flow + elkjs flow renderer proving the contract"`

---

### Task 13: docs (render-kinds, RENDERERS, README, CLAUDE.md)

**Files:**
- Create: `docs/render-kinds.md`
- Create: `docs/RENDERERS.md`
- Modify: `README.md` (new section before License, line 154)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `docs/render-kinds.md`** with the kind vocabulary: normative value shapes for `markdown` (string), `table` (array of uniform objects), `cards` (array of objects, options.title/options.subtitle select label keys), `keyvalue` (flat object); reserved provisional names `flow` ({ nodes: [{ id, label }], edges: [{ from, to, label? }] }), `lanes` ({ lanes: [{ id, label }], items: [{ id, laneId, title }] }), `erd` ({ entities: [{ name, attributes: [] }], relations: [{ from, to, cardinality? }] }) marked "provisional, subject to change until two independent consumers exist"; namespacing rule (bare names reserved for sqnce-documented kinds; app-private kinds take a prefix like `pwf:erd`); fail-soft rule (unknown kind: JSON tree for data, default editor otherwise).

- [ ] **Step 2: Create `docs/RENDERERS.md`**: copy `docs/superpowers/specs/2026-06-09-renderer-library-research.md`, retitle to "renderer libraries for downstream projects", drop the "Companion to" line, keep everything else.

- [ ] **Step 3: README section** inserted before `## License`: "## Custom renderers" covering the renderers prop with the FlowDiagram wiring example, the renderer contract and the onChange rule, resolution order and fail-soft, a pointer to docs/render-kinds.md and docs/RENDERERS.md, and the downstream guidance from the spec (data-shape coupling, dependency choice stays with the importer, domain affordances are the value, renderers are pure presentation, fail soft, ship a renderer where its data lives, vendor the demo reference instead of waiting for a package).

- [ ] **Step 4: CLAUDE.md**: in layer 1 change output types line to `text | fields | file | link | data` and mention optional `render: { kind, options }` hints (kind free string, validated loosely); in layer 3 add the `renderers` prop to the injected-props list; in Key behaviors add "Unknown render kinds never render blank: JSON tree fallback for data outputs, default editor otherwise" and "Renderer onChange carries value mutations only; renderer view state never enters the value"; in Conventions add "Renderer packages are a non-goal: reference renderers live in examples and are meant to be copied. Extract a published @sqnce/renderers-* package only when at least two independent downstream projects have vendored the glue, the provisional value shapes survived both, and there is capacity for the React Flow and elkjs upgrade treadmill."

- [ ] **Step 5: Verify and commit** `npm test && git add docs README.md CLAUDE.md && git commit -m "docs: render kind vocabulary, renderer library guide, README custom renderers, CLAUDE.md rules"`

---

### Task 14: claude-artifact sync

**Files:** Modify: `examples/claude-artifact/process-rolodex.jsx`

The artifact mirrors engine and UI behavior but stays a self-contained file with no heavy deps. It omits custom renderers (mirror of omitting the `renderers` prop) and relies on built-ins plus fallback.

- [ ] **Step 1: Mirror engine changes** in its inlined engine functions: the `hasValue` data branch (Task 4 code), the `serializeStep` data branch (Task 5 code). Its inlined `PRESALES` config gets the same demo-data outputs and markdown hints as Task 11 Step 1 (with a compact inline copy of the inventory seed value omitted; the artifact's `SEED_RUNS` stays `{}` so no seed data is needed).
- [ ] **Step 2: Mirror UI**: inline copies (imports stripped, `React.` prefixed hooks as the file's style dictates) of JsonTree, KeyValue, DataTable, Cards, Markdown, the BUILTIN map, RawJsonEditor, Overlay, RenderView, and OutputView from Tasks 6-9, replacing the artifact's own output type switch the same way Task 10 replaced the package's. A `const RENDERERS = null;` constant documents the omitted registry ("custom renderers default to off in this artifact"). Append the Task 10 CSS block to its CSS string.
- [ ] **Step 3: Verify** `npx esbuild examples/claude-artifact/process-rolodex.jsx --bundle --format=esm --external:react --external:react-dom --outfile=/tmp/artifact-check.js`. Expected: clean.
- [ ] **Step 4: Commit** `git add examples/claude-artifact && git commit -m "sync(artifact): data outputs, render hints, built-in renderers, overlay"`

---

### Task 15: final verification and PR ready

- [ ] **Step 1: Full pass** `npm test && npm run build -w examples/demo` plus the esbuild artifact check. Expected: all green.
- [ ] **Step 2: Em dash scan** `grep -rn $'—' packages definitions docs examples README.md CLAUDE.md` Expected: no matches.
- [ ] **Step 3: Push, mark PR ready** `git push && gh pr ready`. Watch for Codex review per the standing workflow (poll `gh pr view --json reviews`, fallback `@codex review` comment after 5 minutes, 👀 means in progress). Address findings, merge only after Codex approves. Delete this plan doc pre-merge (spec stays).
