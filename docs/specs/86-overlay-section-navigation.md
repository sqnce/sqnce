# spec: within-document section navigation in the output overlay

Issue: #86 (within-document section navigation in the output overlay). Milestone: "UI shell: reading mode, renderers & theming". Supersedes the now-closed duplicate #83. Source: the presales UI-presentation evaluation, finding M3 (severity Medium).

A first-draft spec committed to a draft PR ahead of the Codex review loop.

Layer: pure `@sqnce/react`, in `packages/react/src/OutputView.jsx` (the expand `Overlay`) and `packages/react/src/renderers/Markdown.jsx` (heading ids and a shared slug helper). No `@sqnce/core` change.

## Current behavior

A long prose output renders through the markdown renderer, and the expand affordance opens a full-screen `Overlay` (portaled to `body` to escape the card deck's transform). The overlay header carries only a title and a Close button. There is no section list, no heading jump-list, and no in-document search.

The markdown renderer emits `<h1>` through `<h6>` from ATX headings, but with no `id` attribute, so there is no anchor to scroll to. The overlay body renders the same renderer with an expanded context flag.

## Problem

Reading or finding a specific section of a roughly 25KB artifact is pure linear scrolling. The heading structure exists in the document but is never offered as navigation. The evaluation calls this the main thing keeping otherwise-strong long-form readability off full marks.

## Change

Render a section list (a heading jump-list) alongside the body in the expand overlay, built from the document's headings.

### Heading ids in the renderer

The markdown renderer assigns a stable slug id to each heading (slugify the heading text, and disambiguate collisions with a numeric suffix so ids are unique within the document). This gives each heading a scroll target.

### Outline in the overlay

The overlay derives the heading outline by parsing the ATX headings from the markdown source string it already holds (the output value), producing a list of entries with text, level, and slug. It renders this list as a jump-list pane beside the body; clicking an entry scrolls the overlay body to the matching heading id (`scrollIntoView` within the overlay's scroll container). Entries nest by heading level.

To keep the anchors and the outline in agreement, the slug function is factored into one shared helper used by both the renderer (when it stamps ids) and the overlay parser (when it builds targets), so a given heading text always produces the same slug in both places.

### When the pane shows

The pane renders only when the overlay content is markdown and the document has at least two headings. Otherwise the overlay is exactly as today (title and Close only). Scope the first draft to the markdown built-in renderer; custom renderers and non-markdown outputs keep the current overlay.

### Responsive

The section pane collapses on narrow widths so the reading column keeps its measure.

## Out of scope

- In-document find. The issue marks it optional; defer it to a follow-up.
- An outline for non-markdown outputs or custom renderers.
- Heading navigation in the inline (non-overlay) render. The issue targets the expand overlay.
- Any `@sqnce/core` change.

## Verification

No React test harness exists (the test suite is engine-only). Verify by the JSX syntax check on the two touched files (`npx esbuild <file> --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`), the demo build (`npm run build -w examples/demo`), and a manual check: open the expand overlay for a long markdown artifact, confirm the heading list appears, and confirm clicking a heading scrolls the body to that section. Confirm a short artifact (fewer than two headings) shows the unchanged overlay.

## Acceptance

- The expand overlay for a long markdown artifact shows a navigable list of its section headings.
- Clicking a heading scrolls the body to that section.
- A non-markdown output, or a markdown artifact with fewer than two headings, shows the unchanged overlay.
- `npm test` and `npm run build -w examples/demo` pass.

## Open questions for approval

1. Outline source: parse headings in the overlay from the markdown string (recommended, leaves the generic renderer contract untouched), or have the renderer expose its headings through the renderer contract (richer, but couples every renderer to an outline interface).
2. Pane placement: a left rail beside the body, or a collapsible top bar. Recommendation: a left rail, collapsing to a drawer on narrow widths.
3. Include the optional in-document find now, or defer. Recommendation: defer.
