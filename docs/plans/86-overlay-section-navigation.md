# within-document section navigation in the output overlay: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a heading jump-list beside the body in the expand overlay for long markdown artifacts, so a reader can jump to a section instead of scrolling end to end.

**Architecture:** Add one pure, dependency-free module under `packages/react/src/renderers/` that owns the slug logic and the outline parse. The markdown renderer stamps a stable id on every heading using a per-document slug sequence from that module; the overlay re-derives the same outline from the same source string using a fresh instance of the same sequence, so the ids and the jump targets agree by construction. The overlay shows the jump-list only for the markdown built-in renderer with two or more headings; clicking an entry scrolls the overlay's own scroll container to the heading.

**Tech Stack:** Plain ESM JavaScript, React 19, the demo's vite build, Node's built-in test runner (`node:test`).

## Global Constraints

Every task's requirements implicitly include this section. Values copied from `CLAUDE.md`.

- No em dashes anywhere: code, comments, docs, commit messages, UI copy. Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Plain ESM JavaScript. All new work is in `@sqnce/react`; do not touch `@sqnce/core` (no engine change).
- The shared logic module must be a plain `.js` file, not `.jsx`. Node's test runner cannot import a `.jsx` file (it throws `Unknown file extension ".jsx"`), so any code that needs a unit test must live in a `.js` file with no JSX.
- Tests use `node:test` and `node:assert/strict` (Node 20+), matching the existing files under `packages/react/test/`.
- Renderer view state never enters the output value (the value is serialized into LLM draft prompts); this change only reads the value and adds DOM ids, so it does not write to the value.
- Per-PR gates that must pass: `npm test`, `npm run build -w examples/demo`, `npm run types`.

## File Structure

- **Create** `packages/react/src/renderers/markdownOutline.js`: the pure module. Exports `createSlugger()` (a stateful per-document slug generator) and `parseOutline(source)` (returns `{ level, text, slug }[]`, mirroring the renderer's block handling so it skips headings inside fenced code blocks). Imports `tokenizeInline` from the sibling `markdownInline.js` to turn a heading's inline markdown into a plain-text label. No React.
- **Create** `packages/react/test/markdownOutline.test.js`: unit tests for both exports.
- **Modify** `packages/react/src/renderers/Markdown.jsx`: import `createSlugger`, create one instance per render, stamp `id` on each heading.
- **Modify** `packages/react/src/OutputView.jsx`: import `parseOutline` and `useRef`; compute whether the resolved renderer is the markdown built-in; pass the parsed outline to `Overlay`; extend `Overlay` to render the jump-list rail beside the body and scroll its own container on click.
- **Modify** `packages/react/src/ProcessRolodex.jsx`: add CSS rules for the rail and its responsive collapse to the injected style string, next to the existing `.pf-overlay` rules.

## Interfaces (locked across tasks)

- `createSlugger() => (rawText: string) => string`. Stateful. Feed it raw heading texts (the text after the `#` characters) in document order. The first occurrence of a slug returns the bare slug; a repeat returns the bare slug plus the next free numeric suffix starting at `-2`. Two instances fed the same sequence return identical results. The renderer and the parser both feed it the **raw** heading text (not a plain-text-stripped version), so their slugs match even when a heading contains a link or inline code.
- `parseOutline(source: string) => { level: number, text: string, slug: string }[]`. `level` is 1 to 6. `text` is the plain-text label (inline markdown removed). `slug` is from a fresh `createSlugger()` fed the raw heading texts in document order. Headings inside fenced code blocks are skipped and do not advance the slug sequence.

---

### Task 1: pure slug + outline module, with unit tests

**Files:**
- Create: `packages/react/src/renderers/markdownOutline.js`
- Test: `packages/react/test/markdownOutline.test.js`

**Interfaces:**
- Consumes: `tokenizeInline` from `packages/react/src/renderers/markdownInline.js` (existing). Token shapes: `{type:"text",value}`, `{type:"code",value}`, `{type:"strong",value}`, `{type:"em",value}`, `{type:"link",text,href}`.
- Produces: `createSlugger`, `parseOutline` (signatures above).

- [ ] **Step 1: Write the failing tests**

Create `packages/react/test/markdownOutline.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSlugger, parseOutline } from "../src/renderers/markdownOutline.js";

test("createSlugger: a single heading slugifies to lowercase dashed text", () => {
  const slug = createSlugger();
  assert.equal(slug("Customer Profile"), "customer-profile");
});

test("createSlugger: a repeated heading gets numeric suffixes from -2", () => {
  const slug = createSlugger();
  assert.equal(slug("Summary"), "summary");
  assert.equal(slug("Summary"), "summary-2");
  assert.equal(slug("Summary"), "summary-3");
});

test("createSlugger: two instances fed the same sequence agree", () => {
  const a = createSlugger();
  const b = createSlugger();
  const seq = ["Intro", "Details", "Intro", "Details"];
  assert.deepEqual(seq.map(a), seq.map(b));
});

test("createSlugger: a literal slug and a disambiguated slug do not collide", () => {
  const slug = createSlugger();
  assert.equal(slug("Summary"), "summary");
  assert.equal(slug("Summary 2"), "summary-2");
  assert.equal(slug("Summary"), "summary-3");
});

test("createSlugger: an empty or symbol-only heading falls back to section", () => {
  const slug = createSlugger();
  assert.equal(slug("***"), "section");
  assert.equal(slug("   "), "section-2");
});

test("parseOutline: extracts headings with level and plain text", () => {
  const md = "# Title\n\nbody\n\n## Section A\n\n### Deep\n";
  assert.deepEqual(parseOutline(md), [
    { level: 1, text: "Title", slug: "title" },
    { level: 2, text: "Section A", slug: "section-a" },
    { level: 3, text: "Deep", slug: "deep" },
  ]);
});

test("parseOutline: the label is plain text but the slug comes from the raw heading", () => {
  const md = "## See [the docs](https://x.com)\n";
  assert.deepEqual(parseOutline(md), [
    { level: 2, text: "See the docs", slug: "see-the-docs-https-x-com" },
  ]);
});

test("parseOutline: a heading inside a fenced code block is ignored and does not shift the sequence", () => {
  const md = "# Intro\n\n```\n## Fake\n```\n\n## Intro\n";
  assert.deepEqual(parseOutline(md), [
    { level: 1, text: "Intro", slug: "intro" },
    { level: 2, text: "Intro", slug: "intro-2" },
  ]);
});

