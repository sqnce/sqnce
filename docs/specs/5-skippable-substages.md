# spec: skippable sub-stages, recorded skips and forced advances

Issue: #5. Implements the decision recorded on the issue (evaluated 2026-06-11, Option A "flag maps with exclusion"). The parallel half of the ticket was subsumed by #4 (the main stage is the order-free group); this spec covers what remained: author-declared skippable sub-stages with first-class "not applicable" marking per run, and recording both skips and forced advances in run state.

Driving need: content reality. Some runs legitimately have no demo, no orals, no site visit; users need the boundary gate to stop counting steps that will never happen, without lying about completion.

## Definition schema

A sub-stage may declare `"skippable": true`. `validateDefinition` adds two checks:

- `skippable`, when present, must be a boolean.
- Duplicate sub-stage ids across the definition become a problem (run state now keys on sub-stage ids, the same reason step ids are already checked).

Nothing else changes. All bundled definitions remain valid.

## Run state

Shape stays `{ idx, frontier, stepState }` plus two optional maps, absent when empty:

- `skips: { [subStageId]: true }`: the sub-stages this run marked not applicable.
- `forces: { [mainIndex]: true }`: main stages whose boundary gate was unmet when the run advanced past it with the override. Keyed by the index of the stage that was committed (the old frontier). The marker is a historical fact and is never auto-cleared.

`createRun()` is unchanged; neither field exists until first written. The run store stays `version: 3`: both fields are additive and missing-means-empty, so existing stores load unchanged.

## Core (`@sqnce/core`)

New functions:

- `skipSubStage(run, subStages, subStageId)`: returns a new run with `skips[subStageId] = true`. No-op (same run back) when the id is unknown, the sub-stage is not declared `skippable`, or it lies beyond the frontier (`mainIndex > frontier`). Skipping never touches `stepState`.
- `unskipSubStage(run, subStages, subStageId)`: removes the entry; drops the `skips` field entirely when it empties. No-op when the id is not currently skipped. Outputs and done flags survive the round trip untouched (non-destructive, same philosophy as archiving).
- `isSubStageSkipped(run, subStageId)` and `wasAdvanceForced(run, mainIndex)`: trivial readers so the UI never reaches into the maps directly.

Changed functions:

- `aggregateGate` (and therefore `mainGateProgress` and `advance`'s gate check): skipped sub-stages are excluded before aggregating. `done`/`total`/`missing` shrink; the gate reads "2 of 3 required" honestly rather than counting never-done steps as done. A stage with every sub-stage skipped is trivially met (`0 of 0`). Missing names stay qualified by sub-stage based on the stage's total sub-stage count (unfiltered), so naming does not flicker as skips toggle.
- `advance(run, subStages, { force })`: when the (skip-aware) aggregate is unmet and `force` is used, the result run records `forces[oldFrontier] = true`. A plain advance, or a `force: true` call whose gate was already met, records nothing. Everything else (legality, landing on the first sub-stage of the committed stage) is unchanged.
- `buildContext(subStages, run, flatIdx, excludeStepId?)`: steps of skipped sub-stages are excluded, so N/A content never feeds draft prompts even if outputs were entered before the skip. Unskip restores them.
- `runSummary(definition, run)`: skipped sub-stages are excluded from both `met` and `total`.

Untouched: `gateProgress` (per-sub-stage math; skipped state is a layer above it), `isStepComplete` and all hybrid/strict semantics (`gate.type` keeps its exact job and is simply not consulted while skipped), `browse`/`jumpTo` (skipped cards remain browsable), `serializeStep`, all run store functions.

TDD for all engine changes. The core fixture (`packages/core/test/fixtures/workflow.js`) gains `skippable: true` on its `collect` sub-stage (hybrid, inside the multi-sub-stage `alpha` stage), extending the documented coverage floor. New tests cover: validation of `skippable` and duplicate sub-stage ids; skip recorded and unskip dropping the empty map; no-op on unknown, non-skippable, and beyond-frontier ids; `stepState` surviving a skip/unskip round trip; aggregate exclusion (unmet stage becomes advanceable when its only unmet sub-stage is skipped, including a strict one); force recorded only on a genuinely forced advance; `buildContext` excluding then restoring a completed step in a skipped sub-stage; `runSummary` totals; the all-skipped trivially met stage.

## UI (`@sqnce/react`, rolodex)

The deck stays linear and the centered-card model is untouched: skip-only means no branch visualization.

- **Skip control**: the centered card shows a "Mark not applicable" control when its sub-stage is declared skippable, not currently skipped, unlocked (within the frontier main stage or a committed one), and the run is not read-only.
- **Skipped card**: stays in the deck and in the pip rail. Body dimmed, step inputs disabled, eyebrow replaced by a "Skipped" badge, and a "Restore" control (undo). The engine stays agnostic; the affordance lives in the UI (guide, never hard-block).
- **Gate footer**: unchanged logic; the aggregate it renders is now skip-aware automatically. A skipped card in the frontier stage still shows the stage footer and advance affordance (the footer describes the stage, not the card).
- **Forced marker**: cards of a committed main stage show a quiet "Advanced with open steps" line when `wasAdvanceForced(run, mainIndex)` and that stage's aggregate is currently unmet. Completing the open steps later removes the line; the `forces` record remains as data.
- **Pips**: a skipped sub-stage's pip renders muted, same clickability.
- Keyboard navigation, draft generation flow, renderers: unchanged behavior; `buildContext` exclusion applies automatically.

## Demo and definitions

- `definitions/presales.json`: the `orals` sub-stage ("Orals Prep", in Proposal & Demo) gains `"skippable": true`. Not every pursuit has orals; this is the realistic content example the demo exercises.
- No seed changes: no run starts pre-skipped.

## Docs

Same-PR updates: core file header comment (run shape and the two maps), `README.md` (run shape bullet), `packages/react/README.md` (skipped-card behavior line), `CLAUDE.md` (run shape in Architecture; "Key behaviors to preserve" gains skip exclusion semantics and force recording).

## Out of scope

- Step-level N/A and skippable main stages.
- Conditional or branching paths.
- Skip reasons, notes, or timestamps in run state.
- Auto-skip heuristics, auto-clearing force markers, any audit or history view beyond the badges above.
- Run store version bump or migrations.

## Acceptance

- `npm test` passes with the new engine tests listed above.
- In the demo: the presales Orals Prep card offers "Mark not applicable"; skipping it removes its two steps from the Proposal & Demo aggregate (footer count shrinks) and its content stops feeding draft prompts; restoring brings both back; a forced advance past an unmet stage shows "Advanced with open steps" on that stage's cards until its open steps are completed.
- Skipped cards render dimmed with disabled inputs and a Restore control; archived runs disable both controls.
- `npm run build -w examples/demo` and `npm run types` pass.
