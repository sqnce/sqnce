# spec: inputs panel hides a skipped sub-stage's outputs

Issue: #49. Found during #5 acceptance review.

## Problem

The "Inputs from <previous sub-stage>" panel on the centered card is built from `prevDoneBlocks` (`packages/react/src/ProcessRolodex.jsx`), which filters the previous sub-stage's steps only on completion and output presence. When that previous sub-stage is skipped (marked not applicable), outputs entered before the skip still render as inputs. This contradicts the #5 guarantee: `buildContext` excludes a skipped sub-stage's outputs from draft context, so the panel claims content is an input that the engine no longer uses.

The bug only manifests when a sub-stage had outputs before being marked not applicable (skip and unskip never touch `stepState`, so the orphaned outputs persist).

## Fix

UI-only, no engine work. In `prevDoneBlocks`, treat a skipped previous sub-stage as having no input blocks: when `isSubStageSkipped(run, prevSub.id)` is true, the list is empty. The panel already renders only when `prevDoneBlocks.length > 0`, so the whole panel disappears.

The panel only ever shows the immediately previous sub-stage (`prevSub = subs[idx - 1]`), so "hide the panel" and "hide the skipped sub-stage's blocks" are the same change. `isSubStageSkipped` is already imported in `ProcessRolodex.jsx`.

## Non-goals

- Falling back to the nearest non-skipped earlier sub-stage when `prevSub` is skipped. The panel is defined as "inputs from the previous sub-stage"; when that sub-stage is not applicable, there are no inputs to show. Mirrors how `buildContext` drops the skipped sub-stage rather than substituting another.
- Any engine change. `buildContext` already behaves correctly; this aligns the panel with it.

## Acceptance criteria

- With outputs entered in a skippable sub-stage and the sub-stage then skipped, the following card shows no "Inputs from" panel for it.
- Restoring (unskipping) the sub-stage brings the panel back unchanged, since `stepState` was never touched.
- Non-skipped previous sub-stages behave exactly as today.

## Verification

`packages/react` has no test suite; verification is the esbuild syntax check on `ProcessRolodex.jsx` and `npm run build -w examples/demo`, plus manual confirmation in the demo app (enter outputs in a skippable sub-stage, skip it, check the next card; unskip, check the panel returns).