test("parseOutline: zero or one heading yields fewer than two entries", () => {
  assert.equal(parseOutline("just prose, no headings").length, 0);
  assert.equal(parseOutline("# Only one\n\nbody").length, 1);
});

test("parseOutline: CRLF source parses the same as LF", () => {
  assert.deepEqual(parseOutline("# A\r\n## B\r\n"), [
    { level: 1, text: "A", slug: "a" },
    { level: 2, text: "B", slug: "b" },
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. The new file's tests error with a module-not-found / `Cannot find module '../src/renderers/markdownOutline.js'` (the module does not exist yet). The existing suites still pass.

- [ ] **Step 3: Write the module**

Create `packages/react/src/renderers/markdownOutline.js`:

```javascript
import { tokenizeInline } from "./markdownInline.js";

/*
 * Pure outline support for the markdown built-in renderer. No React.
 * The renderer stamps heading ids and the expand overlay builds a jump
 * list; both use the same slug sequence from here so a heading's id and
 * its jump target always agree. Headings inside fenced code blocks are
 * not real headings (the renderer renders the fence as code before it
 * matches headings), so parseOutline skips them and does not let them
 * advance the slug sequence.
 */

/**
 * @typedef {{ level: number, text: string, slug: string }} OutlineEntry
 */

/** Base slug: lowercase, runs of non-alphanumerics become one dash, ends trimmed. */
function baseSlug(rawText) {
  return String(rawText)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Inline markdown removed, for a readable jump-list label. */
function plainText(rawText) {
  return tokenizeInline(rawText)
    .map((t) => (t.type === "link" ? t.text : t.value))
    .join("");
}

/**
 * Create a stateful per-document slug generator. Feed it raw heading texts
 * in document order. The first use of a slug returns the bare slug; a
 * repeat returns the next free numeric suffix from -2. Two instances fed
 * the same sequence return identical results, which is what keeps the
 * renderer ids and the overlay jump targets in lockstep.
 * @returns {(rawText: string) => string}
 */
export function createSlugger() {
  const used = new Set();
  return function slug(rawText) {
    const base = baseSlug(rawText) || "section";
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let n = 2;
    while (used.has(`${base}-${n}`)) n++;
    const out = `${base}-${n}`;
    used.add(out);
    return out;
  };
}

/**
 * Parse the ATX heading outline from markdown source, mirroring the
 * renderer's block handling: a line that starts a fenced code block (three
 * backticks) toggles a fence flag, and heading-looking lines inside a fence
 * are ignored. A heading is one to six leading '#' characters followed by a
 * space, exactly as the renderer matches it.
 * @param {string} source
 * @returns {OutlineEntry[]}
 */
export function parseOutline(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const slug = createSlugger();
  /** @type {OutlineEntry[]} */
  const entries = [];
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    entries.push({ level: m[1].length, text: plainText(m[2]), slug: slug(m[2]) });
  }
  return entries;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. All `markdownOutline.test.js` tests pass and every existing suite still passes.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/renderers/markdownOutline.js packages/react/test/markdownOutline.test.js
git commit -m "feat(react): pure markdown slug sequence and outline parser (#86)"
```

---

### Task 2: stamp heading ids in the markdown renderer

**Files:**
- Modify: `packages/react/src/renderers/Markdown.jsx`

**Interfaces:**
- Consumes: `createSlugger` from Task 1.
- Produces: every rendered `<h1>` to `<h6>` carries a stable `id` matching `parseOutline`'s slug for the same document.

- [ ] **Step 1: Add the import**

In `packages/react/src/renderers/Markdown.jsx`, after the existing inline import (line 2: `import { tokenizeInline } from "./markdownInline.js";`), add:

```javascript
import { createSlugger } from "./markdownOutline.js";
```

- [ ] **Step 2: Create one slugger per render**

In the `Markdown` component, just after `let key = 0;` (around line 38), add a fresh slugger. It is created per render, so each document gets its own sequence, and the while loop visits headings in document order:

```javascript
  const slug = createSlugger();
```

- [ ] **Step 3: Stamp the id on each heading**

In the heading branch (around lines 60-64), add the `id` attribute. The branch becomes:

```javascript
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const Tag = /** @type {keyof React.JSX.IntrinsicElements} */ (`h${h[1].length}`);
      blocks.push(<Tag key={key++} id={slug(h[2])}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
```

The fenced-code branch above this (the `if (line.startsWith("\`\`\`"))` block) still consumes a fence before the heading match runs, so a heading-looking line inside a fence never reaches `slug(...)`. That is exactly the set `parseOutline` walks, so the two stay aligned.

- [ ] **Step 4: Syntax-check the changed file**

Node cannot import `.jsx`, so this component has no unit-test harness; the syntax check is the local gate.

Run:
```bash
npx esbuild packages/react/src/renderers/Markdown.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```
Expected: no output and exit 0 (a clean bundle).

- [ ] **Step 5: Confirm the suite still passes**

Run: `npm test`
Expected: PASS (unchanged; this task adds no test, and the slug logic it calls is already covered by Task 1).

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/renderers/Markdown.jsx
git commit -m "feat(react): stamp stable heading ids in the markdown renderer (#86)"
```

---

### Task 3: render the jump-list rail in the expand overlay

**Files:**
- Modify: `packages/react/src/OutputView.jsx`

**Interfaces:**
- Consumes: `parseOutline` from Task 1; `BUILTIN_RENDERERS` (already imported at line 4); the heading ids stamped in Task 2.
- Produces: when the overlay's resolved renderer is the markdown built-in and the document has two or more headings, the overlay shows a `Sections` rail; clicking an entry scrolls the overlay body to that heading.

- [ ] **Step 1: Add the imports**

In `packages/react/src/OutputView.jsx`, change the React import (line 1) to include `useRef`:

```javascript
import React, { useEffect, useState, useRef, Suspense } from "react";
```

Then, just after the builtins import (line 4: `import { BUILTIN_RENDERERS } from "./renderers/builtins.js";`), add:

```javascript
import { parseOutline } from "./renderers/markdownOutline.js";
```

- [ ] **Step 2: Replace the `Overlay` component**

Replace the whole `Overlay` function (lines 18-42) with this version. It adds an optional `outline` prop, a ref on the scroll container, a scoped click-to-scroll, and a two-column body. The scroll lookup is scoped to `bodyRef`, never `document.getElementById`, because the inline (non-overlay) render is mounted at the same time with the same heading ids, so a global lookup would scroll the inline copy behind the overlay.

```javascript
function Overlay({ label, outline, onClose, children }) {
  const bodyRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const showOutline = Array.isArray(outline) && outline.length >= 2;
  const jump = (slug) => {
    const container = bodyRef.current;
    if (!container) return;
    const target = container.querySelector(`[id="${slug}"]`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  /* Portal to body: the rolodex cards are CSS-transformed, which would
     trap position: fixed overlays inside the card. */
  return createPortal(
    <ThemeScope>
      <div className="pf-overlay" role="dialog" aria-modal="true">
        <div className="pf-overlay-head">
          <span className="pf-overlay-title">{label}</span>
          <button className="pf-btn pf-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pf-overlay-main">
          {showOutline && (
            <details className="pf-overlay-outline" open>
              <summary>Sections</summary>
              <ul className="pf-outline-list">
                {outline.map((e, idx) => (
                  <li key={idx} className={`pf-outline-item pf-outline-l${e.level}`}>
                    <button type="button" className="pf-outline-link" onClick={() => jump(e.slug)}>
                      {e.text}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="pf-overlay-body" ref={bodyRef}>
            {children}
          </div>
        </div>
      </div>
    </ThemeScope>,
    document.body
  );
}
```

- [ ] **Step 3: Detect the markdown built-in**

In the `OutputView` component, just after `const Renderer = Custom || (isData ? JsonTree : null);` (line 145), add:

```javascript
  const isMarkdownBuiltin = Renderer === BUILTIN_RENDERERS.markdown;
```

Keying on the resolved component (not on `spec.render.kind`) is deliberate: a consumer can inject a custom renderer for the `markdown` kind, and that override does not stamp heading ids, so an outline built for it would point at ids that do not exist.

- [ ] **Step 4: Pass the outline to the overlay**

Change the overlay render (lines 206-216) to pass the parsed outline. It is parsed only when the renderer is the markdown built-in; otherwise `null` is passed and the overlay is exactly as today (title and Close, full-width body):

```javascript
      {big && Renderer && (
        <Overlay
          label={spec.label}
          outline={isMarkdownBuiltin ? parseOutline(String(viewValue ?? "")) : null}
          onClose={() => setBig(false)}
        >
          <RenderView
            Renderer={Renderer}
            spec={spec}
            value={viewValue}
            onChange={onChange}
            context={{ ...context, expanded: true }}
          />
        </Overlay>
      )}
```

- [ ] **Step 5: Syntax-check the changed file**

Run:
```bash
npx esbuild packages/react/src/OutputView.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```
Expected: no output and exit 0.

- [ ] **Step 6: Confirm the suite still passes**

Run: `npm test`
Expected: PASS (unchanged; the component has no unit harness, the pure logic is covered by Task 1).

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/OutputView.jsx
git commit -m "feat(react): show a heading jump-list in the markdown expand overlay (#86)"
```

---

### Task 4: style the rail and its responsive collapse

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

**Interfaces:**
- Consumes: the class names rendered in Task 3 (`pf-overlay-main`, `pf-overlay-outline`, `pf-outline-list`, `pf-outline-item`, `pf-outline-l1` to `pf-outline-l6`, `pf-outline-link`).
- Produces: a left rail beside the body on wide screens that collapses to a capped strip above the body on narrow screens, so the reading column keeps full width.

- [ ] **Step 1: Add the CSS rules**

In `packages/react/src/ProcessRolodex.jsx`, find the existing overlay rule `.pf-overlay-body { flex: 1; overflow: auto; padding: 18px 22px; }` (around line 1473). Immediately after it, insert these rules (all variables already exist in this stylesheet):

```css
.pf-overlay-main { flex: 1; display: flex; min-height: 0; }
.pf-overlay-outline { flex: 0 0 240px; overflow: auto; border-right: 1px solid var(--sqnce-_border-soft); padding: 14px 14px 18px; background: var(--sqnce-_paper); }
.pf-overlay-outline:not([open]) { flex: 0 0 auto; }
.pf-overlay-outline > summary { cursor: pointer; font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sqnce-_ink-label-dark); margin-bottom: 8px; }
.pf-outline-list { list-style: none; margin: 0; padding: 0; }
.pf-outline-item { margin: 0; }
.pf-outline-link { display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: 3px 4px; font-family: var(--sqnce-_font-mono); font-size: 12px; line-height: 1.5; color: var(--sqnce-_accent-ink); border-radius: 4px; }
.pf-outline-link:hover { background: var(--sqnce-_input); }
.pf-outline-l2 .pf-outline-link { padding-left: 16px; }
.pf-outline-l3 .pf-outline-link { padding-left: 28px; }
.pf-outline-l4 .pf-outline-link { padding-left: 40px; }
.pf-outline-l5 .pf-outline-link { padding-left: 52px; }
.pf-outline-l6 .pf-outline-link { padding-left: 64px; }
@media (max-width: 720px) {
  .pf-overlay-main { flex-direction: column; }
  .pf-overlay-outline { flex: 0 0 auto; max-height: 32vh; border-right: none; border-bottom: 1px solid var(--sqnce-_border-soft); }
}
```

- [ ] **Step 2: Syntax-check the changed file**

Run:
```bash
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```
Expected: no output and exit 0 (the CSS lives inside a JS template string, so a clean bundle confirms the string is still well formed).

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): style the overlay section rail and its narrow-width collapse (#86)"
```

---

### Task 5: full verification and manual check

**Files:** none changed; this task runs the gates and the manual UI check.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS. Every suite under `packages/core/test/` and `packages/react/test/` passes, including `markdownOutline.test.js`.

- [ ] **Step 2: Run the demo build gate**

Run: `npm run build -w examples/demo`
Expected: a successful `vite build` with no errors.

Note: in this worktree, `examples/demo` resolves `@sqnce/react` through the node_modules symlink, which points at the primary checkout, so a local build does not exercise this branch's source. The build is run here as a sanity gate; CI installs fresh and resolves `@sqnce/react` to this branch's package, so CI's build is the authoritative integration gate.

- [ ] **Step 3: Regenerate the type declarations**

Run: `npm run types`
Expected: exit 0. This regenerates the `.d.ts` files (which are gitignored, so nothing new to commit); the gate is that `tsc` exits clean over the new JSDoc on `markdownOutline.js` and the changed files.

- [ ] **Step 4: Manual UI check against this branch's source**

Because the local demo build resolves to the primary checkout, point it at this worktree for a manual check. Temporarily add a resolve alias to `examples/demo/vite.config.js`:

```javascript
export default defineConfig({
  base: "/sqnce/",
  plugins: [react()],
  resolve: {
    alias: {
      "@sqnce/react": "/home/dawti/dev/sqnce-worktrees/86-overlay-section-navigation/packages/react/src/index.js",
    },
  },
});
```

Run: `npm run dev -w examples/demo`, open the served URL, and walk a workflow to a stage whose output renders markdown (the demo seeds include long multi-heading artifacts, for example the Stage 4/5 architecture outputs in `examples/demo/src/seeds.js`). Then confirm:
- The expand control (the corner button on a rendered markdown output) opens the overlay with a `Sections` rail listing the document's headings, nested by level.
- Clicking a heading scrolls the overlay body (not the inline card behind the overlay) to that section.
- A short markdown output (fewer than two headings) and a non-markdown output both open the unchanged overlay (title and Close only, full-width body).
- Narrowing the window moves the rail to a capped strip above the body and the reading column keeps full width.

- [ ] **Step 5: Revert the manual alias**

The alias is a local aid and must never be committed.

Run: `git checkout examples/demo/vite.config.js`
Expected: `vite.config.js` is back to its committed form.

Run: `git status --short`
Expected: clean (no staged or unstaged changes) once the alias is reverted.

---

## Self-Review

**1. Spec coverage.** Every spec section maps to a task:
- "Heading ids in the renderer" (a per-document slug sequence, suffixing repeats) -> Task 1 (`createSlugger`) + Task 2 (stamping).
- "Outline in the overlay" (parse the same source, same slug sequence, plain-text labels, scoped scroll, nest by level) -> Task 1 (`parseOutline`) + Task 3.
- "the parser must mirror the renderer's block handling" / skip fenced-code headings -> Task 1 (`parseOutline` fence handling) + its dedicated test.
- "When the pane shows" (markdown built-in only, two or more headings) -> Task 3 (`isMarkdownBuiltin`, `showOutline`).
- "Responsive" (collapse on narrow widths, keep the reading measure) -> Task 4 (the media query).
- "Verification" (React unit tests for the pure pieces; JSX syntax check; demo build; manual check) -> Task 1 tests, plus Tasks 2 to 5 gates.
- Out of scope held: no in-document find, no outline for non-markdown or custom renderers, no inline-render navigation, no `@sqnce/core` change.

**2. Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N"; every code step shows the actual code and every command states its expected output.

**3. Type consistency.** `createSlugger` and `parseOutline` keep one signature across Tasks 1 to 3. The entry shape `{ level, text, slug }` is identical in the tests, the module, and the overlay's `outline.map`. The class names rendered in Task 3 match the selectors styled in Task 4 one-for-one (`pf-overlay-main`, `pf-overlay-outline`, `pf-outline-list`, `pf-outline-item`, `pf-outline-l{1..6}`, `pf-outline-link`).
