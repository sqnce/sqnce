# spec: clickable stage navigation (jump-to-stage)

Issue: #85 (clickable stage navigation, jump-to-stage). Milestone: "UI shell: reading mode, renderers & theming". Supersedes the now-closed duplicate #82. Source: the presales UI-presentation evaluation, finding M1 (severity Medium).

A spec committed to a draft PR, carried through the Codex review loop and the adversarial review before the owner's spec-approval gate.

Layer: pure `@sqnce/react`, in `packages/react/src/ProcessRolodex.jsx` (the top header rail). The navigation primitive `jumpTo` already exists in `@sqnce/core` and is already used by the pip row and the side cards (to jump) and by the reading-mode contents list (as a reachability probe), so no `@sqnce/core` change is needed.

## Current behavior

The top header rail renders each main stage as a `span` carrying a glyph (a tick when the stage's gate is met, a lock when it is ahead, otherwise its number) and the stage name, with state classes for active, done, and ahead. The rail has no `onClick`, so it looks like a tab bar but does nothing.

Navigation today happens three other ways: prev/next steps through one sub-stage at a time; the pip row already calls `jumpTo` on click to reach a sub-stage; and the immediate neighbor cards (one position away) are clickable to jump. Only the main-stage rail is inert.

The primitive `jumpTo(run, subStages, index)` moves the centered card to a flat sub-stage index when that index is in the engine's committed reachable set, and returns the run unchanged (a no-op) otherwise. For a linear run the reachable set is the contiguous committed prefix, so it is exactly the sub-stages at or before the frontier; for a forked run it also includes each open track's committed stages (see "Forked runs" below).

## Problem

On a finished run, the most common action is looking back to an earlier stage (the findings, the inventory, the design brief), and that is the worst-supported path. Reaching an early stage costs many sequential prev clicks, the rail looks clickable but is not, and the deck hides any card more than one stage away. The evaluation measured roughly eight sequential clicks to reach Findings and no one-action path to the design brief. In a live meeting the reader cannot pivot to the stage just asked about, and their first instinct (clicking the stepper) is wasted.

## Change

Make the top stepper clickable.

- A main-stage chip becomes an interactive control exactly when the engine will accept a jump to it. The interactivity test reuses the reachability probe the reading-mode contents list already uses in pure React: resolve the stage's first flat sub-stage index with `subStages.findIndex(s => s.mainIndex === targetMainIndex)`, then treat the chip as interactive when `jumpTo(run, subStages, f).idx === f`. The engine returns the run unchanged for an unreachable target, so the centered index lands on `f` only when `f` is reachable (and the currently centered card is always reachable, so there is no false positive). This needs no `@sqnce/core` change and is correct for both linear and forked runs. Stages the engine will not accept (ahead of the frontier, or, in a forked run, an unopened or skipped track) stay non-interactive and keep their disabled (ahead/locked) styling.
- Compute reachability once per chip and drive the chip's interactivity (and so its clickable affordance) and its glyph from that one result. The glyph is the lock when the stage is not reachable, a tick when it is reachable and its gate is met, and the stage number when it is reachable but not yet met (so a skipped track stage that still holds filled outputs reads as locked, not as done, because the engine does not clear a skipped track's stored outputs). The rail today derives the lock glyph from `mainIndex > frontier`; because interactivity is now the fork-aware probe, the glyph uses the same probe, so a reachable track chip in a forked run shows its number and stays clickable instead of showing a lock. The existing active/done/ahead color classes are left as they are (a committed-but-unmet stage keeps its muted "ahead" color and gains the clickable affordance). For a linear run reachability equals `mainIndex <= frontier`, so the glyph and the color classes are byte-identical to today and the feature only adds the click and keyboard interactivity.
- Clicking a stage performs that same jump: call `jumpTo(run, subStages, f)` for the resolved first-sub-stage index and write the result through the navigation setter. The interactivity probe and the click call the same primitive on the same reachable set, so the rail never offers a chip the jump would reject and never disables a chip the engine would accept.
- The jump is a navigation write (it uses the navigation setter, which does not disturb the run's updated-at ordering) and clears transient UI state (expanded step, generation error, inputs panel), so a stage switch from the rail lands clean, matching a prev/next step.
- Jumping to an earlier committed stage is browsing history: the frontier does not move, consistent with the existing jump semantics, and the existing "browsing history" hint continues to show when the centered card is not in the frontier stage.

### Forked runs

Sub-branching (#66) gives the engine a richer notion of reachability. After a run forks past the shared spine, `frontier` stays on the last spine stage and each track's progress is tracked separately, so a committed track stage can have a `mainIndex` greater than `frontier` yet still be a valid jump target. The `jumpTo` probe above handles this with no frontier arithmetic: it asks the engine directly whether the stage's first sub-stage is reachable, so committed track stages read as interactive while unopened or skipped tracks read as disabled, exactly as the reading-mode contents list already resolves its stage list. The rail is therefore correct for forked runs with no `@sqnce/core` change.

The pip row and the side cards still gate on the simpler `mainIndex <= frontier` test, which is not fork-aware. That is a pre-existing divergence in the authoring view, and it is invisible today because no bundled or demo definition declares tracks and the authoring deck does not yet render forked runs. The rail adopts the more correct probe now (matching the reading view); aligning the pip row and side cards to the same probe is a separate follow-up, noted here but not done in #85.

### Accessibility

The clickable chips become real buttons (or spans with `role="button"`, `tabIndex`, and an `onKeyDown` for Enter and Space), mirroring the existing side-card pattern, with an accessible label naming the stage and a visible focus outline. Ahead stages are not focusable.

## Relationship to #78

#78's reading mode introduces a persistent contents rail that uses the same `jumpTo` primitive in the reading view. #85 makes the authoring-mode top stepper clickable. They share the primitive but live in different views, and neither blocks the other.

## Out of scope

- The reading-mode contents rail (#78).
- Any change to the frontier or gate behavior. This only turns an existing inert indicator into a jump control.
- Sub-stage-level chips in the top rail. The rail shows main stages; sub-stage navigation stays on the pip row.
- Aligning the pip row and the side cards to the same fork-aware reachability probe. The rail adopts it; the other authoring-view controls keep their `mainIndex <= frontier` test for now (see "Forked runs").
- Any `@sqnce/core` change.

## Verification

The React package has unit tests (`packages/react/test/*.test.js`), which root `npm test` runs alongside the engine tests, but there is no ProcessRolodex interaction harness (no DOM or click-render rig for the component). The rail's reachability predicate is a pure function of the run, so it can be unit-tested directly: give a fixture run, including a forked fixture, and assert which main stages the probe marks interactive. The plan decides whether to add such a test. Otherwise verify by the JSX syntax check (`npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`), the demo build (`npm run build -w examples/demo`), and a manual click-through confirming each reachable stage chip jumps and unreachable chips stay disabled and keyboard-inert.

## Acceptance

- Clicking any reachable stage chip navigates straight to that stage. Reachable means the engine accepts a jump to the stage's first sub-stage: every committed spine stage, plus committed track stages in a forked run, including a stage committed through a forced advance whose gate is still unmet, not only stages whose gate is met.
- Unreachable stages stay disabled and non-interactive: stages ahead of the frontier, and (in a forked run) stages in an unopened or skipped track.
- The chips are keyboard-accessible (focusable, Enter/Space activate) with a visible focus outline.
- The frontier does not move when jumping back.
- `npm test` and `npm run build -w examples/demo` pass.

## Open questions for approval

1. Whether the rail jump should clear transient UI state (recommended, matches prev/next) or mirror the pip row, which currently does not clear it. A consistent choice across rail and pips is preferable.
2. Whether to align the pip-row jump to the same transient-clearing behavior in this change, or leave the pips untouched. Recommendation: align them for consistency.
