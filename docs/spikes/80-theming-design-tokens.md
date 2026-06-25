# spike: theming via design tokens (#80)

A throwaway slice run before the spec-approval gate, to test the two empirical
assumptions the spec's correctness rests on. Both held. This writeup is evidence for the
owner's approval; no code from the spike is kept.

## Assumption 1: the private-token indirection makes ancestor overrides cascade

The spec's central mechanism is that the shell declares one block of private tokens that
resolve each public `--sqnce-*` token with the current value as a fallback (for example
`--sqnce-_accent: var(--sqnce-accent, #D9A441)`), and the shell CSS reads the private
tokens. The public token is never assigned on `.pf-root` itself, so a consumer can set it
on `.pf-root` or any ancestor scope. Codex's first review pass correctly flagged that the
naive alternative (assigning the public token a literal value directly on `.pf-root`)
would break ancestor overrides, because a value set directly on an element wins over a
value inherited from a parent.

### Method

A standalone HTML fixture (`cascade-spike.html`, not committed) was loaded in Chromium via
Playwright, and the computed `color` of a swatch was read in three arrangements. Gold is
`#D9A441` = `rgb(217, 164, 65)`; the consumer override is `rgb(0, 0, 255)` (blue).

- Case A, the fix, with an ancestor override: `.theme { --sqnce-accent: blue }` wraps
  `.pf-root { --sqnce-_accent: var(--sqnce-accent, gold) }`; the swatch reads
  `var(--sqnce-_accent)`. Expected blue.
- Case B, the fix, with no override: same structure, no ancestor token. Expected the gold
  fallback.
- Case C, the bug: `.pf-root { --sqnce-accent: gold }` assigned directly, wrapped by
  `.theme { --sqnce-accent: blue }`; the swatch reads `var(--sqnce-accent)`. Expected the
  override to fail and stay gold.

### Result

| Case | Arrangement | Computed color | Expected | Verdict |
|---|---|---|---|---|
| A | fix, ancestor override | `rgb(0, 0, 255)` | blue | override cascades in (pass) |
| B | fix, no override | `rgb(217, 164, 65)` | gold fallback | default holds (pass) |
| C | bug, direct assignment | `rgb(217, 164, 65)` | override fails | override fails as predicted |

The indirection works: an ancestor override reaches the shell (A), the baked-in default
holds with no override (B), and the rejected naive approach is confirmed broken (C). The
spec's override promise is sound as written.

## Assumption 2: the current default palette has real contrast failures

The spec keeps the current values as token defaults and also requires the default palette
to meet WCAG AA. Whether those two goals conflict is empirical: it depends on whether
today's palette already passes. It does not. Contrast ratios were computed for the muted
greys against the lighter end of the surface gradient `#222932` (the more favorable end;
the gradient darkens to `#1B2129`, where ratios are worse):

| Foreground | Used by | Ratio vs `#222932` | AA body (4.5:1) |
|---|---|---|---|
| `#EDEAE0` | brand / light ink | 12.19:1 | pass |
| `#D9A441` | gold accent text | 6.52:1 | pass |
| `#8A919B` | subject, side count | 4.61:1 | pass |
| `#8A8E96` | step state, gate state | 4.46:1 | fail (body) |
| `#6B6F76` | reading status | 2.91:1 | fail (body and large) |
| `#5E6772` | switch label, side label | 2.56:1 | fail (body and large) |

So at least three default muted-text colors fail AA today. This means "default rendering
is visually unchanged" and "the default palette meets the contrast minimums" cannot both
hold byte-for-byte: making the palette accessible requires changing those specific colors.
The spec is revised to state the precedence (accessibility wins; the only intentional
visual changes are the minimal, enumerated muted-text adjustments the audit requires), so
the two acceptance criteria no longer conflict.

## Assumption 3: portaled overlays mounted inside `.pf-root` get tokens and stay full-screen

A later Codex pass found that two subtrees render through `createPortal(..., document.body)`
(the renderer-expand `Overlay` in `OutputView`, and `OverviewModal`), so they sit outside
`.pf-root`. If the private `--sqnce-_*` defaults are declared only on `.pf-root`, a
body-mounted overlay would resolve those tokens to nothing and render unstyled. The fix in
the spec is to mount those portals inside `.pf-root` instead of `document.body`. That fix
rests on two behaviors, both checked because `.pf-root` sets `overflow-x: hidden`: a
`position: fixed` overlay nested in `.pf-root` must still cover the viewport (not be clipped
by the ancestor's overflow), and it must inherit `.pf-root` tokens and ancestor overrides.

### Method

A fixture (`portal-spike.html`, not committed) reproduced `.pf-root`'s relevant properties
(`overflow-x: hidden`, `display: flex`, `flex-direction: column`, no transform) wrapping a
4000px spacer to force a real overflow/scroll context, with a `position: fixed; inset: 0`
overlay nested inside. Computed `background` and the overlay's bounding rect were read.

- Case D: the overlay reads the root-declared private token (`var(--sqnce-_overlay-bg)`, where `.pf-root` declares `--sqnce-_overlay-bg: var(--sqnce-overlay-bg, #F1EEE3)`); no consumer override. This proves the nested overlay inherits the private default from `.pf-root` (the actual bug scenario), not that a local per-overlay fallback would paint it.
- Case E: an ancestor `.theme { --sqnce-bg: rgb(0,128,0) }` wraps `.pf-root`; the nested
  overlay reads the private token `var(--sqnce-_bg)`, which resolves the ancestor's public
  `--sqnce-bg`.

### Result

| Case | Computed background | Overlay rect (viewport 945x921) | Reading |
|---|---|---|---|
| D | `rgb(241, 238, 227)` (`#F1EEE3`) | x0 y0, 930x921 | default token reaches the nested overlay |
| E | `rgb(0, 128, 0)` | x0 y0, 930x921 | ancestor override reaches the nested overlay |

Both overlays anchor at (0,0) and span the full viewport height (921 = `vh`). The 930 vs 945
width gap is the 15px vertical scrollbar gutter that a fixed `inset: 0` element leaves on a
scrollable page, not clipping by `overflow-x: hidden`. So nesting a fixed overlay in
`.pf-root` keeps it full-screen and gives it both the default tokens and ancestor overrides.

## Conclusion

All three assumptions are settled before approval. Assumption 1 holds as the spec describes.
Assumption 2 is resolved by reconciling the two acceptance criteria rather than by changing
the mechanism. Assumption 3 confirms the portal fix: mounting the expand overlay and the
overview modal inside `.pf-root` themes them with no special-casing. No re-spec of the core
design is needed; the spec edits are the contrast precedence wording and the portal mounting
requirement.
