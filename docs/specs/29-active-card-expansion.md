# spec: expand the active card, contract inactive cards

Issue: #29. Every rolodex card is currently the same fixed width (`width: min(560px, 88vw)` in `packages/react/src/ProcessRolodex.jsx`); side cards differ only by scale (0.82), rotation, and opacity. With rendered output views on cards (#26/#27/#28: tables, card lists, flow diagrams), the active card is starved for reading room while inactive cards spend width nobody can use.

## Decisions

1. **Geometry (user decision, option B of three mocked)**: center card `min(800px, 92vw)`, side cards `min(400px, 44vw)`.
2. **Fixed widths with a viewport cap, not proportional (user question, settled)**: same pattern as today. The card is 800px on any screen at least ~870px wide; below that the `92vw` cap shrinks it. Proportional (vw-based) widths were rejected because a 56vw card is ~1075px on a 1920 monitor and prose lines that long read poorly; fixed widths also keep the peek geometry stable across screens. Bigger monitors get more background margin, with side cards peeking adjacent to the center card, not pushed to the screen edges.
3. **Width animates with the existing browse transition**: `width 0.45s cubic-bezier(.3,.9,.3,1)` joins the transition shorthand, same duration and easing as transform. The existing `prefers-reduced-motion: reduce { transition: none }` rule covers it.
4. **Pixel-step offsets replace own-width percentages**: `pos * 56%` resolves against each card's own width, which breaks once center and side widths differ. New transform: `translateX(calc(-50% + ${pos * 420}px)) rotateY(${pos * -24}deg) scale(${center ? 1 : 0.82})`. The `-50%` keeps self-centering; the step becomes fixed pixels.
5. **Tuning latitude**: the offset step (range 380 to 480px) and rotation (range -20 to -28deg) are initial values, tuned during implementation against the acceptance checks below without spec revision. Widths, scale (0.82), and opacity (0.38) are fixed by this spec.

## Changes

`packages/react/src/ProcessRolodex.jsx`:

- `.pf-card` loses its `width` declaration; `.pf-card-center` gets `width: min(800px, 92vw)` and `.pf-card-side` gets `width: min(400px, 44vw)` (both classes are already applied today).
- `.pf-card` transition becomes `transform 0.45s cubic-bezier(.3,.9,.3,1), width 0.45s cubic-bezier(.3,.9,.3,1), opacity 0.45s`.
- The inline card transform uses the pixel step and retuned rotation from decision 4.

`examples/claude-artifact/process-rolodex.jsx`: the same three changes in the inlined component, per the CLAUDE.md sync rule.

## Preserved behaviors

- Side cards stay non-interactive (`pointerEvents: none`) at opacity 0.38; cards at `|pos| == 2` stay at opacity 0.
- The under-720px breakpoint keeps hiding side cards; `92vw` keeps the center card within small viewports (552px at a 600px viewport, close to today's 528px), so no new mobile rules.
- `prefers-reduced-motion` keeps disabling all card transitions.
- z-index stacking, gate UI, keyboard navigation, drafts, and renderer behavior are untouched.

## Out of scope

- Any `@sqnce/core` change.
- New dependencies.
- Output rendering behavior (#26/#27) and seed content (#28); this issue is card geometry only.
- Side-card content changes (eyebrow labels, click-to-focus are #22 and #25).

## Acceptance

- The center card is visibly much wider than the side cards on desktop, and width animates smoothly with browse, expanding the incoming card and contracting the outgoing one.
- No horizontal overflow or clipped side cards at 1280, 1440, and 1920 viewport widths; side card strips and titles visibly peek beside the center card.
- Under 720px the side cards stay hidden and the center card fits the viewport.
- Keyboard navigation, gating, advance and override, and rendered output views (markdown, table, cards, keyvalue, flow) work unchanged on the wider card, verified with screenshots in the running demo at the three desktop widths plus one mobile width.
- `npm test`, `npm run build -w examples/demo`, and the artifact esbuild syntax check pass.
