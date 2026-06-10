# spec: reopened and generated flags in step state

Issues: #3 (Reopen has no effect on steps with output content under a hybrid gate), #20 (tint generated drafts so AI content is distinguishable from hand-typed).

Batch 2 of the spec series. This PR is parked at the spec-approval gate; implementation follows approval.

## Why these two together

Both add per-step metadata to the run's step entry (today `{ checkedDone, outputs }`) and wire status display in `@sqnce/react`. One PR keeps the state-shape change coherent. Both core changes are TDD: tests first, then implementation.

## Assumes merged

Batch 1 (PR #38: #34, #35, #10). Engine tests are fixture-based, and the claude-artifact example is gone, so nothing mirrors there.

## State shape

A step entry gains two optional fields, absent by default:

```
{ checkedDone, outputs, reopened?: boolean, generated?: { [outputId]: true } }
```

Absent means false or empty. `emptyStepEntry()` stays `{ checkedDone: false, outputs: {} }`; existing seeds and persisted runs keep working without migration.

## #3: reopened flag (core, TDD)

### Semantics

- New `reopenStep(run, stepId)`: returns a new run with `checkedDone: false, reopened: true` on the step. The UI's Reopen action calls this instead of `setCheckedDone(run, stepId, false)`.
- While `reopened` is set, the hybrid content-completes rule is suppressed: under hybrid, complete means `checkedDone || (!reopened && stepHasAnyOutput)`. The step counts as incomplete even with output content.
- Strict gates are unaffected: complete stays `checkedDone` only; the flag is ignored.
- The flag clears when the step is touched again: any `setOutput` on the step clears it (including a generated write, and including writes that empty a value), and `setCheckedDone(run, stepId, true)` clears it.
- `gateProgress` and `buildContext` respect the flag by construction (both route through `isStepComplete`) and get explicit test coverage.

### Tests (written first)

- Reopen suppresses content completion under a hybrid gate.
- Editing an output clears the flag; the step completes again by content.
- Re-marking done clears the flag; the step completes.
- Strict gate behavior is unchanged by the flag.
- `gateProgress` counts a reopened required step as missing.
- `buildContext` excludes a reopened step's outputs.
- `reopenStep` on a step with no existing entry creates one safely.

## #20: generated flag (core, TDD)

### Semantics

- `setOutput` gains an options argument: `setOutput(run, stepId, outputId, value, { generated = false } = {})`. With `generated: true` the write records `generated[outputId] = true` on the entry; the default (a hand edit) deletes the mark. Clear-on-edit is the chosen reading of the issue's "clear or downgrade sensibly".
- New selector `isOutputGenerated(run, stepId, outputId)` for the UI.
- The flag is provenance metadata only: `hasValue`, `serializeStep`, `buildContext`, and draft prompts ignore it. Values feed LLM prompts; provenance does not.
- The engine stays pure and dependency-free.

### Tests (written first)

- A generated write marks the output; a subsequent plain write clears the mark.
- Regenerating after a hand edit re-marks it.
- `serializeStep` and `buildContext` output is identical with and without the mark.
- A generated write clears `reopened` (the touch rule from #3).

## React wiring

`packages/react/src/ProcessRolodex.jsx`:

- The Reopen button calls `reopenStep`. A reopened content-bearing step returns to its pre-done status look ("draft": has content, not complete); the button flips back to "Mark done". No new status kind is introduced.
- `generate()` writes the draft with `{ generated: true }`.

`packages/react/src/OutputView.jsx` (default text editor):

- When the target output's generated flag is set, the textarea gets a tinted treatment plus a small "AI draft" marker so generated content reads as generated at a glance.
- Hand-editing goes through the existing plain `onChange` path, which clears the flag and the tint.
- How the generated bit reaches `OutputView` (context vs prop) is a plan-level detail.
- Read-only (archived) runs show the tint; mutations stay blocked by the existing `readOnly` guards.

## Docs alignment

- The run-shape comment in `packages/core/src/index.js` and the RUN line in the README architecture diagram gain the optional fields.
- CLAUDE.md's run shape mention (`{ idx, frontier, stepState }`) stays accurate and unchanged.

## Sequencing

#3 first, then #20: both touch `setOutput`, and #20's generated-write behavior depends on #3's touch rule being in place.

## Acceptance

- All engine tests above pass; coverage names each #3 acceptance behavior from the issue (reopen suppresses content completion, edit clears, re-done clears, strict unchanged, gateProgress and buildContext respect the flag).
- In the demo: Reopen visibly reopens a content-bearing step under a hybrid gate; a generated draft is visually distinct from hand-typed text; editing it removes the distinction; regenerating restores it.
- `npm test` and `npm run build -w examples/demo` pass.

## Out of scope

- Generate/Regenerate affordance polish (spinner, dashed empty state): #19, batch 4.
- Renderer changes of any kind.
- Run-store version bump or migrations: the new fields are optional and additive.

## Open questions for approval

1. Reopened display: this spec returns the step to its normal incomplete look rather than inventing a distinct "reopened" status treatment. Say so if you want a visible reopened marker.
2. Generated-flag lifecycle: binary clear-on-edit is specced. The alternative is a third "generated, then edited" downgraded state; recommend binary.
