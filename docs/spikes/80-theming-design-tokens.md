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

## Conclusion

Both assumptions are settled before approval. Assumption 1 holds as the spec describes.
Assumption 2 is resolved by reconciling the two acceptance criteria rather than by changing
the mechanism. No re-spec of the design is needed; the only spec edit is the contrast
precedence wording.
