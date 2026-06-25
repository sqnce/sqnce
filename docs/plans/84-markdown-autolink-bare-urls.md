# plan: markdown renderer, autolink bare URLs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render bare `http(s)` URLs in the markdown renderer as clickable links that open in a new tab, without changing any other rendering behavior.

**Architecture:** Extract the inline tokenizer's matching out of `Markdown.jsx` into a pure, React-free `.js` helper (`markdownInline.js`) that returns a flat descriptor list, add a bare-URL branch to its alternation, and have `Markdown.jsx` import the helper and render each descriptor. The pure helper is unit-tested directly under the existing `node --test` harness (no DOM, no new dependency); the renderer wiring is verified by the JSX syntax check and the demo build.

**Tech Stack:** Plain ESM JavaScript and JSX, React (peer), `node:test` + `node:assert/strict`, `tsc` for `.d.ts` generation, Vite for the demo build.

## Global Constraints

- No em dashes anywhere (code, comments, docs, commit messages): use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Plain ESM JavaScript, no new dependencies; `@sqnce/react` only, no `@sqnce/core` change.
- Tests use Node's built-in runner (`node:test`, Node 20+); the new test is a pure-logic suite (asserts on returned descriptors, no DOM).
- Approved spec decisions: bare-URL anchors use `rel="noreferrer"` and `target="_blank"`; only `http://` and `https://` autolink (scheme-less `www.` hosts and `mailto:` stay out of scope).
- Preserve every existing rendering behavior: inline code, bold, italic, explicit `[text](url)` links (including the unsafe-href fallback), and the fact that bold/italic inner text is not re-tokenized.

---

### Task 1: Pure inline tokenizer with bare-URL autolink (helper + unit test)

Create the React-free tokenizer helper and its unit test. This task is fully testable on its own via `npm test`; it does not yet touch `Markdown.jsx`.

**Files:**
- Create: `packages/react/src/renderers/markdownInline.js`
- Test: `packages/react/test/markdown.test.js`

**Interfaces:**
- Produces: `tokenizeInline(text: string): InlineToken[]`, where `InlineToken` is one of
  `{ type: "text", value: string }`, `{ type: "code", value: string }`,
  `{ type: "strong", value: string }`, `{ type: "em", value: string }`,
  `{ type: "link", text: string, href: string }`. A bare URL is emitted as a `link`
  whose `text` equals its `href`. Consumed by Task 2 (`Markdown.jsx`).

- [ ] **Step 1: Write the failing test**

Create `packages/react/test/markdown.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizeInline } from "../src/renderers/markdownInline.js";

test("tokenizeInline: a bare http(s) URL becomes a link whose text is the URL", () => {
  assert.deepEqual(tokenizeInline("https://x.com"), [
    { type: "link", text: "https://x.com", href: "https://x.com" },
  ]);
});

test("tokenizeInline: a sentence-final URL leaves the trailing period as text", () => {
  assert.deepEqual(tokenizeInline("see https://learn.microsoft.com/x."), [
    { type: "text", value: "see " },
    {
      type: "link",
      text: "https://learn.microsoft.com/x",
      href: "https://learn.microsoft.com/x",
    },
    { type: "text", value: "." },
  ]);
});

test("tokenizeInline: a URL inside an inline code span stays a literal code token", () => {
  assert.deepEqual(tokenizeInline("run `https://x.com` now"), [
    { type: "text", value: "run " },
    { type: "code", value: "https://x.com" },
    { type: "text", value: " now" },
  ]);
});

test("tokenizeInline: an explicit link still tokenizes as one link (unchanged)", () => {
  assert.deepEqual(tokenizeInline("[docs](https://x.com)"), [
    { type: "link", text: "docs", href: "https://x.com" },
  ]);
});

