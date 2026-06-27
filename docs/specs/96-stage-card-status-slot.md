# spec: per-step status slot on stage cards

Issue: #96 (a neutral per-stage-card status slot so a consumer can badge an individual stage card). Milestone: "UI shell: reading mode, renderers & theming".

#79 (merged in #88) gave consumers a run-level header band (`renderRunHeader`) and a per-run status word (`runStatus`), plus a lifecycle-aware generated badge. Those cover the run headline and the runs list, but not an individual stage card: each step on a deck card still shows a hard-coded "Done", "Draft", or blank word, and there is no slot a consumer can use to paint its own status there. This spec adds that slot. It follows the same split #79 established: sqnce provides where the badge goes, the consumer provides what it says.

Layer: pure `@sqnce/react`. It touches `packages/react/src/ProcessRolodex.jsx` (the per-step status word on the deck cards) and adds one pure helper module, `packages/react/src/stageStatus.js`, with a unit test. It also wires the new slot into the reference consumer, `examples/demo/src/App.jsx`. No `@sqnce/core` change.

## Current behavior

In the rolodex authoring deck, `ProcessRolodex.jsx` renders each sub-stage as a card (`pf-card`) and, inside the card, each step as a row. Every step row shows a small status word in its `pf-step-state` span, computed inline at `ProcessRolodex.jsx:844` as `status === "done" ? "Done" : status === "draft" ? "Draft" : ""`. The lifecycle value comes from `statusOf(sub, step)`, which returns `"done"`, `"draft"`, or `"open"`. There is no way for a consumer to override that word.

## Problem

