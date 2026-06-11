# spec: regroup presales sub-stages under their named main stages (issue #44)

## Goal

Fix a content mislabeling in `definitions/presales.json`. The `proposal`
(Proposal Draft) and `demo` (Demonstration) sub-stages have always lived
under the `rfp` main stage, leaving the main stage literally named
Proposal & Demo with only Orals Prep and Delivery. The #43 orientation
cues (header stage rail, card eyebrows) render this grouping faithfully,
so with the seeded run's frontier at Demonstration the rail shows RFP as
active and Proposal & Demo as locked, which reads as a bug to any viewer.

This is a definition content fix only. No engine, UI, or seed code
changes.

## Change

In `definitions/presales.json`, move the `proposal` and `demo` sub-stage
objects (unchanged) from the end of `rfp.subStages` to the front of
`proposal-demo.subStages`. Resulting grouping:

- RFP: Start, RFP Review, Solutioning
- Proposal & Demo: Proposal Draft, Demonstration, Orals Prep, Delivery
- SOW: Scope Definition, Estimation, SOW Draft

The flattened sub-stage order (start, review, solutioning, proposal,
demo, orals, delivery, scope, estimate, sow-draft) is identical before
and after, so the Pacific Ridge seed (`idx: 4, frontier: 4`, step-id
keyed state) still opens on Demonstration with the same step content.
No step ids, output specs, or seed data change.

## Verification

- At the seeded frontier (Demonstration), the header rail shows
  Proposal & Demo as the active main stage (glyph `2`), RFP done,
  SOW locked.
- The Demonstration card eyebrow reads `PROPOSAL & DEMO · S2`.
- `npm test` green (includes `validateDefinition` over bundled
  definitions).
- `npm run build -w examples/demo` succeeds; the seeded run still opens
  on Demonstration.
