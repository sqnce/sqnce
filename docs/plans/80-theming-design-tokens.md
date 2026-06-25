# Theming via design tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the `@sqnce/react` shell's palette, type, spacing, and motion from `--sqnce-*` CSS custom properties with accessible defaults, so a consumer reskins by overriding tokens on `.pf-root` or any ancestor with no fork.

**Architecture:** All shell styles live in one CSS template literal (the `CSS` constant in `packages/react/src/ProcessRolodex.jsx`, injected once via `<style>{CSS}</style>`). We declare a public `--sqnce-*` vocabulary, supply each default through a private indirection (`.pf-root` declares `--sqnce-_x: var(--sqnce-x, <default>)`; the CSS reads `var(--sqnce-_x)`), and convert the hardcoded values to those private tokens. Body-portaled overlays keep their `document.body` mount and receive the token scope plus the live `.pf-root` overrides through a small propagation wrapper that is established before any CSS is tokenized, so every intermediate commit renders correctly. No `@sqnce/core` change.

**Tech Stack:** Plain ESM JavaScript + React 18, no build step in core, CSS custom properties, Node's built-in test runner for the existing helper tests, the demo app build (`examples/demo`) for visual verification.

## Global Constraints

Copied verbatim from `docs/specs/80-theming-design-tokens.md` and `CLAUDE.md`; every task implicitly includes these.

- No `@sqnce/core` change; new work stays in `@sqnce/react`.
- Public tokens are namespaced `--sqnce-*`; the private indirection tokens are `--sqnce-_*`. The shell never assigns a public `--sqnce-*` token on `.pf-root`; it only reads `var(--sqnce-public, <default>)` into a private token.
- Default rendering is visually unchanged from today, apart from the text-color adjustments the contrast audit requires (every default text color that fails WCAG AA on its surface) and the visible status cues the accessibility task adds. Those are the only intentional visual changes; accessibility takes precedence over byte-identical preservation.
- WCAG AA targets: 4.5:1 for body text, 3:1 for large text, each color measured against the surface it actually renders on.
- Every status conveys meaning with a visible cue (a word, glyph, or shape), not color alone; aria-labels are added on top, never as the only fix.
- Reduced-motion: any token-driven motion honors `prefers-reduced-motion`.
- Node's test runner cannot import `.jsx` (no loader); pure logic that needs a unit test lives in a `.js` module, matching the existing helper tests (`badge.js`, `runStatus.js`).
- No em dashes anywhere (code, comments, docs, commit messages). Brand is lowercase `sqnce`. License Apache-2.0.
- Per-PR gates: `npm test`, `npm run build -w examples/demo`, `npm run types` (all must pass; CI re-runs them).

---

## File Structure

- Modify: `packages/react/src/ProcessRolodex.jsx`: the `CSS` constant (token block + conversions), the rail render (`~566-585`), the step-dot button (`~786-810`), and the navigation pips (`~988-996`).
- Modify: `packages/react/src/OutputView.jsx`: the `Overlay` portal (`17-39`), wrap portal content in the token scope.
- Modify: `packages/react/src/OverviewModal.jsx`: the `createPortal(..., document.body)` (`~36-129`), same token-scope wrap.
- Create: `packages/react/src/themeTokens.js`: a pure, Node-loadable module exporting `THEME_TOKENS` (public token names) and `readThemeVars(getProp)`. No React, no JSX, so `npm test` can import it.
- Create: `packages/react/src/themeScope.jsx`: the `ThemeScope` React component (imports from `themeTokens.js`) that wraps portal content, gets the private-token defaults and base font/ink from the `.pf-root-tokens` class, and mirrors live `.pf-root` overrides.
- Create: `packages/react/test/themeTokens.test.js`: unit tests for the pure mapping logic.
- Reference only (read, do not edit): `docs/specs/80-theming-design-tokens.md`, `docs/spikes/80-theming-design-tokens.md`.

---

## Token vocabulary (the design decision Tasks 1 implements)

The private-token block declared once on `.pf-root, .pf-root-tokens`. Each line is `--sqnce-_<name>: var(--sqnce-<name>, <current default>);`. The defaults are today's literals, so default rendering is unchanged; Task 6 then changes only the failing-contrast defaults. Every distinct hex in the `CSS` constant (49 of them) maps to exactly one token or to the deferred list below; no literal is left unaccounted for.

**Surfaces:** `app-top #222932`, `app-bottom #1B2129`, `paper #F1EEE3`, `card #FAF8F0`, `card-done #F2F8F3`, `input #FFFFFF`, `input-readonly #F3F1E8`, `panel-dark #23282F`, `raised #3A434E`, `locked #3A3F46`, `subtle #EFEBDD`, `hover-paper #E7E2D4`.

**Ink:** `ink-strong #23282F`, `ink-on-dark #EDEAE0`, `ink-on-dark-2 #C9CDD3`, `ink-muted-dark #8A919B` (muted text on the dark chrome, passes today), `ink-muted-on-card #8A8E96` (every `#8A8E96` use, all on light surfaces: step state, gate state, chev, runs-archived, render-loading, card-eyebrow, overview gate), `ink-muted-light #6B6F76`, `ink-muted-light-2 #5C6068` (secondary text on light: card-desc, filechip, badge), `ink-faint-on-card #9A9EA6` (empty-file / json-meta), `ink-faint-light #2A2F36` (reading body), `ink-label-dark #5E6772` (dark-chrome labels), `ink-label-light #5E6772` (the same value where it sits on light surfaces: overview modal and reading TOC, where it already passes and so is NOT changed by Task 6), `link #2F6F8F` (reading link).

**Accent:** `accent #D9A441`, `accent-hover #E5B458`, `accent-ink #7A6A3C`.

**Status:** `done #2E8F62`, `done-tint #6FBF95`, `done-bg #F2F8F3`, `draft #D9A441`, `draft-bg #F4DFAE`, `danger #C9542D`, `danger-soft #E08A6D`, `danger-strong #B3402A`, `accept-ink #2E6E3F`, `accept-bg #DDEFE0`, `revise-ink #8F4E2E`, `revise-bg #F4DFAE`, `complete #2E8F62`.

**Pips:** `pip #4A535E`, `pip-locked #343C45`.

**Borders:** `border-paper #D8D3C2`, `border-card #DCD7C7`, `border-soft #C9C3B0`, `border-dot #B6BAC1`.

**Typography:** `font-ui 'IBM Plex Sans', system-ui, sans-serif`, `font-mono 'IBM Plex Mono', monospace`, `size-title 26px`, `size-body 13.5px`, `size-label 10.5px`.

**Spacing and density (exact current values, so the look is unchanged and a consumer can tighten or loosen density by overriding them):** `space-1 4px`, `space-2 6px`, `space-3 8px`, `space-4 10px`, `space-5 12px`, `space-6 16px`, `space-7 20px`, `pad-section 28px`.

**Radius:** `radius-card 10px`, `radius-control 8px`, `radius-sm 6px`.

**Motion:** `motion-card 0.45s cubic-bezier(.3,.9,.3,1)` (the card transform and width), `motion-fade 0.45s` (the card opacity leg, kept separate so it preserves the current default ease), `motion-spin 0.8s`.

