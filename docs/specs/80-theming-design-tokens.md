# spec: theming via design tokens (CSS custom properties)

Issue: #80 (theming via design tokens). Milestone: "UI shell: reading mode, renderers & theming". This is "Phase 0" for any visual redesign: establish shared tokens first, so later renderer and shell work lands against one system rather than each consumer inventing its own and drifting.

A first-draft spec committed to a draft PR ahead of the Codex review loop.

Layer: pure `@sqnce/react`. Nearly all styles live in one CSS template literal (the `CSS` constant in `packages/react/src/ProcessRolodex.jsx`, injected once via `<style>{CSS}</style>`), and every component (`OutputView`, `RunSidebar`, `RunsScreen`, `OverviewModal`, and the renderers) references the `pf-*` classes defined there, so converting that one constant rethemes the palette, type, and most spacing of the whole shell. The one exception is a small amount of layout geometry computed inline in JavaScript, most importantly the rolodex card transform in `ProcessRolodex` (`translateX(calc(-50% + ${pos * 420}px)) ...`), where the card pitch is a hardcoded `420`. That inline geometry is out of scope here (see Out of scope), and the color, type, and spacing-token work does not touch it. No `@sqnce/core` change.

## Current behavior

The visual system is baked in: the palette is hardcoded hex (a dark blue-grey surface gradient, a gold accent, a light ink-on-paper card, green and amber status colors), the type is IBM Plex Sans and IBM Plex Mono pulled in by an `@import`, and spacing, radii, and sizes are literal pixel values throughout the `CSS` constant. A consumer cannot reskin the shell (palette, typography, density) without forking sqnce's CSS.

## Change

### 1. Define a token layer

Introduce a `--sqnce-*` custom-property vocabulary, each token defaulting to the current value so default rendering is visually unchanged. The defaults are supplied through an indirection so a consumer can still override any token from `.pf-root` or an ancestor scope. The reason for the indirection is a CSS cascade rule: a public token given a literal value directly on `.pf-root` would shadow a value inherited from a parent, which would break the ancestor-override path the acceptance criteria require. So `.pf-root` does not assign the public `--sqnce-*` tokens; instead it declares one block of private tokens that each resolve the matching public token with the current value as the fallback (for example `--sqnce-_accent: var(--sqnce-accent, <current accent hex>)`), and the shell CSS reads the private tokens. Because the public token is never assigned on `.pf-root` itself, a value set on `.pf-root` or any ancestor inherits in and wins. Group and namespace the public tokens under the `--sqnce-*` prefix:

- Color: surfaces (the app background, the card paper, raised panels), ink (primary text, and muted text split by surface into an ink-on-dark and an ink-on-light value, because the same muted grey cannot meet contrast on both a dark and a light surface), the accent, and status colors (done, draft, locked, danger).
- Typography: the interface font family and the mono family, plus the key sizes that define the type scale.
- Spacing and density: the common gaps, paddings, and border radii in the `CSS` constant. (The inline rolodex card-pitch geometry is not tokenized in this issue; see Out of scope.)
- Motion: the transition timing, tied to the reduced-motion path below.

### 2. Consume the tokens throughout the shell CSS