test("tokenizeInline: bold and italic inner text is not re-tokenized", () => {
  assert.deepEqual(tokenizeInline("a **b https://x.com** c"), [
    { type: "text", value: "a " },
    { type: "strong", value: "b https://x.com" },
    { type: "text", value: " c" },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. The run errors on the missing module, for example `Cannot find module '.../packages/react/src/renderers/markdownInline.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/react/src/renderers/markdownInline.js`:

```js
/*
 * Inline tokenizer for the markdown subset renderer. Pure (no React): returns a
 * flat descriptor list so the autolink logic is unit-testable in isolation.
 * Descriptor kinds:
 *   { type: "text",   value }      plain text run
 *   { type: "code",   value }      inline code, backticks stripped
 *   { type: "strong", value }      bold inner text (not re-tokenized)
 *   { type: "em",     value }      italic inner text (not re-tokenized)
 *   { type: "link",   text, href } explicit [text](href), or a bare http(s) URL (text === href)
 */

/**
 * @typedef {(
 *   | { type: "text", value: string }
 *   | { type: "code", value: string }
 *   | { type: "strong", value: string }
 *   | { type: "em", value: string }
 *   | { type: "link", text: string, href: string }
 * )} InlineToken
 */

const TOKEN =
  /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s]+)/;
const TRAILING_PUNCT = /[.,;:!?)\]}>"'»]+$/;

/**
 * Tokenize one line of inline markdown into a flat descriptor list.
 * @param {string} text
 * @returns {InlineToken[]}
 */
export function tokenizeInline(text) {
  /** @type {InlineToken[]} */
  const out = [];
  let rest = String(text);
  while (rest.length) {
    const m = rest.match(TOKEN);
    if (!m) {
      out.push({ type: "text", value: rest });
      break;
    }
    if (m.index > 0) out.push({ type: "text", value: rest.slice(0, m.index) });
    const tok = m[0];
    let consumed = tok.length;
    if (tok.startsWith("`")) {
      out.push({ type: "code", value: tok.slice(1, -1) });
    } else if (tok.startsWith("**")) {
      out.push({ type: "strong", value: tok.slice(2, -2) });
    } else if (tok.startsWith("*")) {
      out.push({ type: "em", value: tok.slice(1, -1) });
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      out.push({ type: "link", text: mm[1], href: mm[2] });
    } else {
      // Bare http(s) URL: trim a trailing run of sentence punctuation back to
      // plain text, so "see https://x/y." links https://x/y and keeps the period.
      const url = tok.replace(TRAILING_PUNCT, "") || tok;
      out.push({ type: "link", text: url, href: url });
      consumed = url.length;
    }
    rest = rest.slice(m.index + consumed);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS. All `tokenizeInline:` tests pass, and the existing core and react suites still pass (no failures, no `not ok` lines).

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/renderers/markdownInline.js packages/react/test/markdown.test.js
git commit -m "feat(react): pure inline markdown tokenizer with bare-URL autolink (#84)"
```

---

### Task 2: Wire `Markdown.jsx` to the tokenizer

Replace the inline matching loop in `Markdown.jsx` with a call to `tokenizeInline`, rendering each descriptor. Behavior for code, bold, italic, and explicit links (including the unsafe-href fallback) is preserved exactly; bare URLs now render as anchors.

**Files:**
- Modify: `packages/react/src/renderers/Markdown.jsx` (remove the module-level `TOKEN` const and the body of `inline`; add the import and the descriptor-rendering `inline`).

**Interfaces:**
- Consumes: `tokenizeInline` from `./markdownInline.js` (Task 1).

- [ ] **Step 1: Replace the import line and remove the old `TOKEN` const**

In `packages/react/src/renderers/Markdown.jsx`, change the top of the file. Replace:

```jsx
import React from "react";

/*
 * Minimal markdown subset renderer. React elements only, no innerHTML.
 * Subset: ATX headings, paragraphs, unordered and ordered lists,
 * blockquotes, fenced code, horizontal rules, GFM pipe tables, inline
 * code/bold/italic/links. Link hrefs are whitelisted to http(s),
 * mailto, and fragment; anything else renders as plain text.
 */

const TOKEN = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]]+\]\([^)\s]+\))/;
```

with:

```jsx
import React from "react";
import { tokenizeInline } from "./markdownInline.js";

/*
 * Minimal markdown subset renderer. React elements only, no innerHTML.
 * Subset: ATX headings, paragraphs, unordered and ordered lists,
 * blockquotes, fenced code, horizontal rules, GFM pipe tables, inline
 * code/bold/italic/links, and bare http(s) URL autolinks. Link hrefs are
 * whitelisted to http(s), mailto, and fragment; anything else renders as
 * plain text. The inline tokenizer lives in markdownInline.js.
 */
```

- [ ] **Step 2: Replace the `inline` function body**

Replace the whole `inline` function (the `function inline(text) { ... }` block) with:

```jsx
function inline(text) {
  return tokenizeInline(text).map((t, i) => {
    if (t.type === "code") return <code key={i}>{t.value}</code>;
    if (t.type === "strong") return <strong key={i}>{t.value}</strong>;
    if (t.type === "em") return <em key={i}>{t.value}</em>;
    if (t.type === "link") {
      const safe = /^(https?:|mailto:|#)/i.test(t.href);
      return safe ? (
        <a key={i} href={t.href} target="_blank" rel="noreferrer">
          {t.text}
        </a>
      ) : (
        `${t.text} (${t.href})`
      );
    }
    return t.value;
  });
}
```

- [ ] **Step 3: JSX syntax check**

Run:
```bash
npx esbuild packages/react/src/renderers/Markdown.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```
Expected: exits 0 with no output (no syntax error).

- [ ] **Step 4: Run the test suite (regression)**

Run: `npm test`
Expected: PASS. The Task 1 suite and the existing core/react suites all pass.

- [ ] **Step 5: Build the demo (integration gate)**

Run: `npm run build -w examples/demo`
Expected: Vite build completes successfully (`built in ...`), no error.

- [ ] **Step 6: Regenerate the declaration files**

Run: `npm run types`
Expected: exits 0; `tsc` emits `.d.ts` into `packages/*/types` with no type errors. (The `.d.ts` are gitignored, so nothing new should appear in `git status`; the gate is a clean exit.)

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/renderers/Markdown.jsx
git commit -m "feat(react): render bare URLs as autolinks in the markdown renderer (#84)"
```

---

### Task 3: Manual render verification

Confirm the rendered output in the demo, since no DOM test runs in this repo.

**Files:** none (verification only).

- [ ] **Step 1: Render an artifact with mixed inline content**

Run the demo (`npm run dev -w examples/demo`) and view a markdown output containing: a bare `https://` URL in prose, a sentence-final URL, a URL inside an inline code span, and an existing `[text](url)` link.

Expected:
- the bare URL and the sentence-final URL are clickable anchors opening in a new tab, and the sentence-final period is outside the link,
- the code-span URL stays literal monospace text (not a link),
- the explicit link is unchanged.

- [ ] **Step 2: Confirm the full gate set is green**

Run, and confirm each passes:
```bash
npm test
npm run build -w examples/demo
npm run types
```
Expected: all three exit 0.

---

## Notes for step 10 (not part of implementation)

- Before the code-review loop, drop this plan in a single commit:
  `git rm docs/plans/84-markdown-autolink-bare-urls.md` with subject
  `chore: drop plan before merge, code is the source of truth`.
- The squash-merge subject is a descriptive imperative plus the trailing `(#84)`.
