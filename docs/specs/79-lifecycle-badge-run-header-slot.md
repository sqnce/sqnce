# spec: lifecycle-aware generated badge + run-header/status slot

Issue: #79 (lifecycle-aware generated badge, plus a run-header/status slot for consumers). Milestone: "UI shell: reading mode, renderers & theming".

Two related extension points a consumer (presales-sqnce) needs: stop mislabelling finished generated output as a draft, and let the consumer surface a run-level verdict. This is a first-draft spec committed to a draft PR ahead of the Codex review loop.

Layer: pure `@sqnce/react`. Part 1 touches `packages/react/src/OutputView.jsx` (the badge) and `packages/react/src/ProcessRolodex.jsx` (threading the step lifecycle and an optional override prop). Part 2 adds injected props to `ProcessRolodex` and surfaces a status word in `packages/react/src/RunSidebar.jsx` and `packages/react/src/RunsScreen.jsx`. No `@sqnce/core` change.

## Part 1: lifecycle-aware generated badge

### Current behavior

The generated-output badge text is the literal string `"AI draft"`, hardcoded in two places in `OutputView.jsx`: the `DefaultEditor` text branch and the renderer view branch. It is shown whenever `generated` is true (the output was produced by `generateDraft`, tracked by `isOutputGenerated`), regardless of the owning step's state. `OutputView` receives the `generated` boolean but not the step's lifecycle state. The step lifecycle is computed one level up in `ProcessRolodex.statusOf(sub, step)`, which returns `"done"`, `"draft"`, or `"open"`.

### Problem

On a step that has been marked done or accepted, "AI draft" is wrong and misleading: the output is no longer a draft. The label should reflect where the output sits in its lifecycle.

### Change

Make the badge lifecycle-aware, and overridable.

1. Thread the owning step's lifecycle state into `OutputView` (a `lifecycle` prop carrying the `statusOf` result, or a narrower `accepted` boolean). The badge is a render-only marker (`pointer-events: none`), so this is presentation only and never enters the output value.
2. Pick the badge text from the lifecycle state with a default mapping: an open or draft step keeps `"AI draft"`; a done/accepted step shows a quiet neutral marker (recommended `"AI generated"`) so the AI provenance is preserved without claiming the output is still a draft.
3. Allow a consumer override: an optional `generatedBadge` resolver prop on `ProcessRolodex`, for example `(lifecycle, spec) => string | null`, where a returned string is the label and `null` hides the badge. Omitting it uses the default mapping. This satisfies the "fully themeable/overridable" half of the issue.

The two hardcoded sites collapse to one resolved label applied in both branches.

## Part 2: run-header / status slot for consumers

sqnce stays content-agnostic, so it provides the slot and the placement while the consumer provides the text and its derivation.

### Change

Add two optional injected props to `ProcessRolodex`, consistent with the existing injected props (`persistence`, `generateDraft`, `renderers`, `validators`): each defaults to absent and the component works unchanged when omitted.

1. `renderRunHeader`: a function `({ def, run, runId, subject, complete }) => ReactNode` (or a component) mounted in a run-level header band, for example a final verdict banner. The band placement is the reading-mode header band introduced in #78; until #78 lands, the slot can also mount above the authoring rolodex. The consumer closes over its own data and may derive the node from `run.stepState` (for example presales reads its QA stage).
2. `runStatus`: a function `({ def, run, runId }) => string | { word, tone } | null` returning a short per-run status word. It is shown next to each run in the runs sidebar (`RunSidebar.jsx`) and the runs screen (`RunsScreen.jsx`), and is available to the reading-mode header band. The consumer derives the word (presales derives ACCEPT or REVISE from its QA stage); `tone`, if returned, is an opaque hint the shell may map to a visual treatment (it must degrade to a plain word).

These slots receive only `def`, `run`, and `runId`, never consumer domain knowledge baked into sqnce. The shell provides where the text goes; the consumer provides what it says.

## Dependency note

Part 2's header band placement is provided by #78 (reading mode supplies the run header band). #79 defines the slot props and the sidebar/runs-screen status word, which stand alone, and the reading-mode band consumes `renderRunHeader` once #78 lands. The two issues are co-designed; neither hard-blocks the other (the header slot can mount above the rolodex in the interim).

## Out of scope

- Any `@sqnce/core` change.
- The actual ACCEPT/REVISE derivation, which is the consumer's (presales-sqnce).
- The reading-mode layout itself (#78). #79 provides the slot the band mounts.

## Acceptance

- A generated output on a done/accepted step is not labelled "AI draft" (it shows the lifecycle-aware default, or the consumer override).
- A consumer can mount a run-level header node and a per-run status word through injected props; with both props omitted, `ProcessRolodex` renders exactly as today.
- The consumer-supplied status word appears next to runs in the runs sidebar.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` pass.

## Open questions for approval

1. On an accepted generated output: relabel quietly to "AI generated" (preserves provenance) or hide the badge entirely. Recommendation: relabel quietly.
2. Should the run-header slot also render above the authoring rolodex, or only in the reading-mode band from #78. Recommendation: render in the reading-mode band, with an interim mount above the rolodex until #78 lands.
3. Shape of `runStatus`: a plain string, or `{ word, tone }`. Recommendation: accept either, treat a bare string as `{ word }`.
