# spec: non-blocking advisory channel on the rolodex (per-sub-stage warnings)

Issue: #121. This is a planning-and-design document only: it defines the seam and its
contract, with no implementation. Code lands in the step-6 plan and the step-9
implementation on this same branch; nothing here should be read as already built.

One naming note up front. The issue calls the rolodex component `ProcessRolodex` and mentions
"submit", borrowing the consumer's vocabulary. In this repo the rolodex component is `Sqnce`
(exported from `packages/react/src/index.js`), and advancing past a main-stage boundary gate is
the only commit action, so there is no separate submit. This spec uses the repo's real names.

## Driving need

`Sqnce` renders gate state from its injected `validators` prop. Validators are pass-or-fail
only: a validator returns a problem message that makes its step incomplete everywhere (gates,
status, draft context), or it returns null. There is no channel for a non-blocking advisory, a
warning that informs the user without affecting whether a gate is met or whether the run can
advance.

The consumer (dawtips/presales-sqnce#32, parked upstream-first) already computes such advisories
(for example a demo-scope lint, or a volume-band warning that a stage's content is below the
size a demo usually needs) and surfaces them at its CLI, but the rolodex has nowhere to show
them. Surfacing them in the deck needs this additive `@sqnce/react` change. The existing
blocking `validators` contract must stay exactly as it is.

## The seam (chosen design: a named advisory hook, threaded like renderStageStatus)

The component already has a consistent pattern for consumer-supplied behavior: pure functions
injected as props and called with a context object. `validators` returns a message string;
`runStatus` returns a short word with an optional tone hint (`string | { word, tone } | null`);
`renderStageStatus` returns a node. Advisories
follow this pattern as a new optional prop.

- `Sqnce` gains an optional `advisories` prop: a pure function the component calls once per
  drawn sub-stage card. Its signature is `advisories(ctx) => Array<{ message, severity? }>`,
  where `ctx = { def, run, runId, subStageId }`. The consumer derives the warnings for that
  sub-stage from the run and the definition, keyed by `subStageId`. This context mirrors
  `renderStageStatus`'s `{ def, run, runId, stepId, status }`, which already passes an id string
  (not the resolved object) plus the run and definition.
- Each returned item is `{ message: string, severity?: "info" | "warning" }`. `message` is the
  text shown. `severity` is the visual weight: "warning" reads as a real warning, "info" reads
  as a gentle tip. `severity` is optional; an absent or unrecognized value normalizes to "info"
  (see normalization below). The recognized set is fixed at two values, because the channel's
  whole point is a small, consistent, clearly non-blocking vocabulary.
- Returning an empty array (or nothing) means that sub-stage has no advisories. Omitting the
  `advisories` prop entirely is the same as returning nothing for every sub-stage: zero behavior
  change for anyone not opting in.
- The hook is render-only. It is computed in the view layer and never passed to `@sqnce/core`,
  so it cannot affect `gateProgress`, `mainGateProgress`, `runSummary`, `isStepComplete`,
  `isRunComplete`, `advance`, or draft context. This is what structurally guarantees the
  "advisories inform, never block" requirement: the engine never learns advisories exist.

### Granularity: per sub-stage

Advisories attach to sub-stages, the unit the deck cards represent and the unit whose gate
progress already shows in the card foot. The consumer's warnings are about specific deliverables
(a specific sub-stage's content), not whole main stages, so per-sub-stage matches both the
existing gate surface and where the warnings originate. Per-main-stage advisories are out of
scope; a stage-wide warning, if ever needed, can be attached to a stage's first sub-stage.

### The pure resolver (React-free, total)

A new module `packages/react/src/advisories.js` exports `resolveAdvisories({ advisories, ctx })`,
mirroring `resolveStageStatus` in `stageStatus.js` and `resolveGeneratedBadge` in `badge.js`.
It is pure, React-free (so it runs under `node:test`), and total: every failure mode degrades to
an empty list rather than crashing the deck. This matches the repo's degrade-not-crash contract
(`applyReconcile`, `resolveStageStatus`, `resolveGeneratedBadge`) and the rule that a consumer
hook on a render path must never throw.

Normalization, in order:

- If `advisories` is not a function, return `[]`.
- Call `advisories(ctx)` inside a try/catch. A throw returns `[]`.
- If the return is not an array, return `[]`.
- For each item: require a `message` that is a non-empty string after trimming; drop items that
  do not have one. Normalize `severity`: keep it if it is exactly "warning" or "info"; otherwise
  (absent, null, or any unrecognized string) set it to "info". The result item is
  `{ message: <trimmed>, severity: "warning" | "info" }`.
- Return the normalized array (possibly empty).

This means a buggy consumer function can never blank or crash the deck, and the component below
can render the normalized list directly without re-checking shapes.

### Rendering in the deck (`RolodexView.jsx`)

`advisories` is threaded into `RolodexView` through the existing `slots` prop bag, alongside
`validators`, `renderers`, `generateDraft`, `generatedBadge`, and `renderStageStatus`. For each
drawn sub-stage card the component resolves the list once via
`resolveAdvisories({ advisories, ctx: { def, run, runId: activeRunId, subStageId: sub.id } })`.
Because the function is called once per drawn card, it must be cheap and pure, the same contract
`renderStageStatus` already states.

Two surfaces, both fed by that one resolved list:

- A marker in the always-visible card strip (`pf-card-strip`, which renders on every card
  including the side cards, not only the centered one). When a sub-stage has advisories, the
  strip shows a small marker so the warning is noticeable while scanning the deck without
  centering the card. The marker shows a warning glyph when any item has severity "warning",
  otherwise an info glyph, plus the count, with an accessible label summarizing it (for example
  "2 advisories"). The marker is render-only and carries no controls.
- The full notes in the centered card's foot (`pf-card-foot`). The foot is rendered only for the
  centered card and has two branches today (the frontier main stage, and browsing a committed
  stage). The advisory notes render as a block distinct from the gate-state line
  (`pf-gate-state`) in both branches, so a focused card shows every advisory's full text below or
  beside its gate state. Each note shows its severity glyph and the message.

Suppression and read-only behavior:

- Advisories are suppressed on a sub-stage the run has marked not-applicable (skipped). A skipped
  sub-stage is already excluded from the boundary gate, `runSummary`, and draft context, and its
  foot shows "Skipped, not applicable", so an advisory there would be moot. The component does
  not show the marker or the foot notes for a skipped sub-stage.
- Advisories still render on read-only or archived runs. They are informational and carry no
  controls, so there is no interaction to disable; rendering them keeps the warnings visible when
  reviewing a finished or archived run.

### Styling (`styles.js`)

New classes (`pf-advisories` for the foot block, `pf-advisory` with `pf-advisory-info` and
`pf-advisory-warning` modifiers for each note, and a card-strip marker class) are added to
`styles.js` and themed through the existing token approach. They are deliberately distinct from
the gate classes (`pf-gate-state`, `pf-gate-met`, `pf-gate-forced`) and the lock glyph, so an
advisory never reads as a blocking gate. "warning" uses a cautionary tone, "info" a quieter one;
neither uses the red lock styling that signals a closed gate.

## Why this layer, and what stays untouched

This is entirely a `@sqnce/react` change. The engine stays pure and dependency-free: no new
field on run state, no new engine function, no change to any gate, summary, completion, status,
or draft-context computation. Renderers, validators, and context views already enter core only
as arguments or not at all; advisories never enter core in any form, not even as an argument,
because the engine has no reason to know about them. The new prop sits beside the other injected
view-layer hooks and is resolved only when drawing a card.

## Acceptance criteria mapping

- "`ProcessRolodex` accepts an advisory (non-blocking) channel with per-stage warnings": the new
  `advisories` prop on `Sqnce`, resolved per sub-stage.
- "Advisories render distinctly from blocking gate state and never block submit/advance": the
  notes and marker use their own classes, separate from the gate classes, and the value is
  computed only in the view and never reaches core, so it cannot affect a gate or an advance.
- "Existing `validators` (blocking) behavior unchanged when the advisory channel is omitted":
  with the prop absent the resolver returns `[]`, nothing renders, and core (where validators
  live) is untouched.

## Testing

- A new `test/advisories.test.js` unit-tests `resolveAdvisories`, paralleling
  `stageStatus.test.js`: no function returns `[]`; a throwing function returns `[]`; a non-array
  return returns `[]`; items without a non-empty message are dropped; "warning" and "info" pass
  through; an absent or unrecognized severity normalizes to "info"; the context object is passed
  to the function unchanged.
- The "never blocks" guarantee is covered structurally rather than by a new gate test: core is
  not modified, so its existing gate, summary, and completion suites are unchanged and continue
  to pass, and advisories are computed only on the react render path.
- Existing-behavior-unchanged is covered by the resolver returning `[]` when the prop is omitted,
  so the deck renders exactly as before.
- The two new visible surfaces (the card-strip marker and the foot notes) are JSX, and this repo
  has no component-render test harness (every `packages/react` test is a pure-module test), so the
  rendering is verified by `npm run build -w examples/demo` (it compiles) plus a manual check in
  the demo app: seed a run, supply an `advisories` function that returns a "warning" item and an
  "info" item for one sub-stage, and confirm the marker shows on that card (including when it is a
  side card) and the full notes show in the centered card's foot, distinct from the gate line and
  with the gate and advance behavior unchanged.
- Gates for the change: `npm test` (runs every `*.test.js` across `packages/core` and
  `packages/react`), `npm run build -w examples/demo`, and `npm run types` (regenerate the
  `.d.ts`; CI checks they are current).

## Types and docs

- Add the `advisories` entry to the `Sqnce` prop doc comment block and to the `SqnceProps`
  typedef in `Sqnce.jsx`, describing the signature, the context object, the severity vocabulary,
  the degrade-to-empty behavior, and that it is render-only and never blocks.
- Regenerate the generated `.d.ts` with `npm run types` so consumer editors see the new prop.

## Out of scope (deferred follow-ons)

- Surfacing advisory markers in the all-stages overview modal (`OverviewModal.jsx`). The first
  cut proves the deck surface; the overview already has its own gate layout to thread into.
- Per-main-stage advisories. Granularity is per sub-stage for this change.
- Any change to the blocking `validators` channel, to core, or to run state.
