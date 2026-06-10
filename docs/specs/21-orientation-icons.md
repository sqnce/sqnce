# spec: orientation cues and shared output-type icons

Issues: #21 (position counter in the header), #22 (Back/Next eyebrow labels on side cards), #23 (output-type icons in the carried-forward inputs section), #24 (output-type icons next to output editor labels).

Batch 6 of the spec series. This PR is parked at the spec-approval gate; implementation follows approval.

All four are `@sqnce/react` only and come from the 2026-06-09 design review. #23 and #24 share one icon set, which is why they ship together; #21 and #22 are the remaining small orientation cues from the same review.

## Assumes merged

Batches 1 to 5 (PRs #38, #39, #40, #41, #42). This batch implements and merges only after batch 1: #10 (part of #38) deletes `examples/claude-artifact/`, so by implementation time the issue texts' "mirror into examples/claude-artifact per CLAUDE.md" lines have nothing to apply to. This spec does not waive the sync rule; it sequences after the rule's removal. In the contingency that this batch is implemented while the artifact still exists in the tree, the sync rule applies as written and the artifact mirrors the same changes.

Relevant overlaps: batch 4's #17 puts check and lock glyphs in the stage rail and #18 restructures the card footer; this batch touches the header (counter), the side-card strip (eyebrows), the inputs section, and output labels, none of which conflict.

## Shared icon set (foundation for #23 and #24)

- One module, `packages/react/src/icons.jsx`, exporting a map from output type to a small inline SVG icon: `text`, `fields`, `file`, `link`, `data`. Inline SVGs, sized to ride alongside 11 to 12px mono labels, `currentColor` stroke/fill so they inherit context color. No icon dependency.
- Decision: the set covers all five output types including `data`. The issue texts predate or omit the `data` type, but data outputs flow through the carried-forward inputs section like any other, and an icon set with a hole would fail exactly where structured outputs are most common.

## #21: position counter in the header

- A small "4 / 12" counter (current flattened sub-stage position, 1-based, out of total sub-stages) renders in the header next to the stage rail, mono font, muted color.
- It tracks the browsing position (`idx`), complementing the pips at the bottom; it does not render on the runs screen (which replaces the rolodex view).

Acceptance: the counter shows the current position out of the total, updates when browsing and advancing, and matches the active pip.

## #22: Back/Next eyebrow labels on side cards

- Visible side cards (`|pos| == 1`) get a small eyebrow label above the card strip: "Back" on the previous card (`pos < 0`), "Next" on the following card (`pos > 0`), mono uppercase, muted.
- The existing card strip (stage code, required count) and the mini step lists stay exactly as they are.
- Locked next cards keep the eyebrow ("Next" describes deck direction, lock state already has its own treatment).
- With batch 4's #25 making side cards clickable, the eyebrow doubles as the click affordance's label; on locked (non-clickable) cards it stays purely informational.

Acceptance: deck direction is readable at a glance from the eyebrows; nothing else on the side cards changes.

## #23: output-type icons in the carried-forward inputs section

- Each item in the "Inputs from {previous sub-stage}" section gains chip-style icons for the output types that step actually carries values for: one chip per distinct output type present, using the shared icon set.
- The existing 220-character content previews stay (the prototype had chips but no previews; this is the hybrid the issue asks for).

Acceptance: a step with a fields output and a file output shows both chips; the preview text is unchanged; the section scans faster without losing content.

## #24: output-type icons next to output editor labels

- In the step body, each output label (`pf-out-label` in `packages/react/src/OutputView.jsx`) gets the matching type icon from the shared set, inline before the label text.
- Filed with a skip recommendation in the design review (marginal scan value over the existing mono uppercase labels); included here because the icon set exists anyway once #23 lands, making the marginal cost near zero. Droppable without affecting the rest of the batch.

Acceptance: every output editor label carries its type icon; visual weight stays subordinate to the label text.

## Sequencing

Icon module first, then #23 and #24 on top of it; #21 and #22 are independent and can land in any order.

## Out of scope

- Any engine change, any renderer change, any new dependency.
- Replacing batch 4's rail glyphs or other existing glyphs with the icon module (possible later cleanup, not this batch).
- Mobile-specific changes; under 720px the side cards (and so the eyebrows) stay hidden as today.

## Acceptance (batch)

- Each issue's acceptance above, verified in the running demo with screenshots.
- `npm test` and `npm run build -w examples/demo` pass.

## Open questions for approval

1. #24 ships per this spec despite its original skip recommendation, on near-zero marginal cost. Approve or drop #24 (the icon set and #23 stand either way).
2. Counter placement is specced next to the stage rail. Flag if you want it in the header-right cluster (near the run controls) instead.