**Deferred to later per-renderer tokenization (stay literal this issue, per spec "deeper per-renderer tokenization can follow"):** the JSON-tree syntax colors (`.pf-jt-key #7A6A3C`, `.pf-jt-string #2E6E8F`, `.pf-jt-number #8F4E2E`, `.pf-jt-boolean/.pf-jt-null #6B4E8F`); the done-card border `#BCD9C9`; the decorative tint backgrounds `.pf-archived #3A3424`/`#EDD9A8`, `.pf-side-status`/`.pf-chip #F1E8CE`, `.pf-cards-active #FBF3DD`, `.pf-ta-generated #FCF7E9`, `.pf-gen-invite #FCFBF5`, `.pf-gen-badge #F4DFAE`; and the `rgba()` shadow and lock overlays. None of the deferred colors is a contrast-failing body-text color (Task 6). Three deferred literals share a value with a semantic token (`#7A6A3C` = accent-ink, `#8F4E2E` = revise-ink, `#F4DFAE` = draft-bg/revise-bg), so Tasks 3 and 4 tokenize every non-deferred use of those values and the Task 4 completion check asserts each remaining occurrence is its single deferred rule (`.pf-jt-key`, `.pf-jt-number`, `.pf-gen-badge`).

## Split-color assignments (resolve the ambiguous mappings)

`#5E6772` is used as text on both a dark and a light surface, and Task 6 lightens its dark default, so it maps to two tokens by surface (not by value). Task 3 converts the chrome occurrences, Task 4 the light ones:

- `#5E6772` text on the dark chrome maps to `--sqnce-_ink-label-dark` (`.pf-rail-ahead`, `.pf-switch-label`, `.pf-side-label`, `.pf-side-menu-btn`, `.pf-legend`); on light surfaces it maps to `--sqnce-_ink-label-light` (`.pf-ov-short`, `.pf-ov-progress`, `.pf-ov-status`, `.pf-ov-sub-desc`, `.pf-read-toc`). The two hover border-colors that use `#5E6772` (`.pf-reset:hover`, `.pf-side-toggle:hover`) are on dark chrome and map to `--sqnce-_ink-label-dark`.

The green has two literals, mapped by value (no surface split): every `#2E8F62` use maps to `--sqnce-_done` (the `.pf-dot-done` and `.pf-rail-done .pf-rail-circle` fills, the `.pf-dot-btn:hover` color, and the on-light text `.pf-step-done .pf-step-state` and `.pf-gate-met`, which all sit on the light card or paper); the read-status complete tone `#2E8F62` maps to `--sqnce-_complete`; and the `.pf-rail-done` stage text `#6FBF95` (the only green text on the dark rail) maps to `--sqnce-_done-tint`. `#8A8E96` is no longer split: the card foot is part of `.pf-card` (paper), so `.pf-gate-state` is on a light surface like the others, and every `#8A8E96` maps to `--sqnce-_ink-muted-on-card`.

`#8A919B` is used as text on both surfaces: on the dark chrome (subject, switch button, reset, side title/toggle/count/new, gate hint, counter) it stays `--sqnce-_ink-muted-dark` (it already passes on dark); on the light card foot (`.pf-override`, `.pf-skip-btn`) it maps to `--sqnce-_ink-muted-on-card`, which Task 6 darkens to pass on paper.

`#D9A441` as text is gold and reads only on dark or on a fill: its on-dark and on-fill text uses stay `--sqnce-_accent` (`.pf-brand-mark`, `.pf-card-count`, `.pf-rail-active` text, and the gold hover highlights over dark chrome). Its three light-surface text uses fail badly as gold on paper and map to `--sqnce-_accent-ink` instead: `.pf-gate-forced` and `.pf-ov-forced` (the forced-advance labels), and the `.pf-override:hover`/`.pf-skip-btn:hover` text (so the hover highlight stays legible on the light card foot). The non-text `#D9A441` uses (borders, backgrounds, box-shadows) map to `--sqnce-_accent` as usual.

Task 6 lightens `ink-label-dark` for the dark surface; `ink-label-light` and `done-tint` keep their value (they already pass); and `ink-muted-on-card`, `ink-muted-light`, `ink-faint-on-card`, `ink-muted-light-2`, `accent-ink`, `danger`, `done`, and `complete` are darkened for their light surfaces (darkening `done` also makes the white and off-white text on the green fills pass), so nothing regresses.

---

### Task 1: Declare the token layer on `.pf-root` and the portal-scope class

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (the `.pf-root` rule, `1035-1043`)

