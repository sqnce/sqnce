# Reading-mode document font token (`--sqnce-font-read`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional reading-mode document font token, `--sqnce-font-read`, that defaults to the interface font and is applied to the reading-mode plain document body classes only, so a consumer can set the deliverable's typeface independently of the interface chrome.

**Architecture:** Pure CSS custom-property work plus one public-token-list constant, all in `@sqnce/react`. A private `--sqnce-_font-read` reads a public override and falls back to the private interface-font token (mirroring the shipped `ink-read` indirection), so default rendering is byte-identical. The eight reading-mode plain document classes switch from inheriting `font-ui` to reading the new private token. No engine change, no new dependency, no public component-prop change.

**Tech Stack:** Plain ESM JavaScript, React (`@sqnce/react`), CSS-in-JS template string in `ProcessRolodex.jsx`, Node's built-in test runner (`node:test`).

## Global Constraints

- Never use em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere.
- Keep `@sqnce/core` dependency-free and untouched; this work is entirely in `@sqnce/react`.
- Additive and backward-compatible: with no consumer override, reading mode must render byte-identically to today (the default resolves to `--sqnce-_font-ui`).
- The new private token line is exactly: `--sqnce-_font-read: var(--sqnce-font-read, var(--sqnce-_font-ui));`
- Apply `font-family: var(--sqnce-_font-read);` to the reading-mode plain document classes only. Do not touch the mono labels (`.pf-read-status`, `.pf-read-out-label`), the contents rail, the nav buttons, the authoring deck, or renderer-backed outputs.
- Repo gates that must pass: `npm test`, `npm run build -w examples/demo`, `npm run types`.

---

### Task 1: Add `font-read` to the public token list

**Files:**
- Modify: `packages/react/src/themeTokens.js:18`
- Test: `packages/react/test/themeTokens.test.js`

**Interfaces:**
- Consumes: `THEME_TOKENS` (exported string array of public token names without the `--sqnce-` prefix) and `readThemeVars(getProp)` (returns only the public tokens a consumer set), both from `packages/react/src/themeTokens.js`.
- Produces: `"font-read"` present in `THEME_TOKENS`, so `readThemeVars` surfaces a consumer `--sqnce-font-read` override and `ThemeScope` mirrors it onto body-portaled overlays. This satisfies acceptance criterion 3.

- [ ] **Step 1: Write the failing tests**

Append to `packages/react/test/themeTokens.test.js` (after the existing `THEME_TOKENS` test, before the final closing line):

```javascript
test("THEME_TOKENS includes the reading-mode document font token", () => {
  assert.ok(THEME_TOKENS.includes("font-read"));
});

test("readThemeVars mirrors a set --sqnce-font-read override", () => {
  const set = { "--sqnce-font-read": "Georgia, 'Times New Roman', serif" };
  const vars = readThemeVars((name) => set[name] ?? "");
  assert.equal(vars["--sqnce-font-read"], "Georgia, 'Times New Roman', serif");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (run unpiped, so the exit status is the test runner's and is not masked by a pipe)
Expected: FAIL, the runner exits non-zero and reports a failing "THEME_TOKENS includes the reading-mode document font token" assertion, because `font-read` is not yet in `THEME_TOKENS`.

- [ ] **Step 3: Add the token name**

In `packages/react/src/themeTokens.js`, change line 18 from:

```javascript
  "font-ui", "font-mono", "size-title", "size-body",
```

to:

```javascript
  "font-ui", "font-mono", "font-read", "size-title", "size-body",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (unpiped, so a failure surfaces as a non-zero exit rather than being masked by a pipe)
Expected: PASS, the summary reports `tests 222` and `fail 0` (2 more than the 220 baseline).

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/themeTokens.js packages/react/test/themeTokens.test.js
git commit -m "feat(react): surface font-read in the public token list (#97)"
```

---

### Task 2: Declare the private token and apply it to the reading-mode document classes

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (token block near line 1122; reading-mode CSS rules at lines 1547, 1553, 1555, 1556, 1559, 1560, 1561, 1565)

**Interfaces:**
- Consumes: `--sqnce-_font-ui` (the private interface-font default, declared in the shared `.pf-root, .pf-root-tokens` block) and the public `--sqnce-font-read` (a consumer override, optional).
- Produces: `--sqnce-_font-read` resolving to the consumer's serif when set, else to `--sqnce-_font-ui`; the eight reading-mode plain document classes render in it. This satisfies acceptance criteria 1 and 2.

Note on testing: this is CSS custom-property cascade, which the repo's pure `node:test` suite cannot exercise (there is no computed-style or jsdom-CSS harness, and no existing test inspects the `ProcessRolodex` CSS template string). Verification is therefore the full suite staying green, a JSX syntax check, the demo build, and a diff review confirming exactly the eight classes change and the exclusions are untouched. This matches how the shipped `ink-read`/`font-mono` tokens were verified.

- [ ] **Step 1: Declare the private token**

In `packages/react/src/ProcessRolodex.jsx`, immediately after the mono-font line (currently line 1122):

```css
  --sqnce-_font-mono: var(--sqnce-font-mono, 'IBM Plex Mono', monospace);
```

add:

```css
  --sqnce-_font-read: var(--sqnce-font-read, var(--sqnce-_font-ui));