Replace the hardcoded values in the `CSS` constant with references to the private tokens (`var(--sqnce-_*)`), which resolve to each public token or its baked-in default. A consumer then reskins by setting the public `--sqnce-*` properties on `.pf-root` or any ancestor scope (for example presales-sqnce's editorial paper-and-ink palette, a single accent, and a serif-for-deliverable, sans-for-interface type pairing), with no fork of sqnce. The override works from an ancestor precisely because the shell never assigns the public tokens on `.pf-root`.

First-draft coverage: the shell chrome (header, rail, deck, cards, navigation, sidebar, runs screen), the reading-mode surface (`ReadingView`'s `.pf-read*` rules, shown for finished runs), and the common renderer surfaces (tables, key-value, markdown, code). All of these live in the same `CSS` constant, so converting it covers reading mode along with the rest. Deeper per-renderer tokenization can follow once the vocabulary is proven; this issue establishes the vocabulary and converts the shell.

### 3. Token scope must cover portaled overlays

Two surfaces render through a portal to `document.body` and so fall outside `.pf-root`: the renderer-expand overlay (`OutputView`'s `Overlay`, class `.pf-overlay`) and the overview modal (`OverviewModal`). Both currently paint hardcoded colors (for example `.pf-overlay` uses `#F1EEE3` with a `#23282F`/`#EDEAE0` head). If their styles become `var(--sqnce-_*)` references while the private tokens are declared only on `.pf-root`, a body-mounted overlay resolves those tokens to nothing and renders unstyled, and a consumer override set on `.pf-root` never reaches it.

So these portals mount inside `.pf-root` rather than `document.body`, which keeps them within the token scope: they inherit the private-token defaults and any consumer override set on `.pf-root` or an ancestor, with no per-portal token plumbing. The overlays are `position: fixed; inset: 0; z-index: 1000`, so nesting them in `.pf-root` does not change their full-screen, top-layer behavior, and `.pf-root` sets only `overflow-x: hidden` (no transform, filter, or other containing-block trigger), so it does not clip a fixed descendant. The demo build is where to confirm the expanded overlay and the overview modal still cover the viewport and sit above the shell. See `docs/spikes/80-theming-design-tokens.md` for the fixture that verifies token inheritance and non-clipping.

### 4. Accessibility-safe defaults

The issue requires the default theme to be accessible, independent of any consumer override:

- Meaning never rests on color or a tint alone: every status carries a word and an icon, not a bare colored dot. Audit the places where status is shown only by color. The stage rail already pairs a glyph and the stage name. The step rows show a text state ("Done", "Draft") next to the dot, but the draft and open dots themselves are color-only; the navigation pips are color-only. Where meaning currently rests on color alone and no adjacent word already conveys the state (the draft and open dots, and the navigation pips), add a visible cue (a glyph, a shape, or a text label, never color alone); an aria-label is added on top for assistive technology but does not by itself satisfy this, because a sighted color-blind user cannot perceive it. Where an adjacent word already carries the state, as the step rows do for done and draft, that visible word suffices.
- Measured contrast minimums for body and large text, each color against the surface it actually renders on (target WCAG AA: 4.5:1 for body, 3:1 for large text). The shell has both a dark chrome surface and light card and reading surfaces, so a color is measured against its own background, not one global surface. The current palette already fails in places (measured on the real surfaces: `#5E6772` labels at 2.56:1 on dark chrome, `#8A8E96` gate state at 4.46:1 on dark chrome and step state at 3.09:1 on the light card, `#6B6F76` reading status at 4.35:1 on the reading panel; see `docs/spikes/80-theming-design-tokens.md`). Accessibility takes precedence over byte-identical preservation: the muted-text colors that fail are nudged just enough to pass on their surface, and those are the only intentional changes to the default look. Because `#8A8E96` and `#5E6772` each appear on both a dark and a light surface, where a single nudge cannot pass both, the muted-ink token splits into a dark-surface and a light-surface value rather than one shared token.
- A tested reduced-motion path. The card transition and the spinner already honor `prefers-reduced-motion`; extend the same treatment to any token-driven motion so the reduced-motion path is consistent.

## Out of scope

- A full second theme implementation. That belongs to the consumer (for example presales-sqnce); this issue ships the token system and accessible defaults.
- Deep per-renderer tokenization beyond the common surfaces (a follow-up once the vocabulary is proven).
- Extracting the CSS out of the JavaScript template literal into a separate stylesheet. The token approach works inside the existing `<style>` injection; a file split is a separate concern.
- The inline rolodex card-pitch geometry (the `420` constant in `ProcessRolodex`'s card `transform`). It is computed in JavaScript, not in the `CSS` constant, so a density token would not reach it without changing that JS; tokenizing the carousel geometry is a separate follow-up. This issue's density tokens cover the gaps, paddings, and radii in the `CSS` constant.
- Any `@sqnce/core` change.

## Verification

`npm test` already runs the engine tests plus the existing `@sqnce/react` unit tests (`node --test` over `packages/react/test/*.test.js`), but there is no DOM render harness for visual or CSS verification. So the token defaults, the reskin, and contrast are verified by the demo build (`npm run build -w examples/demo`), a manual before-and-after render confirming the default look is unchanged apart from the enumerated contrast adjustments, a manual reskin confirming that overriding `--sqnce-*` on an ancestor rethemes the shell (including the portaled overlay and overview modal), and a contrast tool against the rendered defaults. The parts that are not pure CSS are covered with `@sqnce/react` unit tests where they are unit-testable: the accessibility labels and glyphs added to the status dots and navigation pips, and the overlay and overview modal mounting within `.pf-root`.

## Acceptance

- The shell's palette, type, and spacing are driven by the `--sqnce-*` custom-property vocabulary, with the current values supplied as fallbacks rather than as literal assignments of the public tokens on `.pf-root`; setting those properties on `.pf-root` or any ancestor scope reskins the shell with no fork.
- Default rendering is visually unchanged from today, apart from the minimal, enumerated muted-text color adjustments the contrast audit requires; those are the only intentional visual changes, and accessibility takes precedence over byte-identical preservation.
- The renderer-expand overlay and the overview modal, though portaled, resolve the same tokens and honor consumer overrides (they mount within `.pf-root`), and stay full-screen above the shell.
- Every status conveys meaning with a word and an icon, not color alone.
- The default palette meets the contrast minimums, and the reduced-motion path is consistent.
- `@sqnce/react` unit tests cover the testable non-CSS changes: the status-dot and navigation-pip accessibility labels and glyphs, and the expand overlay and overview modal mounting within `.pf-root`.
- `npm test` and `npm run build -w examples/demo` pass.

## Open questions for approval

1. Token namespace. Recommendation: `--sqnce-*`.
2. First-draft token coverage: shell chrome plus common renderer surfaces (recommended), or every renderer in one pass.
3. Extract the CSS into a separate stylesheet as part of this work, or keep it in the template literal. Recommendation: keep it in the template literal for this issue.
