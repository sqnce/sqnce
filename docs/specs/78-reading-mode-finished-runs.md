# spec: reading mode for finished runs

Issue: #78 (reading mode for finished runs, keep the authoring deck behind a toggle). Milestone: "UI shell: reading mode, renderers & theming".

The decision is already locked in the issue body: Option A, add a reading view and keep the authoring deck. This spec is the design for Option A. It is a first-draft spec committed to a draft PR ahead of the Codex review loop, which runs later.

Layer: pure `@sqnce/react` work in `packages/react/src/ProcessRolodex.jsx` plus a new reading-mode subtree (likely a new `ReadingView.jsx` so the deck file does not grow further). No `@sqnce/core` change is required: run completeness comes from the existing `isRunComplete` export, and navigation reuses the existing `jumpTo` primitive. Renderers and validators stay injected, and the reading canvas reuses `OutputView` for output rendering.

## Current behavior

- `ProcessRolodex` carries a `view` state with two values: `"rolodex"` (the authoring card-deck) and `"runs"` (the runs screen). The reading frame does not exist yet.
- The deck (`pf-deck`) renders the centered sub-stage as a 3D card using `perspective` and `rotateY` transforms. The top `pf-rail` shows the main stages as a strip that looks like tabs but has no `onClick`, so it is inert. Navigation is one step at a time via `doBrowse` (prev/next) and the pip row.
- Output content opens collapsed: each step body sits behind an expand toggle, and renderer panels are capped at 280px with an expand-to-overlay affordance.
- For a finished run the user is reading a deliverable rather than building it, so this authoring frame is the wrong default.

## How we know a run is finished

`@sqnce/core` already exports the predicate for this: `isRunComplete(definition, run, { validators })`. Reading mode calls it to decide whether a run is finished. The react layer adds no completeness logic of its own, and no `@sqnce/core` change is needed because the helper already exists (it landed with the #66 sub-branching work).

Using the export rather than a hand-rolled check matters for correctness, because the naive formula (frontier on the last main stage with that stage's gate met) is wrong in two ways the engine already handles:

- Forked runs (#66 sub-branching). A finished forked run keeps `run.frontier` at the end of the shared spine while completion is tracked through the per-track frontier, any skipped tracks, and the gates along the kept path. The naive frontier check never becomes true for a fork, so finished forked runs would wrongly open in authoring mode. `isRunComplete` reports completeness once the spine is committed, the fork has opened, every kept track has reached its terminal, and every non-skipped gate along the kept path is met.
- Forced advances past an unmet gate. `isRunComplete` requires every non-skipped main-stage gate to be met, not only the last one, so a run that force-advanced past an earlier unmet gate is correctly not finished. A reading-mode deliverable should reflect met gates end to end, which is what the export checks.

Both the linear and the forked branch live inside the one export, so reading mode stays a single call regardless of whether the definition forks.

## Change (Option A): add reading mode as a third view

Add `view === "reading"` as a third top-level view alongside `"rolodex"` and `"runs"`. Reading mode uses a flat (non-3D) layout, so it does not reintroduce the trap where the card deck's CSS transform captures `position: fixed` overlays. The issue calls this out: today overlays portal to `body` to escape the deck's transform, and reading mode must not recreate a transformed ancestor. A flat layout has no transformed ancestor, so fixed overlays inside it behave normally.

Default view selection: when a run is complete (per the rule above), opening it defaults to reading mode; otherwise it opens in the authoring rolodex as today. Opening a run from the runs screen and switching runs both route a complete run to reading and an in-progress run to rolodex.

### Reading-mode layout

1. Persistent left contents rail. Lists the main stages as a real, clickable table of contents with a "you are here" marker on the selected stage. Clicking an entry selects that stage in the reading canvas. This uses the same jump semantics as #85 (the `jumpTo` primitive): the rail lists exactly the committed reachable stages, the ones `jumpTo` accepts, so a main stage appears when its first sub-stage is reachable. For a linear run that is every stage at or before the frontier. For a forked run the frontier stays at the end of the shared spine while the opened track stages are reachable through the per-track frontier (skipped tracks excluded), so defining the rail by reachability rather than by `frontier` alone keeps the whole finished deliverable readable. For a complete run the kept path is fully committed, so the rail covers the entire run. #78 introduces the rail inside reading mode; #85 makes the authoring-mode stepper clickable. They share the jump primitive but live in different views. Within reading mode this rail replaces the inert strip.
2. Run header band. Shows the run title plus a prominent terminal status. The status word and any banner come from the consumer-supplied run-header/status slot defined in #79; #78 provides the band placement, #79 provides the slot mechanism and the lifecycle-aware status. Until #79 lands, the band shows the run name and a neutral derived status word ("Complete").
3. Reading canvas. Renders the selected stage as a document page with its outputs expanded by default rather than collapsed behind toggles, one stage at a time, with quiet prev/next at the foot. Prev/next walk the committed reachable stages in reading order: the shared spine first, then each kept track in declaration order, with skipped tracks omitted, so a forked run has a defined linear traversal (for a linear run this is just stage order). The contents rail still allows direct cross-track jumps. It reuses `OutputView` and the injected renderers in a read-oriented presentation, with editing affordances suppressed by default (editing happens in authoring mode).

### Edit toggle

An "Edit run" control switches from reading mode into the authoring rolodex for the same run (add, do not replace). A matching control returns to reading mode. The card-deck authoring mode is unchanged. Switching views never mutates run state.

### Responsive

- The contents rail collapses to a drawer on narrow and projector widths; the reading column keeps its measure (a bounded line length).
- A two-pane custom renderer degrades to a list-then-detail layout at narrow widths.

## Out of scope

- Any `@sqnce/core` change. Completeness comes from the existing `isRunComplete` export.
- The consumer-supplied status text and its derivation. That is #79; #78 provides only the header band placement and a neutral default.
- Within-document section navigation in the reading canvas. That is #86, which targets the expand overlay; reading mode benefits from it but does not implement it here.
- Making the authoring-mode stepper clickable. That is #85.

## Acceptance

- A complete run opens in reading mode by default; an in-progress run opens in the authoring rolodex.
- Completeness comes from the core `isRunComplete` export, so a complete forked run (its frontier still at the spine end, every kept track at its terminal) opens in reading mode, not authoring.
- Reading mode shows a clickable contents rail with a "you are here" marker, a run header band, and the selected stage's outputs expanded.
- For a complete forked run, the contents rail lists every kept track stage (the committed reachable set), not only the shared spine stages, and skipped tracks are omitted.
- "Edit run" switches to the authoring card-deck for the same run and back, with no change to run state.
- No `position: fixed` overlay is trapped by a transformed ancestor in reading mode.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` pass.

## Open questions for approval

1. Contents rail granularity: main stages only, or main stages with sub-stages nested. Recommendation: main stages, expandable to sub-stages if needed.
2. Default reading mode for complete runs immediately, or keep it opt-in via the toggle until #79's status slot lands. Recommendation: default it on now; the header shows a neutral "Complete" until #79.
3. Reading-canvas prev/next order across a fork: the shared spine then each kept track in declaration order (skipped tracks omitted), versus within-track only with cross-track moves left to the rail. Recommendation: spine then kept tracks in declaration order, so the deliverable reads top to bottom.