**Interfaces:**
- Produces: the `--sqnce-_*` private tokens, declared on both `.pf-root` and `.pf-root-tokens`; the `.pf-root-tokens` class (used by Task 2's `ThemeScope`) carries the same private defaults plus the base font and ink.

- [ ] **Step 1: Replace `.pf-root` with the shared token block plus the layout and scope rules**

```css
.pf-root, .pf-root-tokens {
  /* sqnce design tokens: a consumer overrides the public --sqnce-* on .pf-root
     or any ancestor; the shell reads the private --sqnce-_* indirection so an
     ancestor override is never shadowed by a value on .pf-root itself. The
     block is shared with .pf-root-tokens, which Task 2 puts on body-portaled
     overlays so they carry the same defaults. */
  --sqnce-_app-top: var(--sqnce-app-top, #222932);
  --sqnce-_app-bottom: var(--sqnce-app-bottom, #1B2129);
  --sqnce-_paper: var(--sqnce-paper, #F1EEE3);
  --sqnce-_card: var(--sqnce-card, #FAF8F0);
  --sqnce-_card-done: var(--sqnce-card-done, #F2F8F3);
  --sqnce-_input: var(--sqnce-input, #FFFFFF);
  --sqnce-_input-readonly: var(--sqnce-input-readonly, #F3F1E8);
  --sqnce-_panel-dark: var(--sqnce-panel-dark, #23282F);
  --sqnce-_raised: var(--sqnce-raised, #3A434E);
  --sqnce-_locked: var(--sqnce-locked, #3A3F46);
  --sqnce-_subtle: var(--sqnce-subtle, #EFEBDD);
  --sqnce-_hover-paper: var(--sqnce-hover-paper, #E7E2D4);
  --sqnce-_ink-strong: var(--sqnce-ink-strong, #23282F);
  --sqnce-_ink-on-dark: var(--sqnce-ink-on-dark, #EDEAE0);
  --sqnce-_ink-on-dark-2: var(--sqnce-ink-on-dark-2, #C9CDD3);
  --sqnce-_ink-muted-dark: var(--sqnce-ink-muted-dark, #8A919B);
  --sqnce-_ink-muted-on-card: var(--sqnce-ink-muted-on-card, #8A8E96);
  --sqnce-_ink-muted-light: var(--sqnce-ink-muted-light, #6B6F76);
  --sqnce-_ink-muted-light-2: var(--sqnce-ink-muted-light-2, #5C6068);
  --sqnce-_ink-faint-on-card: var(--sqnce-ink-faint-on-card, #9A9EA6);
  --sqnce-_ink-faint-light: var(--sqnce-ink-faint-light, #2A2F36);
  --sqnce-_ink-label-dark: var(--sqnce-ink-label-dark, #5E6772);
  --sqnce-_ink-label-light: var(--sqnce-ink-label-light, #5E6772);
  --sqnce-_link: var(--sqnce-link, #2F6F8F);
  --sqnce-_accent: var(--sqnce-accent, #D9A441);
  --sqnce-_accent-hover: var(--sqnce-accent-hover, #E5B458);
  --sqnce-_accent-ink: var(--sqnce-accent-ink, #7A6A3C);
  --sqnce-_done: var(--sqnce-done, #2E8F62);
  --sqnce-_done-tint: var(--sqnce-done-tint, #6FBF95);
  --sqnce-_done-bg: var(--sqnce-done-bg, #F2F8F3);
  --sqnce-_draft: var(--sqnce-draft, #D9A441);
  --sqnce-_draft-bg: var(--sqnce-draft-bg, #F4DFAE);
  --sqnce-_danger: var(--sqnce-danger, #C9542D);
  --sqnce-_danger-soft: var(--sqnce-danger-soft, #E08A6D);
  --sqnce-_danger-strong: var(--sqnce-danger-strong, #B3402A);
  --sqnce-_accept-ink: var(--sqnce-accept-ink, #2E6E3F);
  --sqnce-_accept-bg: var(--sqnce-accept-bg, #DDEFE0);
  --sqnce-_revise-ink: var(--sqnce-revise-ink, #8F4E2E);
  --sqnce-_revise-bg: var(--sqnce-revise-bg, #F4DFAE);
  --sqnce-_complete: var(--sqnce-complete, #2E8F62);
  --sqnce-_pip: var(--sqnce-pip, #4A535E);
  --sqnce-_pip-locked: var(--sqnce-pip-locked, #343C45);
  --sqnce-_border-paper: var(--sqnce-border-paper, #D8D3C2);
  --sqnce-_border-card: var(--sqnce-border-card, #DCD7C7);
  --sqnce-_border-soft: var(--sqnce-border-soft, #C9C3B0);
  --sqnce-_border-dot: var(--sqnce-border-dot, #B6BAC1);
  --sqnce-_font-ui: var(--sqnce-font-ui, 'IBM Plex Sans', system-ui, sans-serif);
  --sqnce-_font-mono: var(--sqnce-font-mono, 'IBM Plex Mono', monospace);
  --sqnce-_size-title: var(--sqnce-size-title, 26px);
  --sqnce-_size-body: var(--sqnce-size-body, 13.5px);
  --sqnce-_size-label: var(--sqnce-size-label, 10.5px);
  --sqnce-_space-1: var(--sqnce-space-1, 4px);
  --sqnce-_space-2: var(--sqnce-space-2, 6px);
  --sqnce-_space-3: var(--sqnce-space-3, 8px);
  --sqnce-_space-4: var(--sqnce-space-4, 10px);
  --sqnce-_space-5: var(--sqnce-space-5, 12px);
  --sqnce-_space-6: var(--sqnce-space-6, 16px);
  --sqnce-_space-7: var(--sqnce-space-7, 20px);
  --sqnce-_pad-section: var(--sqnce-pad-section, 28px);
  --sqnce-_radius-card: var(--sqnce-radius-card, 10px);
  --sqnce-_radius-control: var(--sqnce-radius-control, 8px);
  --sqnce-_radius-sm: var(--sqnce-radius-sm, 6px);
  --sqnce-_motion-card: var(--sqnce-motion-card, 0.45s cubic-bezier(.3,.9,.3,1));
  --sqnce-_motion-fade: var(--sqnce-motion-fade, 0.45s);
  --sqnce-_motion-spin: var(--sqnce-motion-spin, 0.8s);
}
.pf-root {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--sqnce-_app-top) 0%, var(--sqnce-_app-bottom) 100%);
  font-family: var(--sqnce-_font-ui);
  color: var(--sqnce-_ink-strong);
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}
.pf-root-tokens { font-family: var(--sqnce-_font-ui); color: var(--sqnce-_ink-strong); }
```

- [ ] **Step 2: Verify the build compiles and tests pass**

Run: `npm test` -> PASS (existing tests; no new ones yet).
Run: `npm run build -w examples/demo` -> build completes.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): declare --sqnce-* token layer and portal-scope class (#80)"
```

---

### Task 2: Establish the portal token scope (before any CSS is tokenized)

This task runs before the conversions so that body-portaled content (the renderer-expand overlay and the overview modal, and any renderer surface shown inside them) always resolves the private tokens. Until `ThemeScope` exists, a `var(--sqnce-_*)` inside a body portal would not resolve.

**Files:**
- Create: `packages/react/src/themeTokens.js`, `packages/react/src/themeScope.jsx`, `packages/react/test/themeTokens.test.js`
- Modify: `packages/react/src/ProcessRolodex.jsx` (ref the `.pf-root` element and provide it via context), `packages/react/src/OutputView.jsx`, `packages/react/src/OverviewModal.jsx`

**Interfaces:**
- Produces: `THEME_TOKENS` (string[], public names without `--sqnce-`), `readThemeVars(getProp)` (pure), `ThemeRootContext` (React context carrying a ref to the owning `.pf-root` element), `ThemeScope` (wraps portal children, reads its owning root from `ThemeRootContext`).

- [ ] **Step 1: Write the failing test for the pure mapping**

`packages/react/test/themeTokens.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { THEME_TOKENS, readThemeVars } from "../src/themeTokens.js";

test("readThemeVars mirrors only the public tokens a consumer set", () => {
  const set = { "--sqnce-accent": "rgb(0, 0, 255)", "--sqnce-paper": "" };
  const vars = readThemeVars((name) => set[name] ?? "");
  assert.equal(vars["--sqnce-accent"], "rgb(0, 0, 255)");
  assert.ok(!("--sqnce-paper" in vars), "an empty token is not mirrored");
});

test("THEME_TOKENS lists public token names without the --sqnce- prefix", () => {
  assert.ok(THEME_TOKENS.includes("accent"));
  assert.ok(THEME_TOKENS.every((n) => !n.startsWith("--")));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` -> FAIL, "Cannot find module '../src/themeTokens.js'".

- [ ] **Step 3: Implement the pure module `themeTokens.js`** (the `THEME_TOKENS` array lists every public token name from the vocabulary, same names without the leading `_`)

```js
/* Public token names (without the --sqnce- prefix), in sync with the .pf-root
   token block. A body-portaled overlay is not a DOM descendant of .pf-root, so
   it cannot inherit these; ThemeScope re-declares the private defaults (via the
   .pf-root-tokens class) and mirrors any live consumer override. Pure and
   dependency-free so Node's test runner can import it. */
export const THEME_TOKENS = [
  "app-top","app-bottom","paper","card","card-done","input","input-readonly",
  "panel-dark","raised","locked","subtle","hover-paper","ink-strong","ink-on-dark",
  "ink-on-dark-2","ink-muted-dark","ink-muted-on-card",
  "ink-muted-light","ink-muted-light-2","ink-faint-on-card","ink-faint-light",
  "ink-label-dark","ink-label-light","link","accent","accent-hover","accent-ink",
  "done","done-tint","done-bg","draft","draft-bg","danger","danger-soft","danger-strong",
  "accept-ink","accept-bg","revise-ink","revise-bg","complete","pip","pip-locked",
  "border-paper","border-card","border-soft","border-dot","font-ui","font-mono",
  "size-title","size-body","size-label","space-1","space-2","space-3","space-4",
  "space-5","space-6","space-7","pad-section","radius-card","radius-control",
  "radius-sm","motion-card","motion-fade","motion-spin",
];

/* Given a reader of resolved custom properties, return only the public tokens
   that actually have a value (a consumer override). Defaults come from the
   .pf-root-tokens class on the scope, not from here. */
export function readThemeVars(getProp) {
  const out = {};
  for (const name of THEME_TOKENS) {
    const v = getProp(`--sqnce-${name}`);
    if (v && v.trim()) out[`--sqnce-${name}`] = v.trim();
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` -> PASS, including the two new tests.

- [ ] **Step 5: Implement `themeScope.jsx`**

`ThemeScope` reads its owning `.pf-root` from `ThemeRootContext` (provided by the owning `ProcessRolodex` in Step 6), so a page with several `ProcessRolodex` instances themes each instance's overlay from its own root rather than always the first one in document order. React context flows through `createPortal`, so the context reaches the portaled `ThemeScope` even though it mounts on `document.body`. The `document.querySelector(".pf-root")` fallback only applies when no provider is present.

```jsx
import React from "react";
import { readThemeVars } from "./themeTokens.js";

/* A ref to the owning .pf-root element, provided by ProcessRolodex so a
   portaled overlay mirrors its own instance's tokens, not another instance's. */
export const ThemeRootContext = React.createContext(null);

/* Wrap body-portaled content so it carries the token scope. .pf-root-tokens
   supplies the private --sqnce-_* defaults and the base font/ink; the inline
   style mirrors live consumer overrides read from the owning .pf-root element,
   so a value set on .pf-root or an ancestor reaches the overlay even though it
   is portaled out to document.body. useLayoutEffect samples before the browser
   paints, so a non-default theme does not flash its defaults first; a
   MutationObserver on the owning root resamples if the consumer changes the
   token inline style or theme class while the overlay is open. */
export function ThemeScope({ children }) {
  const rootRef = React.useContext(ThemeRootContext);
  const [vars, setVars] = React.useState({});
  React.useLayoutEffect(() => {
    const root = (rootRef && rootRef.current) || document.querySelector(".pf-root");
    if (!root) return;
    const sample = () => {
      const cs = getComputedStyle(root);
      setVars(readThemeVars((n) => cs.getPropertyValue(n)));
    };
    sample();
    const obs = new MutationObserver(sample);
    obs.observe(root, { attributes: true, attributeFilter: ["style", "class"] });
    return () => obs.disconnect();
  }, [rootRef]);
  return (
    <div className="pf-root-tokens" style={vars}>
      {children}
    </div>
  );
}
```

(A theme override toggled on a distant ancestor while an overlay is already open is a rare edge case the root-level observer does not catch; the next overlay open resamples it. The overlay is transient, so this is acceptable.)

- [ ] **Step 6: Provide the owning root from `ProcessRolodex`**

In `ProcessRolodex.jsx`, import the context, ref the `.pf-root` element, and wrap the returned tree in the provider so every descendant (including the portaled overlay and modal) resolves this instance's root:

```jsx
import { ThemeRootContext } from "./themeScope.jsx";
// inside the component body:
const pfRootRef = React.useRef(null);
// the outermost returned element is the .pf-root div; add the ref and the provider:
return (
  <ThemeRootContext.Provider value={pfRootRef}>
    <div className="pf-root" ref={pfRootRef}>
      {/* existing children unchanged, including <style>{CSS}</style> */}
    </div>
  </ThemeRootContext.Provider>
);
```

- [ ] **Step 7: Wrap both portals in `ThemeScope`**

In `OutputView.jsx`, add `import { ThemeScope } from "./themeScope.jsx";` and wrap the `createPortal` first argument:

```jsx
  return createPortal(
    <ThemeScope>
      <div className="pf-overlay" role="dialog" aria-modal="true">
        <div className="pf-overlay-head">
          <span className="pf-overlay-title">{label}</span>
          <button className="pf-btn pf-btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="pf-overlay-body">{children}</div>
      </div>
    </ThemeScope>,
    document.body
  );
```

In `OverviewModal.jsx`, add the same import and wrap the element passed as the first `createPortal` argument in `<ThemeScope>...</ThemeScope>`.

- [ ] **Step 8: Verify build and that overlays still render and stay full-screen**

Run: `npm test` -> PASS.
Run: `npm run build -w examples/demo` -> build completes. Manually expand a renderer overlay and open the overview modal; both look identical to `main` (no tokens converted yet, so this only checks the wrapper did not change layout).

- [ ] **Step 9: Commit**

```bash
git add packages/react/src/themeTokens.js packages/react/src/themeScope.jsx packages/react/test/themeTokens.test.js packages/react/src/ProcessRolodex.jsx packages/react/src/OutputView.jsx packages/react/src/OverviewModal.jsx
git commit -m "feat(react): add ThemeScope so body-portaled overlays carry the token scope (#80)"
```

---

### Task 3: Convert the dark chrome to tokens

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (header/brand/subject/rail/switch/reset/archived `1045-1085`, body/side `1087-1134`, runs screen `1136-1158`, nav/pips/legend `1260-1320`, counter/eyebrow `1360-1368`)

**Interfaces:** Consumes the private tokens from Task 1.

- [ ] **Step 1: Replace every color, font, radius, and common spacing literal in the chrome ranges with its token**

Mapping rule: each hex/font/radius literal maps to the `var(--sqnce-_*)` whose default equals it; each recurring gap/padding (4/6/8/10/12/16/20px and the 28px section padding) maps to the matching `--sqnce-_space-*`/`--sqnce-_pad-section`; finer one-off spacing (7/11/14/18/22px, asymmetric paddings) stays literal. The pips use `--sqnce-_pip`/`--sqnce-_pip-locked`; the readonly input uses `--sqnce-_input-readonly`. For the split color `#5E6772`, follow the Split-color assignments above: the dark chrome labels (and the two hover borders) map to `--sqnce-_ink-label-dark`. The one chrome `#8A8E96` use, `.pf-runs-archived td`, maps to `--sqnce-_ink-muted-on-card`; the chrome green `.pf-rail-done` text `#6FBF95` maps to `--sqnce-_done-tint` and its circle fill `#2E8F62` to `--sqnce-_done`. Worked examples:

```css
.pf-header { display: flex; align-items: center; gap: var(--sqnce-_space-7); padding: 18px var(--sqnce-_pad-section) 10px; flex-wrap: wrap; }
.pf-subject { font-family: var(--sqnce-_font-mono); font-size: 12px; color: var(--sqnce-_ink-muted-dark); }
.pf-rail-active { color: var(--sqnce-_accent); } .pf-rail-active .pf-rail-circle { background: var(--sqnce-_accent); border-color: var(--sqnce-_accent); color: var(--sqnce-_ink-strong); }
.pf-rail-done { color: var(--sqnce-_done-tint); } .pf-rail-done .pf-rail-circle { background: var(--sqnce-_done); border-color: var(--sqnce-_done); color: var(--sqnce-_ink-on-dark); }
.pf-rail-ahead { color: var(--sqnce-_ink-label-dark); }
.pf-switch-label { font-family: var(--sqnce-_font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sqnce-_ink-label-dark); min-height: 12px; }
.pf-ta[readonly], .pf-field-input[readonly] { background: var(--sqnce-_input-readonly); color: var(--sqnce-_ink-muted-light); }
.pf-side { width: 232px; flex-shrink: 0; margin: 8px 0 22px 16px; border: 1px solid var(--sqnce-_raised); border-radius: var(--sqnce-_radius-card); padding: 10px; overflow-y: auto; color: var(--sqnce-_ink-on-dark-2); display: flex; flex-direction: column; gap: var(--sqnce-_space-5); }
.pf-nav { display: flex; align-items: flex-start; gap: var(--sqnce-_space-6); padding: 14px var(--sqnce-_pad-section) 22px; }
.pf-pip { width: 9px; height: 9px; border-radius: 50%; background: var(--sqnce-_pip); cursor: pointer; }
.pf-pip-active { background: var(--sqnce-_accent); transform: scale(1.25); }
.pf-pip-locked { background: var(--sqnce-_pip-locked); cursor: default; }
.pf-pip-skipped { background: transparent; border: 1px solid var(--sqnce-_pip); box-sizing: border-box; }
.pf-runs-archived td { color: var(--sqnce-_ink-muted-on-card); }
.pf-legend { font-size: 11px; color: var(--sqnce-_ink-label-dark); margin: 2px 0 0; text-align: center; }
```

- [ ] **Step 2: Verify build and a manual unchanged render**

Run: `npm run build -w examples/demo` -> build completes. Confirm header, rail, sidebar, runs screen, and nav look identical to `main`. (The strict whole-file literal check runs in Task 4, after the deck and renderers convert too.)

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): drive dark chrome from tokens (#80)"
```

---

### Task 4: Convert the deck, cards, steps, renderers, overlay, modal, and reading mode to tokens

The overlay and modal CSS convert here safely because Task 2 already put them inside `.pf-root-tokens`.

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (deck/card `1160-1185`, inputs/steps/dots `1187-1219`, step body/outputs/fields/buttons `1221-1252`, lock/spinner/advance/skip `1254-1320`, render/overlay/json-tree `1322-1348`, kv/table/cards/markdown `1369-1401`, overview modal `1403-1427`, reading mode `1429-1471`)

**Interfaces:** Consumes the private tokens from Task 1.

- [ ] **Step 1: Apply the vocabulary mapping to every non-deferred literal in these ranges**

Tokenize every non-deferred literal, including every `accent-ink` use (`#7A6A3C` in `.pf-out-label`, `.pf-inputs-toggle`, `.pf-gen-manual`, `.pf-render-toggle`, `.pf-kv-key`, `.pf-ov-heading`, `.pf-chip`, `.pf-gen-badge` text) so the only remaining `#7A6A3C` is `.pf-jt-key`, every `revise-ink` use so the only remaining `#8F4E2E` is `.pf-jt-number`, and the `draft-bg` uses so the only remaining `#F4DFAE` is `.pf-gen-badge`. Secondary text `#5C6068` maps to `--sqnce-_ink-muted-light-2`; the reading link maps to `--sqnce-_link`. Follow the Split-color assignments above for this task's occurrences: the `#8A8E96` uses here (`.pf-step-state`, `.pf-gate-state`, `.pf-chev`, `.pf-render-loading`, `.pf-card-eyebrow`, `.pf-ov-gate`) map to `--sqnce-_ink-muted-on-card`; the green `.pf-gate-met` and `.pf-step-done .pf-step-state` map to `--sqnce-_done` and `.pf-read-status[data-tone="complete"]` to `--sqnce-_complete`; and the `#5E6772` uses here (`.pf-ov-short`, `.pf-ov-progress`, `.pf-ov-status`, `.pf-ov-sub-desc`, `.pf-read-toc`) map to `--sqnce-_ink-label-light`. Worked examples:

```css
.pf-card { position: absolute; left: 50%; top: 12px; max-height: calc(100% - 24px); background: var(--sqnce-_paper); border-radius: var(--sqnce-_radius-card); border: 1px solid var(--sqnce-_border-paper); box-shadow: 0 18px 50px rgba(0,0,0,0.45); padding: 0 0 18px; transition: transform var(--sqnce-_motion-card), width var(--sqnce-_motion-card), opacity var(--sqnce-_motion-fade); transform-style: preserve-3d; display: flex; flex-direction: column; overflow: hidden; }
.pf-card-desc { padding: 0 20px 6px; font-size: 13.5px; color: var(--sqnce-_ink-muted-light-2); }
.pf-step { border: 1px solid var(--sqnce-_border-card); border-radius: var(--sqnce-_radius-control); background: var(--sqnce-_card); }
.pf-step-done { border-color: #BCD9C9; background: var(--sqnce-_card-done); }
.pf-dot-draft { border-color: var(--sqnce-_draft); background: var(--sqnce-_draft-bg); }
.pf-dot-done { border-color: var(--sqnce-_done); background: var(--sqnce-_done); color: var(--sqnce-_input); }
.pf-req { color: var(--sqnce-_danger); margin-left: 3px; }
.pf-step-state { font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_ink-muted-on-card); }
.pf-step-done .pf-step-state { color: var(--sqnce-_done); }
.pf-gate-state { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_ink-muted-on-card); }
.pf-gate-met { color: var(--sqnce-_done); }
.pf-gate-forced { color: var(--sqnce-_accent-ink); }
.pf-ov-forced { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_accent-ink); margin-left: auto; }
.pf-override { background: none; border: none; color: var(--sqnce-_ink-muted-on-card); font-size: 12px; cursor: pointer; text-decoration: underline; font-family: var(--sqnce-_font-mono); }
.pf-override:hover { color: var(--sqnce-_accent-ink); }
.pf-skip-btn { background: none; border: none; color: var(--sqnce-_ink-muted-on-card); font-size: 12px; cursor: pointer; text-decoration: underline; font-family: var(--sqnce-_font-mono); }
.pf-skip-btn:hover:not(:disabled) { color: var(--sqnce-_accent-ink); }
.pf-out-label { font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_accent-ink); margin-bottom: 4px; display: flex; align-items: center; gap: 5px; }
.pf-filechip { font-size: 12px; font-family: var(--sqnce-_font-mono); color: var(--sqnce-_ink-muted-light-2); margin-bottom: 6px; }
.pf-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--sqnce-_paper); display: flex; flex-direction: column; }
.pf-overlay-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); }
.pf-filechip-empty { color: var(--sqnce-_ink-faint-on-card); }
.pf-jt-meta { color: var(--sqnce-_ink-faint-on-card); }
.pf-read-status { font-family: var(--sqnce-_font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_ink-muted-light); }
.pf-read-status[data-tone="complete"] { color: var(--sqnce-_complete); }
.pf-read-status[data-tone="accept"] { color: var(--sqnce-_accept-ink); }
.pf-read-status[data-tone="revise"] { color: var(--sqnce-_revise-ink); }
.pf-read-link { color: var(--sqnce-_link); word-break: break-all; }
.pf-read-toc { text-align: left; background: none; border: none; border-left: 2px solid transparent; padding: 6px 10px; color: var(--sqnce-_ink-label-light); font-size: 13px; cursor: pointer; border-radius: 0 4px 4px 0; }
.pf-chev { color: var(--sqnce-_ink-muted-on-card); font-size: 16px; width: 14px; text-align: center; }
.pf-ov-gate { font-family: var(--sqnce-_font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sqnce-_ink-muted-on-card); }
.pf-ov-short { margin: 0 0 6px; color: var(--sqnce-_ink-label-light); font-size: 14px; }
.pf-side-status[data-tone="accept"], .pf-runs-status[data-tone="accept"] { color: var(--sqnce-_accept-ink); background: var(--sqnce-_accept-bg); }
.pf-side-status[data-tone="revise"], .pf-runs-status[data-tone="revise"] { color: var(--sqnce-_revise-ink); background: var(--sqnce-_revise-bg); }
.pf-jt-key { color: #7A6A3C; } /* deferred: JSON-tree syntax color */
.pf-jt-string { color: #2E6E8F; } .pf-jt-number { color: #8F4E2E; } .pf-jt-boolean, .pf-jt-null { color: #6B4E8F; }
```

- [ ] **Step 2: Run the collision-aware whole-file completion check**

Run: `node -e "const fs=require('fs');let body=fs.readFileSync('packages/react/src/ProcessRolodex.jsx','utf8');body=body.slice(body.indexOf('const CSS')).replace(/^\s*--sqnce-_[a-z0-9-]+:[^;]*;/gm,'');const count=l=>(body.match(new RegExp(l,'g'))||[]).length;const collide=[['#7A6A3C',1],['#8F4E2E',1],['#F4DFAE',1]];const allow=new Set(['#BCD9C9','#2E6E8F','#6B4E8F','#3A3424','#EDD9A8','#F1E8CE','#FBF3DD','#FCF7E9','#FCFBF5','#7A6A3C','#8F4E2E','#F4DFAE']);let bad=[];for(const [lit,n] of collide){const c=count(lit);if(c!==n)bad.push(lit+': expected '+n+' (only its deferred rule), got '+c);}for(const lit of new Set(body.match(/#[0-9A-Fa-f]{6}/g)||[]))if(!allow.has(lit))bad.push('stray literal '+lit);console.log(bad.length?bad.join('\\n'):'ok')"`
Expected: `ok`. The strip removes the `.pf-root`/`.pf-root-tokens` fallback defaults so they do not count; a `#7A6A3C`/`#8F4E2E`/`#F4DFAE` count above 1 means a non-deferred use is still hardcoded; a stray literal names a value still to tokenize. Then confirm by eye that the single `#7A6A3C` is `.pf-jt-key`, the single `#8F4E2E` is `.pf-jt-number`, and the single `#F4DFAE` is `.pf-gen-badge`.

- [ ] **Step 3: Verify build and manual unchanged render across deck, overlay, modal, reading mode**

Run: `npm run build -w examples/demo` -> build completes. Expand a renderer overlay, open the overview modal, open a finished run's reading mode; each looks identical to `main`.

- [ ] **Step 4: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): drive deck, renderers, overlay, modal, reading mode from tokens (#80)"
```

---

### Task 5: Tokenize motion behind the reduced-motion path

**Files:** Modify `packages/react/src/ProcessRolodex.jsx` (`.pf-card` transition done in Task 4; `.pf-spinner` `1290-1297`).

**Interfaces:** Consumes `--sqnce-_motion-card`, `--sqnce-_motion-spin`.

- [ ] **Step 1: Drive the spinner duration from the token, keep reduced-motion**

```css
.pf-spinner {
  width: 14px; height: 14px; border-radius: 50%; display: inline-block;
  border: 2px solid var(--sqnce-_accent); border-top-color: transparent;
  animation: pf-spin var(--sqnce-_motion-spin) linear infinite; vertical-align: -2px;
}
@keyframes pf-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pf-spinner { animation: none; border-top-color: var(--sqnce-_accent); opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .pf-card { transition: none; } }
```

The two reduced-motion media rules stay and still win, so a reduced-motion user keeps no animation regardless of the motion tokens.

- [ ] **Step 2: Verify**

Run: `npm run build -w examples/demo` -> build completes. Toggle OS reduced-motion; the card transition and spinner stop.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): tokenize motion durations behind reduced-motion (#80)"
```

---

### Task 6: Make every failing default text color pass WCAG AA on its surface

Changes only token default values; Tasks 3 and 4 already wired every selector (including the splits and the green), so no selector is touched here.

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (nine default values in the token block)
- Create then remove: `scripts/contrast-audit.mjs` (never staged)

- [ ] **Step 1: Write the complete audit script that fails until every shipped text pair passes**

The pair list below is the complete enumeration of every default text-on-its-actual-background pair in the shell (derived by reading each `color:` rule and its containing element's background), with the shipped post-fix foreground. It includes the tricky cases a single-surface scan misses: text on the light card foot, on tinted badge backgrounds, and light text on the green fills. Create `scripts/contrast-audit.mjs`:

```js
// Throwaway, never committed: every default text pair on its real surface, with the shipped foreground.
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = h => { const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); };
const ratio = (a,b) => { const x=L(a), y=L(b), hi=Math.max(x,y), lo=Math.min(x,y); return (hi+0.05)/(lo+0.05); };
const pairs = [
  // unchanged passers that are easy to break, kept as guards
  ['#EDEAE0','#222932','ink-on-dark / brand'], ['#C9CDD3','#222932','ink-on-dark-2 / side+nav'],
  ['#8A919B','#222932','ink-muted-dark / subject'], ['#5E6772','#F1EEE3','ink-label-light / light'],
  ['#6FBF95','#222932','done-tint / rail-done text on dark'], ['#2A2F36','#F1EEE3','ink-faint-light / reading'],
  ['#2E6E3F','#DDEFE0','accept-ink / status tint'], ['#8F4E2E','#F4DFAE','revise-ink / status tint'],
  ['#2F6F8F','#F1EEE3','link / reading'], ['#23282F','#D9A441','ink-strong on gold fill'],
  ['#EDEAE0','#23282F','ink-on-dark on panel-dark fill'],
  // the nine changed defaults, each on every surface it touches
  ['#9298A1','#222932','ink-label-dark / dark chrome top'], ['#9298A1','#1B2129','ink-label-dark / dark bottom'],
  ['#646A72','#F1EEE3','ink-muted-on-card / card foot + runs paper'], ['#646A72','#FAF8F0','ink-muted-on-card / card'],
  ['#646A72','#FFFFFF','ink-muted-on-card / render white'],
  ['#62666D','#F1EEE3','ink-muted-light / reading'], ['#62666D','#FAF8F0','ink-muted-light / card'],
  ['#686C73','#FAF8F0','ink-faint-on-card / card'], ['#686C73','#FFFFFF','ink-faint-on-card / white'], ['#686C73','#F1EEE3','ink-faint-on-card / paper'],
  ['#B5471F','#FAF8F0','danger / card'],
  ['#207044','#F2F8F3','done text / step-done state'], ['#207044','#F1EEE3','done/complete text / paper'],
  ['#FFFFFF','#207044','white on done fill / dot-done'], ['#EDEAE0','#207044','off-white on done fill / rail circle'],
  ['#6E6132','#F4DFAE','accent-ink / gen-badge tint'], ['#6E6132','#F1E8CE','accent-ink / chip+status tint'],
  ['#6E6132','#FAF8F0','accent-ink / card labels'], ['#6E6132','#F1EEE3','accent-ink / paper headings'],
  ['#565A61','#DCD7C7','ink-muted-light-2 / badge tan'], ['#565A61','#FAF8F0','ink-muted-light-2 / card-desc'],
  ['#23282F','#F4DFAE','ink-strong / draft-dot glyph'], ['#6E6132','#FFFFFF','accent-ink / on white'],
  ['#E08A6D','#23282F','danger-soft / side menu (dark)'], ['#B3402A','#FAF8F0','danger-strong / error on card'],
];
let bad = 0;
for (const [fg,bg,n] of pairs) { const r = ratio(fg,bg); if (r < 4.5) { bad++; console.log(`FAIL ${r.toFixed(2)}:1 ${fg} on ${bg}  (${n})`); } }
console.log(bad ? `${bad} below AA` : 'all pass');
process.exit(bad ? 1 : 0);
```

- [ ] **Step 2: Run it to confirm every pair passes**

Run: `node scripts/contrast-audit.mjs` -> `all pass`, exit 0.

- [ ] **Step 3: Update the nine failing tokens' default values in the token block**

- `--sqnce-_ink-label-dark: var(--sqnce-ink-label-dark, #9298A1);`
- `--sqnce-_ink-muted-on-card: var(--sqnce-ink-muted-on-card, #646A72);`
- `--sqnce-_ink-muted-light: var(--sqnce-ink-muted-light, #62666D);`
- `--sqnce-_ink-faint-on-card: var(--sqnce-ink-faint-on-card, #686C73);`
- `--sqnce-_ink-muted-light-2: var(--sqnce-ink-muted-light-2, #565A61);`
- `--sqnce-_accent-ink: var(--sqnce-accent-ink, #6E6132);`
- `--sqnce-_danger: var(--sqnce-danger, #B5471F);`
- `--sqnce-_done: var(--sqnce-done, #207044);`
- `--sqnce-_complete: var(--sqnce-complete, #207044);`

`done-tint` (`#6FBF95`) and `ink-label-light` (`#5E6772`) are unchanged: they already pass on their surfaces (the dark rail and the light modal/reading panel).

- [ ] **Step 4: Run the rendered audit as the completeness gate, then remove the throwaway script and commit only the jsx**

The static pair list can mis-pair a color with the wrong surface, so the authoritative gate is a rendered audit that reads the actual cascade. Build and serve the demo (`npm run build -w examples/demo`, then `python3 -m http.server` from the demo's `dist`, served on `127.0.0.1` and driven with the Playwright MCP as in the spike). Drive the demo through the states that show otherwise-hidden text (mark a step done, save a draft, browse to a locked stage, skip a sub-stage, set a run status to accept and to revise, expand a renderer overlay, open the overview modal, open a finished run's reading mode), and on each, evaluate this walk in the page:

```js
() => {
  const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const rgb = s => (s.match(/\d+/g)||[]).map(Number);
  const Lum = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  const ratio = (a,b) => { const x=Lum(a),y=Lum(b),hi=Math.max(x,y),lo=Math.min(x,y); return (hi+0.05)/(lo+0.05); };
  // Candidate backgrounds: a gradient surface (like .pf-root's dark gradient) has a
  // transparent backgroundColor, so read its backgroundImage color stops and test
  // against every stop, taking the worst contrast.
  const bgsOf = el => { for (let n=el; n; n=n.parentElement) { const cs=getComputedStyle(n); const img=cs.backgroundImage; if (img && img!=='none') { const stops=[...img.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').slice(0,3).map(Number)); if (stops.length) return stops; } const b=cs.backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return [rgb(b)]; } return [[255,255,255]]; };
  const out = [];
  for (const el of document.querySelectorAll('.pf-root *, .pf-root-tokens *')) {
    const t = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim());
    if (!t) continue;
    const cs = getComputedStyle(el); const fg = rgb(cs.color); if (fg.length<3) continue;
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    const r = Math.min(...bgsOf(el).map(bg => ratio(fg, bg))); const min = big ? 3 : 4.5;
    if (r < min) out.push({ cls: el.className, text: el.textContent.trim().slice(0,24), ratio: +r.toFixed(2), min });
  }
  return out;
}
```

Every state must return `[]`. Any entry names a text node still below AA; darken the token it resolves (the same kind of nudge as the listed nine), re-apply, and re-walk until all states are clean. Then:

Run: `rm scripts/contrast-audit.mjs`
Run: `npm run build -w examples/demo` -> build completes; the nudged colors (the muted greys, the danger red, the accent-ink, and the slightly darker done green) are the only palette change from `main`.

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): make default text colors meet WCAG AA per surface (#80)"
```

---

### Task 7: Visible cues for color-only statuses

**Files:** Modify `packages/react/src/ProcessRolodex.jsx` (step-dot button `~786-810`, navigation pips `~988-996`, rail render `~566-585`, plus `.pf-pip-*`, `.pf-rail-*` CSS).

**Interfaces:** markup plus CSS; no new tokens.

- [ ] **Step 1: Add a visible draft glyph and accurate aria-labels to the step dot, keeping the existing guards**

Keep `disabled={!center || readOnly || skipped}` and the existing `onClick` exactly; change only the `aria-label` and the glyph:

```jsx
<button
  className={`pf-dot-btn pf-dot-${status}`}
  disabled={!center || readOnly || skipped}
  title={status === "done" ? "Reopen" : "Mark done"}
  aria-label={
    status === "done" ? `Step ${step.name}: done. Reopen`
    : status === "draft" ? `Step ${step.name}: draft. Mark done`
    : `Step ${step.name}: not started. Mark done`
  }
  onClick={() => (status === "done" ? reopen(step.id) : toggleDone(step.id, true))}
>
  {status === "done" ? "✓" : status === "draft" ? "·" : ""}
</button>
```

The draft `·` glyph plus the existing adjacent word ("Draft") make draft non-color-only. Because `.pf-dot-btn` sets `color: transparent` (the glyph is hidden until a state gives it a color, the way `.pf-dot-done` sets white), add a visible color to the draft dot so the `·` shows without hover:

```css
.pf-dot-draft { border-color: var(--sqnce-_draft); background: var(--sqnce-_draft-bg); color: var(--sqnce-_ink-strong); }
```

(`#23282F` ink on the `#F4DFAE` draft fill is 11.3:1, well clear of AA.)

- [ ] **Step 2: Make the navigation pips keyboard-focusable, shape-distinct, and labeled**

Change the pip from a `<span>` to a `<button>` and add labels:

```jsx
<button
  key={s.id}
  type="button"
  className={`pf-pip ${i === idx ? "pf-pip-active" : ""} ${s.mainIndex > frontier ? "pf-pip-locked" : ""} ${isSubStageSkipped(run, s.id) ? "pf-pip-skipped" : ""}`}
  disabled={s.mainIndex > frontier}
  aria-label={`${s.name}${i === idx ? " (current)" : ""}${s.mainIndex > frontier ? " (locked)" : ""}${isSubStageSkipped(run, s.id) ? " (skipped)" : ""}`}
  aria-current={i === idx ? "step" : undefined}
  onClick={() => setNav(jumpTo(run, subs, i))}
/>
```

Update the pip CSS so the four states differ by shape, not only color: default solid, active larger and ringed, locked a hollow solid-border circle, and skipped a hollow dashed-border circle (so locked and skipped are distinguishable without color). The locked pip changing from a solid fill to a hollow ring, and the skipped pip gaining a dashed border, are intentional accessibility changes (shape cues), in the same category as the contrast nudges:

```css
.pf-pip { width: 9px; height: 9px; border-radius: 50%; background: var(--sqnce-_pip); cursor: pointer; border: none; padding: 0; }
.pf-pip-active { background: var(--sqnce-_accent); transform: scale(1.25); box-shadow: 0 0 0 2px var(--sqnce-_accent-hover); }
.pf-pip-locked { background: transparent; border: 1px solid var(--sqnce-_pip-locked); box-sizing: border-box; cursor: default; }
.pf-pip-skipped { background: transparent; border: 1px dashed var(--sqnce-_pip); box-sizing: border-box; }
```

- [ ] **Step 3: Give the rail's active stage a visible non-color cue**

```jsx
<span className={`pf-rail-stage pf-rail-${state}`} aria-current={state === "active" ? "step" : undefined}>
  <span className="pf-rail-circle">{glyph}</span>
  {ms.name}
  {state === "active" && <span className="pf-rail-here" aria-hidden="true">▾</span>}
</span>
```

```css
.pf-rail-here { font-size: 9px; margin-left: 2px; }
.pf-rail-active .pf-rail-circle { box-shadow: 0 0 0 2px var(--sqnce-_accent-hover); }
```

The `▾` marker plus the ring mark the current stage without relying on the gold color; done keeps `✓` and locked keeps `🔒`.

- [ ] **Step 4: Verify build and a grayscale color-blind check**

Run: `npm run build -w examples/demo` -> build completes. Under a grayscale rendering emulation, confirm the current stage (marker plus ring), draft dots (the `·` glyph), and the four pip states (default solid, active larger-and-ringed, locked hollow with a solid border, skipped hollow with a dashed border) are all distinguishable without color.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "feat(react): add visible non-color cues for status (dots, pips, active stage) (#80)"
```

---

### Task 8: Final verification and the reskin proof

**Files:** Modify (temporary, reverted): the `examples/demo` entry, to demonstrate a reskin.

- [ ] **Step 1: Run all per-PR gates**

Run: `npm test` -> PASS (engine + react helper tests + the new `themeTokens` tests).
Run: `npm run build -w examples/demo` -> build completes.
Run: `npm run types` -> exits clean (the new exports get declarations).

- [ ] **Step 2: Prove the reskin manually**

Temporarily wrap the demo's `ProcessRolodex` in `<div style={{ '--sqnce-paper': '#fffdf5', '--sqnce-accent': '#3b6ea5', '--sqnce-font-ui': 'Georgia, serif', '--sqnce-pad-section': '20px' }}>`, build, and confirm the chrome, cards, renderers, overlay, overview modal, and reading mode all retheme (paper-and-ink, single accent, serif type, tighter density) with no fork, including the body-portaled overlay opened from inside a `transform: translateZ(0)` wrapper. Revert the demo change before finishing.

- [ ] **Step 3: Confirm the default look is unchanged except the intentional changes**

Build `main` and the branch demo side by side; confirm the only visible differences are the Task 6 contrast nudges and the Task 7 status cues (including the now-hollow locked pip).

- [ ] **Step 4: Commit any final touch-ups (skip if none)**

```bash
git add -A
git commit -m "chore(react): finalize token verification (#80)"
```

---

## Self-Review

**Spec coverage:** token layer with private indirection -> Task 1. Portaled-overlay token scope established before conversions (body mount + propagation + base font/ink) -> Task 2. Consume tokens through the shell CSS (palette, type, spacing, radius) -> Tasks 3, 4, 5. Per-surface contrast: Task 6 changes nine token defaults (the muted greys, the secondary light ink, the accent-ink, the danger red, and the done/complete green) and is verified by a complete static text/background pair audit plus a rendered demo spot-check across all states -> Tasks 1, 3, 4, 6. Reduced-motion -> Task 5. Accessibility visible cues (dots, pips, active rail) -> Task 7. Run-status tone tokens (accept/revise/complete) -> Tasks 1, 4. Reading-mode coverage (including the link token) -> Task 4. Inline card geometry stays out of scope (the `420` transform is untouched). Spacing/density tokens -> Task 1 plus the Tasks 3 and 4 gap/padding conversions and the Task 8 density reskin. Verification by demo build + manual + `npm test`/`types` -> Task 8.

**Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N". The bulk CSS conversion is a mechanical mapping with a complete 49-literal token table, worked examples per surface, and one collision-aware whole-file completion check (Task 4) that strips the token-declaration block so default fallbacks do not count.

**Type consistency:** `THEME_TOKENS`, `readThemeVars(getProp)`, `ThemeRootContext`, `ThemeScope` match across `themeTokens.js`, `themeScope.jsx`, the test, the `ProcessRolodex` provider, and the two portal consumers. Every `THEME_TOKENS` entry matches a `--sqnce-_<name>` private token in Task 1 (same name without `_`), including `ink-label-dark`/`ink-label-light`, `ink-muted-on-card`, `ink-faint-on-card`, the green tokens (`done`/`done-tint`/`complete`), the spacing scale, the pip tokens, the link token, and the readonly-input token. `#5E6772` maps per the Split-color assignments (dark labels vs light modal/reading), and `#8A8E96` maps wholly to `ink-muted-on-card` because the card foot is light, so Task 6's one dark-surface nudge (`ink-label-dark`) does not regress any light-surface text. Task 6 changes only default values that Tasks 3 and 4 already wired to selectors. Task 7 preserves the dot button's existing `disabled={!center || readOnly || skipped}` guard and `onClick`, adding only the aria-label, the draft glyph, the pip shapes, and the rail marker. The portal scope mirrors each instance's own `.pf-root` via `ThemeRootContext`, not a global query.