```

- [ ] **Step 2: Apply the token to the eight plain document classes**

Make these eight exact edits in `packages/react/src/ProcessRolodex.jsx`, adding `font-family: var(--sqnce-_font-read); ` as the first declaration in each rule (mirroring how the mono label rules lead with `font-family`):

1. `.pf-read-title` (line 1547):
   - From: `.pf-read-title { font-size: 22px; margin: 0; color: var(--sqnce-_ink-strong); }`
   - To: `.pf-read-title { font-family: var(--sqnce-_font-read); font-size: 22px; margin: 0; color: var(--sqnce-_ink-strong); }`

2. `.pf-read-stage` (line 1553):
   - From: `.pf-read-stage { font-size: 18px; color: var(--sqnce-_ink-strong); margin: 4px 0 12px; }`
   - To: `.pf-read-stage { font-family: var(--sqnce-_font-read); font-size: 18px; color: var(--sqnce-_ink-strong); margin: 4px 0 12px; }`

3. `.pf-read-sub-name` (line 1555):
   - From: `.pf-read-sub-name { font-size: 15px; color: var(--sqnce-_ink-read); margin: 0 0 4px; }`
   - To: `.pf-read-sub-name { font-family: var(--sqnce-_font-read); font-size: 15px; color: var(--sqnce-_ink-read); margin: 0 0 4px; }`

4. `.pf-read-sub-desc` (line 1556):
   - From: `.pf-read-sub-desc { color: var(--sqnce-_ink-muted-light); margin: 0 0 10px; }`
   - To: `.pf-read-sub-desc { font-family: var(--sqnce-_font-read); color: var(--sqnce-_ink-muted-light); margin: 0 0 10px; }`

5. `.pf-read-text` (line 1559):
   - From: `.pf-read-text { white-space: pre-wrap; line-height: 1.55; color: var(--sqnce-_ink-faint-light); margin: 0; }`
   - To: `.pf-read-text { font-family: var(--sqnce-_font-read); white-space: pre-wrap; line-height: 1.55; color: var(--sqnce-_ink-faint-light); margin: 0; }`

6. `.pf-read-link` (line 1560):
   - From: `.pf-read-link { color: var(--sqnce-_link); word-break: break-all; }`
   - To: `.pf-read-link { font-family: var(--sqnce-_font-read); color: var(--sqnce-_link); word-break: break-all; }`

7. `.pf-read-fields` (line 1561):
   - From: `.pf-read-fields { margin: 0; display: grid; gap: var(--sqnce-_space-2); }`
   - To: `.pf-read-fields { font-family: var(--sqnce-_font-read); margin: 0; display: grid; gap: var(--sqnce-_space-2); }`

8. `.pf-read-file` (line 1565):
   - From: `.pf-read-file { font-size: 13px; color: var(--sqnce-_ink-read); margin-bottom: 4px; }`
   - To: `.pf-read-file { font-family: var(--sqnce-_font-read); font-size: 13px; color: var(--sqnce-_ink-read); margin-bottom: 4px; }`

- [ ] **Step 3: Verify the diff touches exactly the intended lines**

Run: `git diff -- packages/react/src/ProcessRolodex.jsx`
Expected: exactly nine changed lines: one added `--sqnce-_font-read` declaration, and `font-family: var(--sqnce-_font-read);` prepended to the eight classes above. Confirm `.pf-read-status`, `.pf-read-out-label`, `.pf-read-toc`, `.pf-read-rail`, `.pf-read-navbtn`, `.pf-read-edit`, and `.pf-read-field dt`/`dd` are NOT in the diff (the field `dt`/`dd` inherit `font-family` from `.pf-read-fields`).

- [ ] **Step 4: JSX syntax check**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`
Expected: no output, exit 0 (the file still parses and bundles).

- [ ] **Step 5: Run the gates**

Run each gate unpiped, so a failing command surfaces as a non-zero exit rather than being masked by a pipe to `tail`:

Run: `npm test`
Expected: PASS, the summary reports `tests 222` and `fail 0` (the CSS change does not affect the suite; it stays green).

Run: `npm run build -w examples/demo`
Expected: a successful Vite build (exits 0, emits the demo bundle).

Run: `npm run types`
Expected: type generation succeeds with no error (no exported signature changed). If `tsc` is not installed locally, confirm the diff touches no exported signature and note that CI runs the authoritative check.

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): reading-mode document font token, applied to the document body (#97)"
```

---

## Self-Review

**Spec coverage:**
- AC1 (no-override byte-identical): Task 2, Step 1 declares the token with the `font-ui` fallback; Steps 3-5 verify nothing else changed and the suite/build stay green.
- AC2 (override renders the document body in the serif, chrome stays `font-ui`): Task 2, Step 2 applies the token to the eight document classes only; Step 3 confirms the exclusions are untouched.
- AC3 (`font-read` in `THEME_TOKENS`): Task 1, Steps 1-4.
- Non-goals (renderer/markdown prose, sizes/spacing, mono token, new component prop): nothing in either task touches those.

**Placeholder scan:** no TBD/TODO; every code and CSS edit is shown verbatim with exact before/after; every command has an expected result.

**Type consistency:** the only identifiers are the existing `THEME_TOKENS` and `readThemeVars` exports (used as defined) and CSS custom-property names (`--sqnce-font-read`, `--sqnce-_font-read`, `--sqnce-_font-ui`), used consistently across both tasks.

**Commit-count note:** the baseline suite is 220 tests; Task 1 adds 2 (to 222); Task 2 adds none. The expected counts above reflect that.
