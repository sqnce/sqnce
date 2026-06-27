# spec: within-document section navigation in the output overlay

Issue: #86 (within-document section navigation in the output overlay). Milestone: "UI shell: reading mode, renderers & theming". Supersedes the now-closed duplicate #83. Source: the presales UI-presentation evaluation, finding M3 (severity Medium).

A spec on the PR branch, for the owner to review before the spec-approval gate.

Layer: pure `@sqnce/react`. The change touches `packages/react/src/OutputView.jsx` (the expand `Overlay`, which renders the outline pane and parses the heading list) and `packages/react/src/renderers/Markdown.jsx` (it stamps heading ids), and it adds a small shared module under `packages/react/src/renderers/` holding the per-document slugger and the outline parser, so the renderer and the overlay use exactly the same slug logic. No `@sqnce/core` change.

## Current behavior

A long prose output renders through the markdown renderer, and the expand affordance opens a full-screen `Overlay` (portaled to `body` to escape the card deck's transform). The overlay header carries only a title and a Close button. There is no section list, no heading jump-list, and no in-document search.

The markdown renderer emits `<h1>` through `<h6>` from ATX headings, but with no `id` attribute, so there is no anchor to scroll to. The overlay body renders the same renderer with an expanded context flag.

## Problem

Reading or finding a specific section of a roughly 25KB artifact is pure linear scrolling. The heading structure exists in the document but is never offered as navigation. The evaluation calls this the main thing keeping otherwise-strong long-form readability off full marks.

## Change

Render a section list (a heading jump-list) alongside the body in the expand overlay, built from the document's headings.

### Heading ids in the renderer

The markdown renderer assigns a stable slug id to each heading. It walks the headings in document order through a per-document slug sequence: each heading text is slugified, and a repeat of an already-issued slug gets the next numeric suffix (the first `## Summary` becomes `summary`, a second becomes `summary-2`), so ids are unique within the document and the order of the headings decides which repeat gets which suffix. This gives each heading a scroll target.

### Outline in the overlay

The overlay derives the heading outline by parsing the ATX headings from the same markdown source string the renderer receives (the value passed to the renderer), producing a list of entries with text, level, and slug. It walks the headings in the same document order through the same slug sequence, so the slug it computes for the nth heading is exactly the id the renderer stamped on that heading. It renders this list as a jump-list pane beside the body; clicking an entry scrolls the overlay body to the matching heading id (`scrollIntoView` within the overlay's scroll container). Entries nest by heading level.

To keep the anchors and the outline in agreement, the slug logic is factored into one shared helper that is stateful per document: it remembers the slugs already issued and disambiguates a repeat by appending the next numeric suffix. Both the renderer (when it stamps ids) and the overlay parser (when it builds targets) create a fresh instance and feed it the document's headings in order, so two headings with the same text resolve to the same pair of ids (`summary` and `summary-2`) in both places. A pure text-to-slug function would not do this: it would map both `## Summary` headings to `summary`, so every duplicate jump-list entry would target the first occurrence and the later sections could not be reached.

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

The repo's `npm test` already runs the React unit tests under `packages/react/test/*.test.js` (Node's built-in test runner) alongside the engine tests, so the pure parsing logic gets unit coverage. Add React unit tests for the two pure pieces in the shared module: the per-document slugger (a single heading slugifies cleanly, a repeated heading gets `-2` then `-3`, and a renderer instance and a parser instance fed the same heading sequence produce identical ids) and the outline parser (it extracts ATX headings with their text and level, nests by level, and yields fewer than two entries for a document with zero or one heading). The React component wiring (the pane layout, the scroll-on-click, the responsive collapse) has no unit-test harness, so verify it by the JSX syntax check on the two touched files (`npx esbuild <file> --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`), the demo build (`npm run build -w examples/demo`), and a manual check: open the expand overlay for a long markdown artifact, confirm the heading list appears, confirm clicking a heading scrolls the body to that section, and confirm a short artifact (fewer than two headings) shows the unchanged overlay.

## Acceptance

- The expand overlay for a long markdown artifact shows a navigable list of its section headings.
- Clicking a heading scrolls the body to that section.
- A non-markdown output, or a markdown artifact with fewer than two headings, shows the unchanged overlay.
- `npm test` and `npm run build -w examples/demo` pass.

## Open questions for approval

1. Outline source: parse headings in the overlay from the markdown string (recommended, leaves the generic renderer contract untouched), or have the renderer expose its headings through the renderer contract (richer, but couples every renderer to an outline interface).
2. Pane placement: a left rail beside the body, or a collapsible top bar. Recommendation: a left rail, collapsing to a drawer on narrow widths.
3. Include the optional in-document find now, or defer. Recommendation: defer.
