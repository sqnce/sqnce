# spec: lifecycle-aware generated badge + run-header/status slot

Issue: #79 (lifecycle-aware generated badge, plus a run-header/status slot for consumers). Milestone: "UI shell: reading mode, renderers & theming".

Two related extension points a consumer (presales-sqnce) needs: stop mislabelling finished generated output as a draft, and let the consumer surface a run-level verdict. This spec was first drafted ahead of the Codex review loop and is revised here after that loop and an adversarial review against current main, which now includes #78 (reading mode for finished runs).

Layer: pure `@sqnce/react`. Part 1 touches `packages/react/src/OutputView.jsx` (the badge) and `packages/react/src/ProcessRolodex.jsx` (threading the step lifecycle and an optional override prop). Part 2 adds injected props to `ProcessRolodex`, threads them into `packages/react/src/ReadingView.jsx` (the run header band added by #78), and surfaces a status word in `packages/react/src/RunSidebar.jsx` and `packages/react/src/RunsScreen.jsx`. No `@sqnce/core` change.

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

1. `renderRunHeader`: a function `({ def, run, runId, subject, complete }) => ReactNode` (or a component) mounted in a run-level header band, for example a final verdict banner. The band is the reading-mode header band that #78 added (`packages/react/src/ReadingView.jsx`, the `.pf-read-band` header), so #79 mounts `renderRunHeader` into that existing band rather than building its own placement. The consumer closes over its own data and may derive the node from `run.stepState` (for example presales reads its QA stage). The band only renders for a finished run, so `complete` is true whenever the slot fires; it stays in the signature so a future non-band mount could pass a real value.
2. `runStatus`: a function `({ def, run, runId }) => string | { word, tone } | null` returning a short per-run status word. It is shown next to each run in the runs sidebar (`RunSidebar.jsx`) and the runs screen (`RunsScreen.jsx`), and in the reading-mode header band, where it replaces the band's current hardcoded `"Complete"` status word (`ReadingView.jsx`, the `.pf-read-status` span); with `runStatus` omitted the band keeps showing `"Complete"`. The consumer derives the word (presales derives ACCEPT or REVISE from its QA stage); `tone`, if returned, is an opaque hint the shell may map to a visual treatment (it must degrade to a plain word).

These slots receive only sqnce-derived run data (`renderRunHeader` gets `def`, `run`, `runId`, `subject`, and `complete`; `runStatus` gets `def`, `run`, and `runId`), never consumer domain knowledge baked into sqnce. The shell provides where the text goes; the consumer provides what it says.

## Dependency note

#78 (reading mode for finished runs) has landed on main: it added `packages/react/src/ReadingView.jsx` with the run header band (`.pf-read-band`) and a hardcoded `"Complete"` status word in `.pf-read-status`. So #79's header band placement already exists. #79 mounts `renderRunHeader` into that band and feeds `runStatus` into the `.pf-read-status` word. The sidebar and runs-screen status word stand alone from the band. An earlier draft of this spec, written before #78 merged, considered an interim mount above the authoring rolodex; that path is dropped because the band #78 supplies is now present.

## Out of scope

- Any `@sqnce/core` change.
- The actual ACCEPT/REVISE derivation, which is the consumer's (presales-sqnce).
- The reading-mode layout itself (#78, already merged). #79 only mounts its two slots into the band #78 provides.

## Acceptance

- A generated output on a done/accepted step is not labelled "AI draft" (it shows the lifecycle-aware default, or the consumer override).
- A consumer can mount a run-level header node and a per-run status word through injected props; with both props omitted, `ProcessRolodex` renders exactly as today (including the band's existing `"Complete"` word).
- The consumer-supplied status word appears next to runs in the runs sidebar and the runs screen.
- The consumer-supplied status word appears on the reading-mode run headline, replacing the default `"Complete"`.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` pass.

## Open questions for approval

1. On an accepted generated output: relabel quietly to "AI generated" (preserves provenance) or hide the badge entirely. Recommendation: relabel quietly.
2. (Resolved by #78 landing.) The run-header slot mounts only in the reading-mode band, which now exists (`ReadingView.jsx`, `.pf-read-band`). No interim mount above the authoring rolodex is needed.
3. Shape of `runStatus`: a plain string, or `{ word, tone }`. Recommendation: accept either, treat a bare string as `{ word }`.
