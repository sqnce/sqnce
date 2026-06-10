# spec: rolodex interaction polish

Issues: #16 (one-click done toggle on step rows), #17 (progress-filling stage rail), #18 (gate status and advance in the card footer), #19 (Generate/Regenerate affordance), #25 (clickable side cards).

Batch 4 of the spec series. This PR is parked at the spec-approval gate; implementation follows approval.

All five are `@sqnce/react` only, in `packages/react/src/ProcessRolodex.jsx` (plus its inline CSS). No `@sqnce/core` change anywhere in this batch. The five changes touch mostly disjoint regions (step rows, header rail, card footer and nav, step body actions, deck cards) and ship as one PR because together they are the P2 interaction-polish pass from the 2026-06-09 design review.

## Assumes merged

Batches 1 to 3 (PRs #38, #39, #40). Functionally this batch depends on batch 2: the one-click toggle reopens content-bearing steps via `reopenStep`, and the generate affordance coexists with the generated-draft tint from #20. No claude-artifact mirroring exists anymore.

## #16: one-click done toggle on step rows

Today the whole step row is one `pf-step-row` button that toggles expansion, and Mark done/Reopen lives inside the expanded body. A button cannot nest inside a button, so the row becomes a container with two targets: the existing expand target and a new check-circle toggle.

- Check-circle button on every step row of the center card, replacing the current status dot position or sitting alongside it.
- Click semantics, uniform across gate types: if the step is currently complete (by `isStepComplete` with the sub-stage's gate type), the click reopens it via `reopenStep`; if incomplete, the click marks it done via `setCheckedDone(run, stepId, true)`. Under a hybrid gate this is exactly the #3 fix surfaced in one click; under strict it toggles `checkedDone`.
- The in-body Mark done/Reopen button stays; the row toggle is a shortcut, biggest win for checklist steps with no outputs.
- Side cards: rows stay non-interactive (the whole side card becomes one click target under #25).
- Read-only runs: the toggle renders but is disabled, matching the existing `readOnly` guards.

Acceptance: a checklist step can be completed and reopened without expanding it; expansion still works by clicking the rest of the row; keyboard focus reaches both targets.

## #17: progress-filling stage rail

Today each main stage renders as a dot plus name with static gray connector lines; the state logic is active / done (`allDone || mi < current.mainIndex`) / ahead.

- Each main stage gets a numbered circle: its 1-based index by default, a check glyph when the stage is complete, a lock glyph when the stage is locked.
- Complete: every sub-stage gate in the main stage is met (the existing `allDone` computation, unchanged: gate-based, independent of browsing position).
- Locked: the main stage's first flattened sub-stage index is beyond `frontier`. Locking keys off the frontier, not the browsing position, so browsing back never relocks a committed stage.
- Active: the main stage containing the current `idx` (unchanged).
- Connector lines fill (accent color) up to the main stage containing the frontier; beyond it they stay gray.
- Existing rail colors (active gold, done green, ahead gray) carry over to the new circle states.
- Icons are inline SVGs or text glyphs; no icon dependency (shared-icon-set work is #23/#24, batch 6).

Acceptance: at a glance the rail answers both "which stage am I in" (active circle) and "how far along am I" (filled connectors, checks); browsing back changes only the active marker, never fills or locks.

## #18: gate status and advance in the card footer

Today the advance zone (advance button, "Gate unmet: ..." hint, "Advance anyway" override) sits in `pf-nav-mid` below the deck, detached from the card whose gate it describes.

- The center card gains a footer strip showing that card's gate state: a check with "Gate met, ready to advance" or a lock with "N required steps left" plus the existing missing-step names ("Gate unmet: Qualify, Research").
- The advance button and the "Advance anyway" override move into this footer and render only when the center card is the frontier card. Behavior is unchanged: advance still refuses without force at an unmet gate; the override stays exactly as is.
- When browsing history (center card not at the frontier), the footer shows the card's gate state; the existing "Browsing history · frontier is X" hint stays in the nav area.
- The nav area keeps the back/next buttons, the pips, and the legend line; only the advance zone moves.

Acceptance: gate status and advance sit visually on the card they describe; advance and override behavior is byte-for-byte the same engine calls as today.

## #19: Generate/Regenerate affordance

Today the generate button always reads "Generate draft" ("Generating…" while busy) and the empty text output is a bare textarea. All of this is on top of the injected `generateDraft` prop; no engine or provider change.

- Button label: "Generate draft" when the target text output is empty, "Regenerate" once it has content.
- Busy state: a spinner (inline SVG or CSS animation) joins the button while generating; the button stays disabled during generation as today.
- Empty state: when the step's target text output is empty and `generateDraft` is provided, a dashed-border invite box appears with the generate action; hand-typing stays possible (the plain textarea remains reachable from the invite state without generating first).
- When `generateDraft` is omitted the invite box never renders and the plain textarea shows as today; the component keeps working unchanged.
- Generated results keep flowing through the existing `generate()` path, so the #20 tint applies to the result.

Acceptance: empty step shows the dashed invite; generating shows a spinner; a filled output offers "Regenerate"; omitting `generateDraft` reproduces today's behavior with no invite and no buttons.

## #25: clickable side cards

Today side cards render with `pointerEvents: "none"`; navigation is the nav buttons, the pips, and arrow keys.

- A side card within `[0, frontier]` becomes one click target that browses to it: same semantics as the pips' existing `jumpTo(run, subs, i)` call; the frontier never moves.
- Locked cards (index beyond `frontier`) stay non-navigable and keep `pointerEvents: "none"`.
- Cards at `|pos| == 2` (opacity 0) stay non-clickable; invisible click targets are not acceptable.
- The side card is a single target: its step rows stay non-interactive (`disabled={!center}` today) and no inner element gets its own handler.
- Cursor pointer plus a hover treatment (for example a slight opacity lift) make clickability obvious; clickable side cards get `role="button"` and an aria-label naming the sub-stage.

Acceptance: clicking the previous or next visible card centers it; clicking a locked card does nothing; step rows on side cards never respond individually.

## Suggested implementation order

#18 (moves the advance zone, biggest structural change), then #17 (header only), #16 (step rows), #19 (step body), #25 (deck). The five are otherwise independent.

## Out of scope

- Header position counter (#21), side-card eyebrow labels (#22), output-type icons (#23, #24): batch 6.
- Any engine change, any renderer change, any new dependency.
- Mobile-specific redesign; the existing under-720px behavior (side cards hidden) is preserved, which also means #25 has no effect there.

## Acceptance (batch)

- Each issue's acceptance above, verified in the running demo with screenshots (desktop plus one mobile width).
- Keyboard navigation, gating, override, drafts, and rendered output views keep working.
- `npm test` and `npm run build -w examples/demo` pass.

## Open questions for approval

1. The legend line ("Fill an output or mark a step done to complete it.") currently sits under the pips. With gate status moving onto the card (#18), should the legend move into the card footer too, or stay in the nav? Spec keeps it in the nav; flag if you prefer it on the card.
2. #16 check-circle placement: replacing the status dot (one merged affordance) vs a separate circle next to it (dot stays purely informational). Spec recommends replacing the dot; flag if you want both.
