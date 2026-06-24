# spec: markdown renderer, autolink bare URLs

Issue: #84 (markdown renderer, autolink bare URLs). Milestone: "UI shell: reading mode, renderers & theming". Supersedes the now-closed duplicate #81. Source: the presales UI-presentation evaluation, finding H3 (severity High).

A first-draft spec committed to a draft PR ahead of the Codex review loop.

Layer: pure `@sqnce/react`, a single file, `packages/react/src/renderers/Markdown.jsx`. No `@sqnce/core` change and no data change: the URLs are already valid web addresses sitting on screen as plain text, so this is purely a rendering change.

## Current behavior

The reference markdown renderer tokenizes inline text with one alternation regex, `TOKEN`, whose branches are inline code, bold, italic, and explicit links (`[text](url)`). There is no branch for a bare URL, so a pasted `https://learn.microsoft.com/...` does not match any token and is pushed out as plain text. Explicit links are rendered as an anchor with `target="_blank"` and `rel="noreferrer"`, with the href whitelisted to http(s), `mailto:`, and fragment.

## Problem

In a rendered artifact (for example the Grounding Citations block), bare Microsoft Learn URLs appear as plain text, not links. To open one, the reader must select the URL, copy it, and paste it into a browser by hand. Opening a cited source is the most common in-room citation action, so this is finding H3 at High severity.

## Change

Add a bare-URL branch to the inline tokenizer.

1. Add a bare http(s) URL alternative to the `TOKEN` alternation, placed after the existing alternatives so that an explicit `[text](url)` link is still matched as a whole link rather than as a bare URL inside it.
2. When that branch matches, emit an anchor that opens in a new tab. For consistency with the existing explicit-link anchors, use `target="_blank"` and `rel="noreferrer"`; `rel="noreferrer"` already prevents the new tab from accessing `window.opener`, which is the protection the issue asks for under the name `rel="noopener"`. (Raised as an open question below in case the issue intends to preserve the referrer.)
3. The anchor text is the URL itself.

### Edge cases the tokenizer must get right

- Ordering versus explicit links. The leftmost match wins, and an explicit link starts at its `[`, which is earlier than the `https://` inside it, so explicit links keep matching as links and the bare-URL branch never fires inside their href. The whole explicit-link token is consumed, so no double processing.
- URLs inside inline code. The inline-code branch already consumes backtick-wrapped content as a single token, so a URL inside `` `...` `` stays literal code and is not autolinked.
- Trailing sentence punctuation. A URL at the end of a sentence ("see https://learn.microsoft.com/x.") must not swallow the trailing punctuation. The URL match stops before a trailing run of common sentence punctuation (for example `.`, `,`, `;`, `:`, `!`, `?`, closing brackets, quotes), so the link is the address and the punctuation stays as text.
- Scheme scope. Only `http://` and `https://` autolink. Bare `mailto:`, and host-only strings with no scheme (for example `www.example.com`), are out of scope for this change.

### Known first-draft limitations (acceptable, noted)

- URLs inside bold or italic are not autolinked, because the bold and italic branches emit their inner text as a plain string child rather than re-tokenizing it. This matches today's behavior for those spans.
- URLs containing balanced parentheses (some reference URLs) may be truncated at the first stopping punctuation. A more elaborate balanced-paren parser is deferred unless a real citation needs it.

## Out of scope

- The deeper capability to click a `source_ref` or a finding id (for example `pain-2`, `obj-1`) to jump to the original input. The issue marks this a separate pipeline/content change (the refs are paraphrase strings with no resolvable target).
- Autolinking inside bold, italic, or code spans.
- Bare `mailto:` and scheme-less host names.

## Verification

There is no React test harness in the repo (the test suite is `packages/core/test/engine.test.js`, engine only). Verify this change by the JSX syntax check (`npx esbuild packages/react/src/renderers/Markdown.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null`), the demo build (`npm run build -w examples/demo`), and a manual render of an artifact containing bare and explicit URLs, code-span URLs, and a sentence-final URL.

## Acceptance

- Every bare http(s) URL in rendered prose is a clickable link opening in a new tab.
- A sentence-final URL does not swallow the trailing punctuation.
- A URL inside an inline code span stays literal.
- Existing explicit `[text](url)` links are unchanged.
- `npm test` (engine, unaffected) and `npm run build -w examples/demo` pass.

## Open questions for approval

1. Anchor `rel`: match the existing explicit-link anchors with `rel="noreferrer"` (recommended, already blocks `window.opener`), or follow the issue text literally with `rel="noopener"` (preserves the referrer).
2. Treat scheme-less `www.` hosts as links too, or keep to explicit http(s) only. Recommendation: http(s) only for this change.
