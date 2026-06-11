# spec: workflow overview modal

Issue: #8.

## Goal

A modal that explains the active workflow: what the process is, how its gates work, its full stage tree, and where the user currently is in it. Opened from a help button in the header, fully derived from the definition plus run state, useful to a first-time visitor who lands mid-process and wants orientation.

## Non-goals

- Auto-open on first run, keyboard shortcut, or any persisted "seen" flag. The button is the only trigger.
- Navigation from the modal (click-to-jump). The rail and arrow browsing already own navigation; the modal is read-only.
- LLM-generated narrative. Content is static and deterministic; `generateDraft` is not involved.
- Engine changes. `@sqnce/core` already exports everything the modal needs.
- New `ProcessRolodex` props or any consumer-facing API surface. This is additive internal UI, a patch release under the 0.x regime.

## Trigger

A new "About" button in `pf-header-right`, styled like the existing Runs and Reset run buttons (`pf-reset` class), with `title="About this process"`. It renders only in the rolodex view, like the `pf-counter`, because "where am I" has no referent on the runs screen. It is never disabled: archived (read-only) runs still get orientation.

## Modal

New component `OverviewModal` in `packages/react/src/OverviewModal.jsx`, rendered by `ProcessRolodex` when a transient `overviewOpen` state is true. It reuses the established full-screen overlay pattern from `OutputView.jsx` (`pf-overlay`, `pf-overlay-head`, `pf-overlay-title`, `pf-overlay-body`, `role="dialog"`, `aria-modal="true"`), with overlay title "About this process". New content styles use `pf-ov-*` classes appended to the component CSS string in `ProcessRolodex.jsx`.

Closing: the X button in the overlay head, or Escape. The Escape handler follows the existing arrow-key handler pattern (window keydown listener) but is registered only while the modal is open and does not carry the textarea/input guard, since Escape is not a typing key and the modal should always close. While the modal is open the existing arrow-key browsing handler is suppressed, so the rolodex cannot move behind the overlay. Open state is component-local and never persisted; switching runs, workflows, or views clears it via the existing transient-clearing path.

## Content

Four sections, top to bottom, all computed from `def` and `run` with already-imported core functions (`flattenSubStages`, `mainGateProgress`, `gateProgress`, `gateTypeOf`, `runSummary`, `isSubStageSkipped`, `wasAdvanceForced`).

1. **Process overview.** `def.name` as the heading, `def.short` as the line under it, omitted when absent.
2. **How it works.** Short static copy explaining the gate model, parameterized by what this definition actually uses:
   - Step completion: mentions the hybrid rule (any output or a done mark) and the strict rule (explicit done only) only for gate types present in the definition.
   - Within a committed main stage, sub-stages are freely browsable; the next main stage commits at its boundary gate, the aggregate of the stage's sub-stage gates.
   - The gate guides, never blocks: advancing past an unmet gate is always possible with the explicit override.
   - If any sub-stage is `skippable`, one line explains marking a sub-stage not applicable and that skipped sub-stages leave the gate aggregate and progress counts.
3. **Stages.** The full tree. Main stage rows mirror the header rail logic exactly: ✓ when `mainGateProgress(...).met`, the stage number otherwise, 🔒 when beyond the frontier, with the active stage (the one containing the centered sub-stage) highlighted. A stage gets a small "advanced with open steps" note when `wasAdvanceForced(run, mi)` is true and its gate is currently unmet, mirroring the card UI (`ProcessRolodex.jsx` shows the forced marker only under that same condition, and the modal reuses its copy): the run-state marker is never auto-cleared, but once the gate is met the note disappears. Sub-stage rows show name, description, gate type, and status: met (gate met), in progress (gate unmet), or not applicable (skipped). The centered sub-stage (`idx`) carries a "you are here" marker.
4. **Progress.** "N of M gates met" from `runSummary(def, run, { validators })`. Skipped sub-stages are excluded by the engine; the modal does not recount.

Validators thread through every gate computation (`{ validators }`), so a step with an invalid value reads incomplete here exactly as it does in the rail and cards.

## Acceptance criteria

- An About button appears in the header in the rolodex view only; clicking it opens a full-screen overlay titled "About this process".
- The overlay shows the four sections above; the "you are here" marker sits on the sub-stage the rolodex currently centers, including while browsing history.
- Main stage glyphs and states in the modal always agree with the header rail for the same run state.
- Skipped sub-stages read "not applicable" and the progress count matches `runSummary` (which excludes them).
- A stage advanced with the override shows the "advanced with open steps" note while its gate remains unmet; the note disappears once the gate is later met, matching the card UI. A stage advanced through a met gate never shows it.
- X and Escape both close the modal; Escape works even when focus is in a textarea or input. Arrow-key browsing behind the modal is not triggered while it is open.
- Archived (read-only) runs can open and read the modal.
- The hybrid/strict explainer lines and the skip line appear only when the definition uses those gate types or has a skippable sub-stage.
- Omitting `def.short` omits the overview line; nothing renders blank.

## Verification

`packages/react` has no test suite; verification is the esbuild syntax check on `OverviewModal.jsx` and `ProcessRolodex.jsx`, `npm run build -w examples/demo`, and manual confirmation in the demo app: open the modal mid-run in a seeded workflow, check the tree against the rail, browse to another sub-stage and re-open to see the marker move, skip a sub-stage and confirm the not applicable row and progress count, force an advance and confirm the override note.