A consumer (presales-sqnce, issue #127) wants to badge the Package and Package QA stage cards with the run's ACCEPT or REVISE verdict, so readiness reads at a glance without expanding anything. In that workflow each of those stages is a main stage holding a single-step sub-stage, so the step's status word is exactly what reads as the card's status. Today that word is the generic "Done", which is the wrong signal: it says nothing about whether the package passed QA, and it competes with the real verdict that is otherwise buried in the stage's output. The consumer needs a slot to replace that word with its own derived badge.

## Change

Add one optional injected prop to `ProcessRolodex`, consistent with the existing injected props (`persistence`, `generateDraft`, `renderers`, `validators`, `generatedBadge`, `renderRunHeader`, `runStatus`): it defaults to absent and the component renders exactly as today when omitted.

### The prop

`renderStageStatus`: a plain function `({ def, run, runId, stepId, status }) => ReactNode | null`, called once per step that the deck draws. It is the same render-prop family as `runStatus` (a pure function the shell calls), not a mounted component, so a consumer that needs hooks returns its own component element as the node (for example `<VerdictBadge run={run} stepId={stepId} />`) and React mounts it where the node is placed. The context carries only sqnce-derived run data:

- `def`: the active workflow definition.
- `run`: the active run state, so the consumer can read any step's output (for example presales reads its QA stage via `getStepEntry`) to derive the verdict.
- `runId`: the active run entry id, or null when there is no active run entry, matching the `runId` the other slots already receive.
- `stepId`: the id of the step whose status word is being drawn, so the consumer can badge only the steps it cares about.
- `status`: the step's computed lifecycle (`"done"`, `"draft"`, or `"open"`), so the consumer can branch on it or reproduce the default word if it wants to augment rather than replace.

### Behavior: override with fallback

On each step's status word, the shell calls `renderStageStatus`. If it returns a node, that node replaces the generic "Done"/"Draft"/blank word in the `pf-step-state` span. Only a `null` or `undefined` return falls back to the generic word; any other return value is rendered as the consumer gave it, so a consumer that wants to show nothing returns its own empty node and returns null only to defer to the default. This is the same override-with-fallback contract as `runStatus` (returns nothing, keep the default "Complete") and `generatedBadge` (returns null, hide). It lets the consumer suppress the competing "Done" that #127 wants quiet by returning its own pill instead.

The slot fires for every step the deck draws, which is the centered card and the side cards inside the deck's render window: the deck culls cards more than two stages from center (`ProcessRolodex.jsx:730`) and draws the cards two stages out at zero opacity (`:742`), so only the centered card and its immediate, dimmed neighbors actually show the badge. The badge therefore appears wherever the generic status word already appears, never on a card that is off-screen. The at-a-glance, view-from-anywhere surface for a run-level verdict is the already-shipped run-header band; this slot adds the badge to the stage cards themselves as the consultant browses the deck, so the two surfaces are complementary, not a substitute for each other.

The consumer owns the node's markup and styling (its colour and shape), the shell owns its placement in the status-word span. This is presentation only: the returned node never enters the output value or any gate, the same as the other render slots. Because the slot is called once per drawn step on every render, the consumer's function should be cheap and pure; heavy derivation (for example re-scanning the run to compute a verdict) belongs inside the returned component, where it can memoize, not in the function body.

### Internal structure

Extract the resolve decision into a new pure, React-free helper, `packages/react/src/stageStatus.js`, mirroring `runStatus.js`. It holds the generic mapping (`"done"` to `"Done"`, `"draft"` to `"Draft"`, else `""`) and the decision: when the prop is a function and returns a non-null node, the node is shown, else the generic word is shown. `ProcessRolodex.jsx` imports the helper and replaces the inline ternary at line 844 with a call to it. Keeping the decision in a React-free module is what lets it run under `node:test`, the same pattern `runStatus.js` and `badge.js` already follow.

The helper returns a small discriminated result (the consumer's node, or the fallback word) rather than rendering, so the JSX stays thin and the logic stays testable without a DOM.

### Demo wiring

Wire a minimal `renderStageStatus` into `examples/demo/src/App.jsx`, the reference consumer, the same way the demo wires `runStatus` and `renderRunHeader` today. It badges one stage with a simple derived word so the public API is exercised by the demo build (the CI build gate) and serves as the copy-paste reference for downstream consumers.

### Types

Add the `renderStageStatus` property to the `ProcessRolodexProps` typedef in `ProcessRolodex.jsx`. `npm run types` regenerates the `.d.ts` so consumer editors see the new prop.

## Surfaces

This affects the rolodex authoring deck only. Reading view (`ReadingView.jsx`), where a finished run lands by default, is untouched: its run-headline verdict is already covered by the `renderRunHeader` band from #79, and it has no per-step status word to override. Per-section badges in reading view are out of scope for this issue.

## Out of scope

- Any `@sqnce/core` change.
- A per-card (whole sub-stage) badge, or a badge on the top main-stage rail. This issue is the per-step status word only, the unit #96 names.
- Per-section status badges in reading view.
- The actual ACCEPT/REVISE derivation, which is the consumer's (presales-sqnce #127).

## Acceptance

- A consumer can supply `renderStageStatus`; its returned node replaces the generic status word on the matching step's deck-card row, and a `null`/`undefined` return falls back to the generic "Done"/"Draft"/blank word.
- With `renderStageStatus` omitted, `ProcessRolodex` renders exactly as today.
- The badge shows on the step's status word wherever that word renders: the centered card and the in-window side cards (it is not expected on cards the deck does not draw).
- The resolve decision lives in a pure `stageStatus.js` helper with a unit test (`packages/react/test/stageStatus.test.js`) covering: prop absent yields the generic word for each of done, draft, and open; prop returning null falls back to the generic word; prop returning a node passes that node through.
- The demo wires `renderStageStatus` so the slot is exercised by the demo build.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` pass.

## Verification note

`@sqnce/react` has no DOM render harness, so its components are verified manually in the demo (the established pattern; every existing `packages/react/test/*.test.js` tests an extracted pure module, never a rendered component). The JSX wiring of the slot is verified by driving the demo: pass a `renderStageStatus` that returns a visible pill, confirm it replaces the status word on the matching deck card and that other steps keep their generic word.

## Open question for approval

1. Prop name. The spec keeps the issue's name `renderStageStatus` because it matches the "stage card" mental model, even though the context key is `stepId`. The precise per-step analog would be `renderStepStatus`. Recommendation: keep `renderStageStatus` (matches the issue and the user-facing stage-card concept).
